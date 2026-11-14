/**
 * POST /api/evaluation-stale { submissionId } -> { stale: boolean }
 *
 * Tells the grading view whether the AI draft of one submission was generated
 * from text that differs from the current submission text (see
 * lib/ai-evaluation-stale.server for the rule). Read-only. Only the lecturer
 * who owns the assignment may ask.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { staleFlagFor, type StaleRow, type StaleSubmission } from '@/lib/ai-evaluation-stale.server';
import type { Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');
	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Hanya dosen yang dapat melihat status draf AI.');

	const body = await readJsonBody<{ submissionId?: string }>(request);
	const submissionId = (body.submissionId || '').trim();
	if (!SAFE_ID.test(submissionId)) return apiError(422, 'submissionId wajib dan harus valid.');

	try {
		const submission = await pocketbaseAdmin.getRecord<StaleSubmission & { assignment: string }>('assignment_submissions', submissionId);
		const assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', submission.assignment);
		if (assignment.owner !== auth.user.id) return apiError(403, 'Anda bukan pemilik tugas ini.');
		const row = (
			await pocketbaseAdmin.listRecords<StaleRow>('ai_evaluations', {
				filter: `submission="${submissionId}"`,
				perPage: 1,
				sort: '-created',
				fields: 'id,status,inputTextHash,generatedAt,findings',
			})
		).items[0];
		return json({ stale: staleFlagFor({ assignment, submission, row }) });
	} catch {
		return apiError(404, 'Kiriman tidak ditemukan.');
	}
});
