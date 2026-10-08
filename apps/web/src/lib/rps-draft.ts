/**
 * Client-side draft shape for the full-page RPS editor. Mirrors ParsedRps plus
 * course id / file metadata so progressive saves and step navigation stay in sync.
 */
import type { Course } from '@/lib/learning';

export type DraftItem = { code: string; description: string; id?: string };
export type DraftCpmk = DraftItem & {
	cplCode: string;
	cplId?: string;
	subCpmk: DraftItem[];
	/** "TAKSONOMI" Bloom level (UPI Kriteria Penilaian CPMK). */
	taxonomy?: number | null;
	/** "Bobot" assessment weight % (UPI Kriteria Penilaian CPMK). */
	weight?: number | null;
	/** "Kriteria Pencapaian CPMK" text. */
	criteria?: string;
};
export type DraftAssessment = DraftItem & { weight: number | null };
export type DraftSession = {
	id?: string;
	week: number;
	title: string;
	topic: string;
	objectives?: string;
	activities?: string;
	duration?: string;
	assessment?: string;
	references?: string;
	cplCodes?: string[];
	cpmkCodes?: string[];
	subCpmkCodes?: string[];
	topicCodes?: string[];
	assessmentCodes?: string[];
	cpls?: string[];
	cpmks?: string[];
	subCpmks?: string[];
	topics?: string[];
	assessments?: string[];
	/** normal | uts | uas | khusus — distinguishes teaching vs special weeks. */
	specialWeekType?: 'normal' | 'uts' | 'uas' | 'khusus' | '';
	learningIndicator?: string;
	learningMaterial?: string;
	assessmentMethod?: string;
	assessmentWeight?: number | null;
	synchronousMethod?: string;
	asynchronousMethod?: string;
	accessDateTime?: string;
};
export type DraftCollab = {
	id?: string;
	title: string;
	description: string;
	objectives: string;
	schedule: string;
	groupInfo: string;
	/** "Metode Pembelajaran". */
	method?: string;
	/** "Bobot Penilaian". */
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
	cplCodes?: string[];
	cpmkCodes?: string[];
	subCpmkCodes?: string[];
	assessmentCodes?: string[];
	cpls?: string[];
	cpmks?: string[];
	subCpmks?: string[];
	assessments?: string[];
};

export type RpsDraft = {
	courseId: string | null;
	title: string;
	code: string;
	semester: string;
	academicYear: string;
	description: string;
	syllabus: string;
	strategies: string;
	workload: string;
	references: string;
	credits: number | null;
	prerequisites: string;
	courseGroup: string;
	lecturerName: string;
	publishedAt: string;
	workloadLecture: number | null;
	workloadTutorial: number | null;
	workloadPractice: number | null;
	workloadIndependent: number | null;
	workloadTotal: number | null;
	assessmentNotes: string;
	/** "Diperiksa Oleh TPK Program Studi". */
	reviewerName: string;
	/** "Disetujui Oleh Ketua Program Studi". */
	approverName: string;
	/** "Hasil belajar yang dapat diperagakan/ditunjukkan". */
	demonstrableOutcomes: string;
	/** "Langkah Pembelajaran" prose. */
	learningSteps: string;
	/** Full workload breakdown table (JSON-serializable). */
	workloadBreakdown: unknown;
	/** "Jumlah Jam Ideal". */
	workloadIdealHours: number | null;
	/** "Kesesuaian dengan jumlah SKS". */
	workloadSksMatch: string;
	cplItems: DraftItem[];
	cpmkItems: DraftCpmk[];
	topicItems: DraftItem[];
	assessmentItems: DraftAssessment[];
	sessions: DraftSession[];
	collaborativeTasks: DraftCollab[];
	warnings: string[];
	rpsFileName: string;
	rpsFileUrl: string;
	hasRpsFile: boolean;
};

export const EMPTY_DRAFT: RpsDraft = {
	courseId: null,
	title: '',
	code: '',
	semester: '',
	academicYear: '',
	description: '',
	syllabus: '',
	strategies: '',
	workload: '',
	references: '',
	credits: null,
	prerequisites: '',
	courseGroup: '',
	lecturerName: '',
	publishedAt: '',
	workloadLecture: null,
	workloadTutorial: null,
	workloadPractice: null,
	workloadIndependent: null,
	workloadTotal: null,
	assessmentNotes: '',
	reviewerName: '',
	approverName: '',
	demonstrableOutcomes: '',
	learningSteps: '',
	workloadBreakdown: null,
	workloadIdealHours: null,
	workloadSksMatch: '',
	cplItems: [],
	cpmkItems: [],
	topicItems: [],
	assessmentItems: [],
	sessions: [],
	collaborativeTasks: [],
	warnings: [],
	rpsFileName: '',
	rpsFileUrl: '',
	hasRpsFile: false,
};

export const RPS_STEPS = [
	{ id: 1, key: 'identity', label: 'Identitas Mata Kuliah', short: 'Identitas' },
	{ id: 2, key: 'outcomes', label: 'Deskripsi & Capaian', short: 'Deskripsi' },
	{ id: 3, key: 'plan', label: 'Rencana Pembelajaran', short: 'Rencana' },
	{ id: 4, key: 'workload', label: 'Workload', short: 'Workload' },
	{ id: 5, key: 'assessment', label: 'Kriteria Penilaian', short: 'Penilaian' },
	{ id: 6, key: 'collab', label: 'Tugas Kolaboratif', short: 'Tugas' },
	{ id: 7, key: 'review', label: 'Tinjau & Simpan', short: 'Tinjau' },
] as const;

export type RpsStepKey = (typeof RPS_STEPS)[number]['key'];

export function draftFromCourse(course: Course): RpsDraft {
	return {
		...EMPTY_DRAFT,
		courseId: course.id,
		title: course.title || '',
		code: course.code || '',
		semester: course.semester || '',
		academicYear: course.academicYear || '',
		description: course.description || '',
		syllabus: course.syllabus || '',
		strategies: course.strategies || '',
		workload: course.workloadNotes || '',
		references: '',
		credits: course.credits ?? null,
		prerequisites: course.prerequisites || '',
		courseGroup: course.courseGroup || '',
		lecturerName: course.lecturerName || '',
		publishedAt: course.publishedAt ? String(course.publishedAt).slice(0, 10) : '',
		workloadLecture: course.workloadLecture ?? null,
		workloadTutorial: course.workloadTutorial ?? null,
		workloadPractice: course.workloadPractice ?? null,
		workloadIndependent: course.workloadIndependent ?? null,
		workloadTotal: course.workloadTotal ?? null,
		assessmentNotes: course.assessmentNotes || '',
		reviewerName: course.reviewerName || '',
		approverName: course.approverName || '',
		demonstrableOutcomes: course.demonstrableOutcomes || '',
		learningSteps: course.learningSteps || '',
		workloadBreakdown: course.workloadBreakdown ?? null,
		workloadIdealHours: course.workloadIdealHours ?? null,
		workloadSksMatch: course.workloadSksMatch || '',
		hasRpsFile: Boolean(course.rpsFile),
		rpsFileName: course.rpsFile || '',
	};
}

export function composeRpsText(d: RpsDraft): string {
	const blocks: { heading: string; body: string }[] = [
		{
			heading: 'CAPAIAN PEMBELAJARAN LULUSAN (CPL)',
			body: d.cplItems.map((i) => `${i.code ? i.code + ' ' : ''}${i.description}`).join('\n'),
		},
		{
			heading: 'CAPAIAN PEMBELAJARAN MATA KULIAH (CPMK / Sub-CPMK)',
			body: d.cpmkItems
				.map((i) => {
					const head = `${i.code ? i.code + ' ' : ''}${i.description}`;
					const subs = i.subCpmk
						.map((s) => `  - ${s.code ? s.code + ' ' : ''}${s.description}`)
						.join('\n');
					return subs ? `${head}\n${subs}` : head;
				})
				.join('\n'),
		},
		{ heading: 'STRATEGI PEMBELAJARAN', body: d.strategies },
		{ heading: 'LANGKAH PEMBELAJARAN', body: d.learningSteps },
		{ heading: 'HASIL BELAJAR YANG DAPAT DIPERAGAKAN', body: d.demonstrableOutcomes },
		{
			heading: 'KOMPONEN PENILAIAN',
			body:
				d.assessmentNotes ||
				d.assessmentItems
					.map(
						(i) =>
							`${i.code ? i.code + ' ' : ''}${i.description}${i.weight != null ? ` (${i.weight}%)` : ''}`,
					)
					.join('\n'),
		},
		{ heading: 'BEBAN KERJA', body: d.workload },
		{ heading: 'REFERENSI / DAFTAR PUSTAKA', body: d.references },
	];
	return blocks
		.filter((b) => b.body.trim())
		.map((b) => `${b.heading}\n${b.body.trim()}`)
		.join('\n\n');
}

export function missingFields(d: RpsDraft): string[] {
	const miss: string[] = [];
	if (!d.title.trim()) miss.push('Nama mata kuliah');
	if (!d.code.trim()) miss.push('Kode mata kuliah');
	if (!d.semester.trim()) miss.push('Semester');
	if (!d.description.trim()) miss.push('Deskripsi');
	if (d.cplItems.length === 0) miss.push('CPL');
	if (d.cpmkItems.length === 0) miss.push('CPMK');
	if (d.sessions.length === 0) miss.push('Rencana pertemuan');
	if (d.assessmentItems.length === 0) miss.push('Kriteria penilaian');
	if (d.credits == null) miss.push('SKS');
	return miss;
}

export function isFieldMissing(d: RpsDraft, field: keyof RpsDraft): boolean {
	const v = d[field];
	if (typeof v === 'string') return !v.trim();
	if (typeof v === 'number') return false;
	if (v === null || v === undefined) return true;
	if (Array.isArray(v)) return v.length === 0;
	return false;
}
