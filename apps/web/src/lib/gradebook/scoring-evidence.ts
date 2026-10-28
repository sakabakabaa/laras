/**
 * Scoring proposal validators — the deterministic, SYNTAX-LEVEL gate between
 * what a model proposes per rubric criterion and what a lecturer is shown for
 * review.
 *
 * This module is pure: no database, no framework, no network, no model calls.
 * It never calls a model; it validates the shape and provenance of what a model
 * returned. The plan (PR 7) requires that every proposed criterion score carries
 * a rubric anchor, a quote from the student's own work and an explanation, and
 * that unsupported findings are rejected by deterministic validators — never
 * silently kept, never silently defaulted to zero.
 *
 * What this gate does NOT do — read before trusting it:
 *
 *  - It is a syntactic evidence check, not a scoring-validity check. A quote
 *    that appears in the submission proves only that the quoted characters
 *    occur there. It does not prove the quote supports the anchor, that the
 *    points are fair, or that the model's judgement is correct. Passing this
 *    gate means "the proposal is well-formed and its quotes are traceable",
 *    nothing more.
 *  - It never approves publication. `isReviewable` means "eligible to be put
 *    in front of a lecturer". The report always carries `approvalRequired: true`
 *    and `gate: 'syntactic_evidence_only'`; a human decision is a separate step
 *    owned by the review/publication flow, never by this module and never by
 *    the model.
 *
 * Design notes:
 *  - Student text is UNTRUSTED data. A quote that reads like an instruction
 *    aimed at the model is rejected (`evidence_is_instruction`) and is never
 *    acted on. This is prompt-injection defence: rejecting is the safe outcome
 *    even though it may occasionally reject legitimate student text, because a
 *    quoted instruction would otherwise be surfaced to a reviewer as trusted
 *    model reasoning. Only deterministic code acts on rejections.
 *  - Evidence is compared after whitespace normalisation and case-insensitively
 *    so a legitimate quote survives harmless copy variations, but a minimum
 *    quote length is required. The floor raises the cost of "supporting" a
 *    claim with a single common word; it does NOT guarantee the quote is
 *    multiword (a 12+ character word still passes) and no word-count rule is
 *    enforced. Treat a passing quote as "these characters are present", not as
 *    adequate evidence.
 *  - A rubric criterion may be proposed at most once. Duplicates are rejected
 *    wholesale because accepting one of two conflicting proposals would be an
 *    arbitrary choice and accepting both would double-count points.
 */
import { SCORE_PRECISION } from './validation';

export type RubricCriterion = {
	id: string;
	label: string;
	maxPoints: number;
};

export type ProposedCriterion = {
	criterionId: string;
	points: number;
	/** Rubric anchor cited by the model (e.g. "fully meets expectations"). */
	anchor: string;
	/** Verbatim quote from the student's submitted work. */
	evidence: string;
	/** Why this evidence supports the anchor and the points. */
	explanation: string;
};

export type RejectionCode =
	| 'unknown_criterion'
	| 'duplicate_criterion'
	| 'invalid_rubric'
	| 'malformed_proposal'
	| 'points_not_finite'
	| 'points_out_of_range'
	| 'missing_anchor'
	| 'missing_evidence'
	| 'missing_explanation'
	| 'unsupported_evidence'
	| 'evidence_is_instruction'
	| 'missing_criterion';

export type RejectedProposal = {
	criterionId: string;
	code: RejectionCode;
	message: string;
};

export type ValidationReport = {
	/** True only when nothing was rejected and every criterion is covered. */
	ok: boolean;
	accepted: ProposedCriterion[];
	rejected: RejectedProposal[];
	/** Rubric criteria with no proposal at all, reported separately. */
	missing: RubricCriterion[];
	/**
	 * Always true. A clean report is structurally reviewable; publication still
	 * requires an explicit lecturer decision in the review/publication flow.
	 */
	approvalRequired: true;
	/** Names the strength of this gate so callers cannot over-read `ok`. */
	gate: 'syntactic_evidence_only';
};

/** Shortest evidence quote accepted. See module comment for what it proves. */
export const MIN_QUOTE_LENGTH = 12;

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** Indonesian phrases that mark text written as an instruction to the model. */
const INJECTION_PATTERNS = [
	'ignore previous',
	'ignore all previous',
	'disregard previous',
	'disregard all previous',
	'you must give',
	'you must assign',
	'you are now',
	'as an ai language model',
	'system prompt',
	'abaikan instruksi',
	'abaikan semua instruksi',
	'abaikan perintah sebelumnya',
	'beri nilai penuh',
	'berikan nilai penuh',
	'beri nilai maksimal',
	'kamu harus memberi',
	'anda harus memberi',
	'anggap kamu',
	'act as',
	'pretend to be',
];

const looksLikeInstruction = (quote: string): boolean => {
	const text = normalize(quote);
	return INJECTION_PATTERNS.some((pattern) => text.includes(pattern));
};

const decimalPlaces = (value: number): number => {
	const text = String(value);
	const dot = text.indexOf('.');
	return dot === -1 ? 0 : text.length - dot - 1;
};

/** A usable rubric maximum is a finite, non-negative number. */
const isValidMax = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0;

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Stable Indonesian message per rejection code; callers never inline prose. */
export function describeRejection(code: RejectionCode): string {
	switch (code) {
		case 'unknown_criterion':
			return 'Kriteria tidak ada dalam rubrik; model tidak boleh membuat kriteria baru.';
		case 'duplicate_criterion':
			return 'Kriteria yang sama diusulkan lebih dari sekali; usulan ganda ditolak agar poin tidak terhitung dobel.';
		case 'invalid_rubric':
			return 'Maksimum poin kriteria rubrik tidak sah; perbaiki rubrik sebelum menilai.';
		case 'malformed_proposal':
			return 'Usulan tidak terbaca: setiap usulan harus berupa objek dengan criterionId teks.';
		case 'points_not_finite':
			return 'Poin harus berupa angka yang terhingga (bukan NaN atau tak hingga).';
		case 'points_out_of_range':
			return `Poin harus antara 0 dan maksimum kriteria, dengan maksimal ${SCORE_PRECISION} angka desimal.`;
		case 'missing_anchor':
			return 'Usulan tidak menyebut acuan rubrik.';
		case 'missing_evidence':
			return 'Usulan tidak menyertakan kutipan bukti dari kiriman mahasiswa.';
		case 'missing_explanation':
			return 'Usulan tidak menyertakan penjelasan mengapa bukti mendukung acuan.';
		case 'unsupported_evidence':
			return 'Kutipan bukti tidak ditemukan dalam teks kiriman mahasiswa.';
		case 'evidence_is_instruction':
			return 'Kutipan bukti menyerupai instruksi kepada model dan ditolak sebagai upaya prompt injection.';
		case 'missing_criterion':
			return 'Kriteria rubrik tidak memiliki usulan nilai; minta model menilai ulang kriteria ini.';
	}
}

/**
 * Validate a full model proposal against the rubric and the student's text.
 *
 * Accepts unknown-shaped runtime input on purpose: a model response is parsed
 * JSON from outside the type system, so malformed entries are rejected instead
 * of throwing. Per-criterion rejections are independent — one bad proposal
 * never drops good ones. A rubric criterion with no proposal is reported via
 * `missing_criterion` (and `missing`); it is never silently defaulted to 0,
 * matching the existing evaluation pipeline's rule that stored rubrics govern
 * the total.
 */
export function validateProposal(input: {
	criteria: RubricCriterion[];
	proposal: ProposedCriterion[];
	sourceText: string;
}): ValidationReport {
	const rawCriteria: unknown = input?.criteria;
	const rawProposal: unknown = input?.proposal;
	const rawSource: unknown = input?.sourceText;
	const sourceText = typeof rawSource === 'string' ? rawSource : '';

	const criteria: RubricCriterion[] = (Array.isArray(rawCriteria) ? rawCriteria : [])
		.filter(
			(item): item is RubricCriterion =>
				!!item && typeof item === 'object' && typeof (item as RubricCriterion).id === 'string',
		)
		.map((item) => ({ id: item.id, label: asText(item.label), maxPoints: item.maxPoints }));

	const items: unknown[] = Array.isArray(rawProposal) ? rawProposal : [];

	const byId = new Map(criteria.map((c) => [c.id, c]));
	const normalizedSource = normalize(sourceText);
	const accepted: ProposedCriterion[] = [];
	const rejected: RejectedProposal[] = [];
	const seen = new Set<string>();

	const reject = (criterionId: string, code: RejectionCode): void => {
		rejected.push({ criterionId, code, message: describeRejection(code) });
	};

	// A response whose top-level shape is wrong is malformed input, not an empty
	// proposal: reporting it as reviewable would let a broken response pass.
	if (!Array.isArray(rawCriteria) || !Array.isArray(rawProposal) || typeof rawSource !== 'string') {
		reject('(input)', 'malformed_proposal');
	}

	// Count proposals per criterion up front: a criterion proposed twice is
	// ambiguous, and accepting either one would be an arbitrary choice while
	// accepting both would double-count points.
	const occurrences = new Map<string, number>();
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const id = (item as { criterionId?: unknown }).criterionId;
		if (typeof id !== 'string') continue;
		// Key on the trimmed id: the processing loop trims too, so "grammar" and
		// " grammar" are the same criterion and must not both be accepted.
		const key = id.trim();
		if (!key) continue;
		occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
	}

	for (const item of items) {
		// Runtime malformed input: a model response is untrusted parsed JSON.
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			reject('(malformed)', 'malformed_proposal');
			continue;
		}
		const row = item as Record<string, unknown>;
		const criterionId = typeof row.criterionId === 'string' ? row.criterionId.trim() : '';
		if (!criterionId) {
			reject('(tanpa id)', 'malformed_proposal');
			continue;
		}

		const criterion = byId.get(criterionId);
		if (!criterion) {
			reject(criterionId, 'unknown_criterion');
			continue;
		}
		seen.add(criterionId);

		if ((occurrences.get(criterionId) ?? 0) > 1) {
			reject(criterionId, 'duplicate_criterion');
			continue;
		}

		// A rubric maximum that is not a finite non-negative number makes every
		// range check meaningless, so the criterion cannot be scored at all.
		if (!isValidMax(criterion.maxPoints)) {
			reject(criterionId, 'invalid_rubric');
			continue;
		}

		if (typeof row.points !== 'number' || !Number.isFinite(row.points)) {
			reject(criterionId, 'points_not_finite');
			continue;
		}
		const points = row.points;
		if (points < 0 || points > criterion.maxPoints || decimalPlaces(points) > SCORE_PRECISION) {
			reject(criterionId, 'points_out_of_range');
			continue;
		}

		const anchor = asText(row.anchor).trim();
		if (!anchor) {
			reject(criterionId, 'missing_anchor');
			continue;
		}

		const evidence = asText(row.evidence).trim();
		if (!evidence) {
			reject(criterionId, 'missing_evidence');
			continue;
		}

		// Prompt-injection defence first: a quote written as an instruction is
		// rejected outright and never surfaced as trustworthy model reasoning.
		// Rejecting legitimate-looking text is the safe outcome.
		if (looksLikeInstruction(evidence)) {
			reject(criterionId, 'evidence_is_instruction');
			continue;
		}

		// Anti-hallucination gate: the quote must actually appear in the
		// student's text. Whitespace is normalised and comparison is
		// case-insensitive so copy variations pass. The length floor makes a
		// single common word an expensive way to "support" a claim; it is a
		// floor, not proof that the quote is multiword or relevant.
		if (normalize(evidence).length < MIN_QUOTE_LENGTH) {
			reject(criterionId, 'unsupported_evidence');
			continue;
		}
		if (!normalizedSource.includes(normalize(evidence))) {
			reject(criterionId, 'unsupported_evidence');
			continue;
		}

		// A quote with no reasoning is an unsupported finding, and has its own
		// code so callers can ask the model to explain rather than re-quote.
		const explanation = asText(row.explanation).trim();
		if (!explanation) {
			reject(criterionId, 'missing_explanation');
			continue;
		}

		accepted.push({
			criterionId,
			points,
			anchor,
			evidence,
			explanation,
		});
	}

	const missing = criteria.filter((c) => !seen.has(c.id));
	for (const criterion of missing) {
		reject(criterion.id, 'missing_criterion');
	}

	return {
		ok: rejected.length === 0,
		accepted,
		rejected,
		missing,
		approvalRequired: true,
		gate: 'syntactic_evidence_only',
	};
}

/** Sum of accepted points, rounded to the stored precision. */
export function criterionTotals(accepted: ProposedCriterion[]): number {
	const sum = (Array.isArray(accepted) ? accepted : []).reduce(
		(total, item) => (Number.isFinite(item?.points) ? total + item.points : total),
		0,
	);
	return Math.round(sum * 10 ** SCORE_PRECISION) / 10 ** SCORE_PRECISION;
}

/**
 * True when the report is structurally complete and unrejected — meaning it is
 * eligible to be shown to a lecturer for review.
 *
 * This is NOT publication approval. Even a fully valid proposal always carries
 * `approvalRequired: true`; the lecturer's explicit decision is a separate step
 * in the review/publication flow, never something this module can grant.
 */
export function isReviewable(report: ValidationReport): boolean {
	return report.rejected.length === 0 && report.missing.length === 0;
}

/**
 * Historical name kept for callers that adopted the PR 7 sketch.
 *
 * @deprecated Use `isReviewable`. The name suggests publication authority this
 * gate does not have; `approvalRequired` is always true.
 */
export function isPublishable(report: ValidationReport): boolean {
	return isReviewable(report);
}
