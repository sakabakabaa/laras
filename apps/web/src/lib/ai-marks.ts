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
