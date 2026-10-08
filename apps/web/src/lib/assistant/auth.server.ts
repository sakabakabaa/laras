/**
 * Assistant runtime — authentication & session resolution.
 *
 * Verifies the lecturer's session and returns an authenticated PocketBase client
 * scoped to that user. The token lives in `pb.authStore`; all subsequent
 * PocketBase access uses the lecturer's own token, so collection access rules
 * remain the authorization layer. Faculty role and a verified email are
 * mandatory — anyone can register, so the verified check keeps throwaway
 * accounts from spending model credits.
 */
import PocketBase from 'pocketbase';
import { pocketbaseUrl } from './env.server';
import { logAssistantError } from './logging.server';
import type { AssistantSession } from './types';

/** Resolves and verifies the faculty session from the request's bearer token. */
export const resolveFaculty = async (request: Request): Promise<AssistantSession> => {
	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) {
		throw Object.assign(new Error('Masuk sebagai dosen untuk menggunakan asisten AI.'), { status: 401 });
	}
	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		throw Object.assign(new Error('Sesi tidak valid. Masuk kembali.'), { status: 401 });
	}
	const user = pb.authStore.record as { id?: string; role?: string; verified?: boolean } | null;
	if (!user?.id) {
		throw Object.assign(new Error('Sesi tidak valid. Masuk kembali.'), { status: 401 });
	}
	if (user.role !== 'faculty') {
		throw Object.assign(new Error('Asisten AI hanya untuk dosen.'), { status: 403 });
	}
	if (!user.verified) {
		throw Object.assign(new Error('Verifikasi email Anda sebelum memakai asisten AI.'), { status: 403 });
	}
	return { id: user.id, pb, role: 'faculty', verified: true };
};

/** Normalises an unknown error into one carrying an HTTP status, preserving a thrown status when present. */
export const toError = (error: unknown): Error => {
	if (error instanceof Error && 'status' in error) return error;
	const message = error instanceof Error ? error.message : 'Terjadi kesalahan.';
	return Object.assign(new Error(message), { status: 500 });
};

/** Convenience wrapper for the runtime: logs and rethrows. */
export const failAssistant = (stage: string, session: AssistantSession | undefined, error: unknown): never => {
	logAssistantError(stage, session, error);
	throw error;
};
