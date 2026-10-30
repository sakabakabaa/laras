import { describe, expect, it } from 'vitest';
import type { CourseRosterEntry } from '@/lib/learning';
import {
	ROSTER_CSV_HEADER,
	buildRosterCsv,
	parseRosterText,
	parseCsvLine,
	escapeCsvField,
} from '@/lib/roster-csv';

function entry(
	nim: string,
	name: string,
	extra: Partial<CourseRosterEntry> = {},
): CourseRosterEntry {
	return {
		id: `id-${nim}`,
		owner: 'owner',
		course: 'course',
		nim,
		name,
		created: '',
		updated: '',
		...extra,
	};
}

describe('buildRosterCsv — format compatibility with import', () => {
	it('uses the nim,nama header the import parser expects', () => {
		const csv = buildRosterCsv([entry('2021001', 'Budi Santoso')]);
		expect(csv.split('\n')[0]).toBe(ROSTER_CSV_HEADER);
		expect(csv.split('\n')[0]).toBe('nim,nama');
	});

	it('emits one comma-separated row per entry in nim,name order', () => {
		const csv = buildRosterCsv([
			entry('2021001', 'Budi Santoso'),
			entry('2021002', 'Siti Aminah'),
		]);
		const lines = csv.split('\n');
		expect(lines[1]).toBe('2021001,Budi Santoso');
		expect(lines[2]).toBe('2021002,Siti Aminah');
	});

	it('contains the current roster records', () => {
		const entries = [
			entry('2021001', 'Budi Santoso'),
			entry('2021002', 'Siti Aminah'),
			entry('2021003', 'Ahmad Fauzi'),
		];
		const csv = buildRosterCsv(entries);
		for (const e of entries) {
			expect(csv).toContain(e.nim);
			expect(csv).toContain(e.name);
		}
	});

	it('handles an empty roster by emitting only the header', () => {
		const csv = buildRosterCsv([]);
		expect(csv.trim()).toBe(ROSTER_CSV_HEADER);
	});
});

describe('export → import round-trip', () => {
	it('re-imports an exported file into the same records', () => {
		const entries = [
			entry('2021001', 'Budi Santoso'),
			entry('2021002', 'Siti Aminah'),
			entry('2021003', 'Ahmad Fauzi'),
		];
		const csv = buildRosterCsv(entries);
		// Re-import against an empty existing set (fresh course).
		const rows = parseRosterText(csv, new Set());
		const valid = rows.filter((r) => !r.error && !r.exists);
		expect(valid).toHaveLength(entries.length);
		expect(valid.map((r) => r.nim)).toEqual([
			'2021001',
			'2021002',
			'2021003',
		]);
		expect(valid.map((r) => r.name)).toEqual([
			'Budi Santoso',
			'Siti Aminah',
			'Ahmad Fauzi',
		]);
	});

	it('marks every exported row as already-existing when re-imported into the same course', () => {
		const entries = [
			entry('2021001', 'Budi Santoso'),
			entry('2021002', 'Siti Aminah'),
		];
		const csv = buildRosterCsv(entries);
		const existing = new Set(entries.map((e) => e.nim));
		const rows = parseRosterText(csv, existing);
		expect(rows.every((r) => r.exists && !r.error)).toBe(true);
	});

	it('preserves names containing commas through a round-trip', () => {
		const entries = [entry('2021001', 'Siti, S.Kom.')];
		const csv = buildRosterCsv(entries);
		// The quoted field must be re-imported as the original name.
		const rows = parseRosterText(csv, new Set());
		const valid = rows.filter((r) => !r.error && !r.exists);
		expect(valid[0].name).toBe('Siti, S.Kom.');
	});

	it('preserves names containing double quotes through a round-trip', () => {
		const entries = [entry('2021001', 'Ahmad "Fauzi"')];
		const csv = buildRosterCsv(entries);
		const rows = parseRosterText(csv, new Set());
		const valid = rows.filter((r) => !r.error && !r.exists);
		expect(valid[0].name).toBe('Ahmad "Fauzi"');
	});

	it('preserves names with Indonesian diacritics', () => {
		const entries = [entry('2021001', 'Siti Nurainī')];
		const csv = buildRosterCsv(entries);
		const rows = parseRosterText(csv, new Set());
		const valid = rows.filter((r) => !r.error && !r.exists);
		expect(valid[0].name).toBe('Siti Nurainī');
	});
});

describe('CSV escaping primitives', () => {
	it('does not quote simple fields', () => {
		expect(escapeCsvField('Budi')).toBe('Budi');
		expect(escapeCsvField('2021001')).toBe('2021001');
	});

	it('quotes fields containing a comma', () => {
		expect(escapeCsvField('Siti, A.')).toBe('"Siti, A."');
	});

	it('doubles inner double quotes', () => {
		expect(escapeCsvField('Ahmad "Fauzi"')).toBe('"Ahmad ""Fauzi"""');
	});

	it('parseCsvLine splits a plain comma line', () => {
		expect(parseCsvLine('2021001,Budi Santoso')).toEqual([
			'2021001',
			'Budi Santoso',
		]);
	});

	it('parseCsvLine honors quoted fields with embedded commas', () => {
		expect(parseCsvLine('2021001,"Siti, A."')).toEqual([
			'2021001',
			'Siti, A.',
		]);
	});

	it('parseCsvLine unescapes doubled quotes', () => {
		expect(parseCsvLine('2021001,"Ahmad ""Fauzi"""')).toEqual([
			'2021001',
			'Ahmad "Fauzi"',
		]);
	});
});
