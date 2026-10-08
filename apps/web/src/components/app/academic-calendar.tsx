import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowLeft,
	BookOpen,
	CalendarOff,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Download,
	ExternalLink,
	Flag,
	GraduationCap,
	Palmtree,
	Check,
} from 'lucide-react';
import {
	CALENDAR_EVENTS,
	CALENDAR_SOURCES,
	CATEGORY_META,
	CALENDAR_RANGE,
	type CalendarCategory,
	type CalendarEvent,
} from '@/data/academic-calendar';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { courseRouteId } from '@/lib/course-route';
import type { Course, ClassSession, Enrollment } from '@/lib/learning';
import '@/styles/academic-calendar.css';

const MONTHS_ID = [
	'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
	'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DOW_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const DOW_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const ALL_CATEGORIES: CalendarCategory[] = ['national', 'collective', 'upi', 'courses'];

type ViewMode = 'month' | 'week' | 'list';

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function toISO(d: Date): string {
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseISO(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

function addDays(iso: string, days: number): string {
	const d = parseISO(iso);
	d.setUTCDate(d.getUTCDate() + days);
	return toISO(d);
}

function addMonth(year: number, month: number, delta: number) {
	const total = year * 12 + month + delta;
	return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

function mondayIndex(utcDay: number): number {
	return (utcDay + 6) % 7;
}

function startOfWeek(iso: string): string {
	const d = parseISO(iso);
	return addDays(iso, -mondayIndex(d.getUTCDay()));
}

function eventsOnDay(events: CalendarEvent[], iso: string): CalendarEvent[] {
	return events.filter((ev) => (ev.end ? ev.start <= iso && ev.end >= iso : ev.start === iso));
}

function formatDay(iso: string): string {
	const d = parseISO(iso);
	return `${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatShort(iso: string): string {
	const d = parseISO(iso);
	return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatRange(start: string, end?: string): string {
	if (!end || end === start) return formatDay(start);
	const s = parseISO(start);
	const e = parseISO(end);
	if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
		return `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS_ID[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
	}
	return `${formatDay(start)} – ${formatDay(end)}`;
}

function weekdayLong(iso: string): string {
	return DOW_LONG[parseISO(iso).getUTCDay()];
}

function monthInRange(year: number, month: number): boolean {
	const n = year * 12 + month;
	return n >= CALENDAR_RANGE.startYear * 12 + CALENDAR_RANGE.startMonth
		&& n <= CALENDAR_RANGE.endYear * 12 + CALENDAR_RANGE.endMonth;
}

function clampMonth(year: number, month: number) {
	const min = CALENDAR_RANGE.startYear * 12 + CALENDAR_RANGE.startMonth;
	const max = CALENDAR_RANGE.endYear * 12 + CALENDAR_RANGE.endMonth;
	const n = Math.min(max, Math.max(min, year * 12 + month));
	return { year: Math.floor(n / 12), month: n % 12 };
}

function findEvent(id: string): CalendarEvent | undefined {
	return CALENDAR_EVENTS.find((ev) => ev.id === id);
}

function sourceFor(category: CalendarCategory) {
	if (category === 'upi') return CALENDAR_SOURCES.find((s) => s.id === 'upi-en') ?? CALENDAR_SOURCES[1];
	return CALENDAR_SOURCES[0];
}

function iconFor(category: CalendarCategory) {
	if (category === 'upi') return GraduationCap;
	if (category === 'collective') return Palmtree;
	if (category === 'courses') return BookOpen;
	return Flag;
}

function buildIcs(events: CalendarEvent[]): string {
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LARAS//Kalender Akademik//ID', 'CALSCALE:GREGORIAN'];
	for (const ev of events) {
		const endExclusive = addDays(ev.end ?? ev.start, 1).replace(/-/g, '');
		const stamp = ev.start.replace(/-/g, '');
		lines.push(
			'BEGIN:VEVENT',
			`UID:${ev.id}@laras`,
			`DTSTART;VALUE=DATE:${stamp}`,
			`DTEND;VALUE=DATE:${endExclusive}`,
			`SUMMARY:${ev.title.replace(/[,;\\]/g, ' ')}`,
			`CATEGORIES:${CATEGORY_META[ev.category].label}`,
			ev.note ? `DESCRIPTION:${ev.note.replace(/\n/g, ' ')}` : '',
			'END:VEVENT',
		);
	}
	lines.push('END:VCALENDAR');
	return lines.filter(Boolean).join('\r\n');
}

function monthCells(year: number, month: number): string[] {
	const first = new Date(Date.UTC(year, month, 1));
	const lead = mondayIndex(first.getUTCDay());
	const start = addDays(toISO(first), -lead);
	const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const total = Math.ceil((lead + daysInMonth) / 7) * 7;
	return Array.from({ length: total }, (_, i) => addDays(start, i));
}

export function AcademicCalendar() {
	const [enabled, setEnabled] = useState<Record<CalendarCategory, boolean>>({
		national: true,
		collective: true,
		upi: true,
		courses: true,
	});
	const [cursor, setCursor] = useState({ year: 2026, month: 7 });
	const [selected, setSelected] = useState('2026-08-24');
	const [today, setToday] = useState<string | null>(null);
	const [view, setView] = useState<ViewMode>('month');
	const [exportOpen, setExportOpen] = useState(false);

	const { user } = useAuth();
	const [courseEvents, setCourseEvents] = useState<CalendarEvent[]>([]);

	// Surface dated course meeting sessions (class_sessions) on the calendar.
	// Only sessions for the signed-in user's own courses (owned by faculty or
	// enrolled as student) and with a real date become events — nothing is
	// fabricated, and existing static calendar data is left untouched.
	useEffect(() => {
		const record = pb.authStore.record as
			| { id: string; role?: string }
			| null;
		const me = record?.id;
		if (!me) {
			setCourseEvents([]);
			return;
		}
		let ignore = false;
		void (async () => {
			try {
				const role = record?.role || 'faculty';
				const courses = await pb
					.collection('courses')
					.getFullList<Course>({ sort: 'title' });
				const courseMap = new Map(courses.map((c) => [c.id, c]));
				let myCourseIds: Set<string>;
				if (role === 'student') {
					const enrollments = await pb
						.collection('enrollments')
						.getFullList<Enrollment>({
							filter: pb.filter('owner = {:me}', { me }),
						});
					myCourseIds = new Set(enrollments.map((e) => e.course));
				} else {
					myCourseIds = new Set(
						courses.filter((c) => c.owner === me).map((c) => c.id),
					);
				}
				if (myCourseIds.size === 0) {
					if (!ignore) setCourseEvents([]);
					return;
				}
				const sessions = await pb
					.collection('class_sessions')
					.getFullList<ClassSession>({ sort: 'date' });
				const sectionRows = await pb
					.collection('course_sections')
					.getFullList<{ id: string; name: string }>({ sort: 'created' });
				const sectionMap = new Map(sectionRows.map((sec) => [sec.id, sec.name]));
				const min = CALENDAR_RANGE.startYear * 12 + CALENDAR_RANGE.startMonth;
				const max = CALENDAR_RANGE.endYear * 12 + CALENDAR_RANGE.endMonth;
				const events: CalendarEvent[] = [];
				for (const s of sessions) {
					if (!myCourseIds.has(s.course)) continue;
					const day = String(s.date || '').slice(0, 10);
					if (!day) continue;
					const d = new Date(`${day}T00:00:00Z`);
					if (Number.isNaN(d.getTime())) continue;
					const n = d.getUTCFullYear() * 12 + d.getUTCMonth();
					if (n < min || n > max) continue;
					const course = courseMap.get(s.course);
					const routeId = course ? courseRouteId(course) : s.course;
					const courseName = course?.title || course?.code || '';
					const sectionLabel = s.section ? sectionMap.get(s.section) || '' : '';
					events.push({
						id: `cs-${s.id}`,
						title: sectionLabel
							? `${courseName} · ${sectionLabel}`
							: courseName || `Pertemuan Minggu ${s.week || '?'}`,
						start: day,
						category: 'courses',
						note: course
							? `${course.code ? `${course.code} · ` : ''}${course.title}${sectionLabel ? ` · ${sectionLabel}` : ''}`
							: 'Mata kuliah',
						href: `/app/courses/${routeId}`,
					});
				}
				if (!ignore) setCourseEvents(events);
			} catch {
				if (!ignore) setCourseEvents([]);
			}
		})();
		return () => {
			ignore = true;
		};
	}, [user]);

	useEffect(() => {
		const now = new Date();
		const iso = toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
		setToday(iso);
		const inRange = monthInRange(now.getFullYear(), now.getMonth());
		if (inRange) {
			setCursor({ year: now.getFullYear(), month: now.getMonth() });
			setSelected(iso);
		}
	}, []);

	const allEvents = useMemo(
		() => [...CALENDAR_EVENTS, ...courseEvents],
		[courseEvents],
	);
	const filtered = useMemo(
		() => allEvents.filter((ev) => enabled[ev.category]),
		[allEvents, enabled],
	);
	const allOn = ALL_CATEGORIES.every((c) => enabled[c]);
	const anyOn = ALL_CATEGORIES.some((c) => enabled[c]);

	const selectedEvents = useMemo(() => eventsOnDay(filtered, selected), [filtered, selected]);
	const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor]);
	const weekDays = useMemo(() => {
		const start = startOfWeek(selected);
		return Array.from({ length: 7 }, (_, i) => addDays(start, i));
	}, [selected]);

	const monthEvents = useMemo(() => {
		const prefix = `${cursor.year}-${pad(cursor.month + 1)}`;
		return filtered
			.filter((ev) => {
				const end = ev.end ?? ev.start;
				return ev.start.slice(0, 7) <= prefix && end.slice(0, 7) >= prefix;
			})
			.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));
	}, [filtered, cursor]);

	const canPrev = monthInRange(cursor.year, cursor.month - 1) || (cursor.month === 0 && monthInRange(cursor.year - 1, 11));
	const canNext = (() => {
		const n = addMonth(cursor.year, cursor.month, 1);
		return monthInRange(n.year, n.month);
	})();

	function shiftMonth(delta: number) {
		const next = clampMonth(cursor.year, cursor.month + delta);
		setCursor(next);
		const day = Math.min(parseISO(selected).getUTCDate(), new Date(Date.UTC(next.year, next.month + 1, 0)).getUTCDate());
		setSelected(toISO(new Date(Date.UTC(next.year, next.month, day))));
	}

	function shiftWeek(delta: number) {
		const next = addDays(selected, delta * 7);
		const d = parseISO(next);
		if (!monthInRange(d.getUTCFullYear(), d.getUTCMonth())) return;
		setSelected(next);
		setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
	}

	function goToday() {
		if (!today) return;
		const d = parseISO(today);
		if (!monthInRange(d.getUTCFullYear(), d.getUTCMonth())) return;
		setSelected(today);
		setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
	}

	function pickDay(iso: string) {
		const d = parseISO(iso);
		if (!monthInRange(d.getUTCFullYear(), d.getUTCMonth())) return;
		setSelected(iso);
		setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
	}

	function toggleAll() {
		const next = !allOn;
		setEnabled({ national: next, collective: next, upi: next, courses: next });
	}

	function downloadIcs() {
		const blob = new Blob([buildIcs(filtered)], { type: 'text/calendar;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'kalender-akademik-laras.ics';
		a.click();
		URL.revokeObjectURL(url);
		setExportOpen(false);
	}

	const ganjilStart = findEvent('u-g-awal')?.start;
	const ganjilEnd = findEvent('u-g-akhir')?.start;
	const genapStart = findEvent('u-gn-awal')?.start;
	const genapEnd = findEvent('u-gn-akhir')?.start;
	const semester = useMemo(() => {
		if (!ganjilStart || !ganjilEnd || !genapStart || !genapEnd) return null;
		const ref = today ?? selected;
		if (ref <= ganjilEnd) {
			return { label: 'Semester Ganjil · 2026/2027', start: ganjilStart, end: ganjilEnd };
		}
		return { label: 'Semester Genap · 2026/2027', start: genapStart, end: genapEnd };
	}, [today, selected, ganjilStart, ganjilEnd, genapStart, genapEnd]);

	return (
		<section className="ac2">
			<header className="ac2-head">
				<div className="ac2-head-copy">
					<Link to="/app" className="ac2-back">
						<ArrowLeft size={14} /> Kembali ke dasbor
					</Link>
					<h1>Kalender Akademik</h1>
					<p className="ac2-kicker">Tahun Akademik 2026/2027 · Universitas Pendidikan Indonesia</p>
					<p className="ac2-sub">
						Lihat hari libur nasional, cuti bersama, dan tanggal akademik UPI dalam satu kalender.
						Setiap tanggal mengikuti sumber resmi — tidak ada peristiwa yang dikarang.
					</p>
					<div className="ac2-sources" aria-label="Sumber kalender">
						{CALENDAR_SOURCES.map((src) => (
							<a key={src.id} href={src.url} target="_blank" rel="noreferrer" title={src.description}>
								<ExternalLink size={12} />
								{src.name}
							</a>
						))}
					</div>
				</div>
				<div className="ac2-head-actions">
					<div className="ac2-export">
						<button
							type="button"
							className="ac2-btn ghost"
							aria-expanded={exportOpen}
							onClick={() => setExportOpen((v) => !v)}
						>
							<Download size={15} /> Ekspor <ChevronDown size={14} />
						</button>
						{exportOpen && (
							<div className="ac2-menu" role="menu">
								<button type="button" role="menuitem" onClick={downloadIcs} disabled={filtered.length === 0}>
									Unduh .ics ({filtered.length} peristiwa)
								</button>
							</div>
						)}
					</div>
				</div>
			</header>

			<div className="ac2-toolbar">
				<div className="ac2-filters" role="group" aria-label="Saring kategori">
					<button type="button" className={`ac2-check all${allOn ? ' on' : ''}`} aria-pressed={allOn} onClick={toggleAll}>
						<span className="ac2-box" aria-hidden>{allOn && <Check size={11} strokeWidth={3} />}</span>
						Semua
					</button>
					{ALL_CATEGORIES.map((cat) => {
						const on = enabled[cat];
						return (
							<button
								key={cat}
								type="button"
								className={`ac2-check cat-${cat}${on ? ' on' : ''}`}
								aria-pressed={on}
								onClick={() => setEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }))}
							>
								<span className="ac2-box" aria-hidden>{on && <Check size={11} strokeWidth={3} />}</span>
								{CATEGORY_META[cat].label}
							</button>
						);
					})}
				</div>
				<div className="ac2-views" role="tablist" aria-label="Tampilan kalender">
					{([['month', 'Bulan'], ['week', 'Minggu'], ['list', 'Daftar']] as const).map(([id, label]) => (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={view === id}
							className={view === id ? 'on' : ''}
							onClick={() => setView(id)}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			<div className="ac2-layout">
				<div className="ac2-main">
					<div className="ac2-card">
						<div className="ac2-nav">
							<div className="ac2-nav-title">
								<button
									type="button"
									className="ac2-round"
									aria-label={view === 'week' ? 'Minggu sebelumnya' : 'Bulan sebelumnya'}
									disabled={view === 'week' ? !monthInRange(parseISO(addDays(selected, -7)).getUTCFullYear(), parseISO(addDays(selected, -7)).getUTCMonth()) : !canPrev}
									onClick={() => (view === 'week' ? shiftWeek(-1) : shiftMonth(-1))}
								>
									<ChevronLeft size={16} />
								</button>
								<strong>
									{view === 'week'
										? `${parseISO(weekDays[0]).getUTCDate()}–${formatDay(weekDays[6])}`
										: `${MONTHS_ID[cursor.month]} ${cursor.year}`}
								</strong>
								<button
									type="button"
									className="ac2-round"
									aria-label={view === 'week' ? 'Minggu berikutnya' : 'Bulan berikutnya'}
									disabled={view === 'week' ? !monthInRange(parseISO(addDays(selected, 7)).getUTCFullYear(), parseISO(addDays(selected, 7)).getUTCMonth()) : !canNext}
									onClick={() => (view === 'week' ? shiftWeek(1) : shiftMonth(1))}
								>
									<ChevronRight size={16} />
								</button>
							</div>
							<button type="button" className="ac2-today" onClick={goToday} disabled={!today || !monthInRange(parseISO(today).getUTCFullYear(), parseISO(today).getUTCMonth())}>
								Hari ini
							</button>
						</div>

						{!anyOn && (
							<div className="ac2-empty banner">
								<CalendarOff size={18} />
								<p>Aktifkan minimal satu kategori untuk melihat peristiwa.</p>
							</div>
						)}

						{view === 'month' && (
							<div className="ac2-month" role="grid" aria-label={`Kalender ${MONTHS_ID[cursor.month]} ${cursor.year}`}>
								<div className="ac2-dow" role="row">
									{DOW_SHORT.map((d) => <span key={d} role="columnheader">{d}</span>)}
								</div>
								<div className="ac2-grid">
									{cells.map((iso) => {
										const d = parseISO(iso);
										const outside = d.getUTCMonth() !== cursor.month;
										const dayEvents = eventsOnDay(filtered, iso);
										const isSelected = iso === selected;
										const isToday = iso === today;
										return (
											<button
												key={iso}
												type="button"
												role="gridcell"
												className={`ac2-cell${outside ? ' out' : ''}${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
												aria-label={dayEvents.length ? `${formatDay(iso)}: ${dayEvents.map((e) => e.title).join(', ')}` : formatDay(iso)}
												aria-pressed={isSelected}
												onClick={() => pickDay(iso)}
											>
												<span className="ac2-num">{d.getUTCDate()}</span>
												<span className="ac2-chips">
													{dayEvents.slice(0, 2).map((ev) => {
														const Icon = iconFor(ev.category);
														return (
															<span key={ev.id} className={`ac2-chip cat-${ev.category}`} title={ev.title}>
																<Icon size={11} />
																<em>{ev.title}</em>
															</span>
														);
													})}
													{dayEvents.length > 2 && <span className="ac2-more">+{dayEvents.length - 2} lagi</span>}
												</span>
											</button>
										);
									})}
								</div>
								{anyOn && monthEvents.length === 0 && (
									<p className="ac2-inline-empty">Tidak ada peristiwa pada bulan ini untuk filter yang aktif.</p>
								)}
							</div>
						)}

						{view === 'week' && (
							<div className="ac2-week" role="grid" aria-label="Tampilan minggu">
								{weekDays.map((iso) => {
									const dayEvents = eventsOnDay(filtered, iso);
									const isSelected = iso === selected;
									return (
										<div key={iso} className={`ac2-week-col${isSelected ? ' selected' : ''}${iso === today ? ' today' : ''}`}>
											<button type="button" className="ac2-week-head" onClick={() => pickDay(iso)}>
												<span>{DOW_SHORT[mondayIndex(parseISO(iso).getUTCDay())]}</span>
												<strong>{parseISO(iso).getUTCDate()}</strong>
											</button>
											<div className="ac2-week-body">
												{dayEvents.length === 0 ? (
													<p className="ac2-week-empty">Tidak ada peristiwa</p>
												) : dayEvents.map((ev) => {
													const Icon = iconFor(ev.category);
													return (
														<button key={ev.id} type="button" className={`ac2-chip block cat-${ev.category}`} onClick={() => pickDay(iso)}>
															<Icon size={12} />
															<em>{ev.title}</em>
														</button>
													);
												})}
											</div>
										</div>
									);
								})}
							</div>
						)}

						{view === 'list' && (
							<div className="ac2-list" aria-label={`Daftar ${MONTHS_ID[cursor.month]} ${cursor.year}`}>
								{monthEvents.length === 0 ? (
									<div className="ac2-empty">
										<CalendarOff size={20} />
										<p>Tidak ada peristiwa pada bulan ini untuk filter yang aktif.</p>
									</div>
								) : (
									<ul>
										{monthEvents.map((ev) => (
											<li key={ev.id}>
												<button type="button" className={`ac2-agenda-card cat-${ev.category}`} onClick={() => pickDay(ev.start)}>
													<AgendaBody ev={ev} />
												</button>
											</li>
										))}
									</ul>
								)}
							</div>
						)}
					</div>
				</div>

				<aside className="ac2-side">
					<div className="ac2-card ac2-agenda">
						<div className="ac2-agenda-head">
							<strong>{weekdayLong(selected)}, {formatDay(selected)}</strong>
							<span>{selectedEvents.length === 0 ? 'Tidak ada kegiatan' : `${selectedEvents.length} kegiatan`}</span>
						</div>
						{selectedEvents.length === 0 ? (
							<div className="ac2-empty compact">
								<CalendarOff size={18} />
								<p>Tidak ada peristiwa pada tanggal ini.</p>
							</div>
						) : (
							<ul>
								{selectedEvents.map((ev) => (
									<li key={ev.id} className={`ac2-agenda-card cat-${ev.category}`}>
										<AgendaBody ev={ev} />
										{ev.href ? (
											<Link className="ac2-source-btn" to={ev.href}>
												Buka mata kuliah <ChevronRight size={13} />
											</Link>
										) : (
											<a className="ac2-source-btn" href={sourceFor(ev.category).url} target="_blank" rel="noreferrer">
												Lihat sumber <ChevronRight size={13} />
											</a>
										)}
									</li>
								))}
							</ul>
						)}
					</div>

					<div className="ac2-card ac2-mini">
						<div className="ac2-mini-nav">
							<strong>{MONTHS_ID[cursor.month]} {cursor.year}</strong>
							<div>
								<button type="button" aria-label="Bulan sebelumnya" disabled={!canPrev} onClick={() => shiftMonth(-1)}>
									<ChevronLeft size={14} />
								</button>
								<button type="button" aria-label="Bulan berikutnya" disabled={!canNext} onClick={() => shiftMonth(1)}>
									<ChevronRight size={14} />
								</button>
							</div>
						</div>
						<div className="ac2-mini-dow">
							{DOW_SHORT.map((d) => <span key={d}>{d}</span>)}
						</div>
						<div className="ac2-mini-grid">
							{cells.map((iso) => {
								const d = parseISO(iso);
								const outside = d.getUTCMonth() !== cursor.month;
								const marked = eventsOnDay(filtered, iso).length > 0;
								return (
									<button
										key={iso}
										type="button"
										className={`${outside ? 'out' : ''}${iso === selected ? ' selected' : ''}${iso === today ? ' today' : ''}${marked ? ' marked' : ''}`}
										onClick={() => pickDay(iso)}
										aria-label={formatDay(iso)}
										aria-pressed={iso === selected}
									>
										{d.getUTCDate()}
									</button>
								);
							})}
						</div>
					</div>

					<div className="ac2-card ac2-semester">
						{semester && today ? (
							<SemesterBar semester={semester} today={today} />
						) : (
							<div className="ac2-empty compact">
								<CalendarOff size={18} />
								<p>Rentang semester belum tersedia dari data kalender.</p>
							</div>
						)}
					</div>
				</aside>
			</div>

			<footer className="ac2-foot">
				<h2>Sumber &amp; catatan</h2>
				<ul>
					{CALENDAR_SOURCES.map((src) => (
						<li key={src.id}>
							<strong>{src.name}</strong>
							<span>{src.description}</span>
							<a href={src.url} target="_blank" rel="noreferrer">{src.url}</a>
						</li>
					))}
				</ul>
				<p>
					Tanggal libur mengikuti SKB Tiga Menteri 2026; tanggal akademik mengikuti Kalender Akademik UPI TA 2026/2027.
					Kalender ini panduan, bukan dokumen hukum — periksa sumber resmi sebelum menjadwalkan kegiatan penting.
				</p>
			</footer>
		</section>
	);
}

function AgendaBody({ ev }: { ev: CalendarEvent }) {
	const Icon = iconFor(ev.category);
	return (
		<div className="ac2-agenda-body">
			<span className={`ac2-agenda-ico cat-${ev.category}`} aria-hidden>
				<Icon size={16} />
			</span>
			<div>
				<strong>{ev.title}</strong>
				<small>{formatRange(ev.start, ev.end)} · {CATEGORY_META[ev.category].short}</small>
				{ev.note && <em>{ev.note}</em>}
			</div>
		</div>
	);
}

function SemesterBar({
	semester,
	today,
}: {
	semester: { label: string; start: string; end: string };
	today: string;
}) {
	const start = parseISO(semester.start).getTime();
	const end = parseISO(semester.end).getTime();
	const now = parseISO(today).getTime();
	const span = Math.max(1, end - start);
	const ratio = Math.min(1, Math.max(0, (now - start) / span));
	const status = today < semester.start ? 'Belum dimulai' : today > semester.end ? 'Sudah berakhir' : 'Berlangsung';
	return (
		<>
			<div className="ac2-sem-head">
				<strong>{semester.label}</strong>
				<span>{status}</span>
			</div>
			<div className="ac2-sem-track" aria-hidden>
				<span style={{ width: `${ratio * 100}%` }} />
				<i style={{ left: `${ratio * 100}%` }} />
			</div>
			<div className="ac2-sem-labels">
				<div>
					<strong>{formatShort(semester.start)}</strong>
					<span>Mulai perkuliahan</span>
				</div>
				<div>
					<strong>{formatShort(semester.end)}</strong>
					<span>Akhir perkuliahan</span>
				</div>
			</div>
		</>
	);
}
