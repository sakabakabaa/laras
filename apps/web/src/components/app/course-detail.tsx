import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
	BookOpenText,
	CalendarClock,
	CalendarDays,
	Check,
	CheckCircle2,
	Download,
	FileText,
	Layers,
	LoaderCircle,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
} from 'lucide-react';
import { CourseForm } from '@/components/app/course-form';
import { CourseSettings } from '@/components/app/course-settings';
import { SessionForm } from '@/components/app/session-form';
import { StructuredRecords } from '@/components/app/structured-records';
import { CourseWorkspace } from '@/components/app/course-workspace';
import { StudentCourseOverview } from '@/components/app/student-course-overview';
import { StudentGrades } from '@/components/app/student-grades';
import { LecturerGradebook } from '@/components/app/lecturer-gradebook';
import { CourseInfo } from '@/components/app/course-info';
import { CourseAnalytics } from '@/components/app/course-analytics';
import { CourseResources } from '@/components/app/course-resources';
import { CourseAssignments } from '@/components/app/course-assignments';
import { CourseRoster } from '@/components/app/course-roster';
import { AttendanceManager } from '@/components/app/attendance-manager';
import { SectionManager, SectionSelector, useMySection } from '@/components/app/course-sections';
import { useCourseSections } from '@/hooks/use-course-sections';
import { CourseThumb } from '@/components/app/course-thumb';
import { OverflowMenu } from '@/components/app/overflow-menu';
import { SessionDateAutofill } from '@/components/app/session-date-autofill';
import { confirmDialog } from '@/components/confirm-dialog';
import { CharMeter } from '@/components/app/char-meter';
import { useAuth } from '@/hooks/use-auth';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { useCourseByRoute } from '@/hooks/use-course-route';
import { useCourseRecords, type CourseRecords } from '@/hooks/use-course-records';
import { useAssistantPageContext } from '@/components/app/assistant-page-context-provider';
import pb from '@/lib/pocketbase-client';
import { courseRouteId } from '@/lib/course-route';
import type { Course, ClassSession } from '@/lib/learning';
import { dateLabel, errorMessage } from '@/lib/learning';
import { invalidate, invalidateCollections, invalidateCourseData } from '@/lib/local-cache';
import { LIMITS, limitMessage, runeCount } from '@/lib/rps-limits';
import { useT } from '@/lib/i18n';
import { PersonalPractice } from '@/components/app/personal-practice';
import {
	courseSectionPath,
	sectionFromLegacyTab,
	sectionFromPath,
	type CourseSection,
} from '@/lib/course-sections';

export function CourseDetail({ routeId }: { routeId: string }) {
	const t = useT();
	const navigate = useNavigate();
	const { user } = useAuth();
	const role = (user as { role?: string } | null)?.role || 'faculty';
	const isStudent = role === 'student';
	const [searchParams] = useSearchParams();
	const location = useLocation();
	const section = sectionFromPath(location.pathname, routeId);
	const tab =
		section === 'silabus'
			? 'syllabus'
			: section === 'mata-kuliah'
				? 'sessions'
				: section === 'berkas'
					? 'materials'
					: section === 'tugas' || section === 'latihan'
						? 'assignments'
						: section === 'mahasiswa'
							? 'roster'
							: section === 'ringkasan'
								? 'overview'
								: section;
	const [enrollBusy, setEnrollBusy] = useState(false);
	const [error, setError] = useState('');
	const [editingCourse, setEditingCourse] = useState(false);
	const [editingSession, setEditingSession] = useState<ClassSession | 'new' | null>(null);
	const [editingDoc, setEditingDoc] = useState<'rps' | 'syllabus' | null>(null);
	const [autoDates, setAutoDates] = useState(false);
	const [sectionFilter, setSectionFilter] = useState('');
	useEffect(() => {
		setSectionFilter('');
	}, [routeId]);
	const [showSections, setShowSections] = useState(false);

	const [docValue, setDocValue] = useState('');
	const [saving, setSaving] = useState(false);
	// Cached reads — returning to this course reuses rows (TTL + SWR) instead
	// of re-querying PocketBase on every visit. The route param (code slug or
	// legacy id) is resolved to the course record once, then its id drives the
	// remaining PocketBase queries.
	const courseQuery = useCourseByRoute(routeId);
	const course = courseQuery.data ?? null;
	const id = course?.id || '';
	const records = useCourseRecords(id);
	const sectionsState = useCourseSections(id);
	const sections = sectionsState.sections;
	const sessionsQuery = useCachedQuery<ClassSession[]>(
		id ? `class_sessions:course=${id}` : null,
		() =>
			pb.collection('class_sessions').getFullList<ClassSession>({
				filter: pb.filter('course = {:id}', { id }),
				sort: 'week,created',
			}),
	);
	const enrolledQuery = useCachedQuery<{ id: string }[]>(
		isStudent && id ? `enrollments:course=${id}` : null,
		() =>
			pb.collection('enrollments').getFullList({
				filter: pb.filter('course = {:id} && owner = {:me}', {
					id,
					me: pb.authStore.record?.id,
				}),
			}),
	);

	const sessions = sessionsQuery.data ?? [];
	// A student's own kelas, when the course has multiple sections. Used to
	// auto-scope the Pertemuan view so a student sees their class schedule
	// first, not every parallel section at once.
	const mySection = useMySection(isStudent ? id : undefined);
	// Scope the Pertemuan view to the selected kelas when a section filter is
	// active. Unfiltered shows every session (including legacy unsectioned).
	const visibleSessions = useMemo(
		() => (sectionFilter ? sessions.filter((s) => s.section === sectionFilter) : sessions),
		[sessions, sectionFilter],
	);
	const enrolled = (enrolledQuery.data?.length ?? 0) > 0;
	const loading = courseQuery.loading || sessionsQuery.loading;
	const loadError = courseQuery.error || sessionsQuery.error;
	const isFacultyOwner = !isStudent && course?.owner === pb.authStore.record?.id;
	const { setContext: setAssistantPageContext } = useAssistantPageContext();
	const load = useCallback(() => {
		courseQuery.reload();
		sessionsQuery.reload();
		enrolledQuery.reload();
	}, [courseQuery, sessionsQuery, enrolledQuery]);
	const toggleEnroll = async () => {
		if (!course) return;
		setEnrollBusy(true);
		setError('');
		try {
			if (enrolled) {
				const mine = await pb.collection('enrollments').getFullList({
					filter: pb.filter('course = {:id} && owner = {:me}', {
						id: course.id,
						me: pb.authStore.record?.id,
					}),
				});
				await Promise.all(
					mine.map((row, i) =>
						pb.collection('enrollments').delete(row.id, { requestKey: `unenroll-${i}` }),
					),
				);
				invalidate('enrollments');
			} else {
				await pb.collection('enrollments').create({
					course: course.id,
					owner: pb.authStore.record?.id,
				});
				invalidate('enrollments');
			}
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setEnrollBusy(false);
		}
	};
	const saveDoc = async () => {
		if (!course || !editingDoc) return;
		const max = editingDoc === 'rps' ? LIMITS.rps : LIMITS.syllabus;
		const label = editingDoc === 'rps' ? 'Teks RPS' : 'Silabus';
		if (runeCount(docValue) > max) {
			setError(
				limitMessage(label, runeCount(docValue), max, 'Pendekkan dokumen ini.'),
			);
			document.getElementById('document-content')?.focus();
			return;
		}
		setSaving(true);
		setError('');
		try {
			await pb.collection('courses').update<Course>(course.id, {
				[editingDoc]: docValue,
			});
			invalidate('courses');
			setEditingDoc(null);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setSaving(false);
		}
	};
	const removeCourse = async () => {
		if (
			!course ||
			!(await confirmDialog({
				title: 'Hapus mata kuliah',
				message: `Hapus “${course.title}” dan semua sesinya? Tindakan ini tidak dapat dibatalkan.`,
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		try {
			await pb.collection('courses').delete(course.id);
			invalidateCourseData();
			navigate('/app');
		} catch (err) {
			setError(errorMessage(err));
		}
	};
	const removeSession = async (session: ClassSession) => {
		if (
			!(await confirmDialog({
				title: 'Hapus pertemuan',
				message: `Hapus “${session.title}”?`,
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		try {
			await pb.collection('class_sessions').delete(session.id);
			invalidate('class_sessions');
		} catch (err) {
			setError(errorMessage(err));
		}
	};
	const toggleSession = async (session: ClassSession) => {
		try {
			await pb.collection('class_sessions').update<ClassSession>(session.id, {
				completed: !session.completed,
			});
			invalidate('class_sessions');
		} catch (err) {
			setError(errorMessage(err));
		}
	};
	const goSection = useCallback(
		(next: CourseSection, hash = '') => {
			navigate(`${courseSectionPath(routeId, next)}${hash}`);
		},
		[routeId, navigate],
	);
	useEffect(() => {
		const raw = searchParams.get('tab') || '';
		if (!raw) return;
		const next = sectionFromLegacyTab(raw);
		if (!next) return;
		const hash = typeof window === 'undefined' ? '' : window.location.hash;
		navigate(`${courseSectionPath(routeId, next)}${hash}`, { replace: true });
	}, [searchParams, routeId, navigate]);
	useEffect(() => {
		if (section === 'mahasiswa' && isStudent) goSection('ringkasan');
		if (section === 'pengaturan' && !isFacultyOwner && !loading) goSection('ringkasan');
		// Nilai is shared: students see their own grades, lecturers see the
		// gradebook. Non-owners (other faculty) land on Ringkasan.
		if (section === 'nilai' && !isStudent && !isFacultyOwner && !loading) goSection('ringkasan');
	}, [section, isStudent, isFacultyOwner, loading, goSection]);
	// Default a student's Pertemuan filter to their own kelas once, so the
	// schedule they see first is their own class. They can still switch to
	// "Semua kelas" via the SectionSelector. Runs only when the student's
	// section resolves and no manual filter has been picked yet.
	useEffect(() => {
		if (isStudent && mySection.id && !sectionFilter) {
			setSectionFilter(mySection.id);
		}
	}, [isStudent, mySection.id, sectionFilter]);

	// Canonicalize the URL to the course's code slug once the course resolves,
	// so legacy id links and stale code slugs redirect to the current code route.
	// Ignore a course that does not match this route — that row is still the
	// previous mata kuliah, and redirecting it bounces the switcher back.
	useEffect(() => {
		if (!course || courseQuery.loading) return;
		const canonical = courseRouteId(course);
		const matches =
			canonical === routeId || course.id === routeId;
		if (!matches || canonical === routeId) return;
		const hash = typeof window === 'undefined' ? '' : window.location.hash;
		navigate(`${courseSectionPath(canonical, section)}${hash}`, { replace: true });
	}, [course, courseQuery.loading, routeId, section, navigate]);

	// Publish semantic page context for the assistant: the open course, the
	// active section, and the actions available to the lecturer here. Cleared
	// on unmount so a stale course id never leaks to another page.
	useEffect(() => {
		if (!course) return;
		setAssistantPageContext({
			route: location.pathname,
			feature: 'courses',
			entity: { type: 'course', id: course.id },
			state: {
				section,
				courseTitle: course.title,
				courseCode: course.code || '',
				role: isStudent ? 'student' : 'faculty',
			},
			availableActions: isFacultyOwner
				? ['edit_course', 'manage_rps', 'add_session', 'create_assignment']
				: [],
		});
		return () => setAssistantPageContext(null);
	}, [course, section, isStudent, isFacultyOwner, location.pathname, setAssistantPageContext]);
	// Scroll to a linked assignment card once its tab content has rendered.
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const hash = window.location.hash;
		if (!hash) return;
		const scrollToCard = () => {
			const el = document.getElementById(hash.slice(1));
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			return Boolean(el);
		};
		const first = window.setTimeout(() => {
			if (!scrollToCard()) window.setTimeout(scrollToCard, 700);
		}, 250);
		return () => window.clearTimeout(first);
	}, [section, searchParams]);

	const beginDoc = (kind: 'rps' | 'syllabus') => {
		setDocValue(course?.[kind] || '');
		setEditingDoc(kind);
		goSection(kind === 'rps' ? 'rps' : 'silabus');
	};
	return (
		<>
			{loading ? (
				<div className="ld-loading">
				<LoaderCircle size={24} className="spin" /> {isStudent ? t('student.courses.loading') : 'Memuat mata kuliah...'}
				</div>
			) : !course ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<BookOpenText size={26} strokeWidth={1.4} />
					</div>
					<h3>{isStudent ? t('student.courseDetail.notFound') : 'Mata kuliah tidak tersedia'}</h3>
					<p>{loadError || error || (isStudent ? t('student.courseDetail.notFoundDescription') : 'Mata kuliah ini tidak dapat ditemukan.')}</p>
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => navigate('/app')}
					>
						{isStudent ? t('student.courseDetail.backToCourses') : 'Kembali ke mata kuliah'}
					</button>
				</div>
			) : (
				<>
					<div className="ld-detail-head">
						<CourseThumb course={course} className="ld-detail-thumb" />
						<div className="ld-detail-info">
							<span>{course.code || (isStudent ? t('student.common.noCode') : 'Kode belum diisi')}</span>
							<span className="ld-dot" />
							<span>{course.semester || (isStudent ? t('student.common.noSemester') : 'Semester belum diisi')}</span>
							<span className="ld-dot" />
							<span>{course.academicYear || (isStudent ? t('student.courseDetail.noAcademicYear') : 'Tahun akademik belum diisi')}</span>
						</div>
						<div className="ld-detail-actions">
							<SectionSelector sections={sections} value={sectionFilter} onChange={setSectionFilter} />
							{isStudent ? (
								<button
									type="button"
									className={`ld-outline-action${enrolled ? '' : ' primary'}`}
									onClick={() => void toggleEnroll()}
									disabled={enrollBusy}
								>
									{enrollBusy ? (
										<LoaderCircle size={16} className="spin" />
									) : enrolled ? (
										<>
										<Check size={16} /> {t('student.courseDetail.enrolled')}
										</>
									) : (
										<>
										<Plus size={16} /> {t('student.courseDetail.enroll')}
										</>
									)}
								</button>
							) : isFacultyOwner ? (
								<OverflowMenu label="Tindakan mata kuliah">
									<button type="button" role="menuitem" onClick={() => setShowSections(true)}>
										<Layers size={16} /> Kelola kelas
									</button>
									<button type="button" role="menuitem" onClick={() => navigate(`/app/rps/${id}`)}>
										<FileText size={16} /> Kelola RPS
									</button>
									<button type="button" role="menuitem" onClick={() => setEditingCourse(true)}>
										<Pencil size={16} /> Edit detail
									</button>
									<button
										type="button"
										role="menuitem"
										className="danger"
										onClick={() => void removeCourse()}
									>
										<Trash2 size={16} /> Hapus mata kuliah
									</button>
								</OverflowMenu>
							) : null}
						</div>
					</div>
					{section === 'analitik' ? (
						<CourseAnalytics course={course} routeId={routeId} isStudent={isStudent} />
					) : null}
					{section !== 'analitik' && (error || loadError) && (
						<div className="ld-alert" role="alert">
							{error || loadError}{' '}
							{loadError ? (
								<button type="button" onClick={() => load()}>
									Coba lagi
								</button>
							) : (
								<button type="button" onClick={() => setError('')}>
									Tutup
								</button>
							)}
						</div>
					)}
					{tab === 'overview' &&
						(isStudent ? (
							<StudentCourseOverview
								course={course}
								routeId={routeId}
								sessions={sessions}
							/>
						) : (
							<CourseWorkspace
								course={course}
								sessions={sessions}
								records={records}
								isFacultyOwner={isFacultyOwner}
								isStudent={isStudent}
								onEditCourse={() => setEditingCourse(true)}
								onAddSession={() => setEditingSession('new')}
								onTab={(t) => {
									const map = {
										rps: 'rps',
										syllabus: 'silabus',
										sessions: 'mata-kuliah',
										materials: 'berkas',
										assignments: 'tugas',
									} as const;
									goSection(map[t]);
								}}
							/>
						))}
					{tab === 'rps' && (
						<div className="ld-rps-page">
							<header className="ld-rps-head">
								<div>
									<span className="ld-eyebrow">RENCANA PEMBELAJARAN SEMESTER</span>
									<h2>RPS {course.code ? `· ${course.code}` : ''}</h2>
									<p>Capaian, rencana pertemuan, topik, dan penilaian dalam satu tampilan.</p>
								</div>
								{isFacultyOwner && <button type="button" className="ld-btn-primary" onClick={() => navigate(`/app/rps/${id}`)}><FileText size={16} /> Kelola RPS</button>}
							</header>
							<div className="ld-rps-summary" aria-label="Ringkasan RPS">
								{[
									['CPL', records.cpl.length], ['CPMK', records.cpmk.length], ['Sub-CPMK', records.subCpmk.length],
									['Pertemuan', sessions.length], ['Topik', records.topics.length], ['Penilaian', records.assessments.length],
								].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}
							</div>
							<div className="ld-structured-section">
								<div className="ld-structured-head"><div><span className="ld-eyebrow">ISI RPS</span><h2>Capaian dan rencana pembelajaran</h2></div></div>
								<StructuredRecords courseId={id} canEdit={Boolean(isFacultyOwner)} records={records} />
							</div>
							<details className="ld-source-document">
								<summary><span><strong>Dokumen RPS sumber</strong><small>Dokumen asli dan catatan yang disimpan untuk mata kuliah ini</small></span></summary>
								<div className="ld-source-actions">{course.rpsFile && <a className="ld-pdf-download" href={pb.files.getURL(course, course.rpsFile)} target="_blank" rel="noreferrer"><Download size={14} /> Lihat PDF</a>}{isFacultyOwner && <button type="button" className="ld-btn-quiet" onClick={() => beginDoc('rps')}>Edit teks</button>}</div>
								{isFacultyOwner && editingDoc === 'rps' ? <div className="ld-document-edit"><label htmlFor="document-content">Isi RPS</label><textarea id="document-content" autoFocus rows={17} value={docValue} className={runeCount(docValue) > LIMITS.rps ? 'rps-over' : undefined} aria-invalid={runeCount(docValue) > LIMITS.rps || undefined} onChange={(event) => setDocValue(event.target.value)} placeholder="Tulis catatan atau isi dokumen RPS..."/><CharMeter value={docValue} max={LIMITS.rps}/><div className="ld-document-edit-actions"><button type="button" className="ld-btn-quiet" onClick={() => setEditingDoc(null)}>Batal</button><button type="button" className="ld-btn-primary" onClick={() => void saveDoc()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={17}/> : <><Check size={17}/> Simpan dokumen</>}</button></div></div> : course.rps ? <div className="ld-document-content">{course.rps}</div> : <div className="ld-source-empty">Belum ada dokumen sumber tersimpan. RPS terstruktur di atas tetap dapat dikelola.</div>}
							</details>
						</div>
					)}
					{tab === 'syllabus' && (
						<div className="ld-document-view ld-syllabus-page">
							<div className="ld-document-side">
								<span className="ld-eyebrow">
									{'02 / Garis Besar'}
								</span>
								<h2>{'Silabus Anda.'}</h2>
								<p>
									{'Rumah untuk topik, tujuan, dan struktur mata kuliah Anda.'}
								</p>
								{isFacultyOwner && (
									<button
										type="button"
										className="ld-outline-action"
										onClick={() => beginDoc(tab)}
									>
										<Pencil size={16} /> {course[tab] ? 'Edit dokumen' : 'Tambah konten'}
									</button>
								)}
							</div>
							<div className="ld-document-paper">
								<div className="ld-document-paper-header">
									<span>
										{course.code || 'Mata Kuliah'} / {'Silabus'}
									</span>
									<MoreHorizontal size={20} />
								</div>
								{isFacultyOwner && editingDoc === tab ? (
									<div className="ld-document-edit">
										<label htmlFor="document-content">
											{'Isi Silabus'}
										</label>
										<textarea
											id="document-content"
											autoFocus
											rows={17}
											value={docValue}
											className={
												runeCount(docValue) >
												LIMITS.syllabus
													? 'rps-over'
													: undefined
											}
											aria-invalid={
												runeCount(docValue) >
													LIMITS.syllabus || undefined
											}
											onChange={(e) => setDocValue(e.target.value)}
											placeholder={
												'Tulis ringkasan mata kuliah, topik, bacaan, dan aktivitas belajar di sini...'
											}
										/>
										<CharMeter
											value={docValue}
											max={LIMITS.syllabus}
										/>
										<div className="ld-document-edit-actions">
											<button
												type="button"
												className="ld-btn-quiet"
												onClick={() => setEditingDoc(null)}
											>
												Batal
											</button>
											<button
												type="button"
												className="ld-btn-primary"
												onClick={() => void saveDoc()}
												disabled={saving}
											>
												{saving ? (
													<LoaderCircle className="spin" size={17} />
												) : (
													<>
														<Check size={17} /> Simpan dokumen
													</>
												)}
											</button>
										</div>
									</div>
				) : course[tab] ? (
					<SyllabusContent text={course[tab]} />
				) : (
									<div className="ld-document-empty">
										<FileText size={32} strokeWidth={1.3} />
										<h3>
											{isFacultyOwner
												? 'Halaman kosong, penuh kemungkinan.'
												: 'Belum ada materi.'}
										</h3>
										<p>
											{isFacultyOwner
												? `${'Silabus'} Anda belum ditambahkan. Mulai menulis saat siap.`
												: `${'Silabus'} untuk mata kuliah ini belum diterbitkan dosen.`}
										</p>
										{isFacultyOwner && (
											<button
												type="button"
												className="ld-btn-primary"
												onClick={() => beginDoc(tab)}
											>
												<Plus size={17} /> Tambah {'silabus'}
											</button>
										)}
									</div>
								)}
								<div className="ld-document-paper-footer">
									LARAS <span>·</span> {course.title}
								</div>
							</div>
						</div>
					)}
					{tab === 'sessions' && (
						<div className="ld-sessions-view">
							<div className="ld-sessions-head">
								<div>
									<span className="ld-eyebrow">03 / Pertemuan Kelas</span>
									<h2>Semester, sesi demi sesi.</h2>
								</div>
								{isFacultyOwner && (
									<div className="ld-sessions-actions">
										<button
											type="button"
											className="ld-outline-action"
											onClick={() => setAutoDates(true)}
											disabled={visibleSessions.length === 0}
											title="Isi tanggal pertemuan otomatis dari kalender akademik"
										>
											<CalendarClock size={16} /> Atur tanggal
										</button>
										<button
											type="button"
											className="ld-btn-primary"
											onClick={() => setEditingSession('new')}
										>
											<Plus size={17} /> Tambah sesi
										</button>
									</div>
								)}
							</div>
							{visibleSessions.length === 0 ? (
								<div className="ld-empty">
									<div className="ld-empty-icon">
										<CalendarDays size={26} strokeWidth={1.4} />
									</div>
									<h3>{isFacultyOwner ? 'Belum ada di kalender.' : 'Belum ada sesi.'}</h3>
									<p>
										{isFacultyOwner
											? 'Mulai petakan pertemuan, topik, dan catatan untuk mata kuliah ini.'
											: 'Dosen belum merencanakan sesi untuk mata kuliah ini.'}
									</p>
									{isFacultyOwner && (
										<button
											type="button"
											className="ld-btn-primary"
											onClick={() => setEditingSession('new')}
										>
											<Plus size={17} /> Rencanakan sesi pertama
										</button>
									)}
								</div>
							) : (
								<div className="ld-session-list">
									{visibleSessions.map((session) => (
										<article
											className={`ld-session-row${session.completed ? ' done' : ''}`}
											key={session.id}
										>
											{isFacultyOwner ? (
												<button
													type="button"
													className="ld-session-check"
													aria-label={
														session.completed
															? 'Tandai sesi belum selesai'
															: 'Tandai sesi selesai'
													}
													onClick={() => void toggleSession(session)}
												>
													{session.completed && <Check size={16} />}
												</button>
											) : (
												<span
													className="ld-session-check"
													aria-label={session.completed ? 'Sesi selesai' : 'Sesi belum selesai'}
												>
													{session.completed && <Check size={16} />}
												</span>
											)}
											<span className="ld-session-week">
												Minggu
												<br />
												<strong>{String(session.week || '—').padStart(2, '0')}</strong>
											</span>
											<div className="ld-session-desc">
												<small>
													{dateLabel(session.date)}
													{session.completed && ' · Selesai'}
												</small>
												<h3>{session.title}</h3>
												{session.topic && <p>{session.topic}</p>}
												{session.notes && <p className="ld-session-notes">{session.notes}</p>}
												<SessionLinks session={session} records={records} />
											</div>
											{isFacultyOwner && (
												<div className="ld-session-actions">
													<button
														type="button"
														aria-label={`Edit ${session.title}`}
														title="Edit sesi"
														onClick={() => setEditingSession(session)}
													>
														<Pencil size={16} />
													</button>
													<button
														type="button"
														aria-label={`Hapus ${session.title}`}
														title="Hapus sesi"
														onClick={() => void removeSession(session)}
													>
														<Trash2 size={16} />
													</button>
												</div>
											)}
										</article>
									))}
								</div>
							)}
							<div className="ld-sessions-summary">
								<CheckCircle2 size={16} /> {visibleSessions.filter((s) => s.completed).length} dari{' '}
								{visibleSessions.length} sesi selesai
							</div>
						</div>
					)}
				{tab === 'materials' && (
					<CourseResources
						courseId={id}
						canEdit={Boolean(isFacultyOwner)}
						isStudent={isStudent}
					/>
				)}
				{section === 'absensi' && (
					<AttendanceManager
						courseId={id}
						canEdit={Boolean(isFacultyOwner)}
						isStudent={isStudent}
						sectionId={sectionFilter}
					/>
				)}
				{section === 'latihan' && <PersonalPractice courseId={id} />}
				{section === 'tugas' && (
					<CourseAssignments
						courseId={id}
						routeId={routeId}
						canEdit={Boolean(isFacultyOwner)}
						isStudent={isStudent}
						courseLabel={course ? `${course.code ? `${course.code} · ` : ''}${course.title}` : ''}
						activityLock="formal"
					/>
				)}
				{section === 'mahasiswa' && !isStudent && (
					<CourseRoster courseId={id} canEdit={Boolean(isFacultyOwner)} sectionId={sectionFilter} />
				)}
				{section === 'pengaturan' && isFacultyOwner && (
					<CourseSettings
						course={course}
						onEdit={() => setEditingCourse(true)}
						onDelete={() => void removeCourse()}
					/>
				)}
				{section === 'nilai' && isStudent && (
					<StudentGrades course={course} routeId={routeId} />
				)}
				{section === 'nilai' && !isStudent && isFacultyOwner && (
					<LecturerGradebook course={course} />
				)}
				{section === 'info' && (
					<CourseInfo course={course} routeId={routeId} isStudent={isStudent} />
				)}
				</>
			)}
			{editingCourse && course && (
				<CourseForm
					course={course}
					onClose={() => setEditingCourse(false)}
					onSaved={() => {
						setEditingCourse(false);
						void load();
					}}
				/>
			)}
			{editingSession && (
				<SessionForm
					courseId={id}
					session={editingSession === 'new' ? undefined : editingSession}
					onClose={() => setEditingSession(null)}
					onSaved={() => {
						setEditingSession(null);
						void load();
					}}
				/>
			)}
			{autoDates && course && (
				<SessionDateAutofill
					course={course}
					sessions={visibleSessions}
					onClose={() => setAutoDates(false)}
					onApplied={() => void load()}
				/>
			)}
			{showSections && id && (
				<SectionManager courseId={id} onClose={() => setShowSections(false)} />
			)}
		</>
	);
}

/** Renders the capaian / topic / assessment chips linked to a session. */
function SessionLinks({
	session,
	records,
}: {
	session: ClassSession;
	records: CourseRecords;
}) {
	const groups: { label: string; ids: string[]; items: { id: string; code: string; description: string }[] }[] = [
		{ label: 'CPL', ids: session.cpls || [], items: records.cpl },
		{ label: 'CPMK', ids: session.cpmks || [], items: records.cpmk },
		{ label: 'Sub-CPMK', ids: session.subCpmks || [], items: records.subCpmk },
		{ label: 'Topik', ids: session.topics || [], items: records.topics },
		{ label: 'Penilaian', ids: session.assessments || [], items: records.assessments },
	];

	const chips: { group: string; text: string }[] = [];
	for (const group of groups) {
		for (const id of group.ids) {
			const item = group.items.find((row) => row.id === id);
			if (item) {
				chips.push({
					group: group.label,
					text: item.code || item.description,
				});
			}
		}
	}

	if (chips.length === 0) return null;
	return (
		<div className="ld-session-links">
			{chips.map((chip, i) => (
				<span className="ld-session-chip" key={i}>
					<small>{chip.group}</small>
					{chip.text}
				</span>
			))}
		</div>
	);
}

function SyllabusContent({ text }: { text: string }) {
	const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const topics = lines.map((line) => line.match(/^(\d{1,3})[.)]?\s+(.+)$/));

	if (topics.length >= 2 && topics.every(Boolean)) {
		return (
			<div className="ld-syllabus-topics" aria-label="Daftar topik silabus">
				{topics.map((match) => (
					<article className="ld-syllabus-topic" key={match![1]}>
						<span className="ld-syllabus-topic-number" aria-hidden="true">{match![1].padStart(2, '0')}</span>
						<div className="ld-syllabus-topic-copy">
							<strong>{match![2].split(/\s(?=\()/)[0]}</strong>
							{match![2].includes(' (') && <p>{match![2].slice(match![2].indexOf(' (') + 1)}</p>}
						</div>
					</article>
				))}
			</div>
		);
	}

	return <div className="ld-document-content">{text}</div>;
}
