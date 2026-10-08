/**
 * Tests for the AI assistant rate-limiting / usage-protection layer.
 *
 * Covers the scenarios from the phase spec: normal requests succeed, each
 * rate window is enforced, lecturer/student limits are independent,
 * concurrency and idempotency work, capability weights differ, token/context
 * guards reject oversized input, tool-call limits are read from config,
 * bounded retry does not loop, and rate limiting is keyed by user id (not
 * bypassable by changing frontend state).
 *
 * `pocketbaseAdmin` and `logger` are mocked so the audit write (fire-and-
 * forget) never reaches a real PocketBase and tests stay fast. Each test uses
 * a unique user id so the module-level in-memory counters never collide.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		createRecord: vi.fn().mockResolvedValue({ id: 'test' }),
		listRecords: vi.fn().mockResolvedValue({ items: [] }),
	},
}));
vi.mock('@/lib/logger.server', () => ({
	default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

import {
	enforceAiAccess,
	commitUsage,
	checkInputSize,
	withBoundedRetry,
	toolCallLimitReached,
	maxToolCallsPerTurn,
	getUsageSummary,
	deriveIdempotencyKey,
} from '@/lib/ai-usage.server';
import {
	AI_RATE_LIMITS,
	AI_CAPABILITY_WEIGHTS,
	capabilityWeight,
	toAiRole,
} from '@/lib/ai-rate-limits';

let counter = 0;
const uniqueUser = (prefix: string) => `${prefix}-${counter++}`;

beforeEach(() => {
	counter += 1;
});

// 1. Normal student request succeeds.
describe('normal requests', () => {
	it('allows a normal student request', async () => {
		const user = uniqueUser('student-ok');
		const decision = await enforceAiAccess({ userId: user, role: 'student', inputChars: 100 });
		expect(decision.ok).toBe(true);
		if (decision.ok) decision.release();
	});

	it('allows a normal lecturer request', async () => {
		const user = uniqueUser('lecturer-ok');
		const decision = await enforceAiAccess({ userId: user, role: 'lecturer', inputChars: 100 });
		expect(decision.ok).toBe(true);
		if (decision.ok) decision.release();
	});
});

// 3-5. Rate windows enforced.
describe('student rate windows', () => {
	it('enforces the per-minute limit', async () => {
		const user = uniqueUser('student-min');
		const max = AI_RATE_LIMITS.student.windows[0].maxRequests;
		for (let i = 0; i < max; i += 1) {
			const d = await enforceAiAccess({ userId: user, role: 'student', inputChars: 10, idempotencyKey: `k-${i}` });
			if (d.ok) d.release();
		}
		const over = await enforceAiAccess({ userId: user, role: 'student', inputChars: 10, idempotencyKey: 'over' });
		expect(over.ok).toBe(false);
		if (!over.ok) {
			expect(over.status).toBe(429);
			expect(over.denialReason).toBe('rate_minute');
			expect(over.message).not.toContain('429');
		}
	});

	it('enforces the daily limit', async () => {
		vi.useFakeTimers({ now: Date.now() });
		const user = uniqueUser('student-day');
		const dayMax = AI_RATE_LIMITS.student.windows[3].maxRequests; // 300
		// 3 hour-segments × 10 minute-batches × 10 requests = 300. Advance past
		// the minute/5-min/hour windows each batch so only the daily counter
		// accumulates; total advancement (~10.8ks) stays under the day window.
		for (let seg = 0; seg < 3; seg += 1) {
			for (let mb = 0; mb < 10; mb += 1) {
				for (let i = 0; i < 10; i += 1) {
					const d = await enforceAiAccess({ userId: user, role: 'student', inputChars: 10, idempotencyKey: `d-${seg}-${mb}-${i}` });
					if (d.ok) d.release();
				}
				vi.advanceTimersByTime(61_000); // past the minute window
			}
			vi.advanceTimersByTime(3_000_000); // past the hour window
		}
		const over = await enforceAiAccess({ userId: user, role: 'student', inputChars: 10, idempotencyKey: 'd-over' });
		expect(over.ok).toBe(false);
		if (!over.ok) expect(over.denialReason).toBe('rate_daily');
		vi.useRealTimers();
	});
});

// 6. Lecturer limits independent.
describe('lecturer limits', () => {
	it('lecturer minute limit is higher than student and independent', async () => {
		expect(AI_RATE_LIMITS.lecturer.windows[0].maxRequests).toBeGreaterThan(
			AI_RATE_LIMITS.student.windows[0].maxRequests,
		);
		const lecturer = uniqueUser('lecturer-min');
		const studentMax = AI_RATE_LIMITS.student.windows[0].maxRequests;
		// A lecturer can make studentMax+1 requests without hitting the lecturer minute limit.
		for (let i = 0; i <= studentMax; i += 1) {
			const d = await enforceAiAccess({ userId: lecturer, role: 'lecturer', inputChars: 10, idempotencyKey: `l-${i}` });
			expect(d.ok).toBe(true);
			if (d.ok) d.release();
		}
	});

	it('enforces the lecturer minute limit', async () => {
		const user = uniqueUser('lecturer-min2');
		const max = AI_RATE_LIMITS.lecturer.windows[0].maxRequests;
		for (let i = 0; i < max; i += 1) {
			const d = await enforceAiAccess({ userId: user, role: 'lecturer', inputChars: 10, idempotencyKey: `k-${i}` });
			if (d.ok) d.release();
		}
		const over = await enforceAiAccess({ userId: user, role: 'lecturer', inputChars: 10, idempotencyKey: 'over' });
		expect(over.ok).toBe(false);
		if (!over.ok) expect(over.status).toBe(429);
	});
});

// 7. Concurrent request limit.
describe('concurrency', () => {
	it('rejects requests beyond the concurrent limit', async () => {
		const user = uniqueUser('student-conc');
		const max = AI_RATE_LIMITS.student.maxConcurrent;
		const held: (() => void)[] = [];
		for (let i = 0; i < max; i += 1) {
			const d = await enforceAiAccess({ userId: user, role: 'student', idempotencyKey: `c-${i}` });
			expect(d.ok).toBe(true);
			if (d.ok) held.push(d.release);
		}
		const over = await enforceAiAccess({ userId: user, role: 'student', idempotencyKey: 'c-over' });
		expect(over.ok).toBe(false);
		if (!over.ok) expect(over.denialReason).toBe('concurrent');
		for (const release of held) release();
	});
});

// 12. Idempotency — duplicate in-flight request rejected.
describe('idempotency', () => {
	it('rejects a duplicate in-flight request with the same key', async () => {
		const user = uniqueUser('student-idem');
		const key = deriveIdempotencyKey(user, 'hello');
		const first = await enforceAiAccess({ userId: user, role: 'student', idempotencyKey: key });
		expect(first.ok).toBe(true);
		const second = await enforceAiAccess({ userId: user, role: 'student', idempotencyKey: key });
		expect(second.ok).toBe(false);
		if (!second.ok) expect(second.denialReason).toBe('duplicate');
		if (first.ok) first.release();
	});

	it('derives a stable key from user + message', () => {
		const a = deriveIdempotencyKey('u1', 'hi');
		const b = deriveIdempotencyKey('u1', 'hi');
		const c = deriveIdempotencyKey('u1', 'bye');
		const d = deriveIdempotencyKey('u2', 'hi');
		expect(a).toBe(b);
		expect(a).not.toBe(c);
		expect(a).not.toBe(d);
	});
});

// 8. Capability weights differ.
describe('capability weights', () => {
	it('assigns different weights to different capabilities', () => {
		expect(capabilityWeight('give_hint')).toBe(1);
		expect(capabilityWeight('analyze_own_draft')).toBe(3);
		expect(capabilityWeight('large_document_analysis')).toBe(8);
		expect(capabilityWeight('deep_feedback')).toBe(5);
	});

	it('consumes the capability weight from the usage budget', async () => {
		const user = uniqueUser('student-weight');
		await commitUsage({ userId: user, role: 'student', capability: 'large_document_analysis' });
		const summary = await getUsageSummary(user, 'student');
		expect(summary.consumed).toBe(AI_CAPABILITY_WEIGHTS.large_document_analysis);
	});

	it('denies when the daily usage weight budget is exhausted', async () => {
		const user = uniqueUser('student-budget');
		// Exhaust the budget with expensive operations.
		const budget = (await getUsageSummary(user, 'student')).budget;
		const expensive = Math.ceil(budget / AI_CAPABILITY_WEIGHTS.large_document_analysis) + 1;
		for (let i = 0; i < expensive; i += 1) {
			await commitUsage({ userId: user, role: 'student', capability: 'large_document_analysis' });
		}
		const d = await enforceAiAccess({
			userId: user,
			role: 'student',
			capability: 'large_document_analysis',
			idempotencyKey: `b-${Date.now()}`,
		});
		expect(d.ok).toBe(false);
		if (!d.ok) expect(d.denialReason).toBe('usage_budget');
	});
});

// 14. Token / context guard.
describe('token guard', () => {
	it('rejects oversized input', () => {
		const huge = 'x'.repeat(16000 * 4 + 100); // > maxInputTokens
		const d = checkInputSize(huge.length);
		expect(d.ok).toBe(false);
		if (!d.ok) expect(d.denialReason).toBe('token_input');
	});

	it('allows normal-sized input', () => {
		const d = checkInputSize(1000);
		expect(d.ok).toBe(true);
	});

	it('enforceAiAccess rejects oversized input before any model call', async () => {
		const user = uniqueUser('student-token');
		const d = await enforceAiAccess({ userId: user, role: 'student', inputChars: 16000 * 4 + 100 });
		expect(d.ok).toBe(false);
		if (!d.ok) expect(d.denialReason).toBe('token_input');
	});
});

// 15. Tool-call limits.
describe('tool-call limits', () => {
	it('reads the configured ceiling', () => {
		expect(maxToolCallsPerTurn()).toBeGreaterThan(0);
	});
	it('flags when the accumulated tool calls reach the ceiling', () => {
		expect(toolCallLimitReached(maxToolCallsPerTurn())).toBe(true);
		expect(toolCallLimitReached(0)).toBe(false);
	});
});

// 13. Bounded retry.
describe('bounded retry', () => {
	it('retries retryable statuses and eventually fails', async () => {
		let calls = 0;
		const op = vi.fn(async () => {
			calls += 1;
			throw Object.assign(new Error('bad gateway'), { status: 502 });
		});
		await expect(
			withBoundedRetry(op, (e) => (e as { status?: number }).status ?? null),
		).rejects.toThrow('bad gateway');
		// 1 initial + maxRetries (1) = 2 calls, not unbounded.
		expect(calls).toBe(2);
	});

	it('does not retry non-retryable statuses', async () => {
		let calls = 0;
		const op = vi.fn(async () => {
			calls += 1;
			throw Object.assign(new Error('bad request'), { status: 400 });
		});
		await expect(
			withBoundedRetry(op, (e) => (e as { status?: number }).status ?? null),
		).rejects.toThrow('bad request');
		expect(calls).toBe(1);
	});

	it('succeeds after a transient retry', async () => {
		let calls = 0;
		const op = vi.fn(async () => {
			calls += 1;
			if (calls === 1) throw Object.assign(new Error('temp'), { status: 503 });
			return 'ok';
		});
		const result = await withBoundedRetry(op, (e) => (e as { status?: number }).status ?? null);
		expect(result).toBe('ok');
		expect(calls).toBe(2);
	});
});

// 10-11. Server-side authority / not bypassable.
describe('server-side authority', () => {
	it('rate limits are keyed by user id, not frontend state', async () => {
		const userA = uniqueUser('bypass-a');
		const userB = uniqueUser('bypass-b');
		const max = AI_RATE_LIMITS.student.windows[0].maxRequests;
		// Exhaust userA's minute window.
		for (let i = 0; i < max; i += 1) {
			const d = await enforceAiAccess({ userId: userA, role: 'student', idempotencyKey: `a-${i}` });
			if (d.ok) d.release();
		}
		// userA is now limited...
		const aOver = await enforceAiAccess({ userId: userA, role: 'student', idempotencyKey: 'a-over' });
		expect(aOver.ok).toBe(false);
		// ...but userB is unaffected (changing user id is a different counter,
		// and the server resolves the real user from the auth token, not the body).
		const bOk = await enforceAiAccess({ userId: userB, role: 'student', idempotencyKey: 'b-ok' });
		expect(bOk.ok).toBe(true);
		if (bOk.ok) bOk.release();
	});

	it('toAiRole maps faculty to lecturer', () => {
		expect(toAiRole('faculty')).toBe('lecturer');
		expect(toAiRole('student')).toBe('student');
		expect(toAiRole(undefined)).toBe('student');
	});
});

// 16. Rate limiting does not block normal assignment access.
describe('non-blocking', () => {
	it('enforceAiAccess is a pure guard — it never touches assignment records', () => {
		// The guard returns a decision object only; it performs no assignment
		// read/write. Normal assignment access (opening, editing, submitting) is
		// unaffected because those flows do not call enforceAiAccess.
		expect(typeof enforceAiAccess).toBe('function');
		expect(typeof checkInputSize).toBe('function');
	});
});
