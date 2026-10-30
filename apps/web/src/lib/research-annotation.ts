/**
 * Phase 3 — lecturer research annotation for AI feedback (client-safe).
 *
 * A research annotation is LECTURER-ONLY metadata that records an expert
 * evaluation of one AI-generated finding. It is strictly additional: it never
 * changes the AI's original output, never changes the official grade, and is
 * never visible to students. Saving a research annotation is independent of
 * publishing — the normal approve/reject/edit/manual-finding/publish workflow
 * is untouched.
 *
 * The annotation values map 1:1 to the `ai_feedback_items` collection
 * (create/update rules are `null` → server-only writes; list/view rules are
 * owner-only → students can never read them).
 */
import { FEEDBACK_CATEGORIES, FEEDBACK_TAXONOMY } from '@/lib/ai-evaluation';
import type { EvalFinding } from '@/lib/ai-evaluation';

/** 1. Error existence — does the error the AI flagged actually exist? */
export type ErrorPresent = 'yes' | 'no' | 'unclear';
export const ERROR_PRESENT_OPTIONS: ErrorPresent[] = ['yes', 'no', 'unclear'];
export const ERROR_PRESENT_LABEL: Record<ErrorPresent, string> = {
	yes: 'Ya — kesalahan ada',
	no: 'Tidak — tidak ada kesalahan',
	unclear: 'Tidak jelas',
};

/** 2. AI detection — did the AI correctly detect the error? */
export type DetectionJudgment = 'correct' | 'incorrect' | 'missed' | 'not_applicable';
export const DETECTION_JUDGMENT_OPTIONS: DetectionJudgment[] = [
	'correct',
	'incorrect',
	'missed',
	'not_applicable',
];
export const DETECTION_JUDGMENT_LABEL: Record<DetectionJudgment, string> = {
	correct: 'Tepat — AI menemukan kesalahan nyata',
	incorrect: 'Keliru — AI menandai yang bukan kesalahan',
	missed: 'Terlewat — AI melewatkan kesalahan nyata',
	not_applicable: 'Tidak berlaku',
};

/** 3. AI correction — is the AI's proposed correction correct? */
export type CorrectionJudgment =
	| 'correct'
	| 'partially_correct'
	| 'incorrect'
	| 'not_provided'
	| 'not_applicable';
export const CORRECTION_JUDGMENT_OPTIONS: CorrectionJudgment[] = [
	'correct',
	'partially_correct',
	'incorrect',
	'not_provided',
	'not_applicable',
];
export const CORRECTION_JUDGMENT_LABEL: Record<CorrectionJudgment, string> = {
	correct: 'Tepat',
	partially_correct: 'Sebagian tepat',
	incorrect: 'Keliru',
	not_provided: 'AI tidak memberikan koreksi',
	not_applicable: 'Tidak berlaku',
};

/** 4. AI explanation — is the AI's explanation correct? */
export type ExplanationJudgment =
	| 'correct'
	| 'partially_correct'
	| 'incorrect'
	| 'not_provided'
	| 'not_applicable';
export const EXPLANATION_JUDGMENT_OPTIONS: ExplanationJudgment[] = [
	'correct',
	'partially_correct',
	'incorrect',
	'not_provided',
	'not_applicable',
];
export const EXPLANATION_JUDGMENT_LABEL: Record<ExplanationJudgment, string> = {
	correct: 'Tepat',
	partially_correct: 'Sebagian tepat',
	incorrect: 'Keliru',
	not_provided: 'AI tidak memberikan penjelasan',
	not_applicable: 'Tidak berlaku',
};

/** 5. Completeness — is the AI finding complete? */
export type CompletenessJudgment = 'complete' | 'incomplete' | 'not_applicable';
export const COMPLETENESS_JUDGMENT_OPTIONS: CompletenessJudgment[] = [
	'complete',
	'incomplete',
	'not_applicable',
];
export const COMPLETENESS_JUDGMENT_LABEL: Record<CompletenessJudgment, string> = {
	complete: 'Lengkap',
	incomplete: 'Tidak lengkap',
	not_applicable: 'Tidak berlaku',
};

/** 6. Necessity — was flagging this necessary? */
export type NecessityJudgment = 'necessary' | 'unnecessary' | 'not_applicable';
export const NECESSITY_JUDGMENT_OPTIONS: NecessityJudgment[] = [
	'necessary',
	'unnecessary',
	'not_applicable',
];
export const NECESSITY_JUDGMENT_LABEL: Record<NecessityJudgment, string> = {
	necessary: 'Perlu ditandai',
	unnecessary: 'Tidak perlu ditandai',
	not_applicable: 'Tidak berlaku',
};

/** 7. Pedagogical appropriateness — is the feedback pedagogically sound? */
export type PedagogicalJudgment = 'appropriate' | 'needs_revision' | 'inappropriate' | 'not_applicable';
export const PEDAGOGICAL_JUDGMENT_OPTIONS: PedagogicalJudgment[] = [
	'appropriate',
	'needs_revision',
	'inappropriate',
	'not_applicable',
];
export const PEDAGOGICAL_JUDGMENT_LABEL: Record<PedagogicalJudgment, string> = {
	appropriate: 'Tepat secara pedagogis',
	needs_revision: 'Perlu revisi',
	inappropriate: 'Tidak tepat secara pedagogis',
	not_applicable: 'Tidak berlaku',
};

/** 8–10. Human/reference classification (expert ground truth). */
export type ReferenceSeverity = 'minor' | 'major';
export const REFERENCE_SEVERITY_OPTIONS: ReferenceSeverity[] = ['minor', 'major'];
export const REFERENCE_SEVERITY_LABEL: Record<ReferenceSeverity, string> = {
	minor: 'Perlu perbaikan',
	major: 'Kesalahan berarti',
};

/** Re-export the Phase 2 controlled taxonomy for the reference category/subcategory. */
export const REFERENCE_CATEGORIES = FEEDBACK_CATEGORIES;
export function referenceSubcategories(category: string): readonly string[] {
	return FEEDBACK_TAXONOMY[category] ?? [];
}

export type AdjudicationStatus = 'unreviewed' | 'reviewed' | 'adjudicated';
export const ADJUDICATION_STATUS_LABEL: Record<AdjudicationStatus, string> = {
	unreviewed: 'Belum ditinjau',
	reviewed: 'Ditinjau',
	adjudicated: 'Diputuskan',
};

/** One saved research annotation row (mirrors `ai_feedback_items`). */
export type ResearchAnnotation = {
	id: string;
	parentAiFindingId: string;
	errorPresent: ErrorPresent | '';
	detectionJudgment: DetectionJudgment | '';
	correctionJudgment: CorrectionJudgment | '';
	explanationJudgment: ExplanationJudgment | '';
	completenessJudgment: CompletenessJudgment | '';
	necessityJudgment: NecessityJudgment | '';
	pedagogicalJudgment: PedagogicalJudgment | '';
	referenceCategory: string;
	referenceSubcategory: string;
	referenceSeverity: ReferenceSeverity | '';
	referenceCorrection: string;
	referenceExplanation: string;
	reviewerNote: string;
	adjudicationStatus: AdjudicationStatus;
	reviewedAt: string;
};

/** Empty annotation — the starting state for an AI finding with no saved row. */
export const EMPTY_ANNOTATION: ResearchAnnotation = {
	id: '',
	parentAiFindingId: '',
	errorPresent: '',
	detectionJudgment: '',
	correctionJudgment: '',
	explanationJudgment: '',
	completenessJudgment: '',
	necessityJudgment: '',
	pedagogicalJudgment: '',
	referenceCategory: '',
	referenceSubcategory: '',
	referenceSeverity: '',
	referenceCorrection: '',
	referenceExplanation: '',
	reviewerNote: '',
	adjudicationStatus: 'unreviewed',
	reviewedAt: '',
};

/**
 * Stable content fingerprint for one ORIGINAL AI finding. Used as
 * `parentAiFindingId` so a research annotation stays linked to the AI output
 * it evaluates even if the lecturer edits the review note or severity — the
 * fingerprint is computed from the AI's own original fields (quote, note,
 * category, subcategory), which the review round-trip preserves unchanged on
 * AI items. A regenerated draft produces new fingerprints, so stale
 * annotations never silently attach to a different finding.
 */
export function findingFingerprint(finding: {
	severity: string;
	quote: string;
	note: string;
	category?: string;
	subcategory?: string;
}): string {
	const raw = `${finding.severity}|${finding.quote}|${finding.note}|${finding.category || ''}|${finding.subcategory || ''}`;
	let hash = 5381;
	for (let i = 0; i < raw.length; i++) {
		hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
	}
	return `fp_${hash.toString(36)}`;
}

/**
 * Phase 11 — resolves the ORIGINAL AI finding a research annotation targets,
 * by matching the annotation's `parentAiFindingId` (fingerprint) against the
 * evaluation draft's parsed findings. Returns `null` when no finding matches
 * (e.g. the draft was regenerated and the finding no longer exists, or the
 * draft is still pending) — the caller must then leave the AI content fields
 * empty rather than inventing them.
 *
 * The fingerprint is computed from the AI finding's own original fields
 * (severity, quote, note, category, subcategory), so it stays stable across
 * lecturer edits to the review note/severity and uniquely identifies one
 * finding within an evaluation. Two findings with identical content collide
 * by design (they are indistinguishable duplicates).
 */
export function findSourceFindingByFingerprint(
	findings: EvalFinding[],
	fingerprint: string,
): EvalFinding | null {
	if (!fingerprint) return null;
	for (const finding of findings) {
		if (findingFingerprint(finding) === fingerprint) return finding;
	}
	return null;
}

/** True when an annotation has any non-empty expert field set. */
export function annotationIsStarted(a: ResearchAnnotation): boolean {
	return (
		a.errorPresent !== '' ||
		a.detectionJudgment !== '' ||
		a.correctionJudgment !== '' ||
		a.explanationJudgment !== '' ||
		a.completenessJudgment !== '' ||
		a.necessityJudgment !== '' ||
		a.pedagogicalJudgment !== '' ||
		a.referenceCategory !== '' ||
		a.referenceSubcategory !== '' ||
		a.referenceSeverity !== '' ||
		a.referenceCorrection.trim() !== '' ||
		a.referenceExplanation.trim() !== '' ||
		a.reviewerNote.trim() !== ''
	);
}

// ── Phase 4: human-annotated missed errors (AI false negatives) ────────────

/**
 * Phase 4 — a human-annotated missed error (AI false negative).
 *
 * This is a LECTURER-ONLY research record stored in `ai_feedback_items` with
 * `origin = 'human'` and `detectionJudgment = 'missed'`. It records an error
 * the AI evaluation DRAFT did NOT detect, anchored to an exact substring of
 * the student's own text (or empty for a genuinely global issue). It is never
 * an AI finding, never labelled as one, never affects the product score, and
 * never publishes to students — it exists solely to measure AI recall.
 */
export type HumanMissedError = {
	id: string;
	quote: string;
	quoteStart: number;
	quoteEnd: number;
	anchorValid: boolean;
	referenceCategory: string;
	referenceSubcategory: string;
	referenceSeverity: ReferenceSeverity | '';
	referenceCorrection: string;
	referenceExplanation: string;
	reviewerNote: string;
	adjudicationStatus: AdjudicationStatus;
	reviewedAt: string;
	created: string;
};

/** Phase 4 — the lecturer's draft for a new missed-error annotation. */
export type MissedErrorDraft = {
	/** Exact substring of the student's text ('' = global reference error). */
	quote: string;
	referenceCategory: string;
	referenceSubcategory: string;
	referenceSeverity: ReferenceSeverity | '';
	referenceCorrection: string;
	referenceExplanation: string;
	reviewerNote: string;
};

export const EMPTY_MISSED_ERROR_DRAFT: MissedErrorDraft = {
	quote: '',
	referenceCategory: '',
	referenceSubcategory: '',
	referenceSeverity: '',
	referenceCorrection: '',
	referenceExplanation: '',
	reviewerNote: '',
};

/** True when a missed-error draft has at least one reference field set. */
export function missedErrorIsStarted(d: MissedErrorDraft): boolean {
	return (
		d.referenceCategory !== '' ||
		d.referenceSubcategory !== '' ||
		d.referenceSeverity !== '' ||
		d.referenceCorrection.trim() !== '' ||
		d.referenceExplanation.trim() !== '' ||
		d.reviewerNote.trim() !== ''
	);
}

/**
 * Tolerant parse of a PocketBase `ai_feedback_items` row whose `origin` is
 * `'human'` into the display shape. Field names mirror the collection, so a
 * raw row casts cleanly, but every field is defended for safety.
 */
export function parseHumanMissedError(row: Record<string, unknown>): HumanMissedError {
	const severity = row.referenceSeverity;
	const adjudication = row.adjudicationStatus;
	return {
		id: typeof row.id === 'string' ? row.id : '',
		quote: typeof row.quote === 'string' ? row.quote : '',
		quoteStart: typeof row.quoteStart === 'number' ? row.quoteStart : 0,
		quoteEnd: typeof row.quoteEnd === 'number' ? row.quoteEnd : 0,
		anchorValid: typeof row.anchorValid === 'boolean' ? row.anchorValid : false,
		referenceCategory: typeof row.referenceCategory === 'string' ? row.referenceCategory : '',
		referenceSubcategory: typeof row.referenceSubcategory === 'string' ? row.referenceSubcategory : '',
		referenceSeverity: severity === 'minor' || severity === 'major' ? severity : '',
		referenceCorrection: typeof row.referenceCorrection === 'string' ? row.referenceCorrection : '',
		referenceExplanation: typeof row.referenceExplanation === 'string' ? row.referenceExplanation : '',
		reviewerNote: typeof row.reviewerNote === 'string' ? row.reviewerNote : '',
		adjudicationStatus:
			adjudication === 'unreviewed' || adjudication === 'reviewed' || adjudication === 'adjudicated'
				? adjudication
				: 'unreviewed',
		reviewedAt: typeof row.reviewedAt === 'string' ? row.reviewedAt : '',
		created: typeof row.created === 'string' ? row.created : '',
	};
}
