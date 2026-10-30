import { describe, expect, it } from 'vitest';
import {
	buildFilter,
	duplicateKeys,
	groupByCourse,
	isRecent,
	isUnlinked,
	matchesTab,
	needsAction,
} from '@/lib/file-library-nav';
import type { FileLibraryRecord } from '@/lib/learning';

const base = {
	id: 'f1',
	owner: 'u1',
	course: [] as string[],
	cpmk: [] as string[],
	subCpmk: [] as string[],
	session: [] as string[],
	title: 'Materi',
	description: '',
	file: 'materi.pdf',
	size: 100,
	access: 'private',
	status: 'ready',
	created: new Date().toISOString(),
	updated: new Date().toISOString(),
} as unknown as FileLibraryRecord;

const make = (overrides: Partial<FileLibraryRecord>): FileLibraryRecord =>
	({ ...base, ...overrides }) as FileLibraryRecord;

describe('file library navigation', () => {
	it('flags failed and empty-review files as needing action', () => {
		expect(needsAction(make({ parseStatus: 'failed' }))).toBe(true);
		expect(needsAction(make({ parseStatus: 'review', parsedChars: 0 }))).toBe(true);
		expect(needsAction(make({ parseStatus: 'review', parsedChars: 120 }))).toBe(false);
		expect(needsAction(make({ parseStatus: 'ready', parsedChars: 500 }))).toBe(false);
	});

	it('treats a file with no relations as unlinked', () => {
		expect(isUnlinked(make({}))).toBe(true);
		expect(isUnlinked(make({ course: ['c1'] }))).toBe(false);
		expect(isUnlinked(make({ session: ['s1'] }))).toBe(false);
	});

	it('only treats the last seven days as recent', () => {
		const now = Date.parse('2026-10-20T12:00:00Z');
		expect(isRecent(make({ created: '2026-10-18T12:00:00Z' }), now)).toBe(true);
		expect(isRecent(make({ created: '2026-10-01T12:00:00Z' }), now)).toBe(false);
	});

	it('finds duplicate content hashes and ignores unhashed rows', () => {
		const records = [
			make({ id: 'a', contentHash: 'h1' }),
			make({ id: 'b', contentHash: 'h1' }),
			make({ id: 'c', contentHash: 'h2' }),
			make({ id: 'd', contentHash: '' }),
		];
		const duplicates = duplicateKeys(records);
		expect([...duplicates]).toEqual(['h1']);
		expect(matchesTab(records[0], 'duplicates', duplicates)).toBe(true);
		expect(matchesTab(records[2], 'duplicates', duplicates)).toBe(false);
		expect(matchesTab(records[3], 'duplicates', duplicates)).toBe(false);
	});

	it('builds a scoped server filter', () => {
		const filter = buildFilter({
			tab: 'action',
			search: 'mein tag',
			courseId: 'c1',
			kind: 'document',
			access: 'private',
			status: 'all',
			ownerId: 'u1',
		});
		expect(filter).toContain('owner="u1"');
		expect(filter).toContain('course~"c1"');
		expect(filter).toContain('kind="document"');
		expect(filter).toContain('access="private"');
		expect(filter).toContain('parseStatus="failed"');
		expect(filter).toContain('title~"mein tag"');
		expect(filter).not.toContain('parseStatus="all"');
	});

	it('uses the length modifier for empty multi-relations', () => {
		const filter = buildFilter({
			tab: 'unlinked',
			search: '',
			courseId: 'all',
			kind: 'all',
			access: 'all',
			status: 'all',
			ownerId: 'u1',
		});
		expect(filter).toContain('course:length=0');
		expect(filter).not.toContain('course=""');
	});

	it('escapes quotes in the search term', () => {
		const filter = buildFilter({
			tab: 'all',
			search: 'a"b',
			courseId: 'all',
			kind: 'all',
			access: 'all',
			status: 'all',
			ownerId: 'u1',
		});
		expect(filter).toContain('a\\"b');
	});

	it('groups by course and keeps unlinked files last', () => {
		const records = [
			make({ id: '1', course: ['c1'] }),
			make({ id: '2', course: ['c2'] }),
			make({ id: '3', course: [] }),
		];
		const groups = groupByCourse(records, new Map([['c1', 'Alfa'], ['c2', 'Beta']]), new Map());
		expect(groups.map((group) => group.label)).toEqual(['Alfa', 'Beta', 'Tanpa mata kuliah']);
	});
});
