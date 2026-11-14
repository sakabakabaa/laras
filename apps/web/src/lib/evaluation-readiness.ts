/**
 * Per-submission AI/grading summary for the Tugas evaluation list and the
 * "Terbitkan yang siap" batch action.
 *
 * Pure and client-safe: the participants route computes the summary for the
 * list, and the batch publish route recomputes it server-side (never trusting
 * the client) and publishes through the same shared publish logic as the
 * single-submission route. The working copy derived here mirrors what the
 * lecturer sees when opening the submission in the review panel: the saved
 * review when there is one, otherwise the AI recommendations.
 */
import { aiScoreNotice, SETUP_NOTICE_TEXT, type AiScoreNotice } from '@/lib/evaluation-setup';
import { matchCriterion, validatedRubric } from '@/lib/evaluation-rubric';
import { parseAssessmentDraft } from '@/lib/assessment-draft';
import {
	deriveAiReviewFindings,
	normalizeReviewFindings,
	parseFindings,
	parseReviewFindings,
	parseRubric,
	type ReviewFinding,
} from '@/lib/ai-evaluation';
import {
	calculateRubricScores,
	rubricCriteriaOf,
	speakingTranscriptUnavailable,
	type RubricCriterion,
	type RubricScores,
} from '@/lib/evaluation-scoring';

/** The ai_evaluations columns the summary needs (a subset of AiEvaluationRow). */
export type EvaluationRowLike = {
	status?: string;
	findings?: unknown;
	reviewFindings?: unknown;
	reviewCriterionScores?: Record<string, number> | null;
	reviewDraft?: unknown;
	reviewedAt?: string;
	rubricBreakdown?: unknown;
	rubricScores?: unknown;
	scoringVersion?: number | null;
	recommendedScore?: number | null;
	publishedAt?: string;
	finalScore?: number | null;
	summary?: string;
	result?: string;
	inputTextHash?: string;
	generatedAt?: string | null;
};

/** PocketBase `fields` list for loading only what the summary needs (skips generation history). */
export const EVALUATION_SUMMARY_FIELDS =
	'id,submission,status,findings,reviewFindings,reviewCriterionScores,reviewDraft,reviewedAt,rubricBreakdown,rubricScores,scoringVersion,recommendedScore,publishedAt,finalScore,summary,result,inputTextHash,generatedAt';

export type EvaluationAiState = 'none' | 'pending' | 'failed' | 'ai' | 'lecturer' | 'published';

export type EvaluationAiSummary = {
	state: EvaluationAiState;
	/** Rubric total of the draft (or the model's recommendation) — null when not computable. */
	score: number | null;
	/** True when the submission can be published by "Terbitkan yang siap". */
	ready: boolean;
	/** Why it is not ready (Indonesian, lecturer-facing). Empty when ready. */
	blocker: string;
	/** AI findings still waiting for review in the working copy. */
	pendingFindings: number;
	/** The draft was generated from text that differs from the current submission text. */
	stale: boolean;
	/** Why no real AI score exists (setup gap or suspicious 0); null when the score is usable. */
	scoreNotice: AiScoreNotice;
};

export type PublishInput = {
	findings: ReviewFinding[];
	criterionScores: Record<string, number>;
	finalScore: number | null;
	scoreAdjusted: boolean;
	note: string;
};

/** One per-submission outcome of /api/evaluation-publish-batch. */
export type BatchPublishItem = { submissionId: string; ok: boolean; finalScore?: number; error?: string };

type SubmissionLike = { status?: string; transcriptStatus?: string };

/** The rubric scores the review panel starts from (saved review → v4 snapshot → AI rubric). */
export function initialCriterionScores(row: EvaluationRowLike, criteria: RubricCriterion[]): Record<string, number> {
	if (row.reviewedAt || (row.reviewCriterionScores && Object.keys(row.reviewCriterionScores).length)) {
		return { ...(row.reviewCriterionScores || {}) };
	}
	if (row.scoringVersion === 4 && row.rubricScores && typeof row.rubricScores === 'object') {
		return Object.fromEntries(((row.rubricScores as RubricScores).rows || []).map((entry) => [entry.id, entry.score]));
	}
	if (row.status !== 'ready') return {};
	return Object.fromEntries(
		validatedRubric(parseRubric(row.rubricBreakdown), criteria).map((entry) => [matchCriterion(entry, criteria)!.id!, entry.score]),
	);
}

/** The findings working copy the review panel starts from. */
export function initialReviewFindings(row: EvaluationRowLike, criteria: RubricCriterion[]): ReviewFinding[] {
	const saved = normalizeReviewFindings(parseReviewFindings(row.reviewFindings), criteria);
	if (row.reviewedAt || saved.length > 0) return saved;
	return row.status === 'ready' ? deriveAiReviewFindings(parseFindings(row.findings), criteria) : [];
}

function weightedComplete(criteria: RubricCriterion[], scores: Record<string, number>) {
	const weighted = criteria.filter((c) => c.weight > 0);
	return weighted.length > 0 && weighted.every((c) => typeof scores[c.id] === 'number' && Number.isFinite(scores[c.id]));
}

/**
 * Summarizes one submission's evaluation for the list and decides whether
 * the batch action may publish it. When `ready`, `publish` holds the exact
 * body the shared publish logic receives. AI drafts the lecturer never
 * reviewed have their pending AI findings approved — choosing the batch
 * action is that approval, and the confirm dialog says so. A lecturer draft
 * with findings still pending is never published in bulk.
 */
export function summarizeEvaluation(input: {
	assignment: { shape?: string | null; taskConfig?: unknown };
	submission: SubmissionLike;
	row: EvaluationRowLike | null | undefined;
	/** Computed server-side (ai-evaluation-stale.server); default false. */
	stale?: boolean;
}): EvaluationAiSummary & { publish: PublishInput | null } {
	const { assignment, submission, row } = input;
	const stale = Boolean(input.stale);
	const criteria = rubricCriteriaOf(assignment);
	const scoreNotice = row
		? aiScoreNotice({ assignment, recommendedScore: row.recommendedScore, summary: row.summary, reviewed: Boolean(row.reviewedAt) })
		: null;
	const notReady = (state: EvaluationAiState, blocker: string, score: number | null = null, pendingFindings = 0) => ({
		state,
		score,
		ready: false,
		blocker,
		pendingFindings,
		stale,
		scoreNotice,
		publish: null,
	});
	if (!row || !row.status) return notReady('none', 'Belum ada draf AI.');
	if (row.publishedAt && submission.status === 'graded') {
		return notReady('published', 'Sudah diterbitkan.', typeof row.finalScore === 'number' ? row.finalScore : null);
	}
	const reviewed = Boolean(row.reviewedAt);
	if (!reviewed && row.status === 'pending') return notReady('pending', 'Draf AI masih disiapkan.');
	if (!reviewed && row.status === 'failed') return notReady('failed', 'Draf AI gagal.');

	const state: EvaluationAiState = reviewed ? 'lecturer' : 'ai';
	const findings = initialReviewFindings(row, criteria);
	const criterionScores = initialCriterionScores(row, criteria);
	const pendingFindings = findings.filter((f) => f.status === 'pending').length;
	const draft = parseAssessmentDraft(row.reviewDraft);
	const hasWeighted = criteria.some((c) => c.weight > 0);
	const complete = weightedComplete(criteria, criterionScores);
	const total = complete ? calculateRubricScores(findings, criteria, { criterionScores, includePending: true }).total : null;
	const score = draft?.finalScore ?? total ?? (typeof row.recommendedScore === 'number' ? row.recommendedScore : null);

	if (submission.status !== 'submitted' && submission.status !== 'late') {
		return notReady(state, 'Hanya kiriman final yang belum dinilai.', score, pendingFindings);
	}
	if (speakingTranscriptUnavailable(assignment.shape || '', submission.transcriptStatus || '')) {
		return notReady(state, 'Transkripsi belum siap.', score, pendingFindings);
	}
	if (stale) return notReady(state, 'Teks berubah setelah draf AI dibuat. Buat ulang draf AI.', score, pendingFindings);
	if (!reviewed && draft?.finalScore == null && scoreNotice) {
		return notReady(
			state,
			scoreNotice.kind === 'setup' ? SETUP_NOTICE_TEXT(scoreNotice.reason) : 'Skor AI 0 perlu dicek dosen.',
			score,
			pendingFindings,
		);
	}
	if (reviewed && pendingFindings > 0) {
		return notReady(state, 'Draf dosen masih memiliki temuan AI yang belum ditinjau.', score, pendingFindings);
	}
	if (hasWeighted && !complete) return notReady(state, 'Belum semua kriteria berbobot dinilai.', score, pendingFindings);
	if (!hasWeighted && draft?.finalScore == null) {
		return notReady(state, 'Tanpa rubrik berbobot, nilai keseluruhan harus diisi dosen.', score, pendingFindings);
	}
	const approved = findings.map((f) => (f.status === 'pending' ? { ...f, status: 'approved' as const, rejectReason: '' } : f));
	const note = draft ? draft.note : (row.summary || '').slice(0, 2000);
	return {
		state,
		score,
		ready: true,
		blocker: '',
		pendingFindings,
		stale,
		scoreNotice,
		publish: {
			findings: approved,
			criterionScores,
			finalScore: draft?.finalScore ?? null,
			scoreAdjusted: draft?.finalScore != null,
			note,
		},
	};
}

/** Compact list label for a submission's AI/grading state ('' when nothing to show). */
export function aiStateLabel(summary: Pick<EvaluationAiSummary, 'state' | 'score'> & { stale?: boolean; scoreNotice?: AiScoreNotice } | null | undefined): string {
	if (!summary) return '';
	if (summary.stale && (summary.state === 'ai' || summary.state === 'lecturer')) return 'AI usang';
	switch (summary.state) {
		case 'pending':
			return 'AI…';
		case 'failed':
			return 'AI gagal';
		case 'lecturer':
			return 'Draf dosen';
		case 'ai':
			if (summary.scoreNotice) return summary.scoreNotice.kind === 'setup' ? 'Skor AI tidak dihitung' : 'AI 0 dicek';
			return summary.score == null ? 'Draf AI' : `AI ${summary.score}`;
		default:
			return '';
	}
}
