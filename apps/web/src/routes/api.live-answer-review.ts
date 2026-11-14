/**
 * POST /api/live-answer-review — AI draft for one live-class written activity.
 *
 * Faculty-only and ownership-verified (the caller must own the course of the
 * class session). Returns a recommendation for the lecturer to review; nothing
 * is stored, graded or published here. See `live-answer-review.server`.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { draftLiveAnswerReview, parseLiveDraftInput } from '@/lib/live-answer-review.server';

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Draf AI hanya tersedia untuk dosen.');

	const parsed = parseLiveDraftInput(await readJsonBody<unknown>(request));
	if ('error' in parsed) return apiError(parsed.error.status, parsed.error.message);

	const result = await draftLiveAnswerReview(auth.user.id, parsed.input);
	if ('error' in result) return apiError(result.error.status, result.error.message);
	return json({ ok: true, draft: result.draft });
});
