/**
 * Phase 1 (Student AI Assistance Policy) — server-side enforcement.
 *
 * Every student AI request must resolve the full permission chain before any
 * model call:
 *
 *   student → course → assignment → assignment AI policy
 *           → current submission/draft → requested AI capability
 *           → permission check → allowed/denied
 *
 * If a capability is prohibited (or the policy is disabled, or the capability
 * is unknown), the backend rejects the operation — this cannot be bypassed by
 * frontend manipulation because the check runs server-side before the model
 * is ever called.
 *
 * Student data scope: the enforcement layer also documents and guards what
 * data a student AI request may see. The existing context-retrieval layer
 * already filters by role; this module makes the student data scope explicit
 * and provides a sanitizer that strips any prohibited data keys from a
 * context object before it reaches the model. The rule is "filter before the
 * model sees it", never "put it in context and tell the model not to reveal".
 *
 * Lecturer AI is untouched: the lecturer assistant (`/api/assistant`) has its
 * own faculty-only permission scope and does not go through this layer.
 */
import type PocketBase from 'pocketbase';
import type { Assignment } from '@/lib/assignments';
import {
	checkCapability,
	resolveAssignmentPolicy,
	type AiPolicy,
	type CapabilityDecision,
} from '@/lib/ai-policy';
import type { Capability } from '@/lib/ai-capabilities';

// ── Policy resolution ────────────────────────────────────────

export type PolicyResolution =
	| { ok: true; policy: AiPolicy; assignment: Assignment }
	| { ok: false; status: number; message: string };

/**
 * Resolve the effective AI policy for a student request on an assignment.
 *
 * The assignment is loaded with the caller's own PocketBase token, so the
 * collection access rules remain the authoritative read layer — a student
 * who cannot view the assignment (not enrolled, draft, etc.) gets a 404
 * before any policy is evaluated.
 *
 * This is the single entry point every student AI endpoint must call before
 * invoking the model. It returns a ready-to-return denial on failure so the
 * caller can `return` it directly.
 */
export async function resolveStudentAiPolicy(input: {
	pb: PocketBase;
	assignmentId: string;
}): Promise<PolicyResolution> {
	const { pb, assignmentId } = input;
	if (!assignmentId || !/^[A-Za-z0-9]{5,40}$/.test(assignmentId)) {
		return { ok: false, status: 422, message: 'assignmentId tidak valid.' };
	}
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(assignmentId);
	} catch {
		return { ok: false, status: 404, message: 'Tugas tidak ditemukan.' };
	}
	if (assignment.status !== 'published') {
		return { ok: false, status: 422, message: 'Bantuan AI hanya tersedia saat tugas diterbitkan.' };
	}
	const policy = resolveAssignmentPolicy(assignment);
	return { ok: true, policy, assignment };
}

// ── Capability authorization ────────────────────────────────

export type AuthorizationDecision =
	| { ok: true; policy: AiPolicy }
	| { ok: false; status: number; message: string };

/**
 * Authorize a single capability against a resolved policy. Returns a
 * ready-to-return denial (with HTTP status + Indonesian message) when the
 * capability is not permitted, so the caller can `return` it directly.
 *
 * This is the gate: if the capability is prohibited, disabled, restricted,
 * or unknown, the model is never called.
 */
export function authorizeCapability(
	policy: AiPolicy,
	capability: Capability,
): AuthorizationDecision {
	const decision: CapabilityDecision = checkCapability(policy, capability);
	if (decision.ok) return { ok: true, policy };
	const reason = decision.reason;
	let status = 403;
	let message: string;
	switch (reason) {
		case 'disabled':
			status = 422;
			message = 'Bantuan AI tidak diaktifkan untuk tugas ini.';
			break;
		case 'prohibited':
			message =
				'Bantuan jenis ini tidak diizinkan pada tugas ini — asisten tidak boleh menyusun atau menyelesaikan jawaban untuk Anda.';
			break;
		case 'restricted_denied':
			message = 'Bantuan jenis ini terbatas dan tidak tersedia pada tingkat bantuan tugas ini.';
			break;
		default:
			message = 'Jenis bantuan ini tidak dikenali.';
			status = 422;
	}
	return { ok: false, status, message };
}

/**
 * Convenience: resolve the policy AND authorize a capability in one call.
 * Returns the policy on success, or a denial the caller can return directly.
 */
export async function authorizeStudentCapability(input: {
	pb: PocketBase;
	assignmentId: string;
	capability: Capability;
}): Promise<AuthorizationDecision> {
	const resolution = await resolveStudentAiPolicy(input);
	if (!resolution.ok) {
		return { ok: false, status: resolution.status, message: resolution.message };
	}
	return authorizeCapability(resolution.policy, input.capability);
}

// ── Student data scope ────────────────────────────────────────

/**
 * Data categories a student AI request may include in model context.
 * This is the explicit allow-list — anything not here is filtered out before
 * the model sees it.
 */
export const STUDENT_ALLOWED_DATA = [
	'current_course', // the course the assignment belongs to
	'current_assignment', // the assignment's student-visible fields
	'student_visible_instructions', // instructions, requirements (student-facing)
	'allowed_course_materials', // lecturer-approved, role-filtered materials
	'student_own_draft', // the student's current draft/response
	'student_own_submissions', // the student's own prior submissions (when permitted)
	'student_own_feedback', // feedback the student already received
] as const;

/**
 * Data categories that must NEVER reach a student AI model context. These are
 * filtered out before the model is called — not hidden via system prompts.
 */
export const STUDENT_PROHIBITED_DATA = [
	'other_students_submissions',
	'lecturer_private_notes',
	'hidden_rubric_information',
	'answer_keys',
	'hidden_ai_evaluation',
	'research_data',
	'rater_judgments',
	'adjudication_data',
	'internal_research_metadata',
	'personalization_internal_state',
] as const;

export type StudentAllowedData = (typeof STUDENT_ALLOWED_DATA)[number];
export type StudentProhibitedData = (typeof STUDENT_PROHIBITED_DATA)[number];

/**
 * A student AI context bundle that has been verified to contain only
 * student-authorized data. The model only ever receives a sanitized bundle.
 */
export type SanitizedStudentContext = {
	/** The student's own response/draft text (already rendered). */
	studentResponse: string;
	/** Student-visible assignment instructions. */
	instructions: string;
	/** Student-visible requirements/rubric labels (never answer keys). */
	requirements: string;
	/** Lecturer-approved, role-filtered course material text ('' when none). */
	materialContext: string;
	/** Student-requested focus ('' when none). */
	focus: string;
};

/**
 * Sanitize a raw context object for a student AI request: keep only the
 * student-authorized fields and drop anything prohibited. This is the
 * "filter before the model" gate — prohibited data keys are stripped here,
 * never passed to the model with an instruction not to reveal them.
 *
 * The input is a loose record (the caller assembles it); the output is a
 * strictly-typed, sanitized bundle. Unknown keys are dropped.
 */
export function sanitizeStudentContext(input: {
	studentResponse?: string;
	instructions?: string;
	requirements?: string;
	materialContext?: string;
	focus?: string;
}): SanitizedStudentContext {
	return {
		studentResponse: (input.studentResponse || '').slice(0, 12000),
		instructions: (input.instructions || '').slice(0, 4000),
		requirements: (input.requirements || '').slice(0, 3000),
		materialContext: (input.materialContext || '').slice(0, 9000),
		focus: (input.focus || '').slice(0, 500),
	};
}

/**
 * Guard: assert that a context object does not carry any prohibited data
 * keys. Used in tests to verify the filtering contract. Returns the list of
 * prohibited keys found (empty = clean).
 */
export function findProhibitedDataKeys(context: Record<string, unknown>): StudentProhibitedData[] {
	const prohibited = new Set<string>(STUDENT_PROHIBITED_DATA);
	const found: StudentProhibitedData[] = [];
	for (const key of Object.keys(context)) {
		if (prohibited.has(key)) found.push(key as StudentProhibitedData);
	}
	return found;
}

/**
 * The capabilities each existing student AI endpoint provides. Used by the
 * endpoints to assert their capabilities are permitted before invoking the
 * model. An endpoint that provides multiple capabilities must have ALL of
 * them permitted (it cannot smuggle a prohibited capability alongside an
 * allowed one).
 */
export const CHECK_ANSWER_CAPABILITIES: Capability[] = [
	'analyze_own_draft',
	'provide_feedback',
	'give_hint',
	'explain_error',
];

export const PRACTICE_ASSIST_CAPABILITIES: Capability[] = [
	'give_hint',
	'explain_concept',
	'provide_feedback',
	'vocabulary_help',
	'grammar_help',
];

export const PRACTICE_SPEAKING_CAPABILITIES: Capability[] = [
	'analyze_own_draft',
	'provide_feedback',
	'give_hint',
];

/**
 * Authorize a batch of capabilities (an endpoint's full capability set).
 * Returns the first denial encountered, or the policy when all are allowed.
 * This prevents an endpoint from running if any of its capabilities is
 * prohibited — the model cannot be asked to do something the policy forbids.
 */
export function authorizeCapabilities(
	policy: AiPolicy,
	capabilities: Capability[],
): AuthorizationDecision {
	for (const capability of capabilities) {
		const decision = authorizeCapability(policy, capability);
		if (!decision.ok) return decision;
	}
	return { ok: true, policy };
}
