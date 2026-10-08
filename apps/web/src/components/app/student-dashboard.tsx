import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowRight,
	BookOpen,
	CalendarDays,
	ClipboardList,
	LoaderCircle,
	PlayCircle,
	Search,
	Sparkles,
} from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import { CourseThumb } from '@/components/app/course-thumb';
import { CardCta } from '@/components/card-cta';
import { StudentSectionChip } from '@/components/app/course-sections';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { Course, ClassSession, Enrollment } from '@/lib/learning';
import { courseRouteId } from '@/lib/course-route';
import { useLanguage, useT } from '@/lib/i18n';
import {
	activityTypeOf,
	studentWorkPath,
	type Assignment,
	type AssignmentSubmission,
} from '@/lib/assignments';

type EnrichedEnrollment = Enrollment & { expand?: { course?: Course } };

/** A session date is usable when it exists and parses to a real timestamp. */
function validDate(value: string) {
	return Boolean(value) && !Number.isNaN(new Date(value).getTime());
}

function studentDate(value: string, language: 'id' | 'en' | 'de') {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : language === 'de' ? 'de-DE' : 'en-GB', {
		day: 'numeric', month: 'short', year: 'numeric',
	}).format(date);
}

type ResumeKind = 'revision' | 'draft' | 'feedback' | 'assigned' | 'practice';

/** Priority rank — the most important next action sorts first. */
const KIND_PRIORITY: Record<ResumeKind, number> = {
	revision: 0,
	draft: 1,
	feedback: 2,
	assigned: 3,
	practice: 4,
};

type ResumeItem = {
	assignment: Assignment;
	submission?: AssignmentSubmission;
	course: Course;
	routeId: string;
	kind: ResumeKind;
	/** Type + skill label, e.g. "Latihan formatif · Berbicara". */
	label: string;
	/** Deep link straight into the course's tugas/latihan section. */
	href: string;
	/** Most recent touch timestamp, for "most recently touched first" ordering. */
	touched: string;
};

/** Build a localized type + skill line for the dashboard. */
function typeLine(kind: ResumeKind, assignment: Assignment, t: (key: string) => string) {
	const base = t(`sd.kind.${kind}`);
	const skill = assignment.shape ? t(`sd.shape.${assignment.shape}`) : '';
	return skill ? `${base} · ${skill}` : base;
}

export function StudentDashboard() {
	const t = useT();
	const language = useLanguage();
	const [query, setQuery] = useState('');
	const [now, setNow] = useState<number | null>(null);

	// `now` is only needed to tell future sessions from past ones, which is a
	// client-only concern. Set it in an effect so the server render and the
	// first client render agree (both render the loading state).
	useEffect(() => {
		setNow(Date.now());
	}, []);

	// Cached reads, returning to the ruang belajar reuses these rows.
	const coursesQuery = useCachedQuery<Course[]>('courses:all:title', () =>
		pb.collection('courses').getFullList<Course>({ sort: 'title' }),
	);
	const enrollmentsQuery = useCachedQuery<EnrichedEnrollment[]>('enrollments:mine', () =>
		pb
			.collection('enrollments')
			.getFullList<EnrichedEnrollment>({
				filter: pb.filter('owner = {:me}', { me: pb.authStore.record?.id }),
				expand: 'course',
				sort: '-created',
			}),
	);
	const sessionsQuery = useCachedQuery<ClassSession[]>('class_sessions:all:date', () =>
		pb.collection('class_sessions').getFullList<ClassSession>({ sort: 'date' }),
	);
	// Student-visible assignments across every enrolled course. The collection's
	// list rule already hides drafts and non-enrolled courses, so this reuses
	// existing data, not a new endpoint.
	const assignmentsQuery = useCachedQuery<Assignment[]>('assignments:student:all', () =>
		pb.collection('assignments').getFullList<Assignment>({
			sort: '-updated',
			expand: 'session,subCpmk,parentAssignment',
		}),
	);
	const me = pb.authStore.record?.id || '';
	const submissionsQuery = useCachedQuery<AssignmentSubmission[]>(
		me ? `assignment_submissions:mine:all:${me}` : null,
		() =>
			pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({
				filter: pb.filter('owner = {:me}', { me }),
				sort: '-updated',
			}),
	);

	const courses = coursesQuery.data ?? [];
	const enrollments = enrollmentsQuery.data ?? [];
	const sessions = sessionsQuery.data ?? [];
	const assignments = assignmentsQuery.data ?? [];
	const submissions = submissionsQuery.data ?? [];
	const loading =
		coursesQuery.loading ||
		enrollmentsQuery.loading ||
		sessionsQuery.loading ||
		assignmentsQuery.loading ||
		submissionsQuery.loading;
	const error =
		coursesQuery.error ||
		enrollmentsQuery.error ||
		sessionsQuery.error ||
		assignmentsQuery.error ||
		submissionsQuery.error;
	const load = () => {
		coursesQuery.reload();
		enrollmentsQuery.reload();
		sessionsQuery.reload();
		assignmentsQuery.reload();
		submissionsQuery.reload();
	};

	const enrolledCourseIds = useMemo(() => new Set(enrollments.map((e) => e.course)), [enrollments]);
	const myCourses = useMemo(
		() => courses.filter((c) => enrolledCourseIds.has(c.id)),
		[courses, enrolledCourseIds],
	);
	const mySessions = useMemo(
		() =>
			sessions
				.filter((s) => enrolledCourseIds.has(s.course))
				.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')),
		[sessions, enrolledCourseIds],
	);
	const myAssignments = useMemo(
		() => assignments.filter((a) => enrolledCourseIds.has(a.course) && a.status !== 'draft'),
		[assignments, enrolledCourseIds],
	);
	const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
	const subsByAssignment = useMemo(() => {
		const map = new Map<string, AssignmentSubmission>();
		for (const s of submissions) if (!map.has(s.assignment)) map.set(s.assignment, s);
		return map;
	}, [submissions]);

	// ── Resume / next-action items ──────────────────────────────
	// In-progress or actionable work: saved drafts, requested revisions,
	// unstarted formal tasks, and repeatable formative practice. Ordered by
	// most recent touch so the work the student just left is on top.
	const resumeItems = useMemo<ResumeItem[]>(() => {
		const items: ResumeItem[] = [];
		for (const assignment of myAssignments) {
			const course = courseById.get(assignment.course);
			if (!course) continue;
			const routeId = courseRouteId(course);
			const formative = activityTypeOf(assignment) === 'formative';
			const submission = subsByAssignment.get(assignment.id);
			const href = studentWorkPath(assignment.id);
			if (formative) {
				items.push({
					assignment,
					submission,
					course,
					routeId,
					kind: 'practice',
					label: typeLine('practice', assignment, t),
					href,
					touched: submission?.updated || assignment.updated,
				});
				continue;
			}
			// Formal task.
			const status = submission?.status;
			if (status === 'draft') {
				items.push({
					assignment,
					submission,
					course,
					routeId,
					kind: 'draft',
									label: typeLine('draft', assignment, t),
					href,
					touched: submission!.updated,
				});
			} else if (status === 'revision') {
				items.push({
					assignment,
					submission,
					course,
					routeId,
					kind: 'revision',
									label: typeLine('revision', assignment, t),
					href,
					touched: submission!.updated,
				});
			} else if (!submission) {
				// Published formal task not yet started.
				items.push({
					assignment,
					course,
					routeId,
					kind: 'assigned',
					label: typeLine('assigned', assignment, t),
					href,
					touched: assignment.updated,
				});
			}
			// A graded formal task with lecturer feedback is a clear next
			// action: review the result, then practise / resubmit if a linked
			// practice exists.
			if (status === 'graded') {
				items.push({
					assignment,
					submission,
					course,
					routeId,
					kind: 'feedback',
					label: typeLine('feedback', assignment, t),
					href,
					touched: submission!.gradedAt || submission!.updated,
				});
			}
			// submitted / late (not yet graded) are awaiting review, not actionable.
		}
		return items.sort((a, b) => {
			const p = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
			if (p !== 0) return p;
			return (b.touched || '').localeCompare(a.touched || '');
		});
	}, [myAssignments, courseById, subsByAssignment, t]);

	const primary = resumeItems[0];
	const rest = resumeItems.slice(1, 4);

	// ── Outstanding task count per course (for course card badges) ──
	const outstandingByCourse = useMemo(() => {
		const counts = new Map<string, number>();
		for (const item of resumeItems) {
			// Graded work with feedback is done, not outstanding — exclude it
			// from the "belum selesai" badge count on course cards.
			if (item.kind === 'feedback') continue;
			counts.set(item.assignment.course, (counts.get(item.assignment.course) || 0) + 1);
		}
		return counts;
	}, [resumeItems]);

	// ── Sessions panel ──────────────────────────────────────────
	// Only treat the panel as time-ordered "upcoming" when at least one
	// session actually has a date. Otherwise group by week so undated rows
	// are not presented as time-sorted.
	const hasDates = mySessions.some((s) => validDate(s.date));
	const incompleteSessions = useMemo(
		() => mySessions.filter((s) => !s.completed),
		[mySessions],
	);

	const todayStart = now === null ? null : new Date(now).setHours(0, 0, 0, 0);
	const upcomingIncompleteSessions = useMemo(
		() => incompleteSessions.filter((session) =>
			validDate(session.date) && todayStart !== null && new Date(session.date).getTime() >= todayStart,
		),
		[incompleteSessions, todayStart],
	);
	const sessionFocus = useMemo<ClassSession | null>(() => {
		if (incompleteSessions.length === 0) return null;
		if (hasDates) {
			return upcomingIncompleteSessions
				.slice()
				.sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0] ?? null;
		}
		return incompleteSessions.slice().sort((a, b) => (a.week || 9999) - (b.week || 9999))[0];
	}, [incompleteSessions, hasDates, upcomingIncompleteSessions]);

	const sessionRest = useMemo<ClassSession[]>(() => {
		if (!sessionFocus) return [];
		const source = hasDates ? upcomingIncompleteSessions : incompleteSessions;
		const others = source.filter((s) => s.id !== sessionFocus.id);
		if (hasDates) {
			return others
				.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
				.slice(0, 4);
		}
		return others.sort((a, b) => (a.week || 9999) - (b.week || 9999)).slice(0, 4);
	}, [sessionFocus, incompleteSessions, upcomingIncompleteSessions, hasDates]);

	const taskProgressByCourse = useMemo(() => {
		const progress = new Map<string, { submitted: number; total: number }>();
		for (const assignment of myAssignments) {
			if (activityTypeOf(assignment) !== 'formal') continue;
			const current = progress.get(assignment.course) ?? { submitted: 0, total: 0 };
			current.total += 1;
			const status = subsByAssignment.get(assignment.id)?.status;
			if (status === 'submitted' || status === 'late' || status === 'graded') current.submitted += 1;
			progress.set(assignment.course, current);
		}
		return progress;
	}, [myAssignments, subsByAssignment]);

	// ── Catalog (only when there is something to browse) ───────
	const catalog = useMemo(
		() =>
			courses.filter((c) => {
				if (enrolledCourseIds.has(c.id)) return false;
				if (!query.trim()) return true;
				const q = query.toLowerCase();
				return (
					c.title.toLowerCase().includes(q) ||
					c.code.toLowerCase().includes(q) ||
					c.description.toLowerCase().includes(q)
				);
			}),
		[courses, enrolledCourseIds, query],
	);

	return (
		<AppShell title={t('sd.title')} eyebrow={t('sd.eyebrow')} variant="saas" hideHeading>
			{error && (
				<div className="ld-alert" role="alert">
					{error}{' '}
					<button type="button" onClick={() => void load()}>
						{t('sd.retry')}
					</button>
				</div>
			)}
			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> {t('sd.loading')}
				</div>
			) : (
				<div className="ld-student">
					<section className="ld-student-welcome">
						<div>
							<h1>{t('sd.welcome')}</h1>
							<p>{t('sd.welcomeSub')}</p>
						</div>
					</section>

					{/* P0, Resume / next action */}
					{primary ? (
						<section className="sd-resume" aria-label={t('sd.resume')}>
							<div className="sd-resume-primary">
								<div className="sd-resume-copy">
									<span className="sd-resume-eyebrow">
										<PlayCircle size={14} /> {t(`sd.kind.${primary.kind}`)}
									</span>
									<h2>{primary.assignment.title}</h2>
									<p className="sd-resume-meta">
										{primary.label} · {primary.course.title}
									</p>
								</div>
								<Link to={primary.href} className="sd-resume-cta">
									{t(`sd.cta.${primary.kind}`)} <ArrowRight size={16} />
								</Link>
							</div>
							{rest.length > 0 && (
								<ul className="sd-resume-others">
									{rest.map((item) => (
										<li key={item.assignment.id}>
											<Link to={item.href} className="sd-resume-other">
												<span className="sd-resume-other-text">
													<small>{item.label}</small>
													<strong>{item.assignment.title}</strong>
													<em>{item.course.title}</em>
												</span>
												<ArrowRight size={15} className="sd-row-arrow" />
											</Link>
										</li>
									))}
								</ul>
							)}
						</section>
					) : (
						<section className="sd-resume sd-resume-empty" aria-label={t('sd.startEyebrow')}>
							<div className="sd-resume-empty-copy">
								<span className="sd-resume-eyebrow">
									<Sparkles size={14} /> {t('sd.startEyebrow')}
								</span>
								<h2>
									{myCourses.length > 0
										? t('sd.startNoActive')
										: t('sd.startFirst')}
								</h2>
								<p>
									{myCourses.length > 0
										? t('sd.startNoActiveSub')
										: t('sd.startFirstSub')}
								</p>
								{myCourses.length > 0 ? (
									<Link
										to={`/app/courses/${courseRouteId(myCourses[0])}`}
										className="sd-resume-cta"
									>
										{t('sd.openCourse')} <ArrowRight size={16} />
									</Link>
								) : catalog.length > 0 ? (
									<a href="#jelajahi" className="sd-resume-cta">
										{t('sd.viewCatalog')} <ArrowRight size={16} />
									</a>
								) : null}
							</div>
						</section>
					)}

					<div className="ld-student-grid">
						<section className="ld-panel">
							<div className="ld-card-head">
								<h2>{t('sd.myCourses')}</h2>
								<span className="ld-chip">{t('sd.classes', { n: String(myCourses.length) })}</span>
							</div>
							{myCourses.length === 0 ? (
								<div className="ld-empty">
									<div className="ld-empty-icon">
										<BookOpen size={26} strokeWidth={1.4} />
									</div>
									<h3>{t('sd.noCourses')}</h3>
									<p>
										{t('sd.noCoursesSub')}
										
									</p>
								</div>
							) : (
								<ul className="sd-course-list">
									{myCourses.map((course) => {
										const courseSessions = mySessions.filter((s) => s.course === course.id);
										const taskProgress = taskProgressByCourse.get(course.id) ?? { submitted: 0, total: 0 };
										const pct = taskProgress.total === 0 ? 0 : Math.round((taskProgress.submitted / taskProgress.total) * 100);
										const next = courseSessions
											.filter((s) => !s.completed && (!hasDates || (todayStart !== null && validDate(s.date) && new Date(s.date).getTime() >= todayStart)))
											.sort((a, b) => {
												if (hasDates) return (a.date || '').localeCompare(b.date || '');
												return (a.week || 9999) - (b.week || 9999);
											})[0];
										const outstanding = outstandingByCourse.get(course.id) || 0;
										return (
											<li key={course.id}>
												<article className="sd-course-card">
													<CourseThumb course={course} />
													<div className="sd-course-body">
														<div className="sd-course-head">
															<strong>{course.title}</strong>
															<StudentSectionChip courseId={course.id} />
															{outstanding > 0 && (
												<span className="sd-task-badge" title={t('sd.outstandingTasks')}>
																	{outstanding}
																</span>
															)}
														</div>
														<small>
															{course.code || t('sd.noCode')}
															{course.semester ? ` · ${course.semester}` : ''}
														</small>
														{next ? (
															<p className="sd-course-next">
																<CalendarDays size={12} />
												{t('sd.next', { n: next.week ? String(next.week).padStart(2, '0') : '-' })}
																{next.title ? ` · ${next.title}` : ''}
															</p>
														) : (
															<p className="sd-course-next muted">
																<CalendarDays size={12} />
																{t('sd.noNext')}
															</p>
														)}
														<div className="sd-course-foot">
															<div className="ld-progress-wrap">
																<div className="ld-progress">
																	<span style={{ width: `${pct}%` }} />
																</div>
																<em>{pct}%</em>
															</div>
															<span className="sd-sesi-count">
										{taskProgress.total > 0
											? t('sd.tasksSubmitted', { done: String(taskProgress.submitted), total: String(taskProgress.total) })
											: t('sd.noFormalTasks')}
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
						</section>

						<aside className="ld-panel">
							<div className="ld-card-head">
								<h2>{hasDates ? t('sd.upcoming') : t('sd.schedule')}</h2>
								<CalendarDays size={18} className="ld-spark" />
							</div>
							{sessionFocus ? (
								<>
									<div className="sd-focus-session">
										<span className="sd-focus-eyebrow">
											{hasDates ? t('sd.nextSession') : t('sd.nextMeeting')}
										</span>
										<strong>{sessionFocus.title || t('sd.noTitle')}</strong>
										<div className="sd-focus-meta">
											<span>
												{t('sd.week', { n: sessionFocus.week ? String(sessionFocus.week).padStart(2, '0') : '-' })}
											</span>
											{hasDates && validDate(sessionFocus.date) ? (
												<span>{studentDate(sessionFocus.date, language)}</span>
											) : null}
											<span>
												{courseById.get(sessionFocus.course)?.title || t('sd.course')}
											</span>
										</div>
									</div>
									{sessionRest.length > 0 && (
										<ul className="sd-session-rest">
											{sessionRest.map((s) => (
												<li key={s.id}>
													<span className="sd-sch-week">
														{s.week ? String(s.week).padStart(2, '0') : '-'}
													</span>
													<div>
														<strong>{s.title || t('sd.noTitle')}</strong>
														<small>
															{courseById.get(s.course)?.title || t('sd.course')}
														{hasDates && validDate(s.date) ? ` · ${studentDate(s.date, language)}` : ''}
														</small>
													</div>
												</li>
											))}
										</ul>
									)}
								</>
							) : (
								<div className="ld-empty-sm">
									{myCourses.length > 0
									? (hasDates ? t('sd.noUpcoming') : t('sd.allDone'))
										: t('sd.noSessions')}
								</div>
							)}
						</aside>
					</div>

					{catalog.length > 0 && (
						<section className="ld-panel" id="jelajahi">
							<div className="ld-card-head">
								<h2>{t('sd.explore')}</h2>
								<span className="ld-chip">{t('sd.available', { n: String(catalog.length) })}</span>
							</div>
							<label className="ld-search-bar">
								<Search size={16} strokeWidth={1.75} aria-hidden />
								<input
									type="search"
									placeholder={t('sd.searchPlaceholder')}
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									aria-label={t('sd.searchLabel')}
								/>
							</label>
							<ul className="ld-course-rows">
								{catalog.map((course) => (
									<li key={course.id}>
										<article className="ld-course-row compact">
											<CourseThumb course={course} />
											<div className="ld-course-meta">
												<strong>{course.title}</strong>
												<small>
													{course.code || t('sd.noCode')}
													{course.semester ? ` · ${course.semester}` : ''}
													{course.rps ? ' · RPS tersedia' : ''}
													{course.syllabus ? ' · Silabus tersedia' : ''}
												</small>
											</div>
											<CardCta to={`/app/courses/${courseRouteId(course)}`} label={t('sd.view')} />
										</article>
									</li>
								))}
							</ul>
						</section>
					)}
				</div>
			)}
		</AppShell>
	);
}
