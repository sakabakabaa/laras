/**
 * Gradebook CSV/XLSX import parsing — bounded and total.
 *
 * No database access, no framework, no network, no filesystem: the caller
 * supplies bytes and receives a result object. Nothing throws on bad input;
 * every failure is a structured error a reviewer UI can render.
 *
 * CSV parses synchronously; XLSX is a ZIP package and parses asynchronously
 * through `parseImportXlsx` (jszip, already a direct dependency). Both feed the
 * same `normalizeRows` path, so a grade rule cannot differ between formats.
 *
 * Design notes that are easy to get wrong:
 *
 *  - A blank cell is "no change", never zero. Only an explicit clear token
 *    clears a score (see `validation.ts`).
 *  - Formula-like cells are REJECTED, never evaluated. A spreadsheet that
 *    exported `=SUM(A1:A2)` must not reach the review preview as a value.
 *    Ordering matters: a bare `-` is the clear token from `parseScoreInput`,
 *    so the formula check must only fire for `-` followed by a letter, after
 *    the clear-token meaning is reserved for the exact bare token.
 *  - Scales are never silently rescaled. A conversion only happens when the
 *    lecturer explicitly declares `inputScale`, and its factor is recorded on
 *    the cell so the UI can show what was done.
 *  - Duplicate NIMs: identical duplicates collapse with a visible count;
 *    conflicting duplicates block both rows.
 *
 * XLSX reads the raw sheet XML instead of using a spreadsheet library: a
 * library returns cached formula RESULTS, which would launder `=SUM(A1:A2)`
 * into a grade. Reading the parts directly lets a formula cell be rejected on
 * sight. The archive is also bounded independently of the upload size, because
 * a ZIP bomb expands far beyond its compressed bytes.
 */

import {
	convertScale,
	needsScaleConversion,
	parseScoreInput,
	type ParsedInput,
} from './validation';

/** Configurable resource limits (plan: 5 MB, 2,000 input rows, 200 changed cells). */
export const LIMITS = {
	maxBytes: 5 * 1024 * 1024,
	maxRows: 2000,
	maxChangedCells: 200,
} as const;

/**
 * Bounds for XLSX (a ZIP container). The compressed upload is already capped by
 * `LIMITS.maxBytes`, but a ZIP bomb expands far beyond its archive size, so the
 * expanded side needs its own independent budget: total decompressed bytes,
 * entry count, sheet count and cell count.
 */
export const XLSX_LIMITS = {
	/** Maximum ZIP entries in the package. */
	maxEntries: 256,
	/** Maximum total decompressed bytes across the entries we read. */
	maxExpandedBytes: 32 * 1024 * 1024,
	/** Maximum sheets considered (only the selected one is parsed). */
	maxSheets: 64,
	/** Maximum cells read from the selected sheet, including empty ones. */
	maxCells: 100_000,
} as const;

export type ImportFormat = 'csv' | 'xlsx';

/** Column classification from case-insensitive header matching. */
export type ColumnKind = 'nim' | 'name' | 'score' | 'note' | 'unknown';

export type ColumnMap = {
	column: number;
	kind: ColumnKind;
	/** The original header text, verbatim, for provenance display. */
	header: string;
};

export type ImportIssue = {
	code:
		| 'missing_nim'
		| 'formula_rejected'
		| 'invalid_score'
		| 'duplicate_conflict'
		| 'ambiguous_score'
		| 'note_too_long';
	message: string;
	column?: number;
};

export type ScaleConversion = {
	fromScale: number;
	factor: number;
};

export type ParsedCell = {
	column: number;
	header: string;
	/** The untouched parse result from `validation.parseScoreInput`. */
	parsed: ParsedInput;
	/** Only present when the cell resolves to a concrete score change. */
	value?: number;
	/** Only present when an explicit scale conversion was applied. */
	scaleConversion?: ScaleConversion;
};

export type ParsedRow = {
	/** 1-based line in the source file (header row included in the count). */
	lineNumber: number;
	/** Untouched input for row provenance, keyed by header text. */
	raw: Record<string, string>;
	nim: string;
	name: string;
	cells: ParsedCell[];
	issues: ImportIssue[];
	/** Number of identical duplicate rows collapsed into this row. */
	collapsedDuplicates?: number;
};

/** Structured error — never an exception. */
export type ImportError = {
	ok: false;
	code:
		| 'malformed_csv'
		| 'malformed_xlsx'
		| 'unsafe_xlsx'
		| 'xlsx_not_supported'
		| 'unsupported_format'
		| 'byte_limit'
		| 'row_limit'
		| 'entry_limit'
		| 'expanded_limit'
		| 'sheet_limit'
		| 'cell_limit'
		| 'ambiguous_sheet'
		| 'unknown_sheet'
		| 'missing_nim_column'
		| 'missing_score_column'
		| 'blocked_line'
		| 'unknown_line';
	message: string;
	/** Which limit was breached, when the error is a limit. */
	limit?: 'maxBytes' | 'maxRows' | 'maxChangedCells' | 'maxEntries' | 'maxExpandedBytes' | 'maxSheets' | 'maxCells';
	/** Offending values where they help the reviewer. */
	lineNumbers?: number[];
	/** Sheet names, when the error is about sheet selection. */
	sheets?: string[];
};

export type ImportSuccess = {
	ok: true;
	format: ImportFormat;
	columns: ColumnMap[];
	rows: ParsedRow[];
	/** Total rows accepted after collapsing duplicates. */
	totalRows: number;
	/** Sheet the rows came from, for XLSX provenance. */
	sheet?: string;
};

export type ImportResult = ImportSuccess | ImportError;

/** A subset chosen by the lecturer: a new reviewable revision. */
export type SelectSubsetResult = ImportResult;

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // ZIP local file header ("PK\x03\x04")

/**
 * Detect the import format from the extension and content sniffing. XLSX is a
 * ZIP container, so the magic bytes are reliable even when the extension lies.
 * Returns `null` when neither CSV nor XLSX is recognized.
 */
export function detectFormat(filename: string, bytes: Uint8Array | string): ImportFormat | null {
	const lower = (filename ?? '').toLowerCase();
	const bytesView = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
	const zipLike =
		bytesView.length >= 4 && XLSX_MAGIC.every((b, i) => bytesView[i] === b);
	if (zipLike || lower.endsWith('.xlsx')) return 'xlsx';
	if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
	// No recognizable extension: treat any non-ZIP text upload as CSV only if
	// the caller explicitly passes a .csv/.txt name; otherwise unknown.
	return null;
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC4180-ish)
// ---------------------------------------------------------------------------

export type CsvResult =
	/**
	 * `lines[i]` is the 1-based physical line where `rows[i]` starts. A quoted
	 * field may contain newlines, so a row's index is NOT its line number.
	 */
	| { ok: true; rows: string[][]; lines: number[] }
	| { ok: false; code: 'malformed_csv'; message: string };

/**
 * Parse CSV text. Handles quoted fields, escaped `""` quotes, embedded
 * commas/newlines inside quotes, CRLF and LF line endings, and a UTF-8 BOM.
 * Unterminated quotes or a quote appearing mid-field without field-opening
 * position are structured errors, not throws.
 */
export function parseCsv(text: string): CsvResult {
	// Strip a UTF-8 BOM if present.
	const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	const rows: string[][] = [];
	const lines: number[] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;
	let fieldStarted = false; // seen any char of the current field, incl. quotes
	// Physical line tracking: newlines inside quoted fields advance the line
	// counter too, so provenance points at the real file line.
	let currentLine = 1;
	let rowStartLine = 1;

	const endField = () => {
		row.push(field);
		field = '';
		fieldStarted = false;
	};
	const endRow = () => {
		endField();
		rows.push(row);
		lines.push(rowStartLine);
		row = [];
		rowStartLine = currentLine;
	};

	while (i < body.length) {
		const ch = body[i];
		if (inQuotes) {
			if (ch === '"') {
				if (body[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i += 1;
				continue;
			}
			if (ch === '\n' || ch === '\r') {
				if (ch === '\r' && body[i + 1] === '\n') i += 1;
				currentLine += 1;
			}
			field += ch;
			i += 1;
			continue;
		}
		if (ch === '"') {
			if (!fieldStarted) {
				inQuotes = true;
				fieldStarted = true;
				i += 1;
				continue;
			}
			// A quote inside an unquoted (or already-closed) field is malformed.
			return {
				ok: false,
				code: 'malformed_csv',
				message: 'Kutipan CSV tidak valid pada kolom yang sudah dimulai.',
			};
		}
		if (ch === ',') {
			endField();
			i += 1;
			continue;
		}
		if (ch === '\r' || ch === '\n') {
			// CRLF counts as one line break.
			if (ch === '\r' && body[i + 1] === '\n') i += 1;
			currentLine += 1;
			endRow();
			i += 1;
			continue;
		}
		field += ch;
		fieldStarted = true;
		i += 1;
	}

	if (inQuotes) {
		return {
			ok: false,
			code: 'malformed_csv',
			message: 'Kutipan CSV tidak ditutup; periksa file impor.',
		};
	}
	// A trailing line break already ended the last row; only flush a partial one.
	if (field !== '' || row.length > 0) endRow();
	return { ok: true, rows, lines };
}

// ---------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Array<{ kind: ColumnKind; match: (h: string) => boolean }> = [
	{ kind: 'nim', match: (h) => ['nim', 'nrp', 'student id', 'studentid'].includes(h) },
	{ kind: 'name', match: (h) => ['nama', 'name'].includes(h) },
	{ kind: 'score', match: (h) => ['nilai', 'score'].includes(h) || h.startsWith('nilai ') || h.startsWith('score ') },
	{ kind: 'note', match: (h) => ['catatan', 'note'].includes(h) || h.startsWith('catatan ') || h.startsWith('note ') },
];

function mapColumns(headerRow: string[]): ColumnMap[] {
	return headerRow.map((header, column) => {
		const h = header.trim().toLowerCase();
		for (const alias of HEADER_ALIASES) {
			if (alias.match(h)) return { column, kind: alias.kind, header };
		}
		return { column, kind: 'unknown', header };
	});
}

// ---------------------------------------------------------------------------
// Formula rejection
// ---------------------------------------------------------------------------

/**
 * Adversarial grouping guard. `parseScoreInput` strips the "other" separator
 * as a thousands grouping, which silently corrupts a mistyped decimal: under a
 * declared "." format, "87,5" would become 875, not 87.5. When a cell contains
 * ONLY the non-declared separator (no declared decimal separator at all), the
 * grouping interpretation is a guess — flag it for review instead of
 * accepting either reading. Cells that contain the declared separator keep
 * validation.ts's explicit last-separator ordering rule.
 */
function hasUnguardedOtherSeparator(cell: string, decimalSeparator: '.' | ','): boolean {
	const text = cell.trim();
	const other = decimalSeparator === '.' ? ',' : '.';
	return text.includes(other) && !text.includes(decimalSeparator);
}

/**
 * Formula-like cell detection. Order matters and is deliberate:
 *  - A bare `-` is the clear token from `parseScoreInput`, so it must NOT be
 *    treated as a formula. Only `-` (or `+`) immediately followed by a letter
 *    or `@` looks like a formula (e.g. `-A1`, `+SUM(...)`).
 *  - Leading `=` or `@` is always formula-like.
 * The caller must run this BEFORE `parseScoreInput` so that an unparseable
 * formula never falls through into "invalid number" noise.
 */
function isFormulaLike(cell: string): boolean {
	const text = cell.trim();
	if (text === '') return false;
	if (text.startsWith('=') || text.startsWith('@')) return true;
	if ((text.startsWith('-') || text.startsWith('+')) && /[A-Za-z@]/.test(text[1] ?? '')) {
		return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

function byteLength(bytes: Uint8Array | string): number {
	return typeof bytes === 'string' ? new TextEncoder().encode(bytes).length : bytes.length;
}

function rawRecord(headerRow: string[], values: string[]): Record<string, string> {
	const raw: Record<string, string> = {};
	headerRow.forEach((header, index) => {
		raw[header] = values[index] ?? '';
	});
	return raw;
}

function rowsIdentical(a: ParsedRow, b: ParsedRow): boolean {
	return JSON.stringify({ raw: a.raw, cells: a.cells }) === JSON.stringify({ raw: b.raw, cells: b.cells });
}

/** Count the cells that represent an actual change (a value or a clear). */
function countChangedCells(row: ParsedRow): number {
	return row.cells.filter((c) => c.parsed.state === 'value' || c.parsed.state === 'clear').length;
}

// ---------------------------------------------------------------------------
// parseImport
// ---------------------------------------------------------------------------

export type ParseImportInput = {
	filename: string;
	bytes: Uint8Array | string;
	/** Declared decimal separator in the file; default '.'. */
	decimalSeparator?: '.' | ',';
	/** Scale the lecturer declares the file is written in (e.g. 100). */
	inputScale?: number;
	/** Component maximum to convert into. Required for conversion to happen. */
	componentMax?: number;
	/** XLSX only: explicit sheet selection by name or 0-based index. */
	sheet?: string | number;
};

type NormalizeInput = {
	headerRow: string[];
	dataRows: string[][];
	/** 1-based source line (CSV line, or worksheet row number for XLSX). */
	lineNumbers: number[];
	decimalSeparator: '.' | ',';
	inputScale?: number;
	componentMax?: number;
};

/**
 * The single row-normalization path shared by CSV and XLSX.
 *
 * Both readers only differ in how they produce a header row and a list of
 * string cells; every grade rule (blank ≠ zero, clear token, formula
 * rejection, separator guard, scale conversion, duplicate collapsing) lives
 * here so the two formats cannot drift apart.
 */
function normalizeRows(
	input: NormalizeInput,
): { ok: true; columns: ColumnMap[]; rows: ParsedRow[] } | ImportError {
	const { headerRow, dataRows, lineNumbers, decimalSeparator } = input;

	if (dataRows.length > LIMITS.maxRows) {
		return {
			ok: false,
			code: 'row_limit',
			message: `Terlalu banyak baris (${dataRows.length}). Maksimal ${LIMITS.maxRows} baris data.`,
			limit: 'maxRows',
		};
	}

	const columns = mapColumns(headerRow);
	const nimColumn = columns.find((c) => c.kind === 'nim');
	const scoreColumns = columns.filter((c) => c.kind === 'score');
	if (!nimColumn) {
		return {
			ok: false,
			code: 'missing_nim_column',
			message: 'Kolom NIM tidak ditemukan. Gunakan judul kolom "NIM", "NRP", atau "Student ID".',
		};
	}
	if (scoreColumns.length === 0) {
		return {
			ok: false,
			code: 'missing_score_column',
			message: 'Kolom nilai tidak ditemukan. Gunakan judul kolom "Nilai" atau "Score".',
		};
	}

	const convertScaleValues =
		typeof input.inputScale === 'number' &&
		typeof input.componentMax === 'number' &&
		needsScaleConversion(input.inputScale, input.componentMax);
	const nameColumn = columns.find((c) => c.kind === 'name');

	const rows: ParsedRow[] = [];
	for (let i = 0; i < dataRows.length; i += 1) {
		const values = dataRows[i];
		const lineNumber = lineNumbers[i];
		const raw = rawRecord(headerRow, values);
		const nim = (values[nimColumn.column] ?? '').trim();
		const name = (values[nameColumn?.column ?? -1] ?? '').trim();

		const cells: ParsedCell[] = [];
		const issues: ImportIssue[] = [];

		if (nim === '') {
			issues.push({ code: 'missing_nim', message: 'Baris ini tidak memiliki NIM.' });
		}

		for (const col of scoreColumns) {
			const cellText = values[col.column] ?? '';
			if (isFormulaLike(cellText)) {
				// Rejected, never evaluated. Checked before parseScoreInput so a
				// formula cannot be mistaken for an invalid number.
				issues.push({
					code: 'formula_rejected',
					message: `Sel "${cellText.trim()}" terlihat seperti rumus dan ditolak, tidak dievaluasi.`,
					column: col.column,
				});
				cells.push({ column: col.column, header: col.header, parsed: { state: 'invalid', reason: 'Rumus ditolak.' } });
				continue;
			}
			if (hasUnguardedOtherSeparator(cellText, decimalSeparator)) {
				issues.push({
					code: 'ambiguous_score',
					message: `Sel "${cellText.trim()}" menggunakan pemisah yang bukan format impor ("${decimalSeparator}"); periksa nilai ini, tidak diterima otomatis.`,
					column: col.column,
				});
				cells.push({
					column: col.column,
					header: col.header,
					parsed: { state: 'ambiguous', reason: 'Pemisah desimal tidak sesuai format impor.' },
				});
				continue;
			}
			const parsed = parseScoreInput(cellText, decimalSeparator);
			const cell: ParsedCell = { column: col.column, header: col.header, parsed };
			if (parsed.state === 'value') {
				if (convertScaleValues) {
					const converted = convertScale(parsed.value, input.inputScale as number, input.componentMax as number);
					cell.value = converted.value;
					cell.scaleConversion = { fromScale: input.inputScale as number, factor: converted.factor };
				} else {
					cell.value = parsed.value;
				}
			} else if (parsed.state === 'ambiguous') {
				// Flagged for review, never silently accepted.
				issues.push({
					code: 'ambiguous_score',
					message: parsed.reason,
					column: col.column,
				});
			} else if (parsed.state === 'invalid') {
				issues.push({
					code: 'invalid_score',
					message: `Nilai "${cellText.trim()}" pada kolom ${col.header} tidak valid.`,
					column: col.column,
				});
			}
			cells.push(cell);
		}

		rows.push({ lineNumber, raw, nim, name, cells, issues });
	}

	// Duplicate NIM handling: identical duplicates collapse with a count;
	// conflicting duplicates block every row in the group.
	const byNim = new Map<string, ParsedRow[]>();
	for (const row of rows) {
		if (row.nim === '') continue;
		const group = byNim.get(row.nim) ?? [];
		group.push(row);
		byNim.set(row.nim, group);
	}
	const collapsedRows: ParsedRow[] = [];
	for (const row of rows) {
		if (row.nim === '') {
			collapsedRows.push(row);
			continue;
		}
		const group = byNim.get(row.nim) ?? [];
		if (group.length < 2) {
			collapsedRows.push(row);
			continue;
		}
		const identical = group.every((other) => rowsIdentical(row, other));
		if (identical) {
			// Collapse: keep the first occurrence, count the rest on it.
			if (group[0] === row) {
				row.collapsedDuplicates = group.length;
				collapsedRows.push(row);
			}
			continue;
		}
		row.issues.push({
			code: 'duplicate_conflict',
			message: `NIM ${row.nim} muncul dengan nilai berbeda di beberapa baris.`,
		});
		collapsedRows.push(row);
	}

	return { ok: true, columns, rows: collapsedRows };
}

/**
 * Strip fully blank rows while keeping each row's own line number: a CSV row
 * may span several physical lines, and a worksheet row number may skip.
 */
function dropBlankRows(
	rows: string[][],
	lines: number[],
): { rows: string[][]; lineNumbers: number[] } {
	const kept: string[][] = [];
	const lineNumbers: number[] = [];
	rows.forEach((row, index) => {
		if (row.some((cell) => cell.trim() !== '')) {
			kept.push(row);
			lineNumbers.push(lines[index] ?? index + 1);
		}
	});
	return { rows: kept, lineNumbers };
}

/**
 * Parse CSV text into reviewable rows. Synchronous; use `parseImportAuto` when
 * the format is not known ahead of time (XLSX needs an async reader).
 */
export function parseImport(input: ParseImportInput): ImportResult {
	const format = detectFormat(input.filename, input.bytes);
	if (format === 'xlsx') {
		// XLSX is a ZIP package and must be inflated asynchronously.
		return {
			ok: false,
			code: 'xlsx_not_supported',
			message: 'File XLSX harus diproses melalui parseImportXlsx (async).',
		};
	}
	if (format === null) {
		return {
			ok: false,
			code: 'unsupported_format',
			message: 'Format file tidak dikenali. Gunakan file CSV atau XLSX.',
		};
	}

	const size = byteLength(input.bytes);
	if (size > LIMITS.maxBytes) {
		return {
			ok: false,
			code: 'byte_limit',
			message: `File terlalu besar (${size} byte). Maksimal ${LIMITS.maxBytes} byte.`,
			limit: 'maxBytes',
		};
	}

	const text = typeof input.bytes === 'string' ? input.bytes : new TextDecoder('utf-8').decode(input.bytes);
	const csv = parseCsv(text);
	if (!csv.ok) return csv;

	const { rows: nonEmpty, lineNumbers } = dropBlankRows(csv.rows, csv.lines);
	if (nonEmpty.length < 1) {
		return {
			ok: false,
			code: 'missing_nim_column',
			message: 'File kosong atau tidak memiliki baris judul.',
		};
	}

	const normalized = normalizeRows({
		headerRow: nonEmpty[0],
		dataRows: nonEmpty.slice(1),
		lineNumbers: lineNumbers.slice(1),
		decimalSeparator: input.decimalSeparator ?? '.',
		inputScale: input.inputScale,
		componentMax: input.componentMax,
	});
	if (!normalized.ok) return normalized;

	return {
		ok: true,
		format: 'csv',
		columns: normalized.columns,
		rows: normalized.rows,
		totalRows: normalized.rows.length,
	};
}

// ---------------------------------------------------------------------------
// XLSX parsing (ZIP + XML via jszip, an existing direct dependency)
// ---------------------------------------------------------------------------
//
// No new dependency: .xlsx is a ZIP of OOXML parts, and jszip is already
// installed and used for this in `office-text.server.ts`. We read the raw
// sheet XML ourselves rather than through a spreadsheet library because the
// plan requires rejecting formulas instead of evaluating them — a library that
// returns cached values would silently launder `=SUM(...)` into a grade.
//
// jszip's package.json `main` ("./lib/index") has no file extension, which
// crashes the repo's ESLint import resolver at rule-load time, so the specifier
// is kept non-literal exactly as `office-text.server.ts` does.

const JSZIP_SPEC = 'jszip';

type ZipEntry = {
	async: (type: 'string') => Promise<string>;
	dir?: boolean;
	/** jszip exposes the declared uncompressed size before inflating. */
	_data?: { uncompressedSize?: number };
};
type ZipInstance = {
	file: (name: string) => ZipEntry | null;
	files: Record<string, ZipEntry>;
};
type ZipConstructor = {
	loadAsync: (data: Uint8Array) => Promise<ZipInstance>;
};

let jszipPromise: Promise<ZipConstructor> | null = null;
const loadJszip = (): Promise<ZipConstructor> => {
	if (!jszipPromise) {
		jszipPromise = import(/* @vite-ignore */ JSZIP_SPEC).then((mod) => {
			const ctor = (mod as { default?: ZipConstructor }).default ?? (mod as unknown as ZipConstructor);
			if (!ctor || typeof ctor.loadAsync !== 'function') {
				throw new Error('jszip tidak tersedia.');
			}
			return ctor;
		});
	}
	return jszipPromise;
};

const decodeXmlEntities = (text: string): string =>
	text
		.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');

/** Reject DTD/entity declarations outright instead of resolving them. */
const hasDtd = (xml: string): boolean => /<!(DOCTYPE|ENTITY)/i.test(xml);

/** Text content of `<t>` runs, joined; `xml:space="preserve"` keeps spacing. */
const readTextRuns = (xml: string): string =>
	decodeXmlEntities(
		(xml.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) ?? [])
			.map((run) => run.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, ''))
			.join(''),
	);

/** Convert a cell reference ("B7") into a 0-based column index. */
const columnIndexFromRef = (ref: string): number | null => {
	const letters = /^([A-Za-z]+)/.exec(ref)?.[1];
	if (!letters) return null;
	let index = 0;
	for (const ch of letters.toUpperCase()) {
		index = index * 26 + (ch.charCodeAt(0) - 64);
	}
	return index - 1;
};

export type ParseImportXlsxInput = ParseImportInput & {
	/** Explicit sheet selection by name or 0-based index. */
	sheet?: string | number;
};

/**
 * Parse an XLSX workbook into reviewable rows. Async because the archive must
 * be inflated; total in the same sense as `parseImport` — every input yields an
 * `ImportResult` and content problems never throw.
 */
export async function parseImportXlsx(input: ParseImportXlsxInput): Promise<ImportResult> {
	const bytes =
		typeof input.bytes === 'string' ? new TextEncoder().encode(input.bytes) : input.bytes;
	const size = bytes.length;
	if (size > LIMITS.maxBytes) {
		return {
			ok: false,
			code: 'byte_limit',
			message: `File terlalu besar (${size} byte). Maksimal ${LIMITS.maxBytes} byte.`,
			limit: 'maxBytes',
		};
	}
	const isZip = bytes.length >= 4 && XLSX_MAGIC.every((b, i) => bytes[i] === b);
	if (!isZip) {
		return {
			ok: false,
			code: 'malformed_xlsx',
			message: 'File XLSX tidak valid atau rusak (bukan arsip ZIP).',
		};
	}

	let zip: ZipInstance;
	try {
		zip = await (await loadJszip()).loadAsync(bytes);
	} catch {
		return {
			ok: false,
			code: 'malformed_xlsx',
			message: 'Arsip XLSX tidak dapat dibuka; file mungkin rusak.',
		};
	}

	// --- archive bounds -----------------------------------------------------
	const entries = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
	if (entries.length > XLSX_LIMITS.maxEntries) {
		return {
			ok: false,
			code: 'entry_limit',
			message: `Arsip memiliki terlalu banyak entri (${entries.length}). Maksimal ${XLSX_LIMITS.maxEntries}.`,
			limit: 'maxEntries',
		};
	}
	let declaredExpanded = 0;
	for (const name of entries) {
		const declared = zip.files[name]?._data?.uncompressedSize;
		if (typeof declared === 'number' && Number.isFinite(declared)) declaredExpanded += declared;
	}
	if (declaredExpanded > XLSX_LIMITS.maxExpandedBytes) {
		return {
			ok: false,
			code: 'expanded_limit',
			message: `Isi arsip setelah dibuka terlalu besar (${declaredExpanded} byte). Maksimal ${XLSX_LIMITS.maxExpandedBytes} byte.`,
			limit: 'maxExpandedBytes',
		};
	}

	// --- read only the parts we need, re-checking the real expanded size ----
	let expanded = 0;
	const readXml = async (name: string): Promise<string | null> => {
		const entry = zip.files[name];
		if (!entry || entry.dir) return null;
		let xml: string;
		try {
			xml = await entry.async('string');
		} catch {
			return null;
		}
		expanded += xml.length;
		if (expanded > XLSX_LIMITS.maxExpandedBytes) return '__expanded_limit__';
		if (hasDtd(xml)) return '__unsafe__';
		return xml;
	};

	const findEntry = (wanted: string): string | null => {
		const lower = wanted.toLowerCase();
		return Object.keys(zip.files).find((name) => name.toLowerCase() === lower) ?? null;
	};

	const workbookPath = findEntry('xl/workbook.xml');
	const relsPath = findEntry('xl/_rels/workbook.xml.rels');
	if (!workbookPath || !relsPath) {
		return {
			ok: false,
			code: 'malformed_xlsx',
			message: 'Berkas XLSX tidak memiliki struktur workbook yang dikenali.',
		};
	}
	const workbookXml = await readXml(workbookPath);
	if (workbookXml === '__expanded_limit__') {
		return {
			ok: false,
			code: 'expanded_limit',
			message: `Isi arsip setelah dibuka melebihi batas ${XLSX_LIMITS.maxExpandedBytes} byte.`,
			limit: 'maxExpandedBytes',
		};
	}
	if (workbookXml === '__unsafe__') {
		return {
			ok: false,
			code: 'unsafe_xlsx',
			message: 'Berkas XLSX memuat deklarasi DTD/entitas yang tidak diizinkan.',
		};
	}
	if (!workbookXml) {
		return { ok: false, code: 'malformed_xlsx', message: 'Workbook XLSX tidak dapat dibaca.' };
	}

	const relsXml = await readXml(relsPath);
	if (relsXml === '__expanded_limit__') {
		return {
			ok: false,
			code: 'expanded_limit',
			message: `Isi arsip setelah dibuka melebihi batas ${XLSX_LIMITS.maxExpandedBytes} byte.`,
			limit: 'maxExpandedBytes',
		};
	}
	if (relsXml === '__unsafe__') {
		return {
			ok: false,
			code: 'unsafe_xlsx',
			message: 'Berkas XLSX memuat deklarasi DTD/entitas yang tidak diizinkan.',
		};
	}
	if (!relsXml) {
		return { ok: false, code: 'malformed_xlsx', message: 'Relasi workbook XLSX tidak dapat dibaca.' };
	}

	// No part may point outside the package: external relationships are the
	// classic vector for a spreadsheet that fetches a remote resource.
	if (/TargetMode\s*=\s*"External"/i.test(relsXml) || /TargetMode\s*=\s*'External'/i.test(relsXml)) {
		return {
			ok: false,
			code: 'unsafe_xlsx',
			message: 'Berkas XLSX berisi relasi eksternal yang tidak diizinkan.',
		};
	}

	// --- sheets -------------------------------------------------------------
	const relTargets = new Map<string, string>();
	for (const rel of relsXml.match(/<Relationship\b[^>]*>/g) ?? []) {
		const id = /\bId\s*=\s*"([^"]+)"/i.exec(rel)?.[1];
		const target = /\bTarget\s*=\s*"([^"]+)"/i.exec(rel)?.[1];
		const type = /\bType\s*=\s*"([^"]+)"/i.exec(rel)?.[1] ?? '';
		if (!id || !target) continue;
		if (!/\/worksheet$/i.test(type)) continue;
		relTargets.set(id, target.replace(/^\/?xl\//i, '').replace(/^\.\//, ''));
	}

	const sheetEntries: Array<{ name: string; path: string }> = [];
	for (const sheetTag of workbookXml.match(/<sheet\b[^>]*>/g) ?? []) {
		const name = decodeXmlEntities(/\bname\s*=\s*"([^"]*)"/i.exec(sheetTag)?.[1] ?? '');
		const relId = /\br:id\s*=\s*"([^"]+)"/i.exec(sheetTag)?.[1];
		if (!relId) continue;
		const target = relTargets.get(relId);
		if (!target) continue;
		const path = findEntry(`xl/${target}`) ?? findEntry(target);
		if (!path) continue;
		sheetEntries.push({ name, path });
	}
	if (sheetEntries.length === 0) {
		return {
			ok: false,
			code: 'malformed_xlsx',
			message: 'Berkas XLSX tidak memiliki lembar kerja yang dapat dibaca.',
		};
	}
	if (sheetEntries.length > XLSX_LIMITS.maxSheets) {
		return {
			ok: false,
			code: 'sheet_limit',
			message: `Workbook memiliki terlalu banyak lembar (${sheetEntries.length}). Maksimal ${XLSX_LIMITS.maxSheets}.`,
			limit: 'maxSheets',
		};
	}

	// --- shared strings (only needed when a cell references one) -----------
	let shared: string[] | null = null;
	const sharedPath = findEntry('xl/sharedStrings.xml');
	const loadShared = async (): Promise<string[] | ImportError> => {
		if (shared) return shared;
		if (!sharedPath) {
			shared = [];
			return shared;
		}
		const xml = await readXml(sharedPath);
		if (xml === '__expanded_limit__') {
			return {
				ok: false,
				code: 'expanded_limit',
				message: `Isi arsip setelah dibuka melebihi batas ${XLSX_LIMITS.maxExpandedBytes} byte.`,
				limit: 'maxExpandedBytes',
			};
		}
		if (xml === '__unsafe__') {
			return {
				ok: false,
				code: 'unsafe_xlsx',
				message: 'Berkas XLSX memuat deklarasi DTD/entitas yang tidak diizinkan.',
			};
		}
		shared = (xml?.match(/<si\/>|<si\b[\s\S]*?<\/si>/g) ?? []).map((item) => readTextRuns(item));
		return shared;
	};

	/** Read one worksheet into dense string rows plus their worksheet row numbers. */
	type SheetRows = { headerRow: string[]; dataRows: string[][]; lineNumbers: number[] };
	type SheetRead = { ok: true; sheet: SheetRows } | ImportError;
	const readSheet = async (path: string): Promise<SheetRead> => {
		const xml = await readXml(path);
		if (xml === '__expanded_limit__') {
			return {
				ok: false,
				code: 'expanded_limit',
				message: `Isi arsip setelah dibuka melebihi batas ${XLSX_LIMITS.maxExpandedBytes} byte.`,
				limit: 'maxExpandedBytes',
			};
		}
		if (xml === '__unsafe__') {
			return {
				ok: false,
				code: 'unsafe_xlsx',
				message: 'Berkas XLSX memuat deklarasi DTD/entitas yang tidak diizinkan.',
			};
		}
		if (!xml) {
			return { ok: false, code: 'malformed_xlsx', message: 'Lembar kerja XLSX tidak dapat dibaca.' };
		}

		const cellCount = (xml.match(/<c\b/g) ?? []).length;
		if (cellCount > XLSX_LIMITS.maxCells) {
			return {
				ok: false,
				code: 'cell_limit',
				message: `Lembar memiliki terlalu banyak sel (${cellCount}). Maksimal ${XLSX_LIMITS.maxCells}.`,
				limit: 'maxCells',
			};
		}

		const out: string[][] = [];
		const lineNumbers: number[] = [];
		const rowTags = xml.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
		for (let r = 0; r < rowTags.length; r += 1) {
			const rowTag = rowTags[r];
			const rowNumber = Number.parseInt(/\br\s*=\s*"(\d+)"/.exec(rowTag)?.[1] ?? '', 10);
			const cells: string[] = [];
			let sequential = 0;
			for (const cellTag of rowTag.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []) {
				const ref = /\br\s*=\s*"([A-Za-z]+\d+)"/.exec(cellTag)?.[1] ?? '';
				const column = (ref ? columnIndexFromRef(ref) : null) ?? sequential;
				sequential = column + 1;

				const type = /\bt\s*=\s*"([^"]+)"/.exec(cellTag)?.[1] ?? '';
				const hasFormula = /<f\b/.test(cellTag);
				const rawValue = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellTag)?.[1] ?? '';

				if (hasFormula) {
					// A formula cell is rejected outright. Its cached `<v>` result
					// is deliberately ignored: using it would evaluate the formula
					// by proxy and launder `=SUM(...)` into a grade. The formula
					// text is kept (prefixed with "=") so row provenance shows what
					// the file actually asked for.
					const formulaText = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(cellTag)?.[1] ?? '';
					cells[column] = `=${decodeXmlEntities(formulaText)}`;
					continue;
				}
				if (type === 'e') {
					cells[column] = '#error';
					continue;
				}
				if (type === 's') {
					const index = Number.parseInt(rawValue, 10);
					const table = await loadShared();
					if (!Array.isArray(table)) return table;
					cells[column] = table[index] ?? '';
					continue;
				}
				if (type === 'inlineStr') {
					const isXml = /<is\b[\s\S]*?<\/is>/.exec(cellTag)?.[0] ?? cellTag;
					cells[column] = readTextRuns(isXml);
					continue;
				}
				// Numeric/boolean/string cells: keep the raw text verbatim so a
				// leading-zero NIM ("00101") is never normalized to 101.
				cells[column] = rawValue === '' ? '' : decodeXmlEntities(rawValue);
			}
			for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = '';
			out.push(cells);
			lineNumbers.push(Number.isFinite(rowNumber) ? rowNumber : r + 1);
		}

		// Keep the worksheet's own row numbers (the `r` attribute) for
		// provenance: a sheet may skip rows, so a positional index would point
		// the reviewer at the wrong line. Blank rows are dropped but never
		// renumbered.
		const { rows: kept, lineNumbers: keptNumbers } = dropBlankRows(out, lineNumbers);
		return {
			ok: true,
			sheet: {
				headerRow: kept[0] ?? [],
				dataRows: kept.slice(1),
				lineNumbers: keptNumbers.slice(1),
			},
		};
	};

	/** A sheet is importable when its first non-empty row maps a NIM and a score. */
	const hasImportableHeader = (headerRow: string[]): boolean => {
		const columns = mapColumns(headerRow);
		return columns.some((c) => c.kind === 'nim') && columns.some((c) => c.kind === 'score');
	};

	let chosen: { name: string; rows: SheetRows } | null = null;
	if (typeof input.sheet === 'number' || typeof input.sheet === 'string') {
		const index =
			typeof input.sheet === 'number'
				? input.sheet
				: sheetEntries.findIndex((s) => s.name.toLowerCase() === input.sheet!.toString().toLowerCase());
		const entry = index >= 0 ? sheetEntries[index] : undefined;
		if (!entry) {
			return {
				ok: false,
				code: 'unknown_sheet',
				message: `Lembar "${String(input.sheet)}" tidak ditemukan.`,
				sheets: sheetEntries.map((s) => s.name),
			};
		}
		const read = await readSheet(entry.path);
		if (!read.ok) return read;
		chosen = { name: entry.name, rows: read.sheet };
	} else if (sheetEntries.length === 1) {
		const read = await readSheet(sheetEntries[0].path);
		if (!read.ok) return read;
		chosen = { name: sheetEntries[0].name, rows: read.sheet };
	} else {
		// Multiple sheets and no explicit choice: never guess. Use the single
		// sheet with an importable header, otherwise ask the lecturer.
		const candidates: Array<{ name: string; rows: SheetRows }> = [];
		for (const entry of sheetEntries) {
			const read = await readSheet(entry.path);
			if (!read.ok) return read;
			if (hasImportableHeader(read.sheet.headerRow)) candidates.push({ name: entry.name, rows: read.sheet });
		}
		if (candidates.length === 1) {
			chosen = candidates[0];
		} else if (candidates.length > 1) {
			return {
				ok: false,
				code: 'ambiguous_sheet',
				message: 'Workbook memiliki beberapa lembar yang dapat diimpor. Pilih satu lembar.',
				sheets: candidates.map((c) => c.name),
			};
		} else {
			return {
				ok: false,
				code: 'missing_nim_column',
				message: 'Tidak ada lembar dengan kolom NIM dan nilai yang dikenali.',
				sheets: sheetEntries.map((s) => s.name),
			};
		}
	}

	const normalized = normalizeRows({
		headerRow: chosen.rows.headerRow,
		dataRows: chosen.rows.dataRows,
		lineNumbers: chosen.rows.lineNumbers,
		decimalSeparator: input.decimalSeparator ?? '.',
		inputScale: input.inputScale,
		componentMax: input.componentMax,
	});
	if (!normalized.ok) return normalized;

	return {
		ok: true,
		format: 'xlsx',
		columns: normalized.columns,
		rows: normalized.rows,
		totalRows: normalized.rows.length,
		sheet: chosen.name,
	};
}

/**
 * Format-agnostic entry point: detect from filename/bytes and route to the
 * synchronous CSV reader or the async XLSX reader.
 */
export async function parseImportAuto(input: ParseImportXlsxInput): Promise<ImportResult> {
	const format = detectFormat(input.filename, input.bytes);
	if (format === 'xlsx') return parseImportXlsx(input);
	return parseImport(input);
}

// ---------------------------------------------------------------------------
// Summarize
// ---------------------------------------------------------------------------

export type ImportSummary = {
	validRows: number;
	invalidRows: number;
	unchangedRows: number;
	changedCells: number;
	blocked: boolean;
};

/** Summarize a successful import; an error result is fully blocked. */
export function summarizeImport(result: ImportResult): ImportSummary {
	if (!result.ok) {
		return { validRows: 0, invalidRows: 0, unchangedRows: 0, changedCells: 0, blocked: true };
	}
	let validRows = 0;
	let invalidRows = 0;
	let unchangedRows = 0;
	let changedCells = 0;
	for (const row of result.rows) {
		const changed = countChangedCells(row);
		changedCells += changed;
		if (row.issues.length > 0) {
			invalidRows += 1;
			continue;
		}
		if (changed === 0) unchangedRows += 1;
		else validRows += 1;
	}
	return {
		validRows,
		invalidRows,
		unchangedRows,
		changedCells,
		blocked: invalidRows > 0 || changedCells > LIMITS.maxChangedCells,
	};
}

// ---------------------------------------------------------------------------
// Subset selection
// ---------------------------------------------------------------------------

/**
 * Build a new reviewable revision from an explicitly chosen subset of rows
 * (the plan: the lecturer may select a valid subset). Refuses lines that have
 * blocking issues, or that are not in the result at all.
 */
export function selectSubset(result: ImportResult, lineNumbers: number[]): SelectSubsetResult {
	if (!result.ok) return result;
	const requested = new Set(lineNumbers);
	const rejected: number[] = [];
	const chosen: ParsedRow[] = [];
	for (const row of result.rows) {
		if (!requested.has(row.lineNumber)) continue;
		if (row.issues.length > 0) {
			rejected.push(row.lineNumber);
			continue;
		}
		chosen.push(row);
	}
	for (const line of lineNumbers) {
		if (!result.rows.some((r) => r.lineNumber === line)) rejected.push(line);
	}
	if (rejected.length > 0) {
		return {
			ok: false,
			code: 'blocked_line',
			message: 'Baris yang dipilih masih memiliki masalah yang belum selesai.',
			lineNumbers: [...new Set(rejected)].sort((a, b) => a - b),
		};
	}
	return {
		ok: true,
		format: result.format,
		columns: result.columns,
		rows: chosen,
		totalRows: chosen.length,
	};
}
