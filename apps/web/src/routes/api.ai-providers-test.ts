/**
 * POST /api/ai-providers-test — "Test connection" for one provider.
 *
 * Runs a minimal completion server-side and reports the model the provider
 * actually echoed plus the round-trip latency. The key never reaches the client.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { testProvider } from '@/lib/ai/providers.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');
	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Hanya dosen yang dapat menguji model AI.');

	const body = await readJsonBody<{ providerId?: unknown; model?: unknown }>(request);
	const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
	const model = typeof body.model === 'string' ? body.model.trim() : '';
	if (!SAFE_ID.test(providerId)) return apiError(422, 'providerId tidak valid.');

	try {
		const result = await testProvider(auth.user.id, providerId, model || undefined);
		return json({ ok: true, ...result });
	} catch (error) {
		return apiError(422, error instanceof Error ? error.message : 'Koneksi ke provider gagal.');
	}
});
