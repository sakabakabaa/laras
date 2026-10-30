/**
 * GET    /api/ai-providers  → the lecturer's providers, preferences and surfaces
 * POST   /api/ai-providers  → create a provider (key encrypted server-side)
 * DELETE /api/ai-providers?id=… → delete a provider, its secret and preferences
 *
 * Faculty-only and owner-scoped: a lecturer can only ever see or change their
 * own providers. No response contains a key — only a masked `last4`.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { AI_SURFACES, createProvider, deleteProvider, listPreferences, listProviders } from '@/lib/ai/providers.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const handler = withApi(async ({ request }) => {
	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Hanya dosen yang dapat mengatur model AI.');
	const ownerId = auth.user.id;

	if (request.method === 'GET') {
		const [providers, preferences] = await Promise.all([listProviders(ownerId), listPreferences(ownerId)]);
		return json({ providers, preferences, surfaces: AI_SURFACES });
	}

	if (request.method === 'POST') {
		const body = await readJsonBody<Record<string, unknown>>(request);
		try {
			return json({ provider: await createProvider(ownerId, body) });
		} catch (error) {
			return apiError(422, message(error, 'Gagal menyimpan provider.'));
		}
	}

	if (request.method === 'DELETE') {
		const id = new URL(request.url).searchParams.get('id') || '';
		if (!SAFE_ID.test(id)) return apiError(422, 'id provider tidak valid.');
		try {
			await deleteProvider(ownerId, id);
			return json({ ok: true });
		} catch (error) {
			return apiError(422, message(error, 'Gagal menghapus provider.'));
		}
	}

	return apiError(405, 'Method not allowed');
});

/** GET is served by `loader` in React Router; writes go through `action`. */
export const loader = handler;
export const action = handler;
