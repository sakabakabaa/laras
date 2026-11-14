/**
 * POST /api/evaluation-draft — prepare an AI evaluation draft (Phase 1,
 * Tugas formal only).
 *
 * Called in the background right after a final submission lands (by the
 * student's own workspace for direct PocketBase submissions, and by the
 * lecturer's evaluation view for submissions that predate this feature).
 * The submission is already stored when this is called — a failed or
 * unavailable analysis never affects the submission flow.
 *
 * Permission: the caller must be the lecturer who owns the assignment, or
 * the enrolled student who owns the submission (the evaluation page also
 * backfills a missing draft when the lecturer opens the submission).
 *
 * The draft itself is a lecturer-only recommendation: no grade, feedback, or
 * status is ever written to the submission, and nothing is published.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { queueEvaluationDraft } from '@/lib/ai-evaluation.server';
import type { Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { submissionId?: string; force?: boolean };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { user } = auth;

	const body = await readJsonBody<Body>(request);
	const submissionId = (body.submissionId || '').trim();
	if (!SAFE_ID.test(submissionId)) {
		return apiError(422, 'submissionId wajib dan harus valid.');
	}

	let assignmentId = '';
	let submitterId = '';
	try {
		const row = await pocketbaseAdmin.getRecord<{ assignment: string; owner: string }>(
			'assignment_submissions',
			submissionId,
		);
		assignmentId = row.assignment;
		submitterId = row.owner;
	} catch {
		return apiError(404, 'Kiriman tidak ditemukan.');
	}

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}

	// Only the owning lecturer or the submission's own student may ask for a
	// draft.
	if (user.id !== assignment.owner && user.id !== submitterId) {
		return apiError(403, 'Hanya dosen pemilik tugas atau pemilik kiriman yang dapat meminta draf evaluasi.');
	}

	if (body.force === true && user.id !== assignment.owner) return apiError(403, 'Hanya dosen pemilik tugas dapat meminta evaluasi ulang.');

	const result = await queueEvaluationDraft({
        force: body.force === true,
		assignment,
		submissionId,
	});
	return json({ ok: true, ...result });
});
