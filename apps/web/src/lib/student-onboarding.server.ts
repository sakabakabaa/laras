/**
 * Phase 3 — shared server helpers for student onboarding & account security.
 *
 * `authUser` authenticates the caller's PocketBase bearer token (the same JWT
 * the browser client uses) and returns the live record. It is the onboarding
 * equivalent of the roster-enroll `authFaculty` helper, but role-agnostic: any
 * signed-in user may change their own password or request a recovery-email
 * verification. The privileged fields (`mustChangePassword`,
 * `recoveryEmail`, `recoveryEmailVerified`) are locked by collection rules, so
 * the actual mutations happen through the superuser client in the routes.
 */
import crypto from 'node:crypto';
import PocketBase from 'pocketbase';
import { apiError } from '@/lib/api.server';

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

export type OnboardingUser = {
	id: string;
	role?: string;
	email?: string;
	nim?: string;
	name?: string;
};

/** Authenticate the caller's PocketBase token; throws an apiError on failure. */
export async function authUser(request: Request) {
	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) throw apiError(401, 'Masuk untuk melanjutkan.');
	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		throw apiError(401, 'Sesi tidak valid. Masuk kembali.');
	}
	const user = pb.authStore.record as OnboardingUser | null;
	if (!user?.id) throw apiError(401, 'Sesi tidak valid. Masuk kembali.');
	return { user, pb };
}

/** Authenticate a faculty caller; throws an apiError if not a lecturer. */
export async function authFaculty(request: Request) {
	const { user } = await authUser(request);
	if (user.role !== 'faculty') {
		throw apiError(403, 'Hanya dosen yang dapat melakukan aksi ini.');
	}
	return { user };
}

/** Escape a value for use inside a PocketBase filter `"... = \"<val>\""` clause. */
export const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Cryptographically random verification token (URL-safe). */
export function randomToken(bytes = 24): string {
	return crypto.randomBytes(bytes).toString('hex');
}

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
