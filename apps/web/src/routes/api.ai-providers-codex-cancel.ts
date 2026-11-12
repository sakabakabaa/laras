/**
 * POST /api/ai-providers-codex-cancel — drop a pending Codex device login.
 *
 * Body: { loginId }
 * Used when the lecturer closes the dialog. Cancelling an attempt that already
 * finished is not an error.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { cancelCodexLogin } from '@/lib/ai/codex-oauth.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Hanya dosen yang dapat menghubungkan akun Codex.');

	const body = await readJsonBody<{ loginId?: unknown }>(request);
	const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : '';
	if (!SAFE_ID.test(loginId)) return apiError(422, 'loginId tidak valid.');

	await cancelCodexLogin(auth.user.id, loginId);
	return json({ ok: true });
});
