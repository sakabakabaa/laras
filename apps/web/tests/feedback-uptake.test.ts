/**
 * Phase 9 — feedback uptake and revision analytics tests.
 *
 * Tests the pure, client-safe helpers in feedback-uptake.ts: hint-level
 * normalization, max-level-before-revision, explicit-correction detection,
 * and uptake analytics computation (including rate suppression below the
 * minimum annotated threshold). No causality is ever inferred.
 */
import { describe, expect, it } from 'vitest';
import {
	computeUptakeAnalytics,
	maxHintLevelBeforeRevision,
	normalizeHintLevels,
	requiredExplicitCorrection,
	MIN_UPTAKE_ANNOTATED,
	type UptakeRecord,
} from '@/lib/feedback-uptake';

function record(overrides: Partial<UptakeRecord> = {}): UptakeRecord {
	return {
		uptakeJudgment: '',
		beforeRevisionStatus: '',
		afterRevisionStatus: '',
		numberOfHints: 0,
		maxHintLevel: 0,
		requiredExplicit: false,
		cefrLevel: '',
		assignmentId: 'asg1',
		aiCategory: '',
		aiSubcategory: '',
		model: '',
		...overrides,
	};
}

describe('normalizeHintLevels', () => {
	it('deduplicates and sorts hint levels', () => {
		expect(normalizeHintLevels([3, 1, 2, 1, 3])).toEqual([1, 2, 3]);
	});

	it('drops zero and non-finite values', () => {
		expect(normalizeHintLevels([0, 2, NaN, 1])).toEqual([1, 2]);
	});

	it('returns empty for an empty array', () => {
		expect(normalizeHintLevels([])).toEqual([]);
	});
});

describe('maxHintLevelBeforeRevision', () => {
	it('returns the highest level reached', () => {
		expect(maxHintLevelBeforeRevision([1, 2, 3])).toBe(3);
	});

	it('detects Level 4 explicit correction', () => {
		expect(maxHintLevelBeforeRevision([1, 2, 4])).toBe(4);
	});

	it('returns 0 when no hints were used', () => {
		expect(maxHintLevelBeforeRevision([])).toBe(0);
	});
});

describe('requiredExplicitCorrection', () => {
	it('is true when Level 4 is in the chain', () => {
		expect(requiredExplicitCorrection([1, 2, 4])).toBe(true);
	});

	it('is false for progressive levels only', () => {
		expect(requiredExplicitCorrection([1, 2, 3])).toBe(false);
	});
});

describe('computeUptakeAnalytics', () => {
	it('returns zero counts for an empty dataset', () => {
		const a = computeUptakeAnalytics([]);
		expect(a.totalFeedbackItems).toBe(0);
		expect(a.itemsWithRevisions).toBe(0);
		expect(a.successfulUptakeRate).toBeNull();
		expect(a.averageHintLevel).toBeNull();
	});

	it('suppresses rates below the minimum annotated threshold', () => {
		const records = Array.from({ length: MIN_UPTAKE_ANNOTATED - 1 }, () =>
			record({ uptakeJudgment: 'successful_uptake', maxHintLevel: 1 }),
		);
		const a = computeUptakeAnalytics(records);
		expect(a.itemsWithUptakeAnnotation).toBe(MIN_UPTAKE_ANNOTATED - 1);
		expect(a.successfulUptakeRate).toBeNull();
		expect(a.proportionLevel1).toBeNull();
	});

	it('computes uptake rates when the sample is sufficient', () => {
		const records: UptakeRecord[] = [
			...Array.from({ length: 6 }, () => record({ uptakeJudgment: 'successful_uptake', maxHintLevel: 1 })),
			...Array.from({ length: 2 }, () => record({ uptakeJudgment: 'partial_uptake', maxHintLevel: 2 })),
			...Array.from({ length: 2 }, () => record({ uptakeJudgment: 'no_uptake', maxHintLevel: 3 })),
		];
		const a = computeUptakeAnalytics(records);
		expect(a.itemsWithUptakeAnnotation).toBe(10);
		expect(a.successfulUptakeRate).toBe(60);
		expect(a.partialUptakeRate).toBe(20);
		expect(a.noUptakeRate).toBe(20);
		expect(a.unsuccessfulUptakeRate).toBe(0);
	});

	it('computes hint-efficiency proportions', () => {
		const records: UptakeRecord[] = [
			...Array.from({ length: 5 }, () => record({ maxHintLevel: 1 })),
			...Array.from({ length: 3 }, () => record({ maxHintLevel: 2 })),
			...Array.from({ length: 2 }, () => record({ maxHintLevel: 4, requiredExplicit: true })),
		];
		const a = computeUptakeAnalytics(records);
		expect(a.averageHintLevel).toBe(1.9);
		expect(a.proportionLevel1).toBe(50);
		expect(a.proportionLevel2).toBe(30);
		expect(a.proportionLevel3).toBe(0);
		expect(a.proportionExplicit).toBe(20);
	});

	it('never infers causality — attribution is descriptive only', () => {
		const records = Array.from({ length: 5 }, () =>
			record({ uptakeJudgment: 'successful_uptake', maxHintLevel: 1 }),
		);
		const a = computeUptakeAnalytics(records);
		// The analytics describe "feedback-associated revision outcomes,"
		// not "AI caused improvement." The structure carries no causal claim.
		expect(a.successfulUptakeRate).toBe(100);
		expect(a.itemsWithRevisions).toBe(5);
	});
});
