/**
 * POST /api/evaluation-publish — Phase 3: explicit lecturer confirmation and
 * publishing of a Tugas formal evaluation.
 *
 * Recalculates the rubric scores SERVER-SIDE from the findings the lecturer
 * approved (or created) and assigned to rubric criteria — rejected AI
 * findings never count — applies the lecturer's optional manual override
 * (visibly recorded as "disesuaikan dosen"), and only then publishes: the
 * final grade, rubric breakdown, approved finding notes, and the lecturer's
 * note are written to the submission's existing official grade/feedback
 * fields and the submission is marked as graded.
 *
 * Nothing publishes before this explicit confirmation. The original student
 * text is never modified, the AI draft's own columns stay untouched, and the
 * full reviewed finding history (with authorship) is retained on the
 * `ai_evaluations` row together with the publish snapshot (rubricScores,
 * finalScore, scoreAdjusted, publishedAt).
 *
 * Permission: only the lecturer who owns the assignment; Tugas formal only.
 * The validation and publishing logic is shared with the batch route
 * (/api/evaluation-publish-batch) in `lib/evaluation-publish.server.ts`.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { loadEvaluationTarget } from '@/lib/evaluation-review.server';
import { publishEvaluation, type PublishBody } from '@/lib/evaluation-publish.server';

type Body = PublishBody & { submissionId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const loaded = await loadEvaluationTarget(request, body);
	if ('error' in loaded) return apiError(loaded.error.status, loaded.error.message);
	const result = await publishEvaluation(loaded.target, body);
	if ('error' in result) return apiError(result.error.status, result.error.message);
	return json(result);
});
