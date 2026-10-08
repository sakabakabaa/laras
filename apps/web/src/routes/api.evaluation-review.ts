/**
 * POST /api/evaluation-review — save the lecturer's reviewed and edited
 * findings for one Tugas formal submission (Phase 2; Phase 3 adds the
 * optional rubric-criterion assignment per finding).
 *
 * The lecturer's working copy (AI findings approved / rejected / edited,
 * plus manually created inline findings) is stored in the existing
 * `ai_evaluations` row's `reviewFindings` column. The AI draft's own
 * `findings` column is never modified, the original student text is never
 * altered, and no grade, feedback, submission status, or publishing changes
 * here — publishing happens only through /api/evaluation-publish after
 * explicit lecturer confirmation.
 *
 * Permission: only the lecturer who owns the assignment. Every quote must
 * be an exact substring of the student's own submitted text — anything the
 * client invented or paraphrased is rejected, never guessed into storage.
 * Latihan formatif is rejected (no findings review for practice activities).
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { loadEvaluationTarget, validateReviewFindings } from '@/lib/evaluation-review.server';

type Body = {
	submissionId?: string;
	publicSubmissionId?: string;
	findings?: unknown;
};

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const loaded = await loadEvaluationTarget(request, body);
	if ('error' in loaded) return apiError(loaded.error.status, loaded.error.message);
	const { target } = loaded;

	const validated = validateReviewFindings(body.findings, target.content);
	if (!validated) {
		return apiError(
			422,
			'Daftar temuan tidak valid — catatan wajib diisi dan kutipan harus persis dari teks kiriman peserta.',
		);
	}
	const { findings, omitted } = validated;

	const relationField = target.channel === 'enrolled' ? 'submission' : 'publicSubmission';
	const now = new Date().toISOString();

	const existing = (
		await pocketbaseAdmin.listRecords<{ id: string }>('ai_evaluations', {
			perPage: 1,
			filter: `${relationField}="${target.recordId}"`,
			sort: '-created',
		})
	).items[0];

	if (existing) {
		// Only the lecturer's review columns change — the AI draft's own
		// findings, score, and citations stay exactly as they were.
		await pocketbaseAdmin.updateRecord('ai_evaluations', existing.id, {
			reviewFindings: findings,
			reviewedAt: now,
		});
		return json({ ok: true, saved: findings.length, omitted });
	}

	// No AI draft row yet (the lecturer marked manually before the background
	// draft landed): create the row so the review is preserved. The AI draft's
	// own columns stay empty — nothing is invented, and the draft generation
	// state is never faked as an AI analysis.
	await pocketbaseAdmin.createRecord('ai_evaluations', {
		assignment: target.assignment.id,
		owner: target.assignment.owner,
		status: 'ready',
		result: '',
		reason: '',
		findings: [],
		summary: '',
		reviewFindings: findings,
		reviewedAt: now,
		generatedAt: now,
		...(target.channel === 'enrolled'
			? { submission: target.recordId, publicSubmission: '' }
			: { submission: '', publicSubmission: target.recordId }),
	});
	return json({ ok: true, saved: findings.length, omitted });
});
