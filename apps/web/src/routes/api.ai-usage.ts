/**
 * POST /api/ai-usage — read-only AI usage summary for the signed-in lecturer.
 *
 * Returns the lecturer's current daily AI usage budget consumption (weight
 * consumed / budget / remaining). This powers the simple usage indicator in
 * lecturer settings. It is a POST (not GET) because the response is per-user
 * and published sites edge-cache GET responses by URL for all visitors — a
 * GET would leak one lecturer's usage to everyone.
 *
 * Students receive a 403: internal rate-limit information is never exposed
 * to students.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { getUsageSummary, toAiRole } from '@/lib/ai-usage.server';

type Body = { action?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { user } = auth;
	if (user.role !== 'faculty') {
		return apiError(403, 'Indikator penggunaan AI hanya untuk dosen.');
	}

	await readJsonBody<Body>(request); // body optional; validates JSON shape

	const summary = await getUsageSummary(user.id, toAiRole(user.role));
	return json({
		ok: true,
		consumed: summary.consumed,
		budget: summary.budget,
		remaining: summary.remaining,
		period: 'hari',
	});
});
