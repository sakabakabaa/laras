import pb from '@/lib/pocketbase-client';

/**
 * Client-side data-fetching layer for PocketBase reads.
 *
 * This module NO LONGER caches read results. There is no in-memory store and
 * no sessionStorage persistence, so navigation and saves always show current
 * data — a previous stale-while-revalidate cache was removed because it kept
 * serving outdated rows (stale Pertemuan, stale task/practice data) after a
 * save or navigation.
 *
 * What remains (and why):
 *  - in-flight request deduplication: concurrent readers of the same key share
 *    ONE network request. This never serves old data — it only avoids firing
 *    duplicate concurrent requests (e.g. course layout + rail + detail all
 *    reading the same course). `force` bypasses it for an explicit reload.
 *  - a pub/sub channel: a mutation calls `invalidate(prefix)`, which notifies
 *    every mounted reader whose key matches the prefix to refetch the latest
 *    data (and drops any in-flight request for those keys so the refetch
 *    starts fresh instead of resolving a pre-save request).
 *
 * The public API is unchanged, so every consumer (`useCachedQuery`, the direct
 * `cachedQuery` callers, and the `invalidate`/`clearUserCache` calls after
 * mutations and logout) keeps working without edits.
 */

type Listener = () => void;

const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<Listener>>();

/** Cache keys are scoped per signed-in user so requests never leak across accounts. */
function scopeKey(key: string) {
	const uid = pb.authStore.record?.id || 'anon';
	return `${uid}::${key}`;
}

function notify(key: string) {
	const scoped = scopeKey(key);
	listeners.get(scoped)?.forEach((cb) => {
		try {
			cb();
		} catch {
			// A broken listener must never break the channel.
		}
	});
}

/**
 * Synchronous read of a cached value. Always returns null now — nothing is
 * stored, so callers always fetch fresh data instead of painting a stale row.
 */
export function peekCache<T>(_key: string): T | null {
	return null;
}

/** Nothing is stored, so no entry is ever fresh. Kept for API compatibility. */
export function isCacheFresh(_key: string, _ttl?: number) {
	return false;
}

/**
 * Fresh fetch with in-flight dedup. Never serves cached or stale data.
 *
 *  - no in-flight request → fetches once; concurrent callers share it;
 *  - in-flight request exists → returns the shared promise (dedup);
 *  - `force` → bypasses dedup and starts a fresh request (manual reload/retry).
 *
 * Errors are never stored; a failed fetch clears its in-flight slot so a retry
 * can start cleanly.
 */
export async function cachedQuery<T>(
	key: string,
	fetcher: () => Promise<T>,
	opts: { ttl?: number; force?: boolean } = {},
): Promise<T> {
	const scoped = scopeKey(key);

	if (!opts.force) {
		const pending = inflight.get(scoped);
		if (pending) return pending as Promise<T>;
	}

	const promise = fetcher()
		.then((data) => {
			inflight.delete(scoped);
			return data;
		})
		.catch((err) => {
			inflight.delete(scoped);
			throw err;
		});
	inflight.set(scoped, promise);
	return promise;
}

/** Subscribe to invalidation notifications for one key (returns unsubscribe). */
export function subscribeCache(key: string, listener: Listener) {
	const scoped = scopeKey(key);
	let set = listeners.get(scoped);
	if (!set) {
		set = new Set();
		listeners.set(scoped, set);
	}
	set.add(listener);
	return () => {
		set.delete(listener);
		if (set.size === 0) listeners.delete(scoped);
	};
}

/**
 * Tell every mounted reader whose key starts with `prefix` to refetch the
 * latest data. Also drops any in-flight request for those keys so the refetch
 * starts fresh (an in-flight request started before a save would otherwise
 * resolve with pre-save data). No data is stored, so there is nothing to clear.
 */
export function invalidate(prefix: string) {
	const uid = pb.authStore.record?.id || 'anon';
	const scope = `${uid}::${prefix}`;
	for (const k of [...inflight.keys()]) {
		if (k.startsWith(scope)) inflight.delete(k);
	}
	for (const [k, set] of [...listeners.entries()]) {
		if (k.startsWith(scope)) {
			set.forEach((cb) => {
				try {
					cb();
				} catch {
					// ignore
				}
			});
		}
	}
}

/** Invalidate several collections at once, e.g. after a full RPS publish. */
export function invalidateCollections(...collections: string[]) {
	for (const c of collections) invalidate(c);
}

/** Notify every reader touched by an RPS save/import (course + all RPS data). */
export function invalidateCourseData() {
	invalidateCollections(
		'courses',
		'class_sessions',
		'cpl',
		'cpmk',
		'sub_cpmk',
		'topics',
		'assessments',
		'collaborative_tasks',
		'course_resources',
		'enrollments',
		'assignments',
		'assignment_submissions',
	);
}

/**
 * No stored data — kept for API compatibility. Drops the current user's
 * in-flight requests so a following sign-in never reuses them.
 */
export function clearUserCache() {
	const uid = pb.authStore.record?.id || 'anon';
	for (const k of [...inflight.keys()]) {
		if (k.startsWith(`${uid}::`)) inflight.delete(k);
	}
}

/** Drop every in-flight request — used on logout so no data survives the session. */
export function clearAllCache() {
	inflight.clear();
}

// Safety net: whenever the auth store empties (logout) or switches account, drop
// all in-flight requests so a next sign-in never reuses another session's fetch.
try {
	pb.authStore.onChange((_token, record) => {
		if (!record) clearAllCache();
	});
} catch {
	// Server-side or unsupported — the per-user key scoping still applies.
}
