/**
 * POST /api/evaluation-publish — Phase 3: explicit lecturer confirmation and
 * publishing of a Tugas formal evaluation.
 *
 * Recalculates the rubric scores SERVER-SIDE from the findings the lecturer
 * approved (or created) and assigned to rubric criteria — rejected AI
 * findings never count — applies the lecturer's optional manual override
 * (visibly recorded as "disesuaikan dosen"), and only then publishes: the
 * final grade, rubric breakdown, approved finding notes, and the lecturer's
 * note are written to the submission's existing official grade/feedback
 * fields and the submission is marked as graded.
 *
 * Nothing publishes before this explicit confirmation. The original student
 * text is never modified, the AI draft's own columns stay untouched, and the
 * full reviewed finding history (with authorship) is retained on the
 * `ai_evaluations` row together with the publish snapshot (rubricScores,
 * finalScore, scoreAdjusted, publishedAt).
 *
 * Permission: only the lecturer who owns the assignment; Tugas formal only.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { loadEvaluationTarget, validateReviewFindings } from '@/lib/evaluation-review.server';
import {
	calculateRubricScores,
	countWords,
	CURRENT_SCORING_VERSION,
	isCountedFinding,
	rubricCriteriaOf,
} from '@/lib/evaluation-scoring';
import type { ReviewFinding } from '@/lib/ai-evaluation';

type Body = {
    criterionScores?: unknown;
	submissionId?: string;
	publicSubmissionId?: string;
	findings?: unknown;
	finalScore?: unknown;
	/** False when the score is the untouched AI-recommendation autofill. */
	scoreAdjusted?: unknown;
	note?: unknown;
};

const SEVERITY_TEXT = { minor: 'Perlu perbaikan', major: 'Kesalahan berarti' } as const;

/** Composes the student-facing feedback from the published evaluation. */
function composeFeedback(input: {
	findings: ReviewFinding[];
	note: string;
}): string {
	const lines: string[] = [];
	const approved = input.findings.filter((f) => isCountedFinding(f.status) && f.note.trim());
	if (approved.length > 0) {
		lines.push('Saran perbaikan:');
		for (const finding of approved) {
			// Only cite the quote when it is a valid anchor in the student's
			// text — an invalid-anchor quote (anchorValid === false) is not in
			// the text and must not be shown to the student as if it were.
			const quote =
				finding.quote && finding.anchorValid !== false
					? ` Pada teks: “${finding.quote}”.`
					: '';
			lines.push(`- ${SEVERITY_TEXT[finding.severity]}: ${finding.note}${quote}`);
		}
	}
	if (input.note) lines.push('', input.note);
	if (lines.length === 0) lines.push('Tidak ada catatan perbaikan khusus.');
	lines.push('', 'Dinilai dan dipublikasikan oleh dosen pengampu.');
	return lines.join('\n').slice(0, 5000);
}

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const loaded = await loadEvaluationTarget(request, body);
	if ('error' in loaded) return apiError(loaded.error.status, loaded.error.message);
	const { target } = loaded;

	// Speaking submissions whose transcript is not ready cannot be graded yet —
	// their content resolves to '' which would otherwise trip the completion cap
	// and reject every quoted finding. Block explicitly rather than degrading.
	if (target.ungradable) {
		const reason =
			target.transcriptStatus === 'failed'
				? `Transkripsi gagal${target.transcriptError ? `: ${target.transcriptError}` : ''}.`
				: target.transcriptStatus === 'processing' || target.transcriptStatus === 'pending'
					? 'Transkripsi masih diproses.'
					: 'Transkripsi belum tersedia.';
		return apiError(
			422,
			`Kiriman berbicara belum dapat dinilai. ${reason} Tunggu hingga transkripsi siap, atau minta peserta mengunggah ulang audio lalu transkripsi ulang.`,
		);
	}

	// Publishing is for final submissions only — drafts and revision requests
	// cannot be graded through this flow.
	if (!['submitted', 'late', 'graded'].includes(target.submissionStatus)) {
		return apiError(
			422,
			'Publikasi hanya untuk kiriman final — draf dan kiriman perlu revisi tidak dapat dinilai.',
		);
	}

	const validated = validateReviewFindings(body.findings, target.content);
	if (!validated) {
		return apiError(
			422,
			'Daftar temuan tidak valid — catatan wajib diisi dan kutipan harus persis dari teks kiriman peserta.',
		);
	}
	const { findings, omitted } = validated;
	// Nothing publishes while AI recommendations are still unreviewed.
	if (findings.some((f) => f.status === 'pending')) {
		return apiError(
			422,
			'Masih ada temuan AI yang belum ditinjau — setujui atau tolak setiap temuan AI sebelum mempublikasikan.',
		);
	}

	// The score is recalculated server-side from the approved findings — the
	// exact same rule the lecturer sees in the review panel.
	const criteria = rubricCriteriaOf(target.assignment);
	const wordCount = countWords(target.content);
    const criterionScores = body.criterionScores && typeof body.criterionScores === 'object' && !Array.isArray(body.criterionScores) ? body.criterionScores as Record<string, number> : {};
    if (criteria.some(c => c.weight > 0 && (typeof criterionScores[c.id] !== 'number' || !Number.isFinite(criterionScores[c.id]) || criterionScores[c.id] < 0 || criterionScores[c.id] > 100)))
        return apiError(422, 'Nilai setiap kriteria berbobot sebelum menerbitkan.');
    if (!criteria.some(c => c.weight > 0) && (typeof body.finalScore !== 'number' || body.scoreAdjusted !== true))
        return apiError(422, 'Tanpa rubrik berbobot, isi nilai keseluruhan secara eksplisit.');
    const scores = calculateRubricScores(findings, criteria, { wordCount, criterionScores });
	let finalScore = scores.total;
	let adjusted = false;
	if (typeof body.finalScore === 'number' && Number.isFinite(body.finalScore)) {
		if (body.finalScore < 0 || body.finalScore > 100) {
			return apiError(422, 'Nilai akhir harus antara 0 dan 100.');
		}
		finalScore = Math.round(body.finalScore);
		// An untouched AI-recommendation autofill is not a lecturer adjustment;
		// the client marks explicit lecturer adjustments with scoreAdjusted.
		adjusted = body.scoreAdjusted !== false;
	}
	const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
	const feedback = composeFeedback({ findings, note });
	const now = new Date().toISOString();

	// Retain the review + publish snapshot on the evaluation row. The AI
	// draft's own columns (findings, recommendedScore, rubricBreakdown,
	// citations) are never touched.
	const relationField = target.channel === 'enrolled' ? 'submission' : 'publicSubmission';
	const existing = (
		await pocketbaseAdmin.listRecords<{ id: string; recommendedScore: number | null }>(
			'ai_evaluations',
			{
				perPage: 1,
				filter: `${relationField}="${target.recordId}"`,
				sort: '-created',
			},
		)
	).items[0];

	// Step 4 — reconcile the model's recommendedScore with the detail score
	// computed from findings. The lecturer's explicit finalScore always wins;
	// this only surfaces a divergence warning (never auto-averages).
	const detailScore = scores.total;
	const recommendedScore =
		typeof existing?.recommendedScore === 'number' ? existing.recommendedScore : null;
	const divergence =
		recommendedScore != null && Math.abs(recommendedScore - detailScore) > 15
			? { recommendedScore, detailScore }
			: null;

    const publishPayload = {
        reviewCriterionScores: criterionScores,
		reviewFindings: findings,
		reviewedAt: now,
		rubricScores: scores,
		finalScore,
		scoreAdjusted: adjusted,
		publishedAt: now,
		scoringVersion: CURRENT_SCORING_VERSION,
	};
	if (existing) {
		await pocketbaseAdmin.updateRecord('ai_evaluations', existing.id, publishPayload);
	} else {
		await pocketbaseAdmin.createRecord('ai_evaluations', {
			assignment: target.assignment.id,
			owner: target.assignment.owner,
			status: 'ready',
			result: '',
			reason: '',
			findings: [],
			summary: '',
			generatedAt: now,
			...(target.channel === 'enrolled'
				? { submission: target.recordId, publicSubmission: '' }
				: { submission: '', publicSubmission: target.recordId }),
			...publishPayload,
		});
	}

	// Publish to the student through the existing official grade/feedback
	// fields — the only channel enrolled and public participants already read.
	const collection =
		target.channel === 'enrolled' ? 'assignment_submissions' : 'public_submissions';
	await pocketbaseAdmin.updateRecord(collection, target.recordId, {
		grade: finalScore,
		feedback,
		status: 'graded',
		...(target.channel === 'enrolled'
			? { gradedBy: target.user.id, gradedAt: now }
			: {}),
	});

	return json({ ok: true, finalScore, adjusted, publishedAt: now, omitted, divergence });
});
