import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowRight,
	BookOpen,
	CalendarDays,
	ChevronDown,
	ClipboardCheck,
	ClipboardList,
	Download,
	ExternalLink,
	FileText,
	GraduationCap,
	Layers,
	Library,
	LoaderCircle,
	Repeat,
	Scale,
	Sparkles,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Course, ClassSession, FileLibraryRecord } from '@/lib/learning';
import { dateLabel, isSessionDone } from '@/lib/learning';
import { useCachedQuery } from '@/hooks/use-cached-query';
import {
	activityTypeOf,
	isPastDeadline,
	studentGradeLabel,
	studentWorkPath,
	type Assignment,
	type AssignmentSubmission,
} from '@/lib/assignments';
import { useCourseAssignments, useMySubmissions } from '@/hooks/use-course-assignments';
import { useCourseResources } from '@/hooks/use-course-resources';
import { courseSectionPath } from '@/lib/course-sections';
import { useMySection } from '@/components/app/course-sections';
import { useCourseSections } from '@/hooks/use-course-sections';
import { useLanguage, useT } from '@/lib/i18n';

/**
 * A unified materi row: native `course_resources` (file or link) plus
 * auto-linked `file_library` records. Library rows carry their original
 * record so `pb.files.getURL` builds the correct preview URL.
 */
type MateriItem = {
	id: string;
	title: string;
	description: string;
	/** "file" = uploaded binary, "link" = external URL. */
	kind: 'file' | 'link';
	file: string;
	url: string;
	session: string;
	created: string;
	source: 'native' | 'library';
	/** Original record, for `pb.files.getURL` on library rows. */
	record: Record<string, unknown>;
};

/** Resolve a materi item to an openable href (preview for files, URL for links). */
function materiHref(item: MateriItem): string {
	if (item.kind === 'link') return item.url;
	return pb.files.getURL(item.record as { id: string; collectionId?: string; collectionName?: string }, item.file);
}

type Props = {
	course: Course;
	routeId: string;
	sessions: ClassSession[];
};

/**
 * Student-focused course Ringkasan. Replaces the lecturer RPS planning
 * dashboard for students — surfaces what a learner needs: course identity,
 * current progress, the next pertemuan, outstanding tugas/latihan with
 * one-click resume, and a grades snapshot. All data comes from the same
 * PocketBase collections and cached hooks; nothing is mutated here.
 */
export function StudentCourseOverview({ course, routeId, sessions }: Props) {
	const t = useT();
	const language = useLanguage();
	const [descOpen, setDescOpen] = useState(false);
	const { sections } = useCourseSections(course.id);
	const mySection = useMySection(course.id);
	const hasSections = sections.length > 0;
	// When the course carries multiple kelas, scope progress and the next
	// pertemuan to the student's own section so the Ringkasan reflects their
	// class, not every parallel section at once. Sessions without a section
	// (legacy / shared) stay visible to everyone. Single-section courses keep
	// their existing behavior unchanged.
	const mySessions = useMemo(
		() =>
			hasSections && mySection.id
				? sessions.filter((s) => !s.section || s.section === mySection.id)
				: sessions,
		[sessions, hasSections, mySection.id],
	);
	const { assignments, loading: assignmentsLoading } = useCourseAssignments(course.id);
	const studentVisible = useMemo(
		() => assignments.filter((a) => a.status !== 'draft'),
		[assignments],
	);
	const mySubmissions = useMySubmissions(studentVisible);
	const { resources } = useCourseResources(course.id);

	// Auto-link: library files associated with this course also appear as
	// materi. PocketBase access rules enforce visibility — students only see
	// files shared with students, faculty sees their own.
	const libraryQuery = useCachedQuery<FileLibraryRecord[]>(
		course.id ? `file_library:course=${course.id}:sco:-created` : null,
		() =>
			pb.collection('file_library').getFullList<FileLibraryRecord>({
				filter: pb.filter('course = {:id}', { id: course.id }),
				sort: '-created',
			}),
	);

	// Merge native course_resources with auto-linked library files, newest
	// first — the same union the Berkas section shows.
	const materi = useMemo<MateriItem[]>(() => {
		const native: MateriItem[] = resources.map((r) => ({
			id: r.id,
			title: r.title,
			description: r.description,
			kind: r.kind,
			file: r.file,
			url: r.url,
			session: r.session,
			created: r.created,
			source: 'native',
			record: r,
		}));
		const library: MateriItem[] = (libraryQuery.data ?? []).map((r) => ({
			id: r.id,
			title: r.title,
			description: r.description || '',
			kind: 'file',
			file: r.file,
			url: '',
			session: r.session || '',
			created: r.created,
			source: 'library',
			record: r,
		}));
		return [...native, ...library].sort((a, b) => b.created.localeCompare(a.created));
	}, [resources, libraryQuery.data]);

	const submissions = mySubmissions.data ?? [];
	const subByAssignment = useMemo(() => {
		const map = new Map<string, AssignmentSubmission>();
		for (const s of submissions) map.set(s.assignment, s);
		return map;
	}, [submissions]);

	const formal = studentVisible.filter((a) => activityTypeOf(a) === 'formal');
	const formative = studentVisible.filter((a) => activityTypeOf(a) === 'formative');

	// Outstanding formal work: no submission, draft, or revision requested.
	const outstanding = formal
		.filter((a) => {
			const sub = subByAssignment.get(a.id);
			if (!sub) return true;
			return sub.status === 'draft' || sub.status === 'revision';
		})
		.sort((a, b) => {
			const ta = a.deadline ? new Date(a.deadline).getTime() : Infinity;
			const tb = b.deadline ? new Date(b.deadline).getTime() : Infinity;
			return ta - tb;
		});

	// Graded formal work for the snapshot.
	const graded = formal
		.map((a) => subByAssignment.get(a.id))
		.filter((s): s is AssignmentSubmission => s != null && s.status === 'graded');
	const gradeValues = graded
		.map((s) => s.grade)
		.filter((g): g is number => g != null && !Number.isNaN(g));
	const avg =
		gradeValues.length > 0
			? Math.round(gradeValues.reduce((n, g) => n + g, 0) / gradeValues.length)
			: null;

	// Next pertemuan: first incomplete session by week, else the last one.
	const sortedSessions = useMemo(
		() => [...mySessions].sort((a, b) => a.week - b.week),
		[mySessions],
	);
	const nextSession =
		sortedSessions.find((s) => !isSessionDone(s)) ?? sortedSessions[sortedSessions.length - 1] ?? null;
	const sessionsDone = mySessions.filter((s) => isSessionDone(s)).length;
	const progressPct = mySessions.length === 0 ? 0 : Math.round((sessionsDone / mySessions.length) * 100);

	// Materials for the next session, if any.
	const nextSessionMaterials = useMemo(() => {
		if (!nextSession) return [];
		return materi.filter((r) => r.session === nextSession.id);
	}, [materi, nextSession]);

	const loading = assignmentsLoading || mySubmissions.loading || libraryQuery.loading;
	const localizedDate = (value: string) => {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? value ? t('student.overview.dateMissing') : dateLabel(value)
			: new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : language === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'medium' }).format(date);
	};

	if (loading) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={24} className="spin" /> {t('student.overview.loading')}
			</div>
		);
	}

	return (
		<div className="sco-wrap">
			{/* ── Course identity & progress ─────────────────────── */}
			<section className="sco-hero">
				<div className="sco-hero-copy">
					<span className="ld-eyebrow">{t('student.overview.eyebrow')}</span>
					<h1>{course.title}</h1>
					{course.description ? (
						<div className="sco-desc-wrap">
							<button
								type="button"
								className="sco-desc-toggle"
								aria-expanded={descOpen}
								onClick={() => setDescOpen((o) => !o)}
							>
								<span>{t('student.overview.description')}</span>
								<ChevronDown size={16} className={`sco-desc-chev${descOpen ? ' open' : ''}`} />
							</button>
							{descOpen && <p className="sco-hero-desc">{course.description}</p>}
						</div>
					) : (
						<p className="sco-hero-desc">{t('student.overview.noDescription')}</p>
					)}
					<div className="sco-hero-meta">
						{hasSections && (
							<span className="sco-section-badge" title={t('student.overview.yourClass')}>
								<Layers size={14} /> {mySection.name || t('student.overview.noClass')}
							</span>
						)}
						{course.lecturerName && (
							<span>
								<GraduationCap size={14} /> {course.lecturerName}
							</span>
						)}
						{course.code && (
							<span>
								<BookOpen size={14} /> {course.code}
							</span>
						)}
						{course.credits != null && (
							<span>
								<Scale size={14} /> {course.credits} SKS
							</span>
						)}
						{course.semester && <span>{course.semester}</span>}
						{course.academicYear && <span>{course.academicYear}</span>}
					</div>
				</div>
				<div className="sco-progress-card">
					<div className="sco-progress-ring" role="img" aria-label={`${t('student.overview.sessionProgress')} ${progressPct}%`}>
						<svg viewBox="0 0 48 48" aria-hidden>
							<circle cx="24" cy="24" r="20" className="cw-ring-bg" />
							<circle
								cx="24"
								cy="24"
								r="20"
								className="cw-ring-fg"
								strokeDasharray={`${(progressPct / 100) * 125.6} 125.6`}
							/>
						</svg>
						<span>{progressPct}%</span>
					</div>
					<div className="sco-progress-meta">
						<span className="ld-eyebrow">{t('student.overview.sessionProgress')}</span>
						<strong>{t('student.overview.sessionsDone', { done: String(sessionsDone), total: String(mySessions.length) })}</strong>
						<Link to={courseSectionPath(routeId, 'mata-kuliah')} className="ld-text-btn">
							{t('student.overview.viewSessions')} <ArrowRight size={13} />
						</Link>
					</div>
				</div>
			</section>

			<section className="ld-panel sco-panel" aria-label="Latihan Personal">
				<div className="ld-card-head"><h2><Repeat size={16} className="ld-spark" /> Latihan Personal</h2><Link to={courseSectionPath(routeId, 'latihan')} className="ld-text-btn">Buka latihan <ArrowRight size={13} /></Link></div>
				<p className="ld-empty-sm">Lima pertanyaan singkat dari materi pertemuan terbaru, dengan umpan balik dan rujukan materi. Tanpa nilai resmi.</p>
			</section>
			<div className="sco-grid">
				<div className="sco-main">
					{/* ── Next session ─────────────────────────────── */}
					<section className="ld-panel sco-panel">
						<div className="ld-card-head">
							<h2>
								<CalendarDays size={16} className="ld-spark" /> {t('student.overview.nextSession')}
							</h2>
							<Link to={courseSectionPath(routeId, 'mata-kuliah')} className="ld-link-muted">
								{t('student.overview.allSessions')}
							</Link>
						</div>
						{nextSession ? (
							<div className="sco-next">
								<span className="sco-next-week">
								{t('student.overview.week')}
									<strong>{String(nextSession.week || '—').padStart(2, '0')}</strong>
								</span>
								<div className="sco-next-body">
										<small>{localizedDate(nextSession.date)}{nextSession.completed ? ` · ${t('student.overview.completed')}` : ''}</small>
									<h3>{nextSession.title}</h3>
									{nextSession.topic && <p>{nextSession.topic}</p>}
									{nextSession.notes && <p className="sco-next-notes">{nextSession.notes}</p>}
									{nextSessionMaterials.length > 0 && (
										<ul className="sco-next-materials">
											{nextSessionMaterials.map((r) => (
												<li key={r.id}>
													<FileText size={13} />
													{r.kind === 'link' ? (
														<a href={materiHref(r)} target="_blank" rel="noreferrer">
															{r.title} <ExternalLink size={11} />
														</a>
													) : (
														<a href={materiHref(r)} target="_blank" rel="noreferrer">
															{r.title} <Download size={11} />
														</a>
													)}
												</li>
											))}
										</ul>
									)}
									{nextSession.references && (
										<p className="sco-next-prep">
											<small>{t('student.overview.preparation')}</small>
											{nextSession.references}
										</p>
									)}
								</div>
							</div>
						) : (
							<p className="ld-empty-sm">{t('student.overview.noSessions')}</p>
						)}
					</section>

					{/* ── Outstanding tasks & practice ─────────────── */}
					<section className="ld-panel sco-panel">
						<div className="ld-card-head">
							<h2>
								<ClipboardList size={16} className="ld-spark" /> {t('student.overview.activeWork')}
							</h2>
							<Link to={courseSectionPath(routeId, 'tugas')} className="ld-link-muted">
								{t('student.overview.allTasks')}
							</Link>
						</div>
						{outstanding.length === 0 && formative.length === 0 ? (
							<p className="ld-empty-sm">
								{t('student.overview.noActiveWork')}
							</p>
						) : (
							<ul className="sco-task-list">
				{outstanding.map((a) => {
					const sub = subByAssignment.get(a.id);
					const past = isPastDeadline(a.deadline);
					const daysUntilDeadline = a.deadline ? Math.ceil((new Date(a.deadline).getTime() - Date.now()) / 86_400_000) : null;
									const revision = sub?.status === 'revision';
									const draft = sub?.status === 'draft';
									return (
										<li key={a.id}>
											<Link
												to={studentWorkPath(a.id)}
												className="sco-task-row"
											>
												<span className="sco-task-info">
													<small>
														{revision
										? t('worksheet.status.revision')
															: draft
											? t('sd.kind.draft')
																: past
											? t('student.overview.deadlinePassed')
											: t('worksheet.formalTask')}
										{a.deadline && ` · ${new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : language === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(a.deadline))}`}
													</small>
													<strong>{a.title}</strong>
													{a.deadline && (
								<em className={past && !revision ? 'overdue' : ''}>
										{past ? t('student.overview.overdue') : daysUntilDeadline != null && daysUntilDeadline <= 1 ? t('student.overview.dueToday') : t('student.overview.dueIn', { n: String(daysUntilDeadline ?? 0) })}
									</em>
													)}
												</span>
												<span className="sco-task-cta">
								{revision ? t('sd.cta.revision') : draft ? t('sd.cta.draft') : t('sd.cta.assigned')}
													<ArrowRight size={14} />
												</span>
											</Link>
										</li>
									);
								})}
								{formative.slice(0, 3).map((a) => (
									<li key={a.id}>
										<Link
											to={studentWorkPath(a.id)}
											className="sco-task-row formative"
										>
											<span className="sco-task-info">
												<small>
									<Repeat size={11} /> {t('worksheet.formativeExercise')} · {t('student.overview.ungraded')}
												</small>
												<strong>{a.title}</strong>
											</span>
											<span className="sco-task-cta">
								{t('sd.cta.practice')}
												<ArrowRight size={14} />
											</span>
										</Link>
									</li>
								))}
							</ul>
						)}
					</section>

					{/* ── Recent materials ─────────────────────────── */}
					<section className="ld-panel sco-panel">
						<div className="ld-card-head">
							<h2>
								<Library size={16} className="ld-spark" /> {t('student.overview.recentMaterials')}
							</h2>
							<Link to={courseSectionPath(routeId, 'berkas')} className="ld-link-muted">
								{t('student.overview.allMaterials')}
							</Link>
						</div>
						{materi.length === 0 ? (
							<p className="ld-empty-sm">{t('student.overview.noMaterials')}</p>
						) : (
							<ul className="sco-simple-list">
								{materi.slice(0, 5).map((r) => (
									<li key={`${r.source}:${r.id}`}>
										<FileText size={14} className="cw-res-ico" />
										<a
											href={materiHref(r)}
											target="_blank"
											rel="noreferrer"
											title={r.description || r.title}
										>
											{r.title}
										</a>
										<span className="cw-weight">
							{r.kind === 'link' ? t('student.overview.link') : t('student.overview.file')}
										</span>
									</li>
								))}
								{materi.length > 5 && (
					<li className="cw-more-li">{t('student.overview.moreMaterials', { n: String(materi.length - 5) })}</li>
								)}
							</ul>
						)}
					</section>
				</div>

				{/* ── Side column: grades + references ─────────────── */}
				<aside className="sco-side">
					<section className="ld-panel sco-panel">
						<div className="ld-card-head">
							<h2>
								<GraduationCap size={16} className="ld-spark" /> {t('student.overview.grades')}
							</h2>
							<Link to={courseSectionPath(routeId, 'nilai')} className="ld-link-muted">
							{t('student.overview.details')}
							</Link>
						</div>
						<div className="sco-grade-hero">
							<strong>{avg != null ? studentGradeLabel(avg) : '—'}</strong>
							<span>{gradeValues.length > 0 ? t('student.overview.average') : t('student.overview.noGrades')}</span>
						</div>
						<ul className="sco-grade-list">
							<li>
								<span>{t('student.overview.graded')}</span>
								<strong>{graded.length}</strong>
							</li>
							<li>
								<span>{t('worksheet.formalTask')}</span>
								<strong>{formal.length}</strong>
							</li>
							<li>
								<span>{t('worksheet.notSubmitted')}</span>
								<strong>{outstanding.length}</strong>
							</li>
						</ul>
					</section>

					<section className="ld-panel sco-panel">
						<div className="ld-card-head">
							<h2>
								<Sparkles size={16} className="ld-spark" /> {t('student.overview.references')}
							</h2>
						</div>
						<ul className="sco-ref-list">
							{(course.rps || course.rpsFile) && (
								<li>
									<FileText size={15} />
									<Link to={courseSectionPath(routeId, 'rps')}>{t('student.overview.rps')}</Link>
								</li>
							)}
							{course.syllabus && (
								<li>
									<BookOpen size={15} />
									<Link to={courseSectionPath(routeId, 'silabus')}>{t('student.overview.syllabus')}</Link>
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
										{t('student.overview.downloadRps')}
									</a>
								</li>
							)}
							{!course.rps && !course.syllabus && !course.rpsFile && (
								<li className="ld-empty-sm">{t('student.overview.noReferences')}</li>
							)}
						</ul>
					</section>

					<section className="ld-panel sco-panel">
						<div className="ld-card-head">
							<h2>
								<ClipboardCheck size={16} className="ld-spark" /> {t('student.overview.courseInfo')}
							</h2>
						</div>
						<Link to={courseSectionPath(routeId, 'info')} className="ld-text-btn">
							{t('student.overview.viewCourseInfo')} <ArrowRight size={13} />
						</Link>
					</section>
				</aside>
			</div>
		</div>
	);
}
