/**
 * AI Assistant — centralized rate-limit, usage-budget, and protection
 * configuration.
 *
 * This is the single source of truth for every tunable value that protects
 * the AI assistant from abuse and runaway cost. Nothing else in the
 * application should hard-code a "10", "50", "100", or "300" for AI limits —
 * it reads from here. The file is client-safe (no server imports) so the
 * same named values are shared between the server enforcement layer, tests,
 * and (if ever needed) a read-only admin indicator.
 *
 * These are CONFIGURABLE DEFAULTS, not permanent product rules. Changing a
 * value here changes enforcement everywhere; no other file needs editing.
 *
 * The enforcement order (server-side, before any model call) is:
 *
 *   User → Authentication → Rate Limit → AI Usage Budget
 *        → Assignment AI Policy → Tool Permission → Context Builder → AI Model
 *
 * Rate limiting, usage budget, AI policy, and tool permission are kept as
 * SEPARATE checks — never collapsed into one conditional.
 */
import type { Capability } from '@/lib/ai-capabilities';

/** The two roles the assistant serves, each with its own limit profile. */
export type AiRole = 'student' | 'lecturer';

/** One fixed-window counter (e.g. "10 requests per 60 seconds"). */
export type AiRateWindow = {
	/** Maximum requests inside the window. */
	maxRequests: number;
	/** Window length in seconds. */
	windowSeconds: number;
	/** Short label used in logs and friendly messages (e.g. "minute"). */
	label: string;
};

/** The full rate-limit profile for one role. */
export type AiRoleRateLimits = {
	/** Stacked fixed windows, checked together. The first to fail denies. */
	windows: AiRateWindow[];
	/** Maximum simultaneous in-flight AI requests for this user. */
	maxConcurrent: number;
};

/**
 * Initial defaults. Students get a comfortable learning budget; lecturers get
 * a higher budget for course-management work. Both are intentionally generous
 * so normal conversations are never interrupted — the limits exist to stop
 * abuse and runaway cost, not to ration learning.
 */
export const AI_RATE_LIMITS: Record<AiRole, AiRoleRateLimits> = {
	student: {
		windows: [
			{ maxRequests: 10, windowSeconds: 60, label: 'menit' },
			{ maxRequests: 50, windowSeconds: 300, label: '5 menit' },
			{ maxRequests: 100, windowSeconds: 3600, label: 'jam' },
			{ maxRequests: 300, windowSeconds: 86400, label: 'hari' },
		],
		maxConcurrent: 2,
	},
	lecturer: {
		windows: [
			{ maxRequests: 15, windowSeconds: 60, label: 'menit' },
			{ maxRequests: 75, windowSeconds: 300, label: '5 menit' },
			{ maxRequests: 200, windowSeconds: 3600, label: 'jam' },
			{ maxRequests: 500, windowSeconds: 86400, label: 'hari' },
		],
		maxConcurrent: 3,
	},
};

/**
 * Capability cost weights. Not every AI operation should consume the same
 * amount of usage budget: a vocabulary hint is cheap, a deep feedback pass
 * over a long draft is expensive. The usage budget is consumed by WEIGHT,
 * not by raw request count, so a few expensive operations can exhaust a
 * daily budget just as a stream of cheap ones can.
 *
 * Keys reuse the existing AI capability names wherever they already exist
 * (see `@/lib/ai-capabilities`). The two additional keys —
 * `deep_feedback` and `large_document_analysis` — name expensive composite
 * operations that are not single capabilities but still consume budget when
 * an endpoint performs them. They are usage-weight keys, NOT new
 * capabilities, so the controlled vocabulary is not duplicated.
 */
export const AI_CAPABILITY_WEIGHTS: Record<string, number> = {
	// ── Simple operations (weight 1) ──
	explain_instruction: 1,
	explain_concept: 1,
	vocabulary_help: 1,
	grammar_help: 1,
	give_hint: 1,
	explain_error: 1,
	// ── Medium operations ──
	brainstorm: 2,
	analyze_own_draft: 3,
	provide_feedback: 3,
	generate_practice: 3,
	// ── Expensive composite operations ──
	deep_feedback: 5,
	large_document_analysis: 8,
};

/** Weight used when a capability has no explicit entry (safe default). */
export const AI_DEFAULT_CAPABILITY_WEIGHT = 1;

/** The usage weight consumed by one AI operation for a capability. */
export const capabilityWeight = (capability: string | undefined): number => {
	if (!capability) return AI_DEFAULT_CAPABILITY_WEIGHT;
	return AI_CAPABILITY_WEIGHTS[capability] ?? AI_DEFAULT_CAPABILITY_WEIGHT;
};

/**
 * Daily usage-weight budget per role. Independent from raw request counts:
 * a user may have request budget left but still be out of usage weight
 * (e.g. after several expensive deep-feedback passes), and vice-versa.
 */
export const AI_USAGE_BUDGET: Record<AiRole, { dailyWeight: number; windowSeconds: number }> = {
	student: { dailyWeight: 600, windowSeconds: 86400 },
	lecturer: { dailyWeight: 1500, windowSeconds: 86400 },
};

/**
 * Token / context protection. Rate limiting by request count alone is not
 * enough — a single request with a huge context can cost as much as many
 * small ones. These caps reject oversized input before the model is called
 * and bound how many tool calls one turn may make.
 *
 * Input is estimated as `ceil(characterCount / 4)` tokens (the same heuristic
 * the assistant compaction step uses). The cap is intentionally above a
 * normal turn so legitimate conversations are never rejected.
 */
export const AI_TOKEN_LIMITS = {
	/** Maximum estimated input/context tokens per request. */
	maxInputTokens: 16000,
	/** Maximum estimated output tokens the model may produce (advisory cap). */
	maxOutputTokens: 2000,
	/** Maximum tool calls the model may make in a single request/turn. */
	maxToolCallsPerRequest: 6,
	/** Maximum accumulated tool calls across one conversation turn. */
	maxAccumulatedToolCallsPerTurn: 6,
} as const;

/**
 * Bounded retry policy for transient provider failures. The assistant NEVER
 * turns one user request into an uncontrolled retry loop: at most
 * `maxRetries` additional attempts, with `backoffMs` between them, and only
 * for the status codes listed. Everything else fails fast.
 */
export const AI_RETRY_POLICY = {
	maxRetries: 1,
	backoffMs: 800,
	retryableStatuses: [502, 503, 504],
} as const;

/**
 * Idempotency window. A duplicated frontend request (double-click, network
 * retry) arriving within this many milliseconds of an in-flight request
 * with the same idempotency key is rejected as a duplicate rather than
 * spawning a second model call.
 */
export const AI_IDEMPOTENCY_WINDOW_MS = 30_000;

/** Resolve a role string from the auth record into an AI role. */
export const toAiRole = (role: string | undefined | null): AiRole =>
	role === 'faculty' ? 'lecturer' : 'student';
