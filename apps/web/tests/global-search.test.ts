import { describe, expect, it } from 'vitest';
import {
	capByGroup,
	filterSearchEntries,
	matchesTokens,
	rankEntries,
	SEARCH_GROUP_LIMIT,
	SEARCH_GROUP_ORDER,
	SEARCH_GROUPS,
	tokenize,
	type SearchEntry,
} from '@/lib/global-search';

function entry(
	overrides: Partial<SearchEntry> & Pick<SearchEntry, 'id' | 'group' | 'title'>,
): SearchEntry {
	return {
		hint: '',
		href: `/app/${overrides.id}`,
		haystack: overrides.title,
		...overrides,
	} as SearchEntry;
}

describe('tokenize', () => {
	it('splits on whitespace and lower-cases', () => {
		expect(tokenize('  SCHREIBEN   A1 ')).toEqual(['schreiben', 'a1']);
	});

	it('returns no tokens for a blank query', () => {
		expect(tokenize('   ')).toEqual([]);
	});
});

describe('matchesTokens', () => {
	it('matches everything when there are no tokens', () => {
		expect(matchesTokens('anything', [])).toBe(true);
	});

	it('requires every token to appear (AND semantics)', () => {
		expect(matchesTokens('TK3 - Textkorrektur 3 SCHREIBEN A1', ['tk3', 'schreiben'])).toBe(true);
		expect(matchesTokens('TK3 - Textkorrektur 3 SCHREIBEN A1', ['tk3', 'mathe'])).toBe(false);
	});

	it('is case-insensitive', () => {
		expect(matchesTokens('SCHREIBEN A1', ['schreiben'])).toBe(true);
	});
});

describe('rankEntries', () => {
	it('puts title prefix hits first and keeps relative order', () => {
		const rows = [
			entry({ id: '1', group: 'courses', title: 'Deutsch A1' }),
			entry({ id: '2', group: 'courses', title: 'SCHREIBEN A1' }),
			entry({ id: '3', group: 'courses', title: 'Schreiben A2' }),
		];
		const ranked = rankEntries(rows, 'schreiben');
		expect(ranked.map((row) => row.id)).toEqual(['2', '3', '1']);
	});

	it('returns the input untouched for a blank query', () => {
		const rows = [
			entry({ id: '1', group: 'courses', title: 'B' }),
			entry({ id: '2', group: 'courses', title: 'A' }),
		];
		expect(rankEntries(rows, '  ').map((row) => row.id)).toEqual(['1', '2']);
	});
});

describe('capByGroup', () => {
	it('caps each group and emits groups in the canonical order', () => {
		const rows = [
			...Array.from({ length: 9 }, (_, i) =>
				entry({ id: `a${i}`, group: 'assignments', title: `Tugas ${i}` }),
			),
			entry({ id: 'c0', group: 'courses', title: 'Kurs' }),
		];
		const capped = capByGroup(rows);
		expect(capped.filter((row) => row.group === 'assignments')).toHaveLength(SEARCH_GROUP_LIMIT);
		expect(capped[0].group).toBe('courses');
		expect(capped).toHaveLength(SEARCH_GROUP_LIMIT + 1);
	});
});

describe('SEARCH_GROUPS', () => {
	it('drives SEARCH_GROUP_ORDER so the two cannot drift apart', () => {
		expect(SEARCH_GROUP_ORDER).toEqual(SEARCH_GROUPS.map((group) => group.id));
	});
});

describe('filterSearchEntries', () => {
	const rows = [
		entry({
			id: 'c1',
			group: 'courses',
			title: 'SCHREIBEN A1',
			hint: 'JR242',
			haystack: 'SCHREIBEN A1 JR242',
		}),
		entry({
			id: 'a1',
			group: 'assignments',
			title: 'TK3 - Textkorrektur 3',
			haystack: 'TK3 - Textkorrektur 3 SCHREIBEN A1',
		}),
		entry({
			id: 'u1',
			group: 'students',
			title: 'Anna Schmidt',
			haystack: 'Anna Schmidt anna@example.com',
		}),
	];

	it('returns every row for a blank query', () => {
		expect(filterSearchEntries(rows, '', 'all')).toHaveLength(3);
	});

	it('matches across title and hint, in group order', () => {
		const result = filterSearchEntries(rows, 'schreiben', 'all');
		expect(result.map((row) => row.id)).toEqual(['c1', 'a1']);
	});

	it('honours the active group filter', () => {
		expect(filterSearchEntries(rows, 'schreiben', 'assignments').map((row) => row.id)).toEqual(['a1']);
	});

	it('searches student email too', () => {
		expect(filterSearchEntries(rows, 'anna@example', 'all').map((row) => row.id)).toEqual(['u1']);
	});

	it('returns an empty list when nothing matches', () => {
		expect(filterSearchEntries(rows, 'zzzz', 'all')).toEqual([]);
	});

	it('emits groups in SEARCH_GROUP_ORDER', () => {
		const ids = filterSearchEntries(rows, '', 'all').map((row) =>
			SEARCH_GROUP_ORDER.indexOf(row.group),
		);
		expect(ids).toEqual([...ids].sort((a, b) => a - b));
	});
});
