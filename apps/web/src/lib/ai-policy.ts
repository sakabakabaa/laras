/**
 * Phase 1 (Student AI Assistance Policy) — the policy model.
 *
 * An assignment carries an AI assistance policy that controls what student AI
 * may do on that assignment. The policy is resolved server-side from the
 * assignment's stored `aiPolicy` JSON field (when a lecturer set one) or from
 * sensible defaults derived from the assignment's existing AI configuration
 * fields (activity type, check settings) — preserving backward compatibility.
 *
 * "Tutor first, answer second": every policy level allows help that lets the
 * student understand, practice, and improve their own work, and prohibits
 * capabilities that complete or solve assessed work for them.
 *
 * This file is client-safe (no server imports) so the policy model is shared
 * between the server enforcement layer, the assignment form, and tests.
 */
import {
	CAPABILITY_CATEGORY,
	isCapability,
	type Capability,
	type CapabilityCategory,
} from '@/lib/ai-capabilities';
import type { ActivityType } from '@/lib/assignments';

/** The three assistance levels a policy may operate at. */
export type AssistanceLevel = 'learning_support' | 'guided_assistance' | 'assessment_mode';

export const ASSISTANCE_LEVEL_LABEL: Record<AssistanceLevel, string> = {
	learning_support: 'Dukungan pembelajaran',
	guided_assistance: 'Bantuan terbimbing',
	assessment_mode: 'Mode penilaian',
};

export const ASSISTANCE_LEVEL_DESCRIPTION: Record<AssistanceLevel, string> = {
	learning_support:
		'Menjelaskan konsep, instruksi, kosakata, tata bahasa, petunjuk, dan umpan balik pada draf mahasiswa. Tidak menyusun jawaban.',
	guided_assistance:
		'Semua di atas ditambah contoh, saran kalimat, dan terjemahan terbatas yang dikontrol secara eksplisit.',
	assessment_mode:
		'Hanya menjelaskan instruksi, konsep, dan bantuan teknis terbatas. Tidak menghasilkan jawaban, tidak menulis ulang, tidak menyelesaikan tugas dinilai.',
};

/**
 * The effective AI assistance policy for an assignment. Capabilities are
 * partitioned into three lists; a capability not in any list is denied by
 * default (unknown capability).
 */
export type AiPolicy = {
	/** Master switch: when false, no student AI assistance is permitted. */
	enabled: boolean;
	assistanceLevel: AssistanceLevel;
	allowedCapabilities: Capability[];
	restrictedCapabilities: Capability[];
	prohibitedCapabilities: Capability[];
	/** True when the assignment is operating under assessment-mode restrictions. */
	assessmentMode: boolean;
};

/** The per-level capability partition (without the enabled flag). */
type LevelPolicy = Pick<
	AiPolicy,
	'assistanceLevel' | 'allowedCapabilities' | 'restrictedCapabilities' | 'prohibitedCapabilities'
>;

/**
 * learning_support — the most permissive level, for Latihan formatif and
 * general practice. Tutor-first help only; controlled content generation
 * stays restricted and answer-completing is prohibited.
 */
const LEARNING_SUPPORT: LevelPolicy = {
	assistanceLevel: 'learning_support',
	allowedCapabilities: [
		'explain_instruction',
		'explain_concept',
		'vocabulary_help',
		'grammar_help',
		'give_hint',
		'analyze_own_draft',
		'provide_feedback',
		'generate_practice',
		'brainstorm',
		'explain_error',
	],
	restrictedCapabilities: ['translation', 'example_answer', 'sentence_suggestion', 'rewrite_sentence'],
	prohibitedCapabilities: [
		'generate_complete_answer',
		'complete_assignment',
		'rewrite_entire_submission',
		'solve_assessment',
		'impersonate_student',
	],
};

/**
 * guided_assistance — learning support plus controlled examples, sentence
 * suggestions, and translation where explicitly permitted. Still prohibits
 * completing assessed work.
 */
const GUIDED_ASSISTANCE: LevelPolicy = {
	assistanceLevel: 'guided_assistance',
	allowedCapabilities: [
		'explain_instruction',
		'explain_concept',
		'vocabulary_help',
		'grammar_help',
		'give_hint',
		'analyze_own_draft',
		'provide_feedback',
		'generate_practice',
		'brainstorm',
		'explain_error',
		'translation',
		'example_answer',
		'sentence_suggestion',
		'rewrite_sentence',
	],
	restrictedCapabilities: [],
	prohibitedCapabilities: [
		'generate_complete_answer',
		'complete_assignment',
		'rewrite_entire_submission',
		'solve_assessment',
		'impersonate_student',
	],
};

/**
 * assessment_mode — the most restrictive level, for Tugas formal (graded).
 * Only instruction/concept explanation and limited formative feedback on the
 * student's own draft are allowed. No content generation, no translation, no
 * examples, no practice generation.
 */
const ASSESSMENT_MODE: LevelPolicy = {
	assistanceLevel: 'assessment_mode',
	allowedCapabilities: [
		'explain_instruction',
		'explain_concept',
		'give_hint',
		'analyze_own_draft',
		'provide_feedback',
		'explain_error',
	],
	restrictedCapabilities: ['vocabulary_help', 'grammar_help'],
	prohibitedCapabilities: [
		'translation',
		'example_answer',
		'sentence_suggestion',
		'rewrite_sentence',
		'generate_practice',
		'brainstorm',
		'generate_complete_answer',
		'complete_assignment',
		'rewrite_entire_submission',
		'solve_assessment',
		'impersonate_student',
	],
};

/** The frozen per-level capability partitions. */
export const LEVEL_POLICIES: Record<AssistanceLevel, LevelPolicy> = {
	learning_support: Object.freeze({ ...LEARNING_SUPPORT }),
	guided_assistance: Object.freeze({ ...GUIDED_ASSISTANCE }),
	assessment_mode: Object.freeze({ ...ASSESSMENT_MODE }),
};

export const ASSISTANCE_LEVELS: AssistanceLevel[] = [
	'learning_support',
	'guided_assistance',
	'assessment_mode',
];

/** Build a full policy from a level partition plus the enabled flag. */
function policyFromLevel(level: AssistanceLevel, enabled: boolean): AiPolicy {
	const base = LEVEL_POLICIES[level];
	return {
		enabled,
		assistanceLevel: base.assistanceLevel,
		allowedCapabilities: [...base.allowedCapabilities],
		restrictedCapabilities: [...base.restrictedCapabilities],
		prohibitedCapabilities: [...base.prohibitedCapabilities],
		assessmentMode: level === 'assessment_mode',
	};
}

/**
 * The default assistance level for an assignment based on its activity type.
 * Formative practice (Latihan formatif) defaults to learning_support; formal
 * graded tasks default to assessment_mode. This preserves existing behavior:
 * formative practice stays permissive, formal tasks stay restrictive.
 */
export function defaultLevelForActivity(activityType: ActivityType | '' | null | undefined): AssistanceLevel {
	return activityType === 'formative' ? 'learning_support' : 'assessment_mode';
}

/**
 * Resolve the effective AI policy for an assignment. When the assignment
 * carries an explicit `aiPolicy` JSON value, it is parsed tolerantly and
 * used; otherwise a sensible default is derived from the activity type and
 * existing AI settings (backward compatible with pre-Phase-1 assignments).
 *
 * An explicit policy's capability lists are sanitized against the controlled
 * vocabulary — unknown strings are dropped, and a capability's inherent
 * category is respected (a prohibited capability can never be moved to
 * allowed by a stored policy).
 */
export function resolveAssignmentPolicy(assignment: {
	aiPolicy?: unknown;
	activityType?: ActivityType | '' | null;
	checkEnabled?: boolean;
}): AiPolicy {
	const explicit = parseAiPolicyValue(assignment.aiPolicy);
	if (explicit) {
		return sanitizeExplicitPolicy(explicit, assignment);
	}
	// Default: derive from activity type. Formative → learning_support,
	// formal → assessment_mode. Enabled defaults to true so existing
	// per-feature settings (checkEnabled, aiAssistEnabled) remain the
	// granular gates they already are.
	const level = defaultLevelForActivity(assignment.activityType);
	return policyFromLevel(level, true);
}

/** Tolerantly parse a stored `aiPolicy` JSON value into a partial policy. */
function parseAiPolicyValue(value: unknown): Partial<AiPolicy> | null {
	if (!value) return null;
	let raw: unknown = value;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const obj = raw as Record<string, unknown>;
	const level = typeof obj.assistanceLevel === 'string' ? obj.assistanceLevel : '';
	const validLevel =
		level === 'learning_support' || level === 'guided_assistance' || level === 'assessment_mode'
			? (level as AssistanceLevel)
			: null;
	if (!validLevel) return null;
	return {
		enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
		assistanceLevel: validLevel,
		allowedCapabilities: parseCapabilityList(obj.allowedCapabilities),
		restrictedCapabilities: parseCapabilityList(obj.restrictedCapabilities),
		prohibitedCapabilities: parseCapabilityList(obj.prohibitedCapabilities),
	};
}

function parseCapabilityList(value: unknown): Capability[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value
		.filter((item): item is Capability => typeof item === 'string' && isCapability(item));
}

/**
 * Sanitize an explicit stored policy: drop unknown capabilities, and enforce
 * the invariant that a prohibited capability can never appear in allowed or
 * restricted lists (a stored policy cannot weaken the prohibition on
 * answer-completing capabilities).
 */
function sanitizeExplicitPolicy(
	explicit: Partial<AiPolicy>,
	assignment: { activityType?: ActivityType | '' | null; checkEnabled?: boolean },
): AiPolicy {
	const level = explicit.assistanceLevel!;
	const base = LEVEL_POLICIES[level];
	// Start from the level's frozen partition; overlay only valid, non-weakening
	// overrides the lecturer set. Prohibited capabilities stay prohibited.
	const prohibited = new Set<Capability>([
		...base.prohibitedCapabilities,
		...(explicit.prohibitedCapabilities ?? []),
	]);
	const allowed = new Set<Capability>(base.allowedCapabilities);
	const restricted = new Set<Capability>(base.restrictedCapabilities);

	// Apply explicit additions without ever allowing a prohibited capability.
	for (const cap of explicit.allowedCapabilities ?? []) {
		if (!prohibited.has(cap)) allowed.add(cap);
	}
	for (const cap of explicit.restrictedCapabilities ?? []) {
		if (!prohibited.has(cap)) restricted.add(cap);
	}
	// Explicit removals (a lecturer may restrict further than the level default).
	for (const cap of explicit.prohibitedCapabilities ?? []) {
		allowed.delete(cap);
		restricted.delete(cap);
		prohibited.add(cap);
	}

	return {
		enabled: explicit.enabled ?? true,
		assistanceLevel: level,
		allowedCapabilities: [...allowed],
		restrictedCapabilities: [...restricted],
		prohibitedCapabilities: [...prohibited],
		assessmentMode: level === 'assessment_mode',
	};
}

// ── Capability checking ──────────────────────────────────────

export type CapabilityDecision =
	| { ok: true; category: CapabilityCategory }
	| { ok: false; reason: 'disabled' | 'prohibited' | 'restricted_denied' | 'unknown' };

/**
 * Decide whether a capability is permitted under a policy.
 *
 * - disabled policy → deny everything.
 * - prohibited capability (in the policy's prohibited list, or inherently
 *   prohibited) → deny.
 * - restricted capability → deny (the caller may surface a "not available"
 *   message; restricted means permitted only under guided levels, which the
 *   policy level already encodes — if it's still in the restricted list the
 *   level did not promote it to allowed).
 * - allowed capability → allow.
 * - unknown capability (not in any list) → deny.
 */
export function checkCapability(policy: AiPolicy, capability: Capability): CapabilityDecision {
	if (!policy.enabled) return { ok: false, reason: 'disabled' };
	if (policy.prohibitedCapabilities.includes(capability)) {
		return { ok: false, reason: 'prohibited' };
	}
	if (policy.allowedCapabilities.includes(capability)) {
		return { ok: true, category: 'allowed' };
	}
	if (policy.restrictedCapabilities.includes(capability)) {
		return { ok: false, reason: 'restricted_denied' };
	}
	return { ok: false, reason: 'unknown' };
}

/** True when the capability is permitted under the policy. */
export function isCapabilityAllowed(policy: AiPolicy, capability: Capability): boolean {
	return checkCapability(policy, capability).ok;
}

/** True when the capability is prohibited under the policy. */
export function isCapabilityProhibited(policy: AiPolicy, capability: Capability): boolean {
	if (!policy.enabled) return true;
	return policy.prohibitedCapabilities.includes(capability);
}

/**
 * Indonesian denial message for a capability decision, suitable for surfacing
 * to the student when a request is rejected.
 */
export function denialMessage(capability: Capability, decision: CapabilityDecision): string {
	if (!decision.ok) {
		switch (decision.reason) {
			case 'disabled':
				return 'Bantuan AI tidak diaktifkan untuk tugas ini.';
			case 'prohibited':
				return 'Bantuan jenis ini tidak diizinkan pada tugas ini — asisten tidak boleh menyusun atau menyelesaikan jawaban untuk Anda.';
			case 'restricted_denied':
				return 'Bantuan jenis ini terbatas dan tidak tersedia pada tingkat bantuan tugas ini.';
			case 'unknown':
				return 'Jenis bantuan ini tidak dikenali.';
		}
	}
	return '';
}

/**
 * Read an explicit stored policy's mode (enabled flag + level). Returns null
 * when the assignment carries no explicit `aiPolicy` (the form then shows
 * "default" — derived from activity type). Used by the lecturer policy editor
 * to reconstruct the chosen mode without re-running the full sanitizer.
 */
export function parseExplicitPolicyMode(
	value: unknown,
): { enabled: boolean; assistanceLevel: AssistanceLevel } | null {
	const parsed = parseAiPolicyValue(value);
	if (!parsed || !parsed.assistanceLevel) return null;
	return { enabled: parsed.enabled ?? true, assistanceLevel: parsed.assistanceLevel };
}
