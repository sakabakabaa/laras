import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
	AlertCircle,
	AlertTriangle,
	ArrowDownUp,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ClipboardCheck,
	Clock,
	Download,
	ExternalLink,
	Eye,
	FileAudio,
	FileInput,
	FileText,
	Inbox,
	ListFilter,
	LoaderCircle,
	Pencil,
	Repeat,
	RotateCcw,
	Search,
} from 'lucide-react';
import { OverflowMenu } from '@/components/app/overflow-menu';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import type { Course } from '@/lib/learning';
import { useCachedQuery } from '@/hooks/use-cached-query';
import {
	ACTIVITY_TYPE_LABEL,
	ASSIGNMENT_STATUS_LABEL,
	activityTypeOf,
	deadlineLabel,
	isPastDeadline,
	isPracticeOutdated,
	MODE_LABEL,
	practiceSyncState,
	setPracticeIntent,
	SHAPE_LABEL,
	lecturerGradeLabel,
	submissionFileUrl,
	SUBMISSION_STATUS_LABEL,
	type Assignment,
	type AssignmentSubmission,
	type SubmissionStatus,
} from '@/lib/assignments';
import { checkMaxOf, enrolledIdentityKey } from '@/lib/check-types';
import { SubmissionTaskReview } from '@/components/app/submission-task-review';
import {
	FormativeReviewAnswer,
	FormativeReviewEvaluation,
	FormativeReviewPanel,
	FormativeReviewProvider,
} from '@/components/app/formative-evaluation-review';
import { TranscriptPanel } from '@/components/app/task-workspaces/transcript-panel';
import type { TranscriptStatus } from '@/lib/transcription';
import { extractCefrLevel } from '@/lib/cefr-level';
import { taskKindForShape } from '@/lib/task-types';
import {
	AiEvaluationAnswer,
	AiEvaluationPanel,
	AiEvaluationReviewProvider,
	EvaluationStatusBadge,
} from '@/components/app/ai-evaluation-review';
import { CheckFeedbackBody, CheckEvidence } from '@/components/app/task-workspaces/check-feedback-body';
import { AssignmentForm } from '@/components/app/assignment-form';
import { BulkPaperInput } from '@/components/app/bulk-paper-input';

type PublicRow = {
	id: string;
	assignment: string;
	participantName: string;
	nim: string;
	groupName: string;
	members: string;
	identityKey: string;
	content: string;
	files: string[];
	link: string;
	status: string;
	grade: number | null;
	feedback: string;
	autoScore: number | null;
	created: string;
	linkedUser?: string;
	linkedSubmission?: string;
};

type AttemptRow = {
	id: string;
	identityKey: string;
	attempt: number;
	level?: number;
	feedback: string;
	area: string;
	evidence: string;
	focus: string;
	extracted?: unknown;
	created: string;
};

type Channel = 'enrolled' | 'public';

type Participant = {
	key: string;
	channel: Channel;
	name: string;
	detail: string;
	status: string;
	grade: number | null;
	feedback: string;
	content: string;
	link: string;
	files: { name: string; url: string }[];
	created: string;
	autoScore: number | null;
	identityKey: string;
	enrolled?: AssignmentSubmission;
	publicId?: string;
	linked?: boolean;
	transcript: string;
	transcriptStatus: TranscriptStatus;
	transcriptError: string;
	transcriptFile: string;
	transcriptConfidence: unknown;
};

const LEVEL: Record<number, string> = {
	1: 'Tingkat 1 · Pertanyaan refleksi',
	2: 'Tingkat 2 · Petunjuk konsep',
	3: 'Tingkat 3 · Petunjuk terarah',
};

const AUDIO_RE = /\.(webm|mp4|m4a|mp3|wav|ogg|aac|flac)$/i;

function stamp(iso: string) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function ocrOf(extracted: unknown) {
	if (!extracted || typeof extracted !== 'object') return null;
	const ocr = (extracted as { ocr?: unknown }).ocr;
	if (!ocr || typeof ocr !== 'object') return null;
	const o = ocr as Record<string, unknown>;
	const image = o.image && typeof o.image === 'object' ? (o.image as Record<string, unknown>) : null;
	return {
		rawText: typeof o.rawText === 'string' ? o.rawText : '',
		reviewedText: typeof o.reviewedText === 'string' ? o.reviewedText : '',
		normalizedText: typeof o.normalizedText === 'string' ? o.normalizedText : '',
		imageName: typeof image?.name === 'string' ? image.name : '',
		imageUrl: typeof image?.url === 'string' ? image.url : '',
	};
}

function publicFileUrl(row: PublicRow, name: string) {
	return pb.files.getURL(row, name);
}

/**
 * Focused lecturer evaluation for one assignment: context, counts, participant
 * list, answer + attachments, formative Cek jawaban history, and the official
 * grade. Enrolled and public rows stay labeled and separate.
 */
export function EvaluationWorkspace({ assignmentId }: { assignmentId: string }) {
	const [assignment, setAssignment] = useState<Assignment | null>(null);
	const [course, setCourse] = useState<Course | null>(null);
	const [subs, setSubs] = useState<AssignmentSubmission[]>([]);
	const [pubs, setPubs] = useState<PublicRow[]>([]);
	const [attempts, setAttempts] = useState<AttemptRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [query, setQuery] = useState('');
	const [filters, setFilters] = useState<string[]>([]);
	const [filterOpen, setFilterOpen] = useState(false);
	const [sort, setSort] = useState<'time' | 'name' | 'grade'>('time');
	const [selected, setSelected] = useState<string | null>(null);
	const [tab, setTab] = useState<'answer' | 'history' | 'notes'>('answer');
	const [showInstructions, setShowInstructions] = useState(false);
	// Enrolled submission owners' display identity (name + NIM), resolved
	// server-side because the `users` viewRule blocks expanding other students'
	// owner records in the browser. Keyed by submission id.
	const [ownerMap, setOwnerMap] = useState<Record<string, { name: string; nim: string; email: string }>>({});
	// Practices linked to this formal task (parentAssignment = this id).
	// Batch 4: editing an existing (linked) practice from this workspace,
	// including the explicit review-and-re-copy flow for outdated practices.
	const [editOpen, setEditOpen] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);
	const linkedPractices = useCachedQuery<Assignment[]>(
		assignmentId ? `assignments:practice-of=${assignmentId}` : null,
		() =>
			pb.collection('assignments').getFullList<Assignment>({
				filter: pb.filter('parentAssignment = {:id}', { id: assignmentId }),
				sort: 'created',
			}),
	);

	const reload = async () => {
		const [assignmentRow, subRows, pubRows, attemptRows] = await Promise.all([
			pb.collection('assignments').getOne<Assignment>(assignmentId, {
				expand: 'session,subCpmk,parentAssignment',
			}),
			pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({
				filter: pb.filter('assignment = {:id}', { id: assignmentId }),
				expand: 'owner',
				sort: '-created',
			}),
			pb.collection('public_submissions').getFullList<PublicRow>({
				filter: pb.filter('assignment = {:id}', { id: assignmentId }),
				sort: '-created',
			}),
			pb.collection('check_attempts').getFullList<AttemptRow>({
				filter: pb.filter('assignment = {:id}', { id: assignmentId }),
				sort: 'created',
			}),
		]);
		const courseRow = await pb.collection('courses').getOne<Course>(assignmentRow.course);
		setAssignment(assignmentRow);
		setCourse(courseRow);
		setSubs(subRows);
		setPubs(pubRows);
		setAttempts(attemptRows);
		// Resolve enrolled owners' display identity (name + NIM) server-side.
		// The `users` viewRule blocks expanding other students' owner records
		// in the browser, so without this the list fell back to "Mahasiswa".
		try {
			const response = await fetch('/api/evaluation-participants', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ assignmentId }),
			});
			if (response.ok) {
				const body = (await response.json()) as {
					identities?: Record<string, { name: string; nim: string; email: string }>;
				};
				if (body.identities) setOwnerMap(body.identities);
			}
		} catch {
			/* non-fatal — display falls back to expand/email */
		}
	};

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError('');
		void reload()
			.catch(() => {
				if (alive) setError('Tugas tidak ditemukan atau tidak dapat dibuka.');
			})
			.finally(() => {
				if (alive) setLoading(false);
			});
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [assignmentId]);

	useEffect(() => {
		if (!filterOpen) return;
		const onDown = (event: PointerEvent) => {
			const root = document.getElementById('evx-filter-root');
			if (root && !root.contains(event.target as Node)) setFilterOpen(false);
		};
		document.addEventListener('pointerdown', onDown);
		return () => document.removeEventListener('pointerdown', onDown);
	}, [filterOpen]);

	const navRef = useRef<{ filtered: Participant[]; activeKey: string | null; formative: boolean }>({
		filtered: [],
		activeKey: null,
		formative: false,
	});
	// Keyboard grading efficiency: J/K or Left/Right move between submissions,
	// G focuses the final-score field. Ignored while typing in any form control.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const { filtered: list, activeKey, formative: isFormative } = navRef.current;
			if (isFormative) return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName;
			if (
				tag === 'INPUT' ||
				tag === 'TEXTAREA' ||
				tag === 'SELECT' ||
				tag === 'AUDIO' ||
				tag === 'VIDEO' ||
				target?.isContentEditable ||
				target?.closest('.evx-script')
			)
				return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const key = event.key.toLowerCase();
			const index = list.findIndex((p) => p.key === activeKey);
			if (key === 'arrowleft' || key === 'k') {
				const prev = list[index - 1];
				if (prev) {
					event.preventDefault();
					setSelected(prev.key);
					setTab('answer');
				}
			} else if (key === 'arrowright' || key === 'j') {
				const next = list[index + 1];
				if (next) {
					event.preventDefault();
					setSelected(next.key);
					setTab('answer');
				}
			} else if (key === 'g') {
				const field = document.getElementById('evx-score-input');
				if (field instanceof HTMLElement) {
					event.preventDefault();
					field.focus();
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	const participants = useMemo<Participant[]>(() => {
		const enrolled: Participant[] = subs.map((s) => {
			const identity = ownerMap[s.id];
			const ownerName = identity?.name || s.expand?.owner?.name || '';
			const ownerEmail = identity?.email || s.expand?.owner?.email || '';
			const nim = identity?.nim || '';
			const name = ownerName || ownerEmail || 'Mahasiswa';
			const detail = s.group
				? `Kelompok ${s.group}${nim ? ` · NIM ${nim}` : ''}`
				: nim
					? `NIM ${nim}`
					: ownerEmail || 'Identitas belum tersedia';
			return {
				key: `e:${s.id}`,
				channel: 'enrolled',
				name,
				detail,
				status: s.status || 'submitted',
				grade: s.grade,
				feedback: s.feedback || '',
				content: s.content || '',
				link: s.link || '',
				files: (s.files || []).map((name) => ({ name, url: submissionFileUrl(s, name) })),
				created: s.created,
				autoScore: s.autoScore,
				identityKey: enrolledIdentityKey(s.owner),
				enrolled: s,
				transcript: s.transcript || '',
				transcriptStatus: s.transcriptStatus || '',
				transcriptError: s.transcriptError || '',
				transcriptFile: s.transcriptFile || '',
				transcriptConfidence: s.transcriptConfidence,
			};
		});
		const publicRows: Participant[] = pubs.map((s) => ({
			key: `p:${s.id}`,
			channel: 'public',
			name: s.participantName || 'Peserta publik',
			detail: s.groupName ? `Kelompok ${s.groupName}` : s.nim ? `NIM ${s.nim}` : 'Peserta publik',
			status: s.status || 'submitted',
			grade: s.grade,
			feedback: s.feedback || '',
			content: s.content || '',
			link: s.link || '',
			files: (s.files || []).map((name) => ({ name, url: publicFileUrl(s, name) })),
			created: s.created,
			autoScore: s.autoScore,
			identityKey: s.identityKey,
			publicId: s.id,
			linked: Boolean(s.linkedSubmission),
			transcript: '',
			transcriptStatus: '',
			transcriptError: '',
			transcriptFile: '',
			transcriptConfidence: null,
		}));
		return [...enrolled, ...publicRows];
	}, [subs, pubs, ownerMap]);

	const collected = participants.filter((p) => p.status !== 'draft');
	const graded = collected.filter((p) => p.status === 'graded');
	const pending = collected.filter((p) => p.status !== 'graded');
	const late = collected.filter(
		(p) => p.status === 'late' || (assignment ? isPastDeadline(assignment.deadline) && p.status !== 'graded' && new Date(p.created).getTime() > new Date(assignment.deadline).getTime() : false),
	);
	const grades = graded.map((p) => p.grade).filter((n): n is number => typeof n === 'number');
	const avg = grades.length ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : null;

	// Formative progress: which participants have used Cek jawaban at all.
	const checkedKeys = useMemo(() => new Set(attempts.map((a) => a.identityKey)), [attempts]);
	const attemptCountByKey = useMemo(() => {
		const map = new Map<string, number>();
		for (const a of attempts) map.set(a.identityKey, (map.get(a.identityKey) || 0) + 1);
		return map;
	}, [attempts]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const rows = participants.filter((p) => {
			if (
				filters.length > 0 &&
				!filters.includes('all') &&
				!filters.some((value) => matchesFilter(p, value, checkedKeys))
			)
				return false;
			if (q && !`${p.name} ${p.detail}`.toLowerCase().includes(q)) return false;
			return true;
		});
		rows.sort((a, b) => {
			if (sort === 'name') return a.name.localeCompare(b.name, 'id');
			if (sort === 'grade') return (b.grade ?? -1) - (a.grade ?? -1);
			return b.created.localeCompare(a.created);
		});
		return rows;
	}, [participants, filters, query, sort, checkedKeys]);

	const active = filtered.find((p) => p.key === selected) || filtered[0] || null;
	const activeAttempts = attempts.filter((a) => active && a.identityKey === active.identityKey);
	const maxChecks = assignment ? checkMaxOf(assignment) : 5;

	if (loading) {
		return (
			<div className="ld-loading" role="status" aria-live="polite">
				<LoaderCircle size={22} className="spin" /> Memuat penilaian...
			</div>
		);
	}
	if (error || !assignment) {
		return (
			<div className="ld-empty">
				<h3>Tugas tidak dapat dibuka</h3>
				<p>{error || 'Data tugas tidak tersedia.'}</p>
				<Link to="/app/tugas" className="ld-btn-primary">
					Kembali ke Tugas
				</Link>
			</div>
		);
	}

	const session = assignment.expand?.session;
	const sub = assignment.expand?.subCpmk;
	const formative = activityTypeOf(assignment) === 'formative';
	navRef.current = { filtered, activeKey: active?.key ?? null, formative };
	const isSpeaking = assignment.shape === 'speaking' || assignment.shape === 'conversation';
	const cefr =
		course?.code && taskKindForShape(assignment.shape) ? extractCefrLevel(course.code) : null;
	// Batch 4: sync state against the parent Tugas formal (loaded via expand).
	const parentRecord = assignment.expand?.parentAssignment;
	const syncState =
		formative && parentRecord ? practiceSyncState(assignment, parentRecord) : null;
	const syncOutdated = Boolean(syncState?.parentChanged && syncState.differing.length > 0);
	const checkers = new Set(attempts.map((a) => a.identityKey)).size;
	// Formative assignments have no grading — offer check-progress filters instead.
	const filterOptions: { value: string; label: string }[] = formative
		? [
				{ value: 'all', label: 'Semua' },
				{ value: 'enrolled', label: 'Terdaftar' },
				{ value: 'public', label: 'Publik' },
				{ value: 'checked', label: 'Sudah memeriksa' },
				{ value: 'unchecked', label: 'Belum memeriksa' },
			]
		: [
				{ value: 'all', label: 'Semua' },
				{ value: 'pending', label: 'Belum dinilai' },
				{ value: 'graded', label: 'Sudah dinilai' },
				{ value: 'late', label: 'Terlambat' },
				{ value: 'enrolled', label: 'Terdaftar' },
				{ value: 'public', label: 'Publik' },
			];

	const countOf = (value: string) =>
		value === 'all'
			? participants.length
			: participants.filter((p) => matchesFilter(p, value, checkedKeys)).length;

	const toggleFilter = (value: string) => {
		setFilters((prev) => {
			if (value === 'all') return [];
			const next = prev.filter((v) => v !== 'all');
			return next.includes(value) ? next.filter((v) => v !== value) : [...next, value];
		});
	};

	const filterLabel =
		filters.length === 0 || filters.includes('all')
			? 'Semua peserta'
			: filterOptions
					.filter((o) => filters.includes(o.value))
					.map((o) => o.label)
					.join(' · ');

	return (
		<div className="eval-page">
			<nav className="eval-crumb" aria-label="Jejak">
				<Link to="/app/courses">Mata Kuliah</Link>
				<span>/</span>
				<Link to={`/app/courses/${assignment.course}`}>{course?.title || 'Mata kuliah'}</Link>
				<span>/</span>
				<Link to="/app/tugas">Tugas</Link>
				<span>/</span>
				<em>Penilaian</em>
			</nav>

			<header className="eval-head">
				<div>
					<h1>{assignment.title}</h1>
					<div className="asg-tags">
						{course?.code && <span className="asg-tag">{course.code}</span>}
						{session?.week && <span className="asg-tag">Minggu {session.week}</span>}
						{sub && <span className="asg-tag">Sub-CPMK {sub.code || ''}</span>}
						{assignment.shape && <span className="asg-tag">{SHAPE_LABEL[assignment.shape]}</span>}
						<span className="asg-tag">{MODE_LABEL[assignment.mode]}</span>
						{activityTypeOf(assignment) === 'formative' && (
							<span className="asg-tag">{ACTIVITY_TYPE_LABEL.formative}</span>
						)}
						{formative && assignment.expand?.parentAssignment ? (
							<Link
								to={`/app/tugas/${assignment.expand.parentAssignment.id}`}
								className="asg-tag formative"
							>
								Latihan persiapan untuk “{assignment.expand.parentAssignment.title}”
							</Link>
						) : null}
						{activityTypeOf(assignment) === 'formal' && assignment.allowRevision && (
							<span className="asg-tag">Revisi diizinkan</span>
						)}
						<span className="asg-tag">Batas {deadlineLabel(assignment.deadline)}</span>
						<span className={`asg-tag status-${assignment.status}`}>
							{assignment.status === 'published' ? 'Aktif' : assignment.status}
						</span>
					</div>
				</div>
				<div className="eval-head-actions">
					<OverflowMenu label="Tindakan tugas">
						{formative ? null : (
							<>
								<button type="button" role="menuitem" onClick={() => setBulkOpen(true)}>
									<FileInput size={16} /> Input kertas
								</button>
								<Link
									to={`/app/tugas/buat?practice=${assignment.id}`}
									role="menuitem"
									onClick={() => setPracticeIntent(assignment.id)}
								>
									<Repeat size={16} /> Buat latihan persiapan
								</Link>
							</>
						)}
						{formative ? (
							<button type="button" role="menuitem" onClick={() => setEditOpen(true)}>
								<Pencil size={16} /> Edit latihan
							</button>
						) : null}
						<Link to={`/app/tugas/${assignment.id}/pratinjau`} role="menuitem">
							<Eye size={16} /> Pratinjau tampilan mahasiswa
						</Link>
						<button type="button" role="menuitem" onClick={() => setShowInstructions((v) => !v)}>
							<FileText size={16} /> {showInstructions ? 'Tutup instruksi' : 'Lihat instruksi'}
						</button>
						<Link to={`/app/courses/${assignment.course}`} role="menuitem">
							<ExternalLink size={16} /> Edit di mata kuliah
						</Link>
					</OverflowMenu>
				</div>
			</header>

			{formative && parentRecord && syncOutdated && syncState && (
				<section className="evx-sync" role="alert" aria-label="Peringatan sinkronisasi latihan">
					<AlertTriangle size={15} />
					<div>
						<strong>Tugas formal “{parentRecord.title}” berubah setelah latihan ini dibuat.</strong>
						<span>
							Latihan tidak diperbarui otomatis; isi latihan tetap independen dan tersimpan.
							Bagian yang berbeda: {syncState.differing.join(' · ')}. Periksa dan salin ulang
							hanya bila diperlukan.
						</span>
					</div>
					<button
						type="button"
						className="ld-outline-action sm"
						onClick={() => setEditOpen(true)}
					>
						<RotateCcw size={14} /> Periksa & salin ulang
					</button>
				</section>
			)}

			{formative ? null : ((linkedPractices.data ?? []).length > 0 ? (
				<section className="evx-practice" aria-label="Latihan persiapan terkait">
					<h2>
						<Repeat size={14} /> Latihan persiapan terkait ({(linkedPractices.data ?? []).length})
					</h2>
					<ul>
						{(linkedPractices.data ?? []).map((p) => (
							<li key={p.id}>
								<Link to={`/app/tugas/${p.id}`} className="evx-practice-link">
									<strong>{p.title}</strong>
									<span className={isPracticeOutdated(p, assignment) ? 'warn' : ''}>
										{ASSIGNMENT_STATUS_LABEL[p.status]}
										{p.status === 'published' ? ' · tanpa nilai' : ''}
										{isPracticeOutdated(p, assignment) ? ' · perlu diperiksa' : ''}
									</span>
								</Link>
							</li>
						))}
					</ul>
					<p>
						Latihan persiapan terpisah dari penilaian tugas formal ini. Tanpa pengumpulan
						final dan tanpa dampak pada nilai resmi.
					</p>
				</section>
			) : null)}

			{showInstructions && (
				<section className="eval-instructions">
					{assignment.instructions ? <p>{assignment.instructions}</p> : <p>Belum ada instruksi tersimpan.</p>}
					{assignment.requirements && (
						<p>
							<small>Ketentuan</small>
							{assignment.requirements}
						</p>
					)}
				</section>
			)}

			{formative && (
				<p className="eval-formative warn eval-formative-banner">
					<ClipboardCheck size={14} />
					<span>
						Latihan formatif tanpa pengumpulan final dan tanpa nilai resmi. Riwayat Cek jawaban
						adalah umpan baliknya. Tidak ada nilai yang disimpan untuk latihan ini.
						{cefr ? ` Pemeriksaan dikalibrasi ke CEFR ${cefr} pada kode mata kuliah.` : ''}
					</span>
				</p>
			)}

			{!formative && (
				<div className="evx-stats">
					<div className="evx-stat">
						<span className="evx-stat-ico blue"><Inbox size={16} /></span>
						<div>
							<strong>{collected.length}</strong>
							<span>Terkumpul</span>
							<small>dari {participants.length} peserta</small>
							<i style={{ width: `${participants.length ? Math.round((collected.length / participants.length) * 100) : 0}%` }} />
						</div>
					</div>
					<div className="evx-stat">
						<span className="evx-stat-ico amber"><Clock size={16} /></span>
						<div><strong>{pending.length}</strong><span>Perlu dinilai</span></div>
					</div>
					<div className="evx-stat">
						<span className="evx-stat-ico green"><CheckCircle2 size={16} /></span>
						<div><strong>{graded.length}</strong><span>Sudah dinilai</span></div>
					</div>
					<div className="evx-stat">
						<span className="evx-stat-ico red"><AlertCircle size={16} /></span>
						<div><strong>{late.length}</strong><span>Terlambat</span></div>
					</div>
					<div className="evx-stat quiet"><div><strong>{avg == null ? '—' : lecturerGradeLabel(avg)}</strong><span>Rata-rata</span></div></div>
					<div className="evx-stat quiet"><div><strong>{grades.length ? lecturerGradeLabel(Math.max(...grades)) : '—'}</strong><span>Tertinggi</span></div></div>
					<div className="evx-stat quiet"><div><strong>{grades.length ? lecturerGradeLabel(Math.min(...grades)) : '—'}</strong><span>Terendah</span></div></div>
					<div className="evx-pager">
						<button type="button" aria-label="Peserta sebelumnya" disabled={!active || filtered.findIndex((p) => p.key === active.key) <= 0} onClick={() => {
							const index = filtered.findIndex((p) => p.key === active?.key);
							const prev = filtered[index - 1];
							if (prev) { setSelected(prev.key); setTab('answer'); }
						}}><ChevronLeft size={16} /></button>
						<span>{active ? filtered.findIndex((p) => p.key === active.key) + 1 : 0} dari {filtered.length}</span>
						<button type="button" aria-label="Peserta berikutnya" disabled={!active || filtered.findIndex((p) => p.key === active.key) >= filtered.length - 1} onClick={() => {
							const index = filtered.findIndex((p) => p.key === active?.key);
							const next = filtered[index + 1];
							if (next) { setSelected(next.key); setTab('answer'); }
						}}><ChevronRight size={16} /></button>
					</div>
				</div>
			)}
			{formative && (
				<ul className="eval-stats">
					<Stat label="Pemeriksaan" value={String(attempts.length)} />
					<Stat label="Peserta memeriksa" value={String(checkers)} tone="ok" />
					<Stat label="Total peserta" value={String(participants.length)} />
					<Stat label="Belum memeriksa" value={String(Math.max(participants.length - checkers, 0))} tone="wait" />
				</ul>
			)}

			<div className={`eval-grid${formative ? ' formative' : ' evx-grid'}`}>
				<AiEvaluationReviewProvider
					assignment={assignment}
					cefrLevel={cefr}
					participant={
						!formative && active
							? {
									channel: active.channel,
									enrolledId: active.enrolled?.id,
									publicId: active.publicId,
									status: active.status,
								}
							: null
					}
					transcriptConfidence={isSpeaking ? active?.transcriptConfidence : null}
				transcriptStatus={isSpeaking ? active?.transcriptStatus : undefined}
				transcriptError={isSpeaking ? active?.transcriptError : undefined}
					content={
					active
						? isSpeaking
							? active.transcriptStatus === 'ready'
								? active.transcript
								: ''
							: active.content || ''
						: ''
				}
					onPublished={() => {
						invalidate('assignment_submissions');
						invalidate('public_submissions');
						void reload();
					}}
					onAdvance={() => {
						const index = filtered.findIndex((p) => p.key === active?.key);
						const next = filtered[index + 1];
						if (next) {
							setSelected(next.key);
							setTab('answer');
						}
					}}
				>
				<FormativeReviewProvider
					enabled={formative && !!active}
					assignmentId={assignment.id}
					identityKey={active?.identityKey || ''}
					channel={active?.channel || 'enrolled'}
					submissionId={active?.enrolled?.id}
					content={active?.content || ''}
					feedback={activeAttempts[activeAttempts.length - 1]?.feedback || ''}
					evidence={activeAttempts[activeAttempts.length - 1]?.evidence || ''}
					autoScore={active?.autoScore ?? null}
					assignment={assignment}
					cefrLevel={cefr}
				>
				<section className="eval-col" aria-label="Daftar peserta">
					<div className="eval-col-head">
						<h2>Peserta ({filtered.length})</h2>
						{!formative && (
							<span className="evx-kbd-hint" aria-hidden="true">
								<kbd>J</kbd>
								<kbd>K</kbd> berpindah · <kbd>G</kbd> nilai
							</span>
						)}
					</div>
					<label className="cho-search">
						<Search size={13} />
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Cari nama atau NIM..."
							aria-label="Cari nama peserta"
						/>
					</label>
					<div className="evx-filter-drop" id="evx-filter-root">
						<button
							type="button"
							className={`evx-filter-btn${filters.length > 0 ? ' active' : ''}`}
							aria-expanded={filterOpen}
							aria-haspopup="true"
							onClick={() => setFilterOpen((v) => !v)}
						>
							<ListFilter size={13} />
							<span>{filterLabel}</span>
							<ChevronDown size={13} className={filterOpen ? 'open' : ''} />
						</button>
						{filterOpen && (
							<div className="evx-filter-menu" role="group" aria-label="Saring peserta">
								{filterOptions.map(({ value, label }) => {
									const checked = value === 'all' ? filters.length === 0 : filters.includes(value);
									return (
										<label key={value} className="evx-filter-item">
											<input
												type="checkbox"
												checked={checked}
												onChange={() => toggleFilter(value)}
												aria-label={label}
											/>
											<span>{label}</span>
											<em>{countOf(value)}</em>
										</label>
									);
								})}
							</div>
						)}
					</div>
					<label className="eval-sort">
						<ArrowDownUp size={13} />
						<select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Urutkan">
							<option value="time">Urut: Waktu terkumpul</option>
							<option value="name">Nama</option>
							{!formative && <option value="grade">Nilai</option>}
						</select>
					</label>
					{filtered.length === 0 ? (
						<div className="evx-empty-card" role="status">
							<Inbox size={18} />
							<strong>Belum ada peserta</strong>
							<p>
								{participants.length === 0
									? 'Kartu peserta tetap di sini. Jawaban yang terkumpul akan muncul di daftar ini.'
									: 'Tidak ada peserta pada saringan ini. Ubah filter atau kata kunci pencarian.'}
							</p>
						</div>
					) : (
						<ul className="eval-people">
							{filtered.map((p) => (
								<li key={p.key}>
									<button
										type="button"
										className={`${formative ? '' : 'evx-person '}${active?.key === p.key ? 'active' : ''}${formative ? '' : p.status === 'graded' ? ' graded' : ' pending-grade'}`}
										onClick={() => {
											setSelected(p.key);
											setTab('answer');
										}}
									>
										<span className="cw-student-avatar">{p.name.charAt(0).toUpperCase()}</span>
										<span>
											<strong>{p.name}</strong>
										<small title={`${p.channel === 'public' ? 'Peserta publik' : 'Mahasiswa'}${p.detail ? ` · ${p.detail}` : ''} · ${stamp(p.created)}`}>
											{p.channel === 'public' ? 'Publik' : p.detail || 'Mahasiswa'} · {new Date(p.created).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
										</small>
										</span>
										<em>
											{formative
												? attemptCountByKey.get(p.identityKey)
													? `${attemptCountByKey.get(p.identityKey)} cek`
													: '—'
												: p.grade != null
													? lecturerGradeLabel(p.grade)
													: p.status === 'draft'
														? 'Draf'
														: '—'}
										</em>
										{p.linked && (
											<span className="asg-tag linked" title="Jawaban publik ditautkan ke akun mahasiswa">
												Tertaut
											</span>
										)}
										<span className={`asg-tag sub-${p.status || 'submitted'}`}>
											{p.channel === 'public' ? 'Publik · ' : ''}
											{SUBMISSION_STATUS_LABEL[p.status as SubmissionStatus] || p.status}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</section>

				<section className="eval-col" aria-label="Jawaban peserta">
					{!active ? (
						<EmptyAnswerColumn />
					) : (
						<>
							<div className={formative ? 'eval-who' : 'evx-who'}>
								<span className="evx-avatar lg">{active.name.charAt(0).toUpperCase()}</span>
								<div>
									<h2>{active.name}</h2>
									<p>
										{active.detail || (active.channel === 'public' ? 'Peserta publik' : 'Mahasiswa')}
										{' · '}{active.channel === 'public' ? 'Peserta publik' : 'Terdaftar'}
										{' · '}{SUBMISSION_STATUS_LABEL[active.status as SubmissionStatus] || active.status}
										{' · '}{stamp(active.created)}
									</p>
									{!formative && (
										<div className="evx-who-status">
											<EvaluationStatusBadge />
											{assignment.allowRevision && (
												<span className="asg-tag" title="Revisi diizinkan setelah umpan balik">Revisi diizinkan</span>
											)}
										</div>
									)}
								</div>
								{!formative && active.files[0] && (
									<a className="ld-outline-action sm" href={active.files[0].url} download>
										<Download size={14} /> Unduh file
									</a>
								)}
							</div>
							<div className="eval-tabs" role="tablist">
								{(
									[
										['answer', 'Jawaban'],
										['history', `Riwayat (${activeAttempts.length})`],
										['notes', 'Catatan'],
									] as const
								).map(([value, label]) => (
									<button
										key={value}
										type="button"
										role="tab"
										aria-selected={tab === value}
										className={tab === value ? 'active' : ''}
										onClick={() => setTab(value)}
									>
										{label}
									</button>
								))}
							</div>
							{tab === 'answer' && (
								<div className="eval-answer">
									{active.status === 'draft' && (
										<p className="eval-note">Masih draf, belum dikumpulkan secara resmi.</p>
									)}
									{active.autoScore != null && (
										<p className="evx-autoscore">Skor otomatis {active.autoScore}/100 (bukan nilai resmi). Lihat analisis AI di panel kanan.</p>
									)}
									{formative ? (
										<>
											<FormativeReviewAnswer />
											<FormativeReviewEvaluation />
										</>
									) : isSpeaking ? null : (
										<>
											<AiEvaluationAnswer />
											{!active.content && (
												<p className="asg-empty-line">Tidak ada catatan teks.</p>
											)}
										</>
									)}
									{isSpeaking ? (
										<div className="evx-speaking">
											<div className="evx-speaking-head">
												<FileAudio size={14} />
												<h4>Kiriman berbicara</h4>
											</div>
											<SubmissionFiles files={active.files} />
											{active.link && (
												<a className="asg-sub-file" href={active.link} target="_blank" rel="noreferrer">
													<ExternalLink size={12} /> {active.link}
												</a>
											)}
											{active.channel === 'enrolled' &&
											active.enrolled &&
											active.transcriptStatus !== 'ready' &&
											(active.transcriptStatus || active.files.some((f) => AUDIO_RE.test(f.name))) ? (
												<TranscriptPanel
													submissionId={active.enrolled.id}
													initialStatus={active.transcriptStatus}
													initialTranscript={active.transcript}
													initialError={active.transcriptError}
													initialFile={active.transcriptFile}
												/>
											) : null}
											{active.channel === 'enrolled' &&
											active.enrolled &&
											active.transcriptStatus === 'ready' ? (
												<AiEvaluationAnswer />
											) : null}
											{active.files.length === 0 && !active.link && (
												<p className="asg-empty-line">Belum ada rekaman audio atau tautan dikumpulkan.</p>
											)}
										</div>
									) : (
										<>
											<SubmissionFiles files={active.files} />
											{active.link && (
												<a className="asg-sub-file" href={active.link} target="_blank" rel="noreferrer">
													<ExternalLink size={12} /> {active.link}
												</a>
											)}
										</>
									)}
									{active.enrolled && (
										<SubmissionTaskReview
											assignment={assignment}
											submission={active.enrolled}
											parts="answer"
										/>
									)}
								</div>
							)}
							{tab === 'history' && (
								<div className="eval-history">
									{active.enrolled && (
										<SubmissionTaskReview
											assignment={assignment}
											submission={active.enrolled}
											parts="guidance"
										/>
									)}
									<p className="eval-formative">
										<ClipboardCheck size={14} /> Formatif (bukan nilai resmi). Pemeriksaan{' '}
										{activeAttempts.length} dari {maxChecks}.
									</p>
									{activeAttempts.length === 0 ? (
										<p className="asg-empty-line">Peserta ini belum memakai Cek jawaban.</p>
									) : (
										<ol className="fbp-list">
											{activeAttempts.map((a) => {
												const ocr = ocrOf(a.extracted);
												return (
													<li key={a.id} className="fbp-item">
														<div className="fbp-item-head">
															<span className="fbp-level">
																{a.level ? LEVEL[a.level] || `Tingkat ${a.level}` : `Pemeriksaan ${a.attempt}`}
															</span>
															{a.area && <span className="fbp-area">{a.area}</span>}
															<span className="ckp-time">
																{a.attempt}/{maxChecks} · {stamp(a.created)}
															</span>
														</div>
														{a.focus && <p className="fbp-evidence">Fokus peserta: {a.focus}</p>}
														<CheckFeedbackBody text={a.feedback} />
														{a.evidence && <CheckEvidence evidence={a.evidence} />}
														{ocr && (ocr.normalizedText || ocr.imageUrl) && (
															<div className="cho-ocr">
																<strong className="cho-ocr-label">Konteks OCR</strong>
																{ocr.imageUrl && (
																	<a className="cho-ocr-thumb" href={ocr.imageUrl} target="_blank" rel="noreferrer">
																		<img src={ocr.imageUrl} alt={ocr.imageName || 'Foto jawaban'} />
																	</a>
																)}
																{ocr.rawText && <p className="cho-snap-text">{ocr.rawText}</p>}
															</div>
														)}
													</li>
												);
											})}
										</ol>
									)}
								</div>
							)}
							{tab === 'notes' && (
								<p className="tsr-text">
									{active.feedback || 'Belum ada umpan balik resmi. Tulis di panel penilaian.'}
								</p>
							)}
						</>
					)}
				</section>

				<section className="eval-col" aria-label="Penilaian">
					{!formative && active ? <h2>Penilaian</h2> : null}
					{active ? (
						formative ? (
							<FormativeReviewPanel />
						) : (
							<AiEvaluationPanel />
						)
					) : formative ? (
						<EmptyPracticePanel />
					) : (
						<EmptyGradePanel />
					)}
				</section>
				</FormativeReviewProvider>
				</AiEvaluationReviewProvider>
			</div>

			{editOpen ? (
				<AssignmentForm
					courseId={assignment.course}
					assignment={assignment}
					practiceFrom={parentRecord}
					onClose={() => setEditOpen(false)}
					onSaved={() => {
						setEditOpen(false);
						invalidate('assignments');
						void reload();
					}}
				/>
			) : null}
			{bulkOpen ? (
				<BulkPaperInput
					assignment={assignment}
					onClose={() => setBulkOpen(false)}
					onSubmitted={() => {
						invalidate('assignment_submissions');
						invalidate('public_submissions');
						void reload();
					}}
				/>
			) : null}
			</div>
	);
}

function EmptyAnswerColumn() {
	return (
		<div className="evx-empty-workspace" aria-label="Ruang jawaban kosong">
			<div className="evx-who">
				<span className="evx-avatar lg ghost">—</span>
				<div>
					<h2>Belum ada kiriman</h2>
					<p>Pilih peserta di kiri setelah ada jawaban terkumpul.</p>
				</div>
			</div>
			<div className="eval-tabs" role="tablist">
				<button type="button" className="active" disabled>Jawaban</button>
				<button type="button" disabled>Riwayat (0)</button>
				<button type="button" disabled>Catatan</button>
			</div>
			<div className="evx-empty-card tall">
				<FileText size={18} />
				<strong>Lembar jawaban kosong</strong>
				<p>Teks, lampiran, dan tanda penilaian akan tampil di kartu ini begitu ada pengumpulan.</p>
			</div>
		</div>
	);
}

function EmptyGradePanel() {
	return (
		<div className="evx-panel evx-ghost" aria-label="Panel penilaian kosong">
			<header className="evx-panel-head">
				<h3>Penilaian</h3>
				<span className="evx-draft">Kosong</span>
			</header>
			<div className="evx-ai-card">
				<div className="evx-ai-score">
					<strong>—<small> / 100</small></strong>
					<span>Belum ada skor</span>
				</div>
				<div className="evx-ai-findings">
					<strong>Temuan</strong>
					<ul>
						<li className="empty">Menunggu jawaban peserta.</li>
					</ul>
				</div>
			</div>
			<section className="evx-block">
				<header>
					<h4>Rubrik penilaian</h4>
					<span>Total <strong>—</strong> / 100</span>
				</header>
				<p className="evx-muted">Kriteria rubrik tetap terlihat di sini setelah ada kiriman yang dinilai.</p>
			</section>
			<section className="evx-block">
				<header>
					<h4>Feedback untuk mahasiswa</h4>
				</header>
				<textarea disabled rows={4} placeholder="Feedback ditulis setelah peserta dipilih." aria-label="Feedback kosong" />
			</section>
			<section className="evx-block evx-final-block">
				<label>
					Nilai akhir
					<span className="evx-score-field">
						<input disabled value="" placeholder="—" aria-label="Nilai akhir kosong" />
						<em>/ 100</em>
					</span>
				</label>
			</section>
			<div className="evx-actions">
				<button type="button" className="evx-draft-btn" disabled>Simpan draf</button>
				<button type="button" className="evx-next-btn" disabled>Simpan & lanjut</button>
			</div>
			<p className="evx-muted">Panel ini nonaktif sampai ada peserta untuk dinilai.</p>
		</div>
	);
}

function EmptyPracticePanel() {
	return (
		<div className="evx-panel" aria-label="Panel latihan kosong">
			<h2>Latihan formatif</h2>
			<div className="evx-empty-card">
				<ClipboardCheck size={18} />
				<strong>Belum ada progres</strong>
				<p>Riwayat Cek jawaban akan tampil di kartu ini setelah peserta memakai latihan.</p>
			</div>
		</div>
	);
}

function matchesFilter(p: Participant, value: string, checkedKeys: Set<string>) {
	switch (value) {
		case 'pending':
			return p.status !== 'graded' && p.status !== 'draft';
		case 'graded':
			return p.status === 'graded';
		case 'late':
			return p.status === 'late';
		case 'public':
			return p.channel === 'public';
		case 'enrolled':
			return p.channel === 'enrolled';
		case 'checked':
			return checkedKeys.has(p.identityKey);
		case 'unchecked':
			return !checkedKeys.has(p.identityKey);
		default:
			return true;
	}
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'wait' | 'late' }) {
	return (
		<li className={`eval-stat${tone ? ` ${tone}` : ''}`}>
			<strong>{value}</strong>
			<span>{label}</span>
		</li>
	);
}

/** Renders a submission's uploaded files — audio clips get a player, others a download link. */
function SubmissionFiles({ files }: { files: { name: string; url: string }[] }) {
	if (files.length === 0) return null;
	return (
		<div className="asg-sub-files">
			{files.map((f) => {
				if (AUDIO_RE.test(f.name)) {
					return (
						<div key={f.name} className="asg-sub-audio">
							<div className="asg-sub-audio-head">
								<FileAudio size={13} />
								<span>{f.name}</span>
								<a href={f.url} target="_blank" rel="noreferrer" download>
									<Download size={12} /> Unduh
								</a>
							</div>
							<audio controls src={f.url} className="asg-sub-audio-player" />
						</div>
					);
				}
				return (
					<a key={f.name} className="asg-sub-file" href={f.url} target="_blank" rel="noreferrer" download>
						<Download size={12} /> {f.name}
					</a>
				);
			})}
		</div>
	);
}
