/**
 * POST /api/ai-model-prefs — choose which provider+model serves one surface.
 * Body: { surface, providerId, model }
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { AI_SURFACES, setPreference, type AiSurface } from '@/lib/ai/providers.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');
	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Hanya dosen yang dapat mengatur model AI.');

	const body = await readJsonBody<{ surface?: unknown; providerId?: unknown; model?: unknown }>(request);
	const surface = typeof body.surface === 'string' ? body.surface.trim() : '';
	const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : '';
	const model = typeof body.model === 'string' ? body.model.trim() : '';
	if (!AI_SURFACES.some((entry) => entry.id === surface)) return apiError(422, 'Surface tidak dikenal.');
	if (!SAFE_ID.test(providerId)) return apiError(422, 'providerId tidak valid.');
	if (!model) return apiError(422, 'Pilih model.');

	try {
		const preference = await setPreference(auth.user.id, surface as AiSurface, providerId, model);
		return json({ ok: true, preference });
	} catch (error) {
		return apiError(422, error instanceof Error ? error.message : 'Gagal menyimpan pilihan model.');
	}
});
