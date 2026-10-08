/**
 * Phase 3 (evaluasi dosen) — rubric score recalculation for Tugas formal.
 *
 * Pure helpers shared by the lecturer review UI and the server publish route,
 * so the score the lecturer sees is exactly the score the server publishes.
 *
 * Scoring v2 (proportional, capped, length-aware — mirrors formative-scoring):
 * The TOTAL uses a proportional capped model so several real errors on a long
 * answer cannot floor it at 0:
 *   - major: −12 per finding, capped at −60 total
 *   - minor: −3 per finding, capped at −18 total
 *   - length tolerance: longer answers tolerate a few errors
 *   - completion cap: near-empty answers (< 15 words) cannot score high
 *
 * Per-criterion rows stay informational at −20/−8 so the lecturer sees which
 * criterion is weak. General/unmapped findings (no rubric criterion match)
 * never vanish — they contribute to the total through the same proportional
 * pool and appear as a "general notes" row.
 *
 * Rule (transparent, deduction-only, never a guess): every rubric criterion
 * starts at 100; each APPROVED finding (AI approved/edited, or a
 * lecturer-made finding — rejected AI findings never count) reduces it by a
 * fixed penalty (major 20, minor 8), floored at 0. The calculated score is
 * the weighted average across criteria (equal weights when unset). Tasks
 * without stored rubric criteria use one overall deduction score from all
 * approved findings.
 */
import { parseSpeakingConfig, parseWritingConfig, taskKindForShape } from '@/lib/task-types';
import type { AssignmentShape } from '@/lib/assignments';

// ── Per-criterion penalties (informational rows) ──────────────────────────
export const RUBRIC_MAJOR_PENALTY = 20;
export const RUBRIC_MINOR_PENALTY = 8;

// ── Shared proportional penalty constants (total + formative) ─────────────
// Exported so formative-scoring.ts imports them — never duplicated.
export const MAJOR_PER_POINT = 12;
export const MAJOR_CAP = 60;
export const MINOR_PER_POINT = 3;
export const MINOR_CAP = 18;

// ── Shared length / completion bands ──────────────────────────────────────
export const LENGTH_TOLERANCE = [
	{ min: 120, tolerance: 8 },
	{ min: 60, tolerance: 4 },
] as const;
export const COMPLETION_CAP_WORDS = 15;
export const COMPLETION_CAP_SCORE = 45;

/** Words below this confidence are surfaced to the lecturer (advisory only). */
export const CONFIDENCE_LOW_THRESHOLD = 0.6;

/** Scoring version recorded on each published evaluation.
 * v3 = weight-sensitive proportional-capped total with a visible factor breakdown. */
export const CURRENT_SCORING_VERSION = 3;

export type RubricCriterion = { id: string; label: string; weight: number };

/** Findings that count toward the score: lecturer-approved or lecturer-made. */
export function isCountedFinding(status: string): boolean {
	return status === 'approved' || status === 'edited' || status === 'manual';
}

export function clampScore(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

/** Word count of the submitted text (0 when empty). */
export function countWords(text: string): number {
	const trimmed = (text || '').trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).length;
}

/** Rubric criteria stored on the assignment (Menulis / Berbicara shapes). */
export function rubricCriteriaOf(assignment: {
	shape?: string | null;
	taskConfig?: unknown;
}): RubricCriterion[] {
	const kind = taskKindForShape((assignment.shape || '') as AssignmentShape | '');
	if (kind === 'writing') return parseWritingConfig(assignment.taskConfig).criteria;
	if (kind === 'speaking') return parseSpeakingConfig(assignment.taskConfig).criteria;
	return [];
}

export type RubricScoreRow = {
	id: string;
	label: string;
	weight: number;
	major: number;
	minor: number;
	score: number;
};

/** General/unmapped findings row — never let a counted finding count for zero. */
export type RubricGeneralRow = {
	major: number;
	minor: number;
	/** Proportional penalty contribution of these general findings. */
	penalty: number;
};

/** One arithmetic step that affects the total, in evaluation order.
 * Mirrors `FormativeScoreFactor` so the formal and formative review panels
 * render the same shape. `impact` is the signed delta this step contributes
 * to the total; breakdown-only steps (per-criterion, general notes) carry 0
 * because their deduction is already captured in the major/minor penalty
 * factors. Summing every factor's impact (with caps/clamp applied) equals the
 * published total. */
export type ScoreFactor = { key: string; label: string; detail: string; impact: number };

export type RubricScores = {
	rows: RubricScoreRow[];
	/** Present when there are counted findings that match no rubric criterion. */
	general: RubricGeneralRow | null;
	total: number;
	hasRubric: boolean;
	/** Total proportional major penalty (capped) applied to the total. */
	majorPenalty: number;
	/** Total proportional minor penalty (capped) applied to the total. */
	minorPenalty: number;
	wordCount: number;
	lengthTolerance: number;
	completionCap: number;
	/** Every arithmetic step, in evaluation order. Derived from the exact
	 * computation that produces `total` — never recomputed separately. */
	factors: ScoreFactor[];
	/** One-line summary, e.g. "72/100 = 100 dasar · −24 merah · −12 kuning · +8 panjang". */
	rationale: string;
};

/** A speaking submission whose transcript is not ready cannot be graded yet —
 *  its content resolves to '' which would otherwise trip the completion cap.
 *  Pure so the publish route and the review UI share one check. */
export function speakingTranscriptUnavailable(
	shape: string,
	transcriptStatus: string,
): boolean {
	return taskKindForShape(shape as AssignmentShape | '') === 'speaking' && transcriptStatus !== 'ready';
}

type ScoringFinding = { severity: string; status: string; criterion?: string };

/**
 * Normalized comparison key: trim, casefold, collapse whitespace, strip
 * punctuation. Used so "Fluency / Kelancaran" and "fluency-kelancaran" match.
 */
function normalizeKey(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function matchesCriterion(value: string | undefined, criterion: RubricCriterion): boolean {
	if (!value) return false;
	const v = normalizeKey(value);
	if (!v) return false;
	return v === normalizeKey(criterion.id) || v === normalizeKey(criterion.label);
}

/** Resolves a stored criterion reference (id or label) to its canonical id. */
export function normalizeCriterionId(value: string | undefined, criteria: RubricCriterion[]): string {
	if (!value) return '';
	const v = normalizeKey(value);
	if (!v) return '';
	const match = criteria.find(
		(c) => v === normalizeKey(c.id) || v === normalizeKey(c.label),
	);
	return match ? match.id : '';
}

const STOPWORDS = new Set([
	'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'untuk', 'pada', 'dengan', 'dalam',
	'ini', 'itu', 'adalah', 'akan', 'tidak', 'juga', 'oleh', 'seperti', 'serta',
	'umum', 'memuat', 'serta', 'atau', 'maupun', 'sehingga', 'agar', 'karena',
	'the', 'and', 'or', 'for', 'with', 'this', 'that', 'from',
]);

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9äöüß\s]/gi, ' ')
		.split(/\s+/)
		.filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

/**
 * Best-effort automatic mapping of a finding to the rubric criterion it most
 * affects, using only the task's own stored criteria. Returns the criterion id
 * or '' when no meaningful overlap is found (the finding stays a general note).
 * Used as a fallback for drafts whose findings carry no criterion assignment.
 */
export function autoAssignCriterion(
	note: string,
	quote: string,
	criteria: RubricCriterion[],
): string {
	if (criteria.length === 0) return '';
	const text = `${note} ${quote}`.trim();
	if (!text) return '';
	const findingTokens = new Set(tokenize(text));
	if (findingTokens.size === 0) return '';
	let best: { id: string; score: number } | null = null;
	for (const criterion of criteria) {
		const cTokens = tokenize(criterion.label);
		if (cTokens.length === 0) continue;
		let score = 0;
		for (const token of cTokens) if (findingTokens.has(token)) score += 1;
		if (score === 0) continue;
		if (!best || score > best.score) best = { id: criterion.id, score };
	}
	return best ? best.id : '';
}

/** Format a penalty/tolerance number for the rationale line (int when clean). */
function fmt(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** First word of a criterion label, capitalised — compact factor label. */
function shortLabel(label: string): string {
	const text = label.trim().replace(/^jika dimasukkan,?\s*/i, '');
	const word = (text.split(/\s+/)[0] || text).replace(/[.,;:()]/g, '');
	return word ? word.charAt(0).toUpperCase() + word.slice(1) : label;
}

/**
 * Recalculates the rubric scores from the current findings.
 *
 * By default only confirmed findings count (approved/edited/lecturer-made) —
 * the rule the server publishes with. Pass `{ includePending: true }` for the
 * live review panel, where every non-rejected finding (pending AI
 * recommendations included) is reflected so the lecturer sees the provisional
 * impact immediately. Rejected AI findings never count in either mode.
 *
 * Scoring v3 (weight-sensitive proportional-capped):
 * - For each criterion, its findings' proportional penalty (major × 12,
 *   minor × 3) is scaled by `weight / avgWeight` so a heavily-weighted
 *   criterion hurts more than a lightly-weighted one. `avgWeight = weightSum /
 *   criteria.length`, so equal-weight rubrics scale by 1 and produce exactly
 *   the same total as the pre-weighting model — nothing regresses.
 * - General/unmapped findings get a synthetic weight equal to `avgWeight`
 *   (factor 1): they are neither over-penalised nor ignored.
 * - The caps (major 60, minor 18) apply to the TOTAL scaled penalty, so a
 *   long answer with many real errors still cannot floor at 0.
 * - Length tolerance and a completion cap still apply on top.
 * - Per-criterion rows stay informational at −20/−8 so the lecturer sees
 *   which criterion is weak; they do not move the total.
 * - `factors[]` records every arithmetic step (with a signed impact) and
 *   `rationale` summarises it. Both are derived from the exact computation
 *   that produces `total`: summing the factor impacts (then clamping) equals
 *   the published total, so the UI can never disagree with the score.
 */
export function calculateRubricScores(
	findings: ScoringFinding[],
	criteria: RubricCriterion[],
	options?: { includePending?: boolean; wordCount?: number },
): RubricScores {
	const counted = findings.filter((f) =>
		options?.includePending ? f.status !== 'rejected' : isCountedFinding(f.status),
	);
	const wordCount = Math.max(0, Math.round(options?.wordCount ?? 0));

	// Length tolerance — longer answers tolerate a few errors.
	let lengthTolerance = 0;
	let lengthBand = '';
	for (const band of LENGTH_TOLERANCE) {
		if (wordCount >= band.min) {
			lengthTolerance = band.tolerance;
			lengthBand = `≥ ${band.min} kata`;
			break;
		}
	}

	// Completion cap — a near-empty answer cannot score high.
	const completionCap = wordCount < COMPLETION_CAP_WORDS ? COMPLETION_CAP_SCORE : 100;

	// Weight setup. avgWeight normalises so equal weights scale by 1 (matching
	// the pre-weighting model); a criterion heavier than average scales > 1.
	const N = criteria.length;
	const weighted = criteria.map((c) => (c.weight > 0 ? c.weight : 1));
	const weightSum = weighted.reduce((s, w) => s + w, 0);
	const avgWeight = N > 0 ? weightSum / N : 1;

	// Per-criterion counts + scaled (pre-cap) contributions.
	type CriterionStat = {
		criterion: RubricCriterion;
		weight: number;
		factor: number;
		major: number;
		minor: number;
		majorContrib: number;
		minorContrib: number;
	};
	const stats: CriterionStat[] = criteria.map((criterion, i) => {
		const weight = weighted[i];
		const factor = weight / avgWeight;
		const assigned = counted.filter((f) => matchesCriterion(f.criterion, criterion));
		const major = assigned.filter((f) => f.severity === 'major').length;
		const minor = assigned.filter((f) => f.severity === 'minor').length;
		return {
			criterion,
			weight,
			factor,
			major,
			minor,
			majorContrib: major * MAJOR_PER_POINT * factor,
			minorContrib: minor * MINOR_PER_POINT * factor,
		};
	});

	// General findings (no criterion match). Synthetic weight = avgWeight →
	// factor 1, so they count exactly as they did before weighting.
	const generalFindings = counted.filter((f) => {
		if (N === 0) return true;
		if (!f.criterion || !f.criterion.trim()) return true;
		return !criteria.some((c) => matchesCriterion(f.criterion, c));
	});
	const generalMajor = generalFindings.filter((f) => f.severity === 'major').length;
	const generalMinor = generalFindings.filter((f) => f.severity === 'minor').length;
	const generalMajorContrib = generalMajor * MAJOR_PER_POINT;
	const generalMinorContrib = generalMinor * MINOR_PER_POINT;

	// Total scaled penalties, then the caps apply to the TOTAL.
	const rawMajorTotal =
		stats.reduce((s, st) => s + st.majorContrib, 0) + generalMajorContrib;
	const rawMinorTotal =
		stats.reduce((s, st) => s + st.minorContrib, 0) + generalMinorContrib;
	const majorPenalty = Math.min(MAJOR_CAP, rawMajorTotal);
	const minorPenalty = Math.min(MINOR_CAP, rawMinorTotal);

	const totalMajorCount = counted.filter((f) => f.severity === 'major').length;
	const totalMinorCount = counted.filter((f) => f.severity === 'minor').length;

	// ── Factors (every step, in evaluation order) ─────────────────────────
	const factors: ScoreFactor[] = [];
	factors.push({
		key: 'base',
		label: 'Skor dasar',
		detail: 'Skor awal 100 sebelum penalti dan toleransi.',
		impact: 100,
	});
	if (majorPenalty > 0) {
		factors.push({
			key: 'major',
			label: 'Penalti merah (tertimbang)',
			detail: `${totalMajorCount} temuan merah × ${MAJOR_PER_POINT} (dibobotkan per kriteria), dibatasi ${MAJOR_CAP}.`,
			impact: -majorPenalty,
		});
	}
	if (minorPenalty > 0) {
		factors.push({
			key: 'minor',
			label: 'Penalti kuning (tertimbang)',
			detail: `${totalMinorCount} temuan kuning × ${MINOR_PER_POINT} (dibobotkan per kriteria), dibatasi ${MINOR_CAP}.`,
			impact: -minorPenalty,
		});
	}
	if (lengthTolerance > 0) {
		factors.push({
			key: 'length',
			label: 'Toleransi panjang jawaban',
			detail: `${wordCount} kata — ${lengthBand} → +${lengthTolerance} poin.`,
			impact: lengthTolerance,
		});
	}

	const rawBeforeCompletion = 100 - majorPenalty - minorPenalty + lengthTolerance;
	// Completion cap is a CEILING: when it binds, its impact is the negative
	// delta to the capped value (not 0, so the cap is visible and the factor
	// identity holds).
	const completionImpact = Math.min(0, completionCap - rawBeforeCompletion);
	if (completionCap < 100) {
		factors.push({
			key: 'completion',
			label: 'Batas kelengkapan',
			detail: `Jawaban sangat singkat (${wordCount} kata) — skor dibatasi maks ${completionCap}.`,
			impact: completionImpact,
		});
	}

	// Per-criterion breakdown factors (impact 0 — their deduction already lives
	// in the major/minor penalty factors above; these show how it was distributed).
	for (const st of stats) {
		if (st.major === 0 && st.minor === 0) continue;
		const contrib = st.majorContrib + st.minorContrib;
		factors.push({
			key: `criterion-${st.criterion.id}`,
			label: `Kriteria: ${shortLabel(st.criterion.label)}`,
			detail: `Bobot ${st.weight}/${weightSum} (faktor ${fmt(st.factor)}) · ${st.major} merah × ${MAJOR_PER_POINT} + ${st.minor} kuning × ${MINOR_PER_POINT} = kontribusi ${fmt(contrib)} (sudah termasuk di penalti merah/kuning).`,
			impact: 0,
		});
	}

	// General-notes breakdown factor (impact 0 — included in the penalties above).
	if (generalMajor > 0 || generalMinor > 0) {
		const contrib = generalMajorContrib + generalMinorContrib;
		factors.push({
			key: 'general',
			label: 'Catatan umum (tidak terpetakan ke kriteria)',
			detail: `${generalMajor} merah · ${generalMinor} kuning · kontribusi ${fmt(contrib)} (faktor 1, sudah termasuk di penalti).`,
			impact: 0,
		});
	}

	const total = clampScore(Math.min(completionCap, rawBeforeCompletion));

	// Rationale — derived from the same values, never recomputed.
	const parts = ['100 dasar'];
	if (majorPenalty > 0) parts.push(`−${fmt(majorPenalty)} merah`);
	if (minorPenalty > 0) parts.push(`−${fmt(minorPenalty)} kuning`);
	if (lengthTolerance > 0) parts.push(`+${lengthTolerance} panjang`);
	if (completionImpact < 0) parts.push(`dibatasi ${completionCap}`);
	const rationale = `${total}/100 = ${parts.join(' · ')}.`;

	// Per-criterion rows (informational, −20/−8 per criterion — unchanged).
	const rows: RubricScoreRow[] = stats.map((st) => ({
		id: st.criterion.id,
		label: st.criterion.label,
		weight: st.weight,
		major: st.major,
		minor: st.minor,
		score: clampScore(
			100 - st.major * RUBRIC_MAJOR_PENALTY - st.minor * RUBRIC_MINOR_PENALTY,
		),
	}));

	const general = generalMajor > 0 || generalMinor > 0
		? {
				major: generalMajor,
				minor: generalMinor,
				// Raw general contribution (factor 1); the cap is applied to the
				// total, so this is what general findings added before the total cap.
				penalty: generalMajorContrib + generalMinorContrib,
			}
		: null;

	return {
		rows,
		general,
		total,
		hasRubric: N > 0,
		majorPenalty,
		minorPenalty,
		wordCount,
		lengthTolerance,
		completionCap,
		factors,
		rationale,
	};
}
