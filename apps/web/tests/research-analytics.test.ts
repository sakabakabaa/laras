import { describe, expect, it } from 'vitest';
import {
	assertResearchAccess,
	computeSliceStats,
	breakdown,
	MIN_ANNOTATED,
	type AnalyticsItem,
} from '@/lib/research-analytics';

function ai(over: Partial<AnalyticsItem> = {}): AnalyticsItem {
	return {
		id: 'i1',
		origin: 'ai',
		adjudicationStatus: 'adjudicated',
		evaluationId: '',
		matchedReferenceId: '',
		raterJudgments: [],
		errorPresent: '',
		detectionJudgment: '',
		correctionJudgment: '',
		explanationJudgment: '',
		completenessJudgment: '',
		necessityJudgment: '',
		pedagogicalJudgment: '',
		aiCategory: '',
		aiSubcategory: '',
		referenceCategory: '',
		referenceSubcategory: '',
		assignmentId: 'a1',
		assignmentTitle: 'Tugas',
		cefrLevel: '',
		model: '',
		promptVersion: '',
		submissionId: 's1',
		...over,
	};
}

function human(over: Partial<AnalyticsItem> = {}): AnalyticsItem {
	return ai({ origin: 'human', ...over });
}

describe('computeSliceStats — counts', () => {
	it('counts AI items, human items, and distinct submissions', () => {
		const stats = computeSliceStats([
			ai({ submissionId: 's1' }),
			ai({ submissionId: 's2' }),
			human({ submissionId: 's1' }),
		]);
		expect(stats.aiItems).toBe(2);
		expect(stats.humanItems).toBe(1);
		expect(stats.submissions).toBe(2);
	});
});

describe('computeSliceStats — detection metrics', () => {
	it('computes precision/recall/F1 from explicit judgments', () => {
		const items: AnalyticsItem[] = [
			...Array.from({ length: 8 }, () => ai({ detectionJudgment: 'correct' })),
			...Array.from({ length: 2 }, () => ai({ detectionJudgment: 'incorrect' })),
			...Array.from({ length: 2 }, () => human()),
		];
		const stats = computeSliceStats(items);
		// TP=8, FP=2, FN=2 → precision 80, recall 80, F1 80
		expect(stats.detection.tp).toBe(8);
		expect(stats.detection.fp).toBe(2);
		expect(stats.detection.fn).toBe(2);
		expect(stats.detection.precision).toBe(80);
		expect(stats.detection.recall).toBe(80);
		expect(stats.detection.f1).toBe(80);
		expect(stats.detection.sufficient).toBe(true);
	});

	it('suppresses percentages below MIN_ANNOTATED', () => {
		const items: AnalyticsItem[] = [
			ai({ detectionJudgment: 'correct' }),
			human(),
		];
		const stats = computeSliceStats(items);
		expect(stats.detection.precision).toBeNull();
		expect(stats.detection.recall).toBeNull();
		expect(stats.detection.f1).toBeNull();
		expect(stats.detection.sufficient).toBe(false);
	});

	it('uses explicit judgments, never category correlation', () => {
		// AI and human share the same category but the expert marked the AI
		// detection incorrect — it must count as a false positive, not an
		// agreement simply because labels match.
		const items: AnalyticsItem[] = [
			...Array.from({ length: 6 }, () =>
				ai({ detectionJudgment: 'incorrect', aiCategory: 'Syntax' }),
			),
			...Array.from({ length: 4 }, () => human({ aiCategory: 'Syntax' })),
		];
		const stats = computeSliceStats(items);
		expect(stats.detection.tp).toBe(0);
		expect(stats.detection.fp).toBe(6);
		expect(stats.detection.fn).toBe(4);
		expect(stats.detection.precision).toBe(0);
		expect(stats.detection.recall).toBe(0);
	});
});

describe('computeSliceStats — judgment accuracies', () => {
	it('weights partially_correct as half', () => {
		const items: AnalyticsItem[] = Array.from({ length: 10 }, (_, i) =>
			ai({
				correctionJudgment: i < 5 ? 'correct' : i < 8 ? 'partially_correct' : 'incorrect',
			}),
		);
		const stats = computeSliceStats(items);
		expect(stats.correction.judged).toBe(10);
		expect(stats.correction.correct).toBe(5);
		expect(stats.correction.partiallyCorrect).toBe(3);
		expect(stats.correction.incorrect).toBe(2);
		// (5 + 0.5*3) / 10 = 65
		expect(stats.correction.accuracy).toBe(65);
	});

	it('suppresses accuracy below MIN_ANNOTATED', () => {
		const stats = computeSliceStats([ai({ correctionJudgment: 'correct' })]);
		expect(stats.correction.accuracy).toBeNull();
		expect(stats.correction.sufficient).toBe(false);
	});
});

describe('computeSliceStats — rates', () => {
	it('computes completeness/necessity/pedagogical rates', () => {
		const items: AnalyticsItem[] = Array.from({ length: 10 }, (_, i) => ({
			...ai({
				completenessJudgment: i < 7 ? 'complete' : 'incomplete',
				necessityJudgment: i < 6 ? 'necessary' : 'unnecessary',
				pedagogicalJudgment: i < 4 ? 'appropriate' : 'needs_revision',
			}),
		}));
		const stats = computeSliceStats(items);
		expect(stats.completeness.rate).toBe(70);
		expect(stats.necessity.rate).toBe(60);
		expect(stats.pedagogical.rate).toBe(40);
	});

	it('suppresses rates below MIN_ANNOTATED', () => {
		const stats = computeSliceStats([
			ai({ completenessJudgment: 'complete', necessityJudgment: 'necessary', pedagogicalJudgment: 'appropriate' }),
		]);
		expect(stats.completeness.rate).toBeNull();
		expect(stats.necessity.rate).toBeNull();
		expect(stats.pedagogical.rate).toBeNull();
	});
});

describe('computeSliceStats — false positive/negative', () => {
	it('false-positive rate = FP / AI items, false-negative rate = FN / (TP+FN)', () => {
		const items: AnalyticsItem[] = [
			...Array.from({ length: 8 }, () => ai({ detectionJudgment: 'correct' })),
			...Array.from({ length: 2 }, () => ai({ detectionJudgment: 'incorrect' })),
			...Array.from({ length: 2 }, () => human()),
		];
		const stats = computeSliceStats(items);
		expect(stats.falsePositive.count).toBe(2);
		expect(stats.falsePositive.total).toBe(10);
		expect(stats.falsePositive.rate).toBe(20);
		expect(stats.falseNegative.count).toBe(2);
		expect(stats.falseNegative.rate).toBe(20);
	});

	it('suppresses FP/FN rates below MIN_ANNOTATED', () => {
		const stats = computeSliceStats([ai({ detectionJudgment: 'incorrect' }), human()]);
		expect(stats.falsePositive.rate).toBeNull();
		expect(stats.falseNegative.rate).toBeNull();
	});
});

describe('breakdown', () => {
	it('groups by key and sorts by item count', () => {
		const items: AnalyticsItem[] = [
			...Array.from({ length: 6 }, () => ai({ aiCategory: 'Syntax', detectionJudgment: 'correct' })),
			...Array.from({ length: 4 }, () => ai({ aiCategory: 'Lexicon', detectionJudgment: 'incorrect' })),
		];
		const rows = breakdown(items, (i) => i.aiCategory, (k) => k);
		expect(rows).toHaveLength(2);
		expect(rows[0].key).toBe('Syntax');
		expect(rows[0].stats.aiItems).toBe(6);
		expect(rows[1].stats.aiItems).toBe(4);
	});

	it('skips empty keys', () => {
		const items: AnalyticsItem[] = [ai({ aiCategory: '' }), ai({ aiCategory: 'Syntax' })];
		const rows = breakdown(items, (i) => i.aiCategory, (k) => k);
		expect(rows).toHaveLength(1);
	});
});

describe('MIN_ANNOTATED guard', () => {
	it('is at least 5 so a single item never yields a misleading 100%', () => {
		expect(MIN_ANNOTATED).toBeGreaterThanOrEqual(5);
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
	it('allows an undefined/unknown role (server re-checks ownership)', () => {
		expect(assertResearchAccess(undefined)).toBeNull();
	});
});
