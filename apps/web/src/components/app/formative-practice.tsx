import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, ExternalLink, Repeat, RotateCcw } from 'lucide-react';
import type { Assignment, AssignmentSubmission, SubmissionStatus } from '@/lib/assignments';
import { studentWorkPath, SUBMISSION_STATUS_LABEL, studentGradeLabel } from '@/lib/assignments';
import {
	countWords,
	parseListeningConfig,
	parseQuizConfig,
	parseReadingConfig,
	parseSpeakingConfig,
	parseWritingConfig,
	taskKindForShape,
} from '@/lib/task-types';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';
import { confirmDialog } from '@/components/confirm-dialog';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Short label for the student's formal-task submission state (Batch 2). */
function formalSubmissionLine(submission: AssignmentSubmission | null) {
	if (!submission || !submission.status || submission.status === 'draft')
		return 'Belum mengumpulkan tugas formal.';
	if (submission.status === 'graded')
		return `Tugas formal sudah dinilai${submission.grade != null ? ` — nilai ${studentGradeLabel(submission.grade)}` : ''}.`;
	return `Tugas formal: ${SUBMISSION_STATUS_LABEL[submission.status as SubmissionStatus]}.`;
}

/**
 * Student view of a Latihan formatif (Phase 3): repeatable practice with the
 * formative Cek jawaban panel only — no final submission, no grade impact.
 * Question-based types (kuis/menyimak/membaca) render their items for
 * practice; text types (menulis/berbicara/umum) render a practice textarea.
 * Batch 2 adds the linked-practice path: a visible route from this Latihan
 * persiapan to its parent Tugas formal, with the formal submission status
 * kept separate from the repeatable practice progress.
 */
export function FormativePractice({
	assignment,
	courseId,
	parentSubmission = null,
	embedded = false,
}: {
	assignment: Assignment;
	/** Used to build the in-page path to the parent formal task. */
	courseId?: string;
	/** The student's own submission on the parent formal task, if any. */
	parentSubmission?: AssignmentSubmission | null;
	/** Render only the practice fields when the answer sheet already shows the chrome. */
	embedded?: boolean;
}) {
	const kind = taskKindForShape(assignment.shape);
	const quiz = kind === 'quiz' ? parseQuizConfig(assignment.taskConfig) : null;
	const listening = kind === 'listening' ? parseListeningConfig(assignment.taskConfig) : null;
	const reading = kind === 'reading' ? parseReadingConfig(assignment.taskConfig) : null;
	const writing = kind === 'writing' ? parseWritingConfig(assignment.taskConfig) : null;
	const speaking = kind === 'speaking' ? parseSpeakingConfig(assignment.taskConfig) : null;

	const questions = useMemo(
		() => quiz?.questions || reading?.questions || listening?.questions || [],
		[quiz, reading, listening],
	);
	const [answers, setAnswers] = useState<Record<string, number | string>>({});
	const [notes, setNotes] = useState('');

	const prompt = writing?.prompt || speaking?.prompt || '';
	const isTextPractice = Boolean(prompt) || (!questions.length && kind !== 'quiz');
	// Practice stays repeatable while published; a closed/archived assignment
	// keeps its material readable but Cek jawaban is no longer available.
	const closed = assignment.status === 'closed' || assignment.status === 'archived';
	const parent = assignment.expand?.parentAssignment;
	const parentPath = parent ? studentWorkPath(parent.id) : '';

	const retryPractice = async () => {
		if (
			!(await confirmDialog({
				title: 'Mulai ulang latihan?',
				message: 'Kosongkan jawaban dan catatan latihan ini untuk mulai ulang dari awal? Riwayat pemeriksaan Anda tetap tersimpan.',
				variant: 'default',
				confirmLabel: 'Mulai ulang',
			}))
		)
			return;
		setAnswers({});
		setNotes('');
	};

	const buildResponse = () => ({
		kind: kind || 'generic',
		...(questions.length ? { answers } : {}),
		...(isTextPractice || !questions.length
			? { content: notes, wordCount: countWords(notes) }
			: {}),
	});

	return (
		<div className="tws-workspace asg-formative">
			{!embedded && (
				<p className="asg-formative-note">
					<Repeat size={14} />
					<span>
						<strong>Latihan formatif — berulang, tanpa pengumpulan final.</strong> Kerjakan
						sesering yang Anda mau; Cek jawaban memberi panduan bertahap tanpa memberi
						jawaban. Tidak ada nilai dan tidak berdampak pada penilaian mata kuliah.
					</span>
				</p>
			)}

			{!embedded && parent && (
				<div className="asg-practice-path" role="navigation" aria-label="Tugas formal terkait">
					<div>
						<small>Latihan persiapan untuk tugas formal</small>
						<strong>{parent.title}</strong>
						<span className="asg-practice-path-status">{formalSubmissionLine(parentSubmission)}</span>
					</div>
					{parentPath ? (
						<Link to={parentPath} className="ld-btn-primary">
							<ArrowRight size={15} /> Buka tugas formal
						</Link>
					) : null}
				</div>
			)}

			{reading?.passage && <p className="tws-prompt">{reading.passage}</p>}
			{listening?.media?.url && (
				<a className="asg-sub-file" href={listening.media.url} target="_blank" rel="noreferrer">
					<ExternalLink size={12} /> Materi simak: {listening.media.title || 'Buka materi'}
				</a>
			)}
			{prompt && <p className="tws-prompt">{prompt}</p>}

			{questions.length > 0 && (
				<ul className="tws-questions">
					{questions.map((q, i) => {
						const type =
							'type' in q && typeof (q as { type?: unknown }).type === 'string'
								? (q as { type: string }).type
								: 'mc';
						const picked = answers[q.id];
						return (
							<li key={q.id} className="tws-question">
								<div className="tws-question-top">
									<strong>
										Soal {i + 1} <em>{q.points} poin</em>
									</strong>
								</div>
								<p className="tws-question-text">{q.text}</p>
								{type === 'mc' && q.options.length > 0 ? (
									<div className="tws-options" role="radiogroup" aria-label={`Jawaban soal ${i + 1}`}>
										{q.options.map((option, oi) => (
											<label
												key={oi}
												className={`tws-option${picked === oi ? ' picked' : ''}`}
											>
												<input
													type="radio"
													name={`prac-${q.id}`}
													checked={picked === oi}
													onChange={() =>
														setAnswers((prev) => ({ ...prev, [q.id]: oi }))
													}
												/>
												<span className="tws-option-letter">{LETTERS[oi]}</span>
												<span>{option}</span>
											</label>
										))}
									</div>
								) : (
									<label className="asg-practice-answer">
										JAWABAN ANDA
										<input
											maxLength={500}
											value={typeof picked === 'string' ? picked : ''}
											onChange={(e) =>
												setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
											}
											placeholder="Tulis jawaban singkat Anda..."
										/>
									</label>
								)}
							</li>
						);
					})}
				</ul>
			)}

			{(isTextPractice || questions.length === 0) && (
				<label className="asg-practice-answer">
					{questions.length > 0 ? 'CATATAN LATIHAN (OPSIONAL)' : 'JAWABAN / CATATAN LATIHAN'}
					<textarea
						rows={5}
						maxLength={10000}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder={
							speaking
								? 'Tulis naskah atau transkrip latihan Anda...'
								: 'Tulis latihan Anda di sini, lalu periksa dengan Cek jawaban...'
						}
					/>
				</label>
			)}

			{(Object.keys(answers).length > 0 || notes.trim()) && (
				<div className="asg-practice-retry">
					<button type="button" className="ld-outline-action sm" onClick={retryPractice}>
						<RotateCcw size={14} /> Ulangi latihan dari awal
					</button>
					<span>Jawaban dikosongkan; riwayat pemeriksaan tetap tersimpan untuk dosen.</span>
				</div>
			)}

			{closed && (
				<p className="asg-empty-line">
					Latihan sudah ditutup dosen — soal dan materi tetap dapat dibaca, tetapi Cek
					jawaban tidak lagi tersedia.
				</p>
			)}
			{!closed && (
				<CheckAnswerPanel
					assignment={{
						id: assignment.id,
						status: assignment.status,
						deadline: assignment.deadline,
						mode: assignment.mode,
						checkEnabled: assignment.checkEnabled,
						checkMax: assignment.checkMax,
					}}
					channel="enrolled"
					buildResponse={buildResponse}
				/>
			)}
		</div>
	);
}
