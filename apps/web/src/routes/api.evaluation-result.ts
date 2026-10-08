/**
 * POST /api/evaluation-result — published recommendations for the student who
 * owns an enrolled submission. Returns notes and quoted passages only — never
 * numeric scores. Lecturer review state, grades, and the submission are not
 * changed.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { parseReviewFindings } from '@/lib/ai-evaluation';
import { isCountedFinding } from '@/lib/evaluation-scoring';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { submissionId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);

	const body = await readJsonBody<Body>(request);
	const submissionId = (body.submissionId || '').trim();
	if (!SAFE_ID.test(submissionId)) return apiError(422, 'ID kiriman wajib dan harus valid.');

	let owner = '';
	try {
		const row = await pocketbaseAdmin.getRecord<{ owner?: string }>('assignment_submissions', submissionId);
		owner = row.owner || '';
	} catch {
		return apiError(404, 'Kiriman tidak ditemukan.');
	}
	if (owner !== auth.user.id) return apiError(403, 'Hanya pemilik kiriman yang dapat melihat umpan balik ini.');

	let recommendations: { severity: 'minor' | 'major'; note: string; quote: string }[] = [];
	try {
		const evaluation = (
			await pocketbaseAdmin.listRecords<{
				publishedAt?: string;
				reviewFindings?: unknown;
			}>('ai_evaluations', {
				perPage: 1,
				filter: `submission="${submissionId}"`,
				sort: '-created',
			})
		).items[0];
		if (evaluation.publishedAt) {
			recommendations = parseReviewFindings(evaluation.reviewFindings)
				.filter((finding) => isCountedFinding(finding.status) && finding.note.trim())
				.map((finding) => ({
					severity: finding.severity,
					note: finding.note.trim(),
					quote: finding.quote.trim(),
				}));
		}
	} catch {
		recommendations = [];
	}

	return json({ recommendations });
});
