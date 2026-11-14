/**
 * Baseline ("what is on the server") of a Tugas AI review working copy.
 *
 * `dirty` in the review compares the lecturer's working copy against this
 * baseline. After a fresh AI regeneration there is nothing saved yet, so the
 * baseline must become the NEW draft and the working copy must be reset to it;
 * otherwise the old copy differs from the new draft and the lecturer is told
 * "Draf belum disimpan" without having changed anything.
 */
import { matchCriterion, validatedRubric } from './evaluation-rubric';
import { deriveAiReviewFindings, parseFindings, parseRubric, type ReviewFinding } from './ai-evaluation';
import type { RubricScores, RubricCriterion } from './evaluation-scoring';

type Criteria = RubricCriterion[];

export type BaselineRow = {
	status?: string;
	generatedAt?: string | null;
	findings?: unknown;
	rubricBreakdown?: unknown;
	scoringVersion?: number | null;
	rubricScores?: unknown;
	reviewedAt?: string | null;
	reviewCriterionScores?: Record<string, number> | null;
};

export type ReviewBaseline = { findings: ReviewFinding[]; scores: Record<string, number> };

/** Criterion scores proposed by the AI draft itself (nothing the lecturer saved). */
export function aiDraftScores(row: BaselineRow, criteria: Criteria): Record<string, number> {
	if (row.scoringVersion === 4 && row.rubricScores) {
		return Object.fromEntries(((row.rubricScores as RubricScores).rows || []).map((entry) => [entry.id, entry.score]));
	}
	return Object.fromEntries(
		validatedRubric(parseRubric(row.rubricBreakdown), criteria).map((entry) => [matchCriterion(entry, criteria)!.id!, entry.score]),
	);
}

/** Findings (all 'pending') and scores of a freshly generated draft. */
export function aiDraftBaseline(row: BaselineRow, criteria: Criteria): ReviewBaseline {
	return {
		findings: deriveAiReviewFindings(parseFindings(row.findings), criteria),
		scores: aiDraftScores(row, criteria),
	};
}

/** The generation timestamp changed to a ready draft: a fresh regeneration landed. */
export function regenerationLanded(row: BaselineRow | null | undefined, previousGeneratedAt: string | null): boolean {
	return !!row && row.status === 'ready' && !!row.generatedAt && row.generatedAt !== previousGeneratedAt;
}

/** A regeneration may reset the working copy only while nothing has been saved by the lecturer. */
export function canResetToFreshDraft(row: BaselineRow, storedFindingCount: number): boolean {
	return !row.reviewedAt && storedFindingCount === 0;
}

/** True when the working copy differs from the baseline (the "Draf belum disimpan" test). */
export function reviewCopyDirty(
	working: { findings: ReviewFinding[]; scores: Record<string, number> },
	baseline: ReviewBaseline,
): boolean {
	return JSON.stringify(working.findings) !== JSON.stringify(baseline.findings) || JSON.stringify(working.scores) !== JSON.stringify(baseline.scores);
}
