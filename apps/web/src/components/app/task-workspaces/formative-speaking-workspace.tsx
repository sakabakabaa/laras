import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import {
	ArrowRight,
	BookOpen,
	FileAudio,
	LoaderCircle,
	Mic,
	RotateCcw,
	Sparkles,
	Upload,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import { validateFile } from '@/lib/resources';
import {
	deadlineLabel,
	studentWorkPath,
	submissionFileUrl,
	uploadSubmission,
	studentGradeLabel,
	type Assignment,
	type AssignmentSubmission,
	type SubmissionStatus,
	SUBMISSION_STATUS_LABEL,
} from '@/lib/assignments';
import { parseSpeakingConfig } from '@/lib/task-types';
import { requestTranscription, type TranscriptStatus } from '@/lib/transcription';
import { AudioRecorder, type RecordedClip } from '@/components/app/audio-recorder';
import { TranscriptPanel } from '@/components/app/task-workspaces/transcript-panel';
import { PointFeedback } from '@/components/app/task-workspaces/point-feedback';
import { confirmDialog } from '@/components/confirm-dialog';

const AUDIO_RE = /\.(webm|mp4|m4a|mp3|wav|ogg|aac|flac)$/i;
const isAudioName = (name: string) => AUDIO_RE.test(name);

type FeedbackAttempt = {
	attempt: number;
	area: string;
	guidance: string;
	evidence: string;
	citations: { title: string; section: string; pageRef: string }[];
	transcript: string;
	created: string;
};

type FeedbackResponse = {
	ok?: boolean;
	area?: string;
	guidance?: string;
	evidence?: string;
	citations?: { file: string; title: string; section: string; pageRef: string }[];
	materialsResult?: 'sufficient' | 'insufficient';
	note?: string;
	error?: string;
};

/** Short label for the student's formal-task submission state (mirrors FormativePractice). */
function formalSubmissionLine(submission: AssignmentSubmission | null) {
	if (!submission || !submission.status || submission.status === 'draft')
		return 'Belum mengumpulkan tugas formal.';
	if (submission.status === 'graded')
		return `Tugas formal sudah dinilai${submission.grade != null ? ` (nilai ${studentGradeLabel(submission.grade)})` : ''}.`;
	return `Tugas formal: ${SUBMISSION_STATUS_LABEL[submission.status as SubmissionStatus]}.`;
}

/**
 * Phase 5 — live formative feedback for a Latihan persiapan (formative)
 * speaking practice.
 *
 * The student records or uploads practice audio; the existing transcription-service
 * transcription flow transcribes it; once the transcript is ready, immediate
 * formative feedback is generated from the transcript and the lecturer-
 * approved course materials (Phase 4/5 context bundle). Each attempt's
 * feedback is kept in session state so the student can retry and compare.
 *
 * Reuses — never duplicates — the existing recording/upload
 * (`AudioRecorder`), submission (`uploadSubmission`), transcription
 * (`requestTranscription` + `TranscriptPanel`), and AI assistance
 * (`/api/practice-speaking` → `buildPracticeAssist`) systems. Results are
 * session-only: nothing is graded, published, or fed into formal evaluation
 * or analytics. The feedback is clearly labeled as formative practice
 * feedback, not an official grade.
 */
export function FormativeSpeakingWorkspace({
	assignment,
	courseId,
	parentSubmission = null,
	embedded = false,
}: {
	assignment: Assignment;
	courseId?: string;
	parentSubmission?: AssignmentSubmission | null;
	embedded?: boolean;
}) {
	const config = parseSpeakingConfig(assignment.taskConfig);
	const closed = assignment.status === 'closed' || assignment.status === 'archived';
	const parent = assignment.expand?.parentAssignment;
	const parentPath = parent ? studentWorkPath(parent.id) : '';

	const [submissionId, setSubmissionId] = useState('');
	const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>('');
	const [transcript, setTranscript] = useState('');
	const [transcriptError, setTranscriptError] = useState('');
	const [transcriptFile, setTranscriptFile] = useState('');
	const [audioName, setAudioName] = useState('');
	const [audioUrl, setAudioUrl] = useState('');
	const [notes, setNotes] = useState('');
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState('');
	const [feedback, setFeedback] = useState<FeedbackAttempt[]>([]);
	const [feedbackBusy, setFeedbackBusy] = useState(false);
	const [feedbackError, setFeedbackError] = useState('');
	const [focus, setFocus] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Load any existing draft submission for this assignment + student so a
	// returning student sees their last practice audio + transcript state.
	useEffect(() => {
		const ownerId = pb.authStore.record?.id || '';
		if (!ownerId) return;
		let alive = true;
		const load = async () => {
			try {
				const rows = await pb
					.collection('assignment_submissions')
					.getList<AssignmentSubmission>(1, 1, {
						filter: pb.filter('assignment = {:a} && owner = {:o}', {
							a: assignment.id,
							o: ownerId,
						}),
						sort: '-updated',
					});
				if (!alive || rows.items.length === 0) return;
				const sub = rows.items[0];
				setSubmissionId(sub.id);
				setTranscriptStatus((sub.transcriptStatus || '') as TranscriptStatus);
				setTranscript(sub.transcript || '');
				setTranscriptError(sub.transcriptError || '');
				setTranscriptFile(sub.transcriptFile || '');
				const audio = (sub.files || []).find(isAudioName);
				if (audio) {
					setAudioName(audio);
					setAudioUrl(submissionFileUrl(sub, audio));
				}
			} catch {
				/* transient — the student can still record fresh audio */
			}
		};
		void load();
		return () => {
			alive = false;
		};
	}, [assignment.id]);

	const saveAudio = async (file: File) => {
		setSaveError('');
		setSaving(true);
		try {
			const ownerId = pb.authStore.record?.id || '';
			let id = submissionId;
			if (id) {
				// Update: pass only the new audio file so the previous recording
				// is replaced (a practice retry, not an accumulation).
				const fd = new FormData();
				fd.set('content', notes.trim());
				fd.set('status', 'draft');
				fd.append('files', file);
				await uploadSubmission(fd, { id });
			} else {
				const fd = new FormData();
				fd.set('content', notes.trim());
				fd.set('status', 'draft');
				fd.set('assignment', assignment.id);
				fd.set('owner', ownerId);
				fd.append('files', file);
				const created = await uploadSubmission(fd, {});
				id = created.id;
				setSubmissionId(id);
			}
			setAudioName(file.name);
			setAudioUrl(URL.createObjectURL(file));
			// Reset transcript state — the new recording re-transcribes.
			setTranscriptStatus('pending');
			setTranscript('');
			setTranscriptError('');
			setTranscriptFile('');
			invalidate('assignment_submissions');
			void requestTranscription(id);
		} catch (err) {
			setSaveError(errorMessage(err));
		} finally {
			setSaving(false);
		}
	};

	const onClip = (clip: RecordedClip) => {
		setSaveError('');
		void saveAudio(clip.file);
	};

	const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) return;
		const problem = validateFile(file);
		if (problem) {
			setSaveError(problem);
			return;
		}
		void saveAudio(file);
	};

	const requestFeedback = async (transcriptText: string) => {
		if (!submissionId || !transcriptText.trim()) return;
		setFeedbackError('');
		setFeedbackBusy(true);
		try {
			const response = await fetch('/api/practice-speaking', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({
					assignmentId: assignment.id,
					submissionId,
					focus: focus.trim(),
				}),
			});
			const body = (await response.json()) as FeedbackResponse;
			if (!response.ok) {
				setFeedbackError(body.error || 'Umpan balik gagal diminta. Coba lagi.');
				return;
			}
			setFeedback((prev) => [
				{
					attempt: prev.length + 1,
					area: body.area || '',
					guidance: body.guidance || '',
					evidence: body.evidence || '',
					citations: (body.citations || []).map((c) => ({
						title: c.title,
						section: c.section,
						pageRef: c.pageRef,
					})),
					transcript: transcriptText,
					created: new Date().toISOString(),
				},
				...prev,
			]);
			setFocus('');
		} catch (err) {
			setFeedbackError(errorMessage(err));
		} finally {
			setFeedbackBusy(false);
		}
	};

	const retryPractice = async () => {
		if (
			!(await confirmDialog({
				title: 'Mulai ulang latihan?',
				message: 'Kosongkan rekaman dan umpan balik latihan ini untuk mulai ulang dari awal? Transkrip tersimpan tetap dapat dilihat dosen.',
				variant: 'default',
				confirmLabel: 'Mulai ulang',
			}))
		)
			return;
		setAudioName('');
		setAudioUrl('');
		setTranscript('');
		setTranscriptStatus('');
		setTranscriptError('');
		setTranscriptFile('');
		setFeedback([]);
		setFeedbackError('');
		setNotes('');
	};

	return (
		<div className="tws-workspace asg-formative fsp-workspace">
			{!embedded && (
				<p className="asg-formative-note">
					<Mic size={14} />
					<span>
						<strong>Latihan berbicara formatif — berulang, tanpa pengumpulan final.</strong>{' '}
						Rekam atau unggah audio; transkripsi otomatis berjalan di latar belakang, lalu Anda
						mendapat umpan balik formatif dari transkrip. Tidak ada nilai dan tidak berdampak
						pada penilaian mata kuliah.
					</span>
				</p>
			)}

			{!embedded && parent && (
				<div className="asg-practice-path" role="navigation" aria-label="Tugas formal terkait">
					<div>
						<small>Latihan persiapan untuk tugas formal</small>
						<strong>{parent.title}</strong>
						<span className="asg-practice-path-status">
							{formalSubmissionLine(parentSubmission)}
						</span>
					</div>
					{parentPath ? (
						<Link to={parentPath} className="ld-btn-primary">
							<ArrowRight size={15} /> Buka tugas formal
						</Link>
					) : null}
				</div>
			)}

			<div className="tws-meta">
				<span className="tws-chip">
					<Mic size={12} /> Berbicara
				</span>
				{config.durationMin > 0 && (
					<span className="tws-chip">Saran {config.durationMin} menit</span>
				)}
				{config.language && <span className="tws-chip">{config.language}</span>}
				{!closed && <span className="tws-chip">Batas waktu: {deadlineLabel(assignment.deadline)}</span>}
			</div>
			{config.prompt && <p className="tws-prompt">{config.prompt}</p>}
			{config.criteria.length > 0 && (
				<ul className="tws-details">
					{config.criteria.map((c) => (
						<li key={c.id} className="manual">
							<span />
							<div>
								<strong>{c.label}</strong>
								<small>Bobot relatif {c.weight} — dinilai dosen pada tugas formal</small>
							</div>
						</li>
					))}
				</ul>
			)}

			{closed ? (
				<p className="tws-notice">
					Latihan sudah ditutup dosen — materi tetap dapat dibaca, tetapi rekaman dan umpan
					balik tidak lagi tersedia.
				</p>
			) : (
				<>
					<div className="tws-audio-section">
						<AudioRecorder onClip={onClip} />
						<input
							ref={fileInputRef}
							type="file"
							accept="audio/*,video/*"
							className="pdf-file-input"
							onChange={onFileSelect}
						/>
						<Button variant="ghost"
							type="button"
							className="ld-outline-action sm"
							onClick={() => fileInputRef.current?.click()}
						>
							<Upload size={14} /> Unggah berkas audio / video
						</Button>
						{audioName && (
							<span className="asg-file-chip">
								<FileAudio size={12} /> {audioName}
							</span>
						)}
					</div>

					{audioUrl && (
						<div className="tws-clips">
							<span className="tws-clips-label">Rekaman latihan terakhir</span>
							<ul className="tws-clip-list">
								<li className="tws-clip">
									<FileAudio size={14} />
									<div className="tws-clip-body">
										<strong>{audioName}</strong>
										<audio controls src={audioUrl} className="tws-clip-audio" />
									</div>
								</li>
							</ul>
						</div>
					)}

					{saving && (
						<p className="pub-status">
							<LoaderCircle size={14} className="spin" /> Menyimpan rekaman latihan…
						</p>
					)}
					{saveError && (
						<p className="form-error" role="alert">
							{saveError}
						</p>
					)}

					{submissionId && (transcriptStatus || audioName) ? (
						<TranscriptPanel
							submissionId={submissionId}
							initialStatus={transcriptStatus}
							initialTranscript={transcript}
							initialError={transcriptError}
							initialFile={transcriptFile || audioName}
							onReady={(text) => void requestFeedback(text)}
						/>
					) : null}

					<div className="fbp-panel fsp-panel">
						<div className="fbp-head">
							<Sparkles size={16} />
							<div className="fbp-head-copy">
								<h4>Umpan balik latihan berbicara</h4>
								<p>
									Umpan balik otomatis berdasarkan transkrip audio Anda, instruksi latihan, materi
									mata kuliah yang disetujui dosen, dan kriteria rubrik. Hasilnya{' '}
									<strong>umpan balik formatif, bukan penilaian resmi</strong> — tidak ada
									jawaban, tidak ada nilai, dan tidak berdampak pada penilaian mata kuliah.
								</p>
							</div>
							<div className="fbp-head-meta">
								<span className="pra-badge">Latihan</span>
							</div>
						</div>

						<div className="fbp-request">
							<label className="fbp-focus">
								FOKUS (OPSIONAL)
								<input
									maxLength={500}
									value={focus}
									onChange={(e) => setFocus(e.target.value)}
									placeholder="mis. bagian pelafalan atau struktur mana yang ingin dibantu?"
								/>
							</label>
							<Button variant="ghost"
								type="button"
								className="ld-outline-action sm"
								onClick={() => void requestFeedback(transcript)}
								disabled={feedbackBusy || !transcript.trim()}
							>
								{feedbackBusy ? (
									<LoaderCircle size={14} className="spin" />
								) : (
									<Sparkles size={14} />
								)}
								Minta umpan balik
							</Button>
							<p className="ckp-note">
								Umpan balik otomatis muncul saat transkripsi selesai. Tombol ini meminta ulang
								umpan balik dari transkrip saat ini. Umpan balik tidak tersimpan sebagai riwayat
								permanen dan tidak mengurangi kuota Cek jawaban.
							</p>
						</div>

						{feedbackError && (
							<p className="form-error" role="alert">
								{feedbackError}
							</p>
						)}
						{feedbackBusy && (
							<p className="pub-status">
								<LoaderCircle size={14} className="spin" /> Menyusun umpan balik dari transkrip…
								petunjuk dapat muncul beberapa saat.
							</p>
						)}

						{feedback.length === 0 && !feedbackBusy && !feedbackError && (
							<p className="fbp-empty">
								Rekam atau unggah audio untuk mendapat umpan balik otomatis setelah transkripsi
								selesai. Setiap rekaman ulang menghasilkan umpan balik baru untuk dibandingkan.
							</p>
						)}

						{feedback.length > 0 && (
							<ol className="fbp-list">
								{feedback.map((f) => (
									<li key={f.attempt} className="fbp-item">
										<div className="fbp-item-head">
											<span className="pra-level">Percobaan {f.attempt}</span>
											{f.area && <span className="fbp-area">{f.area}</span>}
										</div>
										<PointFeedback text={f.guidance} />
										{f.evidence && <p className="fbp-evidence">Rujukan: {f.evidence}</p>}
										{f.citations.length > 0 && (
											<div className="pra-cites">
												<BookOpen size={12} />
												{f.citations.map((c, ci) => (
													<span key={ci} className="pra-cite">
														{c.title}
														{c.section ? ` — ${c.section}` : ''}
														{c.pageRef ? ` (${c.pageRef})` : ''}
													</span>
												))}
											</div>
										)}
										<details className="cho-snap">
											<summary>Transkrip percobaan ini</summary>
											<p className="cho-snap-text">{f.transcript}</p>
										</details>
									</li>
								))}
							</ol>
						)}
					</div>

					<label className="asg-practice-answer">
						CATATAN / NASKAH LATIHAN (OPSIONAL)
						<textarea
							rows={3}
							maxLength={10000}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Tulis naskah atau catatan latihan Anda (opsional)…"
						/>
					</label>

					{(audioName || feedback.length > 0) && (
						<div className="asg-practice-retry">
							<Button variant="ghost" type="button" className="ld-outline-action sm" onClick={retryPractice}>
								<RotateCcw size={14} /> Mulai latihan baru
							</Button>
							<span>
								Rekaman dan umpan balik dikosongkan; transkrip tersimpan tetap dapat dilihat dosen.
							</span>
						</div>
					)}
				</>
			)}
		</div>
	);
}
