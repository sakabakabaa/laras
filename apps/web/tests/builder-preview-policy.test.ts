import { describe, expect, it } from 'vitest';
import { getBuilderPreviewPolicy } from '../src/lib/builder-preview-policy';

const time = Date.parse('2026-11-02T10:00:00Z');

describe('builder preview policy', () => {
	it('keeps a class closed before opening and permits check-in through its check-in cutoff', () => {
		const base = { kind: 'kelas' as const, startsAt: new Date(time).toISOString(), endsAt: new Date(time + 3600000).toISOString(), checkInClosesAt: new Date(time + 600000).toISOString() };
		expect(getBuilderPreviewPolicy({ ...base, now: time - 1 }).state).toBe('before-opening');
		expect(getBuilderPreviewPolicy({ ...base, now: time + 600000 }).canCheckIn).toBe(true);
		expect(getBuilderPreviewPolicy({ ...base, now: time + 600001 }).state).toBe('check-in-closed');
		expect(getBuilderPreviewPolicy({ ...base, now: time + 600001, checkedIn: true }).canSubmit).toBe(true);
		expect(getBuilderPreviewPolicy({ ...base, now: time + 3600000 }).state).toBe('expired');
	});

	it('enforces assignment hard close and respects late submission policy after due time', () => {
		const base = { kind: 'tugas' as const, now: time, availableAt: new Date(time - 3600000).toISOString(), dueAt: new Date(time - 1).toISOString(), hardCloseAt: new Date(time + 3600000).toISOString() };
		expect(getBuilderPreviewPolicy({ ...base, allowLate: false }).canSubmit).toBe(false);
		expect(getBuilderPreviewPolicy({ ...base, allowLate: true }).canSubmit).toBe(true);
		expect(getBuilderPreviewPolicy({ ...base, allowLate: true, now: time + 3600000 }).state).toBe('expired');
		expect(getBuilderPreviewPolicy({ ...base, allowLate: true, hardCloseAt: '' }).canSubmit).toBe(true);
	});

	it('locks submitted and expired states and labels offline as simulation', () => {
		expect(getBuilderPreviewPolicy({ kind: 'tugas', now: time, submitted: true }).readOnly).toBe(true);
		const offline = getBuilderPreviewPolicy({ kind: 'tugas', now: time, scenario: 'offline' });
		expect(offline.offline).toBe(true);
		expect(offline.canWork).toBe(true);
		expect(offline.canSubmit).toBe(false);
		expect(getBuilderPreviewPolicy({ kind: 'tugas', now: time, timeLimitExpired: true }).canSubmit).toBe(false);
	});

	it('keeps explicit scenarios independent of real dates and permits late class check-in', () => {
		expect(getBuilderPreviewPolicy({ kind: 'tugas', now: time, dueAt: new Date(time - 1).toISOString(), scenario: 'on-time' }).canSubmit).toBe(true);
		const late = getBuilderPreviewPolicy({ kind: 'kelas', now: time, scenario: 'late-check-in' });
		expect(late.canCheckIn).toBe(true);
		expect(late.canSubmit).toBe(true);
	});
});
