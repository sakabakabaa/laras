/**
 * Honest colouring rules shared by Tugas (ai-evaluation-review) and Kelas
 * terjadwal (grading/marked-text). Pure and client-safe.
 *
 * - Green ("tidak ditandai AI", a subtle underline) means only that the AI read
 *   a CURRENT text (not stale) from a ready draft and did not flag this part.
 *   It never means "checked and correct".
 * - "[tidak terbaca]" (illegible OCR) is never green: it is grey and labelled.
 * - Lines of fewer than 3 words (worksheet headers, numbering, names) are never
 *   painted green: they are not German sentences the AI judged.
 */
export const OK_TITLE = 'tidak ditandai AI';
export const UNREADABLE_LABEL = 'tidak terbaca';
export const MIN_GREEN_WORDS = 3;

const UNREADABLE_RE = /\[\s*tidak terbaca\s*\]/gi;

/** Splits text into plain parts and "[tidak terbaca]" parts, keeping every character. */
export function splitUnreadable(text: string): { text: string; unreadable: boolean }[] {
	const out: { text: string; unreadable: boolean }[] = [];
	let last = 0;
	for (const match of text.matchAll(UNREADABLE_RE)) {
		const at = match.index ?? 0;
		if (at > last) out.push({ text: text.slice(last, at), unreadable: false });
		out.push({ text: match[0], unreadable: true });
		last = at + match[0].length;
	}
	if (last < text.length) out.push({ text: text.slice(last), unreadable: false });
	return out;
}

/** Words of a line, not counting "[tidak terbaca]" placeholders. */
export function wordCount(line: string): number {
	return line.replace(UNREADABLE_RE, ' ').split(/\s+/).filter((word) => /\p{L}/u.test(word)).length;
}

/** May this line be painted green? */
export function lineGreenEligible(line: string): boolean {
	return wordCount(line) >= MIN_GREEN_WORDS;
}

/** Green only for a ready, current (not stale) draft, zero findings included. */
export function greenAllowed(draft: { ready: boolean; stale: boolean; insufficient?: boolean }): boolean {
	return draft.ready && !draft.stale && !draft.insufficient;
}

/**
 * OCR uncertainty markers. The OCR prompts wrap a word the model could read
 * but is unsure of (letters, capitalization, umlaut, punctuation) as ⟦word⟧
 * (U+27E6 / U+27E7), best reading inside. The markers live in the stored
 * answer text so findings can quote it exactly; every display for students
 * strips them, the lecturer view hides the brackets and underlines the word.
 */
export const OCR_UNCERTAIN_OPEN = '⟦';
export const OCR_UNCERTAIN_CLOSE = '⟧';
export const UNCERTAIN_LABEL = 'OCR ragu';
export const UNCERTAIN_TITLE = 'OCR ragu, cek dengan file asli';

const UNCERTAIN_RE = /⟦([^⟦⟧\n]*)⟧/g;
const MARKER_CHARS_RE = /[⟦⟧]/g;

/** Splits text into plain parts and ⟦uncertain⟧ parts; `inner` excludes the brackets. Keeps every character in `text`. */
export function splitUncertain(text: string): { text: string; uncertain: boolean; inner: string }[] {
	const out: { text: string; uncertain: boolean; inner: string }[] = [];
	let last = 0;
	for (const match of text.matchAll(UNCERTAIN_RE)) {
		const at = match.index ?? 0;
		if (at > last) out.push({ text: text.slice(last, at), uncertain: false, inner: text.slice(last, at) });
		out.push({ text: match[0], uncertain: true, inner: match[1] });
		last = at + match[0].length;
	}
	if (last < text.length) out.push({ text: text.slice(last), uncertain: false, inner: text.slice(last) });
	return out;
}

/** Text without ⟦⟧ marker characters (for students, exports and plain display). */
export function stripOcrMarkers(text: string): string {
	return (text || '').replace(MARKER_CHARS_RE, '');
}

/** Number of ⟦…⟧ uncertain words in a text. */
export function countUncertain(text: string): number {
	return Array.from((text || '').matchAll(UNCERTAIN_RE)).length;
}

/**
 * Maps a quote that may lack (or contain) ⟦⟧ markers onto the marked text:
 * returns the exact substring of `text` (markers included) whose marker-free
 * form equals the marker-free quote, or null. Only used when an exact match fails.
 */
export function findMarkerInsensitive(text: string, quote: string): { start: number; end: number } | null {
	const q = stripOcrMarkers(quote).trim();
	if (!q || !/[\u27E6\u27E7]/.test(text)) return null;
	let plain = '';
	const map: number[] = [];
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (ch === OCR_UNCERTAIN_OPEN || ch === OCR_UNCERTAIN_CLOSE) continue;
		plain += ch;
		map.push(i);
	}
	const at = plain.indexOf(q);
	if (at === -1 || plain.indexOf(q, at + 1) !== -1) return null;
	let start = map[at];
	let end = map[at + q.length - 1] + 1;
	// Include markers that wrap the quote edges so the segment keeps pairs whole.
	if (start > 0 && text[start - 1] === OCR_UNCERTAIN_OPEN) start -= 1;
	if (end < text.length && text[end] === OCR_UNCERTAIN_CLOSE) end += 1;
	return { start, end };
}
