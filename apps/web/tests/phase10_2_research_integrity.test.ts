/**
 * Phase 10.2 — Research integrity and experimental readiness tests.
 *
 * Tests A–J from the Phase 10.2 specification:
 *  A. Unreviewed human reference does not enter personalization.
 *  B. Unreviewed AI finding does not enter personalization.
 *  C. Adjudicated human reference enters personalization.
 *  D. Confirmed/adjudicated AI finding enters personalization.
 *  E. Unknown current category uses generic personalization context.
 *  F. Two AI runs for the same submission retain separate provenance.
 *  G. Multiple AI findings can map to one reference error without
 *     double-counting the reference error.
 *  H. Unreviewed items are excluded from final research metrics.
 *  I. Student-facing feedback still exposes no research metadata.
 *  J. Generic and personalized feedback remain distinguishable in provenance.
 *
 * Pure functions only — no PocketBase mocking.
 */
import { describe, expect, it } from 'vitest';
import {
	isValidatedForPersonalization,
	classifyFeedbackItem,
	sanitizeTaxonomy,
} from '@/lib/ai-evaluation';
import {
	buildLearnerProfile,
	type LearnerObservation,
} from '@/lib/learner-profile';
import {
	buildPersonalizationContext,
	selectStrategy,
	summarizeDecision,
} from '@/lib/personalization.server';
import {
	computeSliceStats,
	countDistinctReferenceErrors,
	attachProvenanceToItems,
	type AnalyticsItem,
} from '@/lib/research-analytics';

function obs(category: string, subcategory: string, createdAt: string): LearnerObservation {
	return {
		category,
		subcategory,
		severity: 'major',
		assignmentId: 'asg1',
		createdAt,
	};
}

function aiItem(over: Partial<AnalyticsItem> = {}): AnalyticsItem {
	return {
		id: 'i1',
		origin: 'ai',
		adjudicationStatus: 'reviewed',
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

function humanItem(over: Partial<AnalyticsItem> = {}): AnalyticsItem {
	return aiItem({ origin: 'human', ...over });
}

// ── A–D: validated learner profile evidence eligibility ───────────────────

describe('Phase 10.2 — evidence eligibility for personalization', () => {
	it('A. unreviewed human reference does not enter personalization', () => {
		expect(
			isValidatedForPersonalization({
				origin: 'human',
				detectionJudgment: '',
				adjudicationStatus: 'unreviewed',
			}),
		).toBe(false);
	});

	it('B. unreviewed AI finding does not enter personalization', () => {
		// Even if detectionJudgment='correct', an unreviewed item is NOT validated.
		expect(
			isValidatedForPersonalization({
				origin: 'ai',
				detectionJudgment: 'correct',
				adjudicationStatus: 'unreviewed',
			}),
		).toBe(false);
	});

	it('C. adjudicated human reference enters personalization', () => {
		expect(
			isValidatedForPersonalization({
				origin: 'human',
				detectionJudgment: '',
				adjudicationStatus: 'adjudicated',
			}),
		).toBe(true);
		// 'reviewed' also qualifies.
		expect(
			isValidatedForPersonalization({
				origin: 'human',
				detectionJudgment: '',
				adjudicationStatus: 'reviewed',
			}),
		).toBe(true);
	});

	it('D. confirmed/adjudicated AI finding enters personalization', () => {
		expect(
			isValidatedForPersonalization({
				origin: 'ai',
				detectionJudgment: 'correct',
				adjudicationStatus: 'adjudicated',
			}),
		).toBe(true);
		// AI finding with detectionJudgment != 'correct' does NOT qualify even
		// when adjudicated — merely existing AI findings are not validated.
		expect(
			isValidatedForPersonalization({
				origin: 'ai',
				detectionJudgment: 'incorrect',
				adjudicationStatus: 'adjudicated',
			}),
		).toBe(false);
	});
});

// ── E: unknown current category uses generic context ─────────────────────

describe('Phase 10.2 — unknown category uses generic context', () => {
	it('E. unknown current category produces empty (generic) personalization context', () => {
		// The learner has a recurring pattern, but the current error category
		// is unknown pre-model. The entire profile must NOT be provided.
		const profile = buildLearnerProfile(
			[
				obs('Morphology', 'case', '2026-01-01'),
				obs('Morphology', 'case', '2026-01-02'),
				obs('Morphology', 'case', '2026-01-03'),
			],
			3,
		);
		expect(profile.patterns[0].status).not.toBe('emerging');

		const context = buildPersonalizationContext({ profile, currentCategory: '' });
		expect(context).toBe('');

		// selectStrategy also returns generic for unknown category.
		const strategy = selectStrategy({ profile, currentCategory: '', hintLevel: 1 });
		expect(strategy).toBe('generic');
	});

	it('E2. known current category that matches a pattern provides context', () => {
		const profile = buildLearnerProfile(
			[
				obs('Morphology', 'case', '2026-01-01'),
				obs('Morphology', 'case', '2026-01-02'),
				obs('Morphology', 'case', '2026-01-03'),
			],
			3,
		);
		const context = buildPersonalizationContext({ profile, currentCategory: 'Morphology' });
		expect(context).not.toBe('');
		expect(context).toContain('Morphology');
	});

	it('E3. known current category with no matching pattern produces empty context', () => {
		const profile = buildLearnerProfile(
			[
				obs('Morphology', 'case', '2026-01-01'),
				obs('Morphology', 'case', '2026-01-02'),
				obs('Morphology', 'case', '2026-01-03'),
			],
			3,
		);
		// 'Syntax' has no validated pattern — no context provided.
		const context = buildPersonalizationContext({ profile, currentCategory: 'Syntax' });
		expect(context).toBe('');
	});
});

// ── F: two AI runs for the same submission retain separate provenance ─────

describe('Phase 10.2 — exact evaluation provenance', () => {
	it('F. two AI runs for the same submission retain separate provenance', () => {
		// Submission S1 has two evaluation runs: E1 (prompt V1) and E2 (prompt V2).
		// Each ai_feedback_items row carries its own evaluationId.
		const items: AnalyticsItem[] = [
			aiItem({ evaluationId: 'e1', submissionId: 's1', assignmentId: 'a1' }),
			aiItem({ evaluationId: 'e2', submissionId: 's1', assignmentId: 'a1' }),
		];
		const evaluations = new Map([
			['e1', { model: 'gpt-4', promptVersion: 'v1' }],
			['e2', { model: 'gpt-4o', promptVersion: 'v2' }],
		]);
		attachProvenanceToItems(items, evaluations);
		// Each item retains its own evaluation's provenance — not collapsed.
		expect(items[0].model).toBe('gpt-4');
		expect(items[0].promptVersion).toBe('v1');
		expect(items[1].model).toBe('gpt-4o');
		expect(items[1].promptVersion).toBe('v2');
	});

	it('F2. items without an evaluationId get no provenance', () => {
		const items: AnalyticsItem[] = [aiItem({ evaluationId: '', submissionId: 's1' })];
		const evaluations = new Map([
			['e1', { model: 'gpt-4', promptVersion: 'v1' }],
		]);
		attachProvenanceToItems(items, evaluations);
		expect(items[0].model).toBe('');
		expect(items[0].promptVersion).toBe('');
	});
});

// ── G: many-to-one alignment without double-counting ──────────────────────

describe('Phase 10.2 — AI↔human error alignment', () => {
	it('G. multiple AI findings map to one reference error without double-counting', () => {
		// 1 human reference error (h1) + 3 AI findings all linked to h1.
		const items = [
			{ origin: 'human', matchedReferenceId: '', id: 'h1' },
			{ origin: 'ai', matchedReferenceId: 'h1', id: 'a1' },
			{ origin: 'ai', matchedReferenceId: 'h1', id: 'a2' },
			{ origin: 'ai', matchedReferenceId: 'h1', id: 'a3' },
		];
		// The 3 AI findings all point to the same human reference — they count
		// as ONE reference error, not 3.
		expect(countDistinctReferenceErrors(items)).toBe(1);
	});

	it('G2. AI findings with no matchedReferenceId do not add reference errors', () => {
		const items = [
			{ origin: 'human', matchedReferenceId: '', id: 'h1' },
			{ origin: 'ai', matchedReferenceId: '', id: 'a1' },
			{ origin: 'ai', matchedReferenceId: '', id: 'a2' },
		];
		// Only the human item counts; unmatched AI findings are not reference errors.
		expect(countDistinctReferenceErrors(items)).toBe(1);
	});

	it('G3. AI findings with a matchedReferenceId not in human set count once per unique ref', () => {
		const items = [
			{ origin: 'human', matchedReferenceId: '', id: 'h1' },
			{ origin: 'ai', matchedReferenceId: 'refX', id: 'a1' },
			{ origin: 'ai', matchedReferenceId: 'refX', id: 'a2' },
			{ origin: 'ai', matchedReferenceId: 'refY', id: 'a3' },
		];
		// 1 human + 2 distinct AI-only refs (refX, refY) = 3.
		expect(countDistinctReferenceErrors(items)).toBe(3);
	});
});

// ── H: unreviewed items excluded from final metrics ───────────────────────

describe('Phase 10.2 — research metric eligibility', () => {
	it('H. unreviewed items are excluded from final research metrics', () => {
		const items: AnalyticsItem[] = [
			aiItem({ detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			aiItem({ detectionJudgment: 'correct', adjudicationStatus: 'unreviewed' }),
			aiItem({ detectionJudgment: 'incorrect', adjudicationStatus: 'unreviewed' }),
			humanItem({ adjudicationStatus: 'unreviewed' }),
			humanItem({ adjudicationStatus: 'adjudicated' }),
		];
		const stats = computeSliceStats(items);
		// Phase 10.4 — only adjudicated items contribute to gold-standard metrics.
		// tp = 1 (adjudicated AI, correct), fp = 0, fn = 1 (adjudicated human).
		expect(stats.detection.tp).toBe(1);
		expect(stats.detection.fp).toBe(0);
		expect(stats.detection.fn).toBe(1);
		// Raw counts still include all items (descriptive).
		expect(stats.aiItems).toBe(3);
		expect(stats.humanItems).toBe(2);
		// Eligibility breakdown is explicit.
		expect(stats.eligibility.adjudicated).toBe(2);
		expect(stats.eligibility.reviewedOnly).toBe(0);
		expect(stats.eligibility.goldStandard).toBe(2);
	});

	it('H2. all-unreviewed yields null metrics (insufficient data, never 0%)', () => {
		const items: AnalyticsItem[] = [
			aiItem({ detectionJudgment: 'correct', adjudicationStatus: 'unreviewed' }),
			aiItem({ detectionJudgment: 'incorrect', adjudicationStatus: 'unreviewed' }),
		];
		const stats = computeSliceStats(items);
		// No adjudicated items → tp=0, fp=0, fn=0 → precision/recall null (insufficient).
		expect(stats.detection.tp).toBe(0);
		expect(stats.detection.fp).toBe(0);
		expect(stats.detection.fn).toBe(0);
		expect(stats.detection.precision).toBeNull();
		expect(stats.detection.recall).toBeNull();
	});

	it('H3. reviewed-only items are NOT gold-standard (Phase 10.4)', () => {
		// 20 reviewed records, 0 adjudicated → gold-standard metrics null, never 0%.
		const items: AnalyticsItem[] = Array.from({ length: 20 }, (_, i) =>
			aiItem({
				detectionJudgment: i < 10 ? 'correct' : 'incorrect',
				adjudicationStatus: 'reviewed',
			}),
		);
		const stats = computeSliceStats(items);
		expect(stats.eligibility.adjudicated).toBe(0);
		expect(stats.eligibility.reviewedOnly).toBe(20);
		expect(stats.eligibility.goldStandard).toBe(0);
		expect(stats.detection.precision).toBeNull();
		expect(stats.detection.recall).toBeNull();
		expect(stats.alignmentAware.precision).toBeNull();
		expect(stats.alignmentAware.recall).toBeNull();
	});
});

// ── I: student-facing feedback exposes no research metadata ──────────────

describe('Phase 10.2 — student privacy', () => {
	it('I. personalization context contains no student identifiers or raw answers', () => {
		const profile = buildLearnerProfile(
			[
				obs('Morphology', 'case', '2026-01-01'),
				obs('Morphology', 'case', '2026-01-02'),
				obs('Morphology', 'case', '2026-01-03'),
			],
			3,
		);
		const context = buildPersonalizationContext({ profile, currentCategory: 'Morphology' });
		// No student names, emails, NIMs, or raw answer text.
		expect(context).not.toMatch(/@|nim|nama\s*:/i);
		// No internal model confidence values (0.0–1.0 decimals).
		expect(context).not.toMatch(/confidence\s*[:=]?\s*0\.\d+/i);
		// The context explicitly instructs the model not to expose counts.
		expect(context).toMatch(/jangan sebutkan angka|jangan menyebutkan jumlah/i);
	});

	it('I2. classifyFeedbackItem distinguishes rejected AI from reference error', () => {
		// A rejected AI finding must never become a reference error.
		expect(
			classifyFeedbackItem({
				origin: 'ai',
				detectionJudgment: 'incorrect',
				adjudicationStatus: 'adjudicated',
			}),
		).toBe('rejected_ai_finding');

		expect(
			classifyFeedbackItem({
				origin: 'human',
				detectionJudgment: '',
				adjudicationStatus: 'adjudicated',
			}),
		).toBe('adjudicated_reference_error');

		// Unreviewed AI never enters personalization.
		expect(
			classifyFeedbackItem({
				origin: 'ai',
				detectionJudgment: 'correct',
				adjudicationStatus: 'unreviewed',
			}),
		).toBe('unreviewed');
	});
});

// ── J: generic vs personalized provenance distinguishable ─────────────────

describe('Phase 10.2 — experimental condition reproducibility', () => {
	it('J. generic and personalized feedback remain distinguishable in provenance', () => {
		const profile = buildLearnerProfile(
			[
				obs('Morphology', 'case', '2026-01-01'),
				obs('Morphology', 'case', '2026-01-02'),
				obs('Morphology', 'case', '2026-01-03'),
			],
			3,
		);

		// Personalized: currentCategory matches an established pattern.
		const personalizedDecision = summarizeDecision({
			profile,
			currentCategory: 'Morphology',
			strategy: 'focused',
		});
		expect(personalizedDecision.enabled).toBe(true);
		expect(personalizedDecision.strategy).not.toBe('generic');
		expect(personalizedDecision.profileVersion).not.toBe('');

		// Generic: no profile or unknown category.
		const genericDecision = summarizeDecision({
			profile: null,
			currentCategory: '',
			strategy: 'generic',
		});
		expect(genericDecision.enabled).toBe(false);
		expect(genericDecision.strategy).toBe('generic');
		expect(genericDecision.profileVersion).toBe('');
	});

	it('J2. unknown category with a profile still yields generic provenance', () => {
		const profile = buildLearnerProfile(
			[
				obs('Morphology', 'case', '2026-01-01'),
				obs('Morphology', 'case', '2026-01-02'),
				obs('Morphology', 'case', '2026-01-03'),
			],
			3,
		);
		// Profile exists but currentCategory is unknown → generic.
		const decision = summarizeDecision({
			profile,
			currentCategory: '',
			strategy: 'generic',
		});
		expect(decision.enabled).toBe(false);
		expect(decision.strategy).toBe('generic');
		expect(decision.historicalObservationCount).toBe(0);
	});
});

// ── Strict taxonomy enforcement (requirement 3) ───────────────────────────

describe('Phase 10.2 — strict taxonomy enforcement', () => {
	it('sanitizes invalid AI taxonomy to empty strings', () => {
		expect(sanitizeTaxonomy('Foo', 'bar')).toEqual({ category: '', subcategory: '' });
		expect(sanitizeTaxonomy('Morphology', 'invalid_sub')).toEqual({
			category: '',
			subcategory: '',
		});
	});

	it('preserves valid taxonomy pairs', () => {
		expect(sanitizeTaxonomy('Morphology', 'case')).toEqual({
			category: 'Morphology',
			subcategory: 'case',
		});
		expect(sanitizeTaxonomy('Syntax', 'word_order')).toEqual({
			category: 'Syntax',
			subcategory: 'word_order',
		});
	});

	it('never normalizes arbitrary labels into official categories', () => {
		// "morphology" (lowercase) is NOT the same as "Morphology" — rejected.
		expect(sanitizeTaxonomy('morphology', 'case')).toEqual({
			category: '',
			subcategory: '',
		});
	});
});
