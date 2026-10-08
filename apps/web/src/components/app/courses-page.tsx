import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
	BookOpen,
	CalendarDays,
	ClipboardList,
	FileText,
	FileUp,
	LayoutGrid,
	List,
	LoaderCircle,
	Plus,
	Search,
	Users,
} from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import { CourseCatalogCard, type CourseCatalogStats } from '@/components/app/course-catalog-card';
import { CourseThumbDialog } from '@/components/app/course-thumb-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { Assignment } from '@/lib/assignments';
import type { Course, ClassSession, CourseRosterEntry, Enrollment, FileLibraryRecord } from '@/lib/learning';
import { isSessionDone } from '@/lib/learning';
import { courseCoverFor } from '@/lib/course-thumb';

type StatusFilter = 'all' | 'active' | 'draft';
type SortKey = 'created' | 'title' | 'progress';

function semesterKey(course: Course) {
	return [course.semester, course.academicYear].filter(Boolean).join(' · ') || 'Tanpa semester';
}

function formatIdDate(iso: string) {
	if (!iso) return '';
	const date = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
	if (Number.isNaN(date.getTime())) return '';
	const label = new Intl.DateTimeFormat('id-ID', {
		weekday: 'long',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(date);
	return label.charAt(0).toUpperCase() + label.slice(1);
}

function startOfToday() {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function CoursesPage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [query, setQuery] = useState('');
	const [status, setStatus] = useState<StatusFilter>('all');
	const [semester, setSemester] = useState('all');
	const [sort, setSort] = useState<SortKey>('created');
	const [layout, setLayout] = useState<'grid' | 'list'>('grid');
	const [thumbCourse, setThumbCourse] = useState<Course | null>(null);

	const displayName = user?.name || 'Dosen';
	const me = pb.authStore.record?.id;

	const coursesQuery = useCachedQuery<Course[]>('courses:all:-created', () =>
		pb.collection('courses').getFullList<Course>({ sort: '-created' }),
	);
	const sessionsQuery = useCachedQuery<ClassSession[]>('class_sessions:all:date', () =>
		pb.collection('class_sessions').getFullList<ClassSession>({ sort: 'date' }),
	);
	const rosterQuery = useCachedQuery<CourseRosterEntry[]>('course_roster:all', () =>
		pb.collection('course_roster').getFullList<CourseRosterEntry>({ sort: 'nim' }),
	);
	const enrollmentsQuery = useCachedQuery<Enrollment[]>('enrollments:all', () =>
		pb.collection('enrollments').getFullList<Enrollment>({ sort: '-created' }),
	);
	const assignmentsQuery = useCachedQuery<Assignment[]>('assignments:all:-created', () =>
		pb.collection('assignments').getFullList<Assignment>({ sort: '-created' }),
	);
	const filesQuery = useCachedQuery<FileLibraryRecord[]>('file_library:all:-created', () =>
		pb.collection('file_library').getFullList<FileLibraryRecord>({ sort: '-created' }),
	);

	const courses = useMemo(
		() => (coursesQuery.data ?? []).filter((c) => c.owner === me),
		[coursesQuery.data, me],
	);
	const sessions = useMemo(
		() => (sessionsQuery.data ?? []).filter((s) => s.owner === me),
		[sessionsQuery.data, me],
	);
	const roster = useMemo(
		() => (rosterQuery.data ?? []).filter((row) => row.owner === me),
		[rosterQuery.data, me],
	);
	const enrollments = enrollmentsQuery.data ?? [];
	const assignments = useMemo(
		() => (assignmentsQuery.data ?? []).filter((row) => row.owner === me),
		[assignmentsQuery.data, me],
	);
	const files = useMemo(
		() => (filesQuery.data ?? []).filter((row) => row.owner === me),
		[filesQuery.data, me],
	);

	const loading = coursesQuery.loading || sessionsQuery.loading;
	const error = coursesQuery.error || sessionsQuery.error;
	const load = useCallback(() => {
		coursesQuery.reload();
		sessionsQuery.reload();
		rosterQuery.reload();
		enrollmentsQuery.reload();
		assignmentsQuery.reload();
		filesQuery.reload();
	}, [coursesQuery, sessionsQuery, rosterQuery, enrollmentsQuery, assignmentsQuery, filesQuery]);

	const catalog = useMemo(() => {
		const today = startOfToday();
		return courses.map((course): CourseCatalogStats => {
			const courseSessions = sessions
				.filter((s) => s.course === course.id)
				.slice()
				.sort((a, b) => a.week - b.week || a.date.localeCompare(b.date));
			const done = courseSessions.filter((s) => isSessionDone(s, today)).length;
			const upcomingSessions = courseSessions.filter((s) => {
				if (s.completed) return false;
				if (!s.date) return true;
				const time = new Date(s.date.includes('T') ? s.date : `${s.date}T00:00:00`).getTime();
				return Number.isNaN(time) || time >= today;
			});
			const rosterRows = roster.filter((row) => row.course === course.id);
			const accountRows = enrollments.filter((row) => row.course === course.id);
			const students = rosterRows.length || accountRows.length;
			const formal = assignments.filter(
				(row) => row.course === course.id && row.activityType !== 'formative',
			);
			const tasked = new Set(formal.map((row) => row.session).filter(Boolean));
			const gap = upcomingSessions.find((s) => !tasked.has(s.id)) ?? null;
			const next = upcomingSessions[0] ?? null;
			const materials = files.filter((row) => row.course === course.id);
			return {
				course,
				cover: courseCoverFor(course),
				students,
				accounts: accountRows.length,
				unactivated: rosterRows.length > accountRows.length ? rosterRows.length - accountRows.length : 0,
				sessions: courseSessions.length,
				done,
				upcoming: upcomingSessions.length,
				pct: courseSessions.length === 0 ? 0 : Math.round((done / courseSessions.length) * 100),
				materials: materials.length,
				publishedMaterials: materials.filter((row) => row.access === 'student' || row.access === 'public').length,
				tasks: formal.length,
				activeTasks: formal.filter((row) => row.status === 'published').length,
				draftTasks: formal.filter((row) => row.status === 'draft').length,
				nextSession: next
					? { week: next.week, dateLabel: formatIdDate(next.date), title: next.title || next.topic }
					: null,
				attention: gap ? { week: gap.week, title: gap.title || gap.topic } : null,
				active: Boolean(course.publishedAt || course.rps || course.syllabus || courseSessions.length),
			};
		});
	}, [courses, sessions, roster, enrollments, assignments, files]);

	const semesters = useMemo(() => {
		const values = new Set(catalog.map((item) => semesterKey(item.course)));
		return [...values];
	}, [catalog]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const rows = catalog.filter((item) => {
			if (status === 'active' && !item.active) return false;
			if (status === 'draft' && item.active) return false;
			if (semester !== 'all' && semesterKey(item.course) !== semester) return false;
			if (!q) return true;
			const course = item.course;
			return (
				course.title.toLowerCase().includes(q) ||
				course.code.toLowerCase().includes(q) ||
				course.semester.toLowerCase().includes(q) ||
				course.description.toLowerCase().includes(q)
			);
		});
		rows.sort((a, b) => {
			if (sort === 'title') return a.course.title.localeCompare(b.course.title, 'id');
			if (sort === 'progress') return b.pct - a.pct || a.course.title.localeCompare(b.course.title, 'id');
			return b.course.created.localeCompare(a.course.created);
		});
		return rows;
	}, [catalog, query, status, semester, sort]);

	const totals = useMemo(() => {
		const semesterLabels = new Set(filtered.map((item) => semesterKey(item.course)).filter((label) => label !== 'Tanpa semester'));
		return {
			courses: filtered.length,
			semesterLabel: semesterLabels.size === 1 ? [...semesterLabels][0] : semesterLabels.size > 1 ? `${semesterLabels.size} semester` : 'Belum ada semester',
			students: filtered.reduce((sum, item) => sum + item.students, 0),
			materials: filtered.reduce((sum, item) => sum + item.materials, 0),
			activeTasks: filtered.reduce((sum, item) => sum + item.activeTasks, 0),
			draftTasks: filtered.reduce((sum, item) => sum + item.draftTasks, 0),
			sessions: filtered.reduce((sum, item) => sum + item.sessions, 0),
			done: filtered.reduce((sum, item) => sum + item.done, 0),
		};
	}, [filtered]);

	const hasCourses = courses.length > 0;

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

			<div className="ld-page-head mk-head">
				<span className="ld-eyebrow">Ruang Kerja</span>
				<h1>Mata Kuliah Saya</h1>
				<p>Kelola mata kuliah, RPS, materi, tugas, penilaian, dan mahasiswa.</p>
			</div>

			<div className="mk-toolbar">
				<label className="ld-search-bar mk-search">
					<Search size={16} strokeWidth={1.75} aria-hidden />
					<input
						type="search"
						placeholder="Cari mata kuliah berdasarkan nama, kode, atau deskripsi..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label="Cari mata kuliah"
					/>
				</label>
				<label className="mk-select">
					<span className="sr-only">Status</span>
					<select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filter status">
						<option value="all">Semua status</option>
						<option value="active">Aktif</option>
						<option value="draft">Draf</option>
					</select>
				</label>
				<label className="mk-select">
					<span className="sr-only">Semester</span>
					<select value={semester} onChange={(e) => setSemester(e.target.value)} aria-label="Filter semester">
						<option value="all">Semua semester</option>
						{semesters.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				</label>
				<button type="button" className="ld-btn-primary mk-create" onClick={() => navigate('/app/rps/new?import=1')}>
					<Plus size={17} /> Buat Mata Kuliah
				</button>
			</div>

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat mata kuliah...
				</div>
			) : !hasCourses ? (
				<div className="ld-empty ld-empty-lg">
					<div className="ld-empty-icon">
						<BookOpen size={28} strokeWidth={1.4} />
					</div>
					<h3>{`Selamat datang, ${displayName}`}</h3>
					<p>
						Kelas pertama Anda dimulai di sini. Buat mata kuliah atau impor RPS dari PDF untuk menyatukan silabus, RPS, dan sesi dalam satu tempat.
					</p>
					<div className="ld-empty-actions">
						<button type="button" className="ld-btn-primary" onClick={() => navigate('/app/rps/new?import=1')}>
							<FileUp size={16} /> Buat mata kuliah pertama
						</button>
					</div>
				</div>
			) : (
				<>
					<ul className="mk-stats">
						<li>
							<span className="mk-stat-ico rose">
								<BookOpen size={16} />
							</span>
							<div>
								<strong>{totals.courses}</strong>
								<small>Mata kuliah</small>
								<em>{totals.semesterLabel}</em>
							</div>
						</li>
						<li>
							<span className="mk-stat-ico blue">
								<Users size={16} />
							</span>
							<div>
								<strong>{totals.students}</strong>
								<small>Total mahasiswa</small>
								<em>{totals.courses} mata kuliah</em>
							</div>
						</li>
						<li>
							<span className="mk-stat-ico green">
								<FileText size={16} />
							</span>
							<div>
								<strong>{totals.materials}</strong>
								<small>Materi</small>
								<em>Di {totals.courses} mata kuliah</em>
							</div>
						</li>
						<li>
							<span className="mk-stat-ico violet">
								<ClipboardList size={16} />
							</span>
							<div>
								<strong>{totals.activeTasks}</strong>
								<small>Tugas aktif</small>
								<em>{totals.draftTasks > 0 ? `${totals.draftTasks} belum dibuat` : 'Tidak ada draf'}</em>
							</div>
						</li>
						<li>
							<span className="mk-stat-ico amber">
								<CalendarDays size={16} />
							</span>
							<div>
								<strong>{totals.sessions}</strong>
								<small>Total sesi</small>
								<em>{totals.done} sesi selesai</em>
							</div>
						</li>
					</ul>

					<section className="mk-board">
						<div className="mk-board-head">
							<h2>Semua Mata Kuliah ({filtered.length})</h2>
							<div className="mk-board-tools">
								<label className="mk-select">
									<span className="sr-only">Urutkan</span>
									<select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Urutkan mata kuliah">
										<option value="created">Urutkan: Terbaru dibuat</option>
										<option value="title">Urutkan: Nama</option>
										<option value="progress">Urutkan: Progress RPS</option>
									</select>
								</label>
								<div className="mk-view" role="group" aria-label="Tampilan">
									<button type="button" className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} aria-pressed={layout === 'grid'} aria-label="Tampilan kartu">
										<LayoutGrid size={15} />
									</button>
									<button type="button" className={layout === 'list' ? 'active' : ''} onClick={() => setLayout('list')} aria-pressed={layout === 'list'} aria-label="Tampilan daftar">
										<List size={15} />
									</button>
								</div>
							</div>
						</div>
						{filtered.length === 0 ? (
							<div className="ld-empty">
								<h3>Tidak ada mata kuliah yang cocok</h3>
								<p>Coba kata kunci, status, atau semester lain.</p>
							</div>
						) : (
							<ul className={layout === 'grid' ? 'mk-cards' : 'mk-list'}>
								{filtered.map((item) => (
									<CourseCatalogCard
										key={item.course.id}
										item={item}
										layout={layout}
										onEditThumb={setThumbCourse}
									/>
								))}
							</ul>
						)}
					</section>
				</>
			)}

			{thumbCourse && (
				<CourseThumbDialog
					course={thumbCourse}
					onClose={() => setThumbCourse(null)}
					onSaved={() => {
						setThumbCourse(null);
						void load();
					}}
				/>
			)}
		</AppShell>
	);
}
