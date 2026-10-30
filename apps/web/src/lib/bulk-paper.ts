/**
 * Bulk paper-answer input — shared types, matching, and text parsing.
 *
 * Pure helpers used by both the lecturer review UI (client) and the server
 * submission path, so the matching the lecturer sees in review is the same
 * matching the server re-applies before writing anything.
 */

/** One extracted/edited paper answer awaiting lecturer confirmation. */
export type PaperEntry = {
	id: string;
	nim: string;
	name: string;
	answer: string;
	/** Stored _integratedAiImages record id when this entry came from a scan. */
	imageId?: string;
	/** Filename within that image record (for attaching to the submission). */
	imageFile?: string;
};

/** An enrolled student the lecturer may match an entry to. */
export type RosterStudent = {
	id: string;
	name: string;
	nim: string;
	email: string;
};

export type MatchResult = {
	status: 'matched' | 'unmatched' | 'ambiguous';
	student?: RosterStudent;
	students?: RosterStudent[];
};

/** Short unique id for in-memory entries (never persisted directly). */
export function newRowId(prefix: string): string {
	return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

const normNim = (s: string): string => (s || '').replace(/\D/g, '');
const normName = (s: string): string =>
	(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Match an entry to a single enrolled student by NIM first, then by exact
 * name. Returns `ambiguous` when more than one student matches the same key,
 * so the lecturer is forced to refine the entry before it can be submitted.
 */
export function matchStudent(
	entry: { nim: string; name: string },
	roster: RosterStudent[],
): MatchResult {
	const nim = normNim(entry.nim);
	if (nim) {
		const hits = roster.filter((r) => normNim(r.nim) === nim);
		if (hits.length === 1) return { status: 'matched', student: hits[0] };
		if (hits.length > 1) return { status: 'ambiguous', students: hits };
	}
	const name = normName(entry.name);
	if (name) {
		const hits = roster.filter((r) => normName(r.name) === name);
		if (hits.length === 1) return { status: 'matched', student: hits[0] };
		if (hits.length > 1) return { status: 'ambiguous', students: hits };
	}
	return { status: 'unmatched' };
}

/** Split pasted text into per-student blocks separated by `---` or blank lines. */
function splitBlocks(text: string): string[] {
	const bySeparator = text
		.split(/^\s*-{3,}\s*$/m)
		.map((b) => b.trim())
		.filter(Boolean);
	if (bySeparator.length > 1) return bySeparator;
	// No `---` separators: fall back to blank-line separated blocks.
	return text
		.split(/\n{2,}/)
		.map((b) => b.trim())
		.filter(Boolean);
}

const LABEL_RE = /(nim|nis|nisb|no\.?\s*induk|nama|name|jawaban|jawab|answer)\s*[:\-]\s*([^\n]*)/i;

/** Parse one block into a paper entry using labels, with an unlabeled fallback. */
function parseBlock(block: string): PaperEntry | null {
	const matches = [...block.matchAll(new RegExp(LABEL_RE.source, 'gi'))];
	let nim = '';
	let name = '';
	let answer = '';
	let labeled = false;
	for (const m of matches) {
		labeled = true;
		const key = m[1].toLowerCase();
		const value = m[2].trim();
		if (/^(nim|nis|nisb|no\.?\s*induk)$/.test(key)) nim = value;
		else if (/^(nama|name)$/.test(key)) name = value;
		else answer = value;
	}
	if (labeled) {
		// When the answer label is present, capture everything after it (multi-line).
		const ansMatch = block.match(/(?:jawaban|jawab|answer)\s*[:\-]\s*([\s\S]+)/i);
		if (ansMatch) answer = ansMatch[1].trim();
	} else {
		// Unlabeled block: keep the whole block as the answer so the lecturer
		// can fill in NIM/name during review.
		answer = block.trim();
	}
	if (!nim && !name && !answer) return null;
	return { id: newRowId('pe'), nim, name, answer };
}

/** Parse pasted text into paper entries. */
export function parseTextEntries(text: string): PaperEntry[] {
	if (!text.trim()) return [];
	return splitBlocks(text)
		.map(parseBlock)
		.filter((e): e is PaperEntry => e !== null);
}
