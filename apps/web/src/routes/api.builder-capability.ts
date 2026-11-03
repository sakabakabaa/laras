/**
 * POST /api/builder-capability — server-owned enhanced visual authoring flag.
 *
 * Returns whether the signed-in lecturer may use the enhanced (layout +
 * appearance) authoring surfaces. The decision is made on the server from
 * `BUILDER_ENHANCED_AUTHORING` / `BUILDER_ENHANCED_AUTHORING_ALLOWLIST`; the UI
 * only reflects it and the builder API enforces the same capability.
 *
 * POST (never GET) because the response is per-user and `/api/*` GET responses
 * are edge-cached. Read-only: this route performs no writes.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { builderCapabilityPayload, serverEnhancedAuthoring, usesEnhancedAuthoring } from '@/lib/builder-capability';

type Body = { document?: unknown };

export const loader = withApi(async () => {
	const response = apiError(405, 'Method not allowed');
	response.headers.set('Allow', 'POST');
	return response;
});

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');
	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const body = await readJsonBody<Body>(request).catch(() => ({}) as Body);
	const capability = serverEnhancedAuthoring(auth.user);
	return json(builderCapabilityPayload(capability, usesEnhancedAuthoring(body?.document)));
});
