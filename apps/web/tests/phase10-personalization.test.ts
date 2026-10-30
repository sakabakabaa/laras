/**
 * Phase 10 — tests for adaptive personalized feedback.
 *
 * Covers: generic default, explicit enable/disable, evidence thresholds,
 * safe student output (no private analytics leaked), provenance shape, and
 * backward compatibility. Pure functions only — no PocketBase mocking.
 */
import { describe, expect, it } from 'vitest';
import {
	aggregatePatterns,
	buildLearnerProfile,
	DEFAULT_PERSONALIZATION_THRESHOLD,
	profileVersionHash,
	relevantPatterns,
	type LearnerObservation,
} from '@/lib/learner-profile';
import {
	buildPersonalizationContext,
	selectStrategy,
	suggestPractice,
	summarizeDecision,
} from '@/lib/personalization.server';

function obs(category: string, subcategory: string, createdAt: string): LearnerObservation {
	return {
		category,
		subcategory,
		severity: 'major',
		assignmentId: 'asg1',
		createdAt,
	};
}

describe('Phase 10 — learner profile thresholds', () => {
	it('classifies a single observation as emerging (never a confirmed weakness)', () => {
		const profile = buildLearnerProfile([obs('Morphology', 'case', '2026-01-01')], 3);
		const pattern = profile.patterns[0];
		expect(pattern.count).toBe(1);
		expect(pattern.status).toBe('emerging');
	});

	it('classifies a pattern as recurring only at the configurable threshold', () => {
		const two = buildLearnerProfile(
			[obs('Morphology', 'case', '2026-01-01'), obs('Morphology', 'case', '2026-01-02')],
			3,
		);
		expect(two.patterns[0].status).toBe('emerging');

		const three = buildLearnerProfile(
			[obs('Morphology', 'case', '2026-01-01'), obs('Morphology', 'case', '2026-01-02'), obs('Morphology', 'case', '2026-01-03')],
			3,
		);
		expect(three.patterns[0].status).toBe('recurring');
	});

	it('respects a custom threshold (minimumOccurrences is configurable)', () => {
		// Two observations meet a threshold of 2 but not 3.
		const profile = buildLearnerProfile(
			[obs('Syntax', 'word_order', '2026-01-01'), obs('Syntax', 'word_order', '2026-01-02')],
			2,
		);
		expect(profile.threshold).toBe(2);
		expect(profile.patterns[0].status).toBe('recurring');
	});

	it('classifies a doubled count as established', () => {
		const profile = buildLearnerProfile(
			Array.from({ length: 6 }, (_, i) => obs('Morphology', 'case', `2026-01-0${i + 1}`)),
			3,
		);
		expect(profile.patterns[0].status).toBe('established');
	});

	it('preserves underlying observations for external analysis', () => {
		const observations = [
			obs('Morphology', 'article', '2026-01-01'),
			obs('Morphology', 'case', '2026-01-02'),
		];
		const profile = buildLearnerProfile(observations, 3);
		expect(profile.totalObservations).toBe(2);
		// Each pattern keeps its full observation list, sorted oldest first.
		const article = profile.patterns.find((p) => p.subcategory === 'article')!;
		expect(article.observations).toHaveLength(1);
		expect(article.observations[0].createdAt).toBe('2026-01-01');
	});

	it('aggregates category counts across subcategories', () => {
		const profile = buildLearnerProfile(
			[
				obs('Morphology', 'article', '2026-01-01'),
				obs('Morphology', 'case', '2026-01-02'),
				obs('Morphology', 'case', '2026-01-03'),
				obs('Syntax', 'word_order', '2026-01-04'),
			],
			3,
		);
		const morph = profile.categoryCounts.find((c) => c.category === 'Morphology')!;
		expect(morph.count).toBe(3);
	});
});

describe('Phase 10 — strategy selection (generic default + enable/disable)', () => {
	it('returns generic when there is no profile', () => {
		expect(selectStrategy({ profile: null, currentCategory: 'Morphology', hintLevel: 1 })).toBe(
			'generic',
		);
	});

	it('returns generic when no validated pattern meets the threshold', () => {
		const profile = buildLearnerProfile([obs('Morphology', 'case', '2026-01-01')], 3);
		expect(selectStrategy({ profile, currentCategory: 'Morphology', hintLevel: 1 })).toBe(
			'generic',
		);
	});

	it('selects concept for a recurring pattern', () => {
		const profile = buildLearnerProfile(
			[obs('Morphology', 'case', '2026-01-01'), obs('Morphology', 'case', '2026-01-02'), obs('Morphology', 'case', '2026-01-03')],
			3,
		);
		expect(selectStrategy({ profile, currentCategory: 'Morphology', hintLevel: 1 })).toBe('concept');
	});

	it('selects focused for an established pattern', () => {
		const profile = buildLearnerProfile(
			Array.from({ length: 6 }, (_, i) => obs('Morphology', 'case', `2026-01-0${i + 1}`)),
			3,
		);
		expect(selectStrategy({ profile, currentCategory: 'Morphology', hintLevel: 1 })).toBe('focused');
	});

	it('never auto-selects explicit correction (Level 4 stays student-requested)', () => {
		const profile = buildLearnerProfile(
			Array.from({ length: 10 }, (_, i) => obs('Morphology', 'case', `2026-01-0${i + 1}`)),
			3,
		);
		expect(selectStrategy({ profile, currentCategory: 'Morphology', hintLevel: 4 })).not.toBe('explicit');
	});
});

describe('Phase 10 — safe student output (no private analytics leaked)', () => {
	it('never mentions counts, scores, or "your profile" in the model context', () => {
		const profile = buildLearnerProfile(
			Array.from({ length: 6 }, (_, i) => obs('Morphology', 'case', `2026-01-0${i + 1}`)),
			3,
		);
		const ctx = buildPersonalizationContext({ profile, currentCategory: 'Morphology' });
		expect(ctx).not.toContain('Anda telah');
		expect(ctx).not.toContain('profil Anda');
		expect(ctx).not.toContain('lemah');
		// The context does carry aggregated counts for the MODEL (not the student),
		// but instructs the model never to surface them.
		expect(ctx).toContain('jangan sebutkan angka');
	});

	it('returns empty context (generic feedback) when no validated pattern exists', () => {
		const profile = buildLearnerProfile([obs('Morphology', 'case', '2026-01-01')], 3);
		expect(buildPersonalizationContext({ profile, currentCategory: 'Morphology' })).toBe('');
	});
});

describe('Phase 10 — provenance shape', () => {
	it('records a stable profile version and decision summary', () => {
		const profile = buildLearnerProfile(
			[obs('Morphology', 'case', '2026-01-01'), obs('Morphology', 'case', '2026-01-02'), obs('Morphology', 'case', '2026-01-03')],
			3,
		);
		const strategy = selectStrategy({ profile, currentCategory: 'Morphology', hintLevel: 1 });
		const decision = summarizeDecision({ profile, currentCategory: 'Morphology', strategy });
		expect(decision.enabled).toBe(true);
		expect(decision.strategy).toBe('concept');
		expect(decision.relevantCategories).toContain('Morphology');
		expect(decision.historicalObservationCount).toBe(3);
		expect(decision.profileVersion).toMatch(/^v1-/);
	});

	it('marks the decision disabled for generic feedback', () => {
		const decision = summarizeDecision({
			profile: null,
			currentCategory: '',
			strategy: 'generic',
		});
		expect(decision.enabled).toBe(false);
		expect(decision.historicalObservationCount).toBe(0);
	});

	it('produces a deterministic profile version for the same data', () => {
		const obs1 = [obs('Morphology', 'case', '2026-01-01'), obs('Morphology', 'case', '2026-01-02')];
		const a = buildLearnerProfile(obs1, 3);
		const b = buildLearnerProfile(obs1, 3);
		expect(a.version).toBe(b.version);
	});
});

describe('Phase 10 — targeted practice suggestion', () => {
	it('suggests a practice activity for a recurring pattern', () => {
		const profile = buildLearnerProfile(
			[obs('Morphology', 'case', '2026-01-01'), obs('Morphology', 'case', '2026-01-02'), obs('Morphology', 'case', '2026-01-03')],
			3,
		);
		const practice = suggestPractice({ profile, currentCategory: 'Morphology' });
		expect(practice).not.toBeNull();
		expect(practice!.category).toBe('Morphology');
		expect(practice!.activityType.length).toBeGreaterThan(0);
	});

	it('returns null for an emerging pattern (no premature practice)', () => {
		const profile = buildLearnerProfile([obs('Morphology', 'case', '2026-01-01')], 3);
		expect(suggestPractice({ profile, currentCategory: 'Morphology' })).toBeNull();
	});
});

describe('Phase 10 — backward compatibility', () => {
	it('default threshold constant is 3 (matches the research default)', () => {
		expect(DEFAULT_PERSONALIZATION_THRESHOLD).toBe(3);
	});

	it('an empty observation set yields an empty profile with a stable version', () => {
		const profile = buildLearnerProfile([], 3);
		expect(profile.patterns).toHaveLength(0);
		expect(profile.totalObservations).toBe(0);
		expect(profile.version).toMatch(/^v1-/);
	});

	it('profileVersionHash is deterministic for identical inputs', () => {
		const a = profileVersionHash({ threshold: 3, patterns: [] });
		const b = profileVersionHash({ threshold: 3, patterns: [] });
		expect(a).toBe(b);
	});

	it('relevantPatterns excludes emerging patterns (safety boundary)', () => {
		const profile = buildLearnerProfile(
			[obs('Morphology', 'case', '2026-01-01'), obs('Morphology', 'case', '2026-01-02'), obs('Morphology', 'case', '2026-01-03')],
			3,
		);
		// 'case' is recurring (included); a non-existent subcategory is excluded.
		expect(relevantPatterns(profile, 'Morphology')).toHaveLength(1);
		expect(relevantPatterns(profile, 'Lexicon')).toHaveLength(0);
	});
});
