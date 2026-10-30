/**
 * POST /api/transcribe
 *
 * Speaking-task Phase 2 — start (or retry) transcription of an enrolled
 * student's recorded speaking submission through the user's Whisper service.
 *
 * The caller must be the submission's owner (the student) or the assignment's
 * owner (the lecturer reviewing it). The route verifies the caller's PocketBase
 * token, confirms the assignment is a speaking task, then kicks off the
 * background transcription (`queueTranscription`) and responds immediately —
 * transcription never blocks the request. The transcript fields are written
 * server-side only; students can never set them directly (collection rules).
 */
import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { queueTranscription } from '@/lib/transcription.server';
import { taskKindForShape } from '@/lib/task-types';
import type { Assignment } from '@/lib/assignments';

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

type Body = { submissionId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const submissionId = body.submissionId?.trim();
	if (!submissionId) return apiError(422, 'submissionId wajib diisi.');

	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return apiError(401, 'Masuk untuk mentranskripsi jawaban berbicara.');

	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return apiError(401, 'Sesi tidak valid. Masuk kembali.');
	}
	const user = pb.authStore.record as { id?: string } | null;
	if (!user?.id) return apiError(401, 'Sesi tidak valid. Masuk kembali.');

	let submission: { id: string; owner: string; assignment: string };
	try {
		submission = await pocketbaseAdmin.getRecord<{ id: string; owner: string; assignment: string }>(
			'assignment_submissions',
			submissionId,
		);
	} catch {
		return apiError(404, 'Pengumpulan tidak ditemukan.');
	}

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', submission.assignment);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}

	// Only the student who owns the submission or the lecturer who owns the
	// assignment may trigger transcription.
	const isOwner = submission.owner === user.id;
	const isLecturer = assignment.owner === user.id;
	if (!isOwner && !isLecturer) {
		return apiError(403, 'Anda tidak dapat mentranskripsi pengumpulan ini.');
	}

	// Transcription is only meaningful for speaking / conversation tasks.
	if (taskKindForShape(assignment.shape) !== 'speaking') {
		return apiError(422, 'Transkripsi hanya untuk tugas berbicara.');
	}

	const result = await queueTranscription(submissionId);
	return json({ ok: true, ...result });
});
