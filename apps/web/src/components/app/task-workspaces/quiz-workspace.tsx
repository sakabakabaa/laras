import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, LoaderCircle, Save, Send, XCircle } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import { isPastDeadline, type Assignment, type AssignmentSubmission } from '@/lib/assignments';
import {
	parseQuizConfig,
	parseTaskAnswers,
	type GradedQuestion,
	type QuizConfig,
	type QuizStudentAnswers,
	type TaskAnswers,
} from '@/lib/task-types';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';
import { confirmDialog } from '@/components/confirm-dialog';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

type SubmitResponse = {
	status: 'submitted' | 'late';
	autoScore: number;
	earned: number;
	total: number;
	attemptsUsed: number;
	attemptsLimit: number;
	release: 'released' | 'pending';
	message: string;
	perQuestion?: GradedQuestion[];
};

/** Deterministic shuffle so the order stays stable across re-renders. */
function seededShuffle<T>(items: T[], seed: string): T[] {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	const arr = [...items];
	for (let i = arr.length - 1; i > 0; i--) {
		h = (h * 1103515245 + 12345) >>> 0;
		const j = h % (i + 1);
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

/**
 * Student quiz workspace: progress, progressive answer saving, unanswered
 * review, configured attempts, time limit, and submission. Grading runs
 * server-side with the owner-only answer key.
 */
export function QuizWorkspace({
	assignment,
	submission,
	onSaved,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission | null;
	onSaved: () => void;
}) {
	const config: QuizConfig = useMemo(() => parseQuizConfig(assignment.taskConfig), [assignment]);
	const saved = useMemo(() => parseTaskAnswers(submission?.taskAnswers), [submission]);
	const savedQuiz = saved?.quiz;

	const [answers, setAnswers] = useState<QuizStudentAnswers>(savedQuiz?.answers ?? {});
	const [startedAt] = useState<string>(savedQuiz?.startedAt || new Date().toISOString());
	const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
	const [error, setError] = useState('');
	const [result, setResult] = useState<SubmitResponse | null>(null);
	const [confirmReview, setConfirmReview] = useState(false);
	const [nowTick, setNowTick] = useState(() => Date.now());

	// Countdown ticker for timed quizzes (client-only component).
	useEffect(() => {
		if (config.timeLimitMin <= 0) return;
		const t = setInterval(() => setNowTick(Date.now()), 1000);
		return () => clearInterval(t);
	}, [config.timeLimitMin]);

	const questions = useMemo(
		() =>
			config.shuffleQuestions
				? seededShuffle(config.questions, `${assignment.id}-${startedAt}`)
				: config.questions,
		[config.questions, config.shuffleQuestions, assignment.id, startedAt],
	);
	const optionOrder = useMemo(() => {
		if (!config.shuffleOptions) return null;
		const map = new Map<string, number[]>();
		for (const q of config.questions) {
			map.set(q.id, seededShuffle(q.options.map((_, i) => i), `${q.id}-${startedAt}`));
		}
		return map;
	}, [config.questions, config.shuffleOptions, startedAt]);

	const attemptsUsed = savedQuiz?.attemptsUsed ?? 0;
	const attemptsLeft =
		config.attempts > 0 ? Math.max(0, config.attempts - attemptsUsed) : Number.POSITIVE_INFINITY;
	const submitted = Boolean(savedQuiz?.lastAttempt) || (submission?.status && submission.status !== 'draft');
	const revision = submission?.status === 'revision';
	const past = isPastDeadline(assignment.deadline);
	const canWork =
		assignment.status === 'published' && (!past || revision) && attemptsLeft > 0 && !submitted;

	const timeLimitMs = config.timeLimitMin > 0 ? config.timeLimitMin * 60_000 : 0;
	const elapsed = nowTick - new Date(startedAt).getTime();
	const timeLeftMs = timeLimitMs > 0 ? Math.max(0, timeLimitMs - elapsed) : 0;
	const timeUp = timeLimitMs > 0 && timeLeftMs === 0;
	const answeredCount = questions.filter((q) => typeof answers[q.id] === 'number').length;
	const unanswered = questions.filter((q) => typeof answers[q.id] !== 'number');

	const buildTaskAnswers = (): TaskAnswers => ({
		...saved,
		quiz: {
			answers,
			attemptsUsed,
			startedAt,
			savedAt: new Date().toISOString(),
			...(savedQuiz?.lastAttempt ? { lastAttempt: savedQuiz.lastAttempt } : {}),
		},
	});

	const saveProgress = async () => {
		setBusy('save');
		setError('');
		try {
			const payload = { status: 'draft', taskAnswers: buildTaskAnswers() };
			if (submission) {
				await pb.collection('assignment_submissions').update(submission.id, payload);
			} else {
				await pb.collection('assignment_submissions').create({
					...payload,
					assignment: assignment.id,
					owner: pb.authStore.record?.id,
				});
			}
			invalidate('assignment_submissions');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(null);
		}
	};

	const submit = async () => {
		if (confirmReview && unanswered.length > 0) {
			if (
				!(await confirmDialog({
					title: 'Kumpulkan sekarang?',
					message: `${unanswered.length} soal belum dijawab. Kumpulkan sekarang?`,
					variant: 'default',
					confirmLabel: 'Kumpulkan',
				}))
			)
				return;
		}
		setBusy('submit');
		setError('');
		try {
			const response = await fetch('/api/task-submit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ assignmentId: assignment.id, kind: 'quiz', answers }),
			});
			const body = (await response.json()) as SubmitResponse & { error?: string };
			if (!response.ok) {
				setError(body.error || 'Gagal mengumpulkan jawaban.');
				return;
			}
			setResult(body);
			invalidate('assignment_submissions');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(null);
		}
	};

	// Already collected: show the stored outcome
	if (!canWork) {
		if (submitted) {
		const score = submission?.autoScore ?? savedQuiz?.lastAttempt?.scorePct ?? null;
		return (
			<div className="tws-done">
				<div className="tws-done-head">
					<CheckCircle2 size={16} />
					<strong>Jawaban sudah dikumpulkan</strong>
				</div>
				<p>
					{attemptsUsed > 0 && config.attempts > 0
						? `Kesempatan pengerjaan terpakai: ${attemptsUsed}/${config.attempts}. `
						: ''}
					{score != null
						? `Nilai otomatis: ${score} dari 100 (${savedQuiz?.lastAttempt?.earned ?? '—'}/${savedQuiz?.lastAttempt?.total ?? '—'} poin).`
						: 'Menunggu hasil dari dosen.'}
					{revision && ' Dosen meminta revisi — Anda dapat mengumpulkan ulang.'}
				</p>
				{result?.release === 'released' && result.perQuestion && (
					<ResultDetails perQuestion={result.perQuestion} questions={config.questions} />
				)}
			</div>
		);
		}
		return (
			<p className="asg-empty-line">
				Pengumpulan tugas ini sudah ditutup dosen atau batas waktunya sudah terlewat.
			</p>
		);
	}

	return (
		<div className="tws-workspace">
			<div className="tws-meta">
				<span className="tws-chip">
					{answeredCount}/{questions.length} terjawab
				</span>
				{config.attempts > 0 && (
					<span className="tws-chip">
						Kesempatan: {attemptsUsed}/{config.attempts}
					</span>
				)}
				{timeLimitMs > 0 && (
					<span className={`tws-chip${timeLeftMs < 60_000 ? ' warn' : ''}${timeUp ? ' over' : ''}`}>
						<Clock size={12} />
						{timeUp
							? 'Waktu habis'
							: `${String(Math.floor(timeLeftMs / 60000)).padStart(2, '0')}:${String(Math.floor((timeLeftMs % 60000) / 1000)).padStart(2, '0')}`}
					</span>
				)}
				<span className="tws-bar" aria-hidden>
					<span style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
				</span>
			</div>

			{timeUp && (
				<p className="tws-notice over">
					<AlertTriangle size={13} /> Batas waktu pengerjaan sudah habis — jawaban terkunci, kumpulkan
					sekarang.
				</p>
			)}

			<ol className="tws-questions">
				{questions.map((q, i) => {
					const order = optionOrder?.get(q.id) ?? q.options.map((_, idx) => idx);
					return (
						<li key={q.id} className={`tws-question${typeof answers[q.id] === 'number' ? ' answered' : ''}`}>
							<div className="tws-question-top">
								<strong>
									Soal {i + 1} <em>{q.points} poin</em>
								</strong>
							</div>
							<p className="tws-question-text">{q.text}</p>
							<div className="tws-options" role="radiogroup" aria-label={`Jawaban soal ${i + 1}`}>
								{order.map((oi) => (
									<label key={oi} className={`tws-option${answers[q.id] === oi ? ' picked' : ''}`}>
										<input
											type="radio"
											name={`ans-${q.id}`}
											disabled={timeUp}
											checked={answers[q.id] === oi}
											onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
										/>
										<span className="tws-option-letter">{LETTERS[oi] || '?'}</span>
										<span>{q.options[oi]}</span>
									</label>
								))}
							</div>
						</li>
					);
				})}
			</ol>

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}

			<div className="tws-actions">
				<button type="button" className="ld-outline-action sm" onClick={() => void saveProgress()} disabled={busy !== null}>
					{busy === 'save' ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Simpan progres
				</button>
				<button
					type="button"
					className="ld-btn-primary"
					onClick={() => {
						setConfirmReview(true);
						void submit();
					}}
					disabled={busy !== null}
				>
					{busy === 'submit' ? (
						<>
							<LoaderCircle size={15} className="spin" /> Mengumpulkan...
						</>
					) : (
						<>
							<Send size={15} /> Kumpulkan jawaban
						</>
					)}
				</button>
			</div>
			{unanswered.length > 0 && !timeUp && (
				<p className="tws-hint">{unanswered.length} soal belum dijawab — tinjau sebelum mengumpulkan.</p>
			)}
			<CheckAnswerPanel
				assignment={assignment}
				channel="enrolled"
				buildResponse={() => ({ kind: 'quiz', answers })}
			/>

			{result && (
				<div className={`tws-result${result.release === 'released' ? ' ok' : ''}`}>
					<div className="tws-result-head">
						{result.release === 'released' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
						<strong>{result.message}</strong>
					</div>
					{result.release === 'released' && (
						<p className="tws-score">
							Nilai otomatis <strong>{result.autoScore}</strong>/100 · {result.earned}/{result.total} poin
							{result.attemptsLimit > 0 && ` · kesempatan ${result.attemptsUsed}/${result.attemptsLimit}`}
						</p>
					)}
					{result.release === 'released' && result.perQuestion && (
						<ResultDetails perQuestion={result.perQuestion} questions={config.questions} />
					)}
				</div>
			)}
		</div>
	);
}

function ResultDetails({
	perQuestion,
	questions,
}: {
	perQuestion: GradedQuestion[];
	questions: QuizConfig['questions'];
}) {
	return (
		<ul className="tws-details">
			{perQuestion.map((gq, i) => {
				const question = questions.find((q) => q.id === gq.id);
				return (
					<li key={gq.id} className={gq.correct ? ' ok' : 'bad'}>
						<span className="tws-detail-icon">
							{gq.correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
						</span>
						<div>
							<strong>
								Soal {i + 1} — {gq.earned}/{gq.points} poin
							</strong>
							{question && <p>{question.text}</p>}
							{typeof gq.correctIndex === 'number' && (
								<small>
									Kunci: {LETTERS[gq.correctIndex] || '?'}{' '}
									{question?.options[gq.correctIndex] || ''}
								</small>
							)}
							{gq.explanation && <small className="tws-explain">{gq.explanation}</small>}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
