/**
 * LARAS feature registry for the Asisten Dosen.
 *
 * A centralized, static description of every LARAS feature the assistant may
 * reason about: its label, what it is, the entity types it operates on, the
 * routes it lives at, what data is readable, what actions are writable, and
 * which assistant tools are associated with it. The registry is pure data —
 * no JSX, no server-only imports — so it is safe to import from both client and
 * server, and to unit-test in isolation.
 *
 * The assistant uses it to validate incoming page context (the `feature` and
 * `entity.type` must be known here) and to ground the system prompt with a
 * human-readable description of the page the lecturer is viewing.
 */

export interface FeatureDescriptor {
	/** Stable feature key (used in AssistantPageContext.feature). */
	feature: string;
	/** Indonesian label shown to the lecturer / injected into the prompt. */
	label: string;
	/** Short description of what the feature is for. */
	description: string;
	/** Entity types this feature can be scoped to (e.g. "course", "assignment"). */
	entityTypes: string[];
	/** Route prefixes/patterns associated with the feature. */
	routes: string[];
	/** Kinds of data the assistant may read for this feature. */
	readableData: string[];
	/** Writable actions a lecturer can take in this feature. */
	writableActions: string[];
	/** Assistant tools associated with this feature. */
	tools: string[];
}

export const ASSISTANT_FEATURES: FeatureDescriptor[] = [
	{
		feature: 'dashboard',
		label: 'Dashboard',
		description: 'Ringkasan ruang kerja dosen: mata kuliah, jadwal, dan tugas terbaru.',
		entityTypes: [],
		routes: ['/app', '/app/student'],
		readableData: ['jumlah mata kuliah', 'tugas terbaru', 'jadwal'],
		writableActions: [],
		tools: ['summarize_insights'],
	},
	{
		feature: 'courses',
		label: 'Mata Kuliah',
		description: 'Daftar dan detail mata kuliah milik dosen.',
		entityTypes: ['course'],
		routes: ['/app/courses', '/app/courses/:id'],
		readableData: ['daftar mata kuliah', 'detail mata kuliah', 'jumlah sesi', 'jumlah tugas'],
		writableActions: ['buat mata kuliah', 'edit detail mata kuliah'],
		tools: ['list_courses', 'course_detail', 'create_course'],
	},
	{
		feature: 'rps',
		label: 'RPS',
		description: 'Editor Rencana Pembelajaran Semester: identitas, CPL/CPMK/Sub-CPMK, jadwal pertemuan, penilaian, dan tugas kolaboratif.',
		entityTypes: ['course'],
		routes: ['/app/rps/:id'],
		readableData: ['CPL', 'CPMK', 'Sub-CPMK', 'jadwal pertemuan', 'komponen penilaian'],
		writableActions: ['impor PDF RPS', 'simpan draf RPS'],
		tools: ['import_rps_pdf'],
	},
	{
		feature: 'sessions',
		label: 'Pertemuan',
		description: 'Pertemuan mingguan mata kuliah, mengikuti rencana di RPS.',
		entityTypes: ['session'],
		routes: ['/app/courses/:id/mata-kuliah'],
		readableData: ['daftar pertemuan', 'topik pertemuan', 'capaian terkait'],
		writableActions: ['tambah sesi', 'tandai sesi selesai'],
		tools: [],
	},
	{
		feature: 'assignments',
		label: 'Tugas',
		description: 'Tugas formal dan latihan formatif (Menulis/Berbicara) beserta pengumpulan dan penilaian.',
		entityTypes: ['assignment'],
		routes: ['/app/tugas', '/app/tugas/buat', '/app/courses/:id/tugas', '/app/courses/:id/latihan'],
		readableData: ['daftar tugas', 'status tugas', 'jenis aktivitas'],
		writableActions: ['buat tugas', 'buat latihan persiapan', 'terbitkan tugas'],
		tools: ['list_assignments', 'create_assignment'],
	},
	{
		feature: 'resources',
		label: 'Berkas',
		description: 'Pustaka berkas mata kuliah: unggah, ekstraksi teks, versi, dan konteks akademik.',
		entityTypes: ['resource'],
		routes: ['/app/berkas', '/app/berkas/:fileId'],
		readableData: ['daftar berkas', 'metadata berkas', 'riwayat versi'],
		writableActions: ['unggah berkas', 'proses ulang berkas'],
		tools: [],
	},
	{
		feature: 'roster',
		label: 'Roster Mahasiswa',
		description: 'Daftar mahasiswa, akun, dan status pendaftaran per mata kuliah.',
		entityTypes: ['course'],
		routes: ['/app/courses/:id/mahasiswa'],
		readableData: ['jumlah mahasiswa terdaftar', 'status akun'],
		writableActions: ['aktifkan akun mahasiswa', 'impor roster'],
		tools: [],
	},
	{
		feature: 'analytics',
		label: 'Analitik',
		description: 'Analitik pengumpulan, penilaian, capaian, dan sinyal kesulitan mata kuliah.',
		entityTypes: ['course'],
		routes: ['/analytics', '/app/courses/:id/analitik', '/app/tugas/insights'],
		readableData: ['progres penilaian', 'sinyal kesulitan', 'capaian Sub-CPMK'],
		writableActions: [],
		tools: ['summarize_insights'],
	},
	{
		feature: 'calendar',
		label: 'Kalender Akademik',
		description: 'Kalender akademik dan jadwal pertemuan.',
		entityTypes: [],
		routes: ['/kalender'],
		readableData: ['tanggal akademik', 'jadwal pertemuan'],
		writableActions: [],
		tools: [],
	},
	{
		feature: 'settings',
		label: 'Pengaturan',
		description: 'Profil dan pengaturan akun dosen.',
		entityTypes: [],
		routes: ['/app/pengaturan'],
		readableData: ['profil dosen'],
		writableActions: ['perbarui profil'],
		tools: [],
	},
];

/** Feature lookup by key. */
export const FEATURE_BY_NAME: ReadonlyMap<string, FeatureDescriptor> = new Map(
	ASSISTANT_FEATURES.map((feature) => [feature.feature, feature]),
);

/** Every entity type any feature may scope to. */
export const ENTITY_TYPES: ReadonlySet<string> = new Set(
	ASSISTANT_FEATURES.flatMap((feature) => feature.entityTypes),
);

/** Returns the descriptor for a feature key, or undefined when unknown. */
export function featureDescriptor(feature: string): FeatureDescriptor | undefined {
	return FEATURE_BY_NAME.get(feature);
}
