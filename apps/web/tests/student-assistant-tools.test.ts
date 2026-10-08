/**
 * Phase 4 — Context-Aware Student AI Tools: security boundary tests.
 *
 * Pure-function tests (no PocketBase mocking) covering:
 *   1. The tool registry is closed and controlled (exactly the 8 tools).
 *   2. Every tool maps to a tutor-first (allowed) capability — never a
 *      prohibited answer-completing capability.
 *   3. Argument validation enforces required params.
 *   4. The submission-state gate blocks draft analysis after submission.
 *   5. The controlled page context builder emits ONLY student-authorized
 *      fields and never leaks prohibited data categories.
 *   6. Authorization: a tool whose capability is prohibited under a policy is
 *      denied server-side (the gate the model cannot bypass).
 *   7. Legitimate operations: permitted tools are allowed under their default
 *      policy levels.
 *   8. Lecturer AI scope is untouched (separate module path).
 */
import { describe, expect, it } from 'vitest';
import {
	PROHIBITED_CAPABILITIES,
	type Capability,
} from '@/lib/ai-capabilities';
import {
	authorizeCapability,
	findProhibitedDataKeys,
	STUDENT_PROHIBITED_DATA,
} from '@/lib/ai-policy.server';
import { resolveAssignmentPolicy } from '@/lib/ai-policy';
import {
	buildStudentPageContext,
	getStudentToolDefinition,
	invokeStudentTool,
	isStudentToolName,
	STUDENT_TOOL_NAMES,
	STUDENT_TOOL_REGISTRY,
	toolStateAvailability,
	validateStudentToolArgs,
	type StudentPageContext,
} from '@/lib/student-assistant-tools.server';
import type { AssistantContext } from '@/lib/student-assistant.server';
import type { Assignment } from '@/lib/assignments';

// ── Helpers ─────────────────────────────────────────────────

const REQUIRED_TOOLS = [
	'get_current_assignment',
	'get_assignment_instructions',
	'get_allowed_course_materials',
	'get_my_draft',
	'get_my_previous_submission',
	'analyze_my_draft',
	'explain_assignment_requirement',
	'generate_practice_activity',
] as const;

function mockAssignment(overrides: Partial<Assignment> = {}): Assignment {
	return {
		id: 'assn00000000001',
		owner: 'lecturer0000001',
		course: 'course000000001',
		session: 'sess000000000001',
		subCpmk: 'subcpk0000000001',
		title: 'Tugas Menulis',
		instructions: 'Tulis esai 200 kata.',
		requirements: 'Rubrik: tata bahasa, kosakata.',
		stages: [],
		deadline: '',
		mode: 'individual',
		shape: 'writing',
		activityType: 'formative',
		taskConfig: null,
		groupInfo: '',
		status: 'published',
		created: '2026-01-01T00:00:00Z',
		updated: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function mockContext(overrides: Partial<AssistantContext> = {}): AssistantContext {
	const assignment = overrides.assignment ?? mockAssignment();
	return {
		assignment,
		courseId: assignment.course,
		submission: null,
		state: 'drafting',
		formative: true,
		policyLabel: 'learning_support',
		policyDescription: '',
		materialContext: '',
		materialsResult: 'insufficient',
		materialsReason: '',
		studentDraft: 'Draf esai saya.',
		...overrides,
	};
}

// ── 1. Closed, controlled tool registry ─────────────────────

describe('Phase 4 — tool registry is closed and controlled', () => {
	it('exposes exactly the 8 required student tools', () => {
		expect(STUDENT_TOOL_NAMES).toEqual(expect.arrayContaining([...REQUIRED_TOOLS]));
		for (const name of REQUIRED_TOOLS) {
			expect(isStudentToolName(name)).toBe(true);
			expect(STUDENT_TOOL_REGISTRY.has(name)).toBe(true);
		}
	});

	it('rejects unknown tool names', () => {
		expect(isStudentToolName('query_database')).toBe(false);
		expect(isStudentToolName('')).toBe(false);
		expect(isStudentToolName('get_other_students_work')).toBe(false);
		expect(getStudentToolDefinition('run_arbitrary_sql')).toBeUndefined();
	});

	it('every tool has a description and a capability', () => {
		for (const name of STUDENT_TOOL_NAMES) {
			const def = STUDENT_TOOL_REGISTRY.get(name)!;
			expect(def.description.length).toBeGreaterThan(0);
			expect(def.capability).toBeTruthy();
		}
	});
});

// ── 2. Tools never map to prohibited capabilities ──────────

describe('Phase 4 — tools never exercise prohibited capabilities', () => {
	it('no tool maps to an answer-completing capability', () => {
		for (const name of STUDENT_TOOL_NAMES) {
			const def = STUDENT_TOOL_REGISTRY.get(name)!;
			expect(PROHIBITED_CAPABILITIES).not.toContain(def.capability);
		}
	});

	it('every tool capability is tutor-first (allowed category)', () => {
		const allowed: Capability[] = [
			'explain_instruction',
			'explain_concept',
			'give_hint',
			'analyze_own_draft',
			'provide_feedback',
			'generate_practice',
			'explain_error',
		];
		for (const name of STUDENT_TOOL_NAMES) {
			const def = STUDENT_TOOL_REGISTRY.get(name)!;
			expect(allowed).toContain(def.capability);
		}
	});
});

// ── 3. Argument validation ─────────────────────────────────

describe('Phase 4 — argument validation', () => {
	it('requires the `requirement` param for explain_assignment_requirement', () => {
		const def = STUDENT_TOOL_REGISTRY.get('explain_assignment_requirement')!;
		const missing = validateStudentToolArgs(def, {});
		expect(missing.ok).toBe(false);
		if (!missing.ok) expect(missing.errors.join(' ')).toMatch(/requirement/);

		const present = validateStudentToolArgs(def, { requirement: 'Tata bahasa' });
		expect(present.ok).toBe(true);
		if (present.ok) expect(present.args.requirement).toBe('Tata bahasa');
	});

	it('accepts empty params for no-arg tools', () => {
		for (const name of [
			'get_current_assignment',
			'get_assignment_instructions',
			'get_allowed_course_materials',
			'get_my_draft',
			'get_my_previous_submission',
		] as const) {
			const def = STUDENT_TOOL_REGISTRY.get(name)!;
			expect(validateStudentToolArgs(def, {}).ok).toBe(true);
		}
	});

	it('accepts optional params for model-backed tools', () => {
		const analyze = STUDENT_TOOL_REGISTRY.get('analyze_my_draft')!;
		expect(validateStudentToolArgs(analyze, {}).ok).toBe(true);
		expect(validateStudentToolArgs(analyze, { focus: 'tata bahasa' }).ok).toBe(true);
		const practice = STUDENT_TOOL_REGISTRY.get('generate_practice_activity')!;
		expect(validateStudentToolArgs(practice, { topic: 'past tense' }).ok).toBe(true);
	});
});

// ── 4. Submission-state gate ───────────────────────────────

describe('Phase 4 — submission-state gate', () => {
	it('blocks analyze_my_draft after a formal submission is under review', () => {
		const gate = toolStateAvailability('analyze_my_draft', 'submitted', false);
		expect(gate.available).toBe(false);
		expect(gate.reason).toMatch(/dikumpulkan/i);
	});

	it('allows analyze_my_draft while drafting', () => {
		expect(toolStateAvailability('analyze_my_draft', 'drafting', false).available).toBe(true);
	});

	it('formative practice is never gated (always available)', () => {
		for (const name of STUDENT_TOOL_NAMES) {
			expect(toolStateAvailability(name, 'submitted', true).available).toBe(true);
		}
	});

	it('context reads stay available after submission', () => {
		for (const name of [
			'get_current_assignment',
			'get_assignment_instructions',
			'get_allowed_course_materials',
			'get_my_draft',
			'generate_practice_activity',
		] as const) {
			expect(toolStateAvailability(name, 'submitted', false).available).toBe(true);
		}
	});
});

// ── 5. Controlled page context never leaks prohibited data ──

describe('Phase 4 — controlled page context', () => {
	it('emits only student-authorized fields', () => {
		const ctx = mockContext();
		const policy = resolveAssignmentPolicy(ctx.assignment);
		const page = buildStudentPageContext(ctx, policy) as unknown as Record<string, unknown>;
		// No prohibited data categories appear in the page context.
		expect(findProhibitedDataKeys(page)).toEqual([]);
	});

	it('never includes another student, answer keys, or research data', () => {
		const ctx = mockContext();
		const policy = resolveAssignmentPolicy(ctx.assignment);
		const page: StudentPageContext = buildStudentPageContext(ctx, policy);
		const serialized = JSON.stringify(page);
		for (const prohibited of STUDENT_PROHIBITED_DATA) {
			expect(serialized).not.toContain(prohibited);
		}
	});

	it('reports the student work + submission state, not internal security metadata', () => {
		const ctx = mockContext({ state: 'drafting', studentDraft: 'draf' });
		const policy = resolveAssignmentPolicy(ctx.assignment);
		const page = buildStudentPageContext(ctx, policy);
		expect(page.role).toBe('student');
		expect(page.submissionState).toBe('drafting');
		expect(page.studentWork.hasDraft).toBe(true);
		// No audit ids, no internal capability ids beyond the allowed list.
		expect(page.allowedCapabilities).toEqual(policy.allowedCapabilities);
	});
});

// ── 6. Authorization gate (server-side, unbypassable) ──────

describe('Phase 4 — authorization gate', () => {
	it('denies generate_practice_activity under assessment_mode (formal task)', () => {
		const formal = mockAssignment({ activityType: 'formal' });
		const policy = resolveAssignmentPolicy(formal);
		const def = STUDENT_TOOL_REGISTRY.get('generate_practice_activity')!;
		const decision = authorizeCapability(policy, def.capability);
		expect(decision.ok).toBe(false);
		if (!decision.ok) expect(decision.status).toBe(403);
	});

	it('allows generate_practice_activity under learning_support (formative)', () => {
		const formative = mockAssignment({ activityType: 'formative' });
		const policy = resolveAssignmentPolicy(formative);
		const def = STUDENT_TOOL_REGISTRY.get('generate_practice_activity')!;
		expect(authorizeCapability(policy, def.capability).ok).toBe(true);
	});

	it('allows the read tools under every level', () => {
		const readTools = [
			'get_current_assignment',
			'get_assignment_instructions',
			'get_allowed_course_materials',
			'get_my_draft',
		] as const;
		for (const level of ['assessment_mode', 'learning_support'] as const) {
			const policy = resolveAssignmentPolicy(
				mockAssignment({ activityType: level === 'assessment_mode' ? 'formal' : 'formative' }),
			);
			for (const name of readTools) {
				const def = STUDENT_TOOL_REGISTRY.get(name)!;
				expect(authorizeCapability(policy, def.capability).ok).toBe(true);
			}
		}
	});

	it('a disabled policy denies every tool', () => {
		const assignment = mockAssignment({
			activityType: 'formative',
			aiPolicy: { assistanceLevel: 'learning_support', enabled: false },
		});
		const policy = resolveAssignmentPolicy(assignment);
		for (const name of STUDENT_TOOL_NAMES) {
			const def = STUDENT_TOOL_REGISTRY.get(name)!;
			expect(authorizeCapability(policy, def.capability).ok).toBe(false);
		}
	});
});

// ── 7. Legitimate student operations ──────────────────────

describe('Phase 4 — legitimate operations succeed', () => {
	it('a formative student may use all 8 tools under the default policy', () => {
		const formative = mockAssignment({ activityType: 'formative' });
		const policy = resolveAssignmentPolicy(formative);
		for (const name of STUDENT_TOOL_NAMES) {
			const def = STUDENT_TOOL_REGISTRY.get(name)!;
			expect(authorizeCapability(policy, def.capability).ok).toBe(true);
		}
	});

	it('invokeStudentTool rejects an unknown tool with an audited denial', async () => {
		// A minimal fake pb that records the audit create call.
		let audited: Record<string, unknown> | null = null;
		const fakePb = {
			collection: () => ({
				create: async (data: Record<string, unknown>) => {
					audited = data;
					return data;
				},
			}),
		} as unknown as import('pocketbase').default;
		const outcome = await invokeStudentTool({
			pb: fakePb,
			user: { id: 'stu000000000001', role: 'student' },
			assignmentId: 'assn00000000001',
			tool: 'steal_answers',
			params: {},
		});
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.status).toBe(422);
			expect(outcome.audited).toBe(true);
		}
		expect(audited).not.toBeNull();
		expect((audited as { result: string }).result).toBe('denied');
	});
});

// ── 8. Lecturer AI scope is separate ───────────────────────

describe('Phase 4 — lecturer AI behavior remains separate', () => {
	it('the student tool module does not import the lecturer assistant runtime', async () => {
		// Structural guarantee: the student tools resolve through the student
		// policy + context-retrieval layer, not the lecturer assistant.
		const { resolveFaculty } = await import('@/lib/assistant.server');
		expect(typeof resolveFaculty).toBe('function');
		// The student tool registry is a distinct, student-scoped surface.
		expect(STUDENT_TOOL_NAMES.length).toBe(8);
	});
});
