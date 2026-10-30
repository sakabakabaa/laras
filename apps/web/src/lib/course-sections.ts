export const COURSE_SECTIONS = [
	'ringkasan',
	'rps',
	'silabus',
	'mata-kuliah',
	'absensi',
	'tugas',
	'latihan',
	'berkas',
	'nilai',
	'info',
	'mahasiswa',
	'pengaturan',
	'analitik',
] as const;

export type CourseSection = (typeof COURSE_SECTIONS)[number];

const LEGACY_TAB: Record<string, CourseSection> = {
	overview: 'ringkasan',
	ringkasan: 'ringkasan',
	rps: 'rps',
	syllabus: 'silabus',
	silabus: 'silabus',
	sessions: 'mata-kuliah',
	sesi: 'mata-kuliah',
	'mata-kuliah': 'mata-kuliah',
	materials: 'berkas',
	materi: 'berkas',
	berkas: 'berkas',
	assignments: 'tugas',
	tugas: 'tugas',
	latihan: 'latihan',
	formative: 'latihan',
	roster: 'mahasiswa',
	mahasiswa: 'mahasiswa',
	nilai: 'nilai',
	grades: 'nilai',
	info: 'info',
	'detail': 'info',
	pengaturan: 'pengaturan',
	settings: 'pengaturan',
	analitik: 'analitik',
	analytics: 'analitik',
};

export function isCourseSection(value: string): value is CourseSection {
	return (COURSE_SECTIONS as readonly string[]).includes(value);
}

export function courseSectionPath(courseId: string, section: CourseSection) {
	if (section === 'ringkasan') return `/app/courses/${courseId}`;
	return `/app/courses/${courseId}/${section}`;
}

export function sectionFromPath(pathname: string, courseId: string): CourseSection {
	const base = `/app/courses/${courseId}`;
	if (pathname === base || pathname === `${base}/`) return 'ringkasan';
	const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : '';
	const head = rest.split('/')[0] || '';
	return isCourseSection(head) ? head : 'ringkasan';
}

export function sectionFromLegacyTab(tab: string): CourseSection | null {
	return LEGACY_TAB[tab.trim().toLowerCase()] ?? null;
}

export const SECTION_LABEL: Record<CourseSection, string> = {
	ringkasan: 'Ringkasan',
	rps: 'RPS',
	silabus: 'Silabus',
	'mata-kuliah': 'Pertemuan',
	absensi: 'Absensi & Keaktivan',
	tugas: 'Tugas',
	latihan: 'Latihan',
	berkas: 'Berkas',
	nilai: 'Nilai',
	info: 'Info Mata Kuliah',
	mahasiswa: 'Mahasiswa',
	pengaturan: 'Pengaturan',
	analitik: 'Analitik',
};

/**
 * Student-facing rail labels. A few sections are relabelled for students so
 * the navigation reads as a learning space rather than a lecturer workspace
 * (e.g. "Mata Kuliah" pertemuan tab → "Sesi", "Berkas" → "Materi").
 */
export const SECTION_LABEL_STUDENT: Partial<Record<CourseSection, string>> = {
	'mata-kuliah': 'Pertemuan',
	berkas: 'Materi',
};

/** Sections shown in the student course rail, in order. */
export const STUDENT_COURSE_SECTIONS: CourseSection[] = [
	'ringkasan',
	'mata-kuliah',
	'absensi',
	'tugas',
	'latihan',
	'berkas',
	'nilai',
	'analitik',
	'info',
];

/** Sections shown in the lecturer course rail, in order. */
export const FACULTY_COURSE_SECTIONS: CourseSection[] = [
	'ringkasan',
	'rps',
	'silabus',
	'mata-kuliah',
	'absensi',
	'tugas',
	'latihan',
	'nilai',
	'berkas',
	'analitik',
	'mahasiswa',
	'pengaturan',
];
