/**
 * AI Assistant — server-side rate limiting, usage budget, and request
 * protection.
 *
 * This is the enforcement layer that sits between authentication and the AI
 * model. It keeps four concerns SEPARATE (never one big conditional):
 *
 *   1. RATE LIMIT       — "Has this user made too many requests?"
 *   2. USAGE BUDGET     — "How much AI capacity has this user consumed?"
 *   3. CONCURRENCY      — "Is this user already running the max in-flight?"
 *   4. TOKEN/CONTEXT     — "Is the input too large to process safely?"
 *
 * AI policy ("is this capability allowed for this assignment?") and tool
 * permission ("can this request access this tool?") remain in their existing
 * modules (`@/lib/ai-policy.server`, `@/lib/student-assistant-tools.server`)
 * and are NOT duplicated here — this layer runs before them.
 *
 * Identity is the authenticated user ID (primary), with the caller's IP
 * identifier as a secondary abuse guard — many students share one university
 * network, so IP alone is not the rate-limit identity.
 *
 * Storage: short-lived counters live in process memory via
 * `rate-limiter-flexible`'s `RateLimiterMemory` (TTL-based, no permanent DB
 * rows for counters). Only usage AUDIT events are persisted (to
 * `ai_usage_events`), and they carry no student prompts or AI responses.
 */
import { createHash } from 'node:crypto';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	AI_CAPABILITY_WEIGHTS,
	AI_DEFAULT_CAPABILITY_WEIGHT,
	AI_IDEMPOTENCY_WINDOW_MS,
	AI_RATE_LIMITS,
	AI_RETRY_POLICY,
	AI_TOKEN_LIMITS,
	AI_USAGE_BUDGET,
	capabilityWeight,
	toAiRole,
	type AiRole,
} from '@/lib/ai-rate-limits';

const USAGE_EVENTS_COLLECTION = 'ai_usage_events';

// ── Rate-limit counters (one limiter per role × window) ────────────────────

type RoleLimiters = {
	windows: { limiter: RateLimiterMemory; maxRequests: number; label: string }[];
	usage: RateLimiterMemory;
	dailyWeight: number;
	maxConcurrent: number;
};

const buildLimiters = (role: AiRole): RoleLimiters => {
	const config = AI_RATE_LIMITS[role];
	const budget = AI_USAGE_BUDGET[role];
	return {
		windows: config.windows.map((w) => ({
			limiter: new RateLimiterMemory({ points: w.maxRequests, duration: w.windowSeconds }),
			maxRequests: w.maxRequests,
			label: w.label,
		})),
		usage: new RateLimiterMemory({ points: budget.dailyWeight, duration: budget.windowSeconds }),
		dailyWeight: budget.dailyWeight,
		maxConcurrent: config.maxConcurrent,
	};
};

const STUDENT_LIMITERS = buildLimiters('student');
const LECTURER_LIMITERS = buildLimiters('lecturer');

const limitersFor = (role: AiRole): RoleLimiters =>
	role === 'lecturer' ? LECTURER_LIMITERS : STUDENT_LIMITERS;

// ── Concurrency + idempotency (in-flight tracker) ─────────────────────────
// Map<userId, Map<idempotencyKey, { startedAt }>>. Entries are removed when
// the request completes (release) or expire after the idempotency window.

const inFlight = new Map<string, Map<string, { startedAt: number }>>();

const inflightFor = (userId: string): Map<string, { startedAt: number }> => {
	let bucket = inFlight.get(userId);
	if (!bucket) {
		bucket = new Map();
		inFlight.set(userId, bucket);
	}
	return bucket;
};

const pruneExpired = (bucket: Map<string, { startedAt: number }>, now: number): void => {
	for (const [key, entry] of bucket) {
		if (now - entry.startedAt > AI_IDEMPOTENCY_WINDOW_MS) bucket.delete(key);
	}
};

// ── Verdict types ──────────────────────────────────────────────────────────

export type AiDenialReason =
	| 'rate_minute'
	| 'rate_window'
	| 'rate_daily'
	| 'usage_budget'
	| 'concurrent'
	| 'duplicate'
	| 'token_input'
	| 'token_tool_calls';

export type AiAccessDecision =
	| {
			ok: true;
			/** Removes the in-flight entry. Call in a `finally` block. */
			release: () => void;
			/** Idempotency key that was registered. */
			idempotencyKey: string;
	  }
	| {
			ok: false;
			status: number;
			/** Friendly Indonesian message for the user. */
			message: string;
			denialReason: AiDenialReason;
			/** Seconds until the limit resets (for logging/headers). */
			retryAfterSeconds?: number;
	  };

// ── Friendly messages ─────────────────────────────────────────────────────

const formatMinutes = (seconds: number): string => {
	if (seconds <= 60) return 'beberapa saat';
	const minutes = Math.ceil(seconds / 60);
	return `${minutes} menit`;
};

/** Friendly message for a rate-limit denial — never "HTTP 429". */
const rateLimitMessage = (label: string, retryAfterSeconds: number): string => {
	if (label === 'hari') {
		return 'Anda telah mencapai batas bantuan AI untuk hari ini. Anda tetap dapat melanjutkan tugas, membaca umpan balik sebelumnya, dan mengumpulkan pekerjaan Anda.';
	}
	return `Anda telah mencapai batas penggunaan AI saat ini. Coba lagi dalam ${formatMinutes(retryAfterSeconds)}.`;
};

const USAGE_EXHAUSTED_MESSAGE =
	'Anda telah mencapai batas bantuan AI untuk hari ini. Anda tetap dapat melanjutkan tugas, membaca umpan balik sebelumnya, dan mengumpulkan pekerjaan Anda.';

const CONCURRENT_MESSAGE =
	'Permintaan AI Anda sebelumnya masih diproses. Mohon tunggu sebentar sebelum mencoba lagi.';

const TOKEN_INPUT_MESSAGE =
	'Pesan atau konteks terlalu panjang untuk diproses sekaligus. Ringkas atau pecah menjadi bagian yang lebih kecil, lalu coba lagi.';

// ── Rate-limit check (consumes 1 point from every window) ──────────────────

type RateVerdict =
	| { ok: true }
	| { ok: false; denialReason: AiDenialReason; label: string; retryAfterSeconds: number };

const checkRateLimits = async (
	userId: string,
	role: AiRole,
): Promise<RateVerdict> => {
	const { windows } = limitersFor(role);
	for (const { limiter, label } of windows) {
		try {
			await limiter.consume(userId, 1);
		} catch (error) {
			if (error instanceof RateLimiterRes) {
				const retryAfterSeconds = Math.ceil(error.msBeforeNext / 1000);
				const denialReason: AiDenialReason =
					label === 'hari' ? 'rate_daily' : label === 'menit' ? 'rate_minute' : 'rate_window';
				return { ok: false, denialReason, label, retryAfterSeconds };
			}
			throw error;
		}
	}
	return { ok: true };
};

// ── Usage budget (peek + consume) ──────────────────────────────────────────

/** Peek the remaining daily usage weight without consuming. */
const peekUsageBudget = async (
	userId: string,
	role: AiRole,
	weight: number,
): Promise<{ ok: true; remaining: number } | { ok: false; retryAfterSeconds: number }> => {
	const { usage, dailyWeight } = limitersFor(role);
	const res = await usage.get(userId);
	const consumed = res ? res.consumedPoints : 0;
	const remaining = dailyWeight - consumed;
	if (remaining < weight) {
		const retryAfterSeconds = res ? Math.ceil(res.msBeforeNext / 1000) : 60;
		return { ok: false, retryAfterSeconds };
	}
	return { ok: true, remaining };
};

/** Consume `weight` from the daily usage budget. Called on a successful turn. */
const consumeUsageBudget = async (userId: string, role: AiRole, weight: number): Promise<void> => {
	const { usage } = limitersFor(role);
	if (weight <= 0) return;
	try {
		await usage.consume(userId, weight);
	} catch {
		// A race could exhaust the budget between peek and consume. The request
		// already succeeded; we do not penalize the user for the race — the
		// next request will be denied at the peek.
	}
};

/** Remaining daily usage weight for a user (for an admin/settings indicator). */
export const getUsageSummary = async (
	userId: string,
	role: AiRole,
): Promise<{ consumed: number; budget: number; remaining: number }> => {
	const { usage, dailyWeight } = limitersFor(role);
	const res = await usage.get(userId);
	const consumed = res ? res.consumedPoints : 0;
	return { consumed, budget: dailyWeight, remaining: Math.max(0, dailyWeight - consumed) };
};

// ── Token / context guard ──────────────────────────────────────────────────

/** Estimate tokens from a character count (4 chars ≈ 1 token). */
export const estimateTokens = (chars: number): number => Math.ceil(Math.max(0, chars) / 4);

/**
 * Reject input that would blow the context budget before the model is called.
 * A simple vocabulary question must not silently drag the entire course,
 * assignment history, and unrelated materials into the model — the existing
 * context builder already keeps context scoped; this is the hard ceiling.
 */
export const checkInputSize = (inputChars: number): AiAccessDecision => {
	const tokens = estimateTokens(inputChars);
	if (tokens > AI_TOKEN_LIMITS.maxInputTokens) {
		return {
			ok: false,
			status: 422,
			message: TOKEN_INPUT_MESSAGE,
			denialReason: 'token_input',
		};
	}
	return { ok: true, release: () => {}, idempotencyKey: '' };
};

// ── Idempotency key ────────────────────────────────────────────────────────

/** Derive a stable idempotency key from the user and message content. */
export const deriveIdempotencyKey = (userId: string, message: string): string => {
	const hash = createHash('sha256').update(`${userId}|${message}`, 'utf8').digest('hex');
	return hash.slice(0, 32);
};

// ── Concurrency + idempotency ──────────────────────────────────────────────

type ConcurrencyVerdict =
	| { ok: true; release: () => void }
	| { ok: false; denialReason: 'concurrent' | 'duplicate' };

const beginConcurrentRequest = (
	userId: string,
	role: AiRole,
	idempotencyKey: string,
): ConcurrencyVerdict => {
	const { maxConcurrent } = limitersFor(role);
	const bucket = inflightFor(userId);
	const now = Date.now();
	pruneExpired(bucket, now);

	// Idempotency: an identical in-flight request is a duplicate (double-click
	// / network retry). Reject rather than spawn a second model call.
	if (bucket.has(idempotencyKey)) {
		return { ok: false, denialReason: 'duplicate' };
	}

	// Concurrency: too many simultaneous in-flight requests for this user.
	if (bucket.size >= maxConcurrent) {
		return { ok: false, denialReason: 'concurrent' };
	}

	bucket.set(idempotencyKey, { startedAt: now });
	const release = () => {
		const b = inFlight.get(userId);
		if (b) {
			b.delete(idempotencyKey);
			if (b.size === 0) inFlight.delete(userId);
		}
	};
	return { ok: true, release };
};

// ── Usage audit (persisted, fire-and-forget, no prompts/responses) ─────────

type UsageEventInput = {
	userId: string;
	role: AiRole;
	capability?: string;
	assignmentId?: string;
	weight: number;
	allowed: boolean;
	denialReason?: AiDenialReason;
};

/**
 * Persist one usage audit event. Fire-and-forget: a persistence failure is
 * logged and swallowed — it must never break the user's request. Stores only
 * diagnostic metadata (user, role, capability, assignment, weight,
 * allowed/denied, reason, timestamp). NEVER student prompts or AI responses.
 */
export const recordUsageEvent = (input: UsageEventInput): void => {
	const payload = {
		owner: input.userId,
		role: input.role,
		capability: (input.capability || '').slice(0, 64),
		assignment: (input.assignmentId || '').slice(0, 64),
		usageWeight: input.weight,
		allowed: input.allowed,
		denialReason: input.denialReason || '',
	};
	void pocketbaseAdmin
		.createRecord(USAGE_EVENTS_COLLECTION, payload)
		.catch((error: unknown) => {
			logger.error(
				`ai usage audit failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		});
};

// ── Orchestrator ───────────────────────────────────────────────────────────

export type EnforceAiAccessInput = {
	userId: string;
	role: AiRole;
	/** IP identifier for secondary abuse protection (not the primary identity). */
	ipIdentifier?: string;
	/** Capability being invoked (determines the usage weight). */
	capability?: string;
	/** Override the weight; defaults to the capability's weight. */
	weight?: number;
	/** Assignment the request is scoped to, when applicable. */
	assignmentId?: string;
	/** Client-supplied request id, or a derived key, for idempotency. */
	idempotencyKey?: string;
	/** Input character count for the token/context guard. */
	inputChars?: number;
};

/**
 * The single entry point an AI endpoint calls before any model work. Runs the
 * four protection checks in order and returns either a release handle (the
 * request may proceed) or a ready-to-return denial.
 *
 * On success the caller MUST:
 *   1. call `release()` in a `finally` block, and
 *   2. call `commitUsage()` after the model turn succeeds (to consume the
 *      usage weight and record the allowed audit event).
 *
 * On denial the caller returns the denial directly; the audit event is
 * already recorded here.
 */
export const enforceAiAccess = async (input: EnforceAiAccessInput): Promise<AiAccessDecision> => {
	const role = input.role;
	const weight = input.weight ?? capabilityWeight(input.capability);
	const idempotencyKey = input.idempotencyKey || deriveIdempotencyKey(input.userId, String(input.inputChars ?? ''));

	// 1. Token/context guard (cheap, pure — check first so a huge payload is
	//    rejected before any counter is consumed).
	if (input.inputChars != null) {
		const tokens = estimateTokens(input.inputChars);
		if (tokens > AI_TOKEN_LIMITS.maxInputTokens) {
			recordUsageEvent({ ...input, weight, allowed: false, denialReason: 'token_input' });
			return { ok: false, status: 422, message: TOKEN_INPUT_MESSAGE, denialReason: 'token_input' };
		}
	}

	// 2. Rate limits (consume 1 from every window).
	const rate = await checkRateLimits(input.userId, role);
	if (!rate.ok) {
		recordUsageEvent({ ...input, weight, allowed: false, denialReason: rate.denialReason });
		return {
			ok: false,
			status: 429,
			message: rateLimitMessage(rate.label, rate.retryAfterSeconds),
			denialReason: rate.denialReason,
			retryAfterSeconds: rate.retryAfterSeconds,
		};
	}

	// 3. Usage budget (peek — consume only on success).
	const budget = await peekUsageBudget(input.userId, role, weight);
	if (!budget.ok) {
		recordUsageEvent({ ...input, weight, allowed: false, denialReason: 'usage_budget' });
		return {
			ok: false,
			status: 429,
			message: USAGE_EXHAUSTED_MESSAGE,
			denialReason: 'usage_budget',
			retryAfterSeconds: budget.retryAfterSeconds,
		};
	}

	// 4. Concurrency + idempotency.
	const concurrency = beginConcurrentRequest(input.userId, role, idempotencyKey);
	if (!concurrency.ok) {
		const denialReason = concurrency.denialReason;
		recordUsageEvent({ ...input, weight, allowed: false, denialReason });
		return {
			ok: false,
			status: 429,
			message: CONCURRENT_MESSAGE,
			denialReason,
		};
	}

	return { ok: true, release: concurrency.release, idempotencyKey };
};

/**
 * Commit a successful AI turn: consume the usage weight and record the
 * allowed audit event. Safe to call after the model returned successfully.
 * Returns a promise so callers that need to observe the consumed budget
 * immediately (e.g. tests) can await it; endpoints may fire-and-forget.
 */
export const commitUsage = async (input: {
	userId: string;
	role: AiRole;
	capability?: string;
	assignmentId?: string;
	weight?: number;
}): Promise<void> => {
	const weight = input.weight ?? capabilityWeight(input.capability);
	await consumeUsageBudget(input.userId, input.role, weight);
	recordUsageEvent({ ...input, weight, allowed: true });
};

// ── Bounded retry helper ───────────────────────────────────────────────────

/**
 * Run an async operation with a bounded retry policy for transient provider
 * failures. Never turns one user request into an uncontrolled retry loop:
 * at most `maxRetries` extra attempts, only for retryable status codes.
 */
export const withBoundedRetry = async <T>(
	operation: () => Promise<T>,
	extractStatus: (error: unknown) => number | null,
): Promise<T> => {
	let lastError: unknown;
	const { maxRetries, backoffMs, retryableStatuses } = AI_RETRY_POLICY;
	for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			const status = extractStatus(error);
			const retryable = status != null && retryableStatuses.some((retryableStatus) => retryableStatus === status);
			if (!retryable || attempt >= maxRetries) break;
			await new Promise((resolve) => setTimeout(resolve, backoffMs));
		}
	}
	throw lastError;
};

// ── Tool-call limit guard ──────────────────────────────────────────────────

/**
 * True when a turn has exceeded the maximum accumulated tool calls. The
 * assistant runtime already bounds iterations; this exposes the configured
 * ceiling so the runtime can read it instead of a hard-coded number.
 */
export const toolCallLimitReached = (accumulated: number): boolean =>
	accumulated >= AI_TOKEN_LIMITS.maxAccumulatedToolCallsPerTurn;

/** The configured maximum tool calls per turn (read from config, not hard-coded). */
export const maxToolCallsPerTurn = (): number => AI_TOKEN_LIMITS.maxAccumulatedToolCallsPerTurn;

// ── Re-exports for callers ─────────────────────────────────────────────────
export { capabilityWeight, toAiRole, AI_CAPABILITY_WEIGHTS, AI_DEFAULT_CAPABILITY_WEIGHT };
export type { AiRole };
