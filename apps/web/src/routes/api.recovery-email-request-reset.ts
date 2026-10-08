import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { esc, randomToken, VERIFICATION_TTL_MS } from '@/lib/student-onboarding.server';

/**
 * POST /api/recovery-email/request-reset
 *
 * Public (no auth) — starts a password reset from the /lupa-sandi page. Only
 * an address that is a *verified* recovery email for some account receives a
 * reset link; the response is intentionally generic so a caller cannot probe
 * which addresses exist. When a match is found, a single-use
 * `password_resets` token is created (server-only write) and the
 * password-reset-send hook emails the link.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESET_TTL_MS = VERIFICATION_TTL_MS;

type Body = { email?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const email = (body.email || '').trim().toLowerCase();
	if (!email || !EMAIL_RE.test(email)) {
		return apiError(422, 'Format email tidak valid.');
	}

	const users = await pocketbaseAdmin.listRecords<{ id: string }>('users', {
		perPage: 1,
		filter: `recoveryEmail="${esc(email)}" && recoveryEmailVerified=true`,
	});

	if (users.items.length > 0) {
		const user = users.items[0];
		const token = randomToken();
		const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
		await pocketbaseAdmin.createRecord('password_resets', {
			owner: user.id,
			email,
			token,
			used: false,
			expiresAt,
		});
		// The password-reset-send hook sends the reset email post-commit.
	}

	return json({
		ok: true,
		message:
			'Jika email terverifikasi, tautan reset kata sandi akan dikirim ke email Anda.',
	});
});
