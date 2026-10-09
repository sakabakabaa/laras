import { PracticeMascot } from './practice-mascot';
import { Link } from 'react-router';
import {
	BookOpen,
	CalendarDays,
	Download,
	GraduationCap,
	Info,
	Library,
	Scale,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Course } from '@/lib/learning';
import { courseSectionPath } from '@/lib/course-sections';

type Props = {
	course: Course;
	routeId: string;
	isStudent: boolean;
};

/**
 * Read-only course information: class code, academic period, credits,
 * lecturer contact, prerequisites, workload, and published RPS/Silabus as
 * reference. No editing — students and lecturers both see the same identity
 * overview; lecturers reach the editing tools from their own rail.
 */
export function CourseInfo({ course, routeId, isStudent }: Props) {
	const fields = [
		{ label: 'Nama mata kuliah', value: course.title },
		{ label: 'Kode', value: course.code },
		{ label: 'Semester', value: course.semester },
		{ label: 'Tahun akademik', value: course.academicYear },
		{ label: 'SKS', value: course.credits != null ? String(course.credits) : '' },
		{ label: 'Kelompok mata kuliah', value: course.courseGroup || '' },
		{ label: 'Dosen pengampu', value: course.lecturerName || '' },
	];

	const workload = [
		{ label: 'Kuliah', value: course.workloadLecture },
		{ label: 'Tutorial', value: course.workloadTutorial },
		{ label: 'Praktik', value: course.workloadPractice },
		{ label: 'Mandiri', value: course.workloadIndependent },
		{ label: 'Total', value: course.workloadTotal },
	].filter((f) => f.value != null);

	return (
		<div className="sci-wrap">
			<div className={`res-head${isStudent ? ' student-page-banner' : ''}`}><span className="student-banner-mascot" aria-hidden="true">{isStudent && <PracticeMascot size={85} />}</span>
				<div>
					<span className="ld-eyebrow">Informasi mata kuliah</span>
					<h2 className="res-title">{course.title}</h2>
					<p className="res-sub">
						Identitas, beban kerja, dan referensi mata kuliah ini. RPS dan Silabus
						yang diterbitkan dosen dapat dibaca sebagai referensi.
					</p>
				</div>
			</div>

			<section className="ld-panel sci-panel">
				<div className="ld-card-head">
					<h2>
						<Info size={16} className="ld-spark" /> Identitas mata kuliah
					</h2>
				</div>
				<div className="sci-grid">
					{fields.map((f) => (
						<div key={f.label} className={`cw-field${f.value ? '' : ' empty'}`}>
							<small>{f.label}</small>
							<span>{f.value || '—'}</span>
						</div>
					))}
				</div>
				{course.description && (
					<div className="cw-desc">
						<small>Deskripsi</small>
						<p>{course.description}</p>
					</div>
				)}
				{course.prerequisites && (
					<div className="cw-desc">
						<small>Prasyarat</small>
						<p>{course.prerequisites}</p>
					</div>
				)}
			</section>

			{workload.length > 0 && (
				<section className="ld-panel sci-panel">
					<div className="ld-card-head">
						<h2>
							<Scale size={16} className="ld-spark" /> Beban kerja
						</h2>
					</div>
					<div className="cw-workload-grid">
						{workload.map((f) => (
							<div key={f.label} className="cw-field">
								<small>{f.label}</small>
								<span>{f.value} jam</span>
							</div>
						))}
					</div>
				</section>
			)}

			<section className="ld-panel sci-panel">
				<div className="ld-card-head">
					<h2>
						<Library size={16} className="ld-spark" /> Referensi & dokumen
					</h2>
				</div>
				<ul className="cw-resource-list">
					{(course.rps || course.rpsFile) && (
						<li>
							<BookOpen size={15} />
							<Link to={courseSectionPath(routeId, 'rps')}>
								RPS {isStudent ? '(hanya baca)' : ''} <Info size={12} />
							</Link>
						</li>
					)}
					{course.syllabus && (
						<li>
							<BookOpen size={15} />
							<Link to={courseSectionPath(routeId, 'silabus')}>
								Silabus {isStudent ? '(hanya baca)' : ''} <Info size={12} />
							</Link>
						</li>
					)}
					{course.rpsFile && (
						<li>
							<Download size={15} />
							<a
								href={pb.files.getURL(course, course.rpsFile)}
								target="_blank"
								rel="noreferrer"
								download
							>
								Unduh PDF RPS asli
							</a>
						</li>
					)}
					{!course.rps && !course.syllabus && !course.rpsFile && (
						<li className="ld-empty-sm">Referensi belum diterbitkan dosen.</li>
					)}
				</ul>
			</section>

			<section className="ld-panel sci-panel">
				<div className="ld-card-head">
					<h2>
						<CalendarDays size={16} className="ld-spark" /> Pintasan
					</h2>
				</div>
				<div className="sci-shortcuts">
					<Link to={courseSectionPath(routeId, 'mata-kuliah')} className="ld-outline-action sm">
						<CalendarDays size={15} /> Sesi
					</Link>
					<Link to={courseSectionPath(routeId, 'tugas')} className="ld-outline-action sm">
						<GraduationCap size={15} /> Tugas
					</Link>
					<Link to={courseSectionPath(routeId, 'berkas')} className="ld-outline-action sm">
						<Library size={15} /> Materi
					</Link>
					{isStudent && (
						<Link to={courseSectionPath(routeId, 'nilai')} className="ld-outline-action sm">
							<Scale size={15} /> Nilai
						</Link>
					)}
				</div>
			</section>
		</div>
	);
}
