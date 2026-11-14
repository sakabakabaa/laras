/**
 * POST /api/evaluation-publish-batch — "Terbitkan yang siap": publish every
 * ungraded Tugas formal submission whose evaluation is ready, after the
 * lecturer confirmed the batch in the evaluation workspace.
 *
 * Readiness is recomputed SERVER-SIDE from the stored evaluation rows with
 * the same rule the participant list shows (`summarizeEvaluation`): an AI
 * draft or a lecturer draft with every weighted criterion scored (lecturer
 * drafts additionally without pending AI findings). For AI drafts the
 * lecturer's choice of this batch action approves the pending AI findings —
 * the confirm dialog states this explicitly. Each ready submission is then
 * published through the exact same shared logic as /api/evaluation-publish
 * (`publishEvaluation`), so every single-publish validation still applies;
 * failures are reported per item and never stop the rest of the batch.
 *
 * Permission: only the lecturer who owns the assignment (same rule as the
 * single publish route, checked once for the assignment and again per item).
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { loadEvaluationTargetForUser } from '@/lib/evaluation-review.server';
import { publishEvaluation } from '@/lib/evaluation-publish.server';
import { EVALUATION_SUMMARY_FIELDS, summarizeEvaluation, type BatchPublishItem, type EvaluationRowLike } from '@/lib/evaluation-readiness';
import { STALE_SUBMISSION_FIELDS, staleFlagFor } from '@/lib/ai-evaluation-stale.server';
import { activityTypeOf, type Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;
const MAX_BATCH = 300;

type Body = { assignmentId?: string; submissionIds?: unknown };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { user } = auth;
	if (user.role !== 'faculty') return apiError(403, 'Hanya dosen yang dapat menerbitkan nilai.');

	const body = await readJsonBody<Body>(request);
	const assignmentId = (body.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) return apiError(422, 'ID tugas wajib dan harus valid.');
	const only = Array.isArray(body.submissionIds)
		? new Set(body.submissionIds.filter((id): id is string => typeof id === 'string' && SAFE_ID.test(id)))
		: null;

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.owner !== user.id) return apiError(403, 'Hanya dosen pemilik tugas yang dapat menerbitkan nilai.');
	if (activityTypeOf(assignment) === 'formative') return apiError(422, 'Evaluasi hanya berlaku untuk Tugas formal.');

	const submissions = (
		await pocketbaseAdmin.listRecords<{ id: string; status: string; transcriptStatus?: string; content?: string; files?: string[]; transcript?: string; updated?: string }>('assignment_submissions', {
			filter: `assignment="${assignmentId}" && (status="submitted" || status="late")`,
			perPage: 1000,
			fields: STALE_SUBMISSION_FIELDS,
		})
	).items.filter((s) => !only || only.has(s.id));
	if (submissions.length > MAX_BATCH) return apiError(422, `Maksimal ${MAX_BATCH} kiriman per penerbitan.`);

	const rows = (
		await pocketbaseAdmin.listRecords<EvaluationRowLike & { submission: string }>('ai_evaluations', {
			filter: `assignment="${assignmentId}"`,
			perPage: 1000,
			sort: '-created',
			fields: EVALUATION_SUMMARY_FIELDS,
		})
	).items;
	const latest = new Map<string, EvaluationRowLike>();
	for (const row of rows) if (!latest.has(row.submission)) latest.set(row.submission, row);

	const results: BatchPublishItem[] = [];
	let skipped = 0;
	for (const submission of submissions) {
		const summary = summarizeEvaluation({
			assignment,
			submission,
			row: latest.get(submission.id),
			stale: staleFlagFor({ assignment, submission, row: latest.get(submission.id) }),
		});
		if (!summary.ready || !summary.publish) {
			// Only report items the lecturer explicitly asked for; the rest are simply not ready yet.
			if (only) results.push({ submissionId: submission.id, ok: false, error: summary.blocker });
			else skipped++;
			continue;
		}
		try {
			const loaded = await loadEvaluationTargetForUser({ id: user.id, role: user.role }, submission.id);
			if ('error' in loaded) {
				results.push({ submissionId: submission.id, ok: false, error: loaded.error.message });
				continue;
			}
			const published = await publishEvaluation(loaded.target, summary.publish);
			if ('error' in published) results.push({ submissionId: submission.id, ok: false, error: published.error.message });
			else results.push({ submissionId: submission.id, ok: true, finalScore: published.finalScore });
		} catch {
			results.push({ submissionId: submission.id, ok: false, error: 'Gagal menerbitkan kiriman ini.' });
		}
	}

	return json({
		ok: true,
		published: results.filter((r) => r.ok).length,
		failed: results.filter((r) => !r.ok).length,
		skipped,
		results,
	});
});
