/// <reference path="../pb_data/types.d.ts" />

/**
 * Backfill empty pertemuan (class_sessions) dates from each course's first
 * dated session, advancing weekly and skipping Indonesian national holidays
 * and cuti bersama (SKB Tiga Menteri 2026). Only sessions with an EMPTY date
 * that come after an anchored (already-dated) session are filled — existing
 * manual dates are always preserved.
 *
 * This resolves the LARAS A1-JR241 course (first session 24 Aug 2026) and any
 * other course whose weekly RPS sessions were never scheduled, without
 * touching RPS details, structured records, or static calendar events. The
 * holiday set mirrors `apps/web/src/data/academic-calendar.ts` (national +
 * collective only — UPI academic markers are not skipped, since "Awal
 * Perkuliahan" is exactly when session 1 lands and UTS/UAS weeks are
 * themselves scheduled meetings).
 *
 * Idempotent: re-running finds no empty dates after an anchored session, so
 * nothing changes.
 */
migrate(
	(app) => {
		// National holidays + cuti bersama 2026 (YYYY-MM-DD).
		const HOLIDAYS = {
			'2026-01-01': true,
			'2026-01-16': true,
			'2026-02-16': true,
			'2026-02-17': true,
			'2026-03-18': true,
			'2026-03-19': true,
			'2026-03-20': true,
			'2026-03-21': true,
			'2026-03-22': true,
			'2026-03-23': true,
			'2026-03-24': true,
			'2026-04-03': true,
			'2026-04-05': true,
			'2026-05-01': true,
			'2026-05-14': true,
			'2026-05-15': true,
			'2026-05-27': true,
			'2026-05-28': true,
			'2026-05-31': true,
			'2026-06-01': true,
			'2026-06-16': true,
			'2026-08-17': true,
			'2026-08-25': true,
			'2026-12-24': true,
			'2026-12-25': true,
		};

		const pad = (n) => (n < 10 ? '0' + n : '' + n);

		const isoDate = (d) =>
			d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());

		const parseDate = (s) => {
			if (!s) return null;
			const day = ('' + s).slice(0, 10);
			const parts = day.split('-');
			if (parts.length !== 3) return null;
			const ts = Date.UTC(+parts[0], +parts[1] - 1, +parts[2]);
			if (Number.isNaN(ts)) return null;
			return new Date(ts);
		};

		const addDays = (d, n) => {
			const r = new Date(d.getTime());
			r.setUTCDate(r.getUTCDate() + n);
			return r;
		};

		const courses = app.findRecordsByFilter('courses', "id != ''");
		let filled = 0;

		for (const course of courses) {
			const cid = course.id;
			let sessions;
			try {
				sessions = app.findRecordsByFilter(
					'class_sessions',
					'course = "' + cid + '"',
					'week,created',
				);
			} catch (_) {
				continue;
			}
			if (!sessions || sessions.length === 0) continue;

			sessions.sort((a, b) => {
				const wa = a.getInt('week') || 0;
				const wb = b.getInt('week') || 0;
				return wa - wb;
			});

			let cursor = null;
			for (const s of sessions) {
				const cur = s.getString('date') || '';
				const day = cur.slice(0, 10);
				if (day) {
					// Preserve any existing (manual) date and use it as the anchor.
					const parsed = parseDate(day);
					if (parsed) cursor = parsed;
					continue;
				}
				// Empty date — only fill once a prior session has anchored the week.
				if (!cursor) continue;
				let next = addDays(cursor, 7);
				while (HOLIDAYS[isoDate(next)]) next = addDays(next, 1);
				s.set('date', isoDate(next) + ' 00:00:00.000Z');
				app.save(s);
				cursor = next;
				filled += 1;
			}
		}

		// No console in JSVM migrations; the count is reflected in the saved rows.
		void filled;
	},
	(app) => {
		// Down: no-op. We only filled previously-empty dates, so reverting would
		// discard legitimate data. Re-running the up migration is idempotent.
		void app;
	},
);
