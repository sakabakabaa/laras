/**
 * Phase 10 — learner error profile (client-safe, pure).
 *
 * A learner profile aggregates VALIDATED error observations across a learner's
 * submissions. It is NEVER built from a single unverified AI finding — only
 * from human-validated or sufficiently reliable evidence (lecturer-confirmed
 * AI detections and human reference errors). The underlying observations are
 * preserved so the research team can compute patterns externally; the
 * status labels here are a lightweight, conservative first approximation.
 *
 * This module is pure and has no server imports so it can be unit-tested
 * without mocking PocketBase.
 */

/** One validated error observation for a learner. */
export type LearnerObservation = {
	/** Stable category from the controlled taxonomy (e.g. "Morphology"). */
	category: string;
	/** Subcategory (e.g. "case"). May be '' for a general finding. */
	subcategory: string;
	/** "minor" | "major". '' when not recorded. */
	severity: string;
	/** Assignment id the observation came from. */
	assignmentId: string;
	/** ISO timestamp of the observation (created). */
	createdAt: string;
};

/** A recurring-pattern status, derived conservatively from validated data. */
export type PatternStatus = 'emerging' | 'recurring' | 'established' | 'improving';

export const PATTERN_STATUS_LABEL: Record<PatternStatus, string> = {
	emerging: 'Muncul',
	recurring: 'Berulang',
	established: 'Tetap',
	improving: 'Membaik',
};

/** Default minimum validated observations before a pattern is "recurring". */
export const DEFAULT_PERSONALIZATION_THRESHOLD = 3;

export type LearnerPattern = {
	category: string;
	subcategory: string;
	/** Total validated observations for this (category, subcategory). */
	count: number;
	/** Observations sorted oldest → newest (preserved for external analysis). */
	observations: LearnerObservation[];
	status: PatternStatus;
	/** True when recent uptake evidence shows improvement. */
	improving: boolean;
};

export type LearnerProfile = {
	/** Stable version hash of the profile content (for provenance logging). */
	version: string;
	/** Configurable threshold used to derive the statuses. */
	threshold: number;
	/** Total validated observations across all categories. */
	totalObservations: number;
	patterns: LearnerPattern[];
	/** Counts per category (subcategory aggregated to ''). */
	categoryCounts: { category: string; count: number }[];
};

/** Normalize a key for grouping (case-insensitive, trimmed). */
function groupKey(category: string, subcategory: string): string {
	const cat = (category || '').trim();
	const sub = (subcategory || '').trim();
	return sub ? `${cat} › ${sub.toLowerCase()}` : cat.toLowerCase();
}

/**
 * Aggregate raw validated observations into recurring patterns.
 *
 * A pattern is only classified as "recurring"/"established" when its count
 * meets the configurable threshold. Below the threshold it is "emerging" —
 * never treated as a confirmed learner weakness. "improving" requires
 * positive uptake evidence (passed via `improvingKeys`) AND a count that
 * otherwise would have met the threshold.
 */
export function aggregatePatterns(
	observations: LearnerObservation[],
	threshold: number,
	improvingKeys: Set<string> = new Set(),
): LearnerPattern[] {
	const min = Math.max(1, Math.round(threshold) || DEFAULT_PERSONALIZATION_THRESHOLD);
	const groups = new Map<string, LearnerPattern>();
	for (const obs of observations) {
		const category = (obs.category || '').trim();
		if (!category) continue;
		const key = groupKey(category, obs.subcategory);
		let pattern = groups.get(key);
		if (!pattern) {
			pattern = {
				category,
				subcategory: obs.subcategory.trim(),
				count: 0,
				observations: [],
				status: 'emerging',
				improving: false,
			};
			groups.set(key, pattern);
		}
		pattern.count += 1;
		pattern.observations.push(obs);
	}
	for (const pattern of groups.values()) {
		pattern.observations.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
		const meets = pattern.count >= min;
		const improving = improvingKeys.has(groupKey(pattern.category, pattern.subcategory));
		pattern.improving = improving && meets;
		if (improving && meets) {
			pattern.status = 'improving';
		} else if (pattern.count >= min * 2) {
			pattern.status = 'established';
		} else if (meets) {
			pattern.status = 'recurring';
		} else {
			pattern.status = 'emerging';
		}
	}
	return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** A short, stable content hash for the profile (NOT a cryptographic hash). */
export function profileVersionHash(input: {
	threshold: number;
	patterns: LearnerPattern[];
}): string {
	// Deterministic, dependency-free fingerprint of the profile contents.
	// Used only as a "learner profile version" label in provenance logs.
	const parts = [`t${input.threshold}`];
	for (const p of input.patterns) {
		parts.push(`${p.category}|${p.subcategory}|${p.count}|${p.status}`);
	}
	let h = 5381;
	const s = parts.join(';');
	for (let i = 0; i < s.length; i += 1) {
		h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	}
	return `v1-${(h >>> 0).toString(36)}`;
}

/** Build the full learner profile from validated observations. */
export function buildLearnerProfile(
	observations: LearnerObservation[],
	threshold: number,
	improvingKeys?: Set<string>,
): LearnerProfile {
	const patterns = aggregatePatterns(observations, threshold, improvingKeys);
	const categoryCounts = new Map<string, number>();
	for (const p of patterns) {
		categoryCounts.set(p.category, (categoryCounts.get(p.category) || 0) + p.count);
	}
	return {
		version: profileVersionHash({ threshold, patterns }),
		threshold,
		totalObservations: observations.length,
		patterns,
		categoryCounts: [...categoryCounts.entries()]
			.map(([category, count]) => ({ category, count }))
			.sort((a, b) => b.count - a.count),
	};
}

/**
 * Select the patterns relevant to a current error category. Returns only
 * patterns that meet the threshold (recurring/established/improving) —
 * emerging patterns are NOT used to personalize, per the safety boundary.
 */
export function relevantPatterns(
	profile: LearnerProfile,
	currentCategory: string,
): LearnerPattern[] {
	const cat = (currentCategory || '').trim();
	if (!cat) return [];
	return profile.patterns.filter(
		(p) =>
			p.category.toLowerCase() === cat.toLowerCase() && p.status !== 'emerging',
	);
}

/** Total validated observations for a category (all subcategories). */
export function categoryObservationCount(profile: LearnerProfile, category: string): number {
	const cat = (category || '').trim().toLowerCase();
	if (!cat) return 0;
	return profile.patterns
		.filter((p) => p.category.toLowerCase() === cat)
		.reduce((sum, p) => sum + p.count, 0);
}
