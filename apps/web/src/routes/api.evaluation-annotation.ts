/**
 * POST /api/evaluation-annotation — Phase 3: save a lecturer research
 * annotation for one AI-generated finding on a Tugas formal submission.
 *
 * The annotation is lecturer-only expert metadata (error existence, AI
 * detection/correction/explanation judgments, completeness, necessity,
 * pedagogical appropriateness, human reference classification, and a reviewer
 * note). It is stored in `ai_feedback_items` (server-only writes,
 * owner-only reads — students can never access it).
 *
 * Saving is INDEPENDENT of publishing: it never changes the AI draft's own
 * findings/score columns, never changes the official grade, feedback, or
 * submission status, and never publishes anything. The normal
 * approve/reject/edit/manual-finding/publish workflow is untouched.
 *
 * Permission: only the lecturer who owns the assignment; Tugas formal only.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { loadResearchRatings, saveResearchAnnotation, type AnnotationBody } from '@/lib/evaluation-annotation.server';

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<AnnotationBody>(request);
	if (body.intent === 'load') {
		const result = await loadResearchRatings(request, body);
		if ('error' in result) return apiError(result.error.status, result.error.message);
		return json(result);
	}
	if (body.intent !== undefined && body.intent !== 'save') return apiError(422, 'Invalid research intent.');
	const result = await saveResearchAnnotation(request, body);
	if ('error' in result) return apiError(result.error.status, result.error.message);

	return json({ ok: true, id: result.id });
});
