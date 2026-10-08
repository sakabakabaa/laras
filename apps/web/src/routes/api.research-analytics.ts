/**
 * POST /api/research-analytics — lecturer/researcher-only research analytics.
 *
 * Returns agreement-based metrics computed solely from validated
 * `ai_feedback_items` research records. Read-only: never writes, never
 * changes grades, never exposes student answers. Students are blocked by
 * the server-side role check (and by the route's clientLoader guard).
 *
 * Input:  `{ assignmentId? }` — omit to aggregate over all of the caller's
 * formal assignments; pass an id to scope to one (the owner or an
 * allowlisted researcher may view it).
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { computeResearchAnalytics } from '@/lib/research-analytics.server';

type Body = { assignmentId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const result = await computeResearchAnalytics(request, { assignmentId: body.assignmentId });
	if ('error' in result) return apiError(result.error.status, result.error.message);
	return json(result);
});
