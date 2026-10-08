/**
 * Phase 7 — research analytics types and pure metric computation
 * (client-safe; no server imports).
 *
 * Metrics are derived from EXPLICIT human research judgments recorded on each
 * `ai_feedback_items` row — never from correlation between AI and human
 * category labels. A percentage is only returned when enough items carry the
 * relevant judgment; otherwise the field is `null` and the UI shows
 * "Belum cukup data teranotasi".
 *
 * Phase 10.3 — adds alignment-aware detection metrics and gold-standard
 * (adjudication-preferred) selection. The legacy `detection` field on
 * `SliceStats` counts judgments per AI finding (TP = AI items the expert
 * marked correct). The new `alignmentAware` field counts by DISTINCT
 * reference error so that multiple AI findings mapped to one reference error
 * never inflate the count. Both are reported; `alignmentAware` is the
 * preferred research metric and `detection` is retained for backward
 * compatibility. Where alignment is insufficient to determine a result, the
 * alignment-aware metric returns `null` rather than guessing 0%.
 */
import type { RaterJudgment } from '@/lib/research-rater';
import {
	parseRaterJudgments,
	adjudicationJudgment,
	rater1Judgment,
	rater2Judgment,
	summarizeRaterAgreement,
} from '@/lib/research-rater';

/**
 * Minimum number of annotated items required before a percentage is shown.
 * Below this the sample is too small to be meaningful.
 */
export const MIN_ANNOTATED = 5;

/**
 * Research access is lecturer/researcher-only. Students are never permitted
 * to view research analytics. Returns an error object when the role is
 * blocked, or `null` when access is allowed. Pure so it can be unit-tested
 * without mocking PocketBase.
 */
export function assertResearchAccess(role: string | undefined): AnalyticsError | null {
	if (role === 'student') {
		return { status: 403, message: 'Dashboard riset tidak tersedia untuk mahasiswa.' };
	}
	return null;
}

export type AnalyticsError = { status: number; message: string };

/** One normalized item used for metric computation. */
export type AnalyticsItem = {
	/** Phase 10.3 — the item's own id (used for alignment). */
	id: string;
	origin: 'ai' | 'human' | '';
	/** Phase 10.2 — adjudication state: unreviewed | reviewed | adjudicated. */
	adjudicationStatus: string;
	/** Phase 10.2 — explicit evaluation relation (authoritative provenance). */
	evaluationId: string;
	/** Phase 10.2 — links an AI finding to its matched human reference error. */
	matchedReferenceId: string;
	/** Phase 10.3 — parsed independent rater judgments + adjudication. */
	raterJudgments: RaterJudgment[];
	errorPresent: string;
	detectionJudgment: string;
	correctionJudgment: string;
	explanationJudgment: string;
	completenessJudgment: string;
	necessityJudgment: string;
	pedagogicalJudgment: string;
	aiCategory: string;
	aiSubcategory: string;
	/** Phase 10.3 — human reference classification (expert ground truth). */
	referenceCategory: string;
	referenceSubcategory: string;
	assignmentId: string;
	assignmentTitle: string;
	cefrLevel: string;
	model: string;
	promptVersion: string;
	submissionId: string;
};

/** A rate that is `null` (suppressed) when the annotated sample is too small. */
export type Rate = {
	count: number;
	total: number;
	/** Null when `total < MIN_ANNOTATED` — show "Belum cukup data teranotasi". */
	rate: number | null;
	sufficient: boolean;
};

/** Detection metrics (precision / recall / F1) over AI + human items. */
export type DetectionMetrics = {
	tp: number;
	fp: number;
	fn: number;
	precision: number | null;
	recall: number | null;
	f1: number | null;
	sufficient: boolean;
};

/** A judgment-accuracy rate (correction / explanation), weighted for "partial". */
export type JudgmentAccuracy = {
	judged: number;
	correct: number;
	partiallyCorrect: number;
	incorrect: number;
	/** (correct + 0.5·partially) / judged, or null when judged < MIN_ANNOTATED. */
	accuracy: number | null;
	sufficient: boolean;
};

export type SliceStats = {
	aiItems: number;
	humanItems: number;
	submissions: number;
	/** Phase 10.4 — explicit metric eligibility. Gold-standard metrics use
	 *  ONLY adjudicated evidence; reviewed-only is never gold-standard. */
	eligibility: MetricEligibility;
	detection: DetectionMetrics;
	/** Phase 10.3 — alignment-aware detection (preferred research metric). */
	alignmentAware: AlignmentAwareDetection;
	correction: JudgmentAccuracy;
	explanation: JudgmentAccuracy;
	completeness: Rate;
	necessity: Rate;
	pedagogical: Rate;
	falsePositive: Rate;
	falseNegative: Rate;
};

/** Phase 10.4 — explicit research metric eligibility breakdown. */
export type MetricEligibility = {
	/** All items in the slice (descriptive only). */
	total: number;
	/** Items marked reviewed but NOT adjudicated — NOT gold-standard. */
	reviewedOnly: number;
	/** Items marked adjudicated — eligible for gold-standard metrics. */
	adjudicated: number;
	/** Items eligible for gold-standard metrics (adjudicated with a judgment). */
	goldStandard: number;
	/** True when the gold-standard sample meets MIN_ANNOTATED. */
	sufficient: boolean;
};

export type BreakdownRow = {
	key: string;
	label: string;
	stats: SliceStats;
};

export type ResearchAnalytics = {
	scope: {
		assignmentId: string | null;
		assignmentTitle: string | null;
		allAssignments: { id: string; title: string }[];
	};
	counts: {
		submissionsAnalysed: number;
		aiFeedbackItems: number;
		humanReferenceItems: number;
	};
	overall: SliceStats;
	breakdowns: {
		byCategory: BreakdownRow[];
		bySubcategory: BreakdownRow[];
		byCefr: BreakdownRow[];
		byAssignment: BreakdownRow[];
		byModel: BreakdownRow[];
		byPromptVersion: BreakdownRow[];
	};
};

export function rate(count: number, total: number): Rate {
	const sufficient = total >= MIN_ANNOTATED;
	return {
		count,
		total,
		rate: sufficient ? Math.round((count / total) * 1000) / 10 : null,
		sufficient,
	};
}

export function accuracy(
	judged: number,
	correct: number,
	partially: number,
	incorrect: number,
): JudgmentAccuracy {
	const sufficient = judged >= MIN_ANNOTATED;
	return {
		judged,
		correct,
		partiallyCorrect: partially,
		incorrect,
		accuracy: sufficient ? Math.round(((correct + 0.5 * partially) / judged) * 1000) / 10 : null,
		sufficient,
	};
}

/**
 * Computes the full metric set for one slice of items. Detection uses
 * explicit judgments only:
 *  - TP = AI items the expert marked `detectionJudgment = 'correct'`
 *  - FP = AI items the expert marked `detectionJudgment = 'incorrect'`
 *  - FN = human-origin missed-error items (errors the AI draft did not detect)
 * Precision/recall/F1 are `null` until enough annotated items exist.
 *
 * Phase 10.3 — `alignmentAware` is the preferred research detection metric:
 * it counts by DISTINCT reference error so multiple AI findings mapped to one
 * reference error never inflate TP/FN. The legacy `detection` field is
 * retained for backward compatibility.
 *
 * Phase 10.4 — GOLD-STANDARD ENFORCEMENT. All accuracy metrics use ONLY
 * adjudicated evidence (`adjudicationStatus === 'adjudicated'` with a
 * resolvable gold-standard judgment). A merely `reviewed` record is NOT
 * gold-standard and is excluded from precision/recall/accuracy calculations.
 * Missing adjudication produces `null` (insufficient), NEVER 0%. The canonical
 * judgment is read via `goldStandardJudgment()` (prefers the adjudication
 * entry in `raterJudgments`, falls back to the flat fields for legacy records).
 * Independent-rater analysis remains available separately via
 * `summarizeRaterAgreement` / `summarizeDatasetAgreement`.
 */
export function computeSliceStats(items: AnalyticsItem[]): SliceStats {
	const aiItems = items.filter((i) => i.origin === 'ai');
	const humanItems = items.filter((i) => i.origin === 'human');
	const submissions = new Set(items.map((i) => i.submissionId).filter(Boolean));

	// Phase 10.4 — gold-standard evidence only. An item is gold-standard when
	// it is adjudicated AND has a resolvable gold-standard judgment. Reviewed-
	// only items are counted in `eligibility.reviewedOnly` but never scored.
	const goldAi = aiItems.filter((i) => isGoldStandard(i));
	const goldHuman = humanItems.filter((i) => isGoldStandard(i));

	const tp = goldAi.filter((i) => goldField(i, 'detectionJudgment') === 'correct').length;
	const fp = goldAi.filter((i) => goldField(i, 'detectionJudgment') === 'incorrect').length;
	const fn = goldHuman.length;

	const detectionTotal = tp + fp + fn;
	const detectionSufficient = detectionTotal >= MIN_ANNOTATED;
	const precision = tp + fp > 0 && detectionSufficient ? Math.round((tp / (tp + fp)) * 1000) / 10 : null;
	const recall = tp + fn > 0 && detectionSufficient ? Math.round((tp / (tp + fn)) * 1000) / 10 : null;
	const f1 =
		precision != null && recall != null && precision + recall > 0
			? Math.round(((2 * precision * recall) / (precision + recall)) * 10) / 10
			: null;

	const correction = (() => {
		const judged = goldAi.filter((i) => {
			const v = goldField(i, 'correctionJudgment');
			return v === 'correct' || v === 'partially_correct' || v === 'incorrect';
		});
		return accuracy(
			judged.length,
			judged.filter((i) => goldField(i, 'correctionJudgment') === 'correct').length,
			judged.filter((i) => goldField(i, 'correctionJudgment') === 'partially_correct').length,
			judged.filter((i) => goldField(i, 'correctionJudgment') === 'incorrect').length,
		);
	})();

	const explanation = (() => {
		const judged = goldAi.filter((i) => {
			const v = goldField(i, 'explanationJudgment');
			return v === 'correct' || v === 'partially_correct' || v === 'incorrect';
		});
		return accuracy(
			judged.length,
			judged.filter((i) => goldField(i, 'explanationJudgment') === 'correct').length,
			judged.filter((i) => goldField(i, 'explanationJudgment') === 'partially_correct').length,
			judged.filter((i) => goldField(i, 'explanationJudgment') === 'incorrect').length,
		);
	})();

	const completeness = (() => {
		const judged = goldAi.filter((i) => {
			const v = goldField(i, 'completenessJudgment');
			return v === 'complete' || v === 'incomplete';
		});
		return rate(
			judged.filter((i) => goldField(i, 'completenessJudgment') === 'complete').length,
			judged.length,
		);
	})();

	const necessity = (() => {
		const judged = goldAi.filter((i) => {
			const v = goldField(i, 'necessityJudgment');
			return v === 'necessary' || v === 'unnecessary';
		});
		return rate(
			judged.filter((i) => goldField(i, 'necessityJudgment') === 'necessary').length,
			judged.length,
		);
	})();

	const pedagogical = (() => {
		const judged = goldAi.filter((i) => {
			const v = goldField(i, 'pedagogicalJudgment');
			return v === 'appropriate' || v === 'needs_revision' || v === 'inappropriate';
		});
		return rate(
			judged.filter((i) => goldField(i, 'pedagogicalJudgment') === 'appropriate').length,
			judged.length,
		);
	})();

	const goldStandardCount = goldAi.length + goldHuman.length;
	const eligibility: MetricEligibility = {
		total: items.length,
		reviewedOnly: items.filter((i) => i.adjudicationStatus === 'reviewed').length,
		adjudicated: items.filter((i) => i.adjudicationStatus === 'adjudicated').length,
		goldStandard: goldStandardCount,
		sufficient: goldStandardCount >= MIN_ANNOTATED,
	};

	return {
		aiItems: aiItems.length,
		humanItems: humanItems.length,
		submissions: submissions.size,
		eligibility,
		detection: { tp, fp, fn, precision, recall, f1, sufficient: detectionSufficient },
		alignmentAware: computeAlignmentAwareDetection(items),
		correction,
		explanation,
		completeness,
		necessity,
		pedagogical,
		falsePositive: rate(fp, goldAi.length),
		falseNegative: rate(fn, tp + fn),
	};
}

/**
 * Phase 10.4 — reads one judgment field from the canonical gold-standard
 * judgment (adjudication entry preferred, legacy flat fields as fallback).
 * Returns '' when the item is not gold-standard or the field is unset. A
 * missing judgment is never interpreted as a positive or negative result.
 */
function goldField(item: AnalyticsItem, field: keyof RaterJudgment): string {
	const judgment = goldStandardJudgment(item);
	if (!judgment) return '';
	const value = judgment[field];
	return typeof value === 'string' ? value : '';
}

/** Groups items by a key and computes slice stats per group, sorted by size. */
export function breakdown(
	items: AnalyticsItem[],
	keyFn: (i: AnalyticsItem) => string,
	labelFn: (key: string) => string,
): BreakdownRow[] {
	const groups = new Map<string, AnalyticsItem[]>();
	for (const item of items) {
		const key = keyFn(item);
		if (!key) continue;
		let group = groups.get(key);
		if (!group) {
			group = [];
			groups.set(key, group);
		}
		group.push(item);
	}
	return [...groups.entries()]
		.map(([key, group]) => ({ key, label: labelFn(key), stats: computeSliceStats(group) }))
		.sort((a, b) => b.stats.aiItems + b.stats.humanItems - (a.stats.aiItems + a.stats.humanItems));
}

// ── Phase 10.2: research integrity helpers ───────────────────────────────

/**
 * Phase 10.2 — AI↔human error alignment rule.
 *
 * One human/reference error may correspond to one OR multiple AI findings.
 * Multiple AI findings linked to the same reference error (via
 * `matchedReferenceId`) count as ONE reference error — never as multiple
 * independent reference errors. This prevents inflating the false-negative
 * count when several AI findings address different aspects of the same
 * underlying learner error.
 *
 * `parentAiFindingId` links a human missed-error annotation back to the AI
 * finding it complements; `matchedReferenceId` links an AI finding to the
 * human reference it was aligned with. Both are preserved unchanged.
 *
 * Human-origin items are each one distinct reference error. AI-origin items
 * that share a `matchedReferenceId` pointing to an existing human item are
 * already counted by that human item and do NOT add new reference errors.
 * AI items with a `matchedReferenceId` that does NOT correspond to any human
 * item count as one additional distinct reference error per unique id.
 */
export function countDistinctReferenceErrors(items: {
	origin: string;
	matchedReferenceId?: string;
	id: string;
}[]): number {
	const humanIds = new Set(items.filter((i) => i.origin === 'human').map((i) => i.id));
	const aiOnlyRefs = new Set(
		items
			.filter(
				(i) =>
					i.origin === 'ai' &&
					i.matchedReferenceId &&
					i.matchedReferenceId.trim() &&
					!humanIds.has(i.matchedReferenceId.trim()),
			)
			.map((i) => i.matchedReferenceId!.trim()),
	);
	return humanIds.size + aiOnlyRefs.size;
}

/**
 * Phase 10.2 — attach evaluation provenance to items using each item's
 * EXPLICIT evaluation relation as the authoritative source.
 *
 * A submission may have multiple AI evaluation runs. Inferring provenance
 * from assignmentId+submissionId would collapse them into one. This pure
 * function uses each item's own `evaluationId` so multiple runs for the same
 * submission retain separate provenance.
 */
export function attachProvenanceToItems(
	items: AnalyticsItem[],
	evaluations: Map<string, { model: string; promptVersion: string }>,
): void {
	for (const item of items) {
		const evaluation = item.evaluationId ? evaluations.get(item.evaluationId) : undefined;
		if (evaluation) {
			item.model = evaluation.model || '';
			item.promptVersion = evaluation.promptVersion || '';
		}
	}
}

// ── Phase 10.3: gold-standard & alignment-aware metrics ───────────────────

/**
 * Phase 10.3 — the gold-standard (final) research judgment for one item.
 *
 * Gold-standard rules (requirement 3):
 *  1. Prefer the adjudicated judgment when one exists.
 *  2. If no adjudication exists, return null — an independent judgment is
 *     NOT silently promoted to gold-standard. Callers that explicitly allow
 *     an independent judgment must request it themselves.
 *  3. Conflicting Rater 1 / Rater 2 judgments are never silently merged.
 *  4. A missing gold-standard decision is represented as null, never 0%.
 *
 * Unreviewed evidence is never gold-standard. An item is gold-standard only
 * when `adjudicationStatus === 'adjudicated'` AND an adjudication entry exists
 * in `raterJudgments` (or, for legacy records without `raterJudgments`, when
 * the flat fields carry an adjudicated judgment).
 */
export function goldStandardJudgment(item: AnalyticsItem): RaterJudgment | null {
	if (item.adjudicationStatus !== 'adjudicated') return null;
	const adjudication = adjudicationJudgment(item.raterJudgments);
	if (adjudication) return adjudication;
	// Legacy record (no raterJudgments) that was marked adjudicated: synthesize
	// a final judgment from the flat fields so historical records remain valid.
	return {
		round: 0,
		reviewer: '',
		reviewedAt: '',
		detectionJudgment: item.detectionJudgment,
		correctionJudgment: item.correctionJudgment,
		explanationJudgment: item.explanationJudgment,
		completenessJudgment: item.completenessJudgment,
		necessityJudgment: item.necessityJudgment,
		pedagogicalJudgment: item.pedagogicalJudgment,
		referenceCategory: item.aiCategory,
	};
}

/** True when an item carries an adjudicated gold-standard judgment. */
export function isGoldStandard(item: AnalyticsItem): boolean {
	return goldStandardJudgment(item) !== null;
}

/**
 * Phase 10.3 — the rationale for one AI↔human alignment link.
 *
 * A match must distinguish at least:
 *  1. 'exact' — exact category AND subcategory match;
 *  2. 'same_category' — same category but different subcategory;
 *  3. 'same_error_different_label' — same underlying error but different
 *     taxonomy label (different category);
 *  4. 'none' — no valid match.
 *
 * Different labels are NEVER automatically classified as equivalent. The
 * rationale is computed from the AI finding's own category/subcategory and
 * the matched human reference's category/subcategory — never from fuzzy
 * textual similarity. An AI finding whose `matchedReferenceId` does not point
 * to an existing human reference error has rationale 'none' (unmatched).
 */
export type AlignmentRationale = 'exact' | 'same_category' | 'same_error_different_label' | 'none';

export type AlignmentLink = {
	aiItemId: string;
	referenceId: string;
	rationale: AlignmentRationale;
};

/**
 * Computes the alignment links between AI findings and human reference errors
 * using each AI finding's explicit `matchedReferenceId`. Only links whose
 * `matchedReferenceId` points to an existing human item are 'valid'; all
 * others are 'none' (unmatched). The rationale is derived from the controlled
 * taxonomy labels — never from textual similarity.
 */
export function alignErrors(items: AnalyticsItem[]): AlignmentLink[] {
	const humanById = new Map<string, AnalyticsItem>();
	for (const item of items) {
		if (item.origin === 'human') humanById.set(item.id, item);
	}
	const links: AlignmentLink[] = [];
	for (const item of items) {
		if (item.origin !== 'ai') continue;
		const refId = (item.matchedReferenceId || '').trim();
		if (!refId) {
			links.push({ aiItemId: item.id, referenceId: '', rationale: 'none' });
			continue;
		}
		const human = humanById.get(refId);
		if (!human) {
			// Points to a non-existent or AI-only reference — not a valid human
			// alignment. Treated as unmatched (false-positive candidate).
			links.push({ aiItemId: item.id, referenceId: refId, rationale: 'none' });
			continue;
		}
		// Phase 10.4 — scope isolation. An AI finding may only align with a
		// human reference from the SAME evaluation (research unit) and
		// assignment. A cross-participant/cross-assignment link is rejected
		// (rationale 'none') and excluded from research metrics.
		if (!sameScope(item, human)) {
			links.push({ aiItemId: item.id, referenceId: refId, rationale: 'none' });
			continue;
		}
		const aiCat = (item.aiCategory || '').trim();
		const aiSub = (item.aiSubcategory || '').trim();
		const refCat = (human.aiCategory || human.referenceCategory || '').trim();
		const refSub = (human.aiSubcategory || human.referenceSubcategory || '').trim();
		let rationale: AlignmentRationale = 'none';
		if (aiCat && refCat && aiCat === refCat && aiSub && refSub && aiSub === refSub) {
			rationale = 'exact';
		} else if (aiCat && refCat && aiCat === refCat) {
			rationale = 'same_category';
		} else if (aiCat && refCat) {
			rationale = 'same_error_different_label';
		}
		links.push({ aiItemId: item.id, referenceId: refId, rationale });
	}
	return links;
}

/**
 * Phase 10.3 — alignment-aware detection metrics.
 *
 * Metric definitions (deterministic, documented):
 *  - Reference errors = human-origin items (each is ONE reference error) plus
 *    AI-only `matchedReferenceId` groups that do not correspond to a human
 *    item (each unique id is one reference error).
 *  - TP = distinct reference errors that have ≥1 linked AI finding the expert
 *    marked `detectionJudgment = 'correct'`. Multiple AI findings mapped to
 *    the SAME reference error count as ONE true positive — never inflated.
 *  - FN = reference errors with NO linked AI finding marked 'correct'.
 *  - FP = AI findings the expert marked `detectionJudgment = 'incorrect'`
 *    (false alarms), counted per AI finding.
 *  - unmatchedCorrect = AI findings marked 'correct' but NOT linked to any
 *    reference error. These are NOT forced into TP (alignment insufficient to
 *    confirm they correspond to a distinct reference error) and NOT forced
 *    into FP. They are reported separately for transparency.
 *
 * Precision = TP / (TP + FP), Recall = TP / (TP + FN). Both are `null` when
 * the annotated sample is below MIN_ANNOTATED — missing evidence is NEVER
 * converted to 0%.
 *
 * Only reviewed/adjudicated items contribute (unreviewed evidence is never
 * gold-standard and never scored).
 */
export type AlignmentAwareDetection = {
	/** Distinct reference errors (human items + AI-only reference groups). */
	referenceErrors: number;
	tp: number;
	fp: number;
	fn: number;
	/** AI findings marked correct but not linked to a reference (not forced). */
	unmatchedCorrect: number;
	precision: number | null;
	recall: number | null;
	f1: number | null;
	sufficient: boolean;
};

export function computeAlignmentAwareDetection(items: AnalyticsItem[]): AlignmentAwareDetection {
	// Phase 10.4 — gold-standard evidence only. Unreviewed AND reviewed-only
	// items are excluded; only adjudicated items with a resolvable gold-standard
	// judgment contribute. Missing adjudication never becomes 0%.
	const gold = items.filter((i) => isGoldStandard(i));
	const humanItems = gold.filter((i) => i.origin === 'human');
	const aiItems = gold.filter((i) => i.origin === 'ai');
	const humanIds = new Set(humanItems.map((i) => i.id));
	const humanMap = new Map(humanItems.map((i) => [i.id, i]));

	// Reference errors: each human item + each unique AI-only matchedReferenceId.
	const aiOnlyRefs = new Set(
		aiItems
			.map((i) => (i.matchedReferenceId || '').trim())
			.filter((id) => id && !humanIds.has(id)),
	);
	const referenceErrors = humanItems.length + aiOnlyRefs.size;

	// A reference error is "detected" (TP) when ≥1 linked AI finding is marked
	// 'correct'. Linked = matchedReferenceId points to that reference id AND the
	// link passes scope isolation (same evaluation/assignment — see alignErrors).
	const detectedHuman = new Set<string>();
	const detectedAiOnlyRefs = new Set<string>();
	for (const ai of aiItems) {
		if (goldField(ai, 'detectionJudgment') !== 'correct') continue;
		const refId = (ai.matchedReferenceId || '').trim();
		if (!refId) continue;
		const human = humanMap.get(refId);
		if (humanIds.has(refId) && human && sameScope(ai, human)) detectedHuman.add(refId);
		else if (aiOnlyRefs.has(refId)) detectedAiOnlyRefs.add(refId);
	}
	const tp = detectedHuman.size + detectedAiOnlyRefs.size;
	const fn = referenceErrors - tp;

	// FP = AI findings marked 'incorrect' (false alarms), per finding.
	const fp = aiItems.filter((i) => goldField(i, 'detectionJudgment') === 'incorrect').length;

	// Unmatched correct AI findings — not forced into TP or FP.
	const unmatchedCorrect = aiItems.filter(
		(i) => goldField(i, 'detectionJudgment') === 'correct' && !(i.matchedReferenceId || '').trim(),
	).length;

	const total = tp + fp + fn;
	const sufficient = total >= MIN_ANNOTATED;
	const precision = tp + fp > 0 && sufficient ? Math.round((tp / (tp + fp)) * 1000) / 10 : null;
	const recall = tp + fn > 0 && sufficient ? Math.round((tp / (tp + fn)) * 1000) / 10 : null;
	const f1 =
		precision != null && recall != null && precision + recall > 0
			? Math.round(((2 * precision * recall) / (precision + recall)) * 10) / 10
			: null;

	return {
		referenceErrors,
		tp,
		fp,
		fn,
		unmatchedCorrect,
		precision,
		recall,
		f1,
		sufficient,
	};
}

/**
 * Phase 10.4 — validates that an AI finding and a human reference error
 * belong to the same research scope (participant/research unit + assignment).
 *
 * The validation is performed by the helper itself, NOT solely by the caller:
 * an AI finding from one evaluation/assignment can never reference a human
 * error from another. Empty scope fields (legacy/unsourced records) are
 * treated as unconstrained so historical records remain readable; non-empty
 * fields that differ reject the link.
 */
export function sameScope(ai: AnalyticsItem, human: AnalyticsItem): boolean {
	if (
		ai.assignmentId &&
		human.assignmentId &&
		ai.assignmentId !== human.assignmentId
	) {
		return false;
	}
	if (
		ai.evaluationId &&
		human.evaluationId &&
		ai.evaluationId !== human.evaluationId
	) {
		return false;
	}
	return true;
}

/**
 * Phase 10.3 — parses an `ai_feedback_items` raw row's `raterJudgments` into
 * the typed array, tolerantly (strings or already-parsed objects). Used by
 * the analytics server when normalizing loaded rows.
 */
export function normalizeRaterJudgments(value: unknown): RaterJudgment[] {
	return parseRaterJudgments(value);
}

// ── Phase 10.4: explicit independent-rater dataset analysis ───────────────

export type DatasetAgreementSummary = {
	/** Items with at least one independent rater judgment. */
	itemsWithRaters: number;
	/** Items where both Rater 1 and Rater 2 are present. */
	bothRaters: number;
	/** Items where Rater 1 and Rater 2 agree on all compared fields. */
	agreed: number;
	/** Items where Rater 1 and Rater 2 disagree on at least one compared field. */
	disagreed: number;
	/** Items with only one rater (unresolved — no comparison possible). */
	unresolved: number;
	/** Items with an adjudication entry. */
	adjudicated: number;
};

/**
 * Phase 10.4 — dataset-level independent-rater agreement summary.
 *
 * This is a SIMPLE, transparent agreement count — NOT a statistical
 * reliability coefficient. No kappa/alpha/ICC is computed or invented. The
 * raw independent judgments remain available in each item's `raterJudgments`
 * for later statistical analysis by the researcher.
 *
 * Agreement is per-item: an item is 'agreed' only when both raters are
 * present AND every compared controlled-vocabulary field matches; otherwise
 * 'disagreed'. Items with only one rater are 'unresolved' (never silently
 * treated as agreement). Adjudicated items are counted separately and never
 * replace the independent observations.
 */
export function summarizeDatasetAgreement(items: AnalyticsItem[]): DatasetAgreementSummary {
	let itemsWithRaters = 0;
	let bothRaters = 0;
	let agreed = 0;
	let disagreed = 0;
	let unresolved = 0;
	let adjudicated = 0;
	for (const item of items) {
		const judgments = item.raterJudgments;
		const r1 = rater1Judgment(judgments);
		const r2 = rater2Judgment(judgments);
		const hasAdj = adjudicationJudgment(judgments) !== null;
		if (r1 || r2) itemsWithRaters += 1;
		if (hasAdj) adjudicated += 1;
		if (r1 && r2) {
			bothRaters += 1;
			const summary = summarizeRaterAgreement(judgments);
			if (summary.overall === 'agreed') agreed += 1;
			else disagreed += 1;
		} else if (r1 || r2) {
			unresolved += 1;
		}
	}
	return { itemsWithRaters, bothRaters, agreed, disagreed, unresolved, adjudicated };
}

