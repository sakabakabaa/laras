import type { CourseRosterEntry } from '@/lib/learning';

/**
 * Shared roster CSV format used by both the import parser and the export
 * feature, so a downloaded file can be re-imported without reshaping.
 *
 * Format: comma-separated, first line is the header `nim,nama`. Fields that
 * contain a comma, double quote, or newline are wrapped in double quotes per
 * RFC 4180 (with inner quotes doubled), so names with special characters
 * survive a round-trip. The import parser also still accepts tab- and
 * semicolon-separated pasted lists for backward compatibility.
 */

export const ROSTER_NIM_MAX = 32;
export const ROSTER_NAME_MAX = 200;

export const ROSTER_CSV_HEADER = 'nim,nama';

export type ParsedRosterRow = {
	line: number;
	nim: string;
	name: string;
	/** Validation error for this row (blocks saving). */
	error?: string;
	/** NIM already exists in the roster — will be skipped (reused), not an error. */
	exists?: boolean;
};

/** Escape a single CSV field per RFC 4180. */
export function escapeCsvField(value: string): string {
	const needsQuoting = /[",\n\r]/.test(value);
	if (!needsQuoting) return value;
	return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Parse a single CSV line into fields, honoring quoted fields (RFC 4180).
 * Used for the comma-delimited format that the export produces.
 */
export function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					current += '"';
					i++;
					continue;
				}
				inQuotes = false;
				continue;
			}
			current += ch;
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			continue;
		}
		if (ch === ',') {
			fields.push(current);
			current = '';
			continue;
		}
		current += ch;
	}
	fields.push(current);
	return fields;
}

/**
 * Split a pasted/CSV line into fields. Comma-delimited lines use the quoted
 * parser; tab- and semicolon-delimited pasted lists fall back to a plain split
 * (matching the original import behavior).
 */
export function splitRosterRow(line: string): string[] {
	if (line.includes('\t')) return line.split('\t');
	if (line.includes(';')) return line.split(';');
	return parseCsvLine(line);
}

/**
 * Build the roster CSV string (header + one row per entry) in the exact format
 * the import parser accepts. Entries are sorted by NIM then name to match the
 * default roster sort, so a re-import reproduces the same order.
 */
export function buildRosterCsv(entries: CourseRosterEntry[]): string {
	const sorted = [...entries].sort((a, b) => {
		const byNim = a.nim.trim().localeCompare(b.nim.trim(), undefined, {
			numeric: true,
		});
		if (byNim !== 0) return byNim;
		return a.name.trim().localeCompare(b.name.trim());
	});
	const lines = [ROSTER_CSV_HEADER];
	for (const entry of sorted) {
		lines.push(
			`${escapeCsvField(entry.nim.trim())},${escapeCsvField(entry.name.trim())}`,
		);
	}
	// Trailing newline so the file is a well-formed text file.
	return `${lines.join('\n')}\n`;
}

/**
 * Parse pasted/CSV roster text into validated rows. Mirrors the import preview
 * logic so export output round-trips cleanly.
 */
export function parseRosterText(
	text: string,
	existingNims: Set<string>,
): ParsedRosterRow[] {
	const lines = text.split(/\r?\n/);
	const rows: ParsedRosterRow[] = [];
	const seenInImport = new Set<string>();
	let startIndex = 1;

	// Detect and skip a header line.
	if (lines.length > 0) {
		const first = lines[0].toLowerCase();
		if (first.includes('nim') && first.includes('nama')) {
			startIndex = 2;
		}
	}

	for (let i = startIndex - 1; i < lines.length; i++) {
		const raw = lines[i];
		const lineNo = i + 1;
		if (!raw || raw.trim() === '') continue;

		const parts = splitRosterRow(raw);
		const nim = (parts[0] ?? '').trim();
		const name = (parts.slice(1).join(' ') ?? '').trim();

		const row: ParsedRosterRow = { line: lineNo, nim, name };

		if (!nim) {
			row.error = 'NIM kosong';
		} else if (nim.length > ROSTER_NIM_MAX) {
			row.error = `NIM lebih dari ${ROSTER_NIM_MAX} karakter`;
		} else if (!name) {
			row.error = 'Nama kosong';
		} else if (name.length > ROSTER_NAME_MAX) {
			row.error = `Nama lebih dari ${ROSTER_NAME_MAX} karakter`;
		} else if (seenInImport.has(nim)) {
			row.error = 'NIM duplikat dalam daftar ini';
		} else if (existingNims.has(nim)) {
			row.exists = true;
		}

		if (nim) seenInImport.add(nim);
		rows.push(row);
	}

	return rows;
}
