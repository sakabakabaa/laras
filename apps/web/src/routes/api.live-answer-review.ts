/**
 * POST /api/live-answer-review — AI draft for one live-class written activity.
 *
 * Faculty-only and ownership-verified (the caller must own the course of the
 * class session). Returns a recommendation for the lecturer to review; nothing
 * is graded or published here. See `live-answer-review.server`.
 *
 * With `attemptId` the draft is built from the stored answer, model answers
 * and rubric (never from the body) and kept per answer in
 * `scheduled_ai_drafts`, so it survives navigation and bulk runs
 * ("Jalankan AI untuk semua"). See `scheduled-grading.server`.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { draftLiveAnswerReview, parseLiveDraftInput } from '@/lib/live-answer-review.server';
import { draftScheduledAttempt } from '@/lib/scheduled-grading.server';

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Draf AI hanya tersedia untuk dosen.');

	const body = await readJsonBody<Record<string, unknown>>(request);
	if (body && typeof body === 'object' && 'attemptId' in body) {
		const stored = await draftScheduledAttempt(auth.user.id, body);
		if ('error' in stored) return apiError(stored.error.status, stored.error.message);
		return json({ ok: true, draft: stored.draft, record: stored.record });
	}

	const parsed = parseLiveDraftInput(body);
	if ('error' in parsed) return apiError(parsed.error.status, parsed.error.message);

	const result = await draftLiveAnswerReview(auth.user.id, parsed.input);
	if ('error' in result) return apiError(result.error.status, result.error.message);
	return json({ ok: true, draft: result.draft });
});
