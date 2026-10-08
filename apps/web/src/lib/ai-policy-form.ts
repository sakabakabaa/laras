/**
 * Phase 3 (Lecturer Controls for Student AI Assistance) — form-state helpers.
 *
 * Bridges the lecturer-facing policy editor in the assignment form to the
 * Phase 1 policy model stored in `assignments.aiPolicy`. The form works with
 * a simple { mode, enabledCaps } state and serializes to the full policy
 * object the server already enforces. Client-safe (no server imports).
 *
 * Design:
 *  - `mode` is one of: 'default' (derive from activity type — backward
 *    compatible, stores nothing), 'off' (AI disabled), or one of the three
 *    assistance levels.
 *  - `enabledCaps` is the absolute set of toggleable capabilities the
 *    student may use. The level presets it; the lecturer may adjust.
 *  - On save, the absolute set is diffed against the level's frozen partition
 *    to produce minimal additive/subtractive lists the server's sanitizer
 *    overlays — prohibited capabilities can never be enabled (the UI blocks
 *    them and the server rejects them regardless).
 */
import {
	LEVEL_POLICIES,
	defaultLevelForActivity,
	parseExplicitPolicyMode,
	resolveAssignmentPolicy,
	type AssistanceLevel,
} from '@/lib/ai-policy';
import {
	CAPABILITY_LABEL,
	RESTRICTED_CAPABILITIES,
	type Capability,
} from '@/lib/ai-capabilities';
import type { ActivityType } from '@/lib/assignments';

/** The form-level mode: default (derive) / off / a concrete level. */
export type AiPolicyMode = 'default' | 'off' | AssistanceLevel;

/**
 * Core tutor-first capabilities shown in the main toggle list. These are
 * inherently ALLOWED capabilities — never answer-completing.
 */
export const CORE_CAPABILITIES: Capability[] = [
	'explain_instruction',
	'explain_concept',
	'give_hint',
	'vocabulary_help',
	'grammar_help',
	'analyze_own_draft',
	'provide_feedback',
	'generate_practice',
	'brainstorm',
	'explain_error',
];

/**
 * Optional (restricted) capabilities shown in a separate "optional" list. These
 * edge toward producing content the student should write themselves, so they
 * are off by default and only the lecturer can enable them.
 */
export const OPTIONAL_CAPABILITIES: Capability[] = RESTRICTED_CAPABILITIES;

/** Every capability the lecturer may toggle (never prohibited ones). */
export const ALL_TOGGLEABLE: Capability[] = [...CORE_CAPABILITIES, ...OPTIONAL_CAPABILITIES];

export const POLICY_MODE_LABEL: Record<AiPolicyMode, string> = {
	default: 'Bawaan (mengikuti jenis tugas)',
	off: 'Nonaktif',
	learning_support: 'Dukungan pembelajaran',
	guided_assistance: 'Bantuan terbimbing',
	assessment_mode: 'Mode penilaian',
};

export const POLICY_MODE_DESCRIPTION: Record<AiPolicyMode, string> = {
	default:
		'Tugas formal memakai mode penilaian; latihan formatif memakai dukungan pembelajaran. Sama dengan perilaku saat ini.',
	off: 'Tidak ada bantuan AI untuk mahasiswa pada tugas ini.',
	learning_support:
		'Menjelaskan instruksi & konsep, petunjuk, kosakata, tata bahasa, menganalisis draf, umpan balik, dan membuat latihan. Tidak menyusun jawaban.',
	guided_assistance:
		'Semua dukungan pembelajaran, ditambah contoh, saran kalimat, dan terjemahan yang diaktifkan secara eksplisit. Tetap tidak menyelesaikan tugas dinilai.',
	assessment_mode:
		'Hanya menjelaskan instruksi dan konsep. Tidak menghasilkan jawaban, tidak menulis ulang, tidak menyelesaikan tugas dinilai.',
};

/** The ordered modes offered in the level selector. */
export const POLICY_MODE_ORDER: AiPolicyMode[] = [
	'default',
	'learning_support',
	'guided_assistance',
	'assessment_mode',
	'off',
];

/**
 * The capabilities a student may use at a level by default (the level's
 * frozen allowed set, intersected with toggleable capabilities).
 */
export function defaultEnabledCapsForLevel(level: AssistanceLevel): Set<Capability> {
	const base = LEVEL_POLICIES[level];
	return new Set(base.allowedCapabilities.filter((c) => ALL_TOGGLEABLE.includes(c)));
}

/** Capabilities that are prohibited (untoggleable / always off) at a level. */
export function prohibitedCapsAtLevel(level: AssistanceLevel): Capability[] {
	return LEVEL_POLICIES[level].prohibitedCapabilities.filter((c) => ALL_TOGGLEABLE.includes(c));
}

/**
 * Read the form mode from a stored assignment. Returns 'default' when no
 * explicit policy is stored (backward compatible).
 */
export function readPolicyMode(assignment: {
	aiPolicy?: unknown;
}): AiPolicyMode {
	const explicit = parseExplicitPolicyMode(assignment.aiPolicy);
	if (!explicit) return 'default';
	return explicit.enabled ? explicit.assistanceLevel : 'off';
}

/**
 * Read the effective enabled-capability set from a stored assignment. Uses the
 * full sanitized policy so explicit overrides are reconstructed faithfully.
 * Returns an empty set when AI is disabled.
 */
export function readEnabledCaps(assignment: {
	aiPolicy?: unknown;
	activityType?: ActivityType | '' | null;
	checkEnabled?: boolean;
}): Set<Capability> {
	const policy = resolveAssignmentPolicy(assignment);
	if (!policy.enabled) return new Set();
	return new Set(policy.allowedCapabilities.filter((c) => ALL_TOGGLEABLE.includes(c)));
}

/**
 * Serialize the form state into the `aiPolicy` JSON value to store. Returns
 * null for 'default' (store nothing — the server derives from activity type,
 * preserving backward compatibility for existing assignments).
 */
export function buildStoredPolicy(
	mode: AiPolicyMode,
	enabledCaps: Set<Capability>,
	activityType: ActivityType | '' | null,
): Record<string, unknown> | null {
	if (mode === 'default') return null;
	const defaultLevel = defaultLevelForActivity(activityType);

	if (mode === 'off') {
		return {
			enabled: false,
			assistanceLevel: defaultLevel,
			allowedCapabilities: [],
			restrictedCapabilities: [],
			prohibitedCapabilities: [...ALL_TOGGLEABLE],
		};
	}

	const level = mode;
	const base = LEVEL_POLICIES[level];
	const enabled = new Set(enabledCaps);

	// Additive: capabilities enabled beyond the level's base allowed set
	// (restricted caps the lecturer turned on). Never includes prohibited caps.
	const explicitAllowed = [...enabled].filter(
		(c) => !base.allowedCapabilities.includes(c) && !base.prohibitedCapabilities.includes(c),
	);
	// Subtractive: base-allowed caps the lecturer turned off.
	const explicitProhibited = base.allowedCapabilities.filter((c) => !enabled.has(c));

	return {
		enabled: true,
		assistanceLevel: level,
		allowedCapabilities: explicitAllowed,
		restrictedCapabilities: [],
		prohibitedCapabilities: explicitProhibited,
	};
}

/** A short Indonesian summary of the effective policy for the review section. */
export function policySummary(
	mode: AiPolicyMode,
	enabledCaps: Set<Capability>,
	activityType: ActivityType | '' | null,
): string {
	if (mode === 'default') {
		return activityType === 'formative'
			? 'Bawaan — dukungan pembelajaran (latihan formatif).'
			: 'Bawaan — mode penilaian (tugas formal).';
	}
	if (mode === 'off') return 'Bantuan AI nonaktif untuk tugas ini.';
	const count = enabledCaps.size;
	return `${POLICY_MODE_LABEL[mode]} — ${count} kemampuan diaktifkan.`;
}

/** Human label for a capability (re-exported for the UI). */
export function capabilityLabel(cap: Capability): string {
	return CAPABILITY_LABEL[cap];
}
