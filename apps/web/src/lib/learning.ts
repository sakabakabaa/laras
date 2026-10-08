export type Course = {
	id: string;
	owner: string;
	title: string;
	code: string;
	semester: string;
	academicYear: string;
	description: string;
	rps: string;
	syllabus: string;
	rpsFile: string;
	credits?: number | null;
	prerequisites?: string;
	courseGroup?: string;
	lecturerName?: string;
	publishedAt?: string;
	workloadLecture?: number | null;
	workloadTutorial?: number | null;
	workloadPractice?: number | null;
	workloadIndependent?: number | null;
	workloadTotal?: number | null;
	strategies?: string;
	workloadNotes?: string;
	assessmentNotes?: string;
	/** "Diperiksa Oleh TPK Program Studi" (UPI standard approver). */
	reviewerName?: string;
	/** "Disetujui Oleh Ketua Program Studi" (UPI standard approver). */
	approverName?: string;
	/** "Hasil belajar yang dapat diperagakan/ditunjukkan dengan bukti". */
	demonstrableOutcomes?: string;
	/** "Langkah Pembelajaran" prose (distinct from strategi checkbox list). */
	learningSteps?: string;
	/** Full WAKTU BELAJAR MAHASISWA (workload) breakdown table as JSON. */
	workloadBreakdown?: unknown;
	/** "Jumlah Jam Ideal". */
	workloadIdealHours?: number | null;
	/** "Kesesuaian dengan jumlah SKS" (mis. "SESUAI"). */
	workloadSksMatch?: string;
	thumbnail?: string;
	created: string;
	updated: string;
};

/** Collaborative assignment design within an RPS. */
export type CollaborativeTask = {
	id: string;
	owner: string;
	course: string;
	title: string;
	description: string;
	objectives: string;
	schedule: string;
	groupInfo: string;
	order: number;
	/** "Metode Pembelajaran" (UPI collaborative task header). */
	method?: string;
	/** "Bobot Penilaian" (UPI collaborative task header). */
	weight?: number | null;
	/** "Sub-CPMK" descriptive text. */
	subCpmkNote?: string;
	/** "Langkah Pengerjaan Tugas". */
	steps?: string;
	/** "Rincian Luaran yang Dihasilkan". */
	outputs?: string;
	/** "Indikator, Kriteria, dan Bobot Penilai". */
	indicators?: string;
	/** "Lain-lain" notes. */
	notes?: string;
	cpls?: string[];
	cpmks?: string[];
	subCpmks?: string[];
	assessments?: string[];
	created: string;
	updated: string;
};

export type SpecialWeekType = 'normal' | 'uts' | 'uas' | 'khusus';

export type ClassSession = {
	id: string;
	owner: string;
	course: string;
	/** Optional section (Kelas) this session belongs to. */
	section?: string;
	title: string;
	week: number;
	date: string;
	topic: string;
	notes: string;
	completed: boolean;
	created: string;
	cpls?: string[];
	cpmks?: string[];
	subCpmks?: string[];
	topics?: string[];
	assessments?: string[];
	/** normal teaching week vs special academic week (UTS/UAS/khusus). */
	specialWeekType?: SpecialWeekType | '';
	/** Indikator pembelajaran for the week. */
	learningIndicator?: string;
	/** Materi pembelajaran (detailed) for the week. */
	learningMaterial?: string;
	/** Aspek/metode penilaian yang diterapkan pada pertemuan ini. */
	assessmentMethod?: string;
	/** Bobot penilaian sesi ini (0–100), bila berbeda dari komponen penilaian. */
	assessmentWeight?: number | null;
	/** Metode pembelajaran sinkronus (tatap muka / VC langsung). */
	synchronousMethod?: string;
	/** Metode pembelajaran asinkronus (mandiri / LMS). */
	asynchronousMethod?: string;
	/** Durasi pertemuan (teks bebas, mis. "100 menit"). */
	duration?: string;
	/** Referensi / bahan bacaan pertemuan. */
	references?: string;
	/** Tanggal & waktu akses / pelaksanaan. */
	accessDateTime?: string;
};

export type CourseSection = {
	id: string;
	owner: string;
	course: string;
	name: string;
	created: string;
	updated: string;
};

export type Enrollment = {
	id: string;
	owner: string;
	course: string;
	/** Optional section (Kelas) this enrollment belongs to. */
	section?: string;
	created: string;
};

/** Lecturer-managed roster entry (Phase 1): a student identity tied to a mata kuliah. */
export type CourseRosterEntry = {
	id: string;
	owner: string;
	course: string;
	/** Optional section (Kelas) this student belongs to. */
	section?: string;
	nim: string;
	name: string;
	created: string;
	updated: string;
};

/** Structured RPS record: a single ordered CPL / CPMK / Sub-CPMK / topic. */
export type StructuredItem = {
	id: string;
	owner: string;
	course: string;
	code: string;
	description: string;
	order: number;
	created: string;
	updated: string;
};

/** CPMK may reference a parent CPL; Sub-CPMK may reference a parent CPMK. */
export type Cpmk = StructuredItem & {
	cpl: string;
	/** "TAKSONOMI" Bloom level (UPI Kriteria Penilaian CPMK table). */
	taxonomy?: number | null;
	/** "Bobot" assessment weight % (UPI Kriteria Penilaian CPMK table). */
	weight?: number | null;
	/** "Kriteria Pencapaian CPMK" text. */
	criteria?: string;
};
export type SubCpmk = StructuredItem & { cpmk: string };

/** Assessment carries an optional weight percentage. */
export type Assessment = StructuredItem & { weight: number | null };

/** A class session may link to multiple structured records. */
export type ClassSessionLinks = {
	cpls: string[];
	cpmks: string[];
	subCpmks: string[];
	topics: string[];
	assessments: string[];
};

/** A lecturer-uploaded course resource (file or external link). */
export type CourseResource = {
	id: string;
	owner: string;
	course: string;
	session: string;
	title: string;
	description: string;
	/** "file" = uploaded binary, "link" = external URL. */
	kind: 'file' | 'link';
	/** PocketBase file field name (single file). */
	file: string;
	url: string;
	created: string;
	updated: string;
};

/** File-library access level: who may view/download the stored file. */
export type FileAccess = 'faculty' | 'student' | 'public';

/** File-library processing status (Phase 1: uploads become ready immediately). */
export type FileProcessingStatus = 'processing' | 'ready' | 'failed';

/** Phase 2 extraction status for a library file's stored text. */
export type ExtractionStatus = 'pending' | 'processing' | 'ready' | 'review' | 'failed';

/** Phase 3 — an immutable prior-version snapshot of a managed library file. */
export type FileVersionRecord = {
	id: string;
	/** Library file this snapshot belongs to. */
	file: string;
	owner: string;
	/** Version number this snapshot represented while it was active. */
	version: number;
	/** PocketBase file field name (single protected file). */
	fileData: string;
	/** Original stored filename of the snapshotted version. */
	filename: string;
	size: number | null;
	status: ExtractionStatus;
	extractedText: string;
	language: string;
	pages: number | null;
	chars: number | null;
	extractedAt: string;
	parserVersion: string;
	failureReason: string;
	sourceKey: string;
	created: string;
	updated: string;
};

/** Stored document extraction (Phase 2): parsed text + metadata, one per library file. */
export type FileExtractionRecord = {
	id: string;
	/** Library file this extraction belongs to (unique — no duplicates). */
	file: string;
	owner: string;
	status: ExtractionStatus;
	extractedText: string;
	language: string;
	pages: number | null;
	chars: number | null;
	extractedAt: string;
	parserVersion: string;
	failureReason: string;
	sourceKey: string;
	/** Phase 3 — version number of the library file this extraction parsed. */
	version?: number | null;
	created: string;
	updated: string;
};

/** A lecturer-managed library file, optionally linked to academic entities. */
export type FileLibraryRecord = {
	id: string;
	owner: string;
	course: string;
	cpmk: string;
	subCpmk: string;
	session: string;
	title: string;
	description: string;
	/** PocketBase file field name (single file). */
	file: string;
	/** Original upload size in bytes, recorded at upload time. */
	size: number | null;
	access: FileAccess;
	status: FileProcessingStatus;
	/** Phase 3 — monotonic version number of the active file (1 = first upload). */
	version?: number | null;
	/** Phase 3 — traceability: prior version number the active file was restored from. */
	restoredFrom?: number | null;
	created: string;
	updated: string;
	expand?: {
		owner?: { id: string; name: string; email?: string };
		course?: Course;
		cpmk?: Cpmk;
		subCpmk?: SubCpmk;
		session?: ClassSession;
	};
};

/** Phase 4 — confirmed/corrected context language for a library file. */
export type ContextLanguage = 'de' | 'id' | 'en' | 'other';

/** Phase 4 — per-file context organization record (one per library file). */
export type FileContextRecord = {
	id: string;
	/** Library file this context belongs to (unique — no duplicates). */
	file: string;
	owner: string;
	/** Active version the context was last reviewed/confirmed against. */
	version?: number | null;
	/** Confirmed or corrected language ('' = not yet confirmed). */
	language: string;
	/** Lecturer-added topics (free text, one per line). */
	topics: string;
	status: 'draft' | 'confirmed';
	created: string;
	updated: string;
};

/** Phase 7 — kinds of AI-generated academic-context suggestions. */
export type ContextSuggestionKind = 'language' | 'topics' | 'section' | 'course' | 'session';

/** Phase 7 — review state of an AI-generated suggestion. */
export type ContextSuggestionReview = 'pending' | 'approved' | 'rejected';

/** Phase 7 — an AI-generated, lecturer-reviewable academic-context suggestion. */
export type ContextSuggestionRecord = {
	id: string;
	file: string;
	owner: string;
	version?: number | null;
	kind: ContextSuggestionKind;
	label: string;
	pageRef: string;
	note: string;
	cpmk: string;
	subCpmk: string;
	session: string;
	course: string;
	review: ContextSuggestionReview;
	reviewedAt: string;
	bundleId: string;
	created: string;
	updated: string;
	expand?: {
		cpmk?: Cpmk;
		subCpmk?: SubCpmk;
		session?: ClassSession;
		course?: Course;
	};
};

/** Phase 4 — explicit mark of a content section for AI-context use. */
export type ContextSectionStatus = 'suitable' | 'unsuitable';

/** Phase 4 — a lecturer-marked content section of a library file. */
export type ContextSectionRecord = {
	id: string;
	file: string;
	owner: string;
	/** Active version this section was marked against. */
	version?: number | null;
	label: string;
	/** Free-text page/section reference (e.g. "hlm. 3–5", "Bab 2"). */
	pageRef: string;
	status: ContextSectionStatus;
	note: string;
	cpmk: string;
	subCpmk: string;
	session: string;
	order?: number | null;
	created: string;
	updated: string;
	expand?: {
		cpmk?: Cpmk;
		subCpmk?: SubCpmk;
		session?: ClassSession;
	};
};

export type Role = 'faculty' | 'student';

export const FACULTY_DASHBOARD = '/app';
export const STUDENT_DASHBOARD = '/app/student';

/** Where a signed-in user should land based on their stored role. */
export function dashboardForRole(role: string | undefined | null) {
	return role === 'student' ? STUDENT_DASHBOARD : FACULTY_DASHBOARD;
}

/**
 * PocketBase SDK auto-cancellation (and StrictMode's double-invoked effects)
 * reject in-flight requests with `isAbort: true` / `status: 0`. Those are not
 * real errors — a newer fetch for the same data superseded this one — so the
 * caller should ignore them rather than flash an error alert.
 */
export function isAbortError(error: unknown) {
	if (!error) return false;
	if (typeof error === 'object') {
		const err = error as { isAbort?: boolean; status?: number; name?: string };
		if (err.isAbort) return true;
		if (err.status === 0) return true;
		if (err.name === 'AbortError') return true;
	}
	return false;
}

const PB_FIELD_LABELS: Record<string, string> = {
	rps: 'Teks RPS tersusun',
	syllabus: 'Silabus',
	description: 'Deskripsi',
	strategies: 'Strategi pembelajaran',
	workloadNotes: 'Catatan beban kerja',
	assessmentNotes: 'Catatan penilaian',
	prerequisites: 'Prasyarat',
	title: 'Nama',
	code: 'Kode',
	semester: 'Semester',
	academicYear: 'Tahun akademik',
	courseGroup: 'Kelompok mata kuliah',
	lecturerName: 'Dosen pengampu',
	notes: 'Catatan',
	topic: 'Topik',
	learningMaterial: 'Materi pembelajaran',
	learningIndicator: 'Indikator pembelajaran',
	references: 'Referensi',
	feedback: 'Umpan balik',
	content: 'Isi',
	instructions: 'Instruksi',
};

function translateConstraint(message: string) {
	const charMax = message.match(/no more than (\d+) character/);
	if (charMax) {
		return `Tidak boleh lebih dari ${Number(charMax[1]).toLocaleString('id-ID')} karakter.`;
	}
	const charMin = message.match(/at least (\d+) character/);
	if (charMin) return `Minimal ${Number(charMin[1]).toLocaleString('id-ID')} karakter.`;
	if (/cannot be blank|missing required/i.test(message)) return 'Wajib diisi.';
	if (/failed to (update|create) record/i.test(message)) return 'Gagal menyimpan data.';
	const numMax = message.match(/no more than (\d+)/i);
	if (numMax) return `Nilai tidak boleh lebih dari ${numMax[1]}.`;
	const numMin = message.match(/no less than (\d+)/i);
	if (numMin) return `Nilai minimal ${numMin[1]}.`;
	return message;
}

export function errorMessage(error: unknown) {
	if (error && typeof error === 'object' && 'response' in error) {
		const response = (
			error as {
				response?: {
					message?: string;
					data?: Record<string, { message?: string }>;
				};
			}
		).response;
		const fieldEntry =
			response?.data &&
			Object.entries(response.data).find(([, value]) => value?.message);
		if (fieldEntry) {
			const [field, info] = fieldEntry;
			const label = PB_FIELD_LABELS[field];
			const translated = translateConstraint(info.message || '');
			return label ? `${label}: ${translated}` : translated;
		}
		if (response?.message) return translateConstraint(response.message);
		return 'Terjadi kesalahan. Silakan coba lagi.';
	}
	return error instanceof Error ? error.message : 'Terjadi kesalahan. Silakan coba lagi.';
}

export function dateLabel(value: string) {
	if (!value) return 'Tanggal belum diisi';
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? 'Tanggal belum diisi'
		: date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Whether a class session counts toward schedule progress. A session counts
 * as done when it is explicitly marked `completed`, OR its scheduled date has
 * already passed (strictly before the start of "today"). A session dated
 * today is treated as in-progress/upcoming, matching the existing "upcoming"
 * definition. This reflects the RPS/course schedule for progress display
 * without writing completion data to any record.
 *
 * `nowMs` defaults to the current time; pass a fixed value for tests.
 */
export function isSessionDone(
	session: { completed?: boolean; date?: string },
	nowMs: number = Date.now(),
): boolean {
	if (session.completed) return true;
	if (!session.date) return false;
	const time = new Date(
		session.date.includes('T') ? session.date : `${session.date}T00:00:00`,
	).getTime();
	if (Number.isNaN(time)) return false;
	const start = new Date(nowMs);
	const startOfDayMs = new Date(
		start.getFullYear(),
		start.getMonth(),
		start.getDate(),
	).getTime();
	return time < startOfDayMs;
}

/** Schedule progress percentage for a set of sessions, counting completed and
 *  past-dated sessions as done. Returns 0 when there are no sessions. */
export function sessionProgressPct(
	sessions: { completed?: boolean; date?: string }[],
	nowMs: number = Date.now(),
): number {
	if (sessions.length === 0) return 0;
	const done = sessions.filter((s) => isSessionDone(s, nowMs)).length;
	return Math.round((done / sessions.length) * 100);
}
