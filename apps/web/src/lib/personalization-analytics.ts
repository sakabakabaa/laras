/**
 * Phase 10 — adaptive/personalized feedback analytics (client-safe, pure).
 *
 * Two research-only analytics built on existing Phase 9/10 data:
 *
 * 1. Generic vs. personalized comparison — side-by-side interaction counts,
 *    uptake rate, successful-revision rate, and hint-level outcomes, with
 *    breakdowns by linguistic category, CEFR level, assignment, task shape,
 *    and model.
 *
 * 2. Category-level improvement/recurrence trajectories — whether validated
 *    learner error patterns (e.g. case, word-order) recur or decline over
 *    time, using ONLY validated research observations.
 *
 * Research principle (no-causality): every metric describes an ASSOCIATION
 * between a feedback mode and an observed outcome. Nothing here claims that
 * personalization CAUSES improvement — the research design (non-randomized,
 * lecturer-selected mode per assignment) does not support causal inference.
 * All language stays associational ("feedback-associated outcomes").
 *
 * Rates are suppressed (null → "Belum cukup data") when the annotated sample
 * is below MIN_COMPARISON. This module is pure so it can be unit-tested
 * without mocking PocketBase.
 */
import { assertResearchAccess, type AnalyticsError } from '@/lib/research-analytics';

export { assertResearchAccess, type AnalyticsError };

/** Minimum sample before a rate is shown (mirrors Phase 7 MIN_ANNOTATED). */
export const MIN_COMPARISON = 5;

/** Progressive hint levels (Phase 8). Level 4 = explicit correction. */
export const HINT_LEVELS = [1, 2, 3, 4] as const;

export type FeedbackMode = 'generic' | 'personalized';

/**
 * One normalized formative feedback interaction (a Cek jawaban check event),
 * enriched with its personalization mode, uptake outcome, and provenance.
 * Built server-side from check_attempts + personalization_logs +
 * feedback_revisions + feedback_uptake.
 */
export type InteractionRecord = {
	mode: FeedbackMode;
	assignmentId: string;
	assignmentTitle: string;
	shape: string;
	cefrLevel: string;
	model: string;
	hintLevel: number;
	/** Linguistic categories relevant to this interaction ('' when unknown). */
	categories: string[];
	/** Human-only uptake judgment ('' when no revision/annotation linked). */
	uptakeJudgment: string;
	afterRevisionStatus: string;
	hasRevision: boolean;
	createdAt: string;
};

/** Aggregate stats for one feedback-mode group. */
export type ModeStats = {
	interactions: number;
	withRevision: number;
	withUptakeAnnotation: number;
	/** (successful + partial) / annotated, or null when annotated < MIN. */
	uptakeRate: number | null;
	/** successful_uptake / annotated, or null when annotated < MIN. */
	successfulRevisionRate: number | null;
	averageHintLevel: number | null;
	hintDistribution: { level: number; count: number; rate: number | null }[];
	sufficient: boolean;
};

/** One row in a comparison breakdown (a group split by generic/personalized). */
export type ComparisonBreakdownRow = {
	key: string;
	label: string;
	generic: ModeStats;
	personalized: ModeStats;
};

export type ComparisonFilters = {
	categories: string[];
	cefrLevels: string[];
	assignmentIds: string[];
	shapes: string[];
	models: string[];
};

export type PersonalizationComparison = {
	generic: ModeStats;
	personalized: ModeStats;
	breakdowns: {
		byCategory: ComparisonBreakdownRow[];
		byCefr: ComparisonBreakdownRow[];
		byAssignment: ComparisonBreakdownRow[];
		byShape: ComparisonBreakdownRow[];
		byModel: ComparisonBreakdownRow[];
	};
	filters: {
		categories: string[];
		cefrLevels: string[];
		assignments: { id: string; title: string }[];
		shapes: string[];
		models: string[];
	};
};

function rate(count: number, total: number): number | null {
	if (total < MIN_COMPARISON) return null;
	return Math.round((count / total) * 1000) / 10;
}

/** Computes aggregate stats for one feedback-mode slice. */
export function computeModeStats(records: InteractionRecord[]): ModeStats {
	const interactions = records.length;
	const withRevision = records.filter((r) => r.hasRevision).length;
	const annotated = records.filter((r) => r.uptakeJudgment !== '');
	const successful = records.filter((r) => r.uptakeJudgment === 'successful_uptake').length;
	const partial = records.filter((r) => r.uptakeJudgment === 'partial_uptake').length;

	const hintRecords = records.filter((r) => r.hintLevel > 0);
	const hintTotal = hintRecords.length;
	const averageHintLevel =
		hintTotal >= MIN_COMPARISON
			? Math.round((hintRecords.reduce((s, r) => s + r.hintLevel, 0) / hintTotal) * 10) / 10
			: null;

	const hintDistribution = HINT_LEVELS.map((level) => {
		const count = hintRecords.filter((r) => r.hintLevel === level).length;
		return { level, count, rate: rate(count, hintTotal) };
	});

	return {
		interactions,
		withRevision,
		withUptakeAnnotation: annotated.length,
		uptakeRate: rate(successful + partial, annotated.length),
		successfulRevisionRate: rate(successful, annotated.length),
		averageHintLevel,
		hintDistribution,
		sufficient: interactions >= MIN_COMPARISON,
	};
}

function emptyStats(): ModeStats {
	return {
		interactions: 0,
		withRevision: 0,
		withUptakeAnnotation: 0,
		uptakeRate: null,
		successfulRevisionRate: null,
		averageHintLevel: null,
		hintDistribution: HINT_LEVELS.map((level) => ({ level, count: 0, rate: null })),
		sufficient: false,
	};
}

/** True when a record matches all non-empty filter dimensions. */
export function matchesFilters(record: InteractionRecord, filters: ComparisonFilters): boolean {
	if (filters.categories.length > 0) {
		const hit = record.categories.some((c) => filters.categories.includes(c));
		if (!hit) return false;
	}
	if (filters.cefrLevels.length > 0 && !filters.cefrLevels.includes(record.cefrLevel || 'Tanpa tingkat')) {
		return false;
	}
	if (filters.assignmentIds.length > 0 && !filters.assignmentIds.includes(record.assignmentId)) {
		return false;
	}
	if (filters.shapes.length > 0 && !filters.shapes.includes(record.shape || 'Tanpa tipe')) {
		return false;
	}
	if (filters.models.length > 0 && !filters.models.includes(record.model || 'Tidak diketahui')) {
		return false;
	}
	return true;
}

/** Applies the filter dimensions to a record set. */
export function applyFilters(records: InteractionRecord[], filters: ComparisonFilters): InteractionRecord[] {
	return records.filter((r) => matchesFilters(r, filters));
}

type DimensionKey = {
	key: string;
	label: string;
};

/**
 * Builds a comparison breakdown along one dimension. A record contributes to
 * every key it carries (e.g. a multi-category interaction appears in each of
 * its categories). Each group is split into generic/personalized ModeStats.
 */
function comparisonBreakdown(
	records: InteractionRecord[],
	keysOf: (r: InteractionRecord) => DimensionKey[],
): ComparisonBreakdownRow[] {
	const groups = new Map<string, InteractionRecord[]>();
	for (const record of records) {
		for (const { key, label } of keysOf(record)) {
			if (!key) continue;
			let group = groups.get(key);
			if (!group) {
				group = [];
				groups.set(key, group);
			}
			group.push(record);
		}
	}
	return [...groups.entries()]
		.map(([key, group]) => ({
			key,
			label: group[0] ? keysOf(group[0]).find((d) => d.key === key)?.label || key : key,
			generic: computeModeStats(group.filter((r) => r.mode === 'generic')),
			personalized: computeModeStats(group.filter((r) => r.mode === 'personalized')),
		}))
		.sort(
			(a, b) =>
				b.generic.interactions +
				b.personalized.interactions -
				(a.generic.interactions + a.personalized.interactions),
		);
}

function uniqueLabels(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

/**
 * Computes the full generic-vs-personalized comparison. Filters are applied
 * first; breakdowns and the available filter options are derived from the
 * FULL record set (so the lecturer can broaden a filter after narrowing).
 */
export function computePersonalizationComparison(
	records: InteractionRecord[],
	filters: ComparisonFilters = { categories: [], cefrLevels: [], assignmentIds: [], shapes: [], models: [] },
): PersonalizationComparison {
	const filtered = applyFilters(records, filters);

	const generic = computeModeStats(filtered.filter((r) => r.mode === 'generic'));
	const personalized = computeModeStats(filtered.filter((r) => r.mode === 'personalized'));

	const byCategory = comparisonBreakdown(filtered, (r) =>
		(r.categories.length ? r.categories : ['(tanpa kategori)']).map((c) => ({ key: c, label: c })),
	);
	const byCefr = comparisonBreakdown(filtered, (r) => [
		{ key: r.cefrLevel || 'Tanpa tingkat', label: r.cefrLevel || 'Tanpa tingkat' },
	]);
	const byAssignment = comparisonBreakdown(filtered, (r) => [
		{ key: r.assignmentId, label: r.assignmentTitle || '(tanpa judul)' },
	]);
	const byShape = comparisonBreakdown(filtered, (r) => [
		{ key: r.shape || 'Tanpa tipe', label: r.shape || 'Tanpa tipe' },
	]);
	const byModel = comparisonBreakdown(filtered, (r) => [
		{ key: r.model || 'Tidak diketahui', label: r.model || 'Tidak diketahui' },
	]);

	const assignmentMap = new Map<string, string>();
	for (const r of records) assignmentMap.set(r.assignmentId, r.assignmentTitle || '(tanpa judul)');

	return {
		generic,
		personalized,
		breakdowns: { byCategory, byCefr, byAssignment, byShape, byModel },
		filters: {
			categories: uniqueLabels(records.flatMap((r) => r.categories)).sort(),
			cefrLevels: uniqueLabels(records.map((r) => r.cefrLevel)).sort(),
			assignments: [...assignmentMap.entries()].map(([id, title]) => ({ id, title })),
			shapes: uniqueLabels(records.map((r) => r.shape)).sort(),
			models: uniqueLabels(records.map((r) => r.model)).sort(),
		},
	};
}

// ── Category-level improvement / recurrence trajectories ───────────────

/**
 * One validated error observation for trajectory analysis. "Validated" means
 * a human expert confirmed the AI detection (detectionJudgment='correct') or
 * authored a human reference error (origin='human'). Unvalidated AI drafts
 * are NEVER included — they cannot support a recurrence/decline claim.
 */
export type ValidatedObservation = {
	category: string;
	subcategory: string;
	/** Pseudonymous learner key (never a raw name/email). */
	learnerKey: string;
	/** ISO timestamp of the observation. */
	createdAt: string;
	assignmentId: string;
	cefrLevel: string;
	/** Human-only uptake outcome ('' when no uptake annotation linked). */
	afterRevisionStatus: string;
};

export type TrajectoryPoint = {
	/** ISO month bucket label, e.g. "2026-09". */
	bucket: string;
	/** Human-readable label, e.g. "Sep 2026". */
	label: string;
	count: number;
	distinctLearners: number;
	/** Learners who also appeared in an earlier bucket (recurrence signal). */
	recurringLearners: number;
	recurrenceRate: number | null;
	correctedCount: number;
	/** corrected / observations-with-uptake-annotation in this bucket. */
	improvementRate: number | null;
};

export type CategoryTrajectory = {
	category: string;
	totalObservations: number;
	points: TrajectoryPoint[];
	/** Coarse trend across buckets — never a causal claim. */
	trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient';
	sufficient: boolean;
};

export type CategoryTrajectories = {
	trajectories: CategoryTrajectory[];
	totalObservations: number;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function monthBucket(iso: string): { bucket: string; label: string } | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	const bucket = `${y}-${String(m + 1).padStart(2, '0')}`;
	const label = `${MONTH_LABELS[m]} ${y}`;
	return { bucket, label };
}

/**
 * Coarse trend from the first and last populated buckets. Returns
 * 'insufficient' when there are fewer than 2 buckets or the total is below
 * MIN_COMPARISON. Never claims causality — this is a descriptive direction.
 */
function trendOf(points: TrajectoryPoint[], total: number): CategoryTrajectory['trend'] {
	if (total < MIN_COMPARISON || points.length < 2) return 'insufficient';
	const first = points[0].count;
	const last = points[points.length - 1].count;
	if (first === 0) return last > 0 ? 'increasing' : 'stable';
	const delta = (last - first) / first;
	if (delta > 0.15) return 'increasing';
	if (delta < -0.15) return 'decreasing';
	return 'stable';
}

/**
 * Computes category-level recurrence/improvement trajectories over time.
 *
 * Observations are bucketed by UTC month and sorted chronologically. A learner
 * is "recurring" in a bucket if they appeared in any earlier bucket for the
 * same category — a recurrence signal, not a learning-outcome judgment.
 * Improvement rate uses ONLY human uptake annotations
 * (afterRevisionStatus='corrected'); it is suppressed when too few annotated
 * observations exist in a bucket.
 */
export function computeCategoryTrajectories(
	observations: ValidatedObservation[],
): CategoryTrajectories {
	const byCategory = new Map<string, ValidatedObservation[]>();
	for (const obs of observations) {
		const cat = (obs.category || '').trim();
		if (!cat) continue;
		let group = byCategory.get(cat);
		if (!group) {
			group = [];
			byCategory.set(cat, group);
		}
		group.push(obs);
	}

	const trajectories: CategoryTrajectory[] = [];
	for (const [category, group] of byCategory.entries()) {
		const sorted = [...group].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
		const buckets = new Map<string, ValidatedObservation[]>();
		for (const obs of sorted) {
			const mb = monthBucket(obs.createdAt);
			if (!mb) continue;
			let arr = buckets.get(mb.bucket);
			if (!arr) {
				arr = [];
				buckets.set(mb.bucket, arr);
			}
			arr.push(obs);
		}

		const priorLearners = new Set<string>();
		const points: TrajectoryPoint[] = [];
		for (const [bucket, items] of buckets.entries()) {
			const learners = new Set(items.map((i) => i.learnerKey).filter(Boolean));
			const recurring = [...learners].filter((l) => priorLearners.has(l)).length;
			const annotated = items.filter((i) => i.afterRevisionStatus !== '');
			const corrected = items.filter((i) => i.afterRevisionStatus === 'corrected').length;
			points.push({
				bucket,
				label: monthBucket(items[0].createdAt)?.label || bucket,
				count: items.length,
				distinctLearners: learners.size,
				recurringLearners: recurring,
				recurrenceRate: rate(recurring, learners.size),
				correctedCount: corrected,
				improvementRate: rate(corrected, annotated.length),
			});
			for (const l of learners) priorLearners.add(l);
		}

		points.sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
		const total = group.length;
		trajectories.push({
			category,
			totalObservations: total,
			points,
			trend: trendOf(points, total),
			sufficient: total >= MIN_COMPARISON,
		});
	}

	trajectories.sort((a, b) => b.totalObservations - a.totalObservations);
	return { trajectories, totalObservations: observations.length };
}
