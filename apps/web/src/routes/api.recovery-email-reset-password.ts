import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { esc, PASSWORD_MAX, PASSWORD_MIN } from '@/lib/student-onboarding.server';

/**
 * POST /api/recovery-email/reset-password
 *
 * Public (no auth) — confirms a password-reset token (delivered out-of-band
 * via email) and sets a new password. The token is the proof of ownership of
 * a verified recovery email. On success the user's password is rotated
 * (superuser write — the password field is not self-writable through the
 * locked updateRule), `mustChangePassword` is cleared, and the token is
 * marked used so it cannot be replayed.
 */

type ResetRecord = {
	id: string;
	owner: string;
	email: string;
	token: string;
	used: boolean;
	expiresAt: string;
};

type Body = { token?: string; newPassword?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const token = (body.token || '').trim();
	const newPassword = (body.newPassword || '').trim();

	if (!token || token.length > 64) return apiError(422, 'Token reset tidak valid.');
	if (!newPassword) return apiError(422, 'Kata sandi baru wajib diisi.');
	if (newPassword.length < PASSWORD_MIN) {
		return apiError(422, `Kata sandi baru minimal ${PASSWORD_MIN} karakter.`);
	}
	if (newPassword.length > PASSWORD_MAX) {
		return apiError(422, `Kata sandi baru maksimal ${PASSWORD_MAX} karakter.`);
	}

	const records = await pocketbaseAdmin.listRecords<ResetRecord>('password_resets', {
		perPage: 1,
		filter: `token="${esc(token)}"`,
	});
	const record = records.items[0];
	if (!record) {
		return apiError(404, 'Token reset tidak ditemukan atau kedaluwarsa.');
	}
	if (record.used) {
		return apiError(410, 'Tautan sudah digunakan. Minta tautan baru.');
	}
	if (new Date(record.expiresAt).getTime() < Date.now()) {
		return apiError(410, 'Tautan kedaluwarsa. Minta tautan baru.');
	}

	await pocketbaseAdmin.updateRecord('users', record.owner, {
		password: newPassword,
		passwordConfirm: newPassword,
		mustChangePassword: false,
	});
	await pocketbaseAdmin.updateRecord('password_resets', record.id, { used: true });

	return json({ ok: true });
});
