import { useEffect, useMemo, useState } from 'react';
import {
	CheckCircle2,
	Clock,
	Download,
	Eye,
	FileText,
	LoaderCircle,
	Sparkles,
	XCircle,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import { isPreviewableSubmissionFile, submissionFileUrl, type Assignment, type AssignmentSubmission } from '@/lib/assignments';
import { enrolledIdentityKey } from '@/lib/check-types';
import { CheckHistory } from '@/components/app/check-history';
import {
	LISTENING_TYPE_LABEL,
	parseAnswerKey,
	parseListeningConfig,
	parseQuizConfig,
	parseTaskAnswers,
	parseTaskReview,
	parseWritingConfig,
	taskKindForShape,
	type TaskAnswerKey,
	type TaskKind,
} from '@/lib/task-types';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

type AssistResponse = {
	kind: string;
	kindLabel: string;
	suggestion: string;
	imageCount: number;
	note: string;
	error?: string;
};

/**
 * Lecturer-side review of specialized submissions: quiz/listening answers with
 * correctness against the owner-only key, writing text + ordered photos with
 * rubric scoring, and AI assistance (feedback / summary / transcription) that
 * only suggests — the lecturer confirms before anything is saved.
 */
export function SubmissionTaskReview({
	assignment,
	submission,
	onApplyFeedback,
	parts = 'all',
}: {
	assignment: Assignment;
	submission: AssignmentSubmission;
	/** Pushes a confirmed AI suggestion into the grade panel's feedback field. */
	onApplyFeedback?: (text: string) => void;
	/** `answer` hides writing review and student AI guidance; `guidance` is guidance only. */
	parts?: 'all' | 'answer' | 'guidance';
}) {
	const kind = taskKindForShape(assignment.shape) as TaskKind | null;
	const [key, setKey] = useState<TaskAnswerKey | null>(null);
	const [keyMissing, setKeyMissing] = useState(false);

	useEffect(() => {
		if (!kind || kind === 'writing') return;
		let alive = true;
		void (async () => {
			try {
				const rec = await pb.collection('task_answer_keys').getFirstListItem(
					`assignment = "${assignment.id}"`,
				);
				if (alive) setKey(parseAnswerKey(rec.key));
			} catch {
				if (alive) setKeyMissing(true);
			}
		})();
		return () => {
			alive = false;
		};
	}, [kind, assignment.id]);

	if (parts === 'guidance') {
		return (
			<div className="tsr-review">
				<FeedbackReview submission={submission} />
			</div>
		);
	}

	if (!kind) return null;

	return (
		<div className="tsr-review">
			{kind === 'quiz' && (
				<QuizReview assignment={assignment} submission={submission} key_={key} keyMissing={keyMissing} />
			)}
			{kind === 'listening' && (
				<ListeningReview assignment={assignment} submission={submission} key_={key} keyMissing={keyMissing} />
			)}
			{kind === 'writing' && parts === 'all' && (
				<WritingReview
					assignment={assignment}
					submission={submission}
					onApplyFeedback={onApplyFeedback}
				/>
			)}
			{parts === 'all' && <FeedbackReview submission={submission} />}
			{parts === 'all' && (
				<CheckHistory
					assignmentId={assignment.id}
					identityKey={enrolledIdentityKey(submission.owner)}
				/>
			)}
		</div>
	);
}

// ── Quiz ─────────────────────────────────────────────────────

function QuizReview({
	assignment,
	submission,
	key_,
	keyMissing,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission;
	key_: TaskAnswerKey | null;
	keyMissing: boolean;
}) {
	const config = useMemo(() => parseQuizConfig(assignment.taskConfig), [assignment]);
	const answers = useMemo(
		() => parseTaskAnswers(submission.taskAnswers)?.quiz?.answers ?? {},
		[submission],
	);
	if (config.questions.length === 0) return null;
	const autoScore = submission.autoScore;

	return (
		<div className="tsr-block">
			<div className="tsr-block-head">
				<h4>Jawaban kuis</h4>
				{autoScore != null && <span className="asg-tag grade">Otomatis {autoScore}/100</span>}
			</div>
			{keyMissing && (
				<p className="tsr-note">Kunci jawaban tidak tersimpan untuk tugas ini — penilaian manual.</p>
			)}
			<ol className="tsr-answers">
				{config.questions.map((q, i) => {
					const entry = key_?.quiz?.[q.id];
					const picked = answers[q.id];
					const hasKey = typeof entry?.correctIndex === 'number';
					const correct = hasKey && picked === entry!.correctIndex;
					return (
						<li key={q.id} className={hasKey ? (correct ? 'ok' : 'bad') : 'manual'}>
							<span className="tsr-mark">
								{hasKey ? correct ? <CheckCircle2 size={14} /> : <XCircle size={14} /> : <FileText size={14} />}
							</span>
							<div>
								<strong>
									Soal {i + 1} <em>{q.points} poin</em>
								</strong>
								<p>{q.text}</p>
								<small>
									Jawaban mahasiswa:{' '}
									{typeof picked === 'number'
										? `${LETTERS[picked] || '?'} — ${q.options[picked] || ''}`
										: 'tidak dijawab'}
								</small>
								{hasKey && (
									<small>
										Kunci: {LETTERS[entry!.correctIndex!] || '?'} — {q.options[entry!.correctIndex!] || ''}
									</small>
								)}
								{entry?.explanation && <small className="tsr-explain">{entry.explanation}</small>}
							</div>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

// ── Listening ────────────────────────────────────────────────

function ListeningReview({
	assignment,
	submission,
	key_,
	keyMissing,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission;
	key_: TaskAnswerKey | null;
	keyMissing: boolean;
}) {
	const config = useMemo(() => parseListeningConfig(assignment.taskConfig), [assignment]);
	const answers = useMemo(
		() => parseTaskAnswers(submission.taskAnswers)?.listening?.answers ?? {},
		[submission],
	);
	if (config.questions.length === 0) return null;

	return (
		<div className="tsr-block">
			<div className="tsr-block-head">
				<h4>Jawaban menyimak</h4>
				{submission.autoScore != null && (
					<span className="asg-tag grade">PG otomatis {submission.autoScore}/100</span>
				)}
			</div>
			{keyMissing && (
				<p className="tsr-note">Kunci jawaban tidak tersimpan untuk tugas ini — penilaian manual.</p>
			)}
			<ol className="tsr-answers">
				{config.questions.map((q, i) => {
					const entry = key_?.listening?.[q.id];
					const answer = answers[q.id];
					const hasKey = q.type === 'mc' && typeof entry?.correctIndex === 'number';
					const correct = hasKey && answer === entry!.correctIndex;
					return (
						<li key={q.id} className={hasKey ? (correct ? 'ok' : 'bad') : 'manual'}>
							<span className="tsr-mark">
								{hasKey ? correct ? <CheckCircle2 size={14} /> : <XCircle size={14} /> : <Clock size={14} />}
							</span>
							<div>
								<strong>
									Pertanyaan {i + 1} <em>{LISTENING_TYPE_LABEL[q.type]}</em>
								</strong>
								<p>{q.text}</p>
								{q.type === 'mc' && (
									<small>
										Jawaban mahasiswa:{' '}
										{typeof answer === 'number'
											? `${LETTERS[answer] || '?'} — ${q.options[answer] || ''}`
											: 'tidak dijawab'}
										{hasKey && ` · Kunci: ${LETTERS[entry!.correctIndex!] || '?'} — ${q.options[entry!.correctIndex!] || ''}`}
									</small>
								)}
								{q.type === 'matching' && (
									<small>
										Jawaban mahasiswa:{' '}
										{answer && typeof answer === 'object'
											? Object.entries(answer as Record<string, string>)
													.map(([l, r]) => `${l} → ${r}`)
													.join('; ')
											: 'tidak dijawab'}
										{' · Pasangan: '}
										{q.pairs.map((p) => `${p.left} → ${p.right}`).join('; ')}
									</small>
								)}
								{(q.type === 'short' || q.type === 'transcription') && (
									<>
										<small className="tsr-answer-text">{String(answer || 'tidak dijawab')}</small>
										{entry?.expected && <small>Rujukan dosen: {entry.expected}</small>}
									</>
								)}
							</div>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

// ── Writing ─────────────────────────────────────────────────

function WritingReview({
	assignment,
	submission,
	onApplyFeedback,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission;
	onApplyFeedback?: (text: string) => void;
}) {
	const config = useMemo(() => parseWritingConfig(assignment.taskConfig), [assignment]);
	const saved = useMemo(() => parseTaskAnswers(submission.taskAnswers), [submission]);
	const savedReview = useMemo(() => parseTaskReview(submission.taskReview), [submission]);
	const questionAnswers = saved?.writing?.answers || {};
	const multiQuestion = config.questions.length > 0;

	const [criteriaScores, setCriteriaScores] = useState<Record<string, string>>(() => {
		const init: Record<string, string> = {};
		for (const c of config.criteria) {
			const v = savedReview?.criteria?.[c.id];
			init[c.id] = v != null ? String(v) : '';
		}
		return init;
	});
	const [notes, setNotes] = useState(savedReview?.notes || '');
	const [busy, setBusy] = useState<'save' | 'assist' | null>(null);
	const [error, setError] = useState('');
	const [assistKind, setAssistKind] = useState<'feedback' | 'summary' | 'transcription' | null>(null);
	const [suggestion, setSuggestion] = useState('');
	const [suggestionNote, setSuggestionNote] = useState('');

	const imageOrder = saved?.writing?.imageOrder || [];
	const files = submission.files || [];
	const images = [
		...imageOrder.filter((f) => files.includes(f)),
		...files.filter((f) => IMAGE_EXT.test(f) && !imageOrder.includes(f)),
	];
	const docs = files.filter((f) => !IMAGE_EXT.test(f));

	const saveReview = async () => {
		setBusy('save');
		setError('');
		try {
			const criteria: Record<string, number> = {};
			for (const c of config.criteria) {
				const raw = criteriaScores[c.id]?.trim();
				if (raw === '') continue;
				const n = Number(raw);
				if (Number.isNaN(n) || n < 0 || n > 100) {
					setError(`Nilai kriteria “${c.label}” harus angka 0–100.`);
					return;
				}
				criteria[c.id] = n;
			}
			await pb.collection('assignment_submissions').update(submission.id, {
				taskReview: { criteria, notes: notes.trim() },
			});
			invalidate('assignment_submissions');
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(null);
		}
	};

	const runAssist = async (kind: 'feedback' | 'summary' | 'transcription') => {
		setBusy('assist');
		setAssistKind(kind);
		setError('');
		setSuggestion('');
		setSuggestionNote('');
		try {
			const response = await fetch('/api/task-assist', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ submissionId: submission.id, kind }),
			});
			const body = (await response.json()) as AssistResponse;
			if (!response.ok) {
				setError(body.error || 'Asisten AI gagal.');
				return;
			}
			setSuggestion(body.suggestion);
			setSuggestionNote(body.note);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="tsr-block">
			<div className="tsr-block-head">
				<h4>Tinjauan menulis</h4>
				{saved?.writing?.wordCount != null && (
					<span className="asg-tag">{saved.writing.wordCount} kata</span>
				)}
			</div>

			{multiQuestion ? (
			<ol className="tsr-qblocks">
				{config.questions.map((q, i) => {
					const ans = questionAnswers[q.id];
					const text = ans?.content ?? '';
					const wc = ans?.wordCount ?? 0;
					return (
						<li key={q.id} className="tsr-qblock">
							<div className="tsr-qblock-head">
								<span className="tsr-qblock-num">{i + 1}</span>
								<div>
									<strong>{q.prompt}</strong>
									{q.guidance && <small>{q.guidance}</small>}
								</div>
								<span className="asg-tag">{wc} kata</span>
							</div>
							{text.trim() ? (
								<p className="tsr-text">{text}</p>
							) : (
								<p className="asg-empty-line">Belum dijawab.</p>
							)}
						</li>
					);
				})}
			</ol>
		) : (
			submission.content && <p className="tsr-text">{submission.content}</p>
		)}
			{docs.length > 0 && (
				<div className="asg-sub-files">
					{docs.map((f) => {
						const previewable = isPreviewableSubmissionFile(f);
						return (
							<a key={f} className="asg-sub-file" href={submissionFileUrl(submission, f)} target="_blank" rel="noreferrer" {...(previewable ? {} : { download: true })}>
								{previewable ? <Eye size={12} /> : <Download size={12} />} {f}
							</a>
						);
					})}
				</div>
			)}
			{images.length > 0 && (
				<div className="tsr-photos">
					<span className="tsr-photos-label">Foto tulisan tangan ({images.length}) — urutan mahasiswa</span>
					<ol className="tsr-photo-list">
						{images.map((f, i) => (
							<li key={f}>
								<a href={submissionFileUrl(submission, f)} target="_blank" rel="noreferrer">
									<img src={submissionFileUrl(submission, f)} alt={`Foto tulisan ${i + 1}`} loading="lazy" />
								</a>
								<span>{i + 1}</span>
							</li>
						))}
					</ol>
				</div>
			)}

			{config.criteria.length > 0 && (
				<div className="tsr-rubric">
					<span className="tsr-rubric-label">Rubrik penilaian</span>
					{config.criteria.map((c) => (
						<label key={c.id} className="tsr-criterion">
							<span>
								{c.label}
								{c.weight > 0 && <em>bobot {c.weight}</em>}
							</span>
							<input
								inputMode="decimal"
								value={criteriaScores[c.id] ?? ''}
								onChange={(e) => setCriteriaScores((prev) => ({ ...prev, [c.id]: e.target.value }))}
								placeholder="0–100"
								aria-label={`Nilai kriteria ${c.label}`}
							/>
						</label>
					))}
					<label className="tsr-criterion tsr-criterion-notes">
						<span>Catatan penilaian</span>
						<textarea
							rows={2}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Catatan internal Anda untuk kiriman ini…"
						/>
					</label>
					<div className="tsr-actions">
						<button type="button" className="ld-outline-action sm" onClick={() => void saveReview()} disabled={busy !== null}>
							{busy === 'save' ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />} Simpan rubrik
						</button>
					</div>
				</div>
			)}

			<div className="tsr-ai">
				<span className="tsr-rubric-label">Asisten AI (hanya dari kiriman &amp; rubrik ini)</span>
				<div className="tsr-ai-actions">
					{(['feedback', 'summary', 'transcription'] as const).map((kind) => (
						<button
							key={kind}
							type="button"
							className="ld-text-btn"
							disabled={busy !== null}
							onClick={() => void runAssist(kind)}
						>
							{busy === 'assist' && assistKind === kind ? (
								<LoaderCircle size={13} className="spin" />
							) : (
								<Sparkles size={13} />
							)}
							{kind === 'feedback' ? 'Saran umpan balik' : kind === 'summary' ? 'Ringkasan' : 'Transkripsi foto'}
						</button>
					))}
				</div>
				{suggestion && (
					<div className="tsr-suggestion">
						<textarea
							rows={5}
							value={suggestion}
							onChange={(e) => setSuggestion(e.target.value)}
							aria-label="Saran AI — sunting sebelum dipakai"
						/>
						<div className="tsr-actions">
							<button
								type="button"
								className="ld-btn-primary"
								onClick={() => {
									if (onApplyFeedback) onApplyFeedback(suggestion);
									else void saveReview();
								}}
							>
								Gunakan sebagai umpan balik
							</button>
						</div>
						{suggestionNote && <small>{suggestionNote}</small>}
					</div>
				)}
			</div>

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

// ── Staged AI feedback (all task kinds) ─────────────────────

type FeedbackRow = {
	id: string;
	level: number;
	area: string;
	hint: string;
	evidence: string;
	status: 'open' | 'understood' | 'unclear' | '';
	review: 'pending' | 'approved' | 'edited' | 'rejected' | '';
	released: boolean;
	lecturerNote: string;
	created: string;
};

const FB_LEVEL_LABEL: Record<number, string> = {
	1: 'Tingkat 1 · Area & refleksi',
	2: 'Tingkat 2 · Konsep',
	3: 'Tingkat 3 · Terarah',
};

/**
 * Lecturer review of the staged AI hints a student requested on this
 * submission: inspect the hint (and its evidence), edit it, approve it, or
 * reject and hide it from the student. Nothing here is an official evaluation —
 * the grade panel stays the authoritative record.
 */
function FeedbackReview({ submission }: { submission: AssignmentSubmission }) {
	const [records, setRecords] = useState<FeedbackRow[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [edits, setEdits] = useState<Record<string, string>>({});
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [busyId, setBusyId] = useState('');
	const [error, setError] = useState('');

	useEffect(() => {
		let alive = true;
		void (async () => {
			try {
				const rows = await pb.collection('ai_feedback').getFullList<FeedbackRow>({
					filter: `submission="${submission.id}"`,
					sort: 'created',
				});
				if (alive) setRecords(rows);
			} catch {
				/* list rule denies rows outside this lecturer's assignments */
			} finally {
				if (alive) setLoaded(true);
			}
		})();
		return () => {
			alive = false;
		};
	}, [submission.id]);

	const reload = async () => {
		try {
			const rows = await pb.collection('ai_feedback').getFullList<FeedbackRow>({
				filter: `submission="${submission.id}"`,
				sort: 'created',
			});
			setRecords(rows);
			invalidate('ai_feedback');
		} catch (err) {
			setError(errorMessage(err));
		}
	};

	const review = async (row: FeedbackRow, decision: 'approved' | 'edited' | 'rejected') => {
		setBusyId(row.id);
		setError('');
		try {
			const response = await fetch('/api/feedback', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({
					action: 'review',
					id: row.id,
					decision,
					hint: decision === 'edited' ? edits[row.id] ?? row.hint : undefined,
					lecturerNote: notes[row.id] ?? row.lecturerNote,
					release: decision === 'rejected' ? false : undefined,
				}),
			});
			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				setError(body.error || 'Gagal menyimpan keputusan.');
				return;
			}
			await reload();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	if (loaded && records.length === 0) {
		return (
			<div className="tsr-block">
				<div className="tsr-block-head">
					<h4>Panduan AI mahasiswa</h4>
				</div>
				<p className="tsr-note">
					Belum ada permintaan panduan AI untuk kiriman ini. Mahasiswa dapat meminta panduan
					bertahap (maks 3 tingkat) saat mengerjakan.
				</p>
			</div>
		);
	}
	if (records.length === 0) return null;

	return (
		<div className="tsr-block">
			<div className="tsr-block-head">
				<h4>Panduan AI mahasiswa ({records.length})</h4>
				<span className="asg-tag">Formatif — bukan nilai resmi</span>
			</div>
			<p className="tsr-note">
				Panduan di bawah diminta mahasiswa saat mengerjakan. Setujui, sunting, atau tolak —
				panduan yang ditolak disembunyikan dari mahasiswa. Nilai resmi tetap di panel nilai.
			</p>
			<ol className="tsr-fb-list">
				{records.map((row) => (
					<li key={row.id} className={`tsr-fb-item${row.review === 'rejected' ? ' rejected' : ''}`}>
						<div className="tsr-fb-head">
							<strong>{FB_LEVEL_LABEL[row.level] || `Tingkat ${row.level}`}</strong>
							{row.area && <span className="asg-tag">{row.area}</span>}
							<span className="tsr-fb-chips">
								{row.status === 'understood' ? (
									<span className="asg-tag sub-graded">Dipahami mahasiswa</span>
								) : row.status === 'unclear' ? (
									<span className="asg-tag sub-revision">Masih kurang jelas</span>
								) : (
									<span className="asg-tag">Belum ditandai</span>
								)}
								{row.review === 'approved' && <span className="asg-tag status-published">Disetujui</span>}
								{row.review === 'edited' && <span className="asg-tag status-published">Disunting</span>}
								{row.review === 'rejected' && <span className="asg-tag status-closed">Ditolak · tersembunyi</span>}
							</span>
						</div>
						{row.evidence && <p className="tsr-fb-evidence">Bukti pada kiriman: {row.evidence}</p>}
						<label className="tsr-fb-edit">
							<span>Teks panduan — sunting bila perlu</span>
							<textarea
								rows={3}
								value={edits[row.id] ?? row.hint}
								onChange={(e) => setEdits((prev) => ({ ...prev, [row.id]: e.target.value }))}
								aria-label={`Teks panduan tingkat ${row.level}`}
							/>
						</label>
						<label className="tsr-fb-edit">
							<span>Catatan dosen untuk mahasiswa (opsional)</span>
							<textarea
								rows={2}
								placeholder="mis. perhatikan poin panduan ini sebelum revisi…"
								value={notes[row.id] ?? row.lecturerNote}
								onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
								aria-label={`Catatan dosen panduan tingkat ${row.level}`}
							/>
						</label>
						<div className="tsr-fb-actions">
							<button
								type="button"
								className="ld-outline-action sm"
								disabled={busyId === row.id}
								onClick={() => void review(row, 'approved')}
							>
								{busyId === row.id ? <LoaderCircle size={13} className="spin" /> : <CheckCircle2 size={13} />} Setujui
							</button>
							<button
								type="button"
								className="ld-outline-action sm"
								disabled={busyId === row.id}
								onClick={() => void review(row, 'edited')}
							>
								<Sparkles size={13} /> Simpan suntingan
							</button>
							<button
								type="button"
								className="ld-outline-action sm"
								disabled={busyId === row.id}
								onClick={() => void review(row, 'rejected')}
							>
								<XCircle size={13} /> Tolak &amp; sembunyikan
							</button>
						</div>
					</li>
				))}
			</ol>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
