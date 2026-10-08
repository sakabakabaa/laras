import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
	ArrowRight,
	ArrowUp,
	BarChart3,
	Bold,
	BookOpen,
	CalendarDays,
	ClipboardCheck,
	ClipboardList,
	FilePlus2,
	FileUp,
	GraduationCap,
	Italic,
	List,
	LoaderCircle,
	Mic,
	Paperclip,
	Sparkles,
	Users,
	Wand2,
	X,
	Zap,
} from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import { courseRouteId } from '@/lib/course-route';
import { CourseThumb } from '@/components/app/course-thumb';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { Course, ClassSession, CourseSection } from '@/lib/learning';
import { dateLabel, isSessionDone } from '@/lib/learning';
import { courseCoverFor } from '@/lib/course-thumb';
import {
	activityTypeOf,
	type Assignment,
} from '@/lib/assignments';
import { quickSendToAssistant } from '@/lib/assistant-quick-send';
import {
	CALENDAR_EVENTS,
	CATEGORY_META,
	type CalendarCategory,
	type CalendarEvent,
} from '@/data/academic-calendar';

type SubRow = { id: string; assignment: string; status: string; grade: number | null };

function formatLongDate(d = new Date()) {
	return d.toLocaleDateString('id-ID', {
		weekday: 'long',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

function timeFromDate(value: string) {
	if (!value) return '—';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isSameDay(a: Date, b: Date) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function addDays(base: Date, n: number) {
	const d = new Date(base);
	d.setDate(d.getDate() + n);
	return d;
}

function startOfWeek(d: Date) {
	const day = (d.getDay() + 6) % 7; // Monday = 0
	const r = new Date(d);
	r.setHours(0, 0, 0, 0);
	r.setDate(r.getDate() - day);
	return r;
}

/** ISO date (YYYY-MM-DD) for comparing against calendar events. */
function toISODate(d: Date) {
	const r = new Date(d);
	r.setHours(0, 0, 0, 0);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}`;
}

const QUICK_ACCEPT = '.pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,application/pdf,text/plain';
const QUICK_MAX_FILES = 4;
const QUICK_MAX_BYTES = 8 * 1024 * 1024;

type QuickSpeech = {
	lang: string;
	interimResults: boolean;
	onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
	onerror: (() => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
};

export function CourseDashboard() {
	const navigate = useNavigate();
	const [quickText, setQuickText] = useState('');
	const [quickFiles, setQuickFiles] = useState<File[]>([]);
	const [quickError, setQuickError] = useState('');
	const [styleOpen, setStyleOpen] = useState(false);
	const [listening, setListening] = useState(false);
	const quickRef = useRef<HTMLTextAreaElement>(null);
	const quickFileRef = useRef<HTMLInputElement>(null);
	const quickStyleRef = useRef<HTMLDivElement>(null);
	const recognitionRef = useRef<{ stop: () => void } | null>(null);
	const firstName =
		((pb.authStore.record as { name?: string } | null)?.name || 'Dosen').trim().split(/\s+/)[0] ||
		'Dosen';

	const growQuick = () => {
		const el = quickRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	};

	useEffect(() => {
		growQuick();
	}, [quickText]);

	useEffect(() => {
		if (!styleOpen) return;
		const onDoc = (event: MouseEvent) => {
			if (!quickStyleRef.current?.contains(event.target as Node)) setStyleOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [styleOpen]);

	useEffect(() => () => recognitionRef.current?.stop(), []);

	const addQuickFiles = (list: FileList | null) => {
		if (!list?.length) return;
		const next = [...quickFiles];
		let note = '';
		for (const file of Array.from(list)) {
			if (next.length >= QUICK_MAX_FILES) {
				note = `Maksimal ${QUICK_MAX_FILES} lampiran per pesan.`;
				break;
			}
			if (file.size > QUICK_MAX_BYTES) {
				note = `"${file.name}" melebihi 8 MB.`;
				continue;
			}
			if (next.some((item) => item.name === file.name && item.size === file.size)) continue;
			next.push(file);
		}
		setQuickFiles(next);
		setQuickError(note);
		if (quickFileRef.current) quickFileRef.current.value = '';
	};

	const applyQuickStyle = (kind: 'bold' | 'italic' | 'list') => {
		const el = quickRef.current;
		const start = el?.selectionStart ?? quickText.length;
		const end = el?.selectionEnd ?? start;
		const selected = quickText.slice(start, end);
		let insert = selected;
		if (kind === 'bold') insert = `**${selected || 'teks'}**`;
		if (kind === 'italic') insert = `*${selected || 'teks'}*`;
		if (kind === 'list') {
			const body = selected || 'butir';
			insert = body
				.split('\n')
				.map((line) => (line.startsWith('- ') ? line : `- ${line}`))
				.join('\n');
		}
		const next = quickText.slice(0, start) + insert + quickText.slice(end);
		const cursor = start + insert.length;
		setQuickText(next);
		setStyleOpen(false);
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(cursor, cursor);
			growQuick();
		});
	};

	const toggleQuickMic = () => {
		if (listening) {
			recognitionRef.current?.stop();
			setListening(false);
			return;
		}
		const speechWindow = window as unknown as {
			SpeechRecognition?: new () => QuickSpeech;
			webkitSpeechRecognition?: new () => QuickSpeech;
		};
		const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
		if (!Speech) {
			setQuickError('Mikrofon tidak didukung di peramban ini.');
			return;
		}
		const recognition = new Speech();
		recognition.lang = 'id-ID';
		recognition.interimResults = false;
		recognition.onresult = (event) => {
			const said = event.results?.[0]?.[0]?.transcript || '';
			if (!said) return;
			setQuickText((current) => (current ? `${current} ${said}` : said));
		};
		recognition.onerror = () => setListening(false);
		recognition.onend = () => setListening(false);
		recognitionRef.current = recognition;
		setListening(true);
		setQuickError('');
		recognition.start();
	};

	const submitQuick = (event?: { preventDefault: () => void }) => {
		event?.preventDefault();
		const text = quickText.trim();
		const attached = quickFiles;
		if (!text && attached.length === 0) return;
		recognitionRef.current?.stop();
		setListening(false);
		setQuickText('');
		setQuickFiles([]);
		setStyleOpen(false);
		setQuickError('');
		if (quickRef.current) quickRef.current.style.height = 'auto';
		quickSendToAssistant(text, attached);
	};

	// Cached reads: navigating back to the dashboard reuses these rows
	// (TTL + stale-while-revalidate) instead of re-querying PocketBase.
	const coursesQuery = useCachedQuery<Course[]>('courses:all:-created', () =>
		pb.collection('courses').getFullList<Course>({ sort: '-created' }),
	);
	const sessionsQuery = useCachedQuery<ClassSession[]>('class_sessions:all:date', () =>
		pb.collection('class_sessions').getFullList<ClassSession>({ sort: 'date' }),
	);
	const assignmentsQuery = useCachedQuery<Assignment[]>('assignments:owner:-created', () =>
		pb.collection('assignments').getFullList<Assignment>({
			filter: pb.filter('owner = {:id}', { id: pb.authStore.record?.id || '' }),
			sort: '-created',
			expand: 'session',
		}),
	);
	const subsQuery = useCachedQuery<SubRow[]>('assignment_submissions:all:dashboard', () =>
		pb.collection('assignment_submissions').getFullList<SubRow>({
			fields: 'id,assignment,status,grade',
		}),
	);
	const sectionsQuery = useCachedQuery<CourseSection[]>('course_sections:owner', () =>
		pb.collection('course_sections').getFullList<CourseSection>({
			filter: pb.filter('owner = {:id}', { id: pb.authStore.record?.id || '' }),
			sort: 'created',
		}),
	);

	const me = pb.authStore.record?.id;
	const courses = useMemo(
		() => (coursesQuery.data ?? []).filter((c) => c.owner === me),
		[coursesQuery.data, me],
	);
	const sessions = useMemo(
		() => (sessionsQuery.data ?? []).filter((s) => s.owner === me),
		[sessionsQuery.data, me],
	);
	const assignments = useMemo(
		() => (assignmentsQuery.data ?? []).filter((a) => a.owner === me),
		[assignmentsQuery.data, me],
	);
	const subs = subsQuery.data ?? [];
	const sections = sectionsQuery.data ?? [];
	const loading =
		coursesQuery.loading ||
		sessionsQuery.loading ||
		assignmentsQuery.loading ||
		subsQuery.loading ||
		sectionsQuery.loading;
	const error =
		coursesQuery.error ||
		sessionsQuery.error ||
		assignmentsQuery.error ||
		subsQuery.error ||
		sectionsQuery.error;
	const load = useCallback(() => {
		coursesQuery.reload();
		sessionsQuery.reload();
		assignmentsQuery.reload();
		subsQuery.reload();
		sectionsQuery.reload();
	}, [coursesQuery, sessionsQuery, assignmentsQuery, subsQuery, sectionsQuery]);

	const today = useMemo(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		return d;
	}, []);
	const weekStart = useMemo(() => startOfWeek(today), [today]);
	const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

	const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
	const sectionsByCourse = useMemo(() => {
		const map = new Map<string, CourseSection[]>();
		for (const s of sections) {
			const list = map.get(s.course) ?? [];
			list.push(s);
			map.set(s.course, list);
		}
		return map;
	}, [sections]);

	// ── Stats ───────────────────────────────────────────────────
	const stats = useMemo(() => {
		const active = courses.length;
		const totalSessions = sessions.length;
		const done = sessions.filter((s) => s.completed).length;

		// Sessions scheduled this calendar week (Mon–Sun).
		const thisWeek = sessions.filter((s) => {
			if (!s.date) return false;
			const d = new Date(s.date);
			if (Number.isNaN(d.getTime())) return false;
			return d >= weekStart && d <= weekEnd;
		}).length;

		// Pending grading: formal, published assignments with submitted/late
		// submissions that have not been graded yet.
		const formalIds = new Set(
			assignments
				.filter((a) => activityTypeOf(a) === 'formal' && a.status !== 'draft')
				.map((a) => a.id),
		);
		const pendingGrading = subs.filter(
			(s) => formalIds.has(s.assignment) && (s.status === 'submitted' || s.status === 'late'),
		).length;

		return { active, totalSessions, done, thisWeek, pendingGrading };
	}, [courses, sessions, assignments, subs, weekStart, weekEnd]);

	// ── Upcoming class sessions ────────────────────────────────
	const scheduleGroups = useMemo(() => {
		const openSessions = sessions
			.filter((s) => !s.completed && s.date)
			.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

		const todayItems = openSessions.filter((s) => {
			const d = new Date(s.date);
			return !Number.isNaN(d.getTime()) && isSameDay(d, today);
		});
		const tomorrow = addDays(today, 1);
		const tomorrowItems = openSessions.filter((s) => {
			const d = new Date(s.date);
			return !Number.isNaN(d.getTime()) && isSameDay(d, tomorrow);
		});
		const later = openSessions
			.filter((s) => {
				const d = new Date(s.date);
				if (Number.isNaN(d.getTime())) return false;
				return d > tomorrow;
			})
			.slice(0, 4);

		return { todayItems, tomorrowItems, later, tomorrow };
	}, [sessions, today]);

	// ── Grading queue (real pending submissions) ────────────────
	const gradingQueue = useMemo(() => {
		const formal = assignments.filter(
			(a) => activityTypeOf(a) === 'formal' && a.status !== 'draft',
		);
		const queue = formal
			.map((a) => {
				const aSubs = subs.filter((s) => s.assignment === a.id);
				const pending = aSubs.filter(
					(s) => s.status === 'submitted' || s.status === 'late',
				).length;
				const graded = aSubs.filter(
					(s) => s.status === 'graded' || s.grade != null,
				).length;
				const collected = aSubs.filter((s) => s.status && s.status !== 'draft').length;
				return { assignment: a, pending, graded, collected };
			})
			.filter((row) => row.collected > 0)
			.sort((a, b) => b.pending - a.pending || b.collected - a.collected);
		return queue.slice(0, 5);
	}, [assignments, subs]);

	// ── Academic calendar events (upcoming, non-course) ────────
	const upcomingCalendar = useMemo(() => {
		const todayIso = toISODate(today);
		return CALENDAR_EVENTS.filter((ev) => ev.category !== 'courses' && ev.start >= todayIso)
			.sort((a, b) => a.start.localeCompare(b.start))
			.slice(0, 5);
	}, [today]);

	// ── Course progress with sections ───────────────────────────
	const courseProgress = useMemo(() => {
		const nowMs = today.getTime();
		return courses.map((course) => {
			const courseSessions = sessions.filter((s) => s.course === course.id);
			const done = courseSessions.filter((s) => isSessionDone(s, nowMs)).length;
			const pct =
				courseSessions.length === 0
					? 0
					: Math.round((done / courseSessions.length) * 100);
			return {
				course,
				sessionCount: courseSessions.length,
				done,
				pct,
				cover: courseCoverFor(course),
				sections: sectionsByCourse.get(course.id) ?? [],
			};
		});
	}, [courses, sessions, sectionsByCourse, today]);

	// ── Recent activity ─────────────────────────────────────────
	const recentActivity = useMemo(() => {
		const items: {
			id: string;
			title: string;
			meta: string;
			icon: 'course' | 'session' | 'task';
		}[] = [];
		const sortedCourses = [...courses].sort((a, b) =>
			(b.updated || b.created).localeCompare(a.updated || a.created),
		);
		sortedCourses.slice(0, 2).forEach((c) => {
			items.push({
				id: `c-${c.id}`,
				title: `Mata kuliah ${c.title} diperbarui`,
				meta: dateLabel(c.updated || c.created),
				icon: 'course',
			});
		});
		const sortedSessions = [...sessions].sort((a, b) =>
			(b.created || '').localeCompare(a.created || ''),
		);
		sortedSessions.slice(0, 2).forEach((s) => {
			const courseTitle = courses.find((c) => c.id === s.course)?.title || 'Mata kuliah';
			items.push({
				id: `s-${s.id}`,
				title: s.completed
					? `Sesi “${s.title}” selesai`
					: `Sesi “${s.title}” ditambahkan di ${courseTitle}`,
				meta: dateLabel(s.created),
				icon: 'session',
			});
		});
		const sortedAssignments = [...assignments].sort((a, b) =>
			(b.updated || '').localeCompare(a.updated || ''),
		);
		sortedAssignments.slice(0, 2).forEach((a) => {
			items.push({
				id: `a-${a.id}`,
				title: `Tugas “${a.title}” ${a.status === 'draft' ? 'dibuat sebagai draf' : 'diperbarui'}`,
				meta: dateLabel(a.updated || a.created),
				icon: 'task',
			});
		});
		return items
			.sort((a, b) => b.meta.localeCompare(a.meta))
			.slice(0, 5);
	}, [courses, sessions, assignments]);

	// ── Insight (grounded in real data) ─────────────────────────
	const insight = useMemo(() => {
		if (courses.length === 0) {
			return {
				headline: 'Mulai dari mata kuliah pertama',
				body: 'Buat mata kuliah untuk membuka ringkasan kemajuan, jadwal, dan insight mengajar.',
				cta: 'Impor PDF',
				onClick: () => navigate('/app/rps/new?import=1'),
			};
		}
		if (stats.pendingGrading > 0) {
			return {
				headline: `${stats.pendingGrading} pengumpulan menunggu penilaian`,
				body: 'Buka antrean penilaian untuk meninjau jawaban mahasiswa dan menyimpan nilai resmi.',
				cta: 'Buka penilaian',
				onClick: () => navigate('/app/tugas'),
			};
		}
		const low = courseProgress.filter((c) => c.sessionCount > 0 && c.pct < 40);
		if (low.length > 0) {
			return {
				headline: `${low.length} mata kuliah perlu perhatian`,
				body: `Penyelesaian sesi di bawah 40% pada ${low
					.map((l) => l.course.title)
					.slice(0, 2)
					.join(' dan ')}. Pertimbangkan meninjau rencana pertemuan.`,
				cta: 'Lihat mata kuliah',
				onClick: () =>
					document.getElementById('courses')?.scrollIntoView({ behavior: 'smooth' }),
			};
		}
		const openSessions = sessions.filter((s) => !s.completed).length;
		if (openSessions > 0) {
			return {
				headline: `${openSessions} sesi masih terbuka`,
				body: `Dari ${stats.totalSessions} sesi terencana, ${stats.done} sudah selesai. Lanjutkan menandai pertemuan setelah mengajar.`,
				cta: 'Kelola sesi',
				onClick: () => navigate('/kalender'),
			};
		}
		return {
			headline: 'Semua sesi tertata',
			body: 'Tidak ada sesi terbuka saat ini. Tambah pertemuan baru atau tinjau RPS untuk semester berikutnya.',
			cta: 'Buka kalender',
			onClick: () => navigate('/kalender'),
		};
	}, [courses.length, courseProgress, stats, sessions, navigate]);

	return (
		<AppShell title="Dashboard" eyebrow="Dashboard" variant="saas" hideHeading>
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
					<LoaderCircle size={24} className="spin" /> Memuat dashboard...
				</div>
			) : (
				<div className="ld-dash-wrap">
				<div className="ld-dash">
					<div className="ld-dash-header">
						<div className="ld-greet">
							<div className="ld-greet-copy">
								<span className="ld-eyebrow">{formatLongDate()}</span>
								<h1>Halo, {firstName}!</h1>
							</div>
							<div className="ld-greet-ask">
								<div className="ld-greet-ask-heading">
									<span className="ld-greet-ask-symbol" aria-hidden="true"><Sparkles size={15} strokeWidth={1.8} /></span>
									<div className="ld-greet-ask-copy">
										<h2 className="ld-greet-ask-title">Tanyakan apa saja</h2>
										<p>Materi, tugas, dan jadwal kampus</p>
									</div>
									<span className="ld-greet-ask-badge">LARAS AI</span>
								</div>
								<form className="ld-greet-chat" onSubmit={submitQuick}>
								<div className="asst-composer-box">
									<textarea
										ref={quickRef}
										className="asst-input"
										placeholder="Ketik pesan untuk LARAS..."
										value={quickText}
										onChange={(event) => {
											setQuickText(event.target.value);
											growQuick();
										}}
										onKeyDown={(event) => {
											if (event.key === 'Enter' && !event.shiftKey) {
												event.preventDefault();
												submitQuick();
											}
										}}
										rows={1}
										aria-label="Pesan untuk Asisten AI"
									/>
									{quickFiles.length > 0 && (
										<ul className="asst-file-row">
											{quickFiles.map((file) => (
												<li key={`${file.name}-${file.size}`}>
													<Paperclip size={12} />
													<span>{file.name}</span>
													<button
														type="button"
														aria-label={`Hapus ${file.name}`}
														onClick={() => setQuickFiles((current) => current.filter((item) => item !== file))}
													>
														<X size={12} />
													</button>
												</li>
											))}
										</ul>
									)}
									<div className="asst-composer-bar">
										<input
											ref={quickFileRef}
											type="file"
											className="asst-file-input"
											accept={QUICK_ACCEPT}
											multiple
											onChange={(event) => addQuickFiles(event.target.files)}
										/>
										<button type="button" className="asst-tool" aria-label="Lampirkan berkas" onClick={() => quickFileRef.current?.click()}>
											<Paperclip size={16} strokeWidth={1.75} />
										</button>
										<div className="asst-style-wrap" ref={quickStyleRef}>
											<button
												type="button"
												className={`asst-skills${styleOpen ? ' open' : ''}`}
												aria-expanded={styleOpen}
												aria-haspopup="menu"
												onClick={() => setStyleOpen((open) => !open)}
											>
												<Zap size={14} strokeWidth={1.75} /> Gaya
											</button>
											{styleOpen && (
												<div className="asst-style-menu" role="menu">
													<button type="button" role="menuitem" onClick={() => applyQuickStyle('bold')}><Bold size={14} /> Tebal</button>
													<button type="button" role="menuitem" onClick={() => applyQuickStyle('italic')}><Italic size={14} /> Miring</button>
													<button type="button" role="menuitem" onClick={() => applyQuickStyle('list')}><List size={14} /> Daftar</button>
												</div>
											)}
										</div>
										<div className="asst-composer-end">
											<button
												type="button"
												className={`asst-mic${listening ? ' live' : ''}`}
												aria-label={listening ? 'Berhenti merekam' : 'Ucapkan pesan'}
												aria-pressed={listening}
												onClick={toggleQuickMic}
											>
												<Mic size={16} strokeWidth={1.75} />
											</button>
											<button type="submit" className="asst-send" disabled={!quickText.trim() && quickFiles.length === 0} aria-label="Kirim ke Asisten AI">
												<ArrowUp size={16} />
											</button>
										</div>
									</div>
								</div>
								</form>
								{quickError && <p className="ld-greet-note" role="alert">{quickError}</p>}
							</div>
						</div>

						<nav className="ld-action-row" aria-label="Tindakan cepat">
						<button type="button" className="ld-pill primary" onClick={() => navigate('/app/rps/new?import=1')}>
							<span className="ld-pill-ico">
								<FileUp size={16} strokeWidth={1.9} />
							</span>
							Impor PDF
						</button>
						<Link to="/app/tugas/buat" className="ld-pill">
							<span className="ld-pill-ico">
								<ClipboardList size={16} strokeWidth={1.9} />
							</span>
							Buat Tugas
						</Link>
						<Link to="/app/asisten" className="ld-pill">
							<span className="ld-pill-ico">
								<Wand2 size={16} strokeWidth={1.9} />
							</span>
							Asisten AI
						</Link>
						</nav>
					</div>

					{/* Stat strip */}
					<div className="ld-stats">
						<div className="ld-stat">
							<div className="ld-stat-top">
								<span>Mata Kuliah Aktif</span>
								<span className="ld-stat-ico red">
									<BookOpen size={16} />
								</span>
							</div>
							<strong>{stats.active}</strong>
							<small>
								{stats.active === 0
									? 'Belum ada mata kuliah'
									: `${stats.active} mata kuliah di ruang kerja`}
							</small>
							{courses[0] && (
								<Link to={`/app/courses/${courseRouteId(courses[0])}`} className="ld-stat-link">
									Lihat <ArrowRight size={14} />
								</Link>
							)}
						</div>
						<div className="ld-stat">
							<div className="ld-stat-top">
								<span>Sesi Minggu Ini</span>
								<span className="ld-stat-ico blue">
									<CalendarDays size={16} />
								</span>
							</div>
							<strong>{stats.thisWeek}</strong>
							<small>Pertemuan terjadwal pekan ini</small>
							{stats.thisWeek > 0 && (
								<Link to="/kalender" className="ld-stat-link">
									Kalender <ArrowRight size={14} />
								</Link>
							)}
						</div>
						<div className="ld-stat">
							<div className="ld-stat-top">
								<span>Perlu Dinilai</span>
								<span className="ld-stat-ico coral">
									<ClipboardCheck size={16} />
								</span>
							</div>
							<strong>{stats.pendingGrading}</strong>
							<small>
								{stats.pendingGrading === 0
									? 'Tidak ada antrean penilaian'
									: 'Pengumpulan menunggu nilai'}
							</small>
							{stats.pendingGrading > 0 && (
								<Link to="/app/tugas" className="ld-stat-link">
									Tinjau <ArrowRight size={14} />
								</Link>
							)}
						</div>
						<div className="ld-stat">
							<div className="ld-stat-top">
								<span>Sesi Selesai</span>
								<span className="ld-stat-ico teal">
								<BarChart3 size={16} />
								</span>
							</div>
							<strong>{stats.done}</strong>
							<small>
								{stats.totalSessions
									? `${Math.round((stats.done / stats.totalSessions) * 100)}% dari ${stats.totalSessions} sesi`
									: 'Belum ada data'}
							</small>
						</div>
					</div>

					{/* Put the grading work immediately after the summary so the main action is easy to find. */}
					<div className="ld-dash-priority">
						<aside className="ld-panel ld-grading-panel">
							<div className="ld-card-head">
								<h2>Antrean Penilaian</h2>
								<Link to="/app/tugas" className="ld-link-muted">Semua →</Link>
							</div>
							{gradingQueue.length === 0 ? (
								<div className="ld-empty-sm">
									{assignments.length === 0
										? 'Belum ada tugas. Buat tugas formal untuk mulai mengumpulkan jawaban mahasiswa.'
										: 'Tidak ada pengumpulan yang menunggu penilaian.'}
								</div>
							) : (
								<ul className="ld-grading-list">
									{gradingQueue.map(({ assignment, pending, collected, graded }) => {
										const course = courseById.get(assignment.course);
										return (
											<li key={assignment.id}>
												<Link to={`/app/tugas/${assignment.id}`} className="ld-grading-row">
													<div className="ld-grading-main">
														<strong>{assignment.title}</strong>
														<small>{course?.title || 'Mata kuliah'}</small>
													</div>
													<div className="ld-grading-counts" aria-label={`${pending} menunggu penilaian, ${graded} dari ${collected} sudah dinilai`}>
														<span className="ld-grading-count-label">
															{pending > 0 ? <strong className="ld-grading-pending">{pending}</strong> : <strong className="ld-grading-done"><ClipboardCheck size={13} /></strong>}
															<small>Menunggu</small>
														</span>
														<span className="ld-grading-count-label">
															<strong className="ld-grading-reviewed">{graded}/{collected}</strong>
															<small>Dinilai</small>
														</span>
													</div>
												</Link>
											</li>
										);
									})}
								</ul>
							)}
							{stats.pendingGrading > 0 && <p className="ld-grading-foot">{stats.pendingGrading} pengumpulan menunggu dinilai di seluruh mata kuliah.</p>}
						</aside>
					</div>

					<div className="ld-dash-main">
					{/* Upcoming class sessions */}
					<section className="ld-panel ld-schedule-panel">
						<div className="ld-card-head">
							<h2>Jadwal Mengajar</h2>
							<Link to="/kalender" className="ld-link-muted">
								Kalender →
							</Link>
						</div>
						{scheduleGroups.todayItems.length === 0 &&
						scheduleGroups.tomorrowItems.length === 0 &&
						scheduleGroups.later.length === 0 ? (
							<div className="ld-empty-sm">
								Belum ada sesi terjadwal. Tambahkan tanggal pada sesi mata kuliah untuk melihatnya
								di sini.
							</div>
						) : (
							<>
								{scheduleGroups.todayItems.length > 0 && (
									<>
										<p className="ld-schedule-sub">Hari ini</p>
										<ul className="ld-schedule-list">
											{scheduleGroups.todayItems.map((s) => (
												<li key={s.id}>
													<span className="ld-time">{timeFromDate(s.date)}</span>
													<span className="ld-sch-bar" />
													<div>
														<strong>{s.title}</strong>
														<small>
															{courseById.get(s.course)?.title || 'Mata kuliah'}
															{s.topic ? ` · ${s.topic}` : ''}
														</small>
													</div>
												</li>
											))}
										</ul>
									</>
								)}
								{scheduleGroups.tomorrowItems.length > 0 && (
									<>
										<p className="ld-schedule-sub">
											Besok · {formatLongDate(scheduleGroups.tomorrow)}
										</p>
										<ul className="ld-schedule-list">
											{scheduleGroups.tomorrowItems.map((s) => (
												<li key={s.id}>
													<span className="ld-time muted">{timeFromDate(s.date)}</span>
													<span className="ld-sch-bar soft" />
													<div>
														<strong>{s.title}</strong>
														<small>
															{courseById.get(s.course)?.title || 'Mata kuliah'}
														</small>
													</div>
												</li>
											))}
										</ul>
									</>
								)}
								{scheduleGroups.later.length > 0 && (
									<>
										<p className="ld-schedule-sub">Berikutnya</p>
										<ul className="ld-schedule-list">
											{scheduleGroups.later.map((s) => (
												<li key={s.id}>
													<span className="ld-time muted">{timeFromDate(s.date)}</span>
													<span className="ld-sch-bar soft" />
													<div>
														<strong>{s.title}</strong>
														<small>
															{courseById.get(s.course)?.title || 'Mata kuliah'} ·{' '}
															{dateLabel(s.date)}
														</small>
													</div>
												</li>
											))}
										</ul>
									</>
								)}
							</>
						)}
					</section>
					{/* Insight */}
					<section className="ld-panel ld-insight">
						<div className="ld-card-head">
							<h2>
								<span className="ld-spark">
									<Sparkles size={16} />
								</span>{' '}
								Insight
							</h2>
						</div>
						<div className="ld-insight-grid">
							<div className="ld-insight-main">
								<strong>{insight.headline}</strong>
								<p>{insight.body}</p>
								<button type="button" className="ld-btn-soft" onClick={insight.onClick}>
									{insight.cta}
								</button>
							</div>
							<div className="ld-insight-side">
								<div>
									<span className="ld-up">Sesi selesai</span>
									<strong>{stats.done}</strong>
									<small>dari {stats.totalSessions || 0} total</small>
								</div>
								<div>
									<span>Tingkat penyelesaian</span>
									<strong>
										{stats.totalSessions
											? `${Math.round((stats.done / stats.totalSessions) * 100)}%`
											: '—'}
									</strong>
									<small>Rata-rata ruang kerja</small>
								</div>
							</div>
						</div>
					</section>

					{/* Courses with section badges */}
					<section className="ld-panel ld-courses-panel" id="courses">
						<div className="ld-card-head">
							<h2>Mata Kuliah Saya</h2>
							<div className="ld-panel-actions">
								<Link to="/app/courses" className="ld-text-btn">
									Lihat semua →
								</Link>
								<button type="button" className="ld-text-btn" onClick={() => navigate('/app/rps/new?import=1')}>
									+ Baru
								</button>
							</div>
						</div>
						{courseProgress.length === 0 ? (
							<div className="ld-empty">
								<div className="ld-empty-icon">
									<BookOpen size={28} strokeWidth={1.4} />
								</div>
								<h3>Kelas pertama dimulai di sini</h3>
								<p>
									Buat mata kuliah untuk menyatukan RPS, silabus, dan sesi dalam satu tempat.
								</p>
								<button type="button" className="ld-btn-primary" onClick={() => navigate('/app/rps/new?import=1')}>
									<FilePlus2 size={16} /> Buat mata kuliah pertama
								</button>
							</div>
						) : (
							<ul className="ld-course-rows">
								{courseProgress.map(({ course, sessionCount, pct, cover, sections }) => (
									<li key={course.id}>
										<Link to={`/app/courses/${courseRouteId(course)}`} className="ld-course-row">
											<CourseThumb course={course} cover={cover} />
											<div className="ld-course-meta">
												<strong>{course.title}</strong>
												<small>
													{course.code || 'Tanpa kode'}
													{course.semester ? ` · ${course.semester}` : ''} · {sessionCount} sesi
												</small>
												{sections.length > 0 && (
													<span className="ld-section-chips">
														{sections.slice(0, 3).map((sec) => (
															<span key={sec.id} className="ld-section-chip">
																<Users size={10} /> {sec.name}
															</span>
														))}
														{sections.length > 3 && (
															<span className="ld-section-chip">
																+{sections.length - 3}
															</span>
														)}
													</span>
												)}
											</div>
											<span className="ld-badge">Aktif</span>
											<div className="ld-progress-wrap">
												<div className="ld-progress">
													<span style={{ width: `${pct}%` }} />
												</div>
												<em>{pct}%</em>
											</div>
											<ArrowRight size={16} className="ld-row-arrow" />
										</Link>
									</li>
								))}
							</ul>
						)}
					</section>

					{/* Recent activity */}
					<section className="ld-panel ld-activity-panel">
						<div className="ld-card-head">
							<h2>Aktivitas Terbaru</h2>
						</div>
						{recentActivity.length === 0 ? (
							<div className="ld-empty-sm">
								Aktivitas dari mata kuliah, sesi, dan tugas Anda akan muncul di sini.
							</div>
						) : (
							<ul className="ld-activity">
								{recentActivity.map((item) => (
									<li key={item.id}>
										<span className={`ld-act-ico ${item.icon}`}>
											{item.icon === 'course' ? (
												<BookOpen size={14} />
											) : item.icon === 'session' ? (
												<CalendarDays size={14} />
											) : (
												<ClipboardList size={14} />
											)}
										</span>
										<div>
											<strong>{item.title}</strong>
											<small>{item.meta}</small>
										</div>
									</li>
								))}
							</ul>
						)}
					</section>

					</div>
					<div className="ld-dash-side">
					{/* Academic calendar events */}
					<aside className="ld-panel ld-calendar-panel">
						<div className="ld-card-head">
							<h2>Kalender Akademik</h2>
							<Link to="/kalender" className="ld-link-muted">
								Lihat →
							</Link>
						</div>
						{upcomingCalendar.length === 0 ? (
							<div className="ld-empty-sm">
								Tidak ada peristiwa akademik mendatang dalam rentang kalender.
							</div>
						) : (
							<ul className="ld-cal-list">
								{upcomingCalendar.map((ev) => (
									<CalendarEventRow key={ev.id} event={ev} />
								))}
							</ul>
						)}
					</aside>
					</div>
				</div>
				</div>
			)}

		</AppShell>
	);
}

const CAL_ICON: Record<CalendarCategory, typeof GraduationCap> = {
	national: CalendarDays,
	collective: CalendarDays,
	upi: GraduationCap,
	courses: BookOpen,
};

function CalendarEventRow({ event }: { event: CalendarEvent }) {
	const Icon = CAL_ICON[event.category];
	const meta = CATEGORY_META[event.category];
	const d = new Date(`${event.start}T00:00:00`);
	const label = Number.isNaN(d.getTime())
		? event.start
		: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
	const endLabel =
		event.end && event.end !== event.start
			? (() => {
					const e = new Date(`${event.end}T00:00:00`);
					return Number.isNaN(e.getTime())
						? ''
						: ` – ${e.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`;
				})()
			: '';
	return (
		<li className={`ld-cal-row cat-${event.category}`}>
			<span className="ld-cal-date">
				<span>{label}</span>
				{endLabel ? <span>{endLabel.trim()}</span> : null}
			</span>
			<div className="ld-cal-copy">
				<span className={`ld-cal-dot cat-${event.category}`} aria-hidden />
				<div>
					<strong>{event.title}</strong>
					<small>{meta.short}</small>
				</div>
			</div>
		</li>
	);
}
