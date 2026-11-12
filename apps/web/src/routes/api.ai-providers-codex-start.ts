/**
 * POST /api/ai-providers-codex-start — begin a Codex/ChatGPT device login.
 *
 * Body: { label, models, isDefault? }
 * Returns the code and verification URL the lecturer must open. No provider is
 * created here: the provider only exists once a grant is actually issued, so an
 * abandoned login leaves nothing in the provider list.
 *
 * Faculty-only and owner-scoped, and refused entirely unless the deployment has
 * opted in with `CODEX_OAUTH_ENABLED=true`.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { isCodexOAuthEnabled, startCodexLogin } from '@/lib/ai/codex-oauth.server';
import { validateProviderIdentity } from '@/lib/ai/providers.server';

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');
	if (!isCodexOAuthEnabled()) return apiError(403, 'Login akun Codex belum diaktifkan di server ini.');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Hanya dosen yang dapat menghubungkan akun Codex.');

	const body = await readJsonBody<{ label?: unknown; models?: unknown; isDefault?: unknown }>(request);
	let identity: { label: string; models: string[] };
	try {
		identity = validateProviderIdentity(body);
	} catch (error) {
		return apiError(422, error instanceof Error ? error.message : 'Data provider tidak valid.');
	}

	try {
		const login = await startCodexLogin(auth.user.id, {
			label: identity.label,
			models: identity.models,
			isDefault: body.isDefault === true,
		});
		return json({ ok: true, login });
	} catch (error) {
		return apiError(422, error instanceof Error ? error.message : 'Gagal memulai login akun Codex.');
	}
});
