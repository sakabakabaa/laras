import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, LoaderCircle, Search } from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import { CourseThumb } from '@/components/app/course-thumb';
import { CardCta } from '@/components/card-cta';
import { StudentSectionChip } from '@/components/app/course-sections';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { courseRouteId } from '@/lib/course-route';
import pb from '@/lib/pocketbase-client';
import type { ClassSession, Course, Enrollment } from '@/lib/learning';

type EnrichedEnrollment = Enrollment & { expand?: { course?: Course } };

export function StudentCourses() {
	const [query, setQuery] = useState('');

	const coursesQuery = useCachedQuery<Course[]>('courses:all:title', () =>
		pb.collection('courses').getFullList<Course>({ sort: 'title' }),
	);
	const enrollmentsQuery = useCachedQuery<EnrichedEnrollment[]>('enrollments:mine', () =>
		pb.collection('enrollments').getFullList<EnrichedEnrollment>({
			filter: pb.filter('owner = {:me}', { me: pb.authStore.record?.id }),
			expand: 'course',
			sort: '-created',
		}),
	);
	const sessionsQuery = useCachedQuery<ClassSession[]>('class_sessions:all:date', () =>
		pb.collection('class_sessions').getFullList<ClassSession>({ sort: 'date' }),
	);

	const courses = coursesQuery.data ?? [];
	const enrollments = enrollmentsQuery.data ?? [];
	const sessions = sessionsQuery.data ?? [];
	const loading = coursesQuery.loading || enrollmentsQuery.loading || sessionsQuery.loading;
	const error = coursesQuery.error || enrollmentsQuery.error || sessionsQuery.error;
	const load = () => {
		coursesQuery.reload();
		enrollmentsQuery.reload();
		sessionsQuery.reload();
	};

	const enrolledIds = useMemo(() => new Set(enrollments.map((row) => row.course)), [enrollments]);
	const enrolled = useMemo(
		() => courses.filter((course) => enrolledIds.has(course.id)),
		[courses, enrolledIds],
	);
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return enrolled;
		return enrolled.filter(
			(course) =>
				course.title.toLowerCase().includes(q) ||
				course.code.toLowerCase().includes(q) ||
				course.description.toLowerCase().includes(q) ||
				(course.semester || '').toLowerCase().includes(q),
		);
	}, [enrolled, query]);

	return (
		<AppShell title="Mata Kuliah" eyebrow="Mata Kuliah" variant="saas" hideHeading>
			{error && (
				<div className="ld-alert" role="alert">
					{error}{' '}
					<button type="button" onClick={() => void load()}>
						Coba lagi
					</button>
				</div>
			)}
			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat mata kuliah...
				</div>
			) : (
				<div className="ld-student">
					<div className="ld-page-head">
						<span className="ld-eyebrow">Ruang belajar</span>
						<h1>Mata Kuliah</h1>
					</div>
					<section className="ld-panel" aria-label="Mata kuliah yang diikuti">
						<div className="ld-card-head">
							<h2>Mata kuliah yang diikuti</h2>
							<span className="ld-chip">{enrolled.length} kelas</span>
						</div>
						{enrolled.length === 0 ? (
							<div className="ld-empty">
								<div className="ld-empty-icon">
									<BookOpen size={26} strokeWidth={1.4} />
								</div>
								<h3>Belum ada mata kuliah</h3>
								<p>Daftar mata kuliah dari ruang belajar untuk membuka materi, sesi, dan tugas.</p>
								<Link to="/app/student" className="ld-btn-primary">
									Ke ruang belajar
								</Link>
							</div>
						) : (
							<>
								<label className="ld-search-bar">
									<Search size={16} strokeWidth={1.75} aria-hidden />
									<input
										type="search"
										placeholder="Cari berdasarkan nama, kode, atau semester..."
										value={query}
										onChange={(event) => setQuery(event.target.value)}
										aria-label="Cari mata kuliah"
									/>
								</label>
								{filtered.length === 0 ? (
									<div className="ld-empty-sm">Tidak ada mata kuliah yang cocok dengan pencarian.</div>
								) : (
									<ul className="sd-course-list">
										{filtered.map((course) => {
											const courseSessions = sessions.filter((session) => session.course === course.id);
											const done = courseSessions.filter((session) => session.completed).length;
											const total = courseSessions.length;
											const pct = total === 0 ? 0 : Math.round((done / total) * 100);
											return (
												<li key={course.id}>
													<article className="sd-course-card">
														<CourseThumb course={course} />
														<div className="sd-course-body">
															<div className="sd-course-head">
																<strong>{course.title}</strong>
																<StudentSectionChip courseId={course.id} />
															</div>
															<small>
																{course.code || 'Tanpa kode'}
																{course.semester ? ` · ${course.semester}` : ''}
															</small>
															<div className="sd-course-foot">
																<div className="ld-progress-wrap">
																	<div className="ld-progress">
																		<span style={{ width: `${pct}%` }} />
																	</div>
																	<em>{pct}%</em>
																</div>
																<span className="sd-sesi-count">
																	{done}/{total} sesi
																</span>
															</div>
														</div>
														<CardCta to={`/app/courses/${courseRouteId(course)}`} label="Buka" />
													</article>
												</li>
											);
										})}
									</ul>
								)}
							</>
						)}
					</section>
				</div>
			)}
		</AppShell>
	);
}
