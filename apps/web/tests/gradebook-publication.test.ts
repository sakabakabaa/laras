import { describe, expect, it } from 'vitest';
import {
	BACKFILL_REASON,
	buildReleaseSnapshot,
	diffReleases,
	inputsHashOf,
	isStale,
	type ReleaseInputs,
	validateRelease,
} from '@/lib/gradebook/publication';

const baseInputs = (): ReleaseInputs => ({
	students: [
		{ id: 'stu_a', name: 'A' },
		{ id: 'stu_b', name: 'B' },
	],
	components: [
		{ id: 'c1', name: 'Tugas', weight: 60, maxScore: 100, kind: 'manual' },
		{ id: 'c2', name: 'UAS', weight: 40, maxScore: 100, kind: 'manual' },
	],
	entries: {
		c1: { stu_a: 80, stu_b: 90 },
		c2: { stu_a: 90, stu_b: 100 },
	},
	submissions: {},
	overrides: {},
});

describe('release snapshots are immutable', () => {
	it('editing a live entry does NOT change an already-built snapshot', () => {
		const snapshot = buildReleaseSnapshot(baseInputs());
		const edited: ReleaseInputs = {
			...baseInputs(),
			entries: { ...baseInputs().entries, c1: { stu_a: 10, stu_b: 90 } },
		};
		// The live gradebook changed — the built snapshot does not.
		expect(buildReleaseSnapshot(edited).results.find((r) => r.studentId === 'stu_a')?.finalScore).toBe(10 * 0.6 + 90 * 0.4);
		expect(snapshot.results.find((r) => r.studentId === 'stu_a')?.finalScore).toBe(84);
		// And the original inputs still rebuild to the same snapshot values.
		expect(buildReleaseSnapshot(baseInputs()).results).toEqual(snapshot.results);
	});

	it('stores per-student letter grades and component rows in component order', () => {
		const snapshot = buildReleaseSnapshot(baseInputs());
		const a = snapshot.results.find((r) => r.studentId === 'stu_a');
		expect(a?.letterGrade).toBe('A-');
		expect(a?.components.map((c) => c.componentId)).toEqual(['c1', 'c2']);
		expect(a?.components[0].score).toBe(80);
	});
});

describe('inputsHashOf', () => {
	it('is deterministic regardless of object key order', () => {
		const a = inputsHashOf(baseInputs());
		// Record keys are sorted before hashing; student array order is part
		// of the contract, so it stays identical here.
		const b = inputsHashOf({
			students: [{ id: 'stu_a', name: 'A' }, { id: 'stu_b', name: 'B' }],
			components: baseInputs().components,
			entries: { c2: { stu_b: 100, stu_a: 90 }, c1: { stu_b: 90, stu_a: 80 } },
			submissions: {},
			overrides: {},
		});
		expect(b).toBe(a);
	});

	it('changes when an input changes', () => {
		const a = inputsHashOf(baseInputs());
		expect(inputsHashOf({ ...baseInputs(), entries: { ...baseInputs().entries, c1: { stu_a: 79, stu_b: 90 } } })).not.toBe(a);
		expect(inputsHashOf({ ...baseInputs(), overrides: { stu_b: { value: 50, note: 'alasan' } } })).not.toBe(a);
	});
});

describe('isStale', () => {
	it('rejects a preview whose inputs changed', () => {
		const previewed = inputsHashOf(baseInputs());
		expect(isStale(previewed, previewed)).toBe(false);
		const live = inputsHashOf({ ...baseInputs(), entries: { ...baseInputs().entries, c2: { stu_a: 95, stu_b: 100 } } });
		expect(isStale(previewed, live)).toBe(true);
	});
});

describe('validateRelease', () => {
	it('rejects weights that do not sum to 100', () => {
		const bad: ReleaseInputs = {
			...baseInputs(),
			components: [
				{ id: 'c1', name: 'Tugas', weight: 50, maxScore: 100, kind: 'manual' },
				{ id: 'c2', name: 'UAS', weight: 30, maxScore: 100, kind: 'manual' },
			],
		};
		const result = validateRelease(bad);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues.map((i) => i.code)).toContain('weights_not_100');
	});

	it('rejects an empty student list', () => {
		const result = validateRelease({ ...baseInputs(), students: [] });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues.map((i) => i.code)).toContain('no_students');
	});

	it('rejects a components-only gradebook (no weighted components)', () => {
		const result = validateRelease({
			...baseInputs(),
			components: [{ id: 'cb', name: 'Bonus', weight: 0, maxScore: 5, kind: 'manual', sourceType: 'bonus' }],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues.map((i) => i.code)).toContain('no_components');
	});

	it('rejects incomplete students', () => {
		const inputs = baseInputs();
		delete inputs.entries.c2.stu_b;
		const result = validateRelease(inputs);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues.map((i) => i.code)).toContain('incomplete_students');
	});

	it('rejects an override without a reason', () => {
		const result = validateRelease({ ...baseInputs(), overrides: { stu_a: { value: 90, note: '  ' } } });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues.map((i) => i.code)).toContain('empty_override_reason');
	});

	it('accepts a complete, valid release', () => {
		expect(validateRelease(baseInputs())).toEqual({ ok: true });
	});
});

describe('diffReleases', () => {
	it('reports only changed students', () => {
		const prev = buildReleaseSnapshot(baseInputs()).results;
		const next = buildReleaseSnapshot({
			...baseInputs(),
			entries: { ...baseInputs().entries, c1: { stu_a: 85, stu_b: 90 } },
		}).results;
		const diff = diffReleases(prev, next);
		expect(diff).toHaveLength(1);
		expect(diff[0].studentId).toBe('stu_a');
		expect(diff[0].changed).toBe(true);
		expect(diff[0].before?.finalScore).toBe(84);
		expect(diff[0].after?.finalScore).toBe(87);
	});

	it('reports a student added or removed between releases', () => {
		const prev = buildReleaseSnapshot({ ...baseInputs(), students: [{ id: 'stu_a', name: 'A' }] }).results;
		const next = buildReleaseSnapshot(baseInputs()).results;
		const diff = diffReleases(prev, next);
		expect(diff.map((d) => d.studentId)).toEqual(['stu_b']);
		expect(diff[0].before).toBeNull();
	});
});

describe('backfilled releases', () => {
	it('has no items — the backfill writes a marker release row only', () => {
		// The migration (1791900000_gradebook_releases.js) creates one
		// grade_releases row per legacy grade_publications marker and never
		// fabricates grade_release_items: the historical per-student values
		// are unrecoverable. The backfill reason must say so plainly.
		expect(BACKFILL_REASON).toContain('tidak dapat direkonstruksi');
		expect(BACKFILL_REASON).toContain('menerbitkan ulang');
		// A snapshot built from no inputs has no results, mirroring a
		// marker-only release with zero items.
		expect(buildReleaseSnapshot({ students: [], components: [], entries: {}, submissions: {}, overrides: {} }).results).toHaveLength(0);
	});
});
