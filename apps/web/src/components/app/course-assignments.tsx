import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
	AlertTriangle,
	CalendarClock,
	CheckCircle2,
	ClipboardCheck,
	ClipboardList,
	Download,
	ExternalLink,
	FileText,
	Link2,
	LoaderCircle,
	Pencil,
	Plus,
	Repeat,
	RotateCcw,
	Save,
	Trash2,
	UploadCloud,
	Users,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import type { CourseResource } from '@/lib/learning';
import { errorMessage } from '@/lib/learning';
import { resourceFileUrl, ACCEPTED_MIME, validateFile } from '@/lib/resources';
import { requestEvaluationDraft } from '@/lib/ai-evaluation';
import { StudentPublishedFeedback } from '@/components/app/student-published-feedback';
import {
	ACTIVITY_TYPE_LABEL,
	activityTypeOf,
	ASSIGNMENT_STATUS_LABEL,
	deadlineHint,
	deadlineLabel,
	isPastDeadline,
	isPracticeOutdated,
	MODE_LABEL,
	parseStages,
	SHAPE_LABEL,
	studentGradeLabel,
	studentWorkPath,
	SUBMISSION_STATUS_LABEL,
	submissionFileUrl,
	uploadSubmission,
	type Assignment,
	type AssignmentSubmission,
	type SubmissionStatus,
	type UploadProgress,
} from '@/lib/assignments';
import { useCourseAssignments, useMySubmissions } from '@/hooks/use-course-assignments';
import { FormativePractice } from '@/components/app/formative-practice';
import { FormativeSpeakingWorkspace } from '@/components/app/task-workspaces/formative-speaking-workspace';
import { QuizWorkspace } from '@/components/app/task-workspaces/quiz-workspace';
import { SpeakingWorkspace } from '@/components/app/task-workspaces/speaking-workspace';
import { ReadingWorkspace } from '@/components/app/task-workspaces/reading-workspace';
import { ListeningWorkspace } from '@/components/app/task-workspaces/listening-workspace';
import { WritingWorkspace } from '@/components/app/task-workspaces/writing-workspace';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';
import { CardCta } from '@/components/card-cta';
import { useT } from '@/lib/i18n';
import { taskKindForShape } from '@/lib/task-types';
import { confirmDialog } from '@/components/confirm-dialog';

type Props = {
	courseId: string;
	/** Route segment appearing in the URL (code slug or legacy id) for course links. */
	routeId?: string;
	/** Faculty owner of this course may create/edit/grade. */
	canEdit: boolean;
	isStudent: boolean;
	courseLabel?: string;
	activityLock?: 'formal' | 'formative';
};

export function CourseAssignments({ courseId, canEdit, isStudent, activityLock }: Props) {
	const t = useT();
	const { assignments, loading, error, reload } = useCourseAssignments(courseId);
	const mySubmissions = useMySubmissions(isStudent ? assignments : []);
	const submissions = mySubmissions.data ?? [];
	const subByAssignment = useMemo(() => {
		const map = new Map<string, AssignmentSubmission>();
		for (const s of submissions) map.set(s.assignment, s);
		return map;
	}, [submissions]);
	const navigate = useNavigate();
	const [actionError, setActionError] = useState('');
	const [busyId, setBusyId] = useState<string | null>(null);
	const [typeFilter, setTypeFilter] = useState<'all' | 'formal' | 'formative'>(activityLock || 'all');
	const location = useLocation();

	// Older student links used #asg- inside the course page. Open the full-screen workspace.
	useEffect(() => {
		if (!isStudent || !location.hash.startsWith('#asg-')) return;
		const id = location.hash.slice(5);
		if (id) navigate(studentWorkPath(id), { replace: true });
	}, [isStudent, location.hash, navigate]);

	// Students see only what the list rule returns (no drafts); their own
	// submissions are loaded once for the whole course — across every
	// student-visible activity, not the filtered view, so a Latihan persiapan
	// card can also show the linked Tugas formal's submission status (Batch 2).
	const visible = useMemo(
		() =>
			(isStudent ? assignments.filter((a) => a.status !== 'draft') : assignments).filter(
				(a) => (activityLock || typeFilter) === 'all' || activityTypeOf(a) === (activityLock || typeFilter),
			),
		[assignments, isStudent, typeFilter, activityLock],
	);
	const remove = async (assignment: Assignment) => {
		if (
			!(await confirmDialog({
				title: 'Hapus tugas',
				message: `Hapus tugas “${assignment.title}” beserta semua pengumpulan mahasiswa? Tindakan ini tidak dapat dibatalkan.`,
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		setBusyId(assignment.id);
		setActionError('');
		try {
			await pb.collection('assignments').delete(assignment.id);
			invalidate('assignments');
			invalidate('assignment_submissions');
			reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId(null);
		}
	};

	if (loading) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={24} className="spin" /> {isStudent ? t('student.assignments.loading') : 'Memuat tugas...'}
			</div>
		);
	}

	return (
		<div className="asg-area">
			<div className="res-head">
				<div>
					<span className="ld-eyebrow">{isStudent ? t('student.assignments.eyebrow') : 'Tugas & Pengumpulan'}</span>
					<h2 className="res-title">{isStudent ? t('student.assignments.title') : 'Kelola tugas'}</h2>
					<p className="res-sub">
						{isStudent
							? t('student.assignments.description')
							: 'Pantau pengumpulan mahasiswa, beri revisi dan nilai. Pembuatan tugas baru terpusat di Tugas.'}
					</p>
				</div>
				{canEdit && (
					<Link
						to={`/app/tugas/buat?course=${courseId}`}
						className="ld-btn-primary"
					>
						<ClipboardList size={17} /> Kelola tugas
					</Link>
				)}
			</div>

			{error && (
				<div className="ld-alert" role="alert">
					{error}{' '}
					<button type="button" onClick={() => reload()}>
									{isStudent ? t('student.common.retry') : 'Coba lagi'}
					</button>
				</div>
			)}
			{actionError && (
				<div className="ld-alert" role="alert">
					{actionError}{' '}
					<button type="button" onClick={() => setActionError('')}>
						Tutup
					</button>
				</div>
			)}

			{assignments.length > 0 && !activityLock && (
				<div className="asg-chips-row" role="group" aria-label={isStudent ? t('student.assignments.filterTypes') : 'Saring jenis aktivitas'}>
					<span>{isStudent ? t('student.assignments.type') : 'Jenis'}</span>
					<div className="eval-chips">
						{(
							[
								['all', isStudent ? t('student.assignments.all') : 'Semua', null],
								['formal', t('worksheet.formalTask'), ClipboardCheck],
								['formative', t('worksheet.formativeExercise'), Repeat],
							] as const
						).map(([value, label, Icon]) => (
							<button
								key={value}
								type="button"
								className={typeFilter === value ? 'active' : ''}
								onClick={() => setTypeFilter(value)}
							>
								{Icon ? <Icon size={12} /> : null}
								{label}
							</button>
						))}
					</div>
				</div>
			)}

			{visible.length === 0 ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<ClipboardList size={26} strokeWidth={1.4} />
					</div>
					<h3>{isStudent ? t('student.assignments.emptyTitle') : 'Belum ada tugas.'}</h3>
					<p>
						{isStudent
							? typeFilter === 'formative'
								? t('student.assignments.noFormative')
								: typeFilter === 'formal'
									? t('student.assignments.noFormal')
									: t('student.assignments.noTasks')
							: 'Buat tugas pertama — individual maupun kolaboratif — dengan tahapan, batas waktu, dan lampiran materi.'}
					</p>
					{canEdit && (
						<Link
							to={`/app/tugas/buat?course=${courseId}`}
							className="ld-btn-primary"
						>
							<Plus size={17} /> Buat tugas pertama di Tugas
						</Link>
					)}
				</div>
			) : (
				<div className="asg-list">
					{visible.map((assignment) =>
						isStudent ? (
							<StudentAssignmentLaunch
								key={assignment.id}
								assignment={assignment}
								submission={subByAssignment.get(assignment.id) ?? null}
								href={studentWorkPath(assignment.id)}
							/>
						) : (
							<LecturerAssignmentCard
								key={assignment.id}
								assignment={assignment}
								busy={busyId === assignment.id}
								onEdit={() => navigate(`/app/tugas/buat?edit=${assignment.id}`)}
								onRemove={() => void remove(assignment)}
								onChanged={() => reload()}
							/>
						),
					)}
				</div>
			)}

		</div>
	);
}

// ── Shared pieces ─────────────────────────────────────────────

function DeadlineTag({ deadline }: { deadline: string }) {
	const past = isPastDeadline(deadline);
	const hint = deadlineHint(deadline);
	return (
		<span className={`asg-deadline${past ? ' overdue' : ''}`}>
			<CalendarClock size={13} />
			{deadlineLabel(deadline)}
			{hint && <em>· {hint}</em>}
		</span>
	);
}

function StageChips({ assignment }: { assignment: Assignment }) {
	const stages = parseStages(assignment.stages);
	if (stages.length === 0) return null;
	return (
		<div className="asg-stages">
			{stages.map((s, i) => (
				<span key={i} className="asg-stage">
					<small>{i + 1}</small>
					{s.label}
				</span>
			))}
		</div>
	);
}

function AttachmentLinks({ items }: { items?: CourseResource[] }) {
	if (!items || items.length === 0) return null;
	return (
		<ul className="asg-attachments">
			{items.map((r) => (
				<li key={r.id}>
					{r.kind === 'link' ? <Link2 size={13} /> : <FileText size={13} />}
					{r.kind === 'link' ? (
						<a href={r.url} target="_blank" rel="noreferrer">
							{r.title} <ExternalLink size={11} />
						</a>
					) : (
						<a href={resourceFileUrl(r)} target="_blank" rel="noreferrer" download>
							{r.title} <Download size={11} />
						</a>
					)}
				</li>
			))}
		</ul>
	);
}

function MetaChips({ assignment }: { assignment: Assignment }) {
	const session = assignment.expand?.session;
	const subCpmk = assignment.expand?.subCpmk;
	return (
		<div className="asg-tags">
			<span className="asg-tag mode">
				{assignment.mode === 'collaborative' ? <Users size={11} /> : null}
				{MODE_LABEL[assignment.mode]}
			</span>
			<span className={`asg-tag status-${assignment.status}`}>
				{ASSIGNMENT_STATUS_LABEL[assignment.status]}
			</span>
			{activityTypeOf(assignment) === 'formative' && (
				<span className="asg-tag formative">
					<Repeat size={11} /> {ACTIVITY_TYPE_LABEL.formative} · tanpa nilai
				</span>
			)}
			{assignment.shape && (
				<span className="asg-tag">{SHAPE_LABEL[assignment.shape] || assignment.shape}</span>
			)}
			{activityTypeOf(assignment) === 'formative' ? (assignment.expand?.parentAssignment ? (
				<span className="asg-tag formative">
					<Repeat size={11} /> Latihan persiapan untuk “{assignment.expand.parentAssignment.title}”
				</span>
			) : null) : null}
			{activityTypeOf(assignment) === 'formative' &&
			assignment.expand?.parentAssignment &&
			isPracticeOutdated(assignment, assignment.expand.parentAssignment) ? (
				<span className="asg-tag sync-warn">
					<AlertTriangle size={11} /> Tugas formal berubah — periksa latihan
				</span>
			) : null}
			{session && (
				<span className="asg-tag">
					Minggu {String(session.week || '—').padStart(2, '0')} · {session.title}
				</span>
			)}
			{subCpmk && <span className="asg-tag">Sub-CPMK {subCpmk.code || subCpmk.description}</span>}
			{activityTypeOf(assignment) === 'formal' && assignment.allowRevision && (
				<span className="asg-tag">Revisi diizinkan</span>
			)}
		</div>
	);
}

// ── Lecturer card ─────────────────────────────────────────────

function LecturerAssignmentCard({
	assignment,
	busy,
	onEdit,
	onRemove,
	onChanged,
}: {
	assignment: Assignment;
	busy: boolean;
	onEdit: () => void;
	onRemove: () => void;
	onChanged: () => void;
}) {
	const [notice, setNotice] = useState('');
	const [pubBusy, setPubBusy] = useState(false);
	const published = assignment.status === 'published';

	const togglePublish = async () => {
		const next = published ? 'draft' : 'published';
		const ok = await confirmDialog({
			title: next === 'published' ? 'Terbitkan tugas' : 'Kembalikan ke draf',
			message:
				next === 'published'
					? 'Terbitkan tugas ini? Mahasiswa akan dapat melihat dan mengumpulkannya.'
					: 'Kembalikan tugas ke draf? Mahasiswa tidak lagi melihat tugas ini.',
			variant: 'default',
			confirmLabel: next === 'published' ? 'Terbitkan' : 'Kembalikan',
		});
		if (!ok) return;
		setPubBusy(true);
		setNotice('');
		try {
			await pb.collection('assignments').update(assignment.id, { status: next });
			invalidate('assignments');
			setNotice(next === 'published' ? 'Tugas diterbitkan.' : 'Tugas dikembalikan ke draf.');
			onChanged();
		} catch (err) {
			setNotice(errorMessage(err));
		} finally {
			setPubBusy(false);
		}
	};

	return (
		<article
			className={`asg-card${assignment.status === 'draft' ? ' draft' : ''}${
				activityTypeOf(assignment) === 'formative' ? ' formative' : ''
			}`}
		>
			<div className="asg-card-top">
				<div className="asg-card-title-wrap">
					<h3>{assignment.title}</h3>
					{activityTypeOf(assignment) === 'formative' ? (
						<span className="asg-tag formative">
							<Repeat size={11} /> Latihan berulang · tanpa nilai
						</span>
					) : (
						<DeadlineTag deadline={assignment.deadline} />
					)}
				</div>
				<div className="asg-actions">
					<button
						type="button"
						className={`ld-outline-action sm${published ? ' asg-published' : ''}`}
						onClick={() => void togglePublish()}
						disabled={busy || pubBusy}
						title={published ? 'Sudah diterbitkan — klik untuk kembalikan ke draf' : 'Terbitkan tugas'}
					>
						{pubBusy ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />}
						{published ? 'Diterbitkan' : 'Terbitkan'}
					</button>
					<Link
						to={`/app/tugas/${assignment.id}`}
						className="ld-icon-action sm"
						aria-label={`Buka halaman tugas ${assignment.title}`}
						title="Buka halaman tugas"
					>
						<ClipboardList size={15} />
					</Link>
					<button
						type="button"
						className="ld-icon-action sm"
						aria-label={`Edit ${assignment.title}`}
						title="Edit tugas"
						onClick={onEdit}
						disabled={busy}
					>
						<Pencil size={15} />
					</button>
					<button
						type="button"
						className="ld-icon-action sm danger"
						aria-label={`Hapus ${assignment.title}`}
						title="Hapus tugas"
						onClick={onRemove}
						disabled={busy}
					>
						{busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
					</button>
				</div>
			</div>
			{notice && (
				<p className="asg-header-notice" role="status">
					{notice}
				</p>
			)}
			<MetaChips assignment={assignment} />
			{assignment.instructions && (
				<p className="asg-instructions">{assignment.instructions}</p>
			)}
			{assignment.requirements && (
				<p className="asg-requirements">
					<small>Ketentuan pengumpulan</small>
					{assignment.requirements}
				</p>
			)}
			{assignment.mode === 'collaborative' && assignment.groupInfo && (
				<p className="asg-requirements">
					<small>Ketentuan kelompok</small>
					{assignment.groupInfo}
				</p>
			)}
			<StageChips assignment={assignment} />
			<AttachmentLinks items={assignment.expand?.attachments} />
		</article>
	);
}

// ── Student launch button ────────────────────────────────────

/**
 * Compact launch row for a student's assignment in the course Tugas/Latihan
 * list. Shows "Kerjakan" while the work is still open (no submission, draft,
 * or revision requested) and "Lihat hasil" once a final submission exists —
 * the full-screen workspace then displays the lecturer's evaluation, grade,
 * and feedback. A small status line summarizes the current submission state.
 */
function StudentAssignmentLaunch({
	assignment,
	submission,
	href,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission | null;
	href: string;
}) {
	const t = useT();
	const formative = activityTypeOf(assignment) === 'formative';
	const status = (submission?.status || '') as SubmissionStatus | '';
	const finallySubmitted = Boolean(
		submission && status !== 'draft' && status !== 'revision' && status !== '',
	);
	const graded = status === 'graded';
	const revision = status === 'revision';
	const label = finallySubmitted ? t('sd.cta.feedback') : revision ? t('sd.cta.revision') : t('student.assignments.doTask');
	const statusText = finallySubmitted
		? graded
			? submission?.grade != null
				? t('student.assignments.gradedWithScore', { grade: studentGradeLabel(submission.grade) })
				: t('worksheet.status.graded')
			: t(`worksheet.status.${status === 'late' ? 'late' : 'submitted'}`)
		: revision
			? t('worksheet.status.revision')
			: submission
				? t('worksheet.status.draft')
				: '';
	return (
		<article className={`sas-launch${finallySubmitted ? ' done' : ''}`}>
			<span>
				<small>
					{formative ? t('worksheet.formativeExercise') : t('worksheet.formalTask')}
					{assignment.shape ? ` · ${t(`sd.shape.${assignment.shape}`)}` : ''}
				</small>
				<strong>{assignment.title}</strong>
				{statusText && <span className="sas-status">{statusText}</span>}
			</span>
			<CardCta to={href} label={label} variant={finallySubmitted ? 'ghost' : 'primary'} />
		</article>
	);
}

// ── Student card ──────────────────────────────────────────────

export function StudentAssignmentCard({
	assignment,
	courseId,
	mySubmission,
	parentSubmission,
	linkedPractice,
	onSaved,
}: {
	assignment: Assignment;
	courseId: string;
	mySubmission: AssignmentSubmission | null;
	/** Batch 2: the student's own submission on the linked parent formal task. */
	parentSubmission?: AssignmentSubmission | null;
	/** Batch 2: a published Latihan persiapan linked to this formal task. */
	linkedPractice?: Assignment | null;
	onSaved: () => void;
}) {
	const formative = activityTypeOf(assignment) === 'formative';
	const past = isPastDeadline(assignment.deadline);
	const closed = assignment.status === 'closed' || assignment.status === 'archived';
	const revision = mySubmission?.status === 'revision';
	const canSubmit = assignment.status === 'published' && (!past || revision);
	const practicePath = linkedPractice ? studentWorkPath(linkedPractice.id) : '';

	// Latihan formatif (Phase 3): repeatable practice with Cek jawaban only —
	// no deadline pressure, no final submission, no grade display. Batch 2
	// adds the visible path to the linked Tugas formal and its separate
	// submission status.
	if (formative) {
		return (
			<article id={`asg-${assignment.id}`} className="asg-card formative">
				<div className="asg-card-top">
					<div className="asg-card-title-wrap">
						<h3>{assignment.title}</h3>
						<span className="asg-tag formative">
							<Repeat size={11} /> Latihan berulang · tanpa nilai
						</span>
					</div>
				</div>
				<MetaChips assignment={assignment} />
				{assignment.instructions && (
					<p className="asg-instructions">{assignment.instructions}</p>
				)}
				{assignment.mode === 'collaborative' && assignment.groupInfo && (
					<p className="asg-requirements">
						<small>Ketentuan kelompok</small>
						{assignment.groupInfo}
					</p>
				)}
				<StageChips assignment={assignment} />
				<AttachmentLinks items={assignment.expand?.attachments} />
				{taskKindForShape(assignment.shape) === 'speaking' ? (
					<FormativeSpeakingWorkspace
						assignment={assignment}
						courseId={courseId}
						parentSubmission={parentSubmission}
					/>
				) : (
					<FormativePractice
						assignment={assignment}
						courseId={courseId}
						parentSubmission={parentSubmission}
					/>
				)}
			</article>
		);
	}

	return (
		<article id={`asg-${assignment.id}`} className={`asg-card${past ? ' past' : ''}`}>
			<div className="asg-card-top">
				<div className="asg-card-title-wrap">
					<h3>{assignment.title}</h3>
					<DeadlineTag deadline={assignment.deadline} />
				</div>
			</div>
			<MetaChips assignment={assignment} />
			{linkedPractice && practicePath && (
				<Link to={practicePath} className="asg-practice-cta">
					<Repeat size={13} />
					<span>
						<strong>Latihan persiapan tersedia.</strong> Kerjakan berulang dengan Cek jawaban
						sebelum mengumpulkan tugas formal ini.
					</span>
					<ClipboardList size={14} />
				</Link>
			)}
			{revision && (
				<p className="asg-revision-note">
					<RotateCcw size={13} />
					<span>
						<strong>Revisi diminta dosen.</strong> Perbarui pekerjaan Anda di bawah, lalu kumpulkan
						ulang — pengumpulan ulang revisi tetap terbuka meski batas waktu sudah terlewat.
					</span>
				</p>
			)}
			{assignment.instructions && <p className="asg-instructions">{assignment.instructions}</p>}
			{assignment.requirements && (
				<p className="asg-requirements">
					<small>Ketentuan pengumpulan</small>
					{assignment.requirements}
				</p>
			)}
			{assignment.mode === 'collaborative' && assignment.groupInfo && (
				<p className="asg-requirements">
					<small>Ketentuan kelompok</small>
					{assignment.groupInfo}
				</p>
			)}
			<StageChips assignment={assignment} />
			<AttachmentLinks items={assignment.expand?.attachments} />

			{mySubmission && (
				<div className="asg-my-submission">
					<div className="asg-tags">
						<span className={`asg-tag sub-${mySubmission.status || 'submitted'}`}>
							{SUBMISSION_STATUS_LABEL[(mySubmission.status || 'submitted') as SubmissionStatus]}
						</span>
						{mySubmission.group && <span className="asg-tag">Kelompok {mySubmission.group}</span>}
						{mySubmission.grade != null && (
							<span className="asg-tag grade">Nilai {studentGradeLabel(mySubmission.grade)}</span>
						)}
					</div>
					{mySubmission.files && mySubmission.files.length > 0 && (
						<div className="asg-sub-files">
							{mySubmission.files.map((f) => (
								<a
									key={f}
									className="asg-sub-file"
									href={submissionFileUrl(mySubmission, f)}
									target="_blank"
									rel="noreferrer"
									download
								>
									<Download size={12} /> {f}
								</a>
							))}
						</div>
					)}
					{mySubmission.link && (
						<a className="asg-sub-file" href={mySubmission.link} target="_blank" rel="noreferrer">
							<ExternalLink size={12} /> {mySubmission.link}
						</a>
					)}
					{(mySubmission.status === 'graded' || mySubmission.feedback) && (
						<StudentPublishedFeedback
							submissionId={mySubmission.id}
							feedback={mySubmission.feedback}
						/>
					)}
				</div>
			)}

			{(() => {
				const kind = taskKindForShape(assignment.shape);
				if (kind === 'quiz')
					return (
						<QuizWorkspace assignment={assignment} submission={mySubmission} onSaved={onSaved} />
					);
				if (kind === 'listening')
					return (
						<ListeningWorkspace assignment={assignment} submission={mySubmission} onSaved={onSaved} />
					);
				if (kind === 'writing')
					return (
						<WritingWorkspace assignment={assignment} submission={mySubmission} onSaved={onSaved} />
					);
				if (kind === 'speaking')
					return (
						<SpeakingWorkspace assignment={assignment} submission={mySubmission} onSaved={onSaved} />
					);
				if (kind === 'reading')
					return (
						<ReadingWorkspace assignment={assignment} submission={mySubmission} onSaved={onSaved} />
					);
				if (closed)
					return (
						<p className="asg-empty-line">
							Pengumpulan tugas ini sudah ditutup dosen.
							{mySubmission ? ' Pengumpulan Anda tersimpan.' : ''}
						</p>
					);
				if (!canSubmit)
					return (
						<p className="asg-empty-line overdue">
							<AlertTriangle size={13} /> Batas waktu pengumpulan sudah terlewat. Pengumpulan tidak
							dapat diubah.
						</p>
					);
				return <SubmitForm assignment={assignment} submission={mySubmission} onSaved={onSaved} />;
			})()}
		</article>
	);
}

function SubmitForm({
	assignment,
	submission,
	onSaved,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission | null;
	onSaved: () => void;
}) {
	const editing = Boolean(submission);
	// Draft saving and Cek jawaban are only for work not yet finally collected.
	const finallySubmitted = Boolean(
		submission && submission.status !== 'draft' && submission.status !== 'revision',
	);
	const [content, setContent] = useState(submission?.content || '');
	const [link, setLink] = useState(submission?.link || '');
	const [group, setGroup] = useState(submission?.group || '');
	const [files, setFiles] = useState<File[]>([]);
	const [fileError, setFileError] = useState('');
	const [progress, setProgress] = useState<UploadProgress | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const onFilesChange = (list: FileList | null) => {
		setFileError('');
		if (!list || list.length === 0) return;
		const next: File[] = [];
		for (const f of Array.from(list)) {
			const vErr = validateFile(f);
			if (vErr) {
				setFileError(vErr);
				return;
			}
			next.push(f);
		}
		setFiles((prev) => [...prev, ...next].slice(0, 10));
	};

	const validate = (draft: boolean) => {
		setError('');
		setFileError('');
		if (files.length === 0 && !link.trim() && !content.trim()) {
			setError(
				draft
					? 'Tambahkan berkas, tautan, atau catatan sebelum menyimpan draf.'
					: 'Tambahkan berkas, tautan, atau catatan sebelum mengumpulkan.',
			);
			return false;
		}
		if (link.trim() && !/^https?:\/\//i.test(link.trim())) {
			setError('Tautan harus dimulai dengan http:// atau https://');
			return false;
		}
		return true;
	};

	const persist = async (status: SubmissionStatus) => {
		setBusy(true);
		try {
			let submittedId = '';
			if (files.length > 0) {
				// XHR upload with real progress. On update, existing filenames are
				// re-submitted so PocketBase keeps them alongside the new files.
				const fd = new FormData();
				fd.append('content', content.trim());
				fd.append('link', link.trim());
				fd.append('group', group.trim());
				fd.append('status', status);
				if (editing) {
					for (const f of submission?.files || []) fd.append('files', f);
					for (const f of files) fd.append('files', f);
					const record = await uploadSubmission(fd, { id: submission!.id }, setProgress);
					submittedId = record.id;
				} else {
					fd.append('assignment', assignment.id);
					fd.append('owner', pb.authStore.record?.id || '');
					for (const f of files) fd.append('files', f);
					const record = await uploadSubmission(fd, {}, setProgress);
					submittedId = record.id;
				}
			} else if (editing) {
				await pb.collection('assignment_submissions').update(submission!.id, {
					content: content.trim(),
					link: link.trim(),
					group: group.trim(),
					status,
				});
				submittedId = submission!.id;
			} else {
				const record = await pb.collection('assignment_submissions').create<{ id: string }>({
					assignment: assignment.id,
					owner: pb.authStore.record?.id,
					content: content.trim(),
					link: link.trim(),
					group: group.trim(),
					status,
				});
				submittedId = record.id;
			}
			// Background AI evaluation draft for the lecturer (formal tasks only —
			// the endpoint skips Latihan formatif). The submission is already
			// stored, so a failed analysis never affects it.
			if ((status === 'submitted' || status === 'late') && submittedId) {
				void requestEvaluationDraft(submittedId);
			}
			invalidate('assignment_submissions');
			setFiles([]);
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
			setProgress(null);
		}
	};

	const save = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!validate(false)) return;
		if (
			!(await confirmDialog({
				title: 'Kumpulkan tugas?',
				message: 'Kumpulkan versi terakhir ini sebagai pengumpulan resmi? Setelah terkirim, Cek jawaban ditutup dan hasil menunggu penilaian dosen.',
				variant: 'default',
				confirmLabel: 'Kumpulkan',
			}))
		) {
			return;
		}
		await persist(isPastDeadline(assignment.deadline) ? 'late' : 'submitted');
	};

	const saveDraft = async () => {
		if (!validate(true)) return;
		await persist('draft');
	};

	return (
		<form onSubmit={save} className="asg-form">
			<span className="asg-form-head">
				{editing ? 'Perbarui pengumpulan Anda' : 'Kumpulkan pekerjaan Anda'}
			</span>
			{assignment.mode === 'collaborative' && (
				<label>
					NAMA KELOMPOK
					<input
						maxLength={200}
						value={group}
						onChange={(e) => setGroup(e.target.value)}
						placeholder="mis. Kelompok 3"
					/>
				</label>
			)}
			<label>
				CATATAN (OPSIONAL)
				<textarea
					rows={2}
					maxLength={10000}
					value={content}
					onChange={(e) => setContent(e.target.value)}
					placeholder="Catatan untuk dosen, ringkasan pekerjaan, atau pembagian tugas kelompok..."
				/>
			</label>
			<label>
				TAUTAN (OPSIONAL)
				<input
					type="url"
					value={link}
					onChange={(e) => setLink(e.target.value)}
					placeholder="https://... (mis. tautan video presentasi)"
				/>
			</label>
			<div className="res-upload">
				<input
					ref={inputRef}
					type="file"
					className="pdf-file-input"
					multiple
					accept={ACCEPTED_MIME}
					onChange={(e) => {
						onFilesChange(e.target.files);
						e.target.value = '';
					}}
				/>
				<button
					type="button"
					className="pdf-dropzone"
					onClick={() => inputRef.current?.click()}
				>
					<span className="pdf-dropzone-icon">
						<UploadCloud size={26} />
					</span>
					<strong>
						{files.length > 0
							? `${files.length} berkas dipilih`
							: 'Pilih berkas (opsional)'}
					</strong>
					<span className="pdf-dropzone-hint">
						PDF, PPTX, DOCX, XLSX, gambar, audio, atau video · maks 10 berkas @ 100 MB
					</span>
				</button>
				{files.length > 0 && (
					<div className="asg-file-chips">
						{files.map((f, i) => (
							<span key={`${f.name}-${i}`} className="asg-file-chip">
								{f.name}
								<button
									type="button"
									aria-label={`Hapus ${f.name}`}
									onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
								>
									<X size={12} />
								</button>
							</span>
						))}
					</div>
				)}
				{editing && (submission?.files?.length || 0) > 0 && (
					<p className="asg-file-note">
						Berkas lama tetap tersimpan; berkas baru akan ditambahkan.
					</p>
				)}
				{fileError && <p className="form-error" role="alert">{fileError}</p>}
				{progress && (
					<div className="res-progress" aria-live="polite">
						<div className="res-progress-bar">
							<span style={{ width: `${progress.percent}%` }} />
						</div>
						<em>Mengunggah {progress.percent}%</em>
					</div>
				)}
			</div>
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			<div className="asg-form-actions">
				{!finallySubmitted && (
					<button
						type="button"
						className="ld-outline-action sm"
						onClick={() => void saveDraft()}
						disabled={busy}
					>
						{busy ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Simpan draf
					</button>
				)}
				<button type="submit" className="ld-btn-primary" disabled={busy}>
					{busy ? (
						<>
							<LoaderCircle size={16} className="spin" /> Mengirim...
						</>
					) : editing ? (
						'Perbarui pengumpulan'
					) : (
						'Kumpulkan'
					)}
				</button>
			</div>
			{assignment.status === 'published' && !finallySubmitted && (
				<CheckAnswerPanel
					assignment={assignment}
					channel="enrolled"
					buildResponse={() => ({ kind: 'generic', content, link })}
					onApplyOcrText={(t) => setContent(t)}
				/>
			)}
		</form>
	);
}
