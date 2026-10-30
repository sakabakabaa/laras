/** Formal scoring v4: explicit achievement scores per criterion, weighted to 100. Error findings provide evidence and never add automatic deductions. Legacy constants remain for the separate formative scorer. */
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
export const CURRENT_SCORING_VERSION = 4;

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

export function calculateRubricScores(
    findings: ScoringFinding[],
    criteria: RubricCriterion[],
    options?: { includePending?: boolean; wordCount?: number; criterionScores?: Record<string, number> },
): RubricScores {
    const counted = findings.filter(f => options?.includePending ? f.status !== 'rejected' : isCountedFinding(f.status));
    const rows = criteria.map(c => {
        const assigned = counted.filter(f => matchesCriterion(f.criterion, c));
        const major = assigned.filter(f => f.severity === 'major').length;
        const minor = assigned.filter(f => f.severity === 'minor').length;
        const explicit = options?.criterionScores?.[c.id];
        return { ...c, major, minor, score: typeof explicit === 'number' && Number.isFinite(explicit) ? clampScore(explicit) : 0 };
    });
    const weightSum = rows.reduce((sum,r) => sum + Math.max(0,r.weight),0);
    const weighted = weightSum > 0 ? rows.reduce((sum,r) => sum + r.score * Math.max(0,r.weight),0) / weightSum : 0;
    const generalFindings = counted.filter(f => !criteria.some(c => matchesCriterion(f.criterion,c)));
    const generalMajor = generalFindings.filter(f => f.severity === 'major').length;
    const generalMinor = generalFindings.filter(f => f.severity === 'minor').length;
    // Without a rubric, require an explicit overall lecturer score at publish.
    const total = clampScore(weighted);
    const factors: ScoreFactor[] = rows.filter(r => r.weight > 0).map(r => ({
        key: 'criterion-' + r.id, label: r.label,
        detail: r.score + '/100 × bobot ' + r.weight + '/' + weightSum,
        impact: r.score * r.weight / weightSum,
    }));
    return { rows, general: generalFindings.length ? { major: generalMajor, minor: generalMinor, penalty: 0 } : null,
        total, hasRubric: rows.length > 0, majorPenalty: 0, minorPenalty: 0,
        wordCount: Math.max(0,Math.round(options?.wordCount || 0)), lengthTolerance: 0, completionCap: 100,
        factors, rationale: weightSum > 0 ? total + '/100 = rata-rata tertimbang skor pencapaian kriteria. Temuan kesalahan mendukung penilaian, tanpa penalti tambahan.' : 'Belum ada rubrik berbobot. Isi nilai keseluruhan secara eksplisit.' };
}
