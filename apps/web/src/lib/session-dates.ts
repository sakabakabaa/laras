/**
 * Penjadwalan tanggal pertemuan otomatis.
 *
 * Mengisi tanggal sesi mingguan berdasarkan tanggal pertemuan pertama,
 * melompati tanggal yang bentrok dengan kalender akademik (libur nasional,
 * cuti bersama, dan peristiwa akademik UPI) lalu menggeser sesi terdampak ke
 * tanggal tersedia berikutnya sambil menjaga ritme mingguan.
 *
 * Sumber konflik: data statis `academic-calendar.ts` — tidak menambah atau
 * mengubah peristiwa kalender yang sudah ada.
 */
import { addDays, parseISO, startOfDay } from 'date-fns';
import { CALENDAR_EVENTS, type CalendarEvent } from '@/data/academic-calendar';

/** Hasil satu sesi setelah penjadwalan. */
export interface ScheduledSession {
	id: string;
	week: number;
	title: string;
	currentDate: string;
	newDate: string;
	note: string;
	conflict?: CalendarEvent;
	/** true bila tanggal berasal dari sesi yang sudah diisi manual. */
	preserved: boolean;
}

export interface ScheduleResult {
	sessions: ScheduledSession[];
	skipped: number;
	/** Sesi yang tidak dapat dijadwalkan (tanpa tanggal awal). */
	unscheduled: number;
}

/** Bentuk ringkas sesi untuk penjadwalan. */
export interface SessionInput {
	id: string;
	week: number;
	title: string;
	date: string;
}

/** Ambil bagian YYYY-MM-DD dari nilai tanggal PocketBase. */
export function toDateOnly(value: string): string {
	if (!value) return '';
	return String(value).slice(0, 10);
}

/** Format Date ke YYYY-MM-DD (UTC-stable, tanpa konversi zona). */
export function isoDate(d: Date): string {
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD menjadi Date UTC tengah malam. */
export function parseDateOnly(value: string): Date | null {
	if (!value) return null;
	const d = parseISO(value.length <= 10 ? `${value}T00:00:00Z` : value);
	return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

/** Nilai tanggal untuk disimpan ke PocketBase (format diterima PB). */
export function toPocketBaseDate(value: string): string {
	return value ? `${value} 00:00:00.000Z` : '';
}

interface ConflictMap {
	/** YYYY-MM-DD -> peristiwa pertama yang menimpa tanggal itu. */
	dates: Map<string, CalendarEvent>;
}

/**
 * Whether a calendar event should block a class meeting on its date.
 *
 * Only actual holidays (libur nasional + cuti bersama) cancel a regular
 * lecture, and those are short (1–3 days) so shifting a session past one
 * keeps the weekly rhythm sensible. UPI academic markers — "Awal/Pra/Akhir
 * Perkuliahan", "Perubahan Rencana Studi", UTS/UAS exam periods, Wisuda — are
 * NOT skipped: "Awal Perkuliahan" is exactly when session 1 should land, and
 * a UTS/UAS week is itself a scheduled meeting (the exam). Skipping a
 * multi-week exam period would push a session weeks forward and break the
 * semester cadence. UPI events remain visible in the calendar for reference.
 */
function isBlockingEvent(ev: CalendarEvent): boolean {
	return ev.category === 'national' || ev.category === 'collective';
}

/** Bangun peta tanggal bentrok dari kalender akademik (rentang multi-hari diekspansi). */
function buildConflictMap(): ConflictMap {
	const dates = new Map<string, CalendarEvent>();
	for (const ev of CALENDAR_EVENTS) {
		if (!isBlockingEvent(ev)) continue;
		const start = parseDateOnly(ev.start);
		if (!start) continue;
		const end = ev.end ? parseDateOnly(ev.end) : start;
		if (!end) continue;
		let cursor = new Date(start);
		while (cursor.getTime() <= end.getTime()) {
			const key = isoDate(cursor);
			if (!dates.has(key)) dates.set(key, ev);
			cursor = addDays(cursor, 1);
		}
	}
	return { dates };
}

/**
 * Saran tanggal pertemuan pertama berdasarkan semester mata kuliah, dengan
 * merujuk ke peristiwa "Awal Perkuliahan Semester" pada kalender UPI.
 * Mengembalikan '' bila tidak dapat disimpulkan.
 */
export function inferFirstSessionDate(course: {
	semester?: string;
	academicYear?: string;
}): string {
	const sem = (course.semester || '').toLowerCase();
	const isGanjil =
		sem.includes('ganjil') || sem.includes('gasal') || sem.trim() === '1';
	const isGenap = sem.includes('genap') || sem.trim() === '2';
	const target = isGanjil
		? 'Awal Perkuliahan Semester Ganjil'
		: isGenap
			? 'Awal Perkuliahan Semester Genap'
			: '';
	if (!target) return '';
	const ev = CALENDAR_EVENTS.find(
		(e) => e.category === 'upi' && e.title === target,
	);
	return ev?.start || '';
}

/**
 * Hasilkan tanggal mingguan untuk daftar sesi.
 *
 * @param sessions   sesi terurut menaik berdasarkan minggu.
 * @param firstDate  tanggal pertemuan pertama (YYYY-MM-DD).
 * @param preserveManual bila true, sesi yang sudah memiliki tanggal dipertahankan
 *   dan menjadi landasan urutan berikutnya.
 */
export function generateSchedule(
	sessions: SessionInput[],
	firstDate: string,
	preserveManual: boolean,
): ScheduleResult {
	const { dates: conflicts } = buildConflictMap();
	const sorted = [...sessions].sort(
		(a, b) => (a.week || 0) - (b.week || 0) || a.id.localeCompare(b.id),
	);
	const result: ScheduledSession[] = [];
	let skipped = 0;
	let unscheduled = 0;
	let cursor: Date | null = null;

	for (const s of sorted) {
		const currentDate = toDateOnly(s.date);
		const manual = preserveManual && currentDate !== '';

		if (manual) {
			const d = parseDateOnly(currentDate);
			if (d) {
				cursor = d;
				const conflict = conflicts.get(currentDate);
				result.push({
					id: s.id,
					week: s.week,
					title: s.title,
					currentDate,
					newDate: currentDate,
					note: 'Pertahankan tanggal manual',
					conflict,
					preserved: true,
				});
				continue;
			}
		}

		if (!cursor) {
			cursor = parseDateOnly(firstDate);
		} else {
			cursor = addDays(cursor, 7);
		}

		if (!cursor) {
			unscheduled += 1;
			result.push({
				id: s.id,
				week: s.week,
				title: s.title,
				currentDate,
				newDate: '',
				note: 'Tanggal awal belum ditentukan',
				preserved: false,
			});
			continue;
		}

		// Geser maju melewati tanggal yang bentrok, menjaga ritme mingguan.
		let shifted = false;
		let conflict = conflicts.get(isoDate(cursor));
		while (conflict) {
			cursor = addDays(cursor, 1);
			shifted = true;
			conflict = conflicts.get(isoDate(cursor));
		}
		if (shifted) skipped += 1;

		result.push({
			id: s.id,
			week: s.week,
			title: s.title,
			currentDate,
			newDate: isoDate(cursor),
			note: shifted ? 'Digeser menghindari kalender akademik' : '',
			conflict: undefined,
			preserved: false,
		});
	}

	return { sessions: result, skipped, unscheduled };
}
