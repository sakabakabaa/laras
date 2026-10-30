import { redirect } from 'react-router';
import type { Route } from './+types/course.section';
import { seo } from '@/lib/seo';
import { isCourseSection, SECTION_LABEL, type CourseSection } from '@/lib/course-sections';

export function clientLoader({ params }: Route.ClientLoaderArgs) {
	if (!isCourseSection(params.section || '')) {
		throw redirect(`/app/courses/${params.courseId}`);
	}
	return null;
}
clientLoader.hydrate = true as const;

const COPY: Record<CourseSection, string> = {
	ringkasan: 'Ringkasan kelengkapan RPS, sesi, dan tugas mata kuliah.',
	rps: 'Rencana pembelajaran semester dan capaian terstruktur.',
	silabus: 'Silabus dan garis besar mata kuliah.',
	'mata-kuliah': 'Pertemuan mingguan mata kuliah, mengikuti rencana di RPS.',
	absensi: 'Kehadiran mahasiswa per pertemuan dan kelas, terpisah dari nilai dan pengumpulan.',
	tugas: 'Tugas formal, pengumpulan, dan penilaian.',
	latihan: 'Latihan bahasa personal dari pertemuan terbaru dan umpan balik Anda.',
	berkas: 'Materi dan berkas yang ditautkan ke mata kuliah.',
	mahasiswa: 'Daftar mahasiswa, akun, dan status pendaftaran.',
	nilai: 'Nilai tugas formal, umpan balik dosen, dan tugas yang perlu perhatian.',
	info: 'Identitas, beban kerja, dan referensi mata kuliah.',
	pengaturan: 'Identitas mata kuliah dan pengaturan dosen.',
	analitik: 'Analitik pengumpulan, penilaian, Sub-CPMK, dan sinyal kesulitan mata kuliah.',
};

export function meta({ matches, location, params }: Route.MetaArgs) {
	const section = (isCourseSection(params.section || '') ? params.section : 'ringkasan') as CourseSection;
	const label = SECTION_LABEL[section];
	return seo(
		{ matches, location },
		{
			title: `${label} | LARAS`,
			description: COPY[section],
		},
	);
}

/** Section UI is rendered by the course layout from the URL. */
export default function CourseSectionRoute() {
	return null;
}
