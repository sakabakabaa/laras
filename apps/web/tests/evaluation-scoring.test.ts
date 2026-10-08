import { describe, expect, it } from 'vitest';
import {
	calculateRubricScores,
	clampScore,
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
	status: 'approved' | 'rejected' | 'pending' = 'approved',
) {
	return { severity, status, criterion };
}

describe('calculateRubricScores — scoring v2', () => {
	it('an unmapped finding still penalizes the total', () => {
		// One major finding with no criterion match — must not vanish.
		const scores = calculateRubricScores(
			[finding('major', 'kriteria-tidak-ada')],
			CRITERIA,
			{ wordCount: 100 },
		);
		// Major penalty = 12 (1 × 12, under the 60 cap). Length tolerance = 4 (≥60 words).
		// 100 - 12 + 4 = 92.
		expect(scores.total).toBe(92);
		// The general row must exist and carry the finding.
		expect(scores.general).not.toBeNull();
		expect(scores.general!.major).toBe(1);
		expect(scores.general!.penalty).toBe(12);
	});

	it('5 majors do not floor a long answer at 0', () => {
		// 5 major findings on a 200-word answer.
		// Penalty = min(60, 5 × 12) = 60. Length tolerance = 8.
		// Total = 100 - 60 + 8 = 48 — NOT 0.
		const scores = calculateRubricScores(
			[
				finding('major', 'c1'),
				finding('major', 'c1'),
				finding('major', 'c2'),
				finding('major', 'c2'),
				finding('major', 'c2'),
			],
			CRITERIA,
			{ wordCount: 200 },
		);
		expect(scores.total).toBe(48);
		expect(scores.total).toBeGreaterThan(0);
	});

	it('a sub-15-word answer is capped', () => {
		// No findings at all, but only 10 words — capped at 45.
		const scores = calculateRubricScores([], CRITERIA, { wordCount: 10 });
		expect(scores.total).toBe(45);
		expect(scores.completionCap).toBe(45);
	});

	it('a sub-15-word answer with findings stays capped', () => {
		// 1 minor finding, 8 words — cap applies, then penalty.
		// raw = 100 - 3 + 0 = 97, but completionCap = 45 → min(45, 97) = 45.
		const scores = calculateRubricScores(
			[finding('minor', 'c1')],
			CRITERIA,
			{ wordCount: 8 },
		);
		expect(scores.total).toBe(45);
	});

	it('rejected findings never count', () => {
		const scores = calculateRubricScores(
			[finding('major', 'c1', 'rejected')],
			CRITERIA,
			{ wordCount: 100 },
		);
		expect(scores.total).toBe(100);
		expect(scores.general).toBeNull();
	});

	it('model/detail divergence > 15 is flagged by the caller', () => {
		// Simulate the divergence check the publish route and UI perform.
		// 4 major findings on a 100-word answer → detail = 100 - 48 + 4 = 56.
		const scores = calculateRubricScores(
			[finding('major', 'c1'), finding('major', 'c1'), finding('major', 'c2'), finding('major', 'c2')],
			CRITERIA,
			{ wordCount: 100 },
		);
		const detailScore = scores.total; // 100 - 48 + 4 = 56
		const recommendedScore = 80; // model said 80
		const divergence =
			Math.abs(recommendedScore - detailScore) > 15
				? { recommendedScore, detailScore }
				: null;
		expect(divergence).not.toBeNull();
		expect(divergence!.recommendedScore).toBe(80);
		expect(divergence!.detailScore).toBe(56);
	});

	it('no divergence when scores are within 15', () => {
		const scores = calculateRubricScores(
			[finding('minor', 'c1')],
			CRITERIA,
			{ wordCount: 100 },
		);
		const detailScore = scores.total; // 100 - 3 + 4 = 101 → clamped 100
		const recommendedScore = 95;
		const divergence =
			Math.abs(recommendedScore - detailScore) > 15
				? { recommendedScore, detailScore }
				: null;
		expect(divergence).toBeNull();
	});

	it('per-criterion rows use -20/-8 (informational), total uses proportional', () => {
		// 1 major on c1: criterion row = 100 - 20 = 80.
		// Total = 100 - 12 + 4 = 92.
		const scores = calculateRubricScores(
			[finding('major', 'c1')],
			CRITERIA,
			{ wordCount: 100 },
		);
		expect(scores.rows[0].score).toBe(80); // -20 per criterion
		expect(scores.total).toBe(92); // -12 proportional + 4 length
	});

	it('no criteria: all findings are general', () => {
		const scores = calculateRubricScores(
			[finding('major', ''), finding('minor', '')],
			[],
			{ wordCount: 100 },
		);
		expect(scores.hasRubric).toBe(false);
		expect(scores.general).not.toBeNull();
		expect(scores.general!.major).toBe(1);
		expect(scores.general!.minor).toBe(1);
		// 100 - 12 - 3 + 4 = 89
		expect(scores.total).toBe(89);
	});

	it('minor penalty caps at 18 (6+ minors)', () => {
		const minors = Array.from({ length: 8 }, () => finding('minor', 'c1'));
		const scores = calculateRubricScores(minors, CRITERIA, { wordCount: 200 });
		// 8 × 3 = 24, capped at 18. Length tolerance = 8.
		// 100 - 18 + 8 = 90
		expect(scores.total).toBe(90);
	});
});

/** Replicates the pre-weighting (v2) total so equal-weight rubrics can be
 *  checked against the model that existed before weight scaling. */
function preChangeTotal(major: number, minor: number, wordCount: number): number {
	const majorPenalty = Math.min(60, major * 12);
	const minorPenalty = Math.min(18, minor * 3);
	let lengthTolerance = 0;
	if (wordCount >= 120) lengthTolerance = 8;
	else if (wordCount >= 60) lengthTolerance = 4;
	const completionCap = wordCount < 15 ? 45 : 100;
	const raw = 100 - majorPenalty - minorPenalty + lengthTolerance;
	return Math.max(0, Math.min(100, Math.round(Math.min(completionCap, raw))));
}

describe('calculateRubricScores — scoring v3 (weight sensitivity + factors)', () => {
	it('different weights produce different totals; the heavier criterion scores lower', () => {
		const findings = [finding('major', 'c1')];
		const equal = calculateRubricScores(findings, [
			{ id: 'c1', label: 'A', weight: 1 },
			{ id: 'c2', label: 'B', weight: 1 },
		], { wordCount: 100 });
		const heavyC1 = calculateRubricScores(findings, [
			{ id: 'c1', label: 'A', weight: 3 },
			{ id: 'c2', label: 'B', weight: 1 },
		], { wordCount: 100 });
		const heavyC2 = calculateRubricScores(findings, [
			{ id: 'c1', label: 'A', weight: 1 },
			{ id: 'c2', label: 'B', weight: 3 },
		], { wordCount: 100 });
		// equal: 100 - 12 + 4 = 92; heavyC1: 100 - 18 + 4 = 86; heavyC2: 100 - 6 + 4 = 98
		expect(heavyC1.total).toBeLessThan(equal.total);
		expect(heavyC2.total).toBeGreaterThan(equal.total);
		expect(heavyC1.total).not.toBe(equal.total);
		expect(equal.total).toBe(92);
		expect(heavyC1.total).toBe(86);
	});

	it('an equal-weight rubric produces the same total as the pre-weighting model', () => {
		const cases = [
			{ major: 0, minor: 0, wc: 100 },
			{ major: 2, minor: 1, wc: 100 },
			{ major: 5, minor: 6, wc: 200 },
			{ major: 1, minor: 0, wc: 8 },
		];
		for (const c of cases) {
			const findings = [
				...Array.from({ length: c.major }, () => finding('major', 'c1')),
				...Array.from({ length: c.minor }, () => finding('minor', 'c2')),
			];
			const scores = calculateRubricScores(findings, [
				{ id: 'c1', label: 'A', weight: 1 },
				{ id: 'c2', label: 'B', weight: 1 },
			], { wordCount: c.wc });
			expect(scores.total).toBe(preChangeTotal(c.major, c.minor, c.wc));
		}
	});

	it('the major/minor caps still prevent a long weighted answer flooring at 0', () => {
		const findings = Array.from({ length: 10 }, () => finding('major', 'c1'));
		const scores = calculateRubricScores(findings, [
			{ id: 'c1', label: 'A', weight: 5 },
			{ id: 'c2', label: 'B', weight: 1 },
		], { wordCount: 200 });
		// 10 majors on heavy c1 (factor 5/3) → raw huge, capped at 60. 100 - 60 + 8 = 48.
		expect(scores.total).toBeGreaterThan(0);
		expect(scores.total).toBe(48);
	});

	it('general/unmapped findings still affect the weighted total', () => {
		const none = calculateRubricScores([], CRITERIA, { wordCount: 100 });
		const withGeneral = calculateRubricScores([finding('major', 'tidak-ada')], CRITERIA, { wordCount: 100 });
		expect(withGeneral.total).toBeLessThan(none.total);
		// 1 general major, factor 1 → 12 penalty. 100 - 12 + 4 = 92.
		expect(withGeneral.total).toBe(92);
		expect(withGeneral.general).not.toBeNull();
	});

	it('factor identity: summing emitted impacts (clamped) equals the total', () => {
		const sets = [
			{ label: 'normal', findings: [finding('major', 'c1'), finding('minor', 'c2')], wc: 100 },
			{ label: 'capped', findings: Array.from({ length: 8 }, () => finding('major', 'c1')), wc: 200 },
			{ label: 'general', findings: [finding('major', 'x'), finding('minor', 'y')], wc: 100 },
			{ label: 'completion', findings: [finding('minor', 'c1')], wc: 8 },
		];
		for (const s of sets) {
			const scores = calculateRubricScores(s.findings, CRITERIA, { wordCount: s.wc });
			const sum = scores.factors.reduce((acc, f) => acc + f.impact, 0);
			expect(clampScore(sum)).toBe(scores.total);
		}
	});

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
