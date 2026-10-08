/**
 * POST /api/personalization-analytics — lecturer/researcher-only Phase 10
 * generic-vs-personalized comparison and category trajectory analytics.
 *
 * Returns the normalized record sets; the pure computation (filtering,
 * comparison, trajectories) runs client-side so the lecturer can adjust
 * filters without a round-trip. Read-only: never writes, never changes grades,
 * never exposes student answers or direct identifiers. Students are blocked
 * by the server-side role check (and by the route's clientLoader guard).
 *
 * Input: `{ assignmentId? }` — omit to aggregate over all of the caller's
 * assignments; pass an id to scope to one (the owner or an allowlisted
 * researcher may view it).
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { loadPersonalizationAnalytics } from '@/lib/personalization-analytics.server';

type Body = { assignmentId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const result = await loadPersonalizationAnalytics(request, body.assignmentId);
	if ('error' in result) return apiError(result.error.status, result.error.message);
	return json(result);
});
