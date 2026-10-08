/**
 * POST /api/rubric-suggestions — generate provisional rubric-criterion
 * suggestions for a writing or speaking task, derived ONLY from the task's
 * own stored data, and persist them into the separate `suggestedCriteria`
 * field on the assignment.
 *
 * Faculty-only and ownership-verified, following the same auth pattern as
 * api.evaluation-draft.ts. The caller must be the lecturer who owns the
 * assignment and must have a verified email (the model call spends site
 * credits).
 *
 * SAFETY: suggestions are provisional and never touch `taskConfig.criteria`,
 * grading, the factors breakdown, the divergence warning, transcript
 * confidence, or any published score. Accepting/dismissing happens in the
 * editor and persists only the `suggestedCriteria` field (plus, on accept, a
 * new normal criterion inside `taskConfig`). This route never blocks saving
 * and never recomputes a grade. scoringVersion is not bumped.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { buildRubricSuggestions } from '@/lib/rubric-suggestions.server';
import { mergeGenerated, parseSuggestedCriteria, type SuggestedCriteria } from '@/lib/rubric-suggestions';
import { taskKindForShape } from '@/lib/task-types';
import type { Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { assignmentId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { pb, user } = auth;

	if (user.role !== 'faculty') {
		return apiError(403, 'Hanya dosen yang dapat meminta saran rubrik.');
	}
	// The model call spends site credits, so require a verified email — same
	// gate as the other AI generation routes.
	const record = pb.authStore.record as { verified?: boolean } | null;
	if (!record?.verified) {
		return apiError(403, 'Verifikasi email Anda sebelum memakai asisten AI.');
	}

	const body = await readJsonBody<Body>(request);
	const assignmentId = (body.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) {
		return apiError(422, 'assignmentId wajib dan harus valid.');
	}

	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}

	if (assignment.owner !== user.id) {
		return apiError(403, 'Hanya dosen pemilik yang dapat meminta saran rubrik.');
	}

	const kind = taskKindForShape(assignment.shape);
	if (kind !== 'writing' && kind !== 'speaking') {
		return apiError(422, 'Saran rubrik hanya tersedia untuk tugas Menulis atau Berbicara.');
	}

	const generated = await buildRubricSuggestions(assignment);
	const previous = parseSuggestedCriteria(assignment.suggestedCriteria);
	const merged: SuggestedCriteria = mergeGenerated(previous, generated);

	// Persist only the separate provisional field — never taskConfig, never a
	// grade. A failure here is non-fatal: the suggestions are still returned so
	// the lecturer can review them in-session; they simply won't survive a
	// reload until a later accept/dismiss persists them.
	try {
		await pb.collection('assignments').update(assignmentId, { suggestedCriteria: merged });
	} catch {
		/* non-fatal — see comment above */
	}

	return json({ suggestions: merged });
});
