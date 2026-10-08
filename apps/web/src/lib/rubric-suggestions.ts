/**
 * Provisional rubric-criterion suggestions for writing/speaking tasks.
 *
 * SAFETY: suggestions are NEVER the assignment's real criteria. The real
 * criteria live inside `taskConfig.criteria` (writing/speaking). Suggestions
 * are stored separately on `assignments.suggestedCriteria` and remain
 * completely inert — they do not affect grading, the factors breakdown, the
 * divergence warning, transcript confidence, the published score, or the
 * stored rubricScores snapshot — until the lecturer explicitly accepts one,
 * at which point it becomes a normal editable criterion inside `taskConfig`.
 *
 * This module is client-safe (no server imports) so the form and the tests
 * share one source of truth for the suggestion state machine.
 */

/** One provisional criterion suggestion (label + relative weight + why). */
export type SuggestedCriterion = {
	id: string;
	label: string;
	/** Relative weight within the rubric (1–3); lecturer can change after accepting. */
	weight: number;
	/** Short rationale for why this aspect is suggested for this task. */
	rationale: string;
};

/**
 * The full provisional suggestion state stored on `assignments.suggestedCriteria`.
 *
 * - `pending`: suggestions currently shown to the lecturer (not yet
 *   accepted/dismissed).
 * - `dismissed`: labels the lecturer explicitly dismissed — durable, so a
 *   later regeneration does not bring the same aspect back by accident.
 * - `accepted`: labels the lecturer already accepted — durable, so a
 *   regeneration does not re-suggest an aspect that is now a real criterion.
 * - `reason`: empty when suggestions exist; an Indonesian explanation when
 *   none could be derived (prompt too short/vague) — never a guess.
 */
export type SuggestedCriteria = {
	pending: SuggestedCriterion[];
	dismissed: string[];
	accepted: string[];
	generatedAt: string;
	reason: string;
};

export const EMPTY_SUGGESTED_CRITERIA: SuggestedCriteria = {
	pending: [],
	dismissed: [],
	accepted: [],
	generatedAt: '',
	reason: '',
};

/** Hard cap on the number of suggestions, matching the 5-aspect evaluation limit. */
export const MAX_RUBRIC_SUGGESTIONS = 5;

/** Minimum prompt length before suggestions are even attempted. */
export const MIN_PROMPT_CHARS = 12;

// ── Tolerant parsing (PocketBase json column) ─────────────────

function str(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clip(value: unknown, max: number): string {
	const text = str(value).replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Parse a stored `suggestedCriteria` value into a valid state (tolerant). */
export function parseSuggestedCriteria(value: unknown): SuggestedCriteria {
	if (!value) return { ...EMPTY_SUGGESTED_CRITERIA };
	let raw: unknown = value;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return { ...EMPTY_SUGGESTED_CRITERIA };
		}
	}
	if (!raw || typeof raw !== 'object') return { ...EMPTY_SUGGESTED_CRITERIA };
	const obj = raw as Record<string, unknown>;
	const pending = Array.isArray(obj.pending)
		? (obj.pending as Record<string, unknown>[])
				.map((s, i) => ({
					id: str(s.id) || `s${i + 1}`,
					label: clip(s.label, 200),
					weight: Math.max(1, Math.min(3, Math.round(num(s.weight, 1)) || 1)),
					rationale: clip(s.rationale, 500),
				}))
				.filter((s) => s.label)
				.slice(0, MAX_RUBRIC_SUGGESTIONS)
		: [];
	const dismissed = Array.isArray(obj.dismissed)
		? (obj.dismissed as unknown[]).map((d) => clip(d, 200)).filter((d) => d)
		: [];
	const accepted = Array.isArray(obj.accepted)
		? (obj.accepted as unknown[]).map((d) => clip(d, 200)).filter((d) => d)
		: [];
	return {
		pending,
		dismissed,
		accepted,
		generatedAt: str(obj.generatedAt),
		reason: clip(obj.reason, 1000),
	};
}

// ── State transitions (pure; the form and tests share these) ──

/**
 * Accept one pending suggestion: returns the next state (criterion removed
 * from `pending`, its label added to `accepted`) and the accepted criterion,
 * or `null` when the id is not pending. The accepted criterion is what the
 * caller moves into `taskConfig.criteria` — this function never touches the
 * real criteria.
 */
export function acceptSuggestion(
	state: SuggestedCriteria,
	id: string,
): { state: SuggestedCriteria; criterion: SuggestedCriterion | null } {
	const criterion = state.pending.find((s) => s.id === id) ?? null;
	if (!criterion) return { state, criterion: null };
	return {
		state: {
			...state,
			pending: state.pending.filter((s) => s.id !== id),
			accepted: [...state.accepted, criterion.label].slice(-MAX_RUBRIC_SUGGESTIONS * 2),
		},
		criterion,
	};
}

/**
 * Dismiss one pending suggestion: returns the next state with the criterion
 * removed from `pending` and its label added to `dismissed`. Dismissals are
 * durable — a later regeneration filters dismissed labels out, so a dismissed
 * aspect cannot come back by accident.
 */
export function dismissSuggestion(state: SuggestedCriteria, id: string): SuggestedCriteria {
	const criterion = state.pending.find((s) => s.id === id);
	if (!criterion) return state;
	return {
		...state,
		pending: state.pending.filter((s) => s.id !== id),
		dismissed: [...state.dismissed, criterion.label].slice(-MAX_RUBRIC_SUGGESTIONS * 2),
	};
}

/**
 * Merge freshly generated pending suggestions with the durable dismissed /
 * accepted labels from a previous state. Dismissed and accepted labels are
 * filtered out so regeneration never re-surfaces an aspect the lecturer
 * already decided on. Returns a new state.
 */
export function mergeGenerated(
	previous: SuggestedCriteria,
	generated: { pending: SuggestedCriterion[]; generatedAt: string; reason: string },
): SuggestedCriteria {
	const blocked = new Set([...previous.dismissed, ...previous.accepted]);
	const pending = generated.pending.filter((s) => !blocked.has(s.label));
	return {
		pending,
		dismissed: previous.dismissed,
		accepted: previous.accepted,
		generatedAt: generated.generatedAt,
		reason: pending.length > 0 ? '' : (generated.reason || 'Tidak ada saran baru yang dapat diturunkan dari tugas ini.'),
	};
}

/** True when the suggestion affordance should be offered for a task. */
export function canSuggestCriteria(args: {
	kind: string | null;
	prompt: string;
	criteriaCount: number;
}): boolean {
	if (args.kind !== 'writing' && args.kind !== 'speaking') return false;
	if (args.criteriaCount > 0) return false;
	return args.prompt.trim().length >= MIN_PROMPT_CHARS;
}
