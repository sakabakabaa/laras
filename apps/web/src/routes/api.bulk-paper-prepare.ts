/**
 * POST /api/bulk-paper-prepare — return the enrolled students for an
 * assignment's course so the lecturer review UI can match pasted/scanned
 * entries before anything is submitted.
 *
 * Faculty-only and ownership-verified. POST (not GET) because the roster is
 * per-course and must not be edge-cached. Reads only.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { resolveEnrolledRoster } from '@/lib/bulk-paper.server';
import type { Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { assignmentId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') {
		return apiError(403, 'Hanya dosen yang dapat melakukan input kertas.');
	}

	const body = await readJsonBody<Body>(request);
	const assignmentId = (body.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) {
		return apiError(422, 'ID tugas wajib dan harus valid.');
	}

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.owner !== auth.user.id) {
		return apiError(403, 'Anda bukan pemilik tugas ini.');
	}

	const roster = await resolveEnrolledRoster(assignment.course);
	return json({ roster });
});
