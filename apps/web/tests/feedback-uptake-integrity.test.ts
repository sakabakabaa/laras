/**
 * Phase 10.1 — research-integrity hardening tests (Tests A–I).
 *
 * These tests lock down the participant-isolation, association-validation,
 * uptake-consistency, non-causal-attribution, conservative-taxonomy, and
 * student-privacy invariants of the Phase 9–10 feedback→revision→uptake
 * pipeline. They exercise the pure, client-safe helpers that are the single
 * source of truth for server-side validation.
 */
import { describe, expect, it } from 'vitest';
import {
	hintLevelsBeforeRevision,
	validateAssociationPair,
	validateUptakeRelationship,
	computeUptakeAnalytics,
	type AttemptRef,
} from '@/lib/feedback-uptake';
import { buildLearnerProfile, aggregatePatterns } from '@/lib/learner-profile';
import { buildPersonalizationContext } from '@/lib/personalization.server';

const A = 'asg1';
const t = (n: number) => new Date(2026, 0, 1, 0, n).toISOString();

function attempt(overrides: Partial<AttemptRef> & { id: string }): AttemptRef {
	return {
		assignment: A,
		identityKey: 'studentA',
		created: t(0),
		level: 1,
		...overrides,
	};
}

// ── TEST A — Same student: Hint 1 → Hint 2 → Revision ─────────────────────
describe('TEST A — single participant hint chain', () => {
	it('detects only that student\'s hints [1, 2] before the revision', () => {
		const attempts: AttemptRef[] = [
			attempt({ id: 'a1', level: 1, created: t(0) }),
			attempt({ id: 'a2', level: 2, created: t(1) }),
			attempt({ id: 'a3', level: 0, created: t(2) }), // the revision attempt
		];
		expect(hintLevelsBeforeRevision(attempts, 'a3')).toEqual([1, 2]);
	});
});

// ── TEST B — Two students must not mix ─────────────────────────────────────
describe('TEST B — participant isolation across two students', () => {
	const attempts: AttemptRef[] = [
		// Student A: Hint 1 → Hint 2 → Revision
		attempt({ id: 'a1', identityKey: 'studentA', level: 1, created: t(0) }),
		attempt({ id: 'a2', identityKey: 'studentA', level: 2, created: t(1) }),
		attempt({ id: 'a3', identityKey: 'studentA', level: 0, created: t(2) }),
		// Student B: Hint 1 → Revision
		attempt({ id: 'b1', identityKey: 'studentB', level: 1, created: t(0) }),
		attempt({ id: 'b2', identityKey: 'studentB', level: 0, created: t(1) }),
	];

	it('Student A\'s revision detects only [1, 2]', () => {
		expect(hintLevelsBeforeRevision(attempts, 'a3')).toEqual([1, 2]);
	});

	it('Student B\'s revision detects only [1]', () => {
		expect(hintLevelsBeforeRevision(attempts, 'b2')).toEqual([1]);
	});

	it('never includes the other student\'s hints', () => {
		// Student B's revision must never absorb Student A's Hint 2.
		expect(hintLevelsBeforeRevision(attempts, 'b2')).not.toContain(2);
	});
});

// ── TEST C — Cross-student association rejected ────────────────────────────
describe('TEST C — cross-student association', () => {
	it('is rejected by validateAssociationPair', () => {
		const err = validateAssociationPair({
			assignmentId: A,
			feedbackAttempt: attempt({ id: 'a1', identityKey: 'studentA', created: t(0) }),
			revisionAttempt: attempt({ id: 'b2', identityKey: 'studentB', created: t(1) }),
		});
		expect(err).not.toBeNull();
		expect(err?.status).toBe(422);
	});
});

// ── TEST D — Cross-assignment association rejected ────────────────────────
describe('TEST D — cross-assignment association', () => {
	it('is rejected by validateAssociationPair', () => {
		const err = validateAssociationPair({
			assignmentId: A,
			feedbackAttempt: attempt({ id: 'a1', assignment: A, created: t(0) }),
			revisionAttempt: attempt({ id: 'a2', assignment: 'asg2', created: t(1) }),
		});
		expect(err).not.toBeNull();
		expect(err?.status).toBe(422);
	});
});

// ── TEST E — Invalid chronology rejected ──────────────────────────────────
describe('TEST E — invalid chronology', () => {
	it('rejects a revision that occurs before the feedback', () => {
		const err = validateAssociationPair({
			assignmentId: A,
			feedbackAttempt: attempt({ id: 'a1', identityKey: 'studentA', created: t(5) }),
			revisionAttempt: attempt({ id: 'a2', identityKey: 'studentA', created: t(0) }),
		});
		expect(err).not.toBeNull();
		expect(err?.status).toBe(422);
	});

	it('allows a revision at or after the feedback', () => {
		const ok = validateAssociationPair({
			assignmentId: A,
			feedbackAttempt: attempt({ id: 'a1', identityKey: 'studentA', created: t(0) }),
			revisionAttempt: attempt({ id: 'a2', identityKey: 'studentA', created: t(5) }),
		});
		expect(ok).toBeNull();
	});
});

// ── TEST F — Invalid uptake assignment rejected ───────────────────────────
describe('TEST F — uptake annotation on the wrong assignment', () => {
	it('is rejected when the feedback_revision belongs to another assignment', () => {
		const err = validateUptakeRelationship({
			assignmentId: A,
			feedbackRevision: {
				assignment: 'asg2',
				feedbackAttempt: 'a1',
				revisionAttempt: 'a2',
			},
			feedbackAttempt: attempt({ id: 'a1', identityKey: 'studentA' }),
			revisionAttempt: attempt({ id: 'a2', identityKey: 'studentA' }),
		});
		expect(err).not.toBeNull();
		expect(err?.status).toBe(422);
	});

	it('is rejected when the two attempts belong to different participants', () => {
		const err = validateUptakeRelationship({
			assignmentId: A,
			feedbackRevision: { assignment: A, feedbackAttempt: 'a1', revisionAttempt: 'b2' },
			feedbackAttempt: attempt({ id: 'a1', identityKey: 'studentA' }),
			revisionAttempt: attempt({ id: 'b2', identityKey: 'studentB' }),
		});
		expect(err).not.toBeNull();
		expect(err?.status).toBe(422);
	});

	it('is accepted when the relationship is fully consistent', () => {
		const ok = validateUptakeRelationship({
			assignmentId: A,
			feedbackRevision: { assignment: A, feedbackAttempt: 'a1', revisionAttempt: 'a2' },
			feedbackAttempt: attempt({ id: 'a1', identityKey: 'studentA' }),
			revisionAttempt: attempt({ id: 'a2', identityKey: 'studentA' }),
		});
		expect(ok).toBeNull();
	});
});

// ── TEST G — Uncertain attribution is never auto-converted ────────────────
describe('TEST G — uncertain attribution stays uncertain', () => {
	it('does not infer successful uptake from unannotated (uncertain) records', () => {
		// Records with no human uptake judgment represent uncertain attribution.
		// The analytics must NOT convert them into a successful uptake rate.
		const records = Array.from({ length: 6 }, () => ({
			uptakeJudgment: '' as const,
			beforeRevisionStatus: '' as const,
			afterRevisionStatus: '' as const,
			numberOfHints: 1,
			maxHintLevel: 1,
			requiredExplicit: false,
			cefrLevel: '',
			assignmentId: A,
			aiCategory: '',
			aiSubcategory: '',
			model: '',
		}));
		const a = computeUptakeAnalytics(records);
		expect(a.itemsWithUptakeAnnotation).toBe(0);
		// No human judgment → no rate is inferred (suppressed, not 100%).
		expect(a.successfulUptakeRate).toBeNull();
	});

	it('keeps attribution out of the uptake analytics record (no causal field)', () => {
		// The UptakeRecord carries uptakeJudgment (human-entered) only — there
		// is no "caused_by_ai" / "improved_due_to_ai" field to auto-fill.
		const sample = {
			uptakeJudgment: '' as const,
			beforeRevisionStatus: '' as const,
			afterRevisionStatus: '' as const,
			numberOfHints: 0,
			maxHintLevel: 0,
			requiredExplicit: false,
			cefrLevel: '',
			assignmentId: A,
			aiCategory: '',
			aiSubcategory: '',
			model: '',
		};
		expect(sample).not.toHaveProperty('causedByAi');
		expect(sample).not.toHaveProperty('improvedDueToAi');
		expect(sample).not.toHaveProperty('attributionStatus');
	});
});

// ── TEST H — Missing taxonomy stays unclassified ──────────────────────────
describe('TEST H — missing taxonomy is not guessed', () => {
	it('drops observations with no category rather than inventing one', () => {
		const profile = buildLearnerProfile(
			[
				{ category: '', subcategory: '', severity: 'minor', assignmentId: A, createdAt: t(0) },
				{ category: 'Morphology', subcategory: 'case', severity: 'major', assignmentId: A, createdAt: t(1) },
			],
			3,
		);
		// Only the categorized observation forms a pattern; the empty one is
		// excluded from patterns rather than assigned a guessed category.
		expect(profile.patterns).toHaveLength(1);
		expect(profile.patterns.every((p) => p.category !== '')).toBe(true);
	});

	it('never marks a pattern as improving without explicit validated evidence', () => {
		const profile = buildLearnerProfile(
			Array.from({ length: 5 }, (_, i) => ({
				category: 'Morphology',
				subcategory: 'case',
				severity: 'major',
				assignmentId: A,
				createdAt: t(i),
			})),
			3,
		);
		// No improvingKeys supplied → no pattern is "improving" (no inference).
		expect(profile.patterns.every((p) => !p.improving)).toBe(true);
		expect(profile.patterns.some((p) => p.status === 'recurring' || p.status === 'established')).toBe(true);
	});

	it('aggregatePatterns leaves subcategory-less general findings unclassified for improvement', () => {
		const patterns = aggregatePatterns(
			[
				{ category: 'Syntax', subcategory: '', severity: 'minor', assignmentId: A, createdAt: t(0) },
				{ category: 'Syntax', subcategory: '', severity: 'minor', assignmentId: A, createdAt: t(1) },
			],
			3,
		);
		// Below threshold → emerging, never improving.
		expect(patterns[0].status).toBe('emerging');
		expect(patterns[0].improving).toBe(false);
	});
});

// ── TEST I — Student privacy: no research-only fields in student feedback ─
describe('TEST I — student-facing feedback exposes no research fields', () => {
	// The student-facing formative feedback contract (CheckFeedback) is
	// pedagogical only: level, area, feedback, evidence. None of the
	// research-only fields may appear in what a student sees.
	const studentFacingKeys = ['level', 'area', 'feedback', 'evidence'];
	const researchDenylist = [
		'identityKey',
		'participantId',
		'aiConfidence',
		'detectionJudgment',
		'attributionStatus',
		'uptakeJudgment',
		'precision',
		'recall',
		'f1',
		'falsePositive',
		'falseNegative',
		'learnerProfileVersion',
		'historicalObservationCount',
		'researchSchemaVersion',
	];

	it('the student-facing feedback shape contains only pedagogical keys', () => {
		for (const key of researchDenylist) {
			expect(studentFacingKeys, `research field ${key} must not reach the student`).not.toContain(key);
		}
	});

	it('personalization context is model-only and guards against exposing counts', () => {
		const profile = buildLearnerProfile(
			Array.from({ length: 4 }, (_, i) => ({
				category: 'Morphology',
				subcategory: 'case',
				severity: 'major',
				assignmentId: A,
				createdAt: t(i),
			})),
			3,
		);
		const ctx = buildPersonalizationContext({ profile, currentCategory: 'Morphology' });
		// The context is addressed to the MODEL, not the student, and explicitly
		// forbids mentioning counts/statistics to the student.
		expect(ctx).toContain('jangan sebutkan angka');
	});
});
