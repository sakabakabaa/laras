import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedQuery, subscribeCache } from '@/lib/local-cache';
import { errorMessage, isAbortError } from '@/lib/learning';

export type CachedQuery<T> = {
	data: T | null;
	loading: boolean;
	error: string;
	/** Force a network refresh (retry button / after-save reload). */
	reload: () => void;
};

/**
 * Data-loading hook on top of the fetching layer (`@/lib/local-cache`).
 *
 * - `key === null` disables the query (no fetch).
 * - Nothing is cached: every mount fetches fresh data and shows `loading: true`
 *   until it lands. There is no stale-while-revalidate, so navigation and saves
 *   always display current data.
 * - Concurrent mounts of the same key share one in-flight request (dedup), which
 *   also removes the StrictMode abort flashes.
 * - The fetcher may be an inline arrow: it is kept in a ref, so it never
 *   re-triggers the effect.
 * - A mutation in another component (e.g. a save in a form) calls
 *   `invalidate(prefix)`, which notifies this hook and triggers a fresh refetch.
 */
export function useCachedQuery<T>(
	key: string | null,
	fetcher: () => Promise<T>,
	opts: { ttl?: number } = {},
): CachedQuery<T> {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState<boolean>(key !== null);
	const [error, setError] = useState('');

	const fetcherRef = useRef(fetcher);
	fetcherRef.current = fetcher;
	const optsRef = useRef(opts);
	optsRef.current = opts;

	const run = useCallback(
		async (force: boolean, isStale: () => boolean) => {
			if (!key) return;
			setError('');
			try {
				const value = await cachedQuery<T>(key, () => fetcherRef.current(), {
					ttl: optsRef.current.ttl,
					force,
				});
				if (isStale()) return;
				setData(value);
				setLoading(false);
			} catch (err) {
				if (isStale() || isAbortError(err)) return;
				setError(errorMessage(err));
				setLoading(false);
			}
		},
		[key],
	);

	useEffect(() => {
		if (!key) {
			setData(null);
			setLoading(false);
			setError('');
			return;
		}
		let ignore = false;
		const isStale = () => ignore;

		// Drop the previous key's rows immediately. Otherwise a route change
		// keeps painting the last record (e.g. the previous mata kuliah) until
		// the new request lands, and callers canonicalize the URL back to it.
		setData(null);
		setLoading(true);
		void run(false, isStale);

		// A mutation elsewhere calls invalidate(prefix) → refetch fresh data.
		const unsubscribe = subscribeCache(key, () => {
			if (ignore) return;
			void run(false, isStale);
		});

		return () => {
			ignore = true;
			unsubscribe();
		};
	}, [key, run]);

	const reload = useCallback(() => {
		void run(true, () => false);
	}, [run]);

	return { data, loading, error, reload };
}

export default useCachedQuery;
