import { describe, expect, it } from 'vitest';
import {
	calculateRubricScores,
	clampScore,
	countWords,
	isCountedFinding,
	speakingTranscriptUnavailable,
	type RubricCriterion,
} from '@/lib/evaluation-scoring';

const CRITERIA: RubricCriterion[] = [
	{ id: 'c1', label: 'Tata bahasa', weight: 1 },
	{ id: 'c2', label: 'Kosakata', weight: 1 },
];

function finding(
	severity: 'minor' | 'major',
	criterion: string,
	status: 'approved' | 'rejected' | 'pending' | 'edited' | 'manual' = 'approved',
) {
	return { severity, status, criterion };
}

/**
 * Formal scoring v4: the score is the weighted average of the lecturer's
 * explicit per-criterion achievement scores. Findings are evidence that
 * supports (or contradicts) a criterion — they never add an automatic
 * deduction, so a finding alone can never move the total.
 */
describe('calculateRubricScores — formal scoring v4', () => {
	it('is the weighted average of the explicit criterion scores', () => {
		const scores = calculateRubricScores([], CRITERIA, {
			wordCount: 100,
			criterionScores: { c1: 80, c2: 60 },
		});
		expect(scores.total).toBe(70);
		expect(scores.rows.map(r => r.score)).toEqual([80, 60]);
	});

	it('weights the criteria by their rubric weight', () => {
		const scores = calculateRubricScores([], [
			{ id: 'c1', label: 'A', weight: 3 },
			{ id: 'c2', label: 'B', weight: 1 },
		], {
			wordCount: 100,
			criterionScores: { c1: 80, c2: 60 },
		});
		// (80 × 3 + 60 × 1) / 4 = 75
		expect(scores.total).toBe(75);
	});

	it('a heavier criterion pulls the total toward its own score', () => {
		const findings = [finding('major', 'c1')];
		const equal = calculateRubricScores(findings, [
			{ id: 'c1', label: 'A', weight: 1 },
			{ id: 'c2', label: 'B', weight: 1 },
		], { wordCount: 100, criterionScores: { c1: 80, c2: 60 } });
		const heavyC1 = calculateRubricScores(findings, [
			{ id: 'c1', label: 'A', weight: 3 },
			{ id: 'c2', label: 'B', weight: 1 },
		], { wordCount: 100, criterionScores: { c1: 80, c2: 60 } });
		const heavyC2 = calculateRubricScores(findings, [
			{ id: 'c1', label: 'A', weight: 1 },
			{ id: 'c2', label: 'B', weight: 3 },
		], { wordCount: 100, criterionScores: { c1: 80, c2: 60 } });
		// c1 (80) is the higher score: weighting it up pulls the total up.
		// (80 × 3 + 60 × 1) / 4 = 75; (80 × 1 + 60 × 3) / 4 = 65.
		expect(heavyC1.total).toBeGreaterThan(equal.total);
		expect(heavyC2.total).toBeLessThan(equal.total);
		expect(equal.total).toBe(70);
		expect(heavyC1.total).toBe(75);
		expect(heavyC2.total).toBe(65);
	});

	it('findings never add an automatic deduction', () => {
		const none = calculateRubricScores([], CRITERIA, {
			wordCount: 100,
			criterionScores: { c1: 80, c2: 60 },
		});
		const withFindings = calculateRubricScores(
			[
				finding('major', 'c1'),
				finding('major', 'c1'),
				finding('major', 'c2'),
				finding('minor', 'c2'),
			],
			CRITERIA,
			{ wordCount: 100, criterionScores: { c1: 80, c2: 60 } },
		);
		expect(withFindings.total).toBe(none.total);
	});

	it('an unmapped finding is reported as general evidence and does not change the total', () => {
		const scores = calculateRubricScores(
			[finding('major', 'kriteria-tidak-ada')],
			CRITERIA,
			{ wordCount: 100, criterionScores: { c1: 80, c2: 60 } },
		);
		expect(scores.total).toBe(70);
		expect(scores.general).not.toBeNull();
		expect(scores.general!.major).toBe(1);
		expect(scores.general!.minor).toBe(0);
	});

	it('rejected findings never count', () => {
		const scores = calculateRubricScores(
			[finding('major', 'c1', 'rejected')],
			CRITERIA,
			{ wordCount: 100, criterionScores: { c1: 80, c2: 60 } },
		);
		expect(scores.total).toBe(70);
		expect(scores.general).toBeNull();
		expect(scores.rows[0].major).toBe(0);
	});

	it('counts findings per criterion as evidence alongside the achievement score', () => {
		const scores = calculateRubricScores(
			[finding('major', 'c1'), finding('minor', 'c1'), finding('minor', 'c2')],
			CRITERIA,
			{ wordCount: 100, criterionScores: { c1: 80, c2: 60 } },
		);
		expect(scores.rows[0].major).toBe(1);
		expect(scores.rows[0].minor).toBe(1);
		expect(scores.rows[1].major).toBe(0);
		expect(scores.rows[1].minor).toBe(1);
		// The evidence counts never change the achievement score.
		expect(scores.rows[0].score).toBe(80);
		expect(scores.rows[1].score).toBe(60);
	});

	it('with no criteria there is no rubric and no score', () => {
		const scores = calculateRubricScores(
			[finding('major', ''), finding('minor', '')],
			[],
			{ wordCount: 100 },
		);
		expect(scores.hasRubric).toBe(false);
		expect(scores.total).toBe(0);
		expect(scores.general).not.toBeNull();
		expect(scores.general!.major).toBe(1);
		expect(scores.general!.minor).toBe(1);
	});

	it('an unscored criterion yields a score of 0 rather than being skipped', () => {
		const scores = calculateRubricScores([], CRITERIA, {
			wordCount: 100,
			criterionScores: { c1: 100 },
		});
		expect(scores.rows[0].score).toBe(100);
		expect(scores.rows[1].score).toBe(0);
		expect(scores.total).toBe(50);
	});

	it('the total is clamped into 0..100', () => {
		const scores = calculateRubricScores([], CRITERIA, {
			wordCount: 100,
			criterionScores: { c1: 100, c2: 100 },
		});
		expect(scores.total).toBe(100);
		expect(scores.total).toBeLessThanOrEqual(100);
		expect(scores.total).toBeGreaterThanOrEqual(0);
	});

	it('word count is reported but never changes the formal total', () => {
		const short = calculateRubricScores([], CRITERIA, {
			wordCount: 8,
			criterionScores: { c1: 80, c2: 60 },
		});
		const long = calculateRubricScores([], CRITERIA, {
			wordCount: 300,
			criterionScores: { c1: 80, c2: 60 },
		});
		expect(short.total).toBe(70);
		expect(long.total).toBe(70);
		expect(short.wordCount).toBe(8);
		expect(long.wordCount).toBe(300);
	});

	it('emits one factor per weighted criterion and the impacts sum to the total', () => {
		const scores = calculateRubricScores([], [
			{ id: 'c1', label: 'A', weight: 3 },
			{ id: 'c2', label: 'B', weight: 1 },
		], {
			wordCount: 100,
			criterionScores: { c1: 80, c2: 60 },
		});
		expect(scores.factors.length).toBe(2);
		const sum = scores.factors.reduce((acc, f) => acc + f.impact, 0);
		expect(clampScore(sum)).toBe(scores.total);
	});
});

describe('isCountedFinding', () => {
	it('counts lecturer-approved, edited and manual findings', () => {
		expect(isCountedFinding('approved')).toBe(true);
		expect(isCountedFinding('edited')).toBe(true);
		expect(isCountedFinding('manual')).toBe(true);
	});

	it('never counts rejected or pending findings', () => {
		expect(isCountedFinding('rejected')).toBe(false);
		expect(isCountedFinding('pending')).toBe(false);
	});
});

describe('clampScore', () => {
	it('clamps into 0..100 and rounds', () => {
		expect(clampScore(-10)).toBe(0);
		expect(clampScore(150)).toBe(100);
		expect(clampScore(72.4)).toBe(72);
		expect(clampScore(72.5)).toBe(73);
	});
});

describe('countWords', () => {
	it('counts whitespace-separated words and treats empty text as 0', () => {
		expect(countWords('Hallo Welt')).toBe(2);
		expect(countWords('  spaced   out  ')).toBe(2);
		expect(countWords('')).toBe(0);
		expect(countWords('   ')).toBe(0);
	});
});

describe('speakingTranscriptUnavailable', () => {
	it('a speaking submission with an unavailable transcript is flagged ungradable', () => {
		expect(speakingTranscriptUnavailable('speaking', 'failed')).toBe(true);
		expect(speakingTranscriptUnavailable('speaking', 'processing')).toBe(true);
		expect(speakingTranscriptUnavailable('speaking', 'pending')).toBe(true);
		expect(speakingTranscriptUnavailable('speaking', '')).toBe(true);
		expect(speakingTranscriptUnavailable('speaking', 'ready')).toBe(false);
		// non-speaking tasks are never blocked by transcript status
		expect(speakingTranscriptUnavailable('writing', 'failed')).toBe(false);
		expect(speakingTranscriptUnavailable('writing', '')).toBe(false);
	});
});
