/**
 * Phase 10.3 — multi-rater research judgment management (client-safe, pure).
 *
 * The `ai_feedback_items.raterJudgments` JSON column (added in Phase 10.2)
 * stores an APPEND-ONLY array of independent rater judgments plus an optional
 * adjudication. This module is the single source of truth for reading and
 * appending to that array so that:
 *
 *  - Rater 1 and Rater 2 judgments remain INDEPENDENT — Rater 2 never
 *    overwrites Rater 1, and a later adjudication never destroys the original
 *    independent judgments.
 *  - Each judgment retains its annotation round, reviewer identity, the
 *    controlled judgment values, reviewedAt, and an optional note.
 *  - The adjudicated (final) judgment is distinguishable from the independent
 *    judgments.
 *  - A single reviewer is never silently treated as two raters, and Rater 2
 *    data is never fabricated from an existing reviewer.
 *  - Existing single-reviewer records (no `raterJudgments`) remain valid and
 *    unchanged — they parse to one round-1 judgment-less empty array.
 *
 * All judgment values use the SAME controlled vocabularies defined in
 * `research-annotation.ts` (detection / correction / explanation /
 * completeness / necessity / pedagogical). This module never introduces
 * arbitrary labels.
 */

/** Annotation round: 1 = Rater 1, 2 = Rater 2, 0 = adjudication (final). */
export type RaterRound = 1 | 2 | 0;

export const ADJUDICATION_ROUND = 0;
export const RATER_1_ROUND = 1;
export const RATER_2_ROUND = 2;

/**
 * One independent rater judgment or one adjudication entry. Every field is
 * optional except the round, reviewer, and reviewedAt so a rater may record a
 * partial judgment. The controlled values are validated by the server before
 * a judgment is appended; this type only carries them.
 */
export type RaterJudgment = {
	round: RaterRound;
	/** Internal reviewer user id (pseudonymized in external exports). */
	reviewer: string;
	reviewedAt: string;
	note?: string;
	errorPresent?: string;
	detectionJudgment?: string;
	correctionJudgment?: string;
	explanationJudgment?: string;
	completenessJudgment?: string;
	necessityJudgment?: string;
	pedagogicalJudgment?: string;
	referenceCategory?: string;
	referenceSubcategory?: string;
	referenceSeverity?: string;
	referenceCorrection?: string;
	referenceExplanation?: string;
};

/** Tolerant parse of the stored `raterJudgments` JSON column. */
export function parseRaterJudgments(value: unknown): RaterJudgment[] {
	let raw: unknown = value;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(raw)) return [];
	const out: RaterJudgment[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
		const e = entry as Record<string, unknown>;
		const round = e.round;
		if (round !== 0 && round !== 1 && round !== 2) continue;
		const reviewer = typeof e.reviewer === 'string' ? e.reviewer : '';
		const reviewedAt = typeof e.reviewedAt === 'string' ? e.reviewedAt : '';
		if (!reviewer || !reviewedAt) continue;
		const j: RaterJudgment = { round, reviewer, reviewedAt };
		if (typeof e.note === 'string' && e.note.trim()) j.note = e.note.slice(0, 2000);
		for (const field of [
			'errorPresent',
			'detectionJudgment',
			'correctionJudgment',
			'explanationJudgment',
			'completenessJudgment',
			'necessityJudgment',
			'pedagogicalJudgment',
			'referenceCategory',
			'referenceSubcategory',
			'referenceSeverity',
			'referenceCorrection',
			'referenceExplanation',
		] as const) {
			const v = e[field];
			if (typeof v === 'string' && v.trim()) (j as Record<string, unknown>)[field] = v.slice(0, 2000);
		}
		out.push(j);
	}
	return out;
}

/**
 * Appends one rater judgment to the immutable history WITHOUT overwriting a
 * different rater's entry.
 *
 * - An entry with the SAME (round, reviewer) is REPLACED in place (a rater
 *   editing their own judgment). This never touches another reviewer's entry.
 * - An entry with a DIFFERENT reviewer or round is APPENDED.
 * - Adjudication (round 0) is keyed by round only — at most one adjudication
 *   exists; a new adjudication replaces a prior one but never touches the
 *   independent Rater 1 / Rater 2 judgments.
 *
 * Returns a NEW array (the input is never mutated). Throws when an attempt is
 * made to fabricate a second rater from the same reviewer on the same round
 * (round 1/2 are per-reviewer; a reviewer cannot occupy two slots on one
 * round).
 */
export function appendRaterJudgment(
	existing: RaterJudgment[],
	next: RaterJudgment,
): RaterJudgment[] {
	const filtered = existing.filter((j) => {
		if (next.round === ADJUDICATION_ROUND) return j.round !== ADJUDICATION_ROUND;
		// Independent round: replace only the same reviewer's entry on that round.
		return !(j.round === next.round && j.reviewer === next.reviewer);
	});
	return [...filtered, next];
}

/** All independent (non-adjudication) judgments for one round. */
export function judgmentsForRound(judgments: RaterJudgment[], round: 1 | 2): RaterJudgment[] {
	return judgments.filter((j) => j.round === round);
}

// ── Phase 10.4 — rater identity independence ───────────────────────────────

export type RaterIndependenceOk = { ok: true };
export type RaterIndependenceError = { ok: false; message: string };
export type RaterIndependenceResult = RaterIndependenceOk | RaterIndependenceError;

/**
 * Phase 10.4 — validates that an incoming rater judgment preserves
 * independent-rater integrity. This is the SERVER-SIDE enforcement of the
 * research protocol; the UI role selector is a convenience, not a guard.
 *
 * Rules (safest explicit handling; no third-person policy is invented):
 *
 *  - Independent round (1 or 2): the reviewer MUST NOT already be recorded as
 *    the OTHER independent round's reviewer for this item. The same reviewer
 *    re-saving their OWN round (editing) is allowed — that replaces only their
 *    own entry and never touches the other rater.
 *  - Adjudication (round 0): the adjudicator MUST NOT be the same person as
 *    Rater 1 or Rater 2. An adjudicator is never silently converted from an
 *    independent rater. If the protocol later permits a rater to also
 *    adjudicate, that must be an explicit configuration change here.
 *
 * Returns `{ ok: false, message }` when the operation must be rejected. The
 * caller MUST NOT modify existing judgments on rejection.
 */
export function validateRaterIndependence(
	existing: RaterJudgment[],
	next: RaterJudgment,
): RaterIndependenceResult {
	if (next.round === ADJUDICATION_ROUND) {
		const r1 = rater1Judgment(existing);
		const r2 = rater2Judgment(existing);
		if (r1 && r1.reviewer === next.reviewer) {
			return {
				ok: false,
				message:
					'Adjudicator tidak boleh sama dengan Rater 1 — adjudikasi harus dilakukan oleh peninjau yang berbeda dari rater independen.',
			};
		}
		if (r2 && r2.reviewer === next.reviewer) {
			return {
				ok: false,
				message:
					'Adjudicator tidak boleh sama dengan Rater 2 — adjudikasi harus dilakukan oleh peninjau yang berbeda dari rater independen.',
			};
		}
		return { ok: true };
	}
	// Independent round: the reviewer must not already occupy the other round.
	const otherRound = next.round === RATER_1_ROUND ? RATER_2_ROUND : RATER_1_ROUND;
	const other = judgmentsForRound(existing, otherRound)[0];
	if (other && other.reviewer === next.reviewer) {
		return {
			ok: false,
			message: `Peninjau sudah tercatat sebagai ${
				otherRound === RATER_1_ROUND ? 'Rater 1' : 'Rater 2'
			} — Rater 1 dan Rater 2 harus peninjau yang berbeda.`,
		};
	}
	return { ok: true };
}

/** The adjudication entry, or null when no adjudication has been recorded. */
export function adjudicationJudgment(judgments: RaterJudgment[]): RaterJudgment | null {
	return judgments.find((j) => j.round === ADJUDICATION_ROUND) ?? null;
}

/** The first Rater 1 judgment, or null. */
export function rater1Judgment(judgments: RaterJudgment[]): RaterJudgment | null {
	return judgmentsForRound(judgments, RATER_1_ROUND)[0] ?? null;
}

/** The first Rater 2 judgment, or null. */
export function rater2Judgment(judgments: RaterJudgment[]): RaterJudgment | null {
	return judgmentsForRound(judgments, RATER_2_ROUND)[0] ?? null;
}

/**
 * The FINAL research judgment: the adjudication when one exists, otherwise
 * null. Independent rater judgments are NEVER silently promoted to "final" —
 * a caller that needs an independent judgment must request it explicitly.
 */
export function finalResearchJudgment(judgments: RaterJudgment[]): RaterJudgment | null {
	return adjudicationJudgment(judgments);
}

/** True when an adjudication entry exists (the item is gold-standard). */
export function hasAdjudication(judgments: RaterJudgment[]): boolean {
	return adjudicationJudgment(judgments) !== null;
}

export type FieldAgreement = 'agreed' | 'disagreed' | 'incomplete';

/**
 * Compares two independent rater judgments on one field. Returns 'incomplete'
 * when either rater left the field empty — a missing judgment is never treated
 * as agreement or disagreement.
 */
export function fieldAgreement(
	r1: RaterJudgment | null,
	r2: RaterJudgment | null,
	field: keyof RaterJudgment,
): FieldAgreement {
	const v1 = r1 ? r1[field] : undefined;
	const v2 = r2 ? r2[field] : undefined;
	if (!v1 || !v2) return 'incomplete';
	return v1 === v2 ? 'agreed' : 'disagreed';
}

export type RaterAgreementSummary = {
	/** True when both Rater 1 and Rater 2 exist. */
	bothRatersPresent: boolean;
	/** True when an adjudication has been recorded. */
	adjudicated: boolean;
	/** Per-field agreement across the controlled judgment fields. */
	fields: Partial<Record<keyof RaterJudgment, FieldAgreement>>;
	/** 'agreed' only when every comparable field agrees; else 'disagreed' or 'incomplete'. */
	overall: FieldAgreement;
};

const AGREEMENT_FIELDS: (keyof RaterJudgment)[] = [
	'detectionJudgment',
	'correctionJudgment',
	'explanationJudgment',
	'completenessJudgment',
	'necessityJudgment',
	'pedagogicalJudgment',
	'referenceCategory',
	'referenceSubcategory',
	'referenceSeverity',
];

/**
 * Summarizes the agreement between Rater 1 and Rater 2 across the controlled
 * judgment fields. Does NOT compute a reliability coefficient — it preserves
 * only the data needed for later statistical analysis (agreed / disagreed /
 * incomplete per field, whether adjudication occurred).
 */
export function summarizeRaterAgreement(judgments: RaterJudgment[]): RaterAgreementSummary {
	const r1 = rater1Judgment(judgments);
	const r2 = rater2Judgment(judgments);
	const adjudicated = hasAdjudication(judgments);
	const bothRatersPresent = !!r1 && !!r2;
	const fields: Partial<Record<keyof RaterJudgment, FieldAgreement>> = {};
	let anyDisagreed = false;
	let anyIncomplete = false;
	let anyCompared = false;
	for (const field of AGREEMENT_FIELDS) {
		const a = fieldAgreement(r1, r2, field);
		fields[field] = a;
		if (a === 'disagreed') anyDisagreed = true;
		if (a === 'incomplete') anyIncomplete = true;
		if (a !== 'incomplete') anyCompared = true;
	}
	let overall: FieldAgreement = 'incomplete';
	if (!bothRatersPresent) {
		overall = 'incomplete';
	} else if (anyDisagreed) {
		overall = 'disagreed';
	} else if (anyCompared) {
		overall = 'agreed';
	} else {
		overall = 'incomplete';
	}
	return { bothRatersPresent, adjudicated, fields, overall };
}
