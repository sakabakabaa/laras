/**
 * Phase 10.4 — research workflow completion & gold-standard enforcement.
 *
 * Covers the mandatory test groups A–I from the Phase 10.4 specification:
 *  A. UI role selection (Rater 1 / Rater 2 / Adjudicator explicit, transmitted).
 *  B. Rater independence (same reviewer rejected across rounds; rejected
 *     submission does not modify existing data).
 *  C. Adjudication (explicitly stored, does not overwrite Rater 1 / Rater 2,
 *     raw independent judgments remain available).
 *  D. Gold-standard eligibility (unreviewed/reviewed-only excluded;
 *     adjudicated included; conflicting raters without adjudication excluded;
 *     missing adjudication → null, never 0%).
 *  E. Metrics (computeSliceStats / computeAlignmentAwareDetection use correct
 *     eligibility; precision/recall exclude non-gold-standard; FP not inflated
 *     by many-to-one; FN represent unmatched references).
 *  F. Alignment isolation (same participant+assignment valid; cross rejected;
 *     invalid reference id rejected).
 *  G. Alignment many-to-one (A1+A2+A3→R1 = one reference; A4 unmatched =
 *     FP candidate; R without AI = FN candidate).
 *  H. Export (no raw internal IDs; pseudonymous IDs stable; namespaces
 *     distinct; snapshot deterministic; changes when data changes).
 *  I. Regression — independent-rater analysis preserved (agreement summary).
 *
 * Pure functions only — no PocketBase mocking. The server-side independence
 * enforcement is tested through the pure `validateRaterIndependence` helper
 * that the server calls before any write.
 */
import { describe, expect, it } from 'vitest';
import {
	appendRaterJudgment,
	parseRaterJudgments,
	rater1Judgment,
	rater2Judgment,
	adjudicationJudgment,
	finalResearchJudgment,
	validateRaterIndependence,
	type RaterJudgment,
} from '@/lib/research-rater';
import {
	computeSliceStats,
	computeAlignmentAwareDetection,
	alignErrors,
	sameScope,
	goldStandardJudgment,
	isGoldStandard,
	summarizeDatasetAgreement,
	type AnalyticsItem,
} from '@/lib/research-analytics';
import {
	createPseudonymizer,
	computeDatasetSnapshotId,
} from '@/lib/research-export.server';

function ai(over: Partial<AnalyticsItem> = {}): AnalyticsItem {
	return {
		id: 'i1',
		origin: 'ai',
		adjudicationStatus: 'adjudicated',
		evaluationId: 'e1',
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

function rater(round: 1 | 2 | 0, reviewer: string, over: Partial<RaterJudgment> = {}): RaterJudgment {
	return {
		round,
		reviewer,
		reviewedAt: `2026-01-0${round === 0 ? 3 : round}T00:00:00Z`,
		detectionJudgment: 'correct',
		...over,
	};
}

// ── A. UI role selection ───────────────────────────────────────────────────

describe('Phase 10.4 A — UI role selection', () => {
	it('Rater 1 can submit explicitly (round 1)', () => {
		const after = appendRaterJudgment([], rater(1, 'rev1'));
		expect(rater1Judgment(after)?.reviewer).toBe('rev1');
		expect(rater1Judgment(after)?.round).toBe(1);
	});

	it('Rater 2 can submit explicitly (round 2)', () => {
		const after = appendRaterJudgment(
			appendRaterJudgment([], rater(1, 'rev1')),
			rater(2, 'rev2'),
		);
		expect(rater2Judgment(after)?.reviewer).toBe('rev2');
		expect(rater2Judgment(after)?.round).toBe(2);
	});

	it('Adjudicator can submit explicitly (round 0)', () => {
		const after = appendRaterJudgment(
			appendRaterJudgment(
				appendRaterJudgment([], rater(1, 'rev1')),
				rater(2, 'rev2'),
			),
			rater(0, 'rev3'),
		);
		expect(adjudicationJudgment(after)?.reviewer).toBe('rev3');
		expect(adjudicationJudgment(after)?.round).toBe(0);
	});

	it('the role is transmitted as an explicit round value, not inferred', () => {
		// A round-2 judgment is stored as round 2, never silently as round 1.
		const after = appendRaterJudgment([], rater(2, 'rev2'));
		expect(after[0].round).toBe(2);
		expect(rater1Judgment(after)).toBeNull();
	});

	it('defaulting silently to Rater 1 is no longer the only path — round 2 is distinct', () => {
		const r1 = appendRaterJudgment([], rater(1, 'rev1'));
		const r2 = appendRaterJudgment(r1, rater(2, 'rev2'));
		// Both coexist; neither was collapsed into the other.
		expect(r1).toHaveLength(1);
		expect(r2).toHaveLength(2);
		expect(rater1Judgment(r2)?.reviewer).toBe('rev1');
		expect(rater2Judgment(r2)?.reviewer).toBe('rev2');
	});
});

// ── B. Rater independence ──────────────────────────────────────────────────

describe('Phase 10.4 B — rater independence', () => {
	it('Rater 1 reviewer A + Rater 2 reviewer B → accepted', () => {
		const existing = appendRaterJudgment([], rater(1, 'A'));
		const result = validateRaterIndependence(existing, rater(2, 'B'));
		expect(result.ok).toBe(true);
	});

	it('Rater 1 reviewer A + Rater 2 reviewer A → rejected', () => {
		const existing = appendRaterJudgment([], rater(1, 'A'));
		const result = validateRaterIndependence(existing, rater(2, 'A'));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toBeTruthy();
	});

	it('a rejected submission does not modify existing judgments', () => {
		const existing = appendRaterJudgment([], rater(1, 'A', { detectionJudgment: 'correct' }));
		const snapshot = JSON.parse(JSON.stringify(existing));
		const result = validateRaterIndependence(existing, rater(2, 'A'));
		expect(result.ok).toBe(false);
		// The existing array is unchanged — validation never mutates.
		expect(existing).toEqual(snapshot);
		expect(rater1Judgment(existing)?.detectionJudgment).toBe('correct');
		expect(rater2Judgment(existing)).toBeNull();
	});

	it('the same reviewer re-saving their OWN round is allowed (editing)', () => {
		const existing = appendRaterJudgment([], rater(1, 'A', { note: 'first' }));
		const result = validateRaterIndependence(existing, rater(1, 'A', { note: 'second' }));
		expect(result.ok).toBe(true);
	});

	it('adjudicator == Rater 1 reviewer → rejected', () => {
		const existing = appendRaterJudgment(
			appendRaterJudgment([], rater(1, 'A')),
			rater(2, 'B'),
		);
		const result = validateRaterIndependence(existing, rater(0, 'A'));
		expect(result.ok).toBe(false);
	});

	it('adjudicator == Rater 2 reviewer → rejected', () => {
		const existing = appendRaterJudgment(
			appendRaterJudgment([], rater(1, 'A')),
			rater(2, 'B'),
		);
		const result = validateRaterIndependence(existing, rater(0, 'B'));
		expect(result.ok).toBe(false);
	});

	it('adjudicator == a third reviewer → accepted', () => {
		const existing = appendRaterJudgment(
			appendRaterJudgment([], rater(1, 'A')),
			rater(2, 'B'),
		);
		const result = validateRaterIndependence(existing, rater(0, 'C'));
		expect(result.ok).toBe(true);
	});
});

// ── C. Adjudication ────────────────────────────────────────────────────────

describe('Phase 10.4 C — adjudication integrity', () => {
	it('adjudicator is explicitly stored as round 0', () => {
		const after = appendRaterJudgment(
			appendRaterJudgment(
				appendRaterJudgment([], rater(1, 'A', { detectionJudgment: 'correct' })),
				rater(2, 'B', { detectionJudgment: 'incorrect' }),
			),
			rater(0, 'C', { detectionJudgment: 'incorrect' }),
		);
		const adj = adjudicationJudgment(after);
		expect(adj).not.toBeNull();
		expect(adj?.round).toBe(0);
		expect(adj?.reviewer).toBe('C');
	});

	it('adjudication does not overwrite Rater 1', () => {
		const after = appendRaterJudgment(
			appendRaterJudgment(
				appendRaterJudgment([], rater(1, 'A', { detectionJudgment: 'correct' })),
				rater(2, 'B'),
			),
			rater(0, 'C', { detectionJudgment: 'incorrect' }),
		);
		expect(rater1Judgment(after)?.detectionJudgment).toBe('correct');
		expect(rater1Judgment(after)?.reviewer).toBe('A');
	});

	it('adjudication does not overwrite Rater 2', () => {
		const after = appendRaterJudgment(
			appendRaterJudgment(
				appendRaterJudgment([], rater(1, 'A')),
				rater(2, 'B', { detectionJudgment: 'incorrect' }),
			),
			rater(0, 'C', { detectionJudgment: 'correct' }),
		);
		expect(rater2Judgment(after)?.detectionJudgment).toBe('incorrect');
		expect(rater2Judgment(after)?.reviewer).toBe('B');
	});

	it('raw independent judgments remain available after adjudication', () => {
		const after = appendRaterJudgment(
			appendRaterJudgment(
				appendRaterJudgment([], rater(1, 'A', { note: 'r1' })),
				rater(2, 'B', { note: 'r2' })),
			rater(0, 'C', { note: 'adj' }),
		);
		expect(after).toHaveLength(3);
		expect(rater1Judgment(after)?.note).toBe('r1');
		expect(rater2Judgment(after)?.note).toBe('r2');
		expect(adjudicationJudgment(after)?.note).toBe('adj');
	});

	it('the final research judgment is the adjudication, never an independent rater', () => {
		const withRaters = appendRaterJudgment(
			appendRaterJudgment([], rater(1, 'A')),
			rater(2, 'B'),
		);
		expect(finalResearchJudgment(withRaters)).toBeNull();
		const adjudicated = appendRaterJudgment(withRaters, rater(0, 'C'));
		expect(finalResearchJudgment(adjudicated)?.round).toBe(0);
	});
});

// ── D. Gold-standard eligibility ───────────────────────────────────────────

describe('Phase 10.4 D — gold-standard eligibility', () => {
	it('unreviewed → excluded from gold-standard', () => {
		const item = ai({ adjudicationStatus: 'unreviewed', detectionJudgment: 'correct' });
		expect(isGoldStandard(item)).toBe(false);
		expect(goldStandardJudgment(item)).toBeNull();
	});

	it('reviewed-only → excluded from gold-standard metrics', () => {
		const item = ai({ adjudicationStatus: 'reviewed', detectionJudgment: 'correct' });
		expect(isGoldStandard(item)).toBe(false);
		expect(goldStandardJudgment(item)).toBeNull();
	});

	it('adjudicated → included in gold-standard', () => {
		const item = ai({ adjudicationStatus: 'adjudicated', detectionJudgment: 'correct' });
		expect(isGoldStandard(item)).toBe(true);
		expect(goldStandardJudgment(item)).not.toBeNull();
	});

	it('conflicting raters without adjudication → excluded from gold-standard', () => {
		const item = ai({
			adjudicationStatus: 'reviewed',
			raterJudgments: [
				rater(1, 'A', { detectionJudgment: 'correct' }),
				rater(2, 'B', { detectionJudgment: 'incorrect' }),
			],
		});
		expect(isGoldStandard(item)).toBe(false);
		expect(goldStandardJudgment(item)).toBeNull();
	});

	it('missing adjudication → null/insufficient, never 0%', () => {
		// 20 reviewed records, 0 adjudicated.
		const items: AnalyticsItem[] = Array.from({ length: 20 }, (_, i) =>
			ai({
				detectionJudgment: i < 10 ? 'correct' : 'incorrect',
				adjudicationStatus: 'reviewed',
			}),
		);
		const stats = computeSliceStats(items);
		expect(stats.eligibility.goldStandard).toBe(0);
		expect(stats.detection.precision).toBeNull();
		expect(stats.detection.recall).toBeNull();
		expect(stats.alignmentAware.precision).toBeNull();
		expect(stats.alignmentAware.recall).toBeNull();
	});

	it('adjudicated records calculate normally', () => {
		const items: AnalyticsItem[] = [
			...Array.from({ length: 8 }, (_, i) =>
				ai({ id: `a${i}`, detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			),
			...Array.from({ length: 2 }, (_, i) =>
				ai({ id: `f${i}`, detectionJudgment: 'incorrect', adjudicationStatus: 'adjudicated' }),
			),
			...Array.from({ length: 2 }, (_, i) =>
				human({ id: `h${i}`, adjudicationStatus: 'adjudicated' }),
			),
		];
		const stats = computeSliceStats(items);
		expect(stats.detection.tp).toBe(8);
		expect(stats.detection.fp).toBe(2);
		expect(stats.detection.fn).toBe(2);
		expect(stats.detection.precision).toBe(80);
		expect(stats.detection.recall).toBe(80);
	});
});

// ── E. Metrics ─────────────────────────────────────────────────────────────

describe('Phase 10.4 E — metric eligibility', () => {
	it('computeSliceStats uses gold-standard eligibility (adjudicated only)', () => {
		const items: AnalyticsItem[] = [
			...Array.from({ length: 6 }, (_, i) =>
				ai({ id: `a${i}`, detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			),
			ai({ id: 'a-rev', detectionJudgment: 'correct', adjudicationStatus: 'reviewed' }),
			ai({ id: 'a-unr', detectionJudgment: 'correct', adjudicationStatus: 'unreviewed' }),
		];
		const stats = computeSliceStats(items);
		// Only the 6 adjudicated correct items count as TP.
		expect(stats.detection.tp).toBe(6);
		expect(stats.eligibility.goldStandard).toBe(6);
		expect(stats.eligibility.reviewedOnly).toBe(1);
	});

	it('computeAlignmentAwareDetection uses gold-standard eligibility', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			human({ id: 'R2', adjudicationStatus: 'reviewed' }), // excluded
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
		];
		const det = computeAlignmentAwareDetection(items);
		// Only R1 (adjudicated) is a reference error; R2 is excluded.
		expect(det.referenceErrors).toBe(1);
		expect(det.tp).toBe(1);
	});

	it('precision excludes non-gold-standard evidence', () => {
		const items: AnalyticsItem[] = [
			...Array.from({ length: 6 }, (_, i) =>
				ai({ id: `a${i}`, detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			),
			...Array.from({ length: 4 }, (_, i) =>
				ai({ id: `r${i}`, detectionJudgment: 'incorrect', adjudicationStatus: 'reviewed' }),
			),
		];
		const stats = computeSliceStats(items);
		// FP only counts adjudicated incorrect → 0, not 4.
		expect(stats.detection.fp).toBe(0);
		expect(stats.detection.precision).toBe(100);
	});

	it('recall excludes non-gold-standard evidence', () => {
		const items: AnalyticsItem[] = [
			...Array.from({ length: 6 }, (_, i) =>
				ai({ id: `a${i}`, detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			),
			human({ id: 'h1', adjudicationStatus: 'adjudicated' }),
			human({ id: 'h2', adjudicationStatus: 'reviewed' }), // excluded
		];
		const stats = computeSliceStats(items);
		// FN only counts adjudicated human → 1, not 2.
		expect(stats.detection.fn).toBe(1);
	});

	it('false positives are not inflated by multiple AI findings linked to one reference', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'incorrect', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A2', matchedReferenceId: 'R1', detectionJudgment: 'incorrect', adjudicationStatus: 'adjudicated' }),
		];
		const det = computeAlignmentAwareDetection(items);
		// Both A1 and A2 are incorrect → FP = 2 (per finding), but R1 is ONE
		// reference error (not double-counted).
		expect(det.referenceErrors).toBe(1);
		expect(det.fp).toBe(2);
		expect(det.fn).toBe(1);
	});

	it('false negatives correctly represent unmatched reference errors', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			human({ id: 'R2', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			// R2 has no AI finding → false negative.
		];
		const det = computeAlignmentAwareDetection(items);
		expect(det.referenceErrors).toBe(2);
		expect(det.tp).toBe(1);
		expect(det.fn).toBe(1);
	});
});

// ── F. Alignment isolation ────────────────────────────────────────────────

describe('Phase 10.4 F — alignment participant/assignment isolation', () => {
	it('same participant + same assignment → valid', () => {
		const items = [
			human({ id: 'h1', evaluationId: 'e1', assignmentId: 'a1', aiCategory: 'Morphology', aiSubcategory: 'case' }),
			ai({ id: 'a1', matchedReferenceId: 'h1', evaluationId: 'e1', assignmentId: 'a1', aiCategory: 'Morphology', aiSubcategory: 'case' }),
		];
		expect(alignErrors(items)[0].rationale).not.toBe('none');
	});

	it('different assignment → rejected', () => {
		const items = [
			human({ id: 'h1', evaluationId: 'e1', assignmentId: 'a1' }),
			ai({ id: 'a1', matchedReferenceId: 'h1', evaluationId: 'e1', assignmentId: 'a2' }),
		];
		expect(alignErrors(items)[0].rationale).toBe('none');
	});

	it('different evaluation (participant) → rejected', () => {
		const items = [
			human({ id: 'h1', evaluationId: 'e1', assignmentId: 'a1' }),
			ai({ id: 'a1', matchedReferenceId: 'h1', evaluationId: 'e2', assignmentId: 'a1' }),
		];
		expect(alignErrors(items)[0].rationale).toBe('none');
	});

	it('invalid reference ID → rejected', () => {
		const items = [ai({ id: 'a1', matchedReferenceId: 'does-not-exist' })];
		expect(alignErrors(items)[0].rationale).toBe('none');
	});

	it('sameScope rejects cross-assignment', () => {
		expect(
			sameScope(
				{ assignmentId: 'a1', evaluationId: 'e1' } as AnalyticsItem,
				{ assignmentId: 'a2', evaluationId: 'e1' } as AnalyticsItem,
			),
		).toBe(false);
	});

	it('sameScope accepts same scope', () => {
		expect(
			sameScope(
				{ assignmentId: 'a1', evaluationId: 'e1' } as AnalyticsItem,
				{ assignmentId: 'a1', evaluationId: 'e1' } as AnalyticsItem,
			),
		).toBe(true);
	});

	it('sameScope treats empty scope fields as unconstrained (legacy records)', () => {
		expect(
			sameScope(
				{ assignmentId: '', evaluationId: '' } as AnalyticsItem,
				{ assignmentId: '', evaluationId: '' } as AnalyticsItem,
			),
		).toBe(true);
	});
});

// ── G. Alignment many-to-one ───────────────────────────────────────────────

describe('Phase 10.4 G — alignment many-to-one', () => {
	it('A1 + A2 + A3 → R1 counts as one reference error', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A2', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A3', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
		];
		const det = computeAlignmentAwareDetection(items);
		expect(det.referenceErrors).toBe(1);
		expect(det.tp).toBe(1);
	});

	it('A4 unmatched → false-positive candidate (not a reference error)', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A4', matchedReferenceId: '', detectionJudgment: 'incorrect', adjudicationStatus: 'adjudicated' }),
		];
		const det = computeAlignmentAwareDetection(items);
		expect(det.referenceErrors).toBe(1);
		expect(det.fp).toBe(1);
		expect(det.unmatchedCorrect).toBe(0);
	});

	it('R2 without AI finding → false-negative candidate', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			human({ id: 'R2', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
		];
		const det = computeAlignmentAwareDetection(items);
		expect(det.referenceErrors).toBe(2);
		expect(det.tp).toBe(1);
		expect(det.fn).toBe(1);
	});
});

// ── H. Export ─────────────────────────────────────────────────────────────

describe('Phase 10.4 H — pseudonymous exports & snapshot', () => {
	it('no raw internal IDs in external research export', () => {
		const p = createPseudonymizer();
		const id = p.pseudonymize('feedbackItem', 'pbc_12345abcde');
		expect(id).not.toContain('pbc_12345abcde');
		expect(id).toMatch(/^F\d{3}$/);
	});

	it('pseudonymous IDs are stable', () => {
		const p = createPseudonymizer();
		const a = p.pseudonymize('participant', 'real-user-1');
		const b = p.pseudonymize('participant', 'real-user-1');
		expect(a).toBe(b);
	});

	it('namespaces remain distinct (no collision)', () => {
		const p = createPseudonymizer();
		const ids = [
			p.pseudonymize('participant', 'x'),
			p.pseudonymize('submission', 'x'),
			p.pseudonymize('feedbackItem', 'x'),
			p.pseudonymize('referenceError', 'x'),
			p.pseudonymize('reviewer', 'x'),
			p.pseudonymize('evaluation', 'x'),
			p.pseudonymize('assignment', 'x'),
		];
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('dataset snapshot ID is deterministic (SHA-256)', () => {
		const records = [
			{
				id: 'a1', origin: 'ai', detectionJudgment: 'correct', correctionJudgment: '',
				explanationJudgment: '', adjudicationStatus: 'adjudicated', matchedReferenceId: 'h1',
				raterJudgments: [], evaluation: 'e1',
			},
			{
				id: 'h1', origin: 'human', detectionJudgment: '', correctionJudgment: '',
				explanationJudgment: '', adjudicationStatus: 'adjudicated', matchedReferenceId: '',
				raterJudgments: [], evaluation: 'e1',
			},
		];
		const id1 = computeDatasetSnapshotId(records);
		const id2 = computeDatasetSnapshotId([...records].reverse());
		expect(id1).toBe(id2);
		expect(id1).toMatch(/^snap_[a-f0-9]{24}$/);
	});

	it('changing research data changes the snapshot ID', () => {
		const base = {
			id: 'a1', origin: 'ai', detectionJudgment: 'correct', correctionJudgment: '',
			explanationJudgment: '', adjudicationStatus: 'reviewed', matchedReferenceId: '',
			raterJudgments: [], evaluation: 'e1',
		};
		const id1 = computeDatasetSnapshotId([base]);
		const id2 = computeDatasetSnapshotId([{ ...base, adjudicationStatus: 'adjudicated' }]);
		expect(id1).not.toBe(id2);
	});
});

// ── I. Regression — independent-rater analysis preserved ───────────────────

describe('Phase 10.4 I — independent-rater analysis', () => {
	it('summarizeDatasetAgreement reports agreed/disagreed/unresolved/adjudicated', () => {
		const items: AnalyticsItem[] = [
			// Item 1: both raters agree.
			ai({
				id: 'i1',
				raterJudgments: [
					rater(1, 'A', { detectionJudgment: 'correct' }),
					rater(2, 'B', { detectionJudgment: 'correct' }),
				],
			}),
			// Item 2: both raters disagree.
			ai({
				id: 'i2',
				raterJudgments: [
					rater(1, 'A', { detectionJudgment: 'correct' }),
					rater(2, 'B', { detectionJudgment: 'incorrect' }),
				],
			}),
			// Item 3: only one rater (unresolved).
			ai({
				id: 'i3',
				raterJudgments: [rater(1, 'A', { detectionJudgment: 'correct' })],
			}),
			// Item 4: adjudicated.
			ai({
				id: 'i4',
				raterJudgments: [
					rater(1, 'A', { detectionJudgment: 'correct' }),
					rater(2, 'B', { detectionJudgment: 'correct' }),
					rater(0, 'C', { detectionJudgment: 'correct' }),
				],
			}),
		];
		const summary = summarizeDatasetAgreement(items);
		expect(summary.itemsWithRaters).toBe(4);
		expect(summary.bothRaters).toBe(3);
		expect(summary.agreed).toBe(2);
		expect(summary.disagreed).toBe(1);
		expect(summary.unresolved).toBe(1);
		expect(summary.adjudicated).toBe(1);
	});

	it('raw judgments remain available for later statistical analysis', () => {
		const judgments = [
			rater(1, 'A', { detectionJudgment: 'correct', correctionJudgment: 'correct' }),
			rater(2, 'B', { detectionJudgment: 'incorrect', correctionJudgment: 'partially_correct' }),
		];
		// The raw array is preserved verbatim — no coefficient is invented.
		expect(parseRaterJudgments(JSON.stringify(judgments))).toHaveLength(2);
		expect(rater1Judgment(judgments)?.detectionJudgment).toBe('correct');
		expect(rater2Judgment(judgments)?.detectionJudgment).toBe('incorrect');
	});
});
