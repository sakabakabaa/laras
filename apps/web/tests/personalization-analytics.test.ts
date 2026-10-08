import { describe, expect, it } from 'vitest';
import {
	assertResearchAccess,
	MIN_COMPARISON,
	computeModeStats,
	computePersonalizationComparison,
	applyFilters,
	computeCategoryTrajectories,
	type InteractionRecord,
	type ValidatedObservation,
} from '@/lib/personalization-analytics';

function interaction(over: Partial<InteractionRecord> = {}): InteractionRecord {
	return {
		mode: 'generic',
		assignmentId: 'a1',
		assignmentTitle: 'Tugas',
		shape: 'writing',
		cefrLevel: 'A1',
		model: 'gpt-test',
		hintLevel: 1,
		categories: ['Morphology'],
		uptakeJudgment: '',
		afterRevisionStatus: '',
		hasRevision: false,
		createdAt: '2026-09-01T00:00:00Z',
		...over,
	};
}

function observation(over: Partial<ValidatedObservation> = {}): ValidatedObservation {
	return {
		category: 'Morphology',
		subcategory: 'case',
		learnerKey: 'u:1',
		createdAt: '2026-09-01T00:00:00Z',
		assignmentId: 'a1',
		cefrLevel: 'A1',
		afterRevisionStatus: '',
		...over,
	};
}

describe('computeModeStats — counts and rates', () => {
	it('counts interactions, revisions, and annotations', () => {
		const stats = computeModeStats([
			interaction({ hasRevision: true, uptakeJudgment: 'successful_uptake' }),
			interaction({ hasRevision: false }),
			interaction({ hasRevision: true, uptakeJudgment: 'partial_uptake' }),
		]);
		expect(stats.interactions).toBe(3);
		expect(stats.withRevision).toBe(2);
		expect(stats.withUptakeAnnotation).toBe(2);
	});

	it('computes uptake and successful-revision rates above MIN', () => {
		const records: InteractionRecord[] = Array.from({ length: 10 }, (_, i) =>
			interaction({
				uptakeJudgment: i < 6 ? 'successful_uptake' : i < 8 ? 'partial_uptake' : 'no_uptake',
			}),
		);
		const stats = computeModeStats(records);
		// uptake = (6 successful + 2 partial) / 10 = 80
		expect(stats.uptakeRate).toBe(80);
		// successful = 6 / 10 = 60
		expect(stats.successfulRevisionRate).toBe(60);
	});

	it('suppresses rates below MIN_COMPARISON', () => {
		const stats = computeModeStats([
			interaction({ uptakeJudgment: 'successful_uptake' }),
			interaction({ uptakeJudgment: 'successful_uptake' }),
		]);
		expect(stats.uptakeRate).toBeNull();
		expect(stats.successfulRevisionRate).toBeNull();
		expect(stats.sufficient).toBe(false);
	});

	it('computes average hint level and distribution', () => {
		const records: InteractionRecord[] = Array.from({ length: 6 }, (_, i) =>
			interaction({ hintLevel: (i % 3) + 1 }),
		);
		const stats = computeModeStats(records);
		expect(stats.averageHintLevel).toBe(2);
		const l1 = stats.hintDistribution.find((h) => h.level === 1)!;
		expect(l1.count).toBe(2);
		expect(l1.rate).toBe(Math.round((2 / 6) * 1000) / 10);
	});
});

describe('computePersonalizationComparison — grouping and breakdowns', () => {
	it('splits generic vs personalized and builds breakdowns', () => {
		const records: InteractionRecord[] = [
			...Array.from({ length: 6 }, () =>
				interaction({ mode: 'generic', categories: ['Syntax'] }),
			),
			...Array.from({ length: 4 }, () =>
				interaction({ mode: 'personalized', categories: ['Syntax'] }),
			),
		];
		const result = computePersonalizationComparison(records);
		expect(result.generic.interactions).toBe(6);
		expect(result.personalized.interactions).toBe(4);
		expect(result.breakdowns.byCategory).toHaveLength(1);
		expect(result.breakdowns.byCategory[0].key).toBe('Syntax');
		expect(result.breakdowns.byCategory[0].generic.interactions).toBe(6);
		expect(result.breakdowns.byCategory[0].personalized.interactions).toBe(4);
	});

	it('exposes available filter options from the full record set', () => {
		const records: InteractionRecord[] = [
			interaction({ categories: ['Morphology', 'case'], cefrLevel: 'A1', shape: 'writing', model: 'm1' }),
			interaction({ categories: ['Syntax'], cefrLevel: 'B1', shape: 'speaking', model: 'm2' }),
		];
		const result = computePersonalizationComparison(records);
		expect(result.filters.categories).toEqual(expect.arrayContaining(['Morphology', 'case', 'Syntax']));
		expect(result.filters.cefrLevels).toEqual(expect.arrayContaining(['A1', 'B1']));
		expect(result.filters.shapes).toEqual(expect.arrayContaining(['writing', 'speaking']));
		expect(result.filters.models).toEqual(expect.arrayContaining(['m1', 'm2']));
	});

	it('a multi-category interaction appears in each category group', () => {
		const records: InteractionRecord[] = [
			interaction({ mode: 'generic', categories: ['Morphology', 'Syntax'] }),
		];
		const result = computePersonalizationComparison(records);
		expect(result.breakdowns.byCategory).toHaveLength(2);
	});
});

describe('applyFilters — filtering', () => {
	const records: InteractionRecord[] = [
		interaction({ id: undefined, categories: ['Morphology'], cefrLevel: 'A1', shape: 'writing', model: 'm1', assignmentId: 'a1' }),
		interaction({ categories: ['Syntax'], cefrLevel: 'B1', shape: 'speaking', model: 'm2', assignmentId: 'a2' }),
	];

	it('filters by category (intersection)', () => {
		const filtered = applyFilters(records, {
			categories: ['Morphology'],
			cefrLevels: [],
			assignmentIds: [],
			shapes: [],
			models: [],
		});
		expect(filtered).toHaveLength(1);
		expect(filtered[0].categories).toContain('Morphology');
	});

	it('combines multiple filter dimensions (AND)', () => {
		const filtered = applyFilters(records, {
			categories: ['Syntax'],
			cefrLevels: ['B1'],
			assignmentIds: ['a2'],
			shapes: ['speaking'],
			models: ['m2'],
		});
		expect(filtered).toHaveLength(1);
	});

	it('returns empty when no record matches', () => {
		const filtered = applyFilters(records, {
			categories: ['Orthography'],
			cefrLevels: [],
			assignmentIds: [],
			shapes: [],
			models: [],
		});
		expect(filtered).toHaveLength(0);
	});

	it('empty filters return all records', () => {
		const filtered = applyFilters(records, {
			categories: [],
			cefrLevels: [],
			assignmentIds: [],
			shapes: [],
			models: [],
		});
		expect(filtered).toHaveLength(2);
	});
});

describe('computeCategoryTrajectories — recurrence and improvement', () => {
	it('buckets observations by month and counts distinct learners', () => {
		const observations: ValidatedObservation[] = [
			observation({ category: 'Syntax', learnerKey: 'u:1', createdAt: '2026-09-05T00:00:00Z' }),
			observation({ category: 'Syntax', learnerKey: 'u:2', createdAt: '2026-09-20T00:00:00Z' }),
			observation({ category: 'Syntax', learnerKey: 'u:1', createdAt: '2026-10-05T00:00:00Z' }),
		];
		const result = computeCategoryTrajectories(observations);
		expect(result.trajectories).toHaveLength(1);
		const traj = result.trajectories[0];
		expect(traj.category).toBe('Syntax');
		expect(traj.points).toHaveLength(2);
		expect(traj.points[0].bucket).toBe('2026-09');
		expect(traj.points[0].distinctLearners).toBe(2);
		expect(traj.points[1].distinctLearners).toBe(1);
	});

	it('marks recurring learners only when they appeared in an earlier bucket', () => {
		const observations: ValidatedObservation[] = [
			observation({ category: 'Morphology', learnerKey: 'u:1', createdAt: '2026-09-01T00:00:00Z' }),
			observation({ category: 'Morphology', learnerKey: 'u:2', createdAt: '2026-09-01T00:00:00Z' }),
			observation({ category: 'Morphology', learnerKey: 'u:3', createdAt: '2026-09-01T00:00:00Z' }),
			// October: u:1, u:2 recurred; u:4, u:5, u:6 are new → 2 recurring of 6
			observation({ category: 'Morphology', learnerKey: 'u:1', createdAt: '2026-10-01T00:00:00Z' }),
			observation({ category: 'Morphology', learnerKey: 'u:2', createdAt: '2026-10-01T00:00:00Z' }),
			observation({ category: 'Morphology', learnerKey: 'u:4', createdAt: '2026-10-01T00:00:00Z' }),
			observation({ category: 'Morphology', learnerKey: 'u:5', createdAt: '2026-10-01T00:00:00Z' }),
			observation({ category: 'Morphology', learnerKey: 'u:6', createdAt: '2026-10-01T00:00:00Z' }),
		];
		const result = computeCategoryTrajectories(observations);
		const oct = result.trajectories[0].points[1];
		expect(oct.recurringLearners).toBe(2);
		expect(oct.distinctLearners).toBe(5);
		expect(oct.recurrenceRate).toBe(40);
	});

	it('computes improvement rate from uptake annotations', () => {
		const observations: ValidatedObservation[] = Array.from({ length: 6 }, (_, i) =>
			observation({
				category: 'Lexicon',
				learnerKey: `u:${i}`,
				createdAt: '2026-09-01T00:00:00Z',
				afterRevisionStatus: i < 4 ? 'corrected' : 'unchanged',
			}),
		);
		const result = computeCategoryTrajectories(observations);
		const point = result.trajectories[0].points[0];
		// 4 corrected of 6 annotated = 66.7
		expect(point.improvementRate).toBe(Math.round((4 / 6) * 1000) / 10);
		expect(point.correctedCount).toBe(4);
	});

	it('suppresses recurrence/improvement rates below MIN', () => {
		const observations: ValidatedObservation[] = [
			observation({ category: 'Orthography', learnerKey: 'u:1', createdAt: '2026-09-01T00:00:00Z' }),
		];
		const result = computeCategoryTrajectories(observations);
		const point = result.trajectories[0].points[0];
		expect(point.recurrenceRate).toBeNull();
		expect(point.improvementRate).toBeNull();
		expect(result.trajectories[0].sufficient).toBe(false);
	});

	it('derives a coarse trend from first vs last bucket', () => {
		const decreasing: ValidatedObservation[] = [
			...Array.from({ length: 6 }, (_, i) =>
				observation({ category: 'Preposition', learnerKey: `u:${i}`, createdAt: '2026-09-01T00:00:00Z' }),
			),
			...Array.from({ length: 2 }, (_, i) =>
				observation({ category: 'Preposition', learnerKey: `u:${i}`, createdAt: '2026-10-01T00:00:00Z' }),
			),
		];
		const result = computeCategoryTrajectories(decreasing);
		expect(result.trajectories[0].trend).toBe('decreasing');
	});

	it('ignores observations without a category', () => {
		const result = computeCategoryTrajectories([observation({ category: '' })]);
		expect(result.trajectories).toHaveLength(0);
		expect(result.totalObservations).toBe(1);
	});
});

describe('assertResearchAccess — permission gate', () => {
	it('blocks students with a 403', () => {
		const denied = assertResearchAccess('student');
		expect(denied).not.toBeNull();
		expect(denied?.status).toBe(403);
	});
	it('allows faculty', () => {
		expect(assertResearchAccess('faculty')).toBeNull();
	});
});

describe('MIN_COMPARISON guard', () => {
	it('is at least 5 so a tiny sample never yields a misleading rate', () => {
		expect(MIN_COMPARISON).toBeGreaterThanOrEqual(5);
	});
});
