/**
 * Pure search helpers for the global command palette (Ctrl/Cmd+K).
 *
 * Kept free of React and PocketBase so the filtering/ranking rules can be
 * unit-tested without a DOM - the vitest setup for this app runs in `node`
 * (see apps/web/vitest.config.ts), so component tests are not available.
 */

export type SearchGroupId = 'courses' | 'assignments' | 'students' | 'materials' | 'submissions';

export type SearchEntry = {
	id: string;
	group: SearchGroupId;
	title: string;
	hint: string;
	href: string;
	haystack: string;
};

/** Result sections, in the order they render and the order arrow keys walk. */
export const SEARCH_GROUPS: { id: SearchGroupId; label: string }[] = [
	{ id: 'courses', label: 'Mata kuliah' },
	{ id: 'assignments', label: 'Tugas' },
	{ id: 'students', label: 'Mahasiswa' },
	{ id: 'materials', label: 'Materi' },
	{ id: 'submissions', label: 'Pengumpulan' },
];

/** Section order derived from SEARCH_GROUPS so the two can never drift apart. */
export const SEARCH_GROUP_ORDER: SearchGroupId[] = SEARCH_GROUPS.map((group) => group.id);

/** Rows shown per group before the list is truncated. */
export const SEARCH_GROUP_LIMIT = 6;

/** Split a raw query into lower-cased tokens; blank queries yield no tokens. */
export function tokenize(query: string): string[] {
	return query
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
}

/** True when every token appears somewhere in the haystack (AND semantics). */
export function matchesTokens(haystack: string, tokens: string[]): boolean {
	if (tokens.length === 0) return true;
	const hay = haystack.toLowerCase();
	return tokens.every((token) => hay.includes(token));
}

/**
 * Title prefix matches first, then the rest. Both buckets keep their original
 * order, so the ranking is stable.
 */
export function rankEntries<T extends { title: string }>(entries: T[], query: string): T[] {
	const q = query.trim().toLowerCase();
	if (!q) return entries;
	const prefixed: T[] = [];
	const rest: T[] = [];
	for (const entry of entries) {
		if (entry.title.toLowerCase().startsWith(q)) prefixed.push(entry);
		else rest.push(entry);
	}
	return [...prefixed, ...rest];
}

/** Keep the first `limit` entries of each group, emitting groups in `order`. */
export function capByGroup<T extends { group: SearchGroupId }>(
	entries: T[],
	order: SearchGroupId[] = SEARCH_GROUP_ORDER,
	limit: number = SEARCH_GROUP_LIMIT,
): T[] {
	const capped: T[] = [];
	for (const group of order) {
		const rows = entries.filter((entry) => entry.group === group);
		capped.push(...rows.slice(0, limit));
	}
	return capped;
}

/**
 * The list the palette renders: token filter -> prefix ranking -> group filter
 * -> per-group cap. The returned order is the order the arrow keys walk.
 */
export function filterSearchEntries(
	entries: SearchEntry[],
	query: string,
	filter: SearchGroupId | 'all',
	limit: number = SEARCH_GROUP_LIMIT,
): SearchEntry[] {
	const tokens = tokenize(query);
	const matched = tokens.length
		? entries.filter((entry) => matchesTokens(entry.haystack, tokens))
		: entries;
	const ranked = rankEntries(matched, query);
	const scoped = filter === 'all' ? ranked : ranked.filter((entry) => entry.group === filter);
	return capByGroup(scoped, SEARCH_GROUP_ORDER, limit);
}
