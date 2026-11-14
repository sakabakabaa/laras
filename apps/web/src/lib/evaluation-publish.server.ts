/**
 * Shared publish logic for Tugas formal evaluations, used by both
 * /api/evaluation-publish (one submission, explicit lecturer confirmation in
 * the review panel) and /api/evaluation-publish-batch ("Terbitkan yang
 * siap"). Both routes therefore enforce exactly the same validation:
 *
 * - speaking submissions without a ready transcript cannot be graded;
 * - only final submissions (submitted / late / graded) can be published;
 * - findings are validated against the student's own text, and nothing
 *   publishes while AI findings are still pending;
 * - every weighted rubric criterion needs a 0–100 score, and without a
 *   weighted rubric the lecturer must give an explicit overall score;
 * - the score is recalculated server-side from the same rule the panel shows.
 *
 * The original student text and the AI draft's own columns are never
 * modified; the publish snapshot is kept on the `ai_evaluations` row and the
 * official grade/feedback is written to the submission.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { validateReviewFindings, type EvaluationTarget, type TargetError } from '@/lib/evaluation-review.server';
import {
	calculateRubricScores,
	countWords,
	CURRENT_SCORING_VERSION,
	isCountedFinding,
	rubricCriteriaOf,
} from '@/lib/evaluation-scoring';
import type { ReviewFinding } from '@/lib/ai-evaluation';

export type PublishBody = {
	criterionScores?: unknown;
	findings?: unknown;
	finalScore?: unknown;
	/** False when the score is the untouched AI-recommendation autofill. */
	scoreAdjusted?: unknown;
	note?: unknown;
};

export type PublishResult = {
	ok: true;
	finalScore: number;
	adjusted: boolean;
	publishedAt: string;
	omitted: number;
	divergence: { recommendedScore: number; detailScore: number } | null;
};

const SEVERITY_TEXT = { minor: 'Perlu perbaikan', major: 'Kesalahan berarti' } as const;

/** Composes the student-facing feedback from the published evaluation. */
export function composeFeedback(input: { findings: ReviewFinding[]; note: string }): string {
	const lines: string[] = [];
	const approved = input.findings.filter((f) => isCountedFinding(f.status) && f.note.trim());
	if (approved.length > 0) {
		lines.push('Saran perbaikan:');
		for (const finding of approved) {
			// Only cite the quote when it is a valid anchor in the student's
			// text — an invalid-anchor quote (anchorValid === false) is not in
			// the text and must not be shown to the student as if it were.
			const quote = finding.quote && finding.anchorValid !== false ? ` Pada teks: “${finding.quote}”.` : '';
			lines.push(`- ${SEVERITY_TEXT[finding.severity]}: ${finding.note}${quote}`);
		}
	}
	if (input.note) lines.push('', input.note);
	if (lines.length === 0) lines.push('Tidak ada catatan perbaikan khusus.');
	lines.push('', 'Dinilai dan dipublikasikan oleh dosen pengampu.');
	return lines.join('\n').slice(0, 5000);
}

/** Validates and publishes one evaluation. Returns an error instead of throwing on validation failures. */
export async function publishEvaluation(
	target: EvaluationTarget,
	body: PublishBody,
): Promise<{ error: TargetError } | PublishResult> {
	const fail = (message: string) => ({ error: { status: 422, message } });

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
		return fail(
			`Kiriman berbicara belum dapat dinilai. ${reason} Tunggu hingga transkripsi siap, atau minta peserta mengunggah ulang audio lalu transkripsi ulang.`,
		);
	}

	// Publishing is for final submissions only — drafts and revision requests
	// cannot be graded through this flow.
	if (!['submitted', 'late', 'graded'].includes(target.submissionStatus)) {
		return fail('Publikasi hanya untuk kiriman final — draf dan kiriman perlu revisi tidak dapat dinilai.');
	}

	const validated = validateReviewFindings(body.findings, target.content);
	if (!validated) {
		return fail('Daftar temuan tidak valid — catatan wajib diisi dan kutipan harus persis dari teks kiriman peserta.');
	}
	const { findings, omitted } = validated;
	// Nothing publishes while AI recommendations are still unreviewed.
	if (findings.some((f) => f.status === 'pending')) {
		return fail('Masih ada temuan AI yang belum ditinjau — setujui atau tolak setiap temuan AI sebelum mempublikasikan.');
	}

	// The score is recalculated server-side from the approved findings — the
	// exact same rule the lecturer sees in the review panel.
	const criteria = rubricCriteriaOf(target.assignment);
	const wordCount = countWords(target.content);
	const criterionScores =
		body.criterionScores && typeof body.criterionScores === 'object' && !Array.isArray(body.criterionScores)
			? (body.criterionScores as Record<string, number>)
			: {};
	if (
		criteria.some(
			(c) =>
				c.weight > 0 &&
				(typeof criterionScores[c.id] !== 'number' ||
					!Number.isFinite(criterionScores[c.id]) ||
					criterionScores[c.id] < 0 ||
					criterionScores[c.id] > 100),
		)
	)
		return fail('Nilai setiap kriteria berbobot sebelum menerbitkan.');
	if (!criteria.some((c) => c.weight > 0) && (typeof body.finalScore !== 'number' || body.scoreAdjusted !== true))
		return fail('Tanpa rubrik berbobot, isi nilai keseluruhan secara eksplisit.');
	const scores = calculateRubricScores(findings, criteria, { wordCount, criterionScores });
	let finalScore = scores.total;
	let adjusted = false;
	if (typeof body.finalScore === 'number' && Number.isFinite(body.finalScore)) {
		if (body.finalScore < 0 || body.finalScore > 100) return fail('Nilai akhir harus antara 0 dan 100.');
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
	const existing = (
		await pocketbaseAdmin.listRecords<{ id: string; recommendedScore: number | null }>('ai_evaluations', {
			perPage: 1,
			filter: `submission="${target.recordId}"`,
			sort: '-created',
		})
	).items[0];

	// Reconcile the model's recommendedScore with the detail score computed
	// from findings. The lecturer's explicit finalScore always wins; this only
	// surfaces a divergence warning (never auto-averages).
	const detailScore = scores.total;
	const recommendedScore = typeof existing?.recommendedScore === 'number' ? existing.recommendedScore : null;
	const divergence =
		recommendedScore != null && Math.abs(recommendedScore - detailScore) > 15 ? { recommendedScore, detailScore } : null;

	const publishPayload = {
		reviewDraft: { version: 1, finalScore: adjusted ? finalScore : null, note },
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
			submission: target.recordId,
			...publishPayload,
		});
	}

	// Publish to the student through the existing official grade/feedback
	// fields — the only channel students already read.
	await pocketbaseAdmin.updateRecord('assignment_submissions', target.recordId, {
		grade: finalScore,
		feedback,
		status: 'graded',
		gradedBy: target.user.id,
		gradedAt: now,
	});

	return { ok: true, finalScore, adjusted, publishedAt: now, omitted, divergence };
}
