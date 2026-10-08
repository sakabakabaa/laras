/**
 * Client-safe AI evaluation draft types and helpers (Phase 1, Tugas formal).
 *
 * An AI evaluation draft is a LECTURER-ONLY recommendation: validated findings
 * (each quoting an exact substring of the student's own text), a recommended
 * score with a rubric breakdown, and material-context citations. It is never
 * a grade, never published to students, and always labeled as not yet
 * approved. The original student text is never modified — findings are only
 * rendered as inline markings on top of it.
 */
import pb from '@/lib/pocketbase-client';
import {
	autoAssignCriterion,
	normalizeCriterionId,
	type RubricCriterion,
} from '@/lib/evaluation-scoring';

/** Yellow: minor issues, unclear wording, improvement suggestions. */
/** Red: significant errors, missing requirements, incorrect answers. */
export type EvalSeverity = 'minor' | 'major';

export const SEVERITY_LABEL: Record<EvalSeverity, string> = {
	minor: 'Perlu perbaikan',
	major: 'Kesalahan berarti',
};

/**
 * Phase 2 (research — German as a Foreign Language writing) — the controlled
 * error taxonomy the model MUST classify every finding against. The AI
 * category/subcategory is an AI CLASSIFICATION ONLY, never expert ground
 * truth; invalid pairs are sanitized to '' (the raw model output is preserved
 * separately on the evaluation row for reproducibility).
 */
export const FEEDBACK_TAXONOMY: Readonly<Record<string, readonly string[]>> = {
	Morphology: ['article', 'gender', 'case', 'adjective_declension', 'verb_conjugation', 'tense', 'modal', 'pronoun', 'plural', 'agreement'],
	Syntax: ['word_order', 'V2', 'subordinate_clause', 'verb_final', 'inversion', 'clause_structure', 'agreement'],
	Lexicon: ['word_choice', 'collocation', 'semantic_choice', 'false_friend'],
	Preposition: ['wrong_preposition', 'case_government', 'omission', 'unnecessary_preposition'],
	Orthography: ['spelling', 'capitalization', 'umlaut', 'ß', 'punctuation'],
	Discourse: ['cohesion', 'coherence', 'connector', 'reference', 'paragraph_structure'],
	'Register/pragmatics': ['formality', 'politeness', 'appropriateness'],
	Task: ['missing_information', 'irrelevant_content', 'task_misunderstanding', 'incomplete_response'],
};

export const FEEDBACK_CATEGORIES = Object.keys(FEEDBACK_TAXONOMY);

/** True only when the (category, subcategory) pair is part of the taxonomy. */
export function isValidTaxonomy(category: string, subcategory: string): boolean {
	if (!category || !subcategory) return false;
	const subs = FEEDBACK_TAXONOMY[category];
	return !!subs && subs.includes(subcategory);
}

/** Maximum structured findings kept per evaluation (matches the server cap). */
export const MAX_STRUCTURED_FINDINGS = 12;

/**
 * Resolves a finding's quote anchor against the student's own text.
 *
 * Never silently turns an invalid quote into an empty one: a quote that does
 * not occur verbatim is preserved as an invalid-anchor finding
 * (`anchorValid: false`). A quote that occurs more than once is marked
 * ambiguous (`anchorAmbiguous: true`) rather than guessing which occurrence
 * the model meant — exact offsets are only stored for a single, unambiguous
 * match. An empty quote is a general finding with no anchor to validate.
 */
export type AnchorResolution = {
	anchorValid: boolean;
	quoteStart: number | null;
	quoteEnd: number | null;
	anchorAmbiguous: boolean;
};

export function resolveAnchor(quote: string, studentText: string): AnchorResolution {
	const q = (quote || '').trim();
	if (!q) {
		return { anchorValid: true, quoteStart: null, quoteEnd: null, anchorAmbiguous: false };
	}
	if (q.length > 300) {
		return { anchorValid: false, quoteStart: null, quoteEnd: null, anchorAmbiguous: false };
	}
	const first = studentText.indexOf(q);
	if (first === -1) {
		return { anchorValid: false, quoteStart: null, quoteEnd: null, anchorAmbiguous: false };
	}
	const second = studentText.indexOf(q, first + 1);
	if (second !== -1) {
		return { anchorValid: true, quoteStart: null, quoteEnd: null, anchorAmbiguous: true };
	}
	return { anchorValid: true, quoteStart: first, quoteEnd: first + q.length, anchorAmbiguous: false };
}

/**
 * Phase 11 — strict anchor validation against a versioned input text.
 *
 * Unlike {@link resolveAnchor} (which re-resolves a quote from scratch),
 * this validates STORED offsets against the text: when `quoteStart`/`quoteEnd`
 * are present they MUST slice to the exact quote, otherwise the anchor is
 * marked invalid with a machine-readable {@link AnchorError} reason — the
 * quote is NEVER silently emptied and the confidence is NEVER zeroed. When
 * offsets are absent (null/undefined) the quote is resolved from the text
 * (delegating to {@link resolveAnchor} semantics, including ambiguity).
 *
 * Indexing convention: all offsets are UTF-16 code-unit indices (JavaScript's
 * native `String.prototype.slice`/`indexOf` unit), which correctly handles
 * Unicode/multibyte text as long as every offset was produced by the same
 * convention. A multibyte character occupies one or two code units; the
 * validation `text.slice(start, end) === quote` is exact under this convention.
 *
 * Absent vs null vs zero: a `quoteStart` of `0` (the very start of the text)
 * is a VALID offset and is preserved; only `null`/`undefined` means "absent".
 * A `confidence` of `0` is a real value and is preserved; only absent means
 * "unknown".
 */
export const ANCHOR_ERROR = {
	QUOTE_TOO_LONG: 'quote_exceeds_max_length',
	OFFSETS_INVERTED: 'offsets_inverted',
	OFFSET_LENGTH_MISMATCH: 'offset_length_mismatch',
	OFFSET_TEXT_MISMATCH: 'offset_text_mismatch',
	QUOTE_NOT_IN_TEXT: 'quote_not_found_in_text',
} as const;

export type AnchorError = (typeof ANCHOR_ERROR)[keyof typeof ANCHOR_ERROR];

export type FindingAnchorValidation = {
	anchorValid: boolean;
	quoteStart: number | null;
	quoteEnd: number | null;
	anchorAmbiguous: boolean;
	/** Machine-readable reason when `anchorValid` is false ('' when valid). */
	anchorError: AnchorError | '';
};

export function validateFindingAnchor(
	quote: string,
	quoteStart: number | null | undefined,
	quoteEnd: number | null | undefined,
	sourceText: string,
): FindingAnchorValidation {
	const q = (quote || '').trim();
	if (!q) {
		return { anchorValid: true, quoteStart: null, quoteEnd: null, anchorAmbiguous: false, anchorError: '' };
	}
	if (q.length > 300) {
		return { anchorValid: false, quoteStart: null, quoteEnd: null, anchorAmbiguous: false, anchorError: ANCHOR_ERROR.QUOTE_TOO_LONG };
	}
	const text = sourceText || '';
	const hasStart = typeof quoteStart === 'number' && Number.isFinite(quoteStart) && quoteStart >= 0;
	const hasEnd = typeof quoteEnd === 'number' && Number.isFinite(quoteEnd) && quoteEnd >= 0;
	if (hasStart && hasEnd) {
		if (quoteEnd < quoteStart) {
			return { anchorValid: false, quoteStart: null, quoteEnd: null, anchorAmbiguous: false, anchorError: ANCHOR_ERROR.OFFSETS_INVERTED };
		}
		if (quoteEnd - quoteStart !== q.length) {
			return { anchorValid: false, quoteStart: null, quoteEnd: null, anchorAmbiguous: false, anchorError: ANCHOR_ERROR.OFFSET_LENGTH_MISMATCH };
		}
		if (text.slice(quoteStart, quoteEnd) !== q) {
			return { anchorValid: false, quoteStart: null, quoteEnd: null, anchorAmbiguous: false, anchorError: ANCHOR_ERROR.OFFSET_TEXT_MISMATCH };
		}
		return { anchorValid: true, quoteStart, quoteEnd, anchorAmbiguous: false, anchorError: '' };
	}
	// Offsets absent — resolve from the text (single match → offsets, repeated
	// → ambiguous, missing → invalid). Never guesses which occurrence.
	const resolved = resolveAnchor(q, text);
	return {
		anchorValid: resolved.anchorValid,
		quoteStart: resolved.quoteStart,
		quoteEnd: resolved.quoteEnd,
		anchorAmbiguous: resolved.anchorAmbiguous,
		anchorError: resolved.anchorValid ? '' : ANCHOR_ERROR.QUOTE_NOT_IN_TEXT,
	};
}

/** Sanitizes a model category/subcategory pair to the controlled taxonomy. */
export function sanitizeTaxonomy(
	category: unknown,
	subcategory: unknown,
): { category: string; subcategory: string } {
	const cat = typeof category === 'string' ? category.trim() : '';
	const sub = typeof subcategory === 'string' ? subcategory.trim() : '';
	if (isValidTaxonomy(cat, sub)) return { category: cat, subcategory: sub };
	return { category: '', subcategory: '' };
}

// ── Phase 10.2: research integrity helpers ───────────────────────────────

/**
 * Phase 10.2 — true only when an item is validated evidence eligible for
 * learner personalization:
 *  A. origin='human' AND adjudicationStatus in ('reviewed','adjudicated'), OR
 *  B. origin='ai' AND detectionJudgment='correct' AND adjudicationStatus in
 *     ('reviewed','adjudicated').
 *
 * Unreviewed items (human or AI) NEVER enter personalization. Merely existing
 * AI findings are NOT validated evidence. An unreviewed human annotation is
 * NOT final evidence.
 */
export function isValidatedForPersonalization(item: {
	origin: string;
	detectionJudgment: string;
	adjudicationStatus: string;
}): boolean {
	const adjudicated =
		item.adjudicationStatus === 'reviewed' || item.adjudicationStatus === 'adjudicated';
	if (!adjudicated) return false;
	if (item.origin === 'human') return true;
	if (item.origin === 'ai') return item.detectionJudgment === 'correct';
	return false;
}

/**
 * Phase 10.2 — classify a feedback item into its research role.
 *
 * Distinguishes:
 * - human_reference_error: origin='human', a lecturer-authored reference error
 * - ai_finding: origin='ai', an AI-generated finding (not rejected)
 * - adjudicated_reference_error: origin='human' AND adjudicationStatus='adjudicated'
 * - rejected_ai_finding: origin='ai' AND detectionJudgment='incorrect'
 * - missed_ai_error: origin='human' AND detectionJudgment='missed'
 * - unreviewed: no adjudication yet
 *
 * Rejected AI findings never become reference errors automatically.
 * Unreviewed AI findings never enter learner personalization.
 */
export type FeedbackItemClass =
	| 'human_reference_error'
	| 'ai_finding'
	| 'adjudicated_reference_error'
	| 'rejected_ai_finding'
	| 'missed_ai_error'
	| 'unreviewed';

export function classifyFeedbackItem(item: {
	origin: string;
	detectionJudgment: string;
	adjudicationStatus: string;
}): FeedbackItemClass {
	const origin = (item.origin || '').trim();
	const detection = (item.detectionJudgment || '').trim();
	const adjudication = (item.adjudicationStatus || '').trim();

	if (adjudication === 'unreviewed' || !adjudication) return 'unreviewed';

	if (origin === 'human') {
		if (detection === 'missed') return 'missed_ai_error';
		if (adjudication === 'adjudicated') return 'adjudicated_reference_error';
		return 'human_reference_error';
	}

	if (origin === 'ai') {
		if (detection === 'incorrect') return 'rejected_ai_finding';
		return 'ai_finding';
	}

	return 'unreviewed';
}

/** Clamps a model confidence to [0, 1], or undefined when not a finite number. */
function clampConfidence(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	return Math.max(0, Math.min(1, value));
}

/**
 * Parses and validates the model's findings against the only ground truth
 * there is: the student's own text and the assignment's stored rubric.
 *
 * Backward-compatible structured German L2 feedback (Phase 2):
 * - Every finding is preserved, including ones whose quote does NOT occur
 *   verbatim in the student text — these are kept as invalid-anchor findings
 *   (`anchorValid: false`) instead of being deleted, so the evidence is never
 *   silently lost. (Old behaviour turned invalid quotes into empty quotes.)
 * - Exact `quoteStart`/`quoteEnd` offsets are stored for a single, unambiguous
 *   match; a repeated quote is marked `anchorAmbiguous` rather than guessed.
 * - `category`/`subcategory` are sanitized to the controlled taxonomy; invalid
 *   pairs become '' (the raw model output is preserved separately).
 * - Old records without the new fields still parse — every new field is optional.
 */
export function parseStructuredFindings(
	rawFindings: unknown,
	studentText: string,
	criteria: { label: string; weight: number }[],
): EvalFinding[] {
	if (!Array.isArray(rawFindings)) return [];
	const text = studentText || '';
	const out: EvalFinding[] = [];
	for (const item of rawFindings) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
		if (out.length >= MAX_STRUCTURED_FINDINGS) break;
		const f = item as Record<string, unknown>;
		if (f.severity !== 'minor' && f.severity !== 'major') continue;
		const note = typeof f.note === 'string' ? f.note.trim() : '';
		if (!note) continue;
		const quote = typeof f.quote === 'string' ? f.quote.trim() : '';
		const anchor = resolveAnchor(quote, text);
		let criterion = '';
		if (typeof f.criterion === 'string' && f.criterion.trim() && criteria.length > 0) {
			const label = f.criterion.trim().toLowerCase();
			const match = criteria.find(
				(stored) =>
					stored.label.toLowerCase() === label ||
					stored.label.toLowerCase().includes(label) ||
					label.includes(stored.label.toLowerCase()),
			);
			if (match) criterion = match.label;
		}
		const tax = sanitizeTaxonomy(f.category, f.subcategory);
		const confidence = clampConfidence(f.confidence);
		out.push({
			severity: f.severity,
			quote,
			note: note.slice(0, 600),
			evidence: typeof f.evidence === 'string' ? f.evidence.trim().slice(0, 600) : '',
			criterion,
			category: tax.category,
			subcategory: tax.subcategory,
			errorDescription:
				typeof f.errorDescription === 'string' ? f.errorDescription.trim().slice(0, 600) : '',
			correction: typeof f.correction === 'string' ? f.correction.trim().slice(0, 600) : '',
			explanation: typeof f.explanation === 'string' ? f.explanation.trim().slice(0, 1000) : '',
			...(confidence != null ? { confidence } : {}),
			anchorValid: anchor.anchorValid,
			quoteStart: anchor.quoteStart,
			quoteEnd: anchor.quoteEnd,
			anchorAmbiguous: anchor.anchorAmbiguous,
		});
	}
	return out;
}

export type EvalFinding = {
	severity: EvalSeverity;
	/** Exact substring of the student's text ('' = general finding). */
	quote: string;
	note: string;
	evidence: string;
	/** Server-assigned rubric criterion label this finding affects ('' = general). */
	criterion?: string;
	/** Phase 2 — structured German L2 feedback (AI classification only, never ground truth). */
	category?: string;
	subcategory?: string;
	errorDescription?: string;
	correction?: string;
	explanation?: string;
	confidence?: number;
	/** Phase 2 — anchor validation. An invalid quote is preserved, never dropped. */
	anchorValid?: boolean;
	quoteStart?: number | null;
	quoteEnd?: number | null;
	anchorAmbiguous?: boolean;
};

export type EvalRubricRow = { criterion: string; score: number; note: string };

/** Phase 2 — where a reviewed finding came from. */
export type ReviewSource = 'ai' | 'lecturer';

/** Phase 2 — the lecturer's review state of one finding. */
export type ReviewStatus = 'pending' | 'approved' | 'edited' | 'rejected' | 'manual';

/**
 * Phase 2 — one finding in the lecturer's working copy. AI items carry the
 * lecturer's review state; lecturer items (manual inline markings) are
 * always 'manual'. Rejected AI items stay in the list (restorable) but are
 * never rendered as marks on the student text.
 */
export type ReviewFinding = {
	/** Stable client id ('ai-<n>' for AI items, 'dosen-<ts>' for manual). */
	id: string;
	source: ReviewSource;
	severity: EvalSeverity;
	/** Exact substring of the student's text ('' = general finding). */
	quote: string;
	note: string;
	evidence: string;
	status: ReviewStatus;
	/** Phase 3 — rubric criterion this finding is assigned to ('' = general). */
	criterion?: string;
	/** Phase 2 — structured German L2 feedback carried from the AI draft.
	 * AI classification only; preserved through the lecturer review round-trip
	 * so the research record is never lost when the lecturer edits the note. */
	category?: string;
	subcategory?: string;
	errorDescription?: string;
	correction?: string;
	explanation?: string;
	confidence?: number;
	anchorValid?: boolean;
	quoteStart?: number | null;
	quoteEnd?: number | null;
	anchorAmbiguous?: boolean;
	/** Lecturer reason when an AI finding is rejected. Empty otherwise. */
	rejectReason?: string;
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
	pending: 'Menunggu tinjauan',
	approved: 'Disetujui dosen',
	edited: 'Diedit dosen',
	rejected: 'Ditolak',
	manual: 'Temuan dosen',
};

export type EvalCitation = {
	file: string;
	title: string;
	version: number;
	section: string;
	pageRef: string;
	extractedAt: string;
};

export type TranscriptConfidence = {
	mean: number;
	min: number;
	lowWords: { word: string; confidence: number; start?: number }[];
};

/** Tolerant parse of the stored transcript confidence JSON column. */
export function parseTranscriptConfidence(value: unknown): TranscriptConfidence | null {
	if (typeof value === 'string') {
		try {
			return parseTranscriptConfidence(JSON.parse(value));
		} catch {
			return null;
		}
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const v = value as Record<string, unknown>;
	const mean = typeof v.mean === 'number' && Number.isFinite(v.mean) ? v.mean : 0;
	const min = typeof v.min === 'number' && Number.isFinite(v.min) ? v.min : 0;
	const rawWords = Array.isArray(v.lowWords) ? v.lowWords : [];
	const lowWords = rawWords
		.map((w) => {
			if (!w || typeof w !== 'object') return null;
			const word = w as Record<string, unknown>;
			const text = typeof word.word === 'string' ? word.word : '';
			const conf = typeof word.confidence === 'number' ? word.confidence : 0;
			const start = typeof word.start === 'number' ? word.start : undefined;
			if (!text) return null;
			return { word: text, confidence: conf, ...(start != null ? { start } : {}) };
		})
		.filter((w): w is { word: string; confidence: number; start?: number } => w !== null);
	return { mean, min, lowWords };
}

/** Phase 5 — research provenance for one AI evaluation draft. Lecturer/
 *  researcher private; never exposed to students. Old records without
 *  provenance parse to all-unknown/empty defaults. */
export type ResearchProvenance = {
	model: string;
	modelVersion: string;
	promptVersion: string;
	systemPromptVersion: string;
	inputTextHash: string;
	outputHash: string;
	generationDurationMs: number | null;
	researchSchemaVersion: number | null;
	usedStudentText: boolean;
	usedImages: boolean;
	usedCourseMaterial: boolean;
	usedRubric: boolean;
	usedCefr: boolean;
};

/** Tolerant parse of research provenance from an evaluation row. Old records
 *  (pre-Phase 5) have no provenance fields and parse to unknown/empty defaults,
 *  so they remain valid without migration. */
export function parseProvenance(row: Record<string, unknown>): ResearchProvenance {
	const str = (value: unknown, max = 128): string =>
		typeof value === 'string' ? value.slice(0, max) : '';
	const num = (value: unknown): number | null =>
		typeof value === 'number' && Number.isFinite(value) ? value : null;
	const bool = (value: unknown): boolean => value === true;
	return {
		model: str(row.model, 64) || 'unknown',
		modelVersion: str(row.modelVersion, 64) || 'unknown',
		promptVersion: str(row.promptVersion, 64),
		systemPromptVersion: str(row.systemPromptVersion, 64),
		inputTextHash: str(row.inputTextHash, 128),
		outputHash: str(row.outputHash, 128),
		generationDurationMs: num(row.generationDurationMs),
		researchSchemaVersion: num(row.researchSchemaVersion),
		usedStudentText: bool(row.usedStudentText),
		usedImages: bool(row.usedImages),
		usedCourseMaterial: bool(row.usedCourseMaterial),
		usedRubric: bool(row.usedRubric),
		usedCefr: bool(row.usedCefr),
	};
}

export type AiEvaluationRow = {
	id: string;
	assignment: string;
	submission: string;
	publicSubmission: string;
	status: 'pending' | 'ready' | 'failed' | '';
	result: 'sufficient' | 'insufficient' | '';
	reason: string;
	findings: unknown;
	recommendedScore: number | null;
	rubricBreakdown: unknown;
	summary: string;
	bundleId: string;
	citations: unknown;
	contextNote: string;
	/** Phase 2 — verbatim raw model output, preserved for research reproducibility. */
	rawOutput: string;
	/** Phase 2 — the lecturer's reviewed/edited working copy of findings. */
	reviewFindings: unknown;
	reviewedAt: string;
	/** Phase 3 — publish snapshot: recalculated rubric scores, final score,
	 * adjustment flag, and when the lecturer explicitly published. */
	rubricScores: unknown;
	finalScore: number | null;
	scoreAdjusted: boolean;
	publishedAt: string;
	/** Scoring version: null = v1 (old flat model), 2 = proportional capped. */
	scoringVersion: number | null;
	/** Phase 5 — research provenance (lecturer/researcher private). */
	model: string;
	modelVersion: string;
	promptVersion: string;
	systemPromptVersion: string;
	inputTextHash: string;
	outputHash: string;
	generationDurationMs: number | null;
	researchSchemaVersion: number | null;
	usedStudentText: boolean;
	usedImages: boolean;
	usedCourseMaterial: boolean;
	usedRubric: boolean;
	usedCefr: boolean;
	generatedAt: string;
	created: string;
	updated: string;
};

/** Tolerant parse of the stored findings JSON column.
 * PocketBase returns JSON columns as arrays — an earlier guard treated every
 * array as invalid and dropped a completed draft, so the lecturer saw
 * "Draf AI tidak memuat temuan" even when findings were stored.
 */
export function parseFindings(value: unknown): EvalFinding[] {
	if (typeof value === 'string') {
		try {
			return parseFindings(JSON.parse(value));
		} catch {
			return [];
		}
	}
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is EvalFinding =>
			!!item &&
			typeof item === 'object' &&
			(item.severity === 'minor' || item.severity === 'major') &&
			typeof item.note === 'string' &&
			item.note.trim().length > 0,
	).map((item) => {
		const tax = sanitizeTaxonomy(item.category, item.subcategory);
		const confidence = clampConfidence(item.confidence);
		return {
			severity: item.severity,
			quote: typeof item.quote === 'string' ? item.quote : '',
			note: item.note,
			evidence: typeof item.evidence === 'string' ? item.evidence : '',
			criterion: typeof item.criterion === 'string' ? item.criterion.slice(0, 200) : '',
			category: tax.category,
			subcategory: tax.subcategory,
			errorDescription:
				typeof item.errorDescription === 'string' ? item.errorDescription.slice(0, 600) : '',
			correction: typeof item.correction === 'string' ? item.correction.slice(0, 600) : '',
			explanation: typeof item.explanation === 'string' ? item.explanation.slice(0, 1000) : '',
			...(confidence != null ? { confidence } : {}),
			anchorValid: typeof item.anchorValid === 'boolean' ? item.anchorValid : undefined,
			quoteStart: typeof item.quoteStart === 'number' ? item.quoteStart : null,
			quoteEnd: typeof item.quoteEnd === 'number' ? item.quoteEnd : null,
			anchorAmbiguous: typeof item.anchorAmbiguous === 'boolean' ? item.anchorAmbiguous : undefined,
		};
	});
}

/** Tolerant parse of the stored rubric breakdown JSON column. */
export function parseRubric(value: unknown): EvalRubricRow[] {
	if (typeof value === 'string') {
		try {
			return parseRubric(JSON.parse(value));
		} catch {
			return [];
		}
	}
	if (!value || !Array.isArray(value)) return [];
	return (value as EvalRubricRow[]).filter(
		(item): item is EvalRubricRow =>
			!!item &&
			typeof item === 'object' &&
			typeof item.criterion === 'string' &&
			item.criterion.trim().length > 0 &&
			typeof item.score === 'number' &&
			Number.isFinite(item.score),
	);
}

/** Tolerant parse of the stored citations JSON column. */
export function parseCitations(value: unknown): EvalCitation[] {
	if (typeof value === 'string') {
		try {
			return parseCitations(JSON.parse(value));
		} catch {
			return [];
		}
	}
	if (!value || !Array.isArray(value)) return [];
	return (value as EvalCitation[]).filter(
		(item): item is EvalCitation =>
			!!item && typeof item === 'object' && typeof item.section === 'string',
	);
}

/** Tolerant parse of the lecturer's stored review findings (Phase 2/3). */
export function parseReviewFindings(value: unknown): ReviewFinding[] {
	if (typeof value === 'string') {
		try {
			return parseReviewFindings(JSON.parse(value));
		} catch {
			return [];
		}
	}
	if (!value || !Array.isArray(value)) return [];
	const out: ReviewFinding[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const f = item as Record<string, unknown>;
		if (typeof f.id !== 'string' || !f.id) continue;
		if (f.source !== 'ai' && f.source !== 'lecturer') continue;
		if (f.severity !== 'minor' && f.severity !== 'major') continue;
		if (typeof f.note !== 'string' || !f.note.trim()) continue;
		if (typeof f.quote !== 'string') continue;
		if (typeof f.evidence !== 'string') continue;
		if (typeof f.status !== 'string') continue;
		out.push({
			id: f.id,
			source: f.source,
			severity: f.severity,
			quote: f.quote,
			note: f.note,
			evidence: f.evidence,
			status: f.status as ReviewStatus,
			criterion: typeof f.criterion === 'string' ? f.criterion.slice(0, 200) : '',
			// Phase 2 structured feedback — preserved through the review round-trip.
			category: typeof f.category === 'string' ? f.category.slice(0, 64) : '',
			subcategory: typeof f.subcategory === 'string' ? f.subcategory.slice(0, 64) : '',
			errorDescription:
				typeof f.errorDescription === 'string' ? f.errorDescription.slice(0, 600) : '',
			correction: typeof f.correction === 'string' ? f.correction.slice(0, 600) : '',
			explanation: typeof f.explanation === 'string' ? f.explanation.slice(0, 1000) : '',
			...(typeof f.confidence === 'number' && Number.isFinite(f.confidence)
				? { confidence: Math.max(0, Math.min(1, f.confidence)) }
				: {}),
			anchorValid: typeof f.anchorValid === 'boolean' ? f.anchorValid : undefined,
			quoteStart: typeof f.quoteStart === 'number' ? f.quoteStart : null,
			quoteEnd: typeof f.quoteEnd === 'number' ? f.quoteEnd : null,
			anchorAmbiguous: typeof f.anchorAmbiguous === 'boolean' ? f.anchorAmbiguous : undefined,
			rejectReason: typeof f.rejectReason === 'string' ? f.rejectReason.slice(0, 600) : '',
		});
	}
	return out;
}

/**
 * Derives the lecturer's initial working copy from the AI draft's findings:
 * every AI recommendation starts as 'pending' review, untouched. Each finding
 * is mapped to the rubric criterion it most affects — using the server-assigned
 * criterion when present, otherwise a best-effort automatic mapping from the
 * finding's note/quote against the task's own stored criteria.
 */
export function deriveAiReviewFindings(
	findings: EvalFinding[],
	criteria?: RubricCriterion[],
): ReviewFinding[] {
	return findings.map((finding, index) => {
		let criterion = normalizeCriterionId(finding.criterion || '', criteria ?? []);
		if (!criterion && criteria && criteria.length > 0) {
			criterion = autoAssignCriterion(finding.note, finding.quote, criteria);
		}
		return {
			id: `ai-${index}`,
			source: 'ai',
			severity: finding.severity,
			quote: finding.quote,
			note: finding.note,
			evidence: finding.evidence,
			status: 'pending',
			criterion,
			// Phase 2 — carry the AI's structured classification and anchor state
			// into the lecturer's working copy. These are AI output, not ground
			// truth; the lecturer reviews them but they are never auto-applied.
			category: finding.category,
			subcategory: finding.subcategory,
			errorDescription: finding.errorDescription,
			correction: finding.correction,
			explanation: finding.explanation,
			confidence: finding.confidence,
			anchorValid: finding.anchorValid,
			quoteStart: finding.quoteStart,
			quoteEnd: finding.quoteEnd,
			anchorAmbiguous: finding.anchorAmbiguous,
			rejectReason: '',
		};
	});
}

/**
 * Normalizes a saved review's criterion references (label → canonical id)
 * without reassigning any finding the lecturer already placed. Findings the
 * lecturer left as general ('') stay general — their explicit choice is kept.
 */
export function normalizeReviewFindings(
	findings: ReviewFinding[],
	criteria?: RubricCriterion[],
): ReviewFinding[] {
	if (!criteria || criteria.length === 0) return findings;
	return findings.map((finding) => ({
		...finding,
		criterion: normalizeCriterionId(finding.criterion || '', criteria),
	}));
}

export type MarkedSegment = {
	text: string;
	/** Present only on marked segments. */
	severity?: EvalSeverity;
	/** Index into the findings list the mark belongs to. */
	findingIndex?: number;
};

/**
 * Splits the ORIGINAL student text into segments, marking each quoted
 * finding in place. The text itself is never altered — findings are only
 * laid on top of it. Overlapping quotes keep the earliest finding; quotes
 * that do not match the text produce no mark (they were already dropped
 * server-side, this is defence in depth).
 */
export function buildMarkedSegments(text: string, findings: EvalFinding[]): MarkedSegment[] {
	type Match = { start: number; end: number; index: number; severity: EvalSeverity };
	const matches: Match[] = [];
	findings.forEach((finding, index) => {
		const quote = finding.quote.trim();
		if (!quote || quote.length > 300) return;
		// Phase 2 — never mark an invalid-anchor finding (its quote is not in the
		// text) and never guess which occurrence an ambiguous quote refers to.
		// Old findings without anchor fields fall back to indexOf (backward compat).
		if (finding.anchorValid === false) return;
		if (finding.anchorAmbiguous) return;
		let start: number;
		if (typeof finding.quoteStart === 'number' && finding.quoteStart >= 0) {
			start = finding.quoteStart;
		} else {
			const found = text.indexOf(quote);
			if (found === -1) return;
			start = found;
		}
		const end = typeof finding.quoteEnd === 'number' ? finding.quoteEnd : start + quote.length;
		matches.push({ start, end, index, severity: finding.severity });
	});
	matches.sort((a, b) => a.start - b.start || b.end - a.end);

	const accepted: Match[] = [];
	let cursor = 0;
	for (const match of matches) {
		if (match.start < cursor) continue; // overlap — keep the earliest
		accepted.push(match);
		cursor = match.end;
	}

	const segments: MarkedSegment[] = [];
	let position = 0;
	for (const match of accepted) {
		if (match.start > position) segments.push({ text: text.slice(position, match.start) });
		segments.push({
			text: text.slice(match.start, match.end),
			severity: match.severity,
			findingIndex: match.index,
		});
		position = match.end;
	}
	if (position < text.length) segments.push({ text: text.slice(position) });
	return segments;
}

/**
 * Fire-and-forget request for an AI evaluation draft right after a successful
 * final submission (enrolled channel). The submission is already stored — a
 * failed or unavailable analysis never affects the submission itself.
 */
export async function requestEvaluationDraft(submissionId: string): Promise<void> {
	const token = pb.authStore.token;
	if (!token || !submissionId) return;
	try {
		await fetch('/api/evaluation-draft', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ submissionId }),
		});
	} catch {
		/* background convenience only — the lecturer view also prepares drafts */
	}
}
