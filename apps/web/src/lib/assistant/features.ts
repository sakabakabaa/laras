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
		description: 'Ringkasan agregat aktivitas tugas yang tersedia untuk dosen.',
		entityTypes: [],
		routes: ['/app'],
		readableData: ['jumlah tugas formal dan formatif', 'jumlah pemeriksaan Cek jawaban', 'jumlah pengumpulan mahasiswa'],
		writableActions: [],
		tools: ['summarize_insights'],
	},
	{
		feature: 'courses',
		label: 'Mata Kuliah',
		description: 'Daftar mata kuliah milik dosen, ringkasan jumlah sesi/tugas/roster, dan pembuatan mata kuliah.',
		entityTypes: ['course'],
		routes: ['/app/courses', '/app/courses/:id'],
		readableData: ['daftar mata kuliah', 'jumlah sesi', 'jumlah tugas formal/formatif', 'jumlah roster'],
		writableActions: ['buat mata kuliah (pratinjau dan konfirmasi)'],
		tools: ['list_courses', 'course_detail', 'create_course'],
	},
	{
		feature: 'rps',
		label: 'RPS',
		description: 'Asisten dapat memetakan PDF RPS yang dilampirkan. Hasilnya belum disimpan; dosen meninjau dan mengimpornya melalui editor RPS.',
		entityTypes: ['course'],
		routes: ['/app/rps/:id'],
		readableData: ['struktur hasil ekstraksi dari PDF RPS yang dilampirkan'],
		writableActions: [],
		tools: ['import_rps_pdf'],
	},
	{
		feature: 'sessions',
		label: 'Pertemuan',
		description: 'Asisten dapat membaca jadwal pertemuan dan kalender akademik; detail materi sesi dapat dipakai untuk mempersempit pencarian materi yang telah disetujui.',
		entityTypes: ['session'],
		routes: ['/app/courses/:id/mata-kuliah'],
		readableData: ['tanggal, topik, dan status sesi'],
		writableActions: [],
		tools: ['calendar_events', 'course_materials'],
	},
	{
		feature: 'assignments',
		label: 'Tugas',
		description: 'Daftar tugas dan statusnya; asisten dapat menyiapkan draf tugas Menulis/Berbicara dari data RPS.',
		entityTypes: ['assignment'],
		routes: ['/app/tugas', '/app/tugas/buat', '/app/courses/:id/tugas', '/app/courses/:id/latihan'],
		readableData: ['daftar tugas', 'status tugas', 'jenis aktivitas'],
		writableActions: ['buat draf tugas/latihan Menulis atau Berbicara (konfirmasi dosen)'],
		tools: ['list_assignments', 'create_assignment'],
	},
	{
		feature: 'resources',
		label: 'Berkas',
		description: 'Asisten dapat mengambil materi mata kuliah yang sudah disetujui untuk konteks AI; tidak dapat mengunggah atau memproses ulang berkas.',
		entityTypes: ['resource'],
		routes: ['/app/berkas', '/app/berkas/:fileId'],
		readableData: ['kutipan materi yang disetujui untuk konteks AI'],
		writableActions: [],
		tools: ['course_materials'],
	},
	{
		feature: 'roster',
		label: 'Roster Mahasiswa',
		description: 'Asisten dapat membaca ringkasan satu mahasiswa yang dipilih pada mata kuliah dosen; preferensi pribadi hanya jika dibagikan. Dapat pula menyiapkan penyalinan roster antarmata kuliah.',
		entityTypes: ['course'],
		routes: ['/app/courses/:id/mahasiswa'],
		readableData: ['jumlah mahasiswa terdaftar', 'profil akademik satu mahasiswa', 'preferensi belajar yang dibagikan'],
		writableActions: ['salin roster antarmata kuliah (pratinjau dan konfirmasi)'],
		tools: ['course_detail', 'student_profile', 'add_roster_students'],
	},
	{
		feature: 'analytics',
		label: 'Analitik',
		description: 'Ringkasan agregat jumlah tugas formal/formatif, pemeriksaan Cek jawaban, dan pengumpulan mahasiswa.',
		entityTypes: ['course'],
		routes: ['/analytics', '/app/courses/:id/analitik', '/app/tugas/insights'],
		readableData: ['jumlah tugas formal/formatif', 'jumlah pemeriksaan Cek jawaban', 'jumlah pengumpulan mahasiswa'],
		writableActions: [],
		tools: ['summarize_insights'],
	},
	{
		feature: 'calendar',
		label: 'Kalender Akademik',
		description: 'Kalender akademik resmi dan jadwal pertemuan mata kuliah milik dosen.',
		entityTypes: [],
		routes: ['/kalender'],
		readableData: ['tanggal akademik resmi', 'tanggal dan topik pertemuan'],
		writableActions: [],
		tools: ['calendar_events'],
	},
	{
		feature: 'settings',
		label: 'Pengaturan',
		description: 'Asisten belum memiliki alat untuk membaca atau mengubah profil dan pengaturan akun.',
		entityTypes: [],
		routes: ['/app/pengaturan'],
		readableData: [],
		writableActions: [],
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
