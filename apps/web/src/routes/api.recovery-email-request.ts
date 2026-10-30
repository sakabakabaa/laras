import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	authUser,
	esc,
	randomToken,
	VERIFICATION_TTL_MS,
} from '@/lib/student-onboarding.server';

/**
 * POST /api/recovery-email/request
 *
 * Creates a pending `email_verifications` record (server-only write) for the
 * signed-in user. The `recovery-email-verify` PocketBase hook then sends the
 * verification link to the requested address. The user's `recoveryEmail` is
 * NOT set here — only after the link is confirmed at /api/recovery-email/verify.
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STUDENT_EMAIL_SUFFIX = '@student.upi.edu';

type Body = { email?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const { user } = await authUser(request);
	const body = await readJsonBody<Body>(request);
	const email = (body.email || '').trim().toLowerCase();

	if (!email || !EMAIL_RE.test(email)) {
		return apiError(422, 'Format email tidak valid.');
	}
	if (email.endsWith(STUDENT_EMAIL_SUFFIX)) {
		return apiError(422, 'Gunakan email pribadi Anda, bukan email NIM.');
	}

	// Reject if another user already verified this address.
	const clash = await pocketbaseAdmin.listRecords<{ id: string }>('users', {
		perPage: 1,
		filter: `recoveryEmail="${esc(email)}" && recoveryEmailVerified=true`,
	});
	if (clash.items.length > 0) {
		return apiError(409, 'Email sudah digunakan oleh akun lain.');
	}

	// If this address is already the caller's verified recovery email, no-op.
	if (user.email && email === user.email) {
		return apiError(422, 'Email tidak boleh sama dengan email login.');
	}

	const token = randomToken();
	const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

	await pocketbaseAdmin.createRecord('email_verifications', {
		owner: user.id,
		email,
		token,
		verified: false,
		expiresAt,
	});

	// The recovery-email-verify hook sends the verification email post-commit.

	return json({ ok: true, message: 'Tautan verifikasi telah dikirim ke email Anda.' });
});
