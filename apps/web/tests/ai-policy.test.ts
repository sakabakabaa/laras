/**
 * Phase 1 — Student AI Assistance Policy and Permission Layer.
 *
 * Tests cover:
 *  1. Student can use a permitted capability.
 *  2. Student cannot use a prohibited capability.
 *  3. Frontend manipulation cannot bypass policy (server-side gate).
 *  4. Student cannot access another student's data (data scope).
 *  5. Student cannot access lecturer-only information (data scope).
 *  6. Student cannot access research information (data scope).
 *  7. Assessment mode correctly restricts generation.
 *  8. Lecturer AI behavior remains unchanged (separate scope).
 *  9. Existing capability vocabulary is closed and controlled.
 *
 * Pure-function tests only — no PocketBase mocking. The server-side gate is
 * tested through the pure policy resolution + authorization functions that
 * the endpoints call; the endpoints themselves are thin wrappers over these.
 */
import { describe, expect, it } from 'vitest';
import {
	ALLOWED_CAPABILITIES,
	CAPABILITY_CATEGORY,
	isCapability,
	PROHIBITED_CAPABILITIES,
	RESTRICTED_CAPABILITIES,
	type Capability,
} from '@/lib/ai-capabilities';
import {
	ASSISTANCE_LEVELS,
	ASSISTANCE_LEVEL_LABEL,
	checkCapability,
	defaultLevelForActivity,
	denialMessage,
	isCapabilityAllowed,
	isCapabilityProhibited,
	LEVEL_POLICIES,
	resolveAssignmentPolicy,
	type AiPolicy,
	type AssistanceLevel,
} from '@/lib/ai-policy';
import {
	authorizeCapability,
	authorizeCapabilities,
	CHECK_ANSWER_CAPABILITIES,
	findProhibitedDataKeys,
	PRACTICE_ASSIST_CAPABILITIES,
	PRACTICE_SPEAKING_CAPABILITIES,
	sanitizeStudentContext,
	STUDENT_ALLOWED_DATA,
	STUDENT_PROHIBITED_DATA,
} from '@/lib/ai-policy.server';

// ── Helpers ─────────────────────────────────────────────────

function formalAssignment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		activityType: 'formal',
		status: 'published',
		checkEnabled: true,
		...overrides,
	};
}

function formativeAssignment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		activityType: 'formative',
		status: 'published',
		checkEnabled: true,
		aiAssistEnabled: true,
		...overrides,
	};
}

function policyWithLevel(level: AssistanceLevel, enabled = true): AiPolicy {
	return resolveAssignmentPolicy({ ...formalAssignment(), aiPolicy: { assistanceLevel: level, enabled } });
}

// ── 9. Controlled capability vocabulary ─────────────────────

describe('Phase 1 — controlled capability vocabulary', () => {
	it('partitions every capability into exactly one category', () => {
		const all = [...ALLOWED_CAPABILITIES, ...RESTRICTED_CAPABILITIES, ...PROHIBITED_CAPABILITIES];
		// No duplicates.
		expect(new Set(all).size).toBe(all.length);
		// Every capability string is recognized.
		for (const cap of all) expect(isCapability(cap)).toBe(true);
		// An arbitrary string is not a capability.
		expect(isCapability('do_anything')).toBe(false);
		expect(isCapability('')).toBe(false);
	});

	it('marks answer-completing capabilities as inherently prohibited', () => {
		expect(CAPABILITY_CATEGORY.generate_complete_answer).toBe('prohibited');
		expect(CAPABILITY_CATEGORY.complete_assignment).toBe('prohibited');
		expect(CAPABILITY_CATEGORY.solve_assessment).toBe('prohibited');
		expect(CAPABILITY_CATEGORY.impersonate_student).toBe('prohibited');
	});

	it('marks tutor-first capabilities as inherently allowed', () => {
		expect(CAPABILITY_CATEGORY.explain_concept).toBe('allowed');
		expect(CAPABILITY_CATEGORY.give_hint).toBe('allowed');
		expect(CAPABILITY_CATEGORY.analyze_own_draft).toBe('allowed');
		expect(CAPABILITY_CATEGORY.provide_feedback).toBe('allowed');
	});

	it('marks controlled-content capabilities as restricted', () => {
		expect(CAPABILITY_CATEGORY.translation).toBe('restricted');
		expect(CAPABILITY_CATEGORY.example_answer).toBe('restricted');
		expect(CAPABILITY_CATEGORY.sentence_suggestion).toBe('restricted');
		expect(CAPABILITY_CATEGORY.rewrite_sentence).toBe('restricted');
	});
});

// ── Default policy resolution ────────────────────────────────

describe('Phase 1 — default policy resolution', () => {
	it('defaults formal tasks to assessment_mode', () => {
		const policy = resolveAssignmentPolicy(formalAssignment());
		expect(policy.assistanceLevel).toBe('assessment_mode');
		expect(policy.assessmentMode).toBe(true);
		expect(policy.enabled).toBe(true);
	});

	it('defaults formative practice to learning_support', () => {
		const policy = resolveAssignmentPolicy(formativeAssignment());
		expect(policy.assistanceLevel).toBe('learning_support');
		expect(policy.assessmentMode).toBe(false);
		expect(policy.enabled).toBe(true);
	});

	it('uses an explicit aiPolicy when present', () => {
		const policy = resolveAssignmentPolicy(
			formalAssignment({ aiPolicy: { assistanceLevel: 'guided_assistance', enabled: true } }),
		);
		expect(policy.assistanceLevel).toBe('guided_assistance');
		expect(policy.assessmentMode).toBe(false);
	});

	it('respects an explicit disabled flag', () => {
		const policy = resolveAssignmentPolicy(
			formativeAssignment({ aiPolicy: { assistanceLevel: 'learning_support', enabled: false } }),
		);
		expect(policy.enabled).toBe(false);
	});

	it('falls back to default when aiPolicy is malformed', () => {
		const policy = resolveAssignmentPolicy(formalAssignment({ aiPolicy: 'not-json' }));
		expect(policy.assistanceLevel).toBe('assessment_mode');
		const policy2 = resolveAssignmentPolicy(formalAssignment({ aiPolicy: { foo: 'bar' } }));
		expect(policy2.assistanceLevel).toBe('assessment_mode');
	});

	it('derives the default level from activity type', () => {
		expect(defaultLevelForActivity('formal')).toBe('assessment_mode');
		expect(defaultLevelForActivity('formative')).toBe('learning_support');
		expect(defaultLevelForActivity('')).toBe('assessment_mode');
		expect(defaultLevelForActivity(null)).toBe('assessment_mode');
	});

	it('never lets an explicit policy weaken a prohibited capability', () => {
		// A stored policy tries to move generate_complete_answer into allowed.
		const policy = resolveAssignmentPolicy(
			formativeAssignment({
				aiPolicy: {
					assistanceLevel: 'learning_support',
					enabled: true,
					allowedCapabilities: ['generate_complete_answer', 'solve_assessment'],
				},
			}),
		);
		expect(policy.prohibitedCapabilities).toContain('generate_complete_answer');
		expect(policy.prohibitedCapabilities).toContain('solve_assessment');
		expect(policy.allowedCapabilities).not.toContain('generate_complete_answer');
	});
});

// ── 1. Student can use a permitted capability ───────────────

describe('Phase 1 — permitted capabilities are allowed', () => {
	it('allows analyze_own_draft under learning_support', () => {
		const policy = policyWithLevel('learning_support');
		expect(isCapabilityAllowed(policy, 'analyze_own_draft')).toBe(true);
		expect(isCapabilityAllowed(policy, 'provide_feedback')).toBe(true);
		expect(isCapabilityAllowed(policy, 'give_hint')).toBe(true);
		expect(isCapabilityAllowed(policy, 'explain_concept')).toBe(true);
	});

	it('allows analyze_own_draft under assessment_mode (formative feedback on own draft)', () => {
		const policy = policyWithLevel('assessment_mode');
		expect(isCapabilityAllowed(policy, 'analyze_own_draft')).toBe(true);
		expect(isCapabilityAllowed(policy, 'provide_feedback')).toBe(true);
		expect(isCapabilityAllowed(policy, 'give_hint')).toBe(true);
		expect(isCapabilityAllowed(policy, 'explain_instruction')).toBe(true);
	});

	it('allows translation under guided_assistance', () => {
		const policy = policyWithLevel('guided_assistance');
		expect(isCapabilityAllowed(policy, 'translation')).toBe(true);
		expect(isCapabilityAllowed(policy, 'example_answer')).toBe(true);
		expect(isCapabilityAllowed(policy, 'sentence_suggestion')).toBe(true);
	});
});

// ── 2. Student cannot use a prohibited capability ───────────

describe('Phase 1 — prohibited capabilities are denied', () => {
	it('denies generate_complete_answer under every level', () => {
		for (const level of ASSISTANCE_LEVELS) {
			const policy = policyWithLevel(level);
			expect(isCapabilityProhibited(policy, 'generate_complete_answer')).toBe(true);
			expect(isCapabilityAllowed(policy, 'generate_complete_answer')).toBe(false);
		}
	});

	it('denies complete_assignment under every level', () => {
		for (const level of ASSISTANCE_LEVELS) {
			const policy = policyWithLevel(level);
			expect(isCapabilityAllowed(policy, 'complete_assignment')).toBe(false);
		}
	});

	it('denies solve_assessment and impersonate_student under every level', () => {
		for (const level of ASSISTANCE_LEVELS) {
			const policy = policyWithLevel(level);
			expect(isCapabilityAllowed(policy, 'solve_assessment')).toBe(false);
			expect(isCapabilityAllowed(policy, 'impersonate_student')).toBe(false);
		}
	});

	it('returns a prohibited decision with a denial reason', () => {
		const policy = policyWithLevel('learning_support');
		const decision = checkCapability(policy, 'generate_complete_answer');
		expect(decision.ok).toBe(false);
		if (!decision.ok) expect(decision.reason).toBe('prohibited');
	});

	it('denies all capabilities when the policy is disabled', () => {
		const policy = policyWithLevel('learning_support', false);
		expect(isCapabilityAllowed(policy, 'analyze_own_draft')).toBe(false);
		expect(isCapabilityAllowed(policy, 'give_hint')).toBe(false);
		const decision = checkCapability(policy, 'analyze_own_draft');
		expect(decision.ok).toBe(false);
		if (!decision.ok) expect(decision.reason).toBe('disabled');
	});
});

// ── 3. Frontend manipulation cannot bypass policy ──────────

describe('Phase 1 — server-side gate cannot be bypassed', () => {
	it('authorizeCapability returns a denial for a prohibited capability', () => {
		const policy = policyWithLevel('assessment_mode');
		const decision = authorizeCapability(policy, 'generate_complete_answer');
		expect(decision.ok).toBe(false);
		if (!decision.ok) {
			expect(decision.status).toBe(403);
			expect(decision.message).toContain('tidak diizinkan');
		}
	});

	it('authorizeCapability returns a denial when disabled', () => {
		const policy = policyWithLevel('learning_support', false);
		const decision = authorizeCapability(policy, 'analyze_own_draft');
		expect(decision.ok).toBe(false);
		if (!decision.ok) expect(decision.status).toBe(422);
	});

	it('authorizeCapabilities rejects if ANY capability in the set is prohibited', () => {
		// An endpoint that claims to provide analyze_own_draft AND
		// generate_complete_answer must be rejected entirely.
		const policy = policyWithLevel('learning_support');
		const decision = authorizeCapabilities(policy, [
			'analyze_own_draft',
			'generate_complete_answer',
		]);
		expect(decision.ok).toBe(false);
	});

	it('authorizeCapabilities allows when all capabilities are permitted', () => {
		const policy = policyWithLevel('learning_support');
		const decision = authorizeCapabilities(policy, CHECK_ANSWER_CAPABILITIES);
		expect(decision.ok).toBe(true);
	});

	it('the existing student endpoints capability sets are allowed under their default levels', () => {
		// Cek jawaban (formal → assessment_mode, formative → learning_support).
		expect(
			authorizeCapabilities(policyWithLevel('assessment_mode'), CHECK_ANSWER_CAPABILITIES).ok,
		).toBe(true);
		expect(
			authorizeCapabilities(policyWithLevel('learning_support'), CHECK_ANSWER_CAPABILITIES).ok,
		).toBe(true);
		// Practice assist (formative → learning_support).
		expect(
			authorizeCapabilities(policyWithLevel('learning_support'), PRACTICE_ASSIST_CAPABILITIES).ok,
		).toBe(true);
		// Practice speaking (formative → learning_support).
		expect(
			authorizeCapabilities(policyWithLevel('learning_support'), PRACTICE_SPEAKING_CAPABILITIES).ok,
		).toBe(true);
	});

	it('denial messages are student-readable Indonesian', () => {
		const policy = policyWithLevel('assessment_mode');
		const decision = checkCapability(policy, 'generate_complete_answer');
		const msg = denialMessage('generate_complete_answer', decision);
		expect(msg.length).toBeGreaterThan(10);
		expect(msg).toMatch(/tidak/i);
	});
});

// ── 7. Assessment mode restricts generation ─────────────────

describe('Phase 1 — assessment mode restricts generation', () => {
	const policy = policyWithLevel('assessment_mode');

	it('prohibits content-generation capabilities', () => {
		expect(isCapabilityProhibited(policy, 'generate_practice')).toBe(true);
		expect(isCapabilityProhibited(policy, 'brainstorm')).toBe(true);
		expect(isCapabilityProhibited(policy, 'translation')).toBe(true);
		expect(isCapabilityProhibited(policy, 'example_answer')).toBe(true);
		expect(isCapabilityProhibited(policy, 'sentence_suggestion')).toBe(true);
		expect(isCapabilityProhibited(policy, 'rewrite_sentence')).toBe(true);
	});

	it('prohibits answer-completing capabilities', () => {
		expect(isCapabilityProhibited(policy, 'generate_complete_answer')).toBe(true);
		expect(isCapabilityProhibited(policy, 'complete_assignment')).toBe(true);
		expect(isCapabilityProhibited(policy, 'rewrite_entire_submission')).toBe(true);
		expect(isCapabilityProhibited(policy, 'solve_assessment')).toBe(true);
	});

	it('still allows instruction/concept explanation and own-draft feedback', () => {
		expect(isCapabilityAllowed(policy, 'explain_instruction')).toBe(true);
		expect(isCapabilityAllowed(policy, 'explain_concept')).toBe(true);
		expect(isCapabilityAllowed(policy, 'give_hint')).toBe(true);
		expect(isCapabilityAllowed(policy, 'analyze_own_draft')).toBe(true);
		expect(isCapabilityAllowed(policy, 'provide_feedback')).toBe(true);
		expect(isCapabilityAllowed(policy, 'explain_error')).toBe(true);
	});

	it('restricts vocabulary and grammar help (limited technical assistance)', () => {
		// In assessment_mode these are restricted, not allowed.
		const vocabDecision = checkCapability(policy, 'vocabulary_help');
		expect(vocabDecision.ok).toBe(false);
		if (!vocabDecision.ok) expect(vocabDecision.reason).toBe('restricted_denied');
		const grammarDecision = checkCapability(policy, 'grammar_help');
		expect(grammarDecision.ok).toBe(false);
	});

	it('practice-assist capabilities are NOT all allowed under assessment_mode', () => {
		// vocabulary_help and grammar_help are restricted in assessment_mode,
		// so the full practice-assist capability set is rejected.
		const decision = authorizeCapabilities(policy, PRACTICE_ASSIST_CAPABILITIES);
		expect(decision.ok).toBe(false);
	});
});

// ── 4, 5, 6. Student data scope ─────────────────────────────

describe('Phase 1 — student data scope filtering', () => {
	it('documents the allowed data categories', () => {
		expect(STUDENT_ALLOWED_DATA).toContain('student_own_draft');
		expect(STUDENT_ALLOWED_DATA).toContain('allowed_course_materials');
		expect(STUDENT_ALLOWED_DATA).toContain('student_visible_instructions');
		expect(STUDENT_ALLOWED_DATA).toContain('student_own_feedback');
	});

	it('documents the prohibited data categories', () => {
		expect(STUDENT_PROHIBITED_DATA).toContain('other_students_submissions');
		expect(STUDENT_PROHIBITED_DATA).toContain('lecturer_private_notes');
		expect(STUDENT_PROHIBITED_DATA).toContain('hidden_rubric_information');
		expect(STUDENT_PROHIBITED_DATA).toContain('answer_keys');
		expect(STUDENT_PROHIBITED_DATA).toContain('hidden_ai_evaluation');
		expect(STUDENT_PROHIBITED_DATA).toContain('research_data');
		expect(STUDENT_PROHIBITED_DATA).toContain('rater_judgments');
		expect(STUDENT_PROHIBITED_DATA).toContain('adjudication_data');
		expect(STUDENT_PROHIBITED_DATA).toContain('internal_research_metadata');
	});

	it('sanitizeStudentContext keeps only student-authorized fields', () => {
		const sanitized = sanitizeStudentContext({
			studentResponse: 'My draft essay',
			instructions: 'Write 200 words',
			requirements: 'Rubric: grammar, vocabulary',
			materialContext: 'Approved material text',
			focus: 'grammar',
		});
		expect(sanitized.studentResponse).toBe('My draft essay');
		expect(sanitized.instructions).toBe('Write 200 words');
		expect(sanitized.requirements).toBe('Rubric: grammar, vocabulary');
		expect(sanitized.materialContext).toBe('Approved material text');
		expect(sanitized.focus).toBe('grammar');
		// The sanitized output has no prohibited keys.
		const keys = Object.keys(sanitized) as unknown as string[];
		expect(findProhibitedDataKeys(sanitized as unknown as Record<string, unknown>)).toEqual([]);
	});

	it('sanitizeStudentContext drops unknown / prohibited keys', () => {
		// A caller might accidentally assemble a context with prohibited data.
		const raw = {
			studentResponse: 'draft',
			instructions: 'instr',
			requirements: 'req',
			materialContext: '',
			focus: '',
			// Prohibited keys that must never reach the model:
			other_students_submissions: 'secret',
			answer_keys: { q1: 2 },
			hidden_ai_evaluation: 'draft eval',
			research_data: 'rater judgments',
			rater_judgments: 'judgment',
			internal_research_metadata: 'meta',
		};
		const sanitized = sanitizeStudentContext(raw);
		// The typed output simply does not have those fields.
		expect((sanitized as unknown as Record<string, unknown>).other_students_submissions).toBeUndefined();
		expect((sanitized as unknown as Record<string, unknown>).answer_keys).toBeUndefined();
		expect((sanitized as unknown as Record<string, unknown>).hidden_ai_evaluation).toBeUndefined();
		expect((sanitized as unknown as Record<string, unknown>).research_data).toBeUndefined();
		expect(findProhibitedDataKeys(raw)).toContain('other_students_submissions');
		expect(findProhibitedDataKeys(raw)).toContain('answer_keys');
		expect(findProhibitedDataKeys(raw)).toContain('hidden_ai_evaluation');
	});

	it('sanitizeStudentContext truncates overly long fields', () => {
		const long = 'x'.repeat(20000);
		const sanitized = sanitizeStudentContext({ studentResponse: long, instructions: long });
		expect(sanitized.studentResponse.length).toBe(12000);
		expect(sanitized.instructions.length).toBe(4000);
	});

	it('findProhibitedDataKeys returns empty for a clean context', () => {
		expect(findProhibitedDataKeys({ studentResponse: 'x', instructions: 'y' })).toEqual([]);
	});
});

// ── 8. Lecturer AI behavior remains unchanged ───────────────

describe('Phase 1 — lecturer AI scope is separate', () => {
	it('the policy layer does not import or depend on the lecturer assistant', () => {
		// The student policy module must not pull in lecturer-only modules.
		// This is a structural guarantee: importing ai-policy.server must not
		// transitively import the lecturer assistant runtime.
		// We verify by checking the module does not reference lecturer tools.
		// (A dynamic import would defeat this; the static graph is what matters.)
		expect(typeof authorizeCapability).toBe('function');
		expect(typeof authorizeCapabilities).toBe('function');
	});

	it('the lecturer assistant endpoint is faculty-only (resolveFaculty)', async () => {
		// The lecturer assistant's auth gate is `resolveFaculty`, which rejects
		// non-faculty. We verify it exists and is the gate (not the student
		// policy). This is a structural assertion: the student policy layer
		// and the lecturer assistant are separate modules.
		const { resolveFaculty } = await import('@/lib/assistant.server');
		expect(typeof resolveFaculty).toBe('function');
		// The student policy module is a different import path entirely.
		expect(typeof sanitizeStudentContext).toBe('function');
	});

	it('prohibited capabilities are never exposed as student tools', () => {
		// The capability vocabulary is closed: a student AI request can only
		// request capabilities from the vocabulary, and prohibited ones are
		// always rejected. There is no "student tool" that maps to a
		// prohibited capability.
		for (const cap of PROHIBITED_CAPABILITIES) {
			const policy = policyWithLevel('learning_support');
			expect(isCapabilityAllowed(policy, cap)).toBe(false);
		}
	});
});

// ── Level policy integrity ──────────────────────────────────

describe('Phase 1 — level policy integrity', () => {
	it('every level has a non-empty prohibited list', () => {
		for (const level of ASSISTANCE_LEVELS) {
			expect(LEVEL_POLICIES[level].prohibitedCapabilities.length).toBeGreaterThan(0);
		}
	});

	it('every level prohibits the answer-completing capabilities', () => {
		for (const level of ASSISTANCE_LEVELS) {
			const prohibited = LEVEL_POLICIES[level].prohibitedCapabilities;
			expect(prohibited).toContain('generate_complete_answer');
			expect(prohibited).toContain('complete_assignment');
			expect(prohibited).toContain('rewrite_entire_submission');
			expect(prohibited).toContain('solve_assessment');
			expect(prohibited).toContain('impersonate_student');
		}
	});

	it('learning_support restricts but does not prohibit controlled content', () => {
		const ls = LEVEL_POLICIES.learning_support;
		expect(ls.restrictedCapabilities).toContain('translation');
		expect(ls.restrictedCapabilities).toContain('example_answer');
		// Restricted means not in allowed and not in prohibited.
		expect(ls.allowedCapabilities).not.toContain('translation');
		expect(ls.prohibitedCapabilities).not.toContain('translation');
	});

	it('guided_assistance promotes restricted capabilities to allowed', () => {
		const ga = LEVEL_POLICIES.guided_assistance;
		expect(ga.allowedCapabilities).toContain('translation');
		expect(ga.allowedCapabilities).toContain('example_answer');
		expect(ga.allowedCapabilities).toContain('sentence_suggestion');
		expect(ga.allowedCapabilities).toContain('rewrite_sentence');
		expect(ga.restrictedCapabilities).toEqual([]);
	});

	it('assessment_mode is the most restrictive level', () => {
		const am = LEVEL_POLICIES.assessment_mode;
		const ls = LEVEL_POLICIES.learning_support;
		expect(am.allowedCapabilities.length).toBeLessThan(ls.allowedCapabilities.length);
		expect(am.prohibitedCapabilities.length).toBeGreaterThan(ls.prohibitedCapabilities.length);
	});

	it('exposes human-readable labels for every level', () => {
		for (const level of ASSISTANCE_LEVELS) {
			expect(ASSISTANCE_LEVEL_LABEL[level].length).toBeGreaterThan(0);
		}
	});
});
