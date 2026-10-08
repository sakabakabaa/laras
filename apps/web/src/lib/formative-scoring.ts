/**
 * Formative evaluation advisory scoring (Latihan formatif, Cek jawaban).
 *
 * The lecturer's advisory score for a formative answer. Unlike the formal
 * rubric score (`evaluation-scoring.ts`, flat −20/−8 per finding), this model
 * is proportional and explainable: it never collapses a few errors into a
 * failing grade, weighs major errors far more than minor suggestions, and
 * adjusts for pedagogically relevant context the formal deduction ignored.
 *
 * Factors considered (every one surfaced in `factors` so the lecturer can see
 * exactly how the number was reached):
 *  1. Feedback severity/criticality — major errors weigh ~4× minor; both cap
 *     so a long answer with several issues does not collapse to single digits.
 *  2. Task completion — a very short / near-empty answer is capped regardless
 *     of how few errors were flagged (no errors ≠ full marks for nothing).
 *  3. Answer length — longer answers tolerate a few errors (tolerance band).
 *  4. CEFR level (language-skills course codes) — lower levels get a small
 *     tolerance, calibrated to the competence expected at that level.
 *  5. Task rubric — noted when present; formative findings are not mapped per
 *     criterion, so the score stays overall (never invented per-criterion).
 *  6. Source materials — noted when the feedback cites approved course
 *     material, so the lecturer knows the advisory was material-grounded.
 *
 * This is advisory only. The lecturer retains final authority; nothing here
 * is published as a grade. Student answers and existing grades are never
 * modified — this is a pure function over the review state.
 */
import {
	clampScore,
	isCountedFinding,
	MAJOR_PER_POINT,
	MAJOR_CAP,
	MINOR_PER_POINT,
	MINOR_CAP,
	LENGTH_TOLERANCE,
	COMPLETION_CAP_WORDS,
	COMPLETION_CAP_SCORE,
} from '@/lib/evaluation-scoring';

export type FormativeScoreFactor = {
	key: string;
	label: string;
	detail: string;
	/** Signed impact on the score (negative = penalty, positive = tolerance). */
	impact: number;
};

export type FormativeAdvisory = {
	score: number;
	majorCount: number;
	minorCount: number;
	wordCount: number;
	cefrLevel: string | null;
	hasRubric: boolean;
	hasMaterial: boolean;
	factors: FormativeScoreFactor[];
	confidence: 'high' | 'medium' | 'low';
	rationale: string;
};

/** CEFR tolerance — lower competence levels get a small tolerance. */
const CEFR_TOLERANCE: Record<string, number> = {
	A1: 6,
	A2: 6,
	B1: 3,
	B2: 3,
	C1: 0,
	C2: 0,
};

/** Section-citation markers that indicate the feedback cited course material. */
const MATERIAL_CITATION_RE = /\[id=[a-z0-9_-]+\]|Bagian\s+["“„\u201c]/i;

type ScoringFinding = { severity: string; status: string; quote?: string };

/**
 * Proportional, explainable advisory score for one formative answer.
 *
 * Rejected findings never count (lecturer dismissed them). Pending AI findings
 * count as kept — the lecturer sees the score move as they accept/reject.
 */
export function calculateFormativeAdvisory(input: {
	findings: ScoringFinding[];
	wordCount: number;
	cefrLevel?: string | null;
	hasRubric?: boolean;
	hasMaterial?: boolean;
}): FormativeAdvisory {
	const counted = input.findings.filter((f) => isCountedFinding(f.status));
	const majorCount = counted.filter((f) => f.severity === 'major').length;
	const minorCount = counted.filter((f) => f.severity === 'minor').length;
	const wordCount = Math.max(0, Math.round(input.wordCount));
	const cefrLevel = input.cefrLevel ? String(input.cefrLevel).toUpperCase() : null;
	const hasRubric = Boolean(input.hasRubric);
	const hasMaterial = Boolean(input.hasMaterial);

	const factors: FormativeScoreFactor[] = [];

	// 1. Severity-weighted penalties (capped, so a few errors don't collapse).
	const majorPenalty = Math.min(MAJOR_CAP, majorCount * MAJOR_PER_POINT);
	if (majorCount > 0) {
		factors.push({
			key: 'major',
			label: 'Kesalahan berarti (merah)',
			detail: `${majorCount} temuan × ${MAJOR_PER_POINT} poin, dibatasi ${MAJOR_CAP}.`,
			impact: -majorPenalty,
		});
	}

	const minorPenalty = Math.min(MINOR_CAP, minorCount * MINOR_PER_POINT);
	if (minorCount > 0) {
		factors.push({
			key: 'minor',
			label: 'Saran perbaikan (kuning)',
			detail: `${minorCount} temuan × ${MINOR_PER_POINT} poin, dibatasi ${MINOR_CAP}.`,
			impact: -minorPenalty,
		});
	}

	// 2. Length tolerance — longer answers tolerate a few errors.
	let lengthTolerance = 0;
	for (const band of LENGTH_TOLERANCE) {
		if (wordCount >= band.min) {
			lengthTolerance = band.tolerance;
			break;
		}
	}
	if (lengthTolerance > 0) {
		factors.push({
			key: 'length',
			label: 'Panjang jawaban',
			detail: `${wordCount} kata — toleransi ${lengthTolerance} poin karena jawaban cukup panjang.`,
			impact: lengthTolerance,
		});
	}

	// 3. CEFR tolerance — calibrated to the competence expected at the level.
	const cefrTolerance = cefrLevel ? CEFR_TOLERANCE[cefrLevel] ?? 0 : 0;
	if (cefrTolerance > 0) {
		factors.push({
			key: 'cefr',
			label: 'Tingkat CEFR',
			detail: `Tingkat ${cefrLevel} — toleransi ${cefrTolerance} poin sesuai ekspektasi kompetensi.`,
			impact: cefrTolerance,
		});
	}

	// 4. Completion cap — a near-empty answer cannot score high.
	const completionCap = wordCount < COMPLETION_CAP_WORDS ? COMPLETION_CAP_SCORE : 100;
	if (completionCap < 100) {
		factors.push({
			key: 'completion',
			label: 'Kelengkapan jawaban',
			detail: `Jawaban sangat singkat (${wordCount} kata) — skor dibatasi maks ${completionCap}.`,
			impact: 0,
		});
	}

	const raw = 100 - majorPenalty - minorPenalty + lengthTolerance + cefrTolerance;
	const score = clampScore(Math.min(completionCap, raw));

	// Confidence: anchored (on-text) findings give higher confidence than
	// general/unanchored advice. Low confidence → the number is a rough band.
	const anchored = counted.filter((f) => f.quote && f.quote.trim().length > 0).length;
	const total = counted.length;
	let confidence: 'high' | 'medium' | 'low' = 'high';
	if (total > 0) {
		const ratio = anchored / total;
		confidence = ratio >= 0.6 ? 'high' : ratio >= 0.3 ? 'medium' : 'low';
	}

	// 5. Rubric context (informational — formative findings are not mapped
	//    per criterion, so the score stays overall and never invents
	//    per-criterion numbers).
	if (hasRubric) {
		factors.push({
			key: 'rubric',
			label: 'Rubrik tugas',
			detail:
				'Rubrik tersedia pada tugas. Temuan formatif belum dipetakan per kriteria, jadi skor dihitung menyeluruh — bukan per kriteria.',
			impact: 0,
		});
	}

	// 6. Source materials (informational — tells the lecturer whether the
	//    advisory was grounded in approved course material).
	factors.push({
		key: 'material',
		label: 'Materi sumber',
		detail: hasMaterial
			? 'Umpan balik Cek jawaban merujuk materi sumber yang disetujui — saran lebih terkalibrasi ke materi yang dipelajari.'
			: 'Belum ada materi sumber yang dirujuk — umpan balik hanya berbasis jawaban dan ketentuan tugas.',
		impact: 0,
	});

	const parts = [`100 dasar`];
	if (majorPenalty > 0) parts.push(`−${majorPenalty} merah`);
	if (minorPenalty > 0) parts.push(`−${minorPenalty} kuning`);
	if (lengthTolerance > 0) parts.push(`+${lengthTolerance} panjang`);
	if (cefrTolerance > 0) parts.push(`+${cefrTolerance} CEFR`);
	if (completionCap < 100) parts.push(`dibatasi ${completionCap} (kelengkapan)`);
	const rationale = `Skor saran ${score}/100 = ${parts.join(' · ')}.`;

	return {
		score,
		majorCount,
		minorCount,
		wordCount,
		cefrLevel,
		hasRubric,
		hasMaterial,
		factors,
		confidence,
		rationale,
	};
}

/** Heuristic: does the feedback/evidence cite approved course material? */
export function feedbackCitesMaterial(...texts: (string | undefined | null)[]): boolean {
	return texts.some((t) => typeof t === 'string' && MATERIAL_CITATION_RE.test(t));
}
