import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authUser, PASSWORD_MAX, PASSWORD_MIN } from '@/lib/student-onboarding.server';

/**
 * POST /api/student-password
 *
 * First-login (and later) password change for the signed-in student. The old
 * password is verified by attempting auth with the caller's login email, so a
 * stolen session alone is not enough to rotate the password. The new password
 * + the `mustChangePassword=false` flip are written through the superuser
 * client, because collection rules lock both fields against self-update.
 */
const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

type Body = {
	oldPassword?: string;
	newPassword?: string;
};

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const { user } = await authUser(request);
	const body = await readJsonBody<Body>(request);
	const oldPassword = (body.oldPassword || '').trim();
	const newPassword = (body.newPassword || '').trim();

	if (!oldPassword) return apiError(422, 'Kata sandi lama wajib diisi.');
	if (!newPassword) return apiError(422, 'Kata sandi baru wajib diisi.');
	if (newPassword.length < PASSWORD_MIN) {
		return apiError(422, `Kata sandi baru minimal ${PASSWORD_MIN} karakter.`);
	}
	if (newPassword.length > PASSWORD_MAX) {
		return apiError(422, `Kata sandi baru maksimal ${PASSWORD_MAX} karakter.`);
	}
	if (newPassword === oldPassword) {
		return apiError(422, 'Kata sandi baru harus berbeda dari kata sandi lama.');
	}

	// Verify the old password by authenticating with the caller's login email.
	const verifyPb = new PocketBase(pocketbaseUrl());
	verifyPb.autoCancellation(false);
	try {
		await verifyPb.collection('users').authWithPassword(user.email || '', oldPassword);
	} catch {
		return apiError(403, 'Kata sandi lama salah.');
	}

	// Superuser write: rotate the password and clear the must-change flag.
	await pocketbaseAdmin.updateRecord('users', user.id, {
		password: newPassword,
		passwordConfirm: newPassword,
		mustChangePassword: false,
	});

	return json({ ok: true });
});
