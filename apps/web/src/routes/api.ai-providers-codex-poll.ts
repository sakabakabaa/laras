/**
 * POST /api/ai-providers-codex-poll — advance one pending Codex device login.
 *
 * Body: { loginId }
 * Performs exactly one upstream poll, so the request returns immediately and the
 * browser owns the retry cadence (`intervalSeconds` from the start response).
 * On success the provider and its encrypted grant are created and the pending
 * login row is deleted.
 *
 * Faculty-only and owner-scoped. A login id belonging to someone else is
 * rejected, not silently ignored.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { isCodexOAuthEnabled, pollCodexLogin } from '@/lib/ai/codex-oauth.server';
import { createCodexProvider } from '@/lib/ai/providers.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');
	if (!isCodexOAuthEnabled()) return apiError(403, 'Login akun Codex belum diaktifkan di server ini.');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Hanya dosen yang dapat menghubungkan akun Codex.');

	const body = await readJsonBody<{ loginId?: unknown }>(request);
	const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : '';
	if (!SAFE_ID.test(loginId)) return apiError(422, 'loginId tidak valid.');

	try {
		const result = await pollCodexLogin({
			ownerId: auth.user.id,
			loginId,
			// Wired here so the grant layer stays independent of the registry.
			createProvider: async (settings) => (await createCodexProvider(auth.user.id, settings)).id,
		});
		return json({ ok: true, ...result });
	} catch (error) {
		return apiError(422, error instanceof Error ? error.message : 'Gagal memeriksa status login.');
	}
});
