/**
 * Deterministic weekly-schedule parser for Indonesian RPS PDFs.
 *
 * The weekly "RENCANA PEMBELAJARAN" table is the hardest part of an RPS to
 * extract: it spans multiple pages, repeats its header on every page, and
 * packs ~10 columns into cells whose text wraps across many lines. Linear PDF
 * extraction flattens all of that into a single text stream, and the AI cannot
 * reliably reconstruct 16 rows × 10 columns from that stream.
 *
 * This parser does NOT rely on the AI. It scans the full extracted text for
 * week-row anchors (a line starting with 1–16 followed by "Sub-CPMK" or
 * "UTS"/"UAS"), groups every line up to the next anchor into that week's row,
 * normalizes whitespace so split-across-lines dates and fields match, and lifts
 * the fields it can match deterministically. Anything it cannot locate is left
 * empty — it never invents data.
 */
import type { ParsedSession } from './rps-parser.server';

const ASSESSMENT_FORMS = [
	'Partisipatif', 'Uraian', 'Isian singkat', 'Isian', 'Pilihan ganda',
	'Menjodohkan', 'Transkripsi', 'Proyek', 'Portofolio', 'Presentasi', 'Diskusi', 'Praktik',
] as const;

/** A line starting with 1–16 followed by Sub-CPMK or UTS/UAS. */
const WEEK_ANCHOR_RE = /^\s*(\d{1,2})\s+(?:Sub-CPMK|UTS|UAS)\b/i;

/** Full date that may be split across lines: "13-10-\n2026" → normalize first.
 *  Tolerates whitespace between the day-month and year fragments. */
const DATE_RE = /(\d{1,2})[-/](\d{1,2})[-/]\s*(\d{4})/;
const TIME_RE = /\b(\d{1,2}[:.]\d{2})\b/;
const SUBCPMK_RE = /Sub-CPMK\s*(\d+(?:\.\d+)?)/i;
const REFS_RE = /(\d+(?:\s*,\s*\d+)+)/;

export type TableParseResult = {
	sessions: ParsedSession[];
	formatted: string;
	rowCount: number;
};

/** True when a line is a repeated table header (not a data row). */
const isHeaderLine = (line: string): boolean => {
	const l = line.toLowerCase();
	return (
		(l.includes('minggu ke') && l.includes('sub-cpmk')) ||
		(l.includes('bentuk dan metode pembelajaran')) ||
		(l.includes('waktu akses') && l.includes('bobot penilaian')) ||
		(l.includes('asesmen') && l.includes('sinkron') && l.includes('asinkron') && l.length < 200)
	);
};

/** True when a line marks the end of the weekly schedule (a later RPS section). */
const isSectionBoundary = (line: string): boolean => {
	const l = line.toUpperCase();
	return (
		l.includes('WAKTU BELAJAR MAHASISWA') ||
		l.includes('WAKTU BELAJAR') ||
		l.includes('KRITERIA PENILAIAN CPMK') ||
		l.includes('RANCANGAN TUGAS KOLABORATIF') ||
		l.includes('DAFTAR RUJUKAN') ||
		l.includes('DAFTAR PUSTAKA') ||
		l.includes('JUMLAH WORKLOAD') ||
		l.includes('JUMLAH JAM IDEAL')
	);
};

/** Normalizes whitespace so fields split across PDF lines match as one string. */
const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

const extractSubCpmkCode = (text: string): string => {
	const m = text.match(SUBCPMK_RE);
	return m ? `Sub-CPMK ${m[1]}` : '';
};

const extractAccessDateTime = (text: string): string => {
	const dm = text.match(DATE_RE);
	const tm = text.match(TIME_RE);
	if (!dm) return '';
	const day = dm[1].padStart(2, '0');
	const month = dm[2].padStart(2, '0');
	const year = dm[3];
	const time = tm ? tm[1].replace('.', ':') : '00:00';
	const hh = time.split(':')[0].padStart(2, '0');
	const mm = time.split(':')[1] || '00';
	return `${year}-${month}-${day}T${hh}:${mm}`;
};

const extractAssessmentForm = (text: string): string => {
	for (const form of ASSESSMENT_FORMS) {
		const re = new RegExp(`\\b${form.replace(/\s+/g, '\\s+')}\\b`, 'i');
		if (re.test(text)) return form;
	}
	return '';
};

/** Duration is the number immediately after the assessment form (e.g.
 *  "Uraian 5 …"). Scanning for the first 5–30 token instead picks up the week
 *  number (6–16) which also falls in that range. */
const extractDuration = (text: string, form: string): string => {
	if (!form) return '';
	const re = new RegExp(`\\b${form.replace(/\s+/g, '\\s+')}\\b\\s+(\\d{1,3})`, 'i');
	const m = text.match(re);
	if (!m) return '';
	const n = parseInt(m[1], 10);
	return n >= 1 && n <= 30 ? String(n) : '';
};

const extractReferences = (text: string): string => {
	const m = text.match(REFS_RE);
	return m ? m[1].replace(/\s*/g, '') : '';
};

const extractMateri = (text: string, special: string): string => {
	if (special) return special;
	// Materi sits between the indicator sentences (which all begin with
	// "Mahasiswa") and the assessment form. Locate the assessment form, take the
	// text before it, then drop every leading "Mahasiswa …" sentence — what
	// remains is the materi (German topic name). This recovers materi that has
	// no parentheses or umlauts (e.g. "Organisatorisch") which the old regex
	// missed.
	let formIdx = -1;
	for (const form of ASSESSMENT_FORMS) {
		const re = new RegExp(`\\b${form.replace(/\s+/g, '\\s+')}\\b`, 'i');
		const m = text.match(re);
		if (m && m.index != null) {
			formIdx = m.index;
			break;
		}
	}
	if (formIdx === -1) return '';
	const before = text.slice(0, formIdx).trim();
	const sentences = before.split(/(?<=\.)\s+/);
	let lastMahasiswaIdx = -1;
	for (let i = 0; i < sentences.length; i += 1) {
		if (/^Mahasiswa\b/i.test(sentences[i].trim())) lastMahasiswaIdx = i;
	}
	const materi =
		lastMahasiswaIdx >= 0
			? sentences.slice(lastMahasiswaIdx + 1).join(' ').trim()
			: before;
	return materi;
};

/** UTS/UAS rows carry a Bobot Penilaian right after the marker ("UTS 10"). */
const extractAssessmentWeight = (text: string, special: string): number | null => {
	if (!special) return null;
	const m = text.match(/\b(?:UTS|UAS)\s+(\d{1,3})\b/i);
	if (!m) return null;
	const w = parseInt(m[1], 10);
	return w >= 0 && w <= 100 ? w : null;
};

const extractIndicator = (text: string): string => {
	const m = text.match(/(Mahasiswa\s[^.]*\.)/i);
	return m ? m[1].trim() : '';
};

const extractSyncMethod = (text: string): string => {
	const m = text.match(/((?:Pertemuan\s+)?Tatap\s+Muka[^,]*?(?:,\s*[^,]*?)*?)(?=\s+(?:Tugas|Menulis|Belajar|Latihan|Isian|Uraian|Partisipatif|\d{1,2}\s|$))/i);
	return m ? m[1].trim() : '';
};

const extractAsyncMethod = (text: string): string => {
	const m = text.match(/((?:Tugas\s+Mandiri|Tugas\s+Menulis|Belajar\s+Mandiri|Latihan\s+\w+)[^,]*(?:,\s*[^,]*)*)/i);
	return m ? m[1].trim() : '';
};

/**
 * Scans the full extracted text for week-row anchors and reconstructs each
 * weekly session deterministically. Returns an empty array when no week anchors
 * are found — the caller then falls back to the AI / heuristic extraction.
 */
export function parseWeeklySchedule(rawText: string): TableParseResult {
	const text = rawText.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
	const lines = text.split('\n');

	// Split into week-anchored blocks by scanning the whole text.
	const blocks: { week: number; lines: string[] }[] = [];
	let current: { week: number; lines: string[] } | null = null;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		if (isHeaderLine(line)) continue;
		// Skip table-cell rows (joined with " | " by the table extractor) and
		// table-block headers — they are not linear schedule lines and would
		// otherwise pollute the last week's block with every table row.
		if (line.includes(' | ') || line.startsWith('[TABEL')) continue;

		// The weekly schedule is followed by other RPS sections (workload,
		// assessment matrix, collaborative task, references). Once we reach one
		// of those headers, the schedule is over — finalize the current block so
		// post-schedule content does not pollute the last week's row.
		if (isSectionBoundary(line)) {
			if (current) {
				blocks.push(current);
				current = null;
			}
			continue;
		}

		const anchor = line.match(WEEK_ANCHOR_RE);
		if (anchor) {
			const week = Math.min(Math.max(parseInt(anchor[1], 10) || 1, 1), 16);
			if (current) blocks.push(current);
			current = { week, lines: [line] };
		} else if (current) {
			current.lines.push(line);
		}
	}
	if (current) blocks.push(current);

	// Deduplicate by week, keep first occurrence.
	const seen = new Set<number>();
	const unique = blocks.filter((b) => {
		if (seen.has(b.week)) return false;
		seen.add(b.week);
		return true;
	});

	if (unique.length === 0) {
		return { sessions: [], formatted: '', rowCount: 0 };
	}

	const sessions: ParsedSession[] = [];
	const formattedLines: string[] = ['[JADWAL PERTEMUAN TERSTRUKTUR]'];

	for (const block of unique) {
		const { week } = block;
		// Normalize the whole block to a single space-separated string so fields
		// split across PDF lines (dates, references) match as one token stream.
		const flat = normalize(block.lines.join(' '));
		const lower = flat.toLowerCase();
		const specialMatch = lower.match(/\b(uts|uas)\b/);
		const special = specialMatch ? specialMatch[1].toUpperCase() : '';
		const specialWeekType: ParsedSession['specialWeekType'] = special
			? (special.toLowerCase() as 'uts' | 'uas')
			: 'normal';

		const subCpmkCode = extractSubCpmkCode(flat);
		const indicator = extractIndicator(flat);
		const materi = extractMateri(flat, special);
		const assessmentForm = extractAssessmentForm(flat);
		const duration = extractDuration(flat, assessmentForm);
		const references = extractReferences(flat);
		const accessDateTime = extractAccessDateTime(flat);
		const syncMethod = extractSyncMethod(flat);
		const asyncMethod = extractAsyncMethod(flat);
		const assessmentWeight = extractAssessmentWeight(flat, special);

		const session: ParsedSession = {
			week,
			title: special || materi || `Pertemuan ${week}`,
			topic: materi,
			objectives: indicator,
			activities: materi,
			duration: duration ? `${duration} jam` : '',
			assessment: assessmentForm,
			references,
			subCpmkCodes: subCpmkCode ? [subCpmkCode] : [],
			learningIndicator: indicator,
			learningMaterial: materi,
			assessmentMethod: assessmentForm,
			assessmentWeight,
			synchronousMethod: syncMethod,
			asynchronousMethod: asyncMethod,
			accessDateTime,
			specialWeekType,
		};
		sessions.push(session);

		formattedLines.push(`Minggu ${week}${special ? ` (${special})` : ''}:`);
		if (subCpmkCode) formattedLines.push(`  Sub-CPMK: ${subCpmkCode}`);
		if (indicator) formattedLines.push(`  Indikator: ${indicator}`);
		if (materi) formattedLines.push(`  Materi: ${materi}`);
		if (assessmentForm) formattedLines.push(`  Bentuk asesmen: ${assessmentForm}`);
		if (duration) formattedLines.push(`  Durasi: ${duration} jam`);
		if (syncMethod) formattedLines.push(`  Sinkron: ${syncMethod}`);
		if (asyncMethod) formattedLines.push(`  Asinkron: ${asyncMethod}`);
		if (references) formattedLines.push(`  Referensi: ${references}`);
		if (accessDateTime) formattedLines.push(`  Waktu akses: ${accessDateTime.replace('T', ' ')}`);
		if (assessmentWeight != null) formattedLines.push(`  Bobot penilaian: ${assessmentWeight}%`);
	}

	return {
		sessions,
		formatted: formattedLines.join('\n'),
		rowCount: sessions.length,
	};
}
