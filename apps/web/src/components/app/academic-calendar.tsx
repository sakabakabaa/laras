import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowLeft,
	BookOpen,
	CalendarOff,
	CalendarDays,
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
import { useLanguage, useT } from '@/lib/i18n';
import '@/styles/academic-calendar.css';

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

function localeOf(language: 'id' | 'en' | 'de') {
	return language === 'de' ? 'de-DE' : language === 'en' ? 'en-GB' : 'id-ID';
}

function formatDay(iso: string, language: 'id' | 'en' | 'de'): string {
	const d = parseISO(iso);
	return new Intl.DateTimeFormat(localeOf(language), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function formatShort(iso: string, language: 'id' | 'en' | 'de'): string {
	const d = parseISO(iso);
	return new Intl.DateTimeFormat(localeOf(language), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function formatRange(start: string, end: string | undefined, language: 'id' | 'en' | 'de'): string {
	if (!end || end === start) return formatDay(start, language);
	const s = parseISO(start);
	const e = parseISO(end);
	if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
		const month = new Intl.DateTimeFormat(localeOf(language), { month: 'long', timeZone: 'UTC' }).format(s);
		return `${s.getUTCDate()}–${e.getUTCDate()} ${month} ${s.getUTCFullYear()}`;
	}
	return `${formatDay(start, language)} – ${formatDay(end, language)}`;
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
	if (category === 'upi') return CALENDAR_SOURCES.find((source) => source.id === 'upi-en') ?? CALENDAR_SOURCES[1];
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

type MonthEventSpan = {
	event: CalendarEvent;
	column: number;
	length: number;
	lane: number;
	continuesBefore: boolean;
	continuesAfter: boolean;
	showTitle: boolean;
};

function monthEventSpans(cells: string[], events: CalendarEvent[]) {
	const weeks = Array.from({ length: cells.length / 7 }, (_, week) => {
		const firstIndex = week * 7;
		const first = cells[firstIndex];
		const last = cells[firstIndex + 6];
		const items = events
			.filter((event) => event.start <= last && (event.end ?? event.start) >= first)
			.map((event) => {
				const start = event.start < first ? first : event.start;
				const end = (event.end ?? event.start) > last ? last : (event.end ?? event.start);
				return {
					event,
					column: Math.max(0, Math.round((parseISO(start).getTime() - parseISO(first).getTime()) / 86_400_000)),
					length: Math.round((parseISO(end).getTime() - parseISO(start).getTime()) / 86_400_000) + 1,
					continuesBefore: event.start < first,
					continuesAfter: (event.end ?? event.start) > last,
				};
			})
			.sort((a, b) => a.column - b.column || b.length - a.length || a.event.title.localeCompare(b.event.title));
		const laneEnds: number[] = [];
		const spans: MonthEventSpan[] = items.map((item) => {
			let lane = laneEnds.findIndex((end) => end <= item.column);
			if (lane === -1) lane = laneEnds.length;
			laneEnds[lane] = item.column + item.length;
			return { ...item, lane, showTitle: false };
		});
		return { spans, laneCount: laneEnds.length };
	});
	const titled = new Set<string>();
	for (const week of weeks) {
		for (const span of week.spans) {
			if (!titled.has(span.event.id)) {
				span.showTitle = true;
				titled.add(span.event.id);
			}
		}
	}
	return weeks;
}

export function AcademicCalendar() {
	const language = useLanguage();
	const t = useT();
	const locale = localeOf(language);
	const monthNames = useMemo(() => Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, month, 1)))), [locale]);
	const dowShort = useMemo(() => Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 7, 24 + day)))), [locale]);
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
	const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
	const [hasChosenActivity, setHasChosenActivity] = useState(false);

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
	const selectedEvents = useMemo(() => eventsOnDay(filtered, selected), [filtered, selected]);
	const spansByWeek = useMemo(() => monthEventSpans(cells, monthEvents), [cells, monthEvents]);
	const upcomingEvents = useMemo(() => monthEvents
		.filter((ev) => (ev.end ?? ev.start) >= (today ?? selected))
		.slice(0, 5), [monthEvents, today, selected]);
	const activityDetails = useMemo(() => {
		const active = selectedEventId ? filtered.find((event) => event.id === selectedEventId) : undefined;
		if (active) return [active];
		if (selectedEvents.length) return selectedEvents;
		return hasChosenActivity ? [] : upcomingEvents.slice(0, 1);
	}, [filtered, hasChosenActivity, selectedEventId, selectedEvents, upcomingEvents]);
	const detailsDate = selectedEventId || selectedEvents.length ? selected : activityDetails[0]?.start ?? selected;

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
		setSelectedEventId(null);
		setHasChosenActivity(true);
	}

	function shiftWeek(delta: number) {
		const next = addDays(selected, delta * 7);
		const d = parseISO(next);
		if (!monthInRange(d.getUTCFullYear(), d.getUTCMonth())) return;
		setSelected(next);
		setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
		setSelectedEventId(null);
		setHasChosenActivity(true);
	}

	function goToday() {
		if (!today) return;
		const d = parseISO(today);
		if (!monthInRange(d.getUTCFullYear(), d.getUTCMonth())) return;
		setSelected(today);
		setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
		setSelectedEventId(null);
		setHasChosenActivity(true);
	}

	function pickDay(iso: string) {
		const d = parseISO(iso);
		if (!monthInRange(d.getUTCFullYear(), d.getUTCMonth())) return;
		setSelected(iso);
		setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
		setSelectedEventId(null);
		setHasChosenActivity(true);
	}

	function pickEvent(event: CalendarEvent, day = event.start) {
		pickDay(day);
		setSelectedEventId(event.id);
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
			return { label: `${t('student.calendar.oddSemester')} · 2026/2027`, start: ganjilStart, end: ganjilEnd };
		}
		return { label: `${t('student.calendar.evenSemester')} · 2026/2027`, start: genapStart, end: genapEnd };
	}, [today, selected, ganjilStart, ganjilEnd, genapStart, genapEnd, t]);

	return (
		<section className="ac2">
			<header className="ac2-head">
				<div className="ac2-head-copy">
					<Link to="/app" className="ac2-back">
						<ArrowLeft size={14} /> {t('student.calendar.back')}
					</Link>
					<h1>{t('student.calendar.title')}</h1>
					<p className="ac2-kicker">{t('student.calendar.year')}</p>
				</div>
				<div className="ac2-head-actions">
					<div className="ac2-export">
						<button
							type="button"
							className="ac2-btn ghost"
							aria-expanded={exportOpen}
							onClick={() => setExportOpen((v) => !v)}
						>
							<Download size={15} /> {t('student.calendar.export')} <ChevronDown size={14} />
						</button>
						{exportOpen && (
							<div className="ac2-menu" role="menu">
								<button type="button" role="menuitem" onClick={downloadIcs} disabled={filtered.length === 0}>
									{t('student.calendar.downloadIcs', { n: String(filtered.length) })}
								</button>
							</div>
						)}
					</div>
				</div>
			</header>

			<div className="ac2-toolbar">
				<div className="ac2-filters" role="group" aria-label={t('student.calendar.filterCategories')}>
					<button type="button" className={`ac2-check all${allOn ? ' on' : ''}`} aria-pressed={allOn} onClick={toggleAll}>
						<span className="ac2-box" aria-hidden>{allOn && <Check size={11} strokeWidth={3} />}</span>
						{t('student.calendar.all')}
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
								{t(`student.calendar.category.${cat}`)}
							</button>
						);
					})}
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
									aria-label={view === 'week' ? t('student.calendar.previousWeek') : t('student.calendar.previousMonth')}
									disabled={view === 'week' ? !monthInRange(parseISO(addDays(selected, -7)).getUTCFullYear(), parseISO(addDays(selected, -7)).getUTCMonth()) : !canPrev}
									onClick={() => (view === 'week' ? shiftWeek(-1) : shiftMonth(-1))}
								>
									<ChevronLeft size={16} />
								</button>
								<strong>
									{view === 'week'
										? `${parseISO(weekDays[0]).getUTCDate()}–${formatDay(weekDays[6], language)}`
										: `${monthNames[cursor.month]} ${cursor.year}`}
								</strong>
								<button
									type="button"
									className="ac2-round"
									aria-label={view === 'week' ? t('student.calendar.nextWeek') : t('student.calendar.nextMonth')}
									disabled={view === 'week' ? !monthInRange(parseISO(addDays(selected, 7)).getUTCFullYear(), parseISO(addDays(selected, 7)).getUTCMonth()) : !canNext}
									onClick={() => (view === 'week' ? shiftWeek(1) : shiftMonth(1))}
								>
									<ChevronRight size={16} />
								</button>
							</div>
							<div className="ac2-nav-actions">
								<div className="ac2-views" role="tablist" aria-label={t('student.calendar.views')}>
									{([['month', t('student.calendar.month')], ['week', t('student.calendar.week')], ['list', t('student.calendar.list')]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>)}
								</div>
								<button type="button" className="ac2-today" onClick={goToday} disabled={!today || !monthInRange(parseISO(today).getUTCFullYear(), parseISO(today).getUTCMonth())}>{t('student.calendar.today')}</button>
							</div>
						</div>

						{!anyOn && (
							<div className="ac2-empty banner">
								<CalendarOff size={18} />
							<p>{t('student.calendar.enableCategory')}</p>
							</div>
						)}

						{view === 'month' && (
						<div className="ac2-month" role="grid" aria-label={t('student.calendar.monthView', { month: monthNames[cursor.month], year: String(cursor.year) })}>
								<div className="ac2-dow" role="row">
									{dowShort.map((d) => <span key={d} role="columnheader">{d}</span>)}
								</div>
								<div className="ac2-grid">
									{spansByWeek.map((week, weekIndex) => (
										<div key={`week-${weekIndex}`} className="ac2-week-row" role="row" style={{ gridTemplateRows: `26px ${week.laneCount ? `repeat(${week.laneCount}, 20px) ` : ''}minmax(38px, 1fr)` }}>
											{cells.slice(weekIndex * 7, weekIndex * 7 + 7).map((iso, dayIndex) => {
												const d = parseISO(iso);
												const outside = d.getUTCMonth() !== cursor.month;
												const isSelected = iso === selected;
												const isToday = iso === today;
												const dayEvents = eventsOnDay(filtered, iso);
												return <button key={iso} type="button" role="gridcell" className={`ac2-cell${outside ? ' out' : ''}${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`} style={{ gridColumn: dayIndex + 1, gridRow: '1 / -1' }} aria-label={dayEvents.length ? `${formatDay(iso, language)}: ${dayEvents.map((event) => event.title).join(', ')}` : formatDay(iso, language)} aria-pressed={isSelected} onClick={() => pickDay(iso)}>
													<span className="ac2-num">{d.getUTCDate()}</span>
												</button>;
											})}
											{week.spans.map((span) => {
												const Icon = iconFor(span.event.category);
												const date = cells[weekIndex * 7 + span.column];
												return <button key={`${span.event.id}-${weekIndex}`} type="button" className={`ac2-span cat-${span.event.category}${span.continuesBefore ? ' continues-before' : ''}${span.continuesAfter ? ' continues-after' : ''}`} style={{ gridColumn: `${span.column + 1} / span ${span.length}`, gridRow: span.lane + 2 }} title={`${span.event.title} · ${formatRange(span.event.start, span.event.end, language)}`} aria-label={`${span.event.title}, ${formatRange(span.event.start, span.event.end, language)}`} onClick={() => pickEvent(span.event, date)}>
													{span.showTitle && <><Icon size={11} /><em>{span.event.title}</em></>}
												</button>;
											})}
										</div>
									))}
								</div>
				{anyOn && monthEvents.length === 0 && (
					<p className="ac2-inline-empty">{t('student.calendar.noEventsForFilter')}</p>
								)}
							</div>
						)}

						{view === 'week' && (
							<div className="ac2-week" role="grid" aria-label={t('student.calendar.weekView')}>
								{weekDays.map((iso) => {
									const dayEvents = eventsOnDay(filtered, iso);
									const isSelected = iso === selected;
									return (
										<div key={iso} className={`ac2-week-col${isSelected ? ' selected' : ''}${iso === today ? ' today' : ''}`}>
											<button type="button" className="ac2-week-head" onClick={() => pickDay(iso)}>
									<span>{dowShort[mondayIndex(parseISO(iso).getUTCDay())]}</span>
												<strong>{parseISO(iso).getUTCDate()}</strong>
											</button>
											<div className="ac2-week-body">
												{dayEvents.length === 0 ? (
								<p className="ac2-week-empty">{t('student.calendar.noEvents')}</p>
												) : dayEvents.map((ev) => {
													const Icon = iconFor(ev.category);
													return (
														<button key={ev.id} type="button" className={`ac2-chip block cat-${ev.category}`} onClick={() => pickEvent(ev, iso)}>
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
						<div className="ac2-list" aria-label={t('student.calendar.listView', { month: monthNames[cursor.month], year: String(cursor.year) })}>
								{monthEvents.length === 0 ? (
									<div className="ac2-empty">
										<CalendarOff size={20} />
										<p>{t('student.calendar.noEventsForFilter')}</p>
									</div>
								) : (
									<ul>
										{monthEvents.map((ev) => (
											<li key={ev.id}>
												<button type="button" className={`ac2-agenda-card cat-${ev.category}`} onClick={() => pickEvent(ev)}>
											<AgendaBody ev={ev} language={language} t={t} />
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
					<div className="ac2-card ac2-semester">
						<div className="ac2-card-head"><strong>{t('student.calendar.semesterStatus')}</strong></div>
						{semester && today ? <SemesterBar semester={semester} today={today} language={language} t={t} /> : <div className="ac2-empty compact"><CalendarOff size={18} /><p>{t('student.calendar.semesterUnavailable')}</p></div>}
					</div>

					<div className="ac2-card ac2-upcoming">
						<div className="ac2-card-head"><strong>{t('student.calendar.agenda')}</strong><span>{monthNames[cursor.month]} {cursor.year}</span></div>
						{upcomingEvents.length ? <ul>
							{upcomingEvents.map((ev) => {
								const day = parseISO(ev.start).getUTCDate();
								const month = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' }).format(parseISO(ev.start));
								return <li key={ev.id}><button type="button" className={`ac2-upcoming-row cat-${ev.category}`} onClick={() => pickEvent(ev)}>
									<span className="ac2-date-tile"><strong>{day}</strong><small>{month}</small></span>
									<span className="ac2-upcoming-copy"><strong><i className={`ac2-dot cat-${ev.category}`} /><span>{ev.title}</span></strong><small>{formatRange(ev.start, ev.end, language)}{ev.note ? ` · ${ev.note}` : ''}</small></span>
									<ChevronRight size={15} />
								</button></li>;
							})}
						</ul> : <div className="ac2-empty compact"><CalendarOff size={18} /><p>{t('student.calendar.noUpcoming')}</p></div>}
					</div>

					<div className="ac2-card ac2-official">
						<div className="ac2-card-head"><strong>{t('student.calendar.officialLinks')}</strong></div>
						<ul>{CALENDAR_SOURCES.map((src) => <li key={src.id}><a href={src.url} target="_blank" rel="noreferrer"><span className="ac2-link-ico"><ExternalLink size={14} /></span><span>{src.name}</span><ExternalLink size={13} /></a></li>)}</ul>
					</div>
				</aside>
			</div>

			<section className="ac2-card ac2-details" aria-labelledby="ac2-details-title">
				<header className="ac2-details-head">
					<span className="ac2-details-calendar"><CalendarDays size={19} /></span>
					<div><h2 id="ac2-details-title">{t('student.calendar.activityDetails')}</h2><p>{formatDay(detailsDate, language)}</p></div>
					{activityDetails.length > 0 && <span className="ac2-details-count">{t('student.calendar.eventCount', { n: String(activityDetails.length) })}</span>}
				</header>
				{activityDetails.length ? <div className="ac2-details-grid">
					{activityDetails.map((ev) => {
						const Icon = iconFor(ev.category);
						return <article key={ev.id} className={`ac2-detail-item cat-${ev.category}`}>
							<div className="ac2-detail-type"><span className={`ac2-detail-icon cat-${ev.category}`}><Icon size={16} /></span><span>{t(`student.calendar.category.${ev.category}`)}</span></div>
							<h3>{ev.title}</h3>
							<p className="ac2-detail-date"><CalendarDays size={14} />{formatRange(ev.start, ev.end, language)}</p>
							{ev.note && <p className="ac2-detail-note">{ev.note}</p>}
							{ev.href ? <Link className="ac2-detail-link" to={ev.href}><BookOpen size={14} />{t('student.calendar.openCourse')}<ChevronRight size={14} /></Link> : <a className="ac2-detail-link" href={sourceFor(ev.category).url} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t('student.calendar.viewSource')}<ChevronRight size={14} /></a>}
						</article>;
					})}
				</div> : <div className="ac2-details-empty"><CalendarOff size={18} /><span>{t('student.calendar.selectActivity')}</span></div>}
			</section>
		</section>
	);
}

function AgendaBody({ ev, language, t }: { ev: CalendarEvent; language: 'id' | 'en' | 'de'; t: (key: string) => string }) {
	const Icon = iconFor(ev.category);
	return (
		<div className="ac2-agenda-body">
			<span className={`ac2-agenda-ico cat-${ev.category}`} aria-hidden>
				<Icon size={16} />
			</span>
			<div>
				<strong>{ev.title}</strong>
				<small>{formatRange(ev.start, ev.end, language)} · {t(`student.calendar.categoryShort.${ev.category}`)}</small>
				{ev.note && <em>{ev.note}</em>}
			</div>
		</div>
	);
}

function SemesterBar({
	semester,
	today,
	language,
	t,
}: {
	semester: { label: string; start: string; end: string };
	today: string;
	language: 'id' | 'en' | 'de';
	t: (key: string) => string;
}) {
	const start = parseISO(semester.start).getTime();
	const end = parseISO(semester.end).getTime();
	const now = parseISO(today).getTime();
	const span = Math.max(1, end - start);
	const ratio = Math.min(1, Math.max(0, (now - start) / span));
	const status = today < semester.start ? t('student.calendar.notStarted') : today > semester.end ? t('student.calendar.ended') : t('student.calendar.inProgress');
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
					<strong>{formatShort(semester.start, language)}</strong>
					<span>{t('student.calendar.startOfClasses')}</span>
				</div>
				<div>
					<strong>{formatShort(semester.end, language)}</strong>
					<span>{t('student.calendar.endOfClasses')}</span>
				</div>
			</div>
		</>
	);
}
