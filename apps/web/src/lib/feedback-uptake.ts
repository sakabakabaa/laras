/**
 * Phase 9 — client-safe shared types and pure helpers for feedback uptake and
 * revision analytics. Server-only data loading lives in
 * `feedback-uptake.server.ts`; this file stays importable from components.
 *
 * Research principle: the system records OBSERVABLE behavior only — which hint
 * levels a student requested, whether their answer changed, whether a revision
 * was created. It NEVER assumes that viewing feedback means successful
 * learning, and NEVER auto-assigns uptake judgments (those are human-only).
 */

/** Attribution of a revision to a feedback event — never guessed. */
export type AttributionStatus = 'confirmed' | 'uncertain' | 'rejected';

/** Human-only uptake classification for one feedback→revision association. */
export type UptakeJudgment =
	| 'successful_uptake'
	| 'partial_uptake'
	| 'unsuccessful_uptake'
	| 'no_uptake'
	| 'not_applicable';

/** Error status before the student revised (researcher assessment). */
export type BeforeRevisionStatus = 'error' | 'acceptable' | 'unclear';

/** Error outcome after the student revised (researcher assessment). */
export type AfterRevisionStatus =
	| 'corrected'
	| 'partially_corrected'
	| 'unchanged'
	| 'worsened'
	| 'introduced_new_error'
	| 'unclear';

export const ATTRIBUTION_LABEL: Record<AttributionStatus, string> = {
	confirmed: 'Terkonfirmasi',
	uncertain: 'Tidak pasti',
	rejected: 'Ditolak',
};

export const UPTAKE_JUDGMENT_LABEL: Record<UptakeJudgment, string> = {
	successful_uptake: 'Berhasil diadopsi',
	partial_uptake: 'Sebagian diadopsi',
	unsuccessful_uptake: 'Tidak berhasil diadopsi',
	no_uptake: 'Tidak diadopsi',
	not_applicable: 'Tidak dapat dievaluasi',
};

export const UPTAKE_JUDGMENT_DESCRIPTION: Record<UptakeJudgment, string> = {
	successful_uptake:
		'Mahasiswa menanggapi masukan dengan benar dan bentuk revisi sudah tepat.',
	partial_uptake:
		'Mahasiswa menanggapi masukan tetapi masalah sebagian masih belum teratasi atau muncul masalah terkait.',
	unsuccessful_uptake:
		'Mahasiswa mencoba menanggapi masukan tetapi hasilnya keliru atau kurang tepat.',
	no_uptake: 'Mahasiswa tidak secara bermakna menindaklanjuti masukan terkait.',
	not_applicable: 'Revisi tidak dapat dievaluasi terhadap item umpan balik ini.',
};

export const BEFORE_STATUS_LABEL: Record<BeforeRevisionStatus, string> = {
	error: 'Ada kesalahan',
	acceptable: 'Dapat diterima',
	unclear: 'Tidak jelas',
};

export const AFTER_STATUS_LABEL: Record<AfterRevisionStatus, string> = {
	corrected: 'Diperbaiki',
	partially_corrected: 'Sebagian diperbaiki',
	unchanged: 'Tidak berubah',
	worsened: 'Memburuk',
	introduced_new_error: 'Muncul kesalahan baru',
	unclear: 'Tidak jelas',
};

export const UPTAKE_JUDGMENT_OPTIONS = Object.entries(UPTAKE_JUDGMENT_LABEL).map(
	([value, label]) => ({ value: value as UptakeJudgment, label }),
);

export const BEFORE_STATUS_OPTIONS = Object.entries(BEFORE_STATUS_LABEL).map(
	([value, label]) => ({ value: value as BeforeRevisionStatus, label }),
);

export const AFTER_STATUS_OPTIONS = Object.entries(AFTER_STATUS_LABEL).map(
	([value, label]) => ({ value: value as AfterRevisionStatus, label }),
);

export const ATTRIBUTION_OPTIONS = Object.entries(ATTRIBUTION_LABEL).map(
	([value, label]) => ({ value: value as AttributionStatus, label }),
);

/** Progressive hint levels (Phase 8). Level 4 = explicit correction. */
export const MAX_PROGRESSIVE_LEVEL = 3;
export const EXPLICIT_CORRECTION_LEVEL = 4;

/**
 * Deduplicates and sorts the hint levels a student progressed through before
 * a revision. Raw interaction data is preserved — this is presentation only.
 */
export function normalizeHintLevels(levels: number[]): number[] {
	return Array.from(new Set(levels.filter((l) => Number.isFinite(l) && l > 0))).sort(
		(a, b) => a - b,
	);
}

/**
 * The highest hint level reached before the revision — the "hint level
 * required" for hint-efficiency analysis. Level 4 (explicit correction) is
 * reported distinctly from the progressive 1–3 levels.
 */
export function maxHintLevelBeforeRevision(levels: number[]): number {
	const used = normalizeHintLevels(levels);
	return used.length > 0 ? used[used.length - 1] : 0;
}

/** True when the student reached Level 4 (explicit correction) before revising. */
export function requiredExplicitCorrection(levels: number[]): boolean {
	return normalizeHintLevels(levels).includes(EXPLICIT_CORRECTION_LEVEL);
}

// ── Participant isolation & association validation (Phase 10.1) ───────────
//
// The feedback→revision→uptake pipeline MUST never combine attempts belonging
// to different students. These pure helpers enforce that invariant and are
// unit-tested directly (Tests A–H). They carry no server imports.

/** Minimal check-attempt reference for participant-isolated computation. */
export type AttemptRef = {
	id: string;
	/** Assignment/activity the attempt belongs to. */
	assignment: string;
	/** Stable participant identity (enrolled user id or public identity key). */
	identityKey: string;
	created: string;
	level?: number | null;
};

/** A server validation error (mirrors the route's apiError shape). */
export type ValidationError = { status: number; message: string };

/**
 * Participant-isolated hint-level sequence before a revision.
 *
 * CRITICAL research-integrity rule: only attempts belonging to the SAME
 * participant (identityKey) as the revision attempt are considered — never
 * the whole assignment's attempts. The chain is sorted chronologically
 * (created, then id as a stable tiebreaker) and truncated at the revision
 * attempt. Returns the deduplicated, sorted hint levels reached.
 *
 * This function is deliberately defensive: even if a caller passes every
 * attempt for an assignment, it filters to the revision's participant first,
 * so one student's revision can never absorb another student's hints.
 */
export function hintLevelsBeforeRevision<T extends AttemptRef>(
	attempts: T[],
	revisionAttemptId: string,
): number[] {
	const revision = attempts.find((a) => a.id === revisionAttemptId);
	if (!revision) return [];
	const identityKey = revision.identityKey;
	const chain = attempts
		.filter((a) => a.identityKey === identityKey)
		.slice()
		.sort((a, b) => {
			const ta = Date.parse(a.created);
			const tb = Date.parse(b.created);
			const taOk = Number.isFinite(ta);
			const tbOk = Number.isFinite(tb);
			if (taOk && tbOk && ta !== tb) return ta - tb;
			if (taOk !== tbOk) return taOk ? -1 : 1;
			return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
		});
	const idx = chain.findIndex((a) => a.id === revisionAttemptId);
	if (idx === -1) return [];
	return chain
		.slice(0, idx + 1)
		.map((a) => (typeof a.level === 'number' && a.level > 0 ? a.level : 0))
		.filter((l) => l > 0);
}

/**
 * Validate that a feedback→revision association is participant-safe before it
 * is persisted. Enforces:
 *  - both attempts exist;
 *  - both belong to the supplied assignment (cross-assignment rejected);
 *  - both belong to the same assignment as each other;
 *  - both belong to the same participant identityKey (cross-student rejected);
 *  - the revision occurs at or after the feedback event (invalid chronology
 *    rejected; equal timestamps are allowed and resolved by id ordering).
 *
 * Returns null when the association is valid, otherwise a validation error.
 * This is the single source of truth for association validation — the server
 * route relies on it and never trusts frontend validation.
 */
export function validateAssociationPair(input: {
	assignmentId: string;
	feedbackAttempt: AttemptRef | null;
	revisionAttempt: AttemptRef | null;
}): ValidationError | null {
	const { assignmentId, feedbackAttempt, revisionAttempt } = input;
	if (!feedbackAttempt) {
		return { status: 404, message: 'Peristiwa umpan balik tidak ditemukan.' };
	}
	if (!revisionAttempt) {
		return { status: 404, message: 'Peristiwa revisi tidak ditemukan.' };
	}
	if (
		feedbackAttempt.assignment !== assignmentId ||
		revisionAttempt.assignment !== assignmentId
	) {
		return {
			status: 422,
			message: 'Upaya umpan balik dan revisi harus dari tugas yang sama.',
		};
	}
	if (feedbackAttempt.assignment !== revisionAttempt.assignment) {
		return {
			status: 422,
			message: 'Upaya umpan balik dan revisi harus dari tugas yang sama.',
		};
	}
	if (feedbackAttempt.identityKey !== revisionAttempt.identityKey) {
		return {
			status: 422,
			message: 'Upaya umpan balik dan revisi harus dari peserta yang sama.',
		};
	}
	const fbTime = Date.parse(feedbackAttempt.created);
	const revTime = Date.parse(revisionAttempt.created);
	if (Number.isFinite(fbTime) && Number.isFinite(revTime) && revTime < fbTime) {
		return {
			status: 422,
			message: 'Revisi tidak boleh terjadi sebelum umpan balik yang ditanggapi.',
		};
	}
	return null;
}

/**
 * Validate that a feedback_uptake annotation is consistent with the
 * feedback_revision it annotates. Enforces:
 *  - the feedback_revision exists;
 *  - the feedback_revision belongs to the supplied assignment (cross-assignment
 *    uptake rejected);
 *  - the feedback_revision carries both a feedbackAttempt and a revisionAttempt;
 *  - both referenced attempts exist and share the same participant identityKey.
 *
 * Returns null when consistent, otherwise a validation error. The uptake
 * annotation must belong to the exact revision relationship being evaluated.
 */
export function validateUptakeRelationship(input: {
	assignmentId: string;
	feedbackRevision: {
		assignment: string;
		feedbackAttempt: string;
		revisionAttempt: string;
	} | null;
	feedbackAttempt: AttemptRef | null;
	revisionAttempt: AttemptRef | null;
}): ValidationError | null {
	const { assignmentId, feedbackRevision, feedbackAttempt, revisionAttempt } = input;
	if (!feedbackRevision) {
		return { status: 404, message: 'Asosiasi umpan balik–revisi tidak ditemukan.' };
	}
	if (feedbackRevision.assignment !== assignmentId) {
		return {
			status: 422,
			message: 'Anotasi uptake harus merujuk asosiasi pada tugas yang sama.',
		};
	}
	if (!feedbackRevision.feedbackAttempt || !feedbackRevision.revisionAttempt) {
		return {
			status: 422,
			message: 'Asosiasi umpan balik–revisi tidak lengkap.',
		};
	}
	if (!feedbackAttempt || !revisionAttempt) {
		return { status: 404, message: 'Upaya umpan balik atau revisi tidak ditemukan.' };
	}
	if (feedbackAttempt.identityKey !== revisionAttempt.identityKey) {
		return {
			status: 422,
			message: 'Upaya umpan balik dan revisi harus dari peserta yang sama.',
		};
	}
	return null;
}

/**
 * Minimum number of annotated uptake items before a rate is shown.
 * Mirrors the Phase 7 MIN_ANNOTATED threshold.
 */
export const MIN_UPTAKE_ANNOTATED = 5;

/** One uptake record used for aggregate metric computation. */
export type UptakeRecord = {
	uptakeJudgment: UptakeJudgment | '';
	beforeRevisionStatus: BeforeRevisionStatus | '';
	afterRevisionStatus: AfterRevisionStatus | '';
	numberOfHints: number;
	maxHintLevel: number;
	requiredExplicit: boolean;
	cefrLevel: string;
	assignmentId: string;
	aiCategory: string;
	aiSubcategory: string;
	model: string;
};

/** Aggregate uptake metrics — rates are null when the sample is too small. */
export type UptakeAnalytics = {
	totalFeedbackItems: number;
	itemsWithRevisions: number;
	itemsWithUptakeAnnotation: number;
	successfulUptakeRate: number | null;
	partialUptakeRate: number | null;
	unsuccessfulUptakeRate: number | null;
	noUptakeRate: number | null;
	averageHintLevel: number | null;
	proportionLevel1: number | null;
	proportionLevel2: number | null;
	proportionLevel3: number | null;
	proportionExplicit: number | null;
};

function rate(count: number, total: number): number | null {
	if (total < MIN_UPTAKE_ANNOTATED) return null;
	return Math.round((count / total) * 1000) / 10;
}

/**
 * Pure computation of uptake analytics from annotated records. Rates are
 * suppressed (null) when fewer than MIN_UPTAKE_ANNOTATED items carry the
 * relevant judgment. No causality is inferred — these describe
 * "feedback-associated revision outcomes," not "AI-caused improvement."
 */
export function computeUptakeAnalytics(records: UptakeRecord[]): UptakeAnalytics {
	const withRevisions = records;
	const annotated = records.filter((r) => r.uptakeJudgment !== '');
	const total = annotated.length;

	const successful = annotated.filter((r) => r.uptakeJudgment === 'successful_uptake').length;
	const partial = annotated.filter((r) => r.uptakeJudgment === 'partial_uptake').length;
	const unsuccessful = annotated.filter((r) => r.uptakeJudgment === 'unsuccessful_uptake').length;
	const none = annotated.filter((r) => r.uptakeJudgment === 'no_uptake').length;

	const hintLevels = withRevisions.filter((r) => r.maxHintLevel > 0);
	const hintTotal = hintLevels.length;
	const averageHintLevel =
		hintTotal >= MIN_UPTAKE_ANNOTATED
			? Math.round((hintLevels.reduce((sum, r) => sum + r.maxHintLevel, 0) / hintTotal) * 10) / 10
			: null;

	return {
		totalFeedbackItems: records.length,
		itemsWithRevisions: withRevisions.length,
		itemsWithUptakeAnnotation: total,
		successfulUptakeRate: rate(successful, total),
		partialUptakeRate: rate(partial, total),
		unsuccessfulUptakeRate: rate(unsuccessful, total),
		noUptakeRate: rate(none, total),
		averageHintLevel,
		proportionLevel1: rate(
			hintLevels.filter((r) => r.maxHintLevel === 1 && !r.requiredExplicit).length,
			hintTotal,
		),
		proportionLevel2: rate(
			hintLevels.filter((r) => r.maxHintLevel === 2 && !r.requiredExplicit).length,
			hintTotal,
		),
		proportionLevel3: rate(
			hintLevels.filter((r) => r.maxHintLevel === 3 && !r.requiredExplicit).length,
			hintTotal,
		),
		proportionExplicit: rate(hintLevels.filter((r) => r.requiredExplicit).length, hintTotal),
	};
}
