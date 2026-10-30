/**
 * Phase 10.3 — research annotation & metric validation hardening tests.
 *
 * Covers the A–H cases from the Phase 10.3 specification:
 *  A. Multi-rater independence (Rater 1 / Rater 2 / adjudication coexist).
 *  B. Gold-standard handling (unreviewed excluded, conflicts not merged,
 *     adjudication preferred, missing → null not 0%).
 *  C. Alignment (many-to-one, separate references, unmatched, invalid
 *     rejected, cross-participant/assignment/submission isolation).
 *  D. Metrics (many-to-one does not inflate reference-error counts, FP/FN
 *     consistent, insufficient → null never 0%).
 *  E. Provenance (two evaluations of one submission stay separate, provenance
 *     never falls back to assignment+submission when an evaluation exists).
 *  F. Export (dataset/schema version, timestamp, pseudonymous IDs present,
 *     raw internal IDs absent, stable within snapshot, no collision).
 *  G. Privacy / isolation (no cross-student annotation/alignment/profile,
 *     no research fields in learner-facing responses).
 *  H. Regression — the existing Phase 10.1/10.2 invariants still hold.
 *
 * Pure functions only — no PocketBase mocking.
 */
import { describe, expect, it } from 'vitest';
import {
	appendRaterJudgment,
	parseRaterJudgments,
	rater1Judgment,
	rater2Judgment,
	adjudicationJudgment,
	finalResearchJudgment,
	summarizeRaterAgreement,
	type RaterJudgment,
} from '@/lib/research-rater';
import {
	computeSliceStats,
	computeAlignmentAwareDetection,
	alignErrors,
	goldStandardJudgment,
	isGoldStandard,
	countDistinctReferenceErrors,
	attachProvenanceToItems,
	type AnalyticsItem,
} from '@/lib/research-analytics';
import {
	createPseudonymizer,
	computeDatasetSnapshotId,
} from '@/lib/research-export.server';
import {
	isValidatedForPersonalization,
	classifyFeedbackItem,
} from '@/lib/ai-evaluation';
import { buildLearnerProfile, type LearnerObservation } from '@/lib/learner-profile';
import { buildPersonalizationContext } from '@/lib/personalization.server';

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

function rater(round: 1 | 2 | 0, reviewer: string, over: Partial<RaterJudgment> = {}): RaterJudgment {
	return {
		round,
		reviewer,
		reviewedAt: `2026-01-0${round === 0 ? 3 : round}T00:00:00Z`,
		detectionJudgment: 'correct',
		...over,
	};
}

// ── A. Multi-rater independence ────────────────────────────────────────────

describe('Phase 10.3 A — multi-rater independence', () => {
	it('Rater 1 and Rater 2 coexist without overwriting', () => {
		const after1 = appendRaterJudgment([], rater(1, 'rev1'));
		const after2 = appendRaterJudgment(after1, rater(2, 'rev2', { detectionJudgment: 'incorrect' }));
		expect(after2).toHaveLength(2);
		expect(rater1Judgment(after2)?.reviewer).toBe('rev1');
		expect(rater2Judgment(after2)?.reviewer).toBe('rev2');
		// Rater 1's judgment is untouched by Rater 2.
		expect(rater1Judgment(after2)?.detectionJudgment).toBe('correct');
		expect(rater2Judgment(after2)?.detectionJudgment).toBe('incorrect');
	});

	it('Rater 2 does not overwrite Rater 1 even with the same field values', () => {
		const after1 = appendRaterJudgment([], rater(1, 'rev1', { note: 'r1 note' }));
		const after2 = appendRaterJudgment(after1, rater(2, 'rev2', { note: 'r2 note' }));
		expect(rater1Judgment(after2)?.note).toBe('r1 note');
		expect(rater2Judgment(after2)?.note).toBe('r2 note');
	});

	it('adjudication does not delete independent judgments', () => {
		const after1 = appendRaterJudgment([], rater(1, 'rev1'));
		const after2 = appendRaterJudgment(after1, rater(2, 'rev2'));
		const adjudicated = appendRaterJudgment(after2, rater(0, 'rev3', { detectionJudgment: 'correct' }));
		expect(adjudicated).toHaveLength(3);
		expect(adjudicationJudgment(adjudicated)?.reviewer).toBe('rev3');
		expect(rater1Judgment(adjudicated)?.reviewer).toBe('rev1');
		expect(rater2Judgment(adjudicated)?.reviewer).toBe('rev2');
	});

	it('a single reviewer is not silently treated as two raters', () => {
		// The same reviewer re-saving round 1 replaces only their own entry.
		const after1 = appendRaterJudgment([], rater(1, 'rev1', { note: 'first' }));
		const after1b = appendRaterJudgment(after1, rater(1, 'rev1', { note: 'second' }));
		expect(after1b).toHaveLength(1);
		expect(rater1Judgment(after1b)?.note).toBe('second');
		// Rater 2 is never fabricated from the existing reviewer.
		expect(rater2Judgment(after1b)).toBeNull();
	});

	it('the final research judgment is the adjudication, never an independent one', () => {
		const withRaters = appendRaterJudgment(
			appendRaterJudgment([], rater(1, 'rev1')),
			rater(2, 'rev2'),
		);
		expect(finalResearchJudgment(withRaters)).toBeNull();
		const adjudicated = appendRaterJudgment(withRaters, rater(0, 'rev3'));
		expect(finalResearchJudgment(adjudicated)?.round).toBe(0);
	});

	it('parses a stored raterJudgments JSON string tolerantly', () => {
		const parsed = parseRaterJudgments(
			JSON.stringify([rater(1, 'rev1'), rater(2, 'rev2')]),
		);
		expect(parsed).toHaveLength(2);
		expect(parseRaterJudgments('not json')).toEqual([]);
		expect(parseRaterJudgments(null)).toEqual([]);
	});
});

// ── B. Gold-standard handling ─────────────────────────────────────────────

describe('Phase 10.3 B — gold-standard handling', () => {
	it('unreviewed evidence is excluded from gold-standard', () => {
		const item = ai({ adjudicationStatus: 'unreviewed', detectionJudgment: 'correct' });
		expect(isGoldStandard(item)).toBe(false);
		expect(goldStandardJudgment(item)).toBeNull();
	});

	it('a reviewed-but-not-adjudicated item is not gold-standard', () => {
		const item = ai({ adjudicationStatus: 'reviewed', detectionJudgment: 'correct' });
		expect(isGoldStandard(item)).toBe(false);
		expect(goldStandardJudgment(item)).toBeNull();
	});

	it('an adjudicated item is gold-standard and prefers the adjudication judgment', () => {
		const item = ai({
			adjudicationStatus: 'adjudicated',
			detectionJudgment: 'incorrect',
			raterJudgments: [
				rater(1, 'rev1', { detectionJudgment: 'correct' }),
				rater(2, 'rev2', { detectionJudgment: 'incorrect' }),
				rater(0, 'rev3', { detectionJudgment: 'incorrect' }),
			],
		});
		expect(isGoldStandard(item)).toBe(true);
		// The adjudication (round 0) wins over the flat field and the raters.
		expect(goldStandardJudgment(item)?.detectionJudgment).toBe('incorrect');
		expect(goldStandardJudgment(item)?.round).toBe(0);
	});

	it('conflicting Rater 1 / Rater 2 are never silently merged', () => {
		const item = ai({
			adjudicationStatus: 'reviewed',
			raterJudgments: [
				rater(1, 'rev1', { detectionJudgment: 'correct' }),
				rater(2, 'rev2', { detectionJudgment: 'incorrect' }),
			],
		});
		// No adjudication → no gold-standard, no silent merge.
		expect(goldStandardJudgment(item)).toBeNull();
		const agreement = summarizeRaterAgreement(item.raterJudgments);
		expect(agreement.bothRatersPresent).toBe(true);
		expect(agreement.fields.detectionJudgment).toBe('disagreed');
		expect(agreement.adjudicated).toBe(false);
	});

	it('missing adjudication does not become 0% — metrics stay null', () => {
		const items: AnalyticsItem[] = [
			ai({
				adjudicationStatus: 'reviewed',
				detectionJudgment: 'correct',
				raterJudgments: [rater(1, 'rev1', { detectionJudgment: 'correct' })],
			}),
			ai({
				adjudicationStatus: 'reviewed',
				detectionJudgment: 'incorrect',
				raterJudgments: [rater(1, 'rev1', { detectionJudgment: 'incorrect' })],
			}),
		];
		const stats = computeSliceStats(items);
		// Below MIN_ANNOTATED → precision/recall null, never 0%.
		expect(stats.detection.precision).toBeNull();
		expect(stats.detection.recall).toBeNull();
		expect(stats.alignmentAware.precision).toBeNull();
		expect(stats.alignmentAware.recall).toBeNull();
	});
});

// ── C. Alignment ───────────────────────────────────────────────────────────

describe('Phase 10.3 C — AI↔human error alignment', () => {
	it('multiple AI findings map to one reference error (many-to-one)', () => {
		const items = [
			human({ id: 'h1', aiCategory: 'Morphology', aiSubcategory: 'case' }),
			ai({ id: 'a1', matchedReferenceId: 'h1', aiCategory: 'Morphology', aiSubcategory: 'case' }),
			ai({ id: 'a2', matchedReferenceId: 'h1', aiCategory: 'Morphology', aiSubcategory: 'case' }),
			ai({ id: 'a3', matchedReferenceId: 'h1', aiCategory: 'Morphology', aiSubcategory: 'case' }),
		];
		expect(countDistinctReferenceErrors(items)).toBe(1);
		const links = alignErrors(items);
		expect(links.filter((l) => l.rationale === 'exact')).toHaveLength(3);
	});

	it('multiple references are separate errors', () => {
		const items = [
			human({ id: 'h1' }),
			human({ id: 'h2' }),
			ai({ id: 'a1', matchedReferenceId: 'h1' }),
			ai({ id: 'a2', matchedReferenceId: 'h2' }),
		];
		expect(countDistinctReferenceErrors(items)).toBe(2);
	});

	it('an unmatched AI finding has rationale none', () => {
		const items = [human({ id: 'h1' }), ai({ id: 'a1', matchedReferenceId: '' })];
		const links = alignErrors(items);
		expect(links.find((l) => l.aiItemId === 'a1')?.rationale).toBe('none');
	});

	it('an unmatched human reference error remains a false-negative candidate', () => {
		const items = [human({ id: 'h1' }), ai({ id: 'a1', matchedReferenceId: '' })];
		expect(countDistinctReferenceErrors(items)).toBe(1);
	});

	it('an invalid/nonexistent matchedReferenceId is rejected (rationale none)', () => {
		const items = [ai({ id: 'a1', matchedReferenceId: 'does-not-exist' })];
		const links = alignErrors(items);
		expect(links[0].rationale).toBe('none');
	});

	it('same category different subcategory → same_category, not exact', () => {
		const items = [
			human({ id: 'h1', aiCategory: 'Morphology', aiSubcategory: 'case' }),
			ai({ id: 'a1', matchedReferenceId: 'h1', aiCategory: 'Morphology', aiSubcategory: 'gender' }),
		];
		expect(alignErrors(items)[0].rationale).toBe('same_category');
	});

	it('different category → same_error_different_label, never auto-equivalent', () => {
		const items = [
			human({ id: 'h1', aiCategory: 'Morphology', aiSubcategory: 'case' }),
			ai({ id: 'a1', matchedReferenceId: 'h1', aiCategory: 'Syntax', aiSubcategory: 'word_order' }),
		];
		expect(alignErrors(items)[0].rationale).toBe('same_error_different_label');
	});

	it('alignment cannot cross participants (matchedReferenceId is scoped to the same item set)', () => {
		// h1 belongs to participant P1; an AI finding from P2 referencing h1 is
		// still a valid link ONLY within the same evaluation set. The alignment
		// helper operates on the supplied item set — a cross-participant link
		// would require h1 to be present, which the analytics server scopes per
		// assignment/evaluation. Here we assert the helper never invents a link
		// to an id outside the set.
		const items = [ai({ id: 'a1', matchedReferenceId: 'h1' })]; // h1 not in set
		expect(alignErrors(items)[0].rationale).toBe('none');
	});
});

// ── D. Metrics (alignment-aware) ──────────────────────────────────────────

describe('Phase 10.3 D — alignment-aware metrics', () => {
	it('many-to-one alignment does not inflate reference-error counts', () => {
		// Reference errors: R1, R2, R3. AI findings: A1→R1, A2→R1, A3→R2, A4 unmatched.
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			human({ id: 'R2', adjudicationStatus: 'adjudicated' }),
			human({ id: 'R3', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A2', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A3', matchedReferenceId: 'R2', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A4', matchedReferenceId: '', detectionJudgment: 'incorrect', adjudicationStatus: 'adjudicated' }),
		];
		const det = computeAlignmentAwareDetection(items);
		// 3 reference errors, NOT 4 (A1+A2 → R1 is one).
		expect(det.referenceErrors).toBe(3);
		// TP = R1 + R2 detected = 2 (A1+A2 count once for R1).
		expect(det.tp).toBe(2);
		// FN = R3 not detected = 1.
		expect(det.fn).toBe(1);
		// FP = A4 (incorrect, false alarm) = 1.
		expect(det.fp).toBe(1);
		// A4 is unmatched AND incorrect → counts as FP, not unmatchedCorrect.
		expect(det.unmatchedCorrect).toBe(0);
	});

	it('false positives and false negatives are consistent', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A1', matchedReferenceId: '', detectionJudgment: 'incorrect', adjudicationStatus: 'adjudicated' }),
		];
		const det = computeAlignmentAwareDetection(items);
		expect(det.tp).toBe(0);
		expect(det.fp).toBe(1);
		expect(det.fn).toBe(1);
	});

	it('insufficient evidence produces null, never fabricated 0%', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'adjudicated' }),
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'adjudicated' }),
		];
		const det = computeAlignmentAwareDetection(items);
		// total = tp(1) + fp(0) + fn(0) = 1 < MIN_ANNOTATED → null.
		expect(det.precision).toBeNull();
		expect(det.recall).toBeNull();
		expect(det.sufficient).toBe(false);
	});

	it('unreviewed items are excluded from alignment-aware metrics', () => {
		const items: AnalyticsItem[] = [
			human({ id: 'R1', adjudicationStatus: 'unreviewed' }),
			ai({ id: 'A1', matchedReferenceId: 'R1', detectionJudgment: 'correct', adjudicationStatus: 'unreviewed' }),
		];
		const det = computeAlignmentAwareDetection(items);
		expect(det.referenceErrors).toBe(0);
		expect(det.tp).toBe(0);
	});
});

// ── E. Provenance ─────────────────────────────────────────────────────────

describe('Phase 10.3 E — evaluation provenance', () => {
	it('two AI evaluations of the same submission remain separate', () => {
		const items: AnalyticsItem[] = [
			ai({ evaluationId: 'e1', submissionId: 's1' }),
			ai({ evaluationId: 'e2', submissionId: 's1' }),
		];
		const evaluations = new Map([
			['e1', { model: 'gpt-4', promptVersion: 'v1' }],
			['e2', { model: 'gpt-4o', promptVersion: 'v2' }],
		]);
		attachProvenanceToItems(items, evaluations);
		expect(items[0].model).toBe('gpt-4');
		expect(items[0].promptVersion).toBe('v1');
		expect(items[1].model).toBe('gpt-4o');
		expect(items[1].promptVersion).toBe('v2');
	});

	it('provenance never falls back to assignment+submission when an evaluation relation exists', () => {
		// Even though both items share submissionId 's1', each keeps its own
		// evaluation's provenance — they are NOT collapsed.
		const items: AnalyticsItem[] = [
			ai({ evaluationId: 'e1', submissionId: 's1', assignmentId: 'a1' }),
			ai({ evaluationId: 'e2', submissionId: 's1', assignmentId: 'a1' }),
		];
		const evaluations = new Map([
			['e1', { model: 'm1', promptVersion: 'p1' }],
			['e2', { model: 'm2', promptVersion: 'p2' }],
		]);
		attachProvenanceToItems(items, evaluations);
		expect(items[0].model).not.toBe(items[1].model);
	});

	it('an item without an evaluationId gets no provenance (no fallback guess)', () => {
		const items: AnalyticsItem[] = [ai({ evaluationId: '', submissionId: 's1' })];
		attachProvenanceToItems(items, new Map([['e1', { model: 'm1', promptVersion: 'p1' }]]));
		expect(items[0].model).toBe('');
		expect(items[0].promptVersion).toBe('');
	});
});

// ── F. Export hardening ────────────────────────────────────────────────────

describe('Phase 10.3 F — export pseudonymization & snapshot', () => {
	it('pseudonymous IDs are stable within a snapshot', () => {
		const p = createPseudonymizer();
		const a = p.pseudonymize('participant', 'real-user-1');
		const b = p.pseudonymize('participant', 'real-user-1');
		expect(a).toBe(b);
		expect(a).toMatch(/^P\d{3}$/);
	});

	it('raw internal IDs are not exposed in pseudonymous IDs', () => {
		const p = createPseudonymizer();
		const id = p.pseudonymize('feedbackItem', 'pbc_12345abcde');
		expect(id).not.toContain('pbc_12345abcde');
		expect(id).toMatch(/^F\d{3}$/);
	});

	it('different entities cannot collide (type-separated prefixes)', () => {
		const p = createPseudonymizer();
		const participant = p.pseudonymize('participant', 'x');
		const feedback = p.pseudonymize('feedbackItem', 'x');
		const reviewer = p.pseudonymize('reviewer', 'x');
		const reference = p.pseudonymize('referenceError', 'x');
		const submission = p.pseudonymize('submission', 'x');
		const evaluation = p.pseudonymize('evaluation', 'x');
		const assignment = p.pseudonymize('assignment', 'x');
		const ids = [participant, feedback, reviewer, reference, submission, evaluation, assignment];
		expect(new Set(ids).size).toBe(ids.length);
		expect(participant).toBe('P001');
		expect(feedback).toBe('F001');
		expect(reviewer).toBe('RV001');
		expect(reference).toBe('R001');
		expect(submission).toBe('S001');
		expect(evaluation).toBe('EV001');
		expect(assignment).toBe('A001');
	});

	it('empty raw ids map to empty pseudonymous ids', () => {
		const p = createPseudonymizer();
		expect(p.pseudonymize('participant', '')).toBe('');
		expect(p.pseudonymize('participant', '   ')).toBe('');
	});

	it('dataset snapshot id is deterministic for the same records', () => {
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
		expect(id1).toMatch(/^snap_[a-z0-9]+$/);
	});

	it('dataset snapshot id changes when annotation state changes', () => {
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

// ── G. Privacy / isolation ─────────────────────────────────────────────────

describe('Phase 10.3 G — privacy & isolation', () => {
	it('no cross-student learner-profile evidence (validated observations are per-learner)', () => {
		// buildLearnerProfile only aggregates the observations passed to it —
		// it never reaches into another learner's data. Two separate profiles
		// stay separate.
		const obsA: LearnerObservation[] = [
			{ category: 'Morphology', subcategory: 'case', severity: 'major', assignmentId: 'a1', createdAt: '2026-01-01' },
			{ category: 'Morphology', subcategory: 'case', severity: 'major', assignmentId: 'a1', createdAt: '2026-01-02' },
			{ category: 'Morphology', subcategory: 'case', severity: 'major', assignmentId: 'a1', createdAt: '2026-01-03' },
		];
		const profileA = buildLearnerProfile(obsA, 3);
		const profileB = buildLearnerProfile([], 3);
		expect(profileA.totalObservations).toBe(3);
		expect(profileB.totalObservations).toBe(0);
		expect(profileB.patterns).toHaveLength(0);
	});

	it('no research fields leak into learner-facing personalization context', () => {
		const profile = buildLearnerProfile(
			[
				{ category: 'Morphology', subcategory: 'case', severity: 'major', assignmentId: 'a1', createdAt: '2026-01-01' },
				{ category: 'Morphology', subcategory: 'case', severity: 'major', assignmentId: 'a1', createdAt: '2026-01-02' },
				{ category: 'Morphology', subcategory: 'case', severity: 'major', assignmentId: 'a1', createdAt: '2026-01-03' },
			],
			3,
		);
		const context = buildPersonalizationContext({ profile, currentCategory: 'Morphology' });
		// No raw internal ids, emails, NIMs, or rater/adjudication metadata.
		expect(context).not.toMatch(/raterJudg|adjudicat|@|nim/i);
		expect(context).toMatch(/jangan sebutkan angka|jangan menyebutkan jumlah/i);
	});

	it('unreviewed evidence never enters personalization (cross-student isolation)', () => {
		expect(
			isValidatedForPersonalization({ origin: 'human', detectionJudgment: '', adjudicationStatus: 'unreviewed' }),
		).toBe(false);
		expect(
			isValidatedForPersonalization({ origin: 'ai', detectionJudgment: 'correct', adjudicationStatus: 'unreviewed' }),
		).toBe(false);
	});

	it('a rejected AI finding is never classified as a reference error', () => {
		expect(
			classifyFeedbackItem({ origin: 'ai', detectionJudgment: 'incorrect', adjudicationStatus: 'adjudicated' }),
		).toBe('rejected_ai_finding');
	});
});

// ── H. Regression — Phase 10.1/10.2 invariants still hold ──────────────────

describe('Phase 10.3 H — regression of Phase 10.1/10.2 invariants', () => {
	it('legacy detection metrics still compute from explicit judgments', () => {
		const items: AnalyticsItem[] = [
			...Array.from({ length: 8 }, () => ai({ detectionJudgment: 'correct' })),
			...Array.from({ length: 2 }, () => ai({ detectionJudgment: 'incorrect' })),
			...Array.from({ length: 2 }, () => human()),
		];
		const stats = computeSliceStats(items);
		expect(stats.detection.tp).toBe(8);
		expect(stats.detection.fp).toBe(2);
		expect(stats.detection.fn).toBe(2);
		expect(stats.detection.precision).toBe(80);
	});

	it('countDistinctReferenceErrors still de-duplicates many-to-one', () => {
		const items = [
			{ origin: 'human', matchedReferenceId: '', id: 'h1' },
			{ origin: 'ai', matchedReferenceId: 'h1', id: 'a1' },
			{ origin: 'ai', matchedReferenceId: 'h1', id: 'a2' },
		];
		expect(countDistinctReferenceErrors(items)).toBe(1);
	});

	it('reviewer agreement preserves raw independent judgments for later analysis', () => {
		const judgments = [
			rater(1, 'rev1', { detectionJudgment: 'correct', correctionJudgment: 'correct' }),
			rater(2, 'rev2', { detectionJudgment: 'incorrect', correctionJudgment: 'partially_correct' }),
		];
		const summary = summarizeRaterAgreement(judgments);
		expect(summary.bothRatersPresent).toBe(true);
		expect(summary.adjudicated).toBe(false);
		expect(summary.fields.detectionJudgment).toBe('disagreed');
		expect(summary.fields.correctionJudgment).toBe('disagreed');
		expect(summary.overall).toBe('disagreed');
		// Raw judgments are still available.
		expect(rater1Judgment(judgments)?.detectionJudgment).toBe('correct');
		expect(rater2Judgment(judgments)?.detectionJudgment).toBe('incorrect');
	});

	it('agreement reports agreed when both raters match on compared fields', () => {
		const judgments = [
			rater(1, 'rev1', { detectionJudgment: 'correct', correctionJudgment: 'correct' }),
			rater(2, 'rev2', { detectionJudgment: 'correct', correctionJudgment: 'correct' }),
		];
		const summary = summarizeRaterAgreement(judgments);
		expect(summary.overall).toBe('agreed');
	});

	it('agreement reports incomplete when only one rater is present', () => {
		const judgments = [rater(1, 'rev1', { detectionJudgment: 'correct' })];
		const summary = summarizeRaterAgreement(judgments);
		expect(summary.bothRatersPresent).toBe(false);
		expect(summary.overall).toBe('incomplete');
	});
});
