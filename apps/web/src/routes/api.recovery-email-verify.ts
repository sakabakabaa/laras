import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { esc } from '@/lib/student-onboarding.server';

/**
 * POST /api/recovery-email/verify
 *
 * Confirms a recovery-email verification token. Public (no auth) — the token
 * is the proof of email ownership, delivered out-of-band via email. On success
 * the owning user's `recoveryEmail` + `recoveryEmailVerified=true` are written
 * via the superuser client (both fields are locked against self-update), and
 * the verification record is marked verified.
 */
type VerificationRecord = {
	id: string;
	owner: string;
	email: string;
	token: string;
	verified: boolean;
	expiresAt: string;
};

type Body = { token?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const token = (body.token || '').trim();
	if (!token || token.length > 64) return apiError(422, 'Token verifikasi tidak valid.');

	const records = await pocketbaseAdmin.listRecords<VerificationRecord>(
		'email_verifications',
		{
			perPage: 1,
			filter: `token="${esc(token)}"`,
		},
	);
	const record = records.items[0];
	if (!record) {
		return apiError(404, 'Token verifikasi tidak ditemukan atau kedaluwarsa.');
	}
	if (record.verified) {
		return json({ ok: true, alreadyVerified: true, email: record.email });
	}
	if (new Date(record.expiresAt).getTime() < Date.now()) {
		return apiError(410, 'Tautan verifikasi kedaluwarsa. Minta tautan baru dari akun Anda.');
	}

	// Guard against a race: another user may have verified this address since
	// the request was created.
	const clash = await pocketbaseAdmin.listRecords<{ id: string }>('users', {
		perPage: 1,
		filter: `recoveryEmail="${esc(record.email)}" && recoveryEmailVerified=true`,
	});
	if (clash.items.length > 0) {
		return apiError(409, 'Email sudah digunakan oleh akun lain.');
	}

	await pocketbaseAdmin.updateRecord('users', record.owner, {
		recoveryEmail: record.email,
		recoveryEmailVerified: true,
	});
	await pocketbaseAdmin.updateRecord('email_verifications', record.id, {
		verified: true,
	});

	return json({ ok: true, email: record.email });
});
