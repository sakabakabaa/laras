/**
 * POST /api/submission-content-refresh — rebuild submission answer text from
 * the uploaded file, then optionally re-queue the AI draft.
 *
 * Why this exists: some imports stored a Drive pointer in
 * `assignment_submissions.content` instead of the participant's answer, so the
 * grading panel and the AI review were looking at a link note. This route
 * rewrites `content` from the stored attachment (see
 * `refreshSubmissionContent`) and, when asked, regenerates the draft so the
 * findings describe the participant's actual work.
 *
 * Permission: only the lecturer who owns the assignment. Batched on purpose —
 * extraction runs OCR, so one call handles a few submissions and the caller
 * repeats until `remaining` is 0.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { queueEvaluationDraft } from '@/lib/ai-evaluation.server';
import { isPointerOnlyContent, refreshSubmissionContent } from '@/lib/submission-content.server';
import { taskKindForShape } from '@/lib/task-types';
import type { Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;
/** OCR is seconds per page; keep a single request well inside the request cap. */
const MAX_PER_CALL = 4;

type Body = { assignmentId?: string; regenerate?: boolean; force?: boolean; ids?: unknown };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);

	const body = await readJsonBody<Body>(request);
	const assignmentId = (body.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) return apiError(422, 'assignmentId wajib dan harus valid.');

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (auth.user.id !== assignment.owner) {
		return apiError(403, 'Hanya dosen pemilik tugas yang dapat menyiapkan ulang teks kiriman.');
	}

	const rows = (
		await pocketbaseAdmin.listRecords<{ id: string; content?: string; files?: string[]; status?: string }>(
			'assignment_submissions',
			{ filter: `assignment="${assignmentId}"`, perPage: 500, sort: 'created' },
		)
	).items;

	const requested = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && SAFE_ID.test(v)) : [];
	// Default queue: submissions that still hold the import note, plus any that
	// have a file but no text at all.
	const backlog = rows
		.filter((row) => (row.files || []).length > 0 && isPointerOnlyContent(row.content || ''))
		.map((row) => row.id);
	const queue = (requested.length > 0 ? requested : backlog).filter((id) => rows.some((row) => row.id === id));
	const batch = queue.slice(0, MAX_PER_CALL);
	const kind = taskKindForShape(assignment.shape) || undefined;

	const outcomes: Array<{ submissionId: string; status: string; evaluation?: string }> = [];
	for (const submissionId of batch) {
		const result = await refreshSubmissionContent({
			submissionId,
			kind,
			force: body.force === true,
		});
		const outcome: { submissionId: string; status: string; evaluation?: string } = {
			submissionId,
			status: result.status,
		};
		// A re-read overwrites the text the draft was made from. Regenerate (force,
		// which keeps the lecturer's review) when a draft already exists or when
		// asked, so a refresh never leaves a stale draft behind.
		if (result.status === 'refreshed' && body.regenerate !== false) {
			const hadDraft =
				body.regenerate === true ||
				(
					await pocketbaseAdmin.listRecords('ai_evaluations', {
						filter: `submission="${submissionId}"`,
						perPage: 1,
						fields: 'id',
					})
				).items.length > 0;
			if (!hadDraft) {
				outcomes.push(outcome);
				continue;
			}
			const queued = await queueEvaluationDraft({ assignment, submissionId, force: true });
			outcome.evaluation = queued.status;
		}
		outcomes.push(outcome);
	}

	return json({
		ok: true,
		processed: outcomes.length,
		remaining: Math.max(0, queue.length - outcomes.length),
		outcomes,
	});
});
