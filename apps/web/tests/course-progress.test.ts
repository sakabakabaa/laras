import { describe, expect, it } from 'vitest';
import { isSessionDone, sessionProgressPct } from '@/lib/learning';

// Fixed "now": 2026-10-04T10:00:00 local. Past = before today's start.
const NOW = new Date(2026, 9, 4, 10, 0, 0).getTime();
const PAST = '2026-09-20'; // before today
const TODAY = '2026-10-04'; // today → in progress, not done
const FUTURE = '2026-11-15'; // after today

describe('isSessionDone — schedule progress', () => {
	it('counts an explicitly completed session as done', () => {
		expect(isSessionDone({ completed: true, date: FUTURE }, NOW)).toBe(true);
		expect(isSessionDone({ completed: true }, NOW)).toBe(true);
	});

	it('counts a past-dated, not-completed session as done (the VERSTEHEN case)', () => {
		// Dates exist and have passed, but completed is false — must still count
		// toward progress so the RPS percentage is not stuck at 0%.
		expect(isSessionDone({ completed: false, date: PAST }, NOW)).toBe(true);
		expect(isSessionDone({ date: PAST }, NOW)).toBe(true);
	});

	it('does not count a session dated today as done (in progress)', () => {
		expect(isSessionDone({ completed: false, date: TODAY }, NOW)).toBe(false);
	});

	it('does not count a future-dated session as done', () => {
		expect(isSessionDone({ completed: false, date: FUTURE }, NOW)).toBe(false);
	});

	it('a session without a date and not completed is not done', () => {
		expect(isSessionDone({ completed: false, date: '' }, NOW)).toBe(false);
		expect(isSessionDone({}, NOW)).toBe(false);
	});

	it('ignores an invalid date unless completed', () => {
		expect(isSessionDone({ completed: false, date: 'not-a-date' }, NOW)).toBe(false);
		expect(isSessionDone({ completed: true, date: 'not-a-date' }, NOW)).toBe(true);
	});

	it('accepts ISO datetime strings', () => {
		expect(isSessionDone({ completed: false, date: '2026-09-20T09:30:00' }, NOW)).toBe(true);
		expect(isSessionDone({ completed: false, date: '2026-11-15T18:00:00' }, NOW)).toBe(false);
	});
});

describe('sessionProgressPct — RPS percentage', () => {
	it('returns 0 when there are no sessions', () => {
		expect(sessionProgressPct([], NOW)).toBe(0);
	});

	it('the zero-progress case: all sessions future-dated → 0%', () => {
		const sessions = [
			{ completed: false, date: FUTURE },
			{ completed: false, date: '2026-12-01' },
		];
		expect(sessionProgressPct(sessions, NOW)).toBe(0);
	});

	it('a course with past dates but none marked completed reflects progress > 0', () => {
		// VERSTEHEN-style: 4 sessions with passing dates, none completed.
		const sessions = [
			{ completed: false, date: '2026-08-24' },
			{ completed: false, date: '2026-09-01' },
			{ completed: false, date: '2026-09-08' },
			{ completed: false, date: FUTURE },
		];
		// 3 of 4 dates have passed → 75%.
		expect(sessionProgressPct(sessions, NOW)).toBe(75);
	});

	it('mixed completed and past-dated sessions both count', () => {
		const sessions = [
			{ completed: true, date: FUTURE }, // completed counts
			{ completed: false, date: PAST }, // past counts
			{ completed: false, date: TODAY }, // today does not
			{ completed: false, date: FUTURE }, // future does not
		];
		// 2 of 4 done → 50%.
		expect(sessionProgressPct(sessions, NOW)).toBe(50);
	});

	it('all sessions done → 100%', () => {
		const sessions = [
			{ completed: true, date: PAST },
			{ completed: false, date: PAST },
		];
		expect(sessionProgressPct(sessions, NOW)).toBe(100);
	});

	it('rounds to the nearest whole percent', () => {
		// 1 of 3 done → 33.3% → 33%.
		const sessions = [
			{ completed: false, date: PAST },
			{ completed: false, date: FUTURE },
			{ completed: false, date: FUTURE },
		];
		expect(sessionProgressPct(sessions, NOW)).toBe(33);
	});
});
