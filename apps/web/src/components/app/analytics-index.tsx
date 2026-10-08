import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { BarChart3, ChevronRight, LoaderCircle } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import type { Course } from '@/lib/learning';
import { courseRouteId } from '@/lib/course-route';
import { courseSectionPath } from '@/lib/course-sections';
import { CourseThumb } from '@/components/app/course-thumb';
import { useAssistantPageContext } from '@/components/app/assistant-page-context-provider';
import '@/styles/course-analytics.css';

export function AnalyticsIndex() {
	const { user } = useAuth();
	const isStudent = (user as { role?: string } | null)?.role === 'student';
	const [courses, setCourses] = useState<Course[] | null>(null);
	const [error, setError] = useState('');
	const location = useLocation();
	const { setContext: setAssistantPageContext } = useAssistantPageContext();
	useEffect(() => {
		setAssistantPageContext({ route: location.pathname, feature: 'analytics' });
		return () => setAssistantPageContext(null);
	}, [location.pathname, setAssistantPageContext]);

	useEffect(() => {
		if (!user?.id) return;
		let alive = true;
		void (async () => {
			try {
				if (isStudent) {
					const enrollments = await pb.collection('enrollments').getFullList<{ course: string }>({
						filter: pb.filter('owner = {:id}', { id: user.id }),
					});
					const ids = enrollments.map((row) => row.course).filter(Boolean);
					if (!ids.length) {
						if (alive) setCourses([]);
						return;
					}
					const filter = ids.map((id) => pb.filter('id = {:id}', { id })).join(' || ');
					const rows = await pb.collection('courses').getFullList<Course>({ filter, sort: 'title' });
					if (alive) setCourses(rows);
					return;
				}
				const rows = await pb.collection('courses').getFullList<Course>({
					filter: pb.filter('owner = {:id}', { id: user.id }),
					sort: 'title',
				});
				if (alive) setCourses(rows);
			} catch {
				if (alive) setError('Daftar mata kuliah gagal dimuat.');
			}
		})();
		return () => {
			alive = false;
		};
	}, [user?.id, isStudent]);

	return (
		<section className="an-index">
			<header className="an-index-head">
				<div>
					<p className="ld-eyebrow">Analitik</p>
					<h1>Analitik mata kuliah</h1>
					<p>
						{isStudent
							? 'Pilih mata kuliah untuk melihat kemajuan Anda. Data teman sekelas tidak ditampilkan.'
							: 'Pilih mata kuliah untuk melihat pengumpulan, penilaian, Sub-CPMK, dan sinyal kesulitan.'}
					</p>
				</div>
			</header>
			{courses === null && !error ? (
				<div className="an-loading">
					<LoaderCircle size={20} className="spin" /> Memuat mata kuliah...
				</div>
			) : error ? (
				<div className="ld-alert" role="alert">{error}</div>
			) : courses == null || courses.length === 0 ? (
				<div className="an-empty an-empty-page">
					<BarChart3 size={22} />
					<strong>{isStudent ? 'Belum ada mata kuliah' : 'Belum ada mata kuliah yang Anda ampu'}</strong>
					<p>
						{isStudent
							? 'Setelah Anda terdaftar di sebuah kelas, analitik pribadi akan muncul di sini.'
							: 'Buat mata kuliah terlebih dahulu. Analitik terisi dari pertemuan, tugas, dan pengumpulan yang sudah ada — tidak ada angka yang dikarang.'}
					</p>
					<Link to="/app/courses" className="an-open">
						Ke mata kuliah <ChevronRight size={16} />
					</Link>
				</div>
			) : (
				<ul className="an-course-list">
					{(courses ?? []).map((course) => (
						<li key={course.id}>
							<CourseThumb course={course} className="an-course-thumb" />
							<div>
								<small>{course.code || 'Kode belum diisi'}</small>
								<strong>{course.title}</strong>
								<span>{[course.semester, course.academicYear].filter(Boolean).join(' · ') || 'Semester belum diisi'}</span>
							</div>
							<Link to={courseSectionPath(courseRouteId(course), 'analitik')} className="an-open">
								Lihat analitik <ChevronRight size={16} />
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
