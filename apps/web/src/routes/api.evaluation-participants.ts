/**
 * POST /api/evaluation-participants — resolve display identity (name + NIM)
 * for the enrolled students who submitted to one assignment.
 *
 * The `users` auth collection keeps its default `viewRule = id = @request.auth.id`,
 * so a lecturer expanding `owner` on other students' `assignment_submissions`
 * gets nothing back — the evaluation list then fell back to the generic label
 * "Mahasiswa". This route reads the owner records through the superuser client
 * (bypassing that rule server-side) and returns only the display fields the
 * lecturer's evaluation view needs. It writes nothing and exposes no data the
 * lecturer could not already see through the roster they own; other students
 * are still blocked by the browser-side `users` rule.
 *
 * Permission: the caller must be the faculty user who owns the assignment.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import type { Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { assignmentId?: string };

type OwnerIdentity = { name: string; nim: string; email: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { user } = auth;
	if (user.role !== 'faculty') {
		return apiError(403, 'Hanya dosen yang dapat melihat identitas peserta.');
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
	if (assignment.owner !== user.id) {
		return apiError(403, 'Anda bukan pemilik tugas ini.');
	}

	// Superuser read with expand — the owner relation resolves to a users row
	// the lecturer could not expand through their own token.
	const result = await pocketbaseAdmin.listRecords<{
		id: string;
		owner: string;
		expand?: { owner?: { name?: string; nim?: string; email?: string } };
	}>('assignment_submissions', {
		filter: `assignment="${assignmentId}"`,
		perPage: 1000,
		expand: 'owner',
	});

	const identities: Record<string, OwnerIdentity> = {};
	for (const row of result.items) {
		const owner = row.expand?.owner;
		identities[row.id] = {
			name: owner?.name || '',
			nim: owner?.nim || '',
			email: owner?.email || '',
		};
	}

	return json({ identities });
});
