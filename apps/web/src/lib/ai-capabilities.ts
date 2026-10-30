/**
 * Phase 1 (Student AI Assistance Policy) — controlled capability vocabulary.
 *
 * A fixed, enumerated set of AI capabilities grouped into three categories.
 * Student AI assistance may only request capabilities from this vocabulary;
 * the server-side policy layer resolves whether a given capability is
 * allowed, restricted, or prohibited for the requesting student on a given
 * assignment. Capabilities NOT in this vocabulary are rejected as unknown.
 *
 * This file is client-safe (no server imports) so the same vocabulary is
 * shared between the policy model, the server enforcement layer, and tests.
 */

/**
 * A single AI assistance capability the student assistant may provide.
 *
 * ALLOWED capabilities help the student understand, practice, and improve
 * their own work without completing it for them.
 *
 * RESTRICTED capabilities are permitted only under explicit policy levels
 * (e.g. guided_assistance) and must be tightly controlled — they edge toward
 * producing content the student should write themselves.
 *
 * PROHIBITED capabilities complete or solve assessed work for the student.
 * They are never exposed through student tools and are rejected server-side
 * even when the frontend is manipulated.
 */
export type Capability =
	// ── ALLOWED (tutor-first, learning support) ──
	| 'explain_instruction'
	| 'explain_concept'
	| 'vocabulary_help'
	| 'grammar_help'
	| 'give_hint'
	| 'analyze_own_draft'
	| 'provide_feedback'
	| 'generate_practice'
	| 'brainstorm'
	| 'explain_error'
	// ── RESTRICTED (controlled content generation) ──
	| 'translation'
	| 'example_answer'
	| 'sentence_suggestion'
	| 'rewrite_sentence'
	// ── PROHIBITED (completing assessed work) ──
	| 'generate_complete_answer'
	| 'complete_assignment'
	| 'rewrite_entire_submission'
	| 'solve_assessment'
	| 'impersonate_student';

/** The three capability categories. */
export type CapabilityCategory = 'allowed' | 'restricted' | 'prohibited';

/**
 * The canonical category of each capability. This is the single source of
 * truth for which capabilities are inherently tutor-first vs inherently
 * answer-completing. A policy level may move a capability between allowed
 * and restricted, but a prohibited capability is always prohibited.
 */
export const CAPABILITY_CATEGORY: Record<Capability, CapabilityCategory> = {
	explain_instruction: 'allowed',
	explain_concept: 'allowed',
	vocabulary_help: 'allowed',
	grammar_help: 'allowed',
	give_hint: 'allowed',
	analyze_own_draft: 'allowed',
	provide_feedback: 'allowed',
	generate_practice: 'allowed',
	brainstorm: 'allowed',
	explain_error: 'allowed',
	translation: 'restricted',
	example_answer: 'restricted',
	sentence_suggestion: 'restricted',
	rewrite_sentence: 'restricted',
	generate_complete_answer: 'prohibited',
	complete_assignment: 'prohibited',
	rewrite_entire_submission: 'prohibited',
	solve_assessment: 'prohibited',
	impersonate_student: 'prohibited',
};

/** All capabilities that are inherently tutor-first (never answer-completing). */
export const ALLOWED_CAPABILITIES: Capability[] = (
	Object.keys(CAPABILITY_CATEGORY) as Capability[]
).filter((c) => CAPABILITY_CATEGORY[c] === 'allowed');

/** All capabilities that produce controlled content (permitted only under guided levels). */
export const RESTRICTED_CAPABILITIES: Capability[] = (
	Object.keys(CAPABILITY_CATEGORY) as Capability[]
).filter((c) => CAPABILITY_CATEGORY[c] === 'restricted');

/** All capabilities that complete or solve assessed work (never permitted). */
export const PROHIBITED_CAPABILITIES: Capability[] = (
	Object.keys(CAPABILITY_CATEGORY) as Capability[]
).filter((c) => CAPABILITY_CATEGORY[c] === 'prohibited');

/** Human-readable Indonesian label for each capability (lecturer-facing). */
export const CAPABILITY_LABEL: Record<Capability, string> = {
	explain_instruction: 'Menjelaskan instruksi tugas',
	explain_concept: 'Menjelaskan konsep',
	vocabulary_help: 'Bantuan kosakata',
	grammar_help: 'Bantuan tata bahasa',
	give_hint: 'Memberi petunjuk',
	analyze_own_draft: 'Menganalisis draf sendiri',
	provide_feedback: 'Memberi umpan balik',
	generate_practice: 'Membuat latihan',
	brainstorm: 'Curah gagasan',
	explain_error: 'Menjelaskan kesalahan',
	translation: 'Terjemahan',
	example_answer: 'Contoh jawaban',
	sentence_suggestion: 'Saran kalimat',
	rewrite_sentence: 'Menulis ulang kalimat',
	generate_complete_answer: 'Menyusun jawaban lengkap',
	complete_assignment: 'Menyelesaikan tugas',
	rewrite_entire_submission: 'Menulis ulang seluruh kiriman',
	solve_assessment: 'Menyelesaikan penilaian',
	impersonate_student: 'Meniru identitas mahasiswa',
};

/** True when the string is a known capability in the vocabulary. */
export function isCapability(value: string): value is Capability {
	return Object.prototype.hasOwnProperty.call(CAPABILITY_CATEGORY, value);
}

/** The inherent category of a capability (prohibited capabilities are always prohibited). */
export function inherentCategoryOf(capability: Capability): CapabilityCategory {
	return CAPABILITY_CATEGORY[capability];
}
