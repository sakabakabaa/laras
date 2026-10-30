/**
 * POST /api/evaluation-missed-error — Phase 4: create a lecturer-annotated
 * missed error (AI false negative) for a Tugas formal submission.
 * DELETE — remove a missed-error annotation (owner only).
 *
 * The record is lecturer-only research metadata stored in `ai_feedback_items`
 * with `origin = 'human'` and `detectionJudgment = 'missed'`. It is never an
 * AI finding, never affects the product score, grade, feedback, or
 * publishing, and is never visible to students (owner-only reads, server-only
 * writes). Permission: only the lecturer who owns the assignment; Tugas formal
 * only.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import {
	deleteMissedErrorAnnotation,
	saveMissedErrorAnnotation,
	type MissedErrorBody,
} from '@/lib/evaluation-annotation.server';

export const action = withApi(async ({ request }) => {
	if (request.method === 'DELETE') {
		const body = await readJsonBody<{ id?: unknown; submissionId?: unknown; publicSubmissionId?: unknown; round?: unknown }>(request);
		const id = typeof body.id === 'string' ? body.id : '';
		if (!id) return apiError(422, 'id wajib.');
		const result = await deleteMissedErrorAnnotation(request, id, body);
		if ('error' in result) return apiError(result.error.status, result.error.message);
		return json({ ok: true });
	}

	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<MissedErrorBody>(request);
	const result = await saveMissedErrorAnnotation(request, body);
	if ('error' in result) return apiError(result.error.status, result.error.message);

	return json({ ok: true, id: result.id });
});
