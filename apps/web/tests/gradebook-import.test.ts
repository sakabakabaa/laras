import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	LIMITS,
	detectFormat,
	parseCsv,
	parseImport,
	selectSubset,
	summarizeImport,
	parseImportAuto,
	parseImportXlsx,
	XLSX_LIMITS,
} from '@/lib/gradebook/import';

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

describe('parseCsv', () => {
	it('parses quoted fields with embedded commas and newlines', () => {
		const result = parseCsv('a,b\n"x,1","line1\nline2"\n2,3');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows).toEqual([['a', 'b'], ['x,1', 'line1\nline2'], ['2', '3']]);
	});

	it('unescapes doubled quotes inside quoted fields', () => {
		const result = parseCsv('v\n"he said ""hi"""');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[1]).toEqual(['he said "hi"']);
	});

	it('handles CRLF line endings', () => {
		const result = parseCsv('a,b\r\n1,2\r\n3,4\r\n');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
	});

	it('strips a UTF-8 BOM', () => {
		const result = parseCsv('\uFEFFa,b\n1,2');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0][0]).toBe('a');
	});

	it('returns a structured error for unterminated quotes instead of throwing', () => {
		const result = parseCsv('a,b\n"oops,2');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.code).toBe('malformed_csv');
	});
});

describe('detectFormat', () => {
	it('detects xlsx by ZIP magic bytes even without an extension', () => {
		expect(detectFormat('upload', bytes('PK\x03\x04-rest'))).toBe('xlsx');
	});

	it('detects csv by extension', () => {
		expect(detectFormat('roster.csv', bytes('a,b'))).toBe('csv');
		expect(detectFormat('roster.xlsx', bytes('a,b'))).toBe('xlsx');
		expect(detectFormat('roster', bytes('a,b'))).toBeNull();
	});
});

describe('parseImport — headers and rows', () => {
	it('maps Indonesian and English headers case-insensitively', () => {
		for (const header of ['NIM,nama,nilai,catatan', 'NRP,Name,Score,Note', 'Student ID,NAma,Nilai Mid,Catatan']) {
			const result = parseImport({ filename: 'g.csv', bytes: `${header}\n101,Andi,80,ok` });
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.columns.map((c) => c.kind)).toEqual(['nim', 'name', 'score', 'note']);
			expect(result.rows[0].nim).toBe('101');
			expect(result.rows[0].name).toBe('Andi');
		}
	});

	it('rejects files without a NIM column and files without a score column', () => {
		const noNim = parseImport({ filename: 'g.csv', bytes: 'nama,nilai\nAndi,80' });
		expect(noNim.ok).toBe(false);
		if (!noNim.ok) expect(noNim.code).toBe('missing_nim_column');

		const noScore = parseImport({ filename: 'g.csv', bytes: 'nim,nama\n101,Andi' });
		expect(noScore.ok).toBe(false);
		if (!noScore.ok) expect(noScore.code).toBe('missing_score_column');
	});

	it('refuses xlsx with a structured error, no dependency needed', () => {
		const result = parseImport({ filename: 'g.xlsx', bytes: 'nim,nilai\n101,80' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe('xlsx_not_supported');
	});
});

describe('parseImport — cells', () => {
	const csv = (body: string) => parseImport({ filename: 'g.csv', bytes: body });

	it('treats blank cells as no change, never zero', () => {
		const result = csv('nim,nilai\n101,');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].cells[0].parsed).toEqual({ state: 'blank' });
		expect(result.rows[0].cells[0].value).toBeUndefined();
	});

	it('treats a bare - and clear as explicit clear', () => {
		const result = csv('nim,nilai\n101,-\n102,clear');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].cells[0].parsed).toEqual({ state: 'clear' });
		expect(result.rows[1].cells[0].parsed).toEqual({ state: 'clear' });
	});

	it('rejects formula-like cells without evaluating them', () => {
		const result = csv('nim,nilai\n101,=SUM(A1:A2)\n102,@A1\n103,+A1\n104,-A1\n105,-5');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const rejected = result.rows.filter((r) =>
			r.issues.some((i) => i.code === 'formula_rejected'),
		);
		expect(rejected.map((r) => r.nim)).toEqual(['101', '102', '103', '104']);
		// A bare - is the clear token; -5 is a negative number, neither a formula.
		const lastRow = result.rows[4];
		expect(lastRow.nim).toBe('105');
		expect(lastRow.cells[0].parsed).toEqual({ state: 'value', value: -5 });
	});

	it('flags ambiguous decimal separators for review instead of accepting them', () => {
		// With '.' declared, "1.5,2" has the comma after the dot: ambiguous.
		const quoted = parseImport({ filename: 'g.csv', bytes: 'nim,nilai\n101,"1.5,2"' });
		expect(quoted.ok).toBe(true);
		if (!quoted.ok) return;
		expect(quoted.rows[0].issues.some((i) => i.code === 'ambiguous_score')).toBe(true);
	});

	it('honors decimal comma when declared', () => {
		const result = parseImport({ filename: 'g.csv', bytes: 'nim,nilai\n101,"27,5"', decimalSeparator: ',' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].cells[0].value).toBe(27.5);
	});
});

describe('parseImport — duplicates', () => {
	it('collapses identical duplicates with a visible count', () => {
		const result = parseImport({ filename: 'g.csv', bytes: 'nim,nilai\n101,80\n101,80\n101,80' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0].collapsedDuplicates).toBe(3);
		expect(result.rows[0].issues).toHaveLength(0);
	});

	it('blocks conflicting duplicates on both rows', () => {
		const result = parseImport({ filename: 'g.csv', bytes: 'nim,nilai\n101,80\n101,90' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows).toHaveLength(2);
		for (const row of result.rows) {
			expect(row.issues.some((i) => i.code === 'duplicate_conflict')).toBe(true);
		}
		const summary = summarizeImport(result);
		expect(summary.blocked).toBe(true);
	});
});

describe('parseImport — limits', () => {
	it('enforces the byte limit', () => {
		const big = 'x'.repeat(LIMITS.maxBytes + 1);
		const result = parseImport({ filename: 'g.csv', bytes: `nim,nilai\n101,${big}` });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('byte_limit');
			expect(result.limit).toBe('maxBytes');
		}
	});

	it('enforces the row limit', () => {
		const lines = ['nim,nilai'];
		for (let i = 0; i <= LIMITS.maxRows; i += 1) lines.push(`${i},80`);
		const result = parseImport({ filename: 'g.csv', bytes: lines.join('\n') });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('row_limit');
			expect(result.limit).toBe('maxRows');
		}
	});

	it('keeps provenance: raw record holds untouched input, lineNumber points into the file', () => {
		const result = parseImport({ filename: 'g.csv', bytes: 'nim,nilai\n101, 80 ' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].raw).toEqual({ nim: '101', nilai: ' 80 ' });
		expect(result.rows[0].lineNumber).toBe(2);
	});
});

describe('scale conversion', () => {
	it('converts with an explicit input scale and records the factor', () => {
		const result = parseImport({
			filename: 'g.csv',
			bytes: 'nim,nilai\n101,80',
			inputScale: 100,
			componentMax: 30,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const cell = result.rows[0].cells[0];
		expect(cell.value).toBe(24);
		expect(cell.scaleConversion).toEqual({ fromScale: 100, factor: 0.3 });
	});

	it('does not convert when no input scale is declared', () => {
		const result = parseImport({ filename: 'g.csv', bytes: 'nim,nilai\n101,80', componentMax: 30 });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].cells[0].value).toBe(80);
		expect(result.rows[0].cells[0].scaleConversion).toBeUndefined();
	});
});

describe('summarizeImport', () => {
	it('counts valid, invalid, unchanged rows and changed cells', () => {
		const result = parseImport({
			filename: 'g.csv',
			bytes: 'nim,nilai\n101,80\n102,\n103,bad\n,70',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const summary = summarizeImport(result);
		expect(summary.validRows).toBe(1);
		expect(summary.unchangedRows).toBe(1);
		expect(summary.invalidRows).toBe(2);
		expect(summary.changedCells).toBe(2); // 80 and the explicit 70
		expect(summary.blocked).toBe(true);
	});
});

describe('selectSubset', () => {
	const result = parseImport({
		filename: 'g.csv',
		bytes: 'nim,nilai\n101,80\n102,=SUM(A1:A2)\n103,90',
	});

	it('builds a revision from a chosen subset of valid rows', () => {
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// Line numbers count the header row: data rows are lines 2..4.
		const subset = selectSubset(result, [4]);
		expect(subset.ok).toBe(true);
		if (!subset.ok) return;
		expect(subset.rows.map((r) => r.nim)).toEqual(['103']);
	});

	it('refuses lines with blocking issues', () => {
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const subset = selectSubset(result, [3]);
		expect(subset.ok).toBe(false);
		if (!subset.ok) {
			expect(subset.code).toBe('blocked_line');
			expect(subset.lineNumbers).toEqual([3]);
		}
	});

	it('refuses unknown line numbers', () => {
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const subset = selectSubset(result, [99]);
		expect(subset.ok).toBe(false);
		if (!subset.ok) expect(subset.code).toBe('blocked_line');
	});
});

describe('adversarial grouping guard', () => {
	it('never silently strips an undeclared decimal separator ("87,5" under dot ≠ 875)', () => {
		const result = parseImport({ filename: 'g.csv', bytes: 'nim,nilai\n101,"87,5"' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].cells[0].value).toBeUndefined();
		expect(result.rows[0].issues.some((i) => i.code === 'ambiguous_score')).toBe(true);
	});

	it('still accepts an explicit thousands grouping that includes the declared separator', () => {
		const result = parseImport({ filename: 'g.csv', bytes: 'nim,nilai\n101,"1,234.5"' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].cells[0].value).toBe(1234.5);
	});
});

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

type CellSpec = string | number | { formula: string; cached?: string | number };

type SheetSpec = { name: string; rows: CellSpec[][] };

/** Build a minimal but valid OOXML workbook in memory (jszip, no fixtures). */
async function makeXlsx(
	sheets: SheetSpec[],
	options: {
		sharedStrings?: string[];
		/** Extra raw entries, e.g. a DTD or an external relationship. */
		extraEntries?: Record<string, string>;
		/** Replace a part's content after generation. */
		override?: Record<string, string>;
		/** Compression used when generating the archive (default STORE). */
		compression?: 'STORE' | 'DEFLATE';
	} = {},
): Promise<Uint8Array> {
	const JSZip = (await import('jszip')).default as any;
	const zip = new JSZip();
	const sheetXml: string[] = [];
	for (const sheet of sheets) {
		const rows = sheet.rows
			.map((row, r) => {
				const cells = row
					.map((cell, c) => {
						const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
						if (typeof cell === 'object' && cell !== null && 'formula' in cell) {
							const cached = cell.cached === undefined ? '' : `<v>${cell.cached}</v>`;
							return `<c r="${ref}"><f>${cell.formula}</f>${cached}</c>`;
						}
						if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
						return `<c r="${ref}" t="inlineStr"><is><t>${cell}</t></is></c>`;
					})
					.join('');
				return `<row r="${r + 1}">${cells}</row>`;
			})
			.join('');
		sheetXml.push(
			`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
		);
	}

	const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
		.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
		.join('')}</sheets></workbook>`;
	const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
		.map(
			(_s, i) =>
				`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
		)
		.join('')}</Relationships>`;

	zip.file('xl/workbook.xml', workbook);
	zip.file('xl/_rels/workbook.xml.rels', rels);
	sheetXml.forEach((xml, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, xml));
	if (options.sharedStrings) {
		const sst = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${options.sharedStrings
			.map((s) => `<si><t>${s}</t></si>`)
			.join('')}</sst>`;
		zip.file('xl/sharedStrings.xml', sst);
	}
	for (const [name, content] of Object.entries(options.extraEntries ?? {})) zip.file(name, content);
	for (const [name, content] of Object.entries(options.override ?? {})) zip.file(name, content);

	const out = await zip.generateAsync({
		type: 'uint8array',
		compression: options.compression ?? 'STORE',
	});
	return out;
}

describe('parseImportXlsx', () => {
	it('parses a basic workbook and preserves a leading-zero NIM', async () => {
		const file = await makeXlsx([
			{ name: 'Nilai', rows: [['NIM', 'Nama', 'Nilai'], ['00101', 'Andi', 80]] },
		]);
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.format).toBe('xlsx');
		expect(result.sheet).toBe('Nilai');
		expect(result.columns.map((c) => c.kind)).toEqual(['nim', 'name', 'score']);
		expect(result.rows[0].nim).toBe('00101');
		expect(result.rows[0].cells[0].value).toBe(80);
	});

	it('rejects formula cells even when a cached value is present', async () => {
		const file = await makeXlsx([
			{ name: 'Nilai', rows: [['NIM', 'Nilai'], ['101', { formula: 'SUM(A1:A2)', cached: 90 }]] },
		]);
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const cell = result.rows[0].cells[0];
		expect(cell.value).toBeUndefined();
		expect(cell.parsed.state).toBe('invalid');
		expect(result.rows[0].issues.some((i) => i.code === 'formula_rejected')).toBe(true);
		// Provenance keeps the formula text, never the cached result.
		expect(result.rows[0].raw['Nilai']).toBe('=SUM(A1:A2)');
	});

	it('resolves shared strings', async () => {
		const JSZip = (await import('jszip')).default as any;
		const zip = new JSZip();
		zip.file(
			'xl/workbook.xml',
			'<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
		);
		zip.file(
			'xl/_rels/workbook.xml.rels',
			'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
		);
		zip.file(
			'xl/worksheets/sheet1.xml',
			'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>',
		);
		zip.file('xl/sharedStrings.xml', '<sst><si><t>NIM</t></si><si><t>Nilai</t></si><si><t>007</t></si><si><t>85</t></si></sst>');
		const bytes = await zip.generateAsync({ type: 'uint8array' });

		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].nim).toBe('007');
		expect(result.rows[0].cells[0].value).toBe(85);
	});

	it('returns a structured error for a non-ZIP payload and for a broken package', async () => {
		const notZip = await parseImportXlsx({ filename: 'g.xlsx', bytes: bytes('nim,nilai\n101,80') });
		expect(notZip.ok).toBe(false);
		if (!notZip.ok) expect(notZip.code).toBe('malformed_xlsx');

		const JSZip = (await import('jszip')).default as any;
		const zip = new JSZip();
		zip.file('xl/worksheets/sheet1.xml', '<worksheet/>');
		const broken = await zip.generateAsync({ type: 'uint8array' });
		const missingParts = await parseImportXlsx({ filename: 'g.xlsx', bytes: broken });
		expect(missingParts.ok).toBe(false);
		if (!missingParts.ok) expect(missingParts.code).toBe('malformed_xlsx');
	});

	it('rejects DTD/entity declarations and external relationships', async () => {
		const withDtd = await makeXlsx([{ name: 'S', rows: [['NIM', 'Nilai'], ['101', 80]] }], {
			override: {
				'xl/workbook.xml':
					'<!DOCTYPE x [<!ENTITY a "b">]><workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
			},
		});
		const dtdResult = await parseImportXlsx({ filename: 'g.xlsx', bytes: withDtd });
		expect(dtdResult.ok).toBe(false);
		if (!dtdResult.ok) expect(dtdResult.code).toBe('unsafe_xlsx');

		const withExternal = await makeXlsx([{ name: 'S', rows: [['NIM', 'Nilai'], ['101', 80]] }], {
			override: {
				'xl/_rels/workbook.xml.rels':
					'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="http://evil.test/sheet.xml" TargetMode="External"/></Relationships>',
			},
		});
		const externalResult = await parseImportXlsx({ filename: 'g.xlsx', bytes: withExternal });
		expect(externalResult.ok).toBe(false);
		if (!externalResult.ok) expect(externalResult.code).toBe('unsafe_xlsx');
	});

	it('refuses to guess between multiple importable sheets, and honors an explicit choice', async () => {
		const file = await makeXlsx([
			{ name: 'Kelas A', rows: [['NIM', 'Nilai'], ['101', 80]] },
			{ name: 'Kelas B', rows: [['NIM', 'Nilai'], ['102', 70]] },
		]);
		const ambiguous = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(ambiguous.ok).toBe(false);
		if (!ambiguous.ok) {
			expect(ambiguous.code).toBe('ambiguous_sheet');
			expect(ambiguous.sheets).toEqual(['Kelas A', 'Kelas B']);
		}

		const byName = await parseImportXlsx({ filename: 'g.xlsx', bytes: file, sheet: 'Kelas B' });
		expect(byName.ok).toBe(true);
		if (!byName.ok) return;
		expect(byName.sheet).toBe('Kelas B');
		expect(byName.rows[0].nim).toBe('102');

		const byIndex = await parseImportXlsx({ filename: 'g.xlsx', bytes: file, sheet: 0 });
		expect(byIndex.ok).toBe(true);
		if (!byIndex.ok) return;
		expect(byIndex.rows[0].nim).toBe('101');

		const unknown = await parseImportXlsx({ filename: 'g.xlsx', bytes: file, sheet: 'Nope' });
		expect(unknown.ok).toBe(false);
		if (!unknown.ok) {
			expect(unknown.code).toBe('unknown_sheet');
			expect(unknown.sheets).toEqual(['Kelas A', 'Kelas B']);
		}
	});

	it('picks the single sheet with an importable header when others are cover pages', async () => {
		const file = await makeXlsx([
			{ name: 'Petunjuk', rows: [['Cara mengisi'], ['Isi NIM dan nilai']] },
			{ name: 'Nilai', rows: [['NIM', 'Nilai'], ['101', 80]] },
		]);
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.sheet).toBe('Nilai');
	});

	it('reuses CSV normalization: blank cell is no change, duplicates collapse', async () => {
		const file = await makeXlsx([
			{
				name: 'S',
				rows: [
					['NIM', 'Nilai'],
					['101', ''],
					['102', 70],
					['102', 70],
				],
			},
		]);
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].cells[0].parsed).toEqual({ state: 'blank' });
		expect(result.rows[1].collapsedDuplicates).toBe(2);
	});

	it('applies scale conversion with the recorded factor', async () => {
		const file = await makeXlsx([{ name: 'S', rows: [['NIM', 'Nilai'], ['101', 80]] }]);
		const result = await parseImportXlsx({
			filename: 'g.xlsx',
			bytes: file,
			inputScale: 100,
			componentMax: 30,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].cells[0].value).toBe(24);
		expect(result.rows[0].cells[0].scaleConversion).toEqual({ fromScale: 100, factor: 0.3 });
	});
});

describe('parseImportXlsx — archive bounds', () => {
	it('rejects too many ZIP entries', async () => {
		const JSZip = (await import('jszip')).default as any;
		const zip = new JSZip();
		for (let i = 0; i <= XLSX_LIMITS.maxEntries; i += 1) zip.file(`junk/${i}.txt`, 'x');
		const bytes = await zip.generateAsync({ type: 'uint8array' });
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('entry_limit');
			expect(result.limit).toBe('maxEntries');
		}
	});

	it('rejects an archive that expands past the byte budget (ZIP bomb)', async () => {
		// DEFLATE keeps the archive tiny while the entry expands past the budget.
		const file = await makeXlsx([{ name: 'S', rows: [['NIM', 'Nilai'], ['101', 80]] }], {
			extraEntries: { 'xl/bomb.xml': 'x'.repeat(XLSX_LIMITS.maxExpandedBytes + 1) },
			compression: 'DEFLATE',
		});
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('expanded_limit');
			expect(result.limit).toBe('maxExpandedBytes');
		}
	});

	it('rejects too many sheets', async () => {
		const sheets = [];
		for (let i = 0; i <= XLSX_LIMITS.maxSheets; i += 1) {
			sheets.push({ name: `S${i}`, rows: [['NIM', 'Nilai'], ['101', 80]] });
		}
		const file = await makeXlsx(sheets);
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('sheet_limit');
			expect(result.limit).toBe('maxSheets');
		}
	});

	it('rejects too many cells in one sheet', async () => {
		const manyCells = '<c/>'.repeat(XLSX_LIMITS.maxCells + 1);
		const file = await makeXlsx([{ name: 'S', rows: [['NIM', 'Nilai'], ['101', 80]] }], {
			override: {
				'xl/worksheets/sheet1.xml': `<worksheet><sheetData><row r="1">${manyCells}</row></sheetData></worksheet>`,
			},
		});
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('cell_limit');
			expect(result.limit).toBe('maxCells');
		}
	});

	it('enforces the row limit through the shared normalizer', async () => {
		const rows: CellSpec[][] = [['NIM', 'Nilai']];
		for (let i = 0; i <= LIMITS.maxRows; i += 1) rows.push([String(i), 80]);
		const file = await makeXlsx([{ name: 'S', rows }]);
		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes: file });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe('row_limit');
	});

	it('enforces the upload byte limit before inflating', async () => {
		const result = await parseImportXlsx({
			filename: 'g.xlsx',
			bytes: new Uint8Array(LIMITS.maxBytes + 1),
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('byte_limit');
			expect(result.limit).toBe('maxBytes');
		}
	});
});

describe('parseImportAuto', () => {
	it('routes CSV and XLSX by detected format', async () => {
		const csv = await parseImportAuto({ filename: 'g.csv', bytes: 'nim,nilai\n101,80' });
		expect(csv.ok).toBe(true);
		if (csv.ok) expect(csv.format).toBe('csv');

		const file = await makeXlsx([{ name: 'S', rows: [['NIM', 'Nilai'], ['101', 80]] }]);
		const xlsx = await parseImportAuto({ filename: 'g.xlsx', bytes: file });
		expect(xlsx.ok).toBe(true);
		if (xlsx.ok) expect(xlsx.format).toBe('xlsx');
	});
});

describe('parseImportXlsx — provenance', () => {
	it('reports the worksheet row number, not a positional index, when rows are sparse', async () => {
		const JSZip = (await import('jszip')).default as any;
		const zip = new JSZip();
		zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>');
		zip.file(
			'xl/_rels/workbook.xml.rels',
			'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
		);
		// Row 7 holds the header; row 42 holds the only data row.
		zip.file(
			'xl/worksheets/sheet1.xml',
			'<worksheet><sheetData>' +
				'<row r="7"><c r="A7" t="inlineStr"><is><t>NIM</t></is></c><c r="B7" t="inlineStr"><is><t>Nilai</t></is></c></row>' +
				'<row r="42"><c r="A42" t="inlineStr"><is><t>101</t></is></c><c r="B42"><v>80</v></c></row>' +
				'</sheetData></worksheet>',
		);
		const bytes = await zip.generateAsync({ type: 'uint8array' });

		const result = await parseImportXlsx({ filename: 'g.xlsx', bytes });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rows[0].lineNumber).toBe(42);
	});
});

// ---------------------------------------------------------------------------
// import.server.ts — artifact authorization
// ---------------------------------------------------------------------------

const adapterState = vi.hoisted(() => ({
	authOk: true,
	record: null as any,
	fileBytes: null as Uint8Array | null,
	fileFails: false,
}));

vi.mock('@/lib/berkas-versions.server', () => ({
	authenticateFaculty: async () =>
		adapterState.authOk
			? { user: { id: 'faculty1' } }
			: { error: { status: 401, message: 'Masuk sebagai dosen untuk tindakan ini.' } },
	fetchStoredFile: async () => {
		if (adapterState.fileFails) throw new Error('boom');
		return Buffer.from(adapterState.fileBytes ?? new Uint8Array());
	},
}));

vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: async (_collection: string, id: string) => {
			if (!adapterState.record) throw new Error('404');
			return adapterState.record.id === id ? adapterState.record : Promise.reject(new Error('404'));
		},
	},
}));

const { loadImportArtifact } = await import('@/lib/gradebook/import.server');

const request = () => new Request('https://app.test/api/import', { method: 'POST' });
const csvBytes = (text: string) => new TextEncoder().encode(text);

describe('loadImportArtifact', () => {
	beforeEach(() => {
		adapterState.authOk = true;
		adapterState.fileFails = false;
		adapterState.record = { id: 'file1', owner: 'faculty1', course: ['course1'], file: 'nilai.csv' };
		adapterState.fileBytes = csvBytes('nim,nilai\n101,80');
	});

	it('denies a non-faculty caller before touching any record', async () => {
		adapterState.authOk = false;
		const out = await loadImportArtifact({ request: request(), resourceId: 'file1', courseId: 'course1' });
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.status).toBe(401);
	});

	it('denies an artifact owned by another lecturer (indistinguishable from missing)', async () => {
		adapterState.record = { id: 'file1', owner: 'someone-else', course: ['course1'], file: 'nilai.csv' };
		const out = await loadImportArtifact({ request: request(), resourceId: 'file1', courseId: 'course1' });
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.status).toBe(404);
	});

	it('denies a missing artifact', async () => {
		adapterState.record = null;
		const out = await loadImportArtifact({ request: request(), resourceId: 'file1', courseId: 'course1' });
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.status).toBe(404);
	});

	it('denies an artifact not linked to the target course', async () => {
		adapterState.record = { id: 'file1', owner: 'faculty1', course: ['course2'], file: 'nilai.csv' };
		const out = await loadImportArtifact({ request: request(), resourceId: 'file1', courseId: 'course1' });
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.status).toBe(403);
	});

	it('reports an unreadable stored file instead of throwing', async () => {
		adapterState.fileFails = true;
		const out = await loadImportArtifact({ request: request(), resourceId: 'file1', courseId: 'course1' });
		expect(out.ok).toBe(false);
		if (!out.ok) expect(out.status).toBe(502);
	});

	it('parses an authorized artifact and returns the reviewable result', async () => {
		const out = await loadImportArtifact({ request: request(), resourceId: 'file1', courseId: 'course1' });
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(out.userId).toBe('faculty1');
		expect(out.result.ok).toBe(true);
		if (!out.result.ok) return;
		expect(out.result.rows[0].nim).toBe('101');
	});

	it('returns a structured parse failure rather than a thrown error', async () => {
		adapterState.fileBytes = csvBytes('nama,nilai\nAndi,80');
		const out = await loadImportArtifact({ request: request(), resourceId: 'file1', courseId: 'course1' });
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(out.result.ok).toBe(false);
		if (out.result.ok) return;
		expect(out.result.code).toBe('missing_nim_column');
	});
});

describe('CSV line provenance', () => {
	it('counts physical lines, so a multi-line quoted field does not shift later rows', () => {
		const result = parseImport({
			filename: 'g.csv',
			bytes: 'nim,nama,nilai\n101,"Andi\nBudi",80\n102,Citra,70',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// Row 1 starts on line 2; row 2 starts on line 4 (the quoted field spans 2-3).
		expect(result.rows.map((r) => r.lineNumber)).toEqual([2, 4]);
		expect(result.rows[1].nim).toBe('102');
	});
});
