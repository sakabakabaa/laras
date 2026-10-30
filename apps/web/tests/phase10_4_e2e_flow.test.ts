/**
 * Phase 10.4 — END-TO-END research flow (application-level).
 *
 * One continuous pipeline exercising the real pure functions the server and
 * UI call, in the exact order of the Study 1 pilot data-collection path:
 *
 *   AI evaluation → AI feedback item
 *     → Rater 1 annotation
 *     → Rater 2 annotation
 *     → adjudication
 *     → validated AI↔human alignment
 *     → gold-standard metric calculation
 *     → pseudonymous research export
 *
 * This is an APPLICATION-LEVEL test: it calls the same pure helpers the
 * /api/evaluation-annotation route, the analytics server, and the export
 * server call. It does NOT exercise the HTTP layer / live PocketBase (those
 * require a running authenticated server with seeded data, which this
 * sandbox does not provide for an automated run); the server-side
 * independence enforcement is exercised through the exact
 * `validateRaterIndependence` helper the route calls before any write.
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

const REVIEWER_A = 'user_a_internal_id';
const REVIEWER_B = 'user_b_internal_id';
const REVIEWER_C = 'user_c_internal_id';
const NOW = '2026-10-04T05:00:00.000Z';

function baseItem(over: Partial<AnalyticsItem>): AnalyticsItem {
	return {
		id: 'x',
		origin: 'ai',
		adjudicationStatus: 'unreviewed',
		evaluationId: 'ev1',
		matchedReferenceId: '',
		raterJudgments: [],
		errorPresent: '',
		detectionJudgment: '',
		correctionJudgment: '',
		explanationJudgment: '',
		completenessJudgment: '',
		necessityJudgment: '',
		pedagogicalJudgment: '',
		aiCategory: 'Morphology',
		aiSubcategory: 'case',
		referenceCategory: '',
		referenceSubcategory: '',
		assignmentId: 'asg1',
		assignmentTitle: 'Tugas 1',
		cefrLevel: 'B1',
		model: 'gpt-test',
		promptVersion: 'v1',
		submissionId: 'sub1',
		...over,
	};
}

describe('E2E research flow — Phase 10.4', () => {
	it('runs the full pilot pipeline and preserves every checkpoint', () => {
		// ── 1. AI evaluation produces an AI feedback item (unreviewed) ───────
		let aiItem = baseItem({ id: 'ai1', origin: 'ai' });
		expect(aiItem.adjudicationStatus).toBe('unreviewed');
		expect(isGoldStandard(aiItem)).toBe(false);
		expect(goldStandardJudgment(aiItem)).toBeNull();

		// ── 2. Rater 1 annotates (explicit round 1) ─────────────────────────
		const r1: RaterJudgment = {
			round: 1,
			reviewer: REVIEWER_A,
			reviewedAt: NOW,
			detectionJudgment: 'correct',
			correctionJudgment: 'correct',
			explanationJudgment: 'correct',
			completenessJudgment: 'complete',
			necessityJudgment: 'necessary',
			pedagogicalJudgment: 'appropriate',
			referenceCategory: 'Morphology',
			referenceSubcategory: 'case',
			referenceSeverity: 'major',
		};
		// Server enforces independence before write:
		expect(validateRaterIndependence(aiItem.raterJudgments, r1).ok).toBe(true);
		aiItem = {
			...aiItem,
			raterJudgments: appendRaterJudgment(aiItem.raterJudgments, r1),
			adjudicationStatus: 'reviewed',
			detectionJudgment: 'correct',
			correctionJudgment: 'correct',
			explanationJudgment: 'correct',
			completenessJudgment: 'complete',
			necessityJudgment: 'necessary',
			pedagogicalJudgment: 'appropriate',
			referenceCategory: 'Morphology',
			referenceSubcategory: 'case',
			referenceSeverity: 'major',
		};
		expect(rater1Judgment(aiItem.raterJudgments)?.reviewer).toBe(REVIEWER_A);
		expect(rater2Judgment(aiItem.raterJudgments)).toBeNull();
		// Reviewed-only is NOT gold-standard yet.
		expect(isGoldStandard(aiItem)).toBe(false);

		// ── 3. Rater 2 annotates (explicit round 2, DIFFERENT reviewer) ─────
		const r2: RaterJudgment = {
			round: 2,
			reviewer: REVIEWER_B,
			reviewedAt: NOW,
			detectionJudgment: 'correct',
			correctionJudgment: 'partially_correct',
			explanationJudgment: 'correct',
			completenessJudgment: 'complete',
			necessityJudgment: 'necessary',
			pedagogicalJudgment: 'appropriate',
			referenceCategory: 'Morphology',
			referenceSubcategory: 'case',
			referenceSeverity: 'major',
		};
		expect(validateRaterIndependence(aiItem.raterJudgments, r2).ok).toBe(true);
		aiItem = {
			...aiItem,
			raterJudgments: appendRaterJudgment(aiItem.raterJudgments, r2),
		};
		expect(rater1Judgment(aiItem.raterJudgments)?.reviewer).toBe(REVIEWER_A);
		expect(rater2Judgment(aiItem.raterJudgments)?.reviewer).toBe(REVIEWER_B);

		// ── 3b. Independence violation: Rater 2 same as Rater 1 → REJECTED ──
		const r2Dup: RaterJudgment = { ...r2, reviewer: REVIEWER_A };
		const dupResult = validateRaterIndependence(aiItem.raterJudgments, r2Dup);
		expect(dupResult.ok).toBe(false);
		// Rejected submission must NOT modify existing judgments.
		const beforeReject = aiItem.raterJudgments;
		// (server returns error and skips appendRaterJudgment — simulate)
		const afterReject = dupResult.ok
			? appendRaterJudgment(aiItem.raterJudgments, r2Dup)
			: aiItem.raterJudgments;
		expect(afterReject).toEqual(beforeReject);
		expect(rater1Judgment(afterReject)?.reviewer).toBe(REVIEWER_A);
		expect(rater2Judgment(afterReject)?.reviewer).toBe(REVIEWER_B);

		// ── 4. Adjudication (round 0, THIRD reviewer) ──────────────────────
		const adj: RaterJudgment = {
			round: 0,
			reviewer: REVIEWER_C,
			reviewedAt: NOW,
			detectionJudgment: 'correct',
			correctionJudgment: 'correct',
			explanationJudgment: 'correct',
			completenessJudgment: 'complete',
			necessityJudgment: 'necessary',
			pedagogicalJudgment: 'appropriate',
			referenceCategory: 'Morphology',
			referenceSubcategory: 'case',
			referenceSeverity: 'major',
		};
		// Adjudicator must differ from Rater 1 and Rater 2.
		expect(validateRaterIndependence(aiItem.raterJudgments, adj).ok).toBe(true);
		// Adjudicator == Rater 1 → rejected.
		expect(
			validateRaterIndependence(aiItem.raterJudgments, { ...adj, reviewer: REVIEWER_A }).ok,
		).toBe(false);
		aiItem = {
			...aiItem,
			raterJudgments: appendRaterJudgment(aiItem.raterJudgments, adj),
			adjudicationStatus: 'adjudicated',
		};
		// 4.1 Rater 1 remains intact.
		expect(rater1Judgment(aiItem.raterJudgments)?.reviewer).toBe(REVIEWER_A);
		// 4.2 Rater 2 remains intact.
		expect(rater2Judgment(aiItem.raterJudgments)?.reviewer).toBe(REVIEWER_B);
		// 4.3 Adjudication remains intact.
		expect(adjudicationJudgment(aiItem.raterJudgments)?.reviewer).toBe(REVIEWER_C);
		// 4.4 Gold-standard analytics use the adjudication.
		expect(isGoldStandard(aiItem)).toBe(true);
		const gold = goldStandardJudgment(aiItem);
		expect(gold?.round).toBe(0);
		expect(gold?.detectionJudgment).toBe('correct');

		// ── 5. Validated AI↔human alignment ────────────────────────────────
		// Human reference error R1 (missed by AI) + AI finding A1 linked to R1,
		// all in the SAME scope (assignment + evaluation).
		const humanR1 = baseItem({
			id: 'ref1',
			origin: 'human',
			adjudicationStatus: 'adjudicated',
			assignmentId: 'asg1',
			evaluationId: 'ev1',
			submissionId: 'sub1',
			aiCategory: 'Morphology',
			aiSubcategory: 'case',
			referenceCategory: 'Morphology',
			referenceSubcategory: 'case',
			raterJudgments: [
				{ round: 0, reviewer: REVIEWER_C, reviewedAt: NOW, detectionJudgment: 'missed' },
			],
		});
		const aiA1 = baseItem({
			id: 'ai_a1',
			origin: 'ai',
			adjudicationStatus: 'adjudicated',
			assignmentId: 'asg1',
			evaluationId: 'ev1',
			submissionId: 'sub1',
			matchedReferenceId: 'ref1',
			aiCategory: 'Morphology',
			aiSubcategory: 'case',
			raterJudgments: [
				{ round: 0, reviewer: REVIEWER_C, reviewedAt: NOW, detectionJudgment: 'correct' },
			],
		});
		// Same scope → valid alignment.
		expect(sameScope(aiA1, humanR1)).toBe(true);
		const links = alignErrors([humanR1, aiA1]);
		const link = links.find((l) => l.aiItemId === 'ai_a1');
		expect(link?.rationale).toBe('exact');

		// 5b. Cross-participant / cross-assignment isolation → rejected.
		const aiCrossAssignment = { ...aiA1, id: 'ai_x', assignmentId: 'asg2' };
		expect(sameScope(aiCrossAssignment, humanR1)).toBe(false);
		const crossLinks = alignErrors([humanR1, aiCrossAssignment]);
		expect(crossLinks.find((l) => l.aiItemId === 'ai_x')?.rationale).toBe('none');
		const aiCrossEval = { ...aiA1, id: 'ai_y', evaluationId: 'ev2' };
		expect(sameScope(aiCrossEval, humanR1)).toBe(false);
		// Invalid reference id → unmatched.
		const aiBadRef = { ...aiA1, id: 'ai_z', matchedReferenceId: 'does_not_exist' };
		const badLinks = alignErrors([humanR1, aiBadRef]);
		expect(badLinks.find((l) => l.aiItemId === 'ai_z')?.rationale).toBe('none');

		// ── 6. Many-to-one alignment does not double-count ──────────────────
		// R1 ← A1, A2, A3 (three AI findings, ONE reference error)
		// R2 ← (no AI finding → false-negative candidate)
		// A4 unmatched → false-positive candidate
		const humanR2 = baseItem({
			id: 'ref2',
			origin: 'human',
			adjudicationStatus: 'adjudicated',
			assignmentId: 'asg1',
			evaluationId: 'ev1',
			submissionId: 'sub1',
			aiCategory: 'Syntax',
			aiSubcategory: 'word_order',
			referenceCategory: 'Syntax',
			referenceSubcategory: 'word_order',
			raterJudgments: [
				{ round: 0, reviewer: REVIEWER_C, reviewedAt: NOW, detectionJudgment: 'missed' },
			],
		});
		const aiA2 = { ...aiA1, id: 'ai_a2' };
		const aiA3 = { ...aiA1, id: 'ai_a3' };
		const aiA4 = baseItem({
			id: 'ai_a4',
			origin: 'ai',
			adjudicationStatus: 'adjudicated',
			assignmentId: 'asg1',
			evaluationId: 'ev1',
			submissionId: 'sub1',
			matchedReferenceId: '',
			aiCategory: 'Orthography',
			aiSubcategory: 'spelling',
			raterJudgments: [
				{ round: 0, reviewer: REVIEWER_C, reviewedAt: NOW, detectionJudgment: 'incorrect' },
			],
		});
		const dataset = [humanR1, humanR2, aiA1, aiA2, aiA3, aiA4];
		const aware = computeAlignmentAwareDetection(dataset);
		// Reference errors = 2 (R1, R2), NOT 4.
		expect(aware.referenceErrors).toBe(2);
		// TP = 1 (R1 detected by ≥1 correct AI finding; A1,A2,A3 count once).
		expect(aware.tp).toBe(1);
		// FN = 1 (R2 has no correct AI finding).
		expect(aware.fn).toBe(1);
		// FP = 1 (A4 marked incorrect).
		expect(aware.fp).toBe(1);

		// ── 7. Gold-standard metric calculation ─────────────────────────────
		const stats = computeSliceStats(dataset);
		// 7.1 Only adjudicated evidence is gold-standard.
		expect(stats.eligibility.adjudicated).toBe(6);
		expect(stats.eligibility.goldStandard).toBe(6);
		expect(stats.eligibility.sufficient).toBe(true);
		// 7.2 Missing adjudication → null, never 0%.
		const unreviewedOnly = [baseItem({ id: 'u1', adjudicationStatus: 'unreviewed' })];
		const unreviewedStats = computeSliceStats(unreviewedOnly);
		expect(unreviewedStats.detection.precision).toBeNull();
		expect(unreviewedStats.detection.recall).toBeNull();
		expect(unreviewedStats.alignmentAware.precision).toBeNull();
		expect(unreviewedStats.alignmentAware.recall).toBeNull();
		const reviewedOnly = [
			baseItem({ id: 'rv1', adjudicationStatus: 'reviewed', raterJudgments: [r1] }),
		];
		const reviewedStats = computeSliceStats(reviewedOnly);
		expect(reviewedStats.detection.precision).toBeNull();
		expect(reviewedStats.alignmentAware.precision).toBeNull();

		// ── 8. Independent-rater agreement summary (no invented coefficients) ─
		const agreement = summarizeDatasetAgreement([aiItem]);
		expect(agreement.bothRaters).toBe(1);
		expect(agreement.adjudicated).toBe(1);
		// No kappa/alpha field exists on the summary.
		expect(agreement).not.toHaveProperty('kappa');
		expect(agreement).not.toHaveProperty('alpha');

		// ── 9. Pseudonymous research export ─────────────────────────────────
		const pseudo = createPseudonymizer();
		const pParticipant = pseudo.pseudonymize('participant', 'internal_user_1');
		const pSubmission = pseudo.pseudonymize('submission', 'sub1');
		const pAssignment = pseudo.pseudonymize('assignment', 'asg1');
		const pFeedback = pseudo.pseudonymize('feedbackItem', 'ai_a1');
		const pReference = pseudo.pseudonymize('referenceError', 'ref1');
		const pReviewer = pseudo.pseudonymize('reviewer', REVIEWER_A);
		const pEval = pseudo.pseudonymize('evaluation', 'ev1');
		// 9.1 No raw internal ids leak.
		for (const pseudoId of [pParticipant, pSubmission, pAssignment, pFeedback, pReference, pReviewer, pEval]) {
			expect(pseudoId).not.toContain('internal_');
			expect(pseudoId).not.toContain(REVIEWER_A);
			expect(pseudoId).not.toContain('user_');
		}
		// 9.2 Pseudonymous ids are stable.
		expect(pseudo.pseudonymize('participant', 'internal_user_1')).toBe(pParticipant);
		// 9.3 Namespaces remain distinct (different prefixes).
		expect(pParticipant).not.toEqual(pSubmission);
		expect(pParticipant).not.toEqual(pFeedback);
		expect(pReviewer.startsWith('RV')).toBe(true);
		expect(pEval.startsWith('EV')).toBe(true);

		// ── 10. Dataset snapshot identifier (deterministic, changes w/ data) ─
		const snapshotInput = dataset.map((d) => ({
			id: d.id,
			origin: d.origin,
			detectionJudgment: goldStandardJudgment(d)?.detectionJudgment ?? '',
			correctionJudgment: goldStandardJudgment(d)?.correctionJudgment ?? '',
			explanationJudgment: goldStandardJudgment(d)?.explanationJudgment ?? '',
			adjudicationStatus: d.adjudicationStatus,
			matchedReferenceId: d.matchedReferenceId,
			raterJudgments: d.raterJudgments,
		}));
		const snap1 = computeDatasetSnapshotId(snapshotInput);
		const snap2 = computeDatasetSnapshotId(snapshotInput);
		expect(snap1).toBe(snap2); // deterministic
		expect(snap1).toMatch(/^snap_[a-f0-9]{24}$/); // SHA-256-based
		// Changing research-relevant data changes the snapshot.
		const changedSet = [...snapshotInput];
		changedSet[0] = { ...changedSet[0], detectionJudgment: 'incorrect' };
		const snapChanged = computeDatasetSnapshotId(changedSet);
		expect(snapChanged).not.toBe(snap1);

		// ── 11. No learner-facing research fields leak ──────────────────────
		// The analytics item carries research-only fields (raterJudgments,
		// referenceCategory, etc.) that the student-facing
		// /api/evaluation-result route never returns. The pure analytics
		// output (SliceStats) exposes only aggregated metrics, never raw
		// reviewer ids or rater judgments. Verify the metric object exposes no
		// reviewer identity.
		const statsJson = JSON.stringify(stats);
		expect(statsJson).not.toContain(REVIEWER_A);
		expect(statsJson).not.toContain(REVIEWER_B);
		expect(statsJson).not.toContain(REVIEWER_C);
		expect(statsJson).not.toContain('raterJudgments');
	});

	it('finalResearchJudgment never promotes an independent rater to gold-standard', () => {
		const onlyR1: AnalyticsItem = baseItem({
			id: 'or1',
			adjudicationStatus: 'reviewed',
			raterJudgments: [
				{ round: 1, reviewer: REVIEWER_A, reviewedAt: NOW, detectionJudgment: 'correct' },
			],
		});
		expect(finalResearchJudgment(onlyR1.raterJudgments)).toBeNull();
		expect(isGoldStandard(onlyR1)).toBe(false);
	});
});
