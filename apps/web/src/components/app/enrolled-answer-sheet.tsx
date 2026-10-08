import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CheckCircle2, Repeat, Sparkles } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import { validateFile } from '@/lib/resources';
import { requestEvaluationDraft } from '@/lib/ai-evaluation';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage, useT } from '@/lib/i18n';
import {
	activityTypeOf,
	ACTIVITY_TYPE_LABEL,
	deadlineLabel,
	isPastDeadline,
	MODE_LABEL,
	SHAPE_LABEL,
	studentGradeLabel,
	studentWorkPath,
	submissionFileUrl,
	uploadSubmission,
	type Assignment,
	type AssignmentSubmission,
	type SubmissionStatus,
} from '@/lib/assignments';
import { parseSpeakingConfig, parseWritingConfig, taskKindForShape } from '@/lib/task-types';
import { speakingChecklist, speakingDirections, speakingLead } from '@/lib/speaking-directions';
import { extractCefrLevel } from '@/lib/cefr-level';
import { buildWorksheetBrief } from '@/lib/worksheet-brief';
import { FormativePractice } from '@/components/app/formative-practice';
import { QuizWorkspace } from '@/components/app/task-workspaces/quiz-workspace';
import {
	SpeakingPrepare,
	SpeakingRecord,
	SpeakingTranscriptSlot,
} from '@/components/app/task-workspaces/speaking-student-panel';
import { TranscriptPanel } from '@/components/app/task-workspaces/transcript-panel';
import type { RecordedClip } from '@/components/app/audio-recorder';
import { requestTranscription } from '@/lib/transcription';
import { ReadingWorkspace } from '@/components/app/task-workspaces/reading-workspace';
import { ListeningWorkspace } from '@/components/app/task-workspaces/listening-workspace';
import { WritingWorkspace } from '@/components/app/task-workspaces/writing-workspace';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';
import { StudentPublishedFeedback } from '@/components/app/student-published-feedback';
import { StudentAssistantPanel } from '@/components/app/student-assistant-panel';
import { confirmDialog } from '@/components/confirm-dialog';
import {
	AnswerEditor,
	AttachmentDrop,
	instructionLines,
	StudentAnswerSheet,
	type SheetBadge,
	type SheetMaterial,
} from '@/components/app/student-answer-sheet';

const NIM_KEY = 'upi-student-nim';

/**
 * Enrolled student answer sheet. Drafts and final submissions still go to
 * assignment_submissions; Cek jawaban stays the existing formative check.
 */
export function EnrolledAnswerSheet({
	assignment,
	courseId,
	courseLabel,
	submission,
	parentSubmission,
	linkedPractice,
	onBack,
	onSaved,
	fullscreen = false,
}: {
	assignment: Assignment;
	courseId: string;
	courseLabel: string;
	submission: AssignmentSubmission | null;
	parentSubmission?: AssignmentSubmission | null;
	linkedPractice?: Assignment | null;
	onBack: () => void;
	onSaved: () => void;
	/** Full-screen page: no course sidebar, answer stays beside the AI panel. */
	fullscreen?: boolean;
}) {
	const { user } = useAuth();
	const uiLanguage = useLanguage();
	const t = useT();
	const formative = activityTypeOf(assignment) === 'formative';
	const kind = taskKindForShape(assignment.shape);
	const speakingConfig = kind === 'speaking' ? parseSpeakingConfig(assignment.taskConfig) : null;
	const writingConfig = kind === 'writing' ? parseWritingConfig(assignment.taskConfig) : null;
	const specialized = kind === 'quiz' || kind === 'listening' || kind === 'writing' || kind === 'speaking' || kind === 'reading';
	const name = (user as { name?: string; email?: string } | null)?.name || (user as { email?: string } | null)?.email || '';
	const [step, setStep] = useState(2);
	const [replaceAudio, setReplaceAudio] = useState(false);
	const [pendingClip, setPendingClip] = useState<RecordedClip | null>(null);
	const [nim, setNim] = useState('');
	const [group, setGroup] = useState(submission?.group || '');
	const [content, setContent] = useState(submission?.content || '');
	const [link, setLink] = useState(submission?.link || '');
	const [files, setFiles] = useState<File[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [draftStatus, setDraftStatus] = useState(
		submission?.status === 'draft' ? 'Draf tersimpan di akun Anda' : '',
	);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		try {
			setNim(window.localStorage.getItem(NIM_KEY) || '');
		} catch {
			setNim('');
		}
	}, []);

	const week = assignment.expand?.session?.week;
	const localizedSubmissionStatus = (value: AssignmentSubmission | null | undefined) =>
		value?.status ? t(`worksheet.status.${value.status}`) : t('worksheet.notSubmitted');
	const badges: SheetBadge[] = [
		{ label: courseLabel || 'Mata kuliah' },
		...(week ? [{ label: t('worksheet.week', { week: String(week) }) }] : []),
		{
			label: t(formative ? 'worksheet.formativeExercise' : 'worksheet.formalTask'),
			tone: formative ? 'green' : 'blue',
		},
		...(assignment.shape ? [{ label: SHAPE_LABEL[assignment.shape] }] : []),
		...(speakingConfig?.language ? [{ label: speakingConfig.language }] : []),
		...(deadlineLabel(assignment.deadline) === 'Tanpa batas waktu'
			? []
			: [{ label: deadlineLabel(assignment.deadline) }]),
		...(submission?.linkedFromPublic
			? [{ label: 'Ditautkan dari publik', tone: 'green' as const }]
			: []),
	];
	// attachments now point at file_library (Berkas) records. Each carries the
	// stored binary filename in `file`; there is no link/url kind.
	const materials: SheetMaterial[] = (assignment.expand?.attachments || []).map((file) => ({
		title: file.title || file.file || 'Materi',
		meta: 'Berkas materi',
		href: file.file ? pb.files.getURL(file, file.file) : undefined,
		kind: 'file',
	}));
	const info = [
		{ label: 'Jenis', value: ACTIVITY_TYPE_LABEL[formative ? 'formative' : 'formal'] },
		{ label: 'Format kerja', value: MODE_LABEL[assignment.mode] },
		{ label: 'Format jawaban', value: kind === 'speaking' ? 'Rekaman audio' : specialized ? 'Sesuai jenis tugas' : 'Teks atau file' },
		{ label: 'Batas waktu', value: deadlineLabel(assignment.deadline) },
		{ label: 'Bobot nilai', value: formative ? 'Tidak dinilai' : 'Dinilai dosen' },
		...(submission?.linkedFromPublic
			? [{ label: 'Sumber jawaban', value: 'Ditautkan dari pengumpulan publik (NIM cocok)' }]
			: []),
	];
	const tips = formative
		? [
				'Kerjakan berulang. Riwayat Cek jawaban tetap tersimpan saat Anda mengosongkan latihan.',
				assignment.expand?.parentAssignment
					? `Setelah siap, kumpulkan tugas formal “${assignment.expand.parentAssignment.title}”.`
					: 'Latihan ini tidak mengubah nilai mata kuliah.',
			]
		: [
				'Simpan draf sebelum menutup halaman. Progres tersimpan di akun Anda.',
				'Periksa jawaban sebelum mengumpulkan. Hasil AI bukan nilai.',
				'Setelah terkumpul, hanya dosen yang dapat menerbitkan nilai dan umpan balik.',
			];

	const finallySubmitted = Boolean(
		submission && submission.status !== 'draft' && submission.status !== 'revision',
	);
	const graded = submission?.status === 'graded';
	const resultNode =
		finallySubmitted && !formative ? (
			<>
				<div className="sas-result-head">
					<CheckCircle2 size={18} />
					<strong>Hasil penilaian dosen</strong>
					<span className={`sas-result-status ${graded ? 'graded' : 'pending'}`}>
						{localizedSubmissionStatus(submission)}
					</span>
				</div>
				<div className="sas-result-body">
					{graded && submission?.grade != null && (
						<div className="sas-result-grade">
							<small>Nilai</small>
							<strong>{studentGradeLabel(submission.grade)}</strong>
						</div>
					)}
					{graded && (
						<StudentPublishedFeedback submissionId={submission?.id} feedback={submission?.feedback} />
					)}
					{!graded && (
						<p className="sas-result-pending">
							Pengumpulan Anda tercatat. Nilai dan umpan balik dari dosen akan muncul di sini setelah dinilai.
						</p>
					)}
				</div>
			</>
		) : null;
	const closed =
		!formative &&
		(assignment.status === 'closed' ||
			assignment.status === 'archived' ||
			(isPastDeadline(assignment.deadline) && submission?.status !== 'revision') ||
			finallySubmitted);

	// Consistent student-facing status: a real submission shows its canonical
	// state label; only a closed task with no final submission reads as
	// "Pengumpulan ditutup". Drafts and missing records keep their own labels.
	const hasFinalSubmission = Boolean(
		submission && submission.status && submission.status !== 'draft',
	);
	const sheetStatusLabel = hasFinalSubmission || !closed
		? localizedSubmissionStatus(submission)
		: t('worksheet.closed');
	const sheetStatusTone = hasFinalSubmission
		? submission?.status === 'graded'
			? 'graded'
			: submission?.status === 'revision'
				? 'revision'
				: submission?.status === 'late'
					? 'late'
					: 'submitted'
		: closed
			? 'closed'
			: submission
				? 'draft'
				: 'idle';

	const isAudioName = (filename: string) => /\.(webm|mp4|m4a|mp3|wav|ogg|aac|flac)$/i.test(filename);
	const submissionIdRef = useRef(submission?.id || '');
	const speakingSaveLock = useRef(false);
	const queuedClip = useRef<File | null>(null);
	useEffect(() => {
		if (submission?.id) submissionIdRef.current = submission.id;
	}, [submission?.id]);

	const persistSpeaking = async (final: boolean, silent = false, clip?: File) => {
		if (!speakingConfig) return;
		if (speakingSaveLock.current) {
			if (clip) queuedClip.current = clip;
			return;
		}
		const collected =
			submission &&
			submission.status !== 'draft' &&
			submission.status !== 'revision' &&
			submission.status !== '';
		// Draft saves must not downgrade a collected formal submission or its grade.
		if (collected && !final) return;
		const replacing = Boolean(clip) || replaceAudio;
		const storedAudio = (submission?.files || []).filter((filename) => isAudioName(filename) && !replacing);
		const pendingAudio = clip ? [clip] : files.filter((file) => isAudioName(file.name));
		if (pendingAudio.length === 0 && storedAudio.length === 0 && !link.trim()) {
			if (!silent) setError('Rekam atau unggah audio sebelum menyimpan.');
			return;
		}
		if (link.trim() && !/^https?:\/\//i.test(link.trim())) {
			setError('Tautan harus dimulai dengan http:// atau https://');
			return;
		}
		speakingSaveLock.current = true;
		setBusy(true);
		setError('');
		try {
			const owner = pb.authStore.record?.id || '';
			const existingId = submissionIdRef.current;
			const status: SubmissionStatus = formative
				? 'draft'
				: !final
					? submission?.status === 'revision'
						? 'revision'
						: 'draft'
					: isPastDeadline(assignment.deadline)
						? 'late'
						: 'submitted';
			const fd = new FormData();
			fd.append('content', content.trim());
			fd.append('link', link.trim());
			fd.append('group', group.trim());
			fd.append('status', status);
			if (existingId) {
				for (const filename of submission?.files || []) {
					if (replacing && isAudioName(filename)) continue;
					fd.append('files', filename);
				}
			} else {
				fd.append('assignment', assignment.id);
				fd.append('owner', owner);
			}
			for (const file of clip ? [clip] : files) fd.append('files', file);
			const saved = existingId
				? await uploadSubmission(fd, { id: existingId })
				: await uploadSubmission(fd, {});
			submissionIdRef.current = saved.id;
			if ((status === 'submitted' || status === 'late') && saved.id) void requestEvaluationDraft(saved.id);
			// Wait until the transcript row is queued so the panel polls the new attempt.
			if ((saved.files || []).some(isAudioName)) await requestTranscription(saved.id);
			invalidate('assignment_submissions');
			if (!queuedClip.current) {
				setFiles([]);
				setPendingClip(null);
				setReplaceAudio(false);
				setDirty(false);
			}
			const clock = new Date().toLocaleTimeString('id-ID', {
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'Asia/Jakarta',
			});
			setDraftStatus(
				status === 'draft' ? `Rekaman tersimpan · ${clock}` : 'Pengumpulan tercatat. Menunggu penilaian dosen.',
			);
			onSaved();
		} catch (err) {
			if (!silent) setError(errorMessage(err));
		} finally {
			speakingSaveLock.current = false;
			setBusy(false);
			const next = queuedClip.current;
			queuedClip.current = null;
			if (next && next !== clip) void persistSpeaking(false, true, next);
		}
	};

	const persist = async (status: SubmissionStatus, silent = false) => {
		if (kind === 'speaking') {
			await persistSpeaking(status !== 'draft', silent);
			return;
		}
		if (formative || specialized) return;
		if (!content.trim() && !link.trim() && files.length === 0 && !(submission?.files?.length)) {
			if (!silent) setError('Tambahkan jawaban, tautan, atau berkas sebelum menyimpan.');
			return;
		}
		if (link.trim() && !/^https?:\/\//i.test(link.trim())) {
			setError('Tautan harus dimulai dengan http:// atau https://');
			return;
		}
		setBusy(true);
		setError('');
		try {
			const owner = pb.authStore.record?.id || '';
			let savedId = submission?.id || '';
			if (files.length > 0) {
				const fd = new FormData();
				fd.append('content', content.trim());
				fd.append('link', link.trim());
				fd.append('group', group.trim());
				fd.append('status', status);
				if (submission) {
					for (const name of submission.files || []) fd.append('files', name);
					for (const file of files) fd.append('files', file);
					await uploadSubmission(fd, { id: submission.id });
				} else {
					fd.append('assignment', assignment.id);
					fd.append('owner', owner);
					for (const file of files) fd.append('files', file);
					const created = await uploadSubmission(fd, {});
					savedId = created.id;
				}
			} else if (submission) {
				await pb.collection('assignment_submissions').update(submission.id, {
					content: content.trim(),
					link: link.trim(),
					group: group.trim(),
					status,
				});
			} else {
				const created = await pb.collection('assignment_submissions').create<{ id: string }>({
					assignment: assignment.id,
					owner,
					content: content.trim(),
					link: link.trim(),
					group: group.trim(),
					status,
				});
				savedId = created.id;
			}
			if ((status === 'submitted' || status === 'late') && savedId) {
				void requestEvaluationDraft(savedId);
			}
			invalidate('assignment_submissions');
			setFiles([]);
			setDirty(false);
			const clock = new Date().toLocaleTimeString('id-ID', {
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'Asia/Jakarta',
			});
			setDraftStatus(
				status === 'draft' ? `Draf tersimpan · ${clock}` : 'Pengumpulan tercatat. Menunggu penilaian dosen.',
			);
			onSaved();
		} catch (err) {
			if (!silent) setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const pendingAudioKey = files.map((file) => `${file.name}:${file.size}`).join('|');
	useEffect(() => {
		if (closed || !dirty || ((formative || specialized) && kind !== 'speaking')) return;
		const timer = window.setTimeout(() => {
			void persist('draft', true);
		}, 1500);
		return () => window.clearTimeout(timer);
		// persist identity is stable enough for this autosave; status stays draft.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [content, link, group, dirty, pendingAudioKey, formative, specialized, closed]);

	// Current submission policy: an empty response is not a valid submission.
	// The final "Kumpulkan" action must not even open the confirmation dialog
	// when there is nothing to submit — explain what is required instead.
	// Drafts and formative practice keep their own (unchanged) behavior.
	const emptySubmissionError = (): string => {
		if (kind === 'speaking') {
			const hasStoredAudio = (submission?.files || []).some(
				(filename) => isAudioName(filename) && !replaceAudio,
			);
			const hasPendingAudio =
				files.some((file) => isAudioName(file.name)) || Boolean(pendingClip);
			if (!hasStoredAudio && !hasPendingAudio && !link.trim()) {
				return 'Rekam atau unggah audio, atau lampirkan tautan sebelum mengumpulkan. Pengumpulan kosong tidak diterima.';
			}
			return '';
		}
		if (!content.trim() && !link.trim() && files.length === 0 && !(submission?.files?.length)) {
			return 'Tambahkan jawaban, tautan, atau berkas sebelum mengumpulkan. Pengumpulan kosong tidak diterima.';
		}
		return '';
	};

	const submitFinal = async () => {
		const emptyError = emptySubmissionError();
		if (emptyError) {
			setError(emptyError);
			return;
		}
		setError('');
		if (
			!(await confirmDialog({
				title: 'Kumpulkan tugas?',
				message: 'Kumpulkan versi terakhir ini sebagai pengumpulan resmi? Setelah terkirim, Cek jawaban ditutup dan hasil menunggu penilaian dosen.',
				variant: 'default',
				confirmLabel: 'Kumpulkan',
			}))
		)
			return;
		await persist(isPastDeadline(assignment.deadline) ? 'late' : 'submitted');
	};

	const onClip = (clip: RecordedClip) => {
		setPendingClip(clip);
		setFiles([clip.file]);
		setReplaceAudio(true);
		setDirty(true);
		setError('');
		void persistSpeaking(false, false, clip.file);
	};
	const clearAudio = () => {
		setPendingClip(null);
		setFiles((prev) => prev.filter((file) => !isAudioName(file.name)));
		setReplaceAudio(true);
		setDirty(true);
	};

	const onPrimary = () => {
		if (kind === 'speaking') {
			if (step < 5) {
				setStep(step + 1);
				return;
			}
			if (formative) {
				void persistSpeaking(false);
				return;
			}
			void submitFinal();
			return;
		}
		if (step < 3) {
			setStep(step + 1);
			return;
		}
		if (formative || specialized) {
			setStep(3);
			return;
		}
		if (step === 3) {
			setStep(4);
			return;
		}
		void submitFinal();
	};

	const workspace =
		kind === 'quiz' ? (
			<QuizWorkspace assignment={assignment} submission={submission} onSaved={onSaved} />
		) : kind === 'listening' ? (
			<ListeningWorkspace assignment={assignment} submission={submission} onSaved={onSaved} />
		) : kind === 'writing' ? (
			<WritingWorkspace
				assignment={assignment}
				submission={submission}
				onSaved={onSaved}
				asideChecks={fullscreen}
				reviewing={fullscreen && step === 3}
			/>
		) : kind === 'reading' ? (
			<ReadingWorkspace assignment={assignment} submission={submission} onSaved={onSaved} />
		) : formative ? (
			<FormativePractice
				assignment={assignment}
				courseId={courseId}
				parentSubmission={parentSubmission}
				embedded
			/>
		) : null;

	const speakingClips = speakingConfig
		? [
				...(replaceAudio
					? []
					: (submission?.files || []).filter(isAudioName).map((filename) => ({
							key: `kept-${filename}`,
							name: filename,
							url: submission ? submissionFileUrl(submission, filename) : undefined,
						}))),
				...(pendingClip
					? [
							{
								key: pendingClip.file.name,
								name: pendingClip.file.name,
								url: pendingClip.url,
								pending: true,
							},
						]
					: []),
			]
		: [];
	const speakingTranscript = speakingConfig ? (
		<SpeakingTranscriptSlot>
			{submission ? (
				<TranscriptPanel
					submissionId={submission.id}
					initialStatus={submission.transcriptStatus || ''}
					initialTranscript={submission.transcript || ''}
					initialError={submission.transcriptError || ''}
					initialFile={submission.transcriptFile || ''}
				/>
			) : (
				<p className="spk-transcript-note">
					Simpan draf rekaman. Transkrip otomatis muncul di sini setelah audio diproses.
				</p>
			)}
		</SpeakingTranscriptSlot>
	) : null;
	const speakingNode = speakingConfig ? (
		<SpeakingRecord
			clips={speakingClips}
			onClip={onClip}
			onUpload={(file) => {
				const problem = validateFile(file);
				if (problem) {
					setError(problem);
					return;
				}
				setPendingClip({ file, url: URL.createObjectURL(file), duration: 0 });
				setFiles([file]);
				setReplaceAudio(true);
				setDirty(true);
				void persistSpeaking(false, false, file);
			}}
			onRerecord={clearAudio}
			allowUpload={speakingConfig.allowAudio || speakingConfig.allowVideo}
			allowLink={speakingConfig.allowLink}
			link={link}
			onLink={(value) => {
				setLink(value);
				setDirty(true);
			}}
			closed={closed}
			checklist={fullscreen ? [] : speakingChecklist(speakingConfig)}
			durationMin={speakingConfig.durationMin}
			transcript={speakingTranscript}
		/>
	) : null;

	const parent = assignment.expand?.parentAssignment;
	const parentPath = parent ? studentWorkPath(parent.id) : '';
	const practicePath = linkedPractice ? studentWorkPath(linkedPractice.id) : '';

	return (
		<StudentAnswerSheet
			workspace={fullscreen}
			onBack={onBack}
			backLabel={t('worksheet.backToTasks')}
			badges={badges}
			title={assignment.title}
			courseLabel={courseLabel}
			description={
				speakingConfig
					? speakingLead(speakingConfig.prompt, assignment.title)
					: undefined
			}
			task={!speakingConfig ? assignment.instructions || undefined : undefined}
			requirements={!speakingConfig ? assignment.requirements || undefined : undefined}
			statusLabel={sheetStatusLabel}
			statusTone={sheetStatusTone}
			instructions={
				speakingConfig
					? []
					: instructionLines(
							assignment.requirements || assignment.instructions,
							formative
								? 'Kerjakan latihan, lalu gunakan Cek jawaban untuk umpan balik formatif.'
								: 'Tulis jawaban, simpan draf, periksa, lalu kumpulkan.',
						)
			}
			materials={materials}
			result={resultNode}
			info={info}
			formative={formative}
			step={step}
			onStep={setStep}
			hideSubmitStep={(formative || specialized) && !speakingConfig}
			prepare={
				speakingConfig ? (
					<SpeakingPrepare items={speakingDirections(speakingConfig, { formative })} />
				) : undefined
			}
			draftStatus={draftStatus}
			busy={busy}
			error={error}
			onSaveDraft={
				closed || ((formative || specialized) && !speakingConfig)
					? undefined
					: () => void persist('draft')
			}
			onPrimary={
				closed
					? undefined
					: fullscreen && speakingConfig
						? () => {
								if (formative) void persistSpeaking(false);
								else void submitFinal();
							}
						: onPrimary
			}
			primaryLabel={
				closed
					? t('worksheet.closed')
					: fullscreen && speakingConfig
						? formative
							? t('worksheet.saveExercise')
							: t('worksheet.sendAnswer')
					: speakingConfig
						? step < 5
							? t('worksheet.continue')
							: formative
								? t('worksheet.saveExercise')
								: t('worksheet.sendAnswer')
						: step < 3
							? t('worksheet.continue')
							: formative || specialized
								? t('worksheet.checkAnswer')
								: step === 3
									? t('worksheet.reviewSubmission')
									: t('worksheet.submit')
			}
			primaryDisabled={closed}
			identity={
				<div className="sas-identity">
					<h3>Identitas mahasiswa</h3>
					<div className="sas-id-grid">
						<label>
							Nama lengkap
							<input value={name} readOnly />
						</label>
						<label>
							NIM / nomor mahasiswa
							<input
								value={nim}
								maxLength={40}
								onChange={(e) => {
									setNim(e.target.value);
									try {
										window.localStorage.setItem(NIM_KEY, e.target.value);
									} catch {
										/* ignore */
									}
								}}
								placeholder="Nomor mahasiswa"
							/>
						</label>
					</div>
					{assignment.mode === 'collaborative' && (
						<label className="sas-field">
							Nama kelompok
							<input
								value={group}
								maxLength={200}
								onChange={(e) => {
									setGroup(e.target.value);
									setDirty(true);
								}}
								placeholder="mis. Kelompok 3"
							/>
						</label>
					)}
					{parent && parentPath && (
						<Link to={parentPath} className="sas-path" onClick={onBack}>
							<ArrowRight size={14} /> Tugas formal terkait: {parent.title}
						</Link>
					)}
					{practicePath && (
						<Link to={practicePath} className="sas-path" onClick={onBack}>
							<Repeat size={14} /> Latihan persiapan tersedia
						</Link>
					)}
				</div>
			}
			answer={
				speakingNode ||
				workspace || (
					<div className="sas-answer">
						<h3>Jawaban kamu</h3>
						<AnswerEditor
							value={content}
							onChange={(value) => {
								setContent(value);
								setDirty(true);
							}}
							placeholder="Tulis jawaban kamu di sini..."
						/>
						<label className="sas-field">
							Tautan (opsional)
							<input
								type="url"
								value={link}
								onChange={(e) => {
									setLink(e.target.value);
									setDirty(true);
								}}
								placeholder="https://"
							/>
						</label>
						<AttachmentDrop
							files={[
								...(submission?.files || []).map((name) => ({
									key: `kept-${name}`,
									name,
									href: submission ? submissionFileUrl(submission, name) : undefined,
								})),
								...files.map((file, i) => ({ key: `new-${file.name}-${i}`, name: file.name })),
							]}
							hint="PDF, DOCX, PPTX, gambar, audio, atau video (maks. 10 berkas)"
							onAdd={(list) => {
								if (!list) return;
								const next: File[] = [];
								for (const file of Array.from(list)) {
									const problem = validateFile(file);
									if (problem) {
										setError(problem);
										return;
									}
									next.push(file);
								}
								setFiles((prev) => [...prev, ...next].slice(0, 10));
								setDirty(true);
							}}
							onRemove={(key) => {
								if (key.startsWith('new-')) {
									const name = key.replace(/^new-/, '').replace(/-\d+$/, '');
									setFiles((prev) => prev.filter((file) => file.name !== name));
								}
							}}
						/>
					</div>
				)
			}
			review={speakingNode || (
				<div className="sas-review">
					{specialized || formative ? (
						<p className="sas-disclaimer">
							Panel Cek jawaban ada pada langkah Jawaban. Hasilnya formatif dan bukan nilai resmi.
						</p>
					) : (
						<CheckAnswerPanel
							assignment={assignment}
							channel="enrolled"
							buildResponse={() => ({ kind: 'generic', content, link })}
							onApplyOcrText={(text) => setContent(text)}
						/>
					)}
					<p className="sas-disclaimer">
						<Sparkles size={13} /> Hasil pemeriksaan bersifat formatif dan bukan nilai resmi.
					</p>
				</div>
			)}
			reviewAside={
				speakingConfig ? (
					<div className="spk-ai">
						<CheckAnswerPanel
							assignment={assignment}
							channel="enrolled"
							hideCount
							buildResponse={() => ({ kind: 'speaking', content, link })}
						/>
					</div>
				) : undefined
			}
			tips={tips}
			assistant={finallySubmitted ? undefined : (
				<StudentAssistantPanel
					assignmentId={assignment.id}
					page={kind === 'writing' ? 'writing' : kind === 'speaking' ? 'speaking' : 'assignment'}
					variant={fullscreen ? 'rail' : 'card'}
				/>
			)}
			brief={
				fullscreen
					? buildWorksheetBrief({
							instructions: assignment.instructions,
							requirements: assignment.requirements,
							prompt: writingConfig?.prompt || speakingConfig?.prompt,
							criteria: (writingConfig || speakingConfig)?.criteria.map((item) => item.label),
							checklist: speakingConfig ? speakingChecklist(speakingConfig) : undefined,
							language: uiLanguage,
							structured: writingConfig?.structured || speakingConfig?.structured,
						})
					: null
			}
			languageLabel={writingConfig?.language || speakingConfig?.language || undefined}
			metaPills={[
				...(courseLabel ? [courseLabel] : []),
				...(week ? [t('worksheet.week', { week: String(week) })] : []),
				...(extractCefrLevel(courseLabel) ? [extractCefrLevel(courseLabel) as string] : []),
				t(formative ? 'worksheet.formativeExercise' : 'worksheet.formalTask'),
			]}
		/>
	);
}
