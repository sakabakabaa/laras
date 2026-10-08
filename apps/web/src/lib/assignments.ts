import pb from '@/lib/pocketbase-client';
import type { ClassSession, CourseResource, StructuredItem } from '@/lib/learning';

/** sessionStorage key carrying a pending Latihan persiapan parent id.

The dedicated Tugas editor reads the formal-task id from the `?practice=`
query param. In the in-iframe preview the host can re-navigate the iframe to
the param-less canonical URL (a full page load), which strips the query
string before the editor mounts. The "Buat latihan persiapan" action stashes
the parent id here just before navigating so the editor can recover the
intent even when the query param is gone. The value is consumed once. */
const PRACTICE_INTENT_KEY = 'laras-practice-parent';

/** Stash a pending practice parent id right before navigating to the editor. */
export function setPracticeIntent(parentId: string) {
	try {
		sessionStorage.setItem(PRACTICE_INTENT_KEY, parentId);
	} catch {
		/* sessionStorage unavailable — the query param is the primary path */
	}
}

/**
 * Read a stashed practice parent id WITHOUT removing it (pure read, safe inside
 * a useState initializer that StrictMode double-invokes). Returns '' when none
 * is stored. Used only as a fallback when the `?practice=` query param is
 * missing; call `clearPracticeIntent()` once the parent has been loaded.
 */
export function peekPracticeIntent(): string {
	try {
		return sessionStorage.getItem(PRACTICE_INTENT_KEY) || '';
	} catch {
		return '';
	}
}

/** Drop any stashed practice intent (e.g. when the param is authoritative). */
export function clearPracticeIntent() {
	try {
		sessionStorage.removeItem(PRACTICE_INTENT_KEY);
	} catch {
		/* ignore */
	}
}

/** Full-screen student workspace for one Tugas or Latihan (no course sidebar). */
export function studentWorkPath(assignmentId: string) {
	return `/app/kerja/${assignmentId}`;
}

/**
 * Random lowercase-alphanumeric token for a public assignment link. Matches the
 * `^[a-z0-9]{24,64}$` shape the public-assignment lookup expects, and is
 * generated client-side so the lecturer's "Salin tautan" action can enable
 * public access in a single update before copying the link.
 */
export function generatePublicToken(length = 32): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let token = '';
	for (let i = 0; i < bytes.length; i++) token += chars[bytes[i] % chars.length];
	return token;
}

/** How students work on the assignment: alone or in groups. */
export type AssignmentMode = 'individual' | 'collaborative';

/**
 * Activity classification (Phase 1 activity separation).
 * `formal` = Tugas formal (graded, official assessment);
 * `formative` = Latihan formatif (practice, Cek jawaban stays available).
 */
export type ActivityType = 'formal' | 'formative';

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
	formal: 'Tugas formal',
	formative: 'Latihan formatif',
};

export const ACTIVITY_TYPE_OPTIONS: {
	value: ActivityType;
	label: string;
	description: string;
}[] = [
	{
		value: 'formal',
		label: 'Tugas formal',
		description: 'Dinilai dan dihitung dalam penilaian resmi mata kuliah.',
	},
	{
		value: 'formative',
		label: 'Latihan formatif',
		description: 'Latihan untuk pembelajaran — pemeriksaan formatif tetap tersedia.',
	},
];

/** Normalized activity type — legacy rows without the field default to formal. */
export function activityTypeOf(
	activity: { activityType?: ActivityType | '' | null } | null | undefined,
): ActivityType {
	return activity?.activityType === 'formative' ? 'formative' : 'formal';
}

/** Default title for a practice created from a formal task (Batch 1). */
export function practiceTitleFor(parent: Assignment) {
	return `Latihan persiapan — ${parent.title}`.slice(0, 200);
}

/**
 * Batch 4 — sync state between a linked Latihan formatif and its parent
 * Tugas formal. The practice stays independently editable and is NEVER
 * overwritten automatically; this only reports whether the parent changed
 * after the practice was created and which copied sections now differ, so the
 * lecturer can review and re-copy by hand if they choose to.
 */
export type PracticeSyncState = {
	/** True when the parent was updated after the practice was created. */
	parentChanged: boolean;
	/** Indonesian labels of the copied sections that currently differ. */
	differing: string[];
};

const sameStages = (a: Assignment['stages'], b: Assignment['stages']) =>
	JSON.stringify(parseStages(a)) === JSON.stringify(parseStages(b));

const sameAttachments = (a: string[] | undefined, b: string[] | undefined) =>
	[...(a || [])].slice().sort().join('|') === [...(b || [])].slice().sort().join('|');

/** Compares the sections Batch 1 copies from the parent (taskConfig is never copied). */
export function practiceSyncState(
	practice: Assignment,
	parent: Assignment,
): PracticeSyncState {
	const parentChanged =
		Date.parse(parent.updated || '') > Date.parse(practice.created || '');
	const differing: string[] = [];
	if ((parent.instructions || '') !== (practice.instructions || ''))
		differing.push('Instruksi');
	if ((parent.requirements || '') !== (practice.requirements || ''))
		differing.push('Ketentuan & rubrik');
	if ((parent.groupInfo || '') !== (practice.groupInfo || ''))
		differing.push('Ketentuan kelompok');
	if (!sameStages(parent.stages, practice.stages)) differing.push('Tahapan');
	if ((parent.session || '') !== (practice.session || '')) differing.push('Pertemuan');
	if ((parent.subCpmk || '') !== (practice.subCpmk || '')) differing.push('Sub-CPMK');
	if ((parent.mode || '') !== (practice.mode || '')) differing.push('Format kerja');
	if (!sameAttachments(parent.attachments, practice.attachments)) differing.push('Lampiran materi');
	return { parentChanged, differing };
}

/**
 * A linked practice is flagged for review only when the parent changed after
 * the practice was created AND at least one copied section now differs.
 * Independent lecturer edits to the practice (parent unchanged) never flag.
 */
export function isPracticeOutdated(practice: Assignment, parent: Assignment): boolean {
	const state = practiceSyncState(practice, parent);
	return state.parentChanged && state.differing.length > 0;
}

/** Assignment lifecycle: draft (lecturer only) → published → closed → archived. */
export type AssignmentStatus = 'draft' | 'published' | 'closed' | 'archived';

/** Submission lifecycle from the student's / lecturer's point of view. */
export type SubmissionStatus = 'draft' | 'submitted' | 'late' | 'revision' | 'graded';

/** One stage of a staged assignment workflow (label + optional note). */
export type AssignmentStage = { label: string; note?: string };

export type Assignment = {
	id: string;
	owner: string;
	course: string;
	session: string;
	subCpmk: string;
	title: string;
	instructions: string;
	requirements: string;
	/** JSON column — PocketBase returns an array; tolerate a raw string too. */
	stages: AssignmentStage[] | string | null;
	deadline: string;
	mode: AssignmentMode;
	/** Language-skill / academic shape. Work format is `mode`, not this field. */
	shape: AssignmentShape | '';
	/** Activity classification: Tugas formal (default) or Latihan formatif. */
	activityType?: ActivityType | '';
	/** Batch 1: for a Latihan formatif, the Tugas formal it prepares. */
	parentAssignment?: string | null;
	/** Type-specific builder config (json) — student-visible, no answer keys. */
	taskConfig: unknown;
	/** Provisional rubric-criterion suggestions (json) — separate from
	 *  taskConfig.criteria, never affects grading until explicitly accepted. */
	suggestedCriteria?: unknown;
	/** Lecturer-controlled public link. Off by default. */
	publicEnabled?: boolean;
	publicToken?: string;
	/** 0 / empty = no extra cap beyond one submission per identity. */
	publicMax?: number | null;
	/** Formal only: students may resubmit after lecturer feedback. */
	allowRevision?: boolean;
	/** Formative "Cek jawaban" AI checks. On by default. */
	checkEnabled?: boolean;
	/** Max checks per participant; 0 / empty = default 5. */
	checkMax?: number | null;
	/** Batch 3: formative-only AI practice assistance (hints/suggestions). Off by default. */
	aiAssistEnabled?: boolean;
	/** Phase 10 — control-condition switch: generic (default) vs personalized feedback. */
	feedbackMode?: 'generic' | 'personalized' | '';
	/** Phase 10 — configurable minimum validated observations for a recurring pattern. */
	personalizationThreshold?: number | null;
	/**
	 * Phase 1 (Student AI Assistance Policy) — explicit AI assistance policy
	 * for student AI requests on this assignment. When unset, the policy is
	 * derived from the activity type (formative → learning_support, formal →
	 * assessment_mode). See `@/lib/ai-policy`. Lecturer AI does not consult
	 * this field.
	 */
	aiPolicy?: unknown;
	groupInfo: string;
	status: AssignmentStatus;
	attachments?: string[];
	created: string;
	updated: string;
	expand?: {
		session?: ClassSession;
		subCpmk?: StructuredItem;
		attachments?: CourseResource[];
		parentAssignment?: Assignment;
	};
};

export type AssignmentSubmission = {
	id: string;
	owner: string;
	assignment: string;
	group: string;
	content: string;
	files: string[];
	link: string;
	status: SubmissionStatus | '';
	grade: number | null;
	feedback: string;
	gradedBy: string;
	gradedAt: string;
	/** Student's progressive answers / draft state for specialized tasks (json). */
	taskAnswers: unknown;
	/** Server-computed score for auto-gradable questions (0–100). */
	autoScore: number | null;
	/** Lecturer-only rubric scores / notes for specialized tasks (json). */
	taskReview: unknown;
	/** Phase 2 — Whisper transcript of a speaking submission's audio. */
	transcript?: string;
	transcriptStatus?: 'pending' | 'processing' | 'ready' | 'failed' | '';
	transcriptError?: string;
	transcriptFile?: string;
	/** Speaking-task per-word confidence summary (json, server-managed). */
	transcriptConfidence?: unknown;
	/** Phase 4 — true when this enrolled submission was imported from a public answer. */
	linkedFromPublic?: boolean;
	created: string;
	updated: string;
	expand?: { owner?: { name?: string; email?: string } };
};

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
	draft: 'Draf',
	published: 'Diterbitkan',
	closed: 'Ditutup',
	archived: 'Diarsipkan',
};

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
	draft: 'Dalam pengerjaan',
	submitted: 'Terkumpul',
	late: 'Terlambat',
	revision: 'Perlu revisi',
	graded: 'Dinilai',
};

/** Label shown when a formal task has no submission record yet. */
export const NOT_SUBMITTED_LABEL = 'Belum dikumpulkan';

/**
 * Consistent student-facing status label for a submission. Returns the
 * not-submitted label when no real submission exists; otherwise the canonical
 * SUBMISSION_STATUS_LABEL for the submission's status.
 */
export function submissionStatusLabel(
	submission: AssignmentSubmission | null | undefined,
): string {
	const status = submission?.status;
	if (!status) return NOT_SUBMITTED_LABEL;
	return SUBMISSION_STATUS_LABEL[status];
}

/**
 * Letter-grade scale: A 80–100, B 70–79, C 60–69, D 50–59, E below 50.
 * Returns null when no numeric grade is available. Presentation only — the
 * underlying numeric grade is never changed.
 */
export function letterGrade(grade: number | null | undefined): string | null {
	if (grade == null || Number.isNaN(grade)) return null;
	if (grade >= 80) return 'A';
	if (grade >= 70) return 'B';
	if (grade >= 60) return 'C';
	if (grade >= 50) return 'D';
	return 'E';
}

/** Student-facing: letter only (e.g. "A"). Returns '—' when unavailable. */
export function studentGradeLabel(grade: number | null | undefined): string {
	return letterGrade(grade) ?? '—';
}

/** Lecturer-facing: numeric + letter (e.g. "86 · A"). Returns '—' when unavailable. */
export function lecturerGradeLabel(grade: number | null | undefined): string {
	const letter = letterGrade(grade);
	if (letter == null) return '—';
	return `${grade} · ${letter}`;
}

export const MODE_LABEL: Record<AssignmentMode, string> = {
	individual: 'Individual',
	collaborative: 'Kolaboratif',
};

/**
 * Task type. Primary values are language-learning activities.
 * `individual` / `group_project` are legacy shapes kept so old rows still
 * display — new tasks use `mode` for Individu vs Kelompok instead.
 */
export type AssignmentShape =
	| 'listening'
	| 'speaking'
	| 'reading'
	| 'writing'
	| 'quiz'
	| 'conversation'
	| 'vocabulary'
	| 'language_project'
	| 'case_study'
	| 'presentation'
	| 'practical'
	| 'discussion'
	| 'portfolio'
	| 'individual'
	| 'group_project';

export type ShapeOption = {
	value: AssignmentShape;
	label: string;
	description: string;
	/** Primary language-skill type vs reusable academic format. */
	group: 'language' | 'academic';
	/** Default stage labels for this shape. Work format is chosen separately. */
	stages: string[];
};

export const SHAPE_OPTIONS: ShapeOption[] = [
	{
		value: 'writing',
		label: 'Menulis',
		description: 'Tugas menulis dengan rubrik dan format pengumpulan.',
		group: 'language',
		stages: ['Membaca instruksi', 'Menyusun draf', 'Revisi', 'Pengumpulan'],
	},
	{
		value: 'speaking',
		label: 'Berbicara',
		description: 'Produksi lisan: rekaman audio/video atau tautan unjuk bicara.',
		group: 'language',
		stages: ['Membaca prompt', 'Latihan', 'Rekaman', 'Pengumpulan'],
	},
];

/** Labels for shapes no longer offered as new types. Kept so existing records
 *  still display their original type without being offered in the creator. */
export const LEGACY_SHAPE_LABEL: Partial<Record<AssignmentShape, string>> = {
	listening: 'Menyimak (format lama)',
	reading: 'Membaca (format lama)',
	quiz: 'Kuis Bahasa (format lama)',
	conversation: 'Percakapan / Role-play (format lama)',
	vocabulary: 'Kosakata & Tata Bahasa (format lama)',
	language_project: 'Proyek Bahasa / Portofolio (format lama)',
	case_study: 'Studi kasus (format lama)',
	presentation: 'Presentasi (format lama)',
	practical: 'Praktik / unjuk kerja (format lama)',
	discussion: 'Diskusi / refleksi (format lama)',
	portfolio: 'Portofolio umum (format lama)',
	individual: 'Tugas individu (format lama)',
	group_project: 'Proyek kelompok (format lama)',
};

export const SHAPE_LABEL: Record<AssignmentShape, string> = {
	...(Object.fromEntries(SHAPE_OPTIONS.map((s) => [s.value, s.label])) as Record<
		AssignmentShape,
		string
	>),
	...LEGACY_SHAPE_LABEL,
};

export function shapeOption(shape: AssignmentShape | '' | undefined): ShapeOption | undefined {
	return SHAPE_OPTIONS.find((s) => s.value === shape);
}

/** Default stage list for a shape (empty when the shape is unknown). */
export function defaultStagesForShape(
	shape: AssignmentShape | '' | undefined,
): AssignmentStage[] {
	return (shapeOption(shape)?.stages ?? []).map((label) => ({ label }));
}

/** Sensible default stage sets, editable per assignment. */
export const STAGE_PRESETS: Record<AssignmentMode, string[]> = {
	collaborative: [
		'Pembentukan kelompok',
		'Riset',
		'Draf',
		'Revisi',
		'Finalisasi',
		'Presentasi',
		'Pengumpulan',
		'Refleksi',
	],
	individual: [
		'Persiapan',
		'Draf',
		'Revisi',
		'Finalisasi',
		'Pengumpulan',
		'Refleksi',
	],
};

/** Parse the `stages` JSON column into a stage list (tolerates bad data). */
export function parseStages(value: Assignment['stages']): AssignmentStage[] {
	if (!value) return [];
	let raw: unknown = value;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => {
			if (typeof item === 'string') return { label: item };
			if (item && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string') {
				const note = (item as { note?: unknown }).note;
				return {
					label: (item as { label: string }).label,
					...(typeof note === 'string' && note ? { note } : {}),
				};
			}
			return null;
		})
		.filter((s): s is AssignmentStage => Boolean(s && s.label.trim()));
}

/** True when the deadline exists and has already passed. */
export function isPastDeadline(deadline: string, now = Date.now()) {
	if (!deadline) return false;
	const t = new Date(deadline).getTime();
	return !Number.isNaN(t) && t < now;
}

/** Indonesian deadline label, e.g. "12 Mei 2026, 23.59". */
export function deadlineLabel(deadline: string) {
	if (!deadline) return 'Tanpa batas waktu';
	const date = new Date(deadline);
	if (Number.isNaN(date.getTime())) return 'Tanpa batas waktu';
	return date.toLocaleString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/** Short relative deadline hint, e.g. "tersisa 3 hari" / "terlewat 2 hari". */
export function deadlineHint(deadline: string, now = Date.now()) {
	if (!deadline) return '';
	const t = new Date(deadline).getTime();
	if (Number.isNaN(t)) return '';
	const diffMs = t - now;
	const days = Math.round(diffMs / 86_400_000);
	if (Math.abs(diffMs) < 3_600_000) {
		return diffMs >= 0 ? 'kurang dari 1 jam lagi' : 'baru saja terlewat';
	}
	if (days === 0) return diffMs >= 0 ? 'hari ini' : 'hari ini terlewat';
	if (days > 0) return `tersisa ${days} hari`;
	return `terlewat ${Math.abs(days)} hari`;
}

/** Convert a stored ISO deadline to a `datetime-local` input value. */
export function deadlineToLocalInput(deadline: string) {
	if (!deadline) return '';
	const date = new Date(deadline);
	if (Number.isNaN(date.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Convert a `datetime-local` input value to a storable ISO string ('' = none). */
export function localInputToDeadline(value: string) {
	if (!value) return '';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Absolute (same-origin) URL for one uploaded submission file. */
export function submissionFileUrl(submission: AssignmentSubmission, filename: string) {
	return pb.files.getURL(submission, filename);
}

export type UploadProgress = {
	loaded: number;
	total: number;
	percent: number;
};

/**
 * Create or update a submission via XMLHttpRequest so real upload progress
 * can be reported (the SDK uses fetch, which has no progress events).
 *
 * On update, PocketBase file fields keep only the filenames submitted back —
 * so existing filenames are passed alongside any new File objects.
 */
export function uploadSubmission(
	formData: FormData,
	opts: { id?: string } = {},
	onProgress?: (p: UploadProgress) => void,
): Promise<AssignmentSubmission> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		const url = opts.id
			? `${pb.baseURL}/api/collections/assignment_submissions/records/${opts.id}`
			: `${pb.baseURL}/api/collections/assignment_submissions/records`;
		xhr.open(opts.id ? 'PATCH' : 'POST', url, true);
		const token = pb.authStore.token;
		if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
		xhr.responseType = 'json';

		xhr.upload.onprogress = (e) => {
			if (!e.lengthComputable || !onProgress) return;
			onProgress({
				loaded: e.loaded,
				total: e.total,
				percent: Math.round((e.loaded / e.total) * 100),
			});
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve(xhr.response as AssignmentSubmission);
			} else {
				const body = xhr.response;
				let msg = `Gagal menyimpan (${xhr.status}).`;
				if (body && typeof body === 'object') {
					const data = (body as { data?: Record<string, { message?: string }> }).data;
					const first = data && Object.values(data).find((v) => v?.message);
					msg =
						first?.message ||
						(body as { message?: string }).message ||
						msg;
				}
				reject(new Error(msg));
			}
		};
		xhr.onerror = () => reject(new Error('Koneksi terputus saat mengunggah. Coba lagi.'));
		xhr.onabort = () => reject(new Error('Unggahan dibatalkan.'));

		xhr.send(formData);
	});
}
