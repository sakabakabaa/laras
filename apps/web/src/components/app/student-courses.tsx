import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, LoaderCircle, Search } from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import { CourseThumb } from '@/components/app/course-thumb';
import { CardCta } from '@/components/card-cta';
import { StudentSectionChip } from '@/components/app/course-sections';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { courseRouteId } from '@/lib/course-route';
import { useT } from '@/lib/i18n';
import pb from '@/lib/pocketbase-client';
import type { ClassSession, Course, Enrollment } from '@/lib/learning';

type EnrichedEnrollment = Enrollment & { expand?: { course?: Course } };

export function StudentCourses() {
	const t = useT();
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
						{t('student.common.retry')}
					</button>
				</div>
			)}
			{loading ? (
				<div className="ld-loading">
				<LoaderCircle size={24} className="spin" /> {t('student.courses.loading')}
				</div>
			) : (
				<div className="ld-student">
					<div className="ld-page-head">
						<span className="ld-eyebrow">{t('student.common.studySpace')}</span>
						<h1>{t('student.courses.title')}</h1>
					</div>
					<section className="ld-panel" aria-label={t('student.courses.enrolled')}>
						<div className="ld-card-head">
							<h2>{t('student.courses.enrolled')}</h2>
							<span className="ld-chip">{enrolled.length === 1 ? t('student.courses.classCountOne') : t('student.courses.classCount', { n: String(enrolled.length) })}</span>
						</div>
						{enrolled.length === 0 ? (
							<div className="ld-empty">
								<div className="ld-empty-icon">
									<BookOpen size={26} strokeWidth={1.4} />
								</div>
								<h3>{t('student.courses.emptyTitle')}</h3>
								<p>{t('student.courses.emptyBody')}</p>
								<Link to="/app/student" className="ld-btn-primary">
									{t('student.common.goToStudySpace')}
								</Link>
							</div>
						) : (
							<>
								<label className="ld-search-bar">
									<Search size={16} strokeWidth={1.75} aria-hidden />
									<input
										type="search"
									placeholder={t('student.courses.searchPlaceholder')}
										value={query}
										onChange={(event) => setQuery(event.target.value)}
									aria-label={t('student.courses.searchLabel')}
									/>
								</label>
								{filtered.length === 0 ? (
									<div className="ld-empty-sm">{t('student.courses.noMatch')}</div>
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
											{course.code || t('student.common.noCode')}
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
											{t('student.courses.sessionCount', { done: String(done), total: String(total) })}
																</span>
															</div>
														</div>
									<CardCta to={`/app/courses/${courseRouteId(course)}`} label={t('sd.open')} />
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
