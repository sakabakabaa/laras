import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, LoaderCircle, Play, Save, Send, XCircle } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import { isPastDeadline, type Assignment, type AssignmentSubmission } from '@/lib/assignments';
import {
	LISTENING_TYPE_LABEL,
	formatTimestamp,
	parseListeningConfig,
	parseTaskAnswers,
	type GradedQuestion,
	type ListeningConfig,
	type ListeningStudentAnswers,
	type TaskAnswers,
} from '@/lib/task-types';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';
import { confirmDialog } from '@/components/confirm-dialog';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const VIDEO_EXT = /\.(mp4|webm|ogv|mov|mkv)$/i;

type SubmitResponse = {
	status: 'submitted' | 'late';
	autoScore: number;
	earned: number;
	total: number;
	release: 'released' | 'pending';
	message: string;
	perQuestion?: GradedQuestion[];
};

/**
 * Student listening workspace: media player with timestamp jumps, mixed
 * question types, progressive answer saving, and submission. Multiple-choice
 * answers are graded server-side; the rest wait for the lecturer.
 */
export function ListeningWorkspace({
	assignment,
	submission,
	onSaved,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission | null;
	onSaved: () => void;
}) {
	const config: ListeningConfig = useMemo(() => parseListeningConfig(assignment.taskConfig), [assignment]);
	const saved = useMemo(() => parseTaskAnswers(submission?.taskAnswers), [submission]);
	const savedListening = saved?.listening;

	const [answers, setAnswers] = useState<ListeningStudentAnswers>(savedListening?.answers ?? {});
	const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
	const [error, setError] = useState('');
	const [result, setResult] = useState<SubmitResponse | null>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);

	const submitted = Boolean(savedListening?.lastAttempt) || (submission?.status && submission.status !== 'draft');
	const revision = submission?.status === 'revision';
	const past = isPastDeadline(assignment.deadline);
	const canWork = assignment.status === 'published' && (!past || revision) && !submitted;

	const isVideo = VIDEO_EXT.test(config.media.url || '');

	const jumpTo = (seconds: number | null) => {
		const el: HTMLMediaElement | null = videoRef.current ?? audioRef.current;
		if (!el) return;
		if (seconds != null) el.currentTime = seconds;
		void el.play().catch(() => {});
	};

	const setAnswer = (id: string, value: number | string | Record<string, string>) => {
		setAnswers((prev) => ({ ...prev, [id]: value }));
	};

	const saveProgress = async () => {
		setBusy('save');
		setError('');
		try {
			const taskAnswers: TaskAnswers = {
				...saved,
				listening: {
					answers,
					savedAt: new Date().toISOString(),
					...(savedListening?.lastAttempt ? { lastAttempt: savedListening.lastAttempt } : {}),
				},
			};
			const payload = { status: 'draft', taskAnswers };
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
		const unanswered = config.questions.filter((q) => {
			const a = answers[q.id];
			return a == null || a === '' || (typeof a === 'object' && Object.keys(a).length === 0);
		});
		if (
			unanswered.length > 0 &&
			!(await confirmDialog({
				title: 'Kumpulkan sekarang?',
				message: `${unanswered.length} pertanyaan belum dijawab. Kumpulkan sekarang?`,
				variant: 'default',
				confirmLabel: 'Kumpulkan',
			}))
		)
			return;
		setBusy('submit');
		setError('');
		try {
			const response = await fetch('/api/task-submit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ assignmentId: assignment.id, kind: 'listening', answers }),
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

	if (!canWork) {
		if (submitted) {
		const score = submission?.autoScore ?? savedListening?.lastAttempt?.scorePct ?? null;
		return (
			<div className="tws-done">
				<div className="tws-done-head">
					<CheckCircle2 size={16} />
					<strong>Jawaban sudah dikumpulkan</strong>
				</div>
				<p>
					{score != null
						? `Bagian pilihan ganda ternilai otomatis: ${score}/100. Jawaban lain menunggu penilaian dosen.`
						: 'Menunggu penilaian dosen.'}
					{revision && ' Dosen meminta revisi — Anda dapat mengumpulkan ulang.'}
				</p>
				{result?.release === 'released' && result.perQuestion && (
					<ListeningDetails perQuestion={result.perQuestion} config={config} />
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
			{config.media.kind !== 'none' && config.media.url ? (
				<div className="tws-media">
					{isVideo ? (
						<video ref={videoRef} controls preload="metadata" src={config.media.url}>
							Browser Anda tidak mendukung pemutar video.
						</video>
					) : (
						<audio ref={audioRef} controls preload="metadata" src={config.media.url}>
							Browser Anda tidak mendukung pemutar audio.
						</audio>
					)}
					{config.media.title && <p>{config.media.title}</p>}
				</div>
			) : (
				<p className="tws-notice">
					Materi audio/video belum dipilih dosen. Hubungi dosen pengampu bila tidak dapat mengerjakan.
				</p>
			)}

			<ol className="tws-questions">
				{config.questions.map((q, i) => {
					const answer = answers[q.id];
					return (
						<li key={q.id} className="tws-question">
							<div className="tws-question-top">
								<strong>
									Pertanyaan {i + 1} <em>{LISTENING_TYPE_LABEL[q.type]}</em>
								</strong>
								<span className="tws-question-side">
									{q.points > 0 && <em>{q.points} poin</em>}
									{q.timestampSec != null && (
										<button type="button" className="ld-text-btn" onClick={() => jumpTo(q.timestampSec)}>
											<Play size={11} /> {formatTimestamp(q.timestampSec)}
										</button>
									)}
								</span>
							</div>
							<p className="tws-question-text">{q.text}</p>

							{q.type === 'mc' && (
								<div className="tws-options" role="radiogroup" aria-label={`Jawaban pertanyaan ${i + 1}`}>
									{q.options.map((option, oi) => (
										<label key={oi} className={`tws-option${answer === oi ? ' picked' : ''}`}>
											<input
												type="radio"
												name={`lans-${q.id}`}
												checked={answer === oi}
												onChange={() => setAnswer(q.id, oi)}
											/>
											<span className="tws-option-letter">{LETTERS[oi] || '?'}</span>
											<span>{option}</span>
										</label>
									))}
								</div>
							)}

							{(q.type === 'short' || q.type === 'transcription') && (
								<textarea
									rows={q.type === 'transcription' ? 3 : 2}
									maxLength={2000}
									value={typeof answer === 'string' ? answer : ''}
									onChange={(e) => setAnswer(q.id, e.target.value)}
									placeholder={
										q.type === 'transcription'
											? 'Tuliskan apa yang Anda dengar…'
											: 'Jawaban singkat Anda…'
									}
									aria-label={`Jawaban pertanyaan ${i + 1}`}
								/>
							)}

							{q.type === 'matching' && (
								<div className="tws-matching">
									{q.pairs.map((pair, pi) => {
										const current =
											typeof answer === 'object' && answer !== null && !(answer instanceof Array)
												? (answer as Record<string, string>)[pair.left]
												: '';
										return (
											<div key={pi} className="tws-match-row">
												<span>{pair.left}</span>
												<select
													value={current}
													aria-label={`Pasangan untuk ${pair.left}`}
													onChange={(e) =>
														setAnswer(q.id, {
															...(typeof answer === 'object' && answer !== null && !(answer instanceof Array)
																? (answer as Record<string, string>)
																: {}),
															[pair.left]: e.target.value,
														})
													}
												>
													<option value="">Pilih pasangan…</option>
													{q.pairs.map((p, oi) => (
														<option key={oi} value={p.right}>
															{p.right}
														</option>
													))}
												</select>
											</div>
										);
									})}
								</div>
							)}
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
				<button type="button" className="ld-btn-primary" onClick={() => void submit()} disabled={busy !== null}>
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

			<CheckAnswerPanel
				assignment={assignment}
				channel="enrolled"
				buildResponse={() => ({ kind: 'listening', answers })}
			/>

			{result && (
				<div className={`tws-result${result.release === 'released' ? ' ok' : ''}`}>
					<div className="tws-result-head">
						{result.release === 'released' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
						<strong>{result.message}</strong>
					</div>
					{result.release === 'released' && (
						<p className="tws-score">
							Pilihan ganda: <strong>{result.autoScore}</strong>/100 · {result.earned}/{result.total} poin
						</p>
					)}
					{result.release === 'released' && result.perQuestion && (
						<ListeningDetails perQuestion={result.perQuestion} config={config} />
					)}
				</div>
			)}
		</div>
	);
}

function ListeningDetails({
	perQuestion,
	config,
}: {
	perQuestion: GradedQuestion[];
	config: ListeningConfig;
}) {
	return (
		<ul className="tws-details">
			{perQuestion.map((gq, i) => {
				const question = config.questions.find((q) => q.id === gq.id);
				return (
					<li key={gq.id} className={gq.manual ? 'manual' : gq.correct ? 'ok' : 'bad'}>
						<span className="tws-detail-icon">
							{gq.manual ? <Clock size={14} /> : gq.correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
						</span>
						<div>
							<strong>
								Pertanyaan {i + 1} — {gq.manual ? 'menunggu dosen' : `${gq.earned}/${gq.points} poin`}
							</strong>
							{question && <p>{question.text}</p>}
							{typeof gq.correctIndex === 'number' && question && (
								<small>
									Kunci: {LETTERS[gq.correctIndex] || '?'} {question.options[gq.correctIndex] || ''}
								</small>
							)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
