/** An exact, unambiguous quotation from the active stored extraction. */
export type ContextPassage = { text: string; start: number; end: number; truncated: boolean };

export const MAX_CONTEXT_EXCERPT_CHARS = 8000;

/** Never infer passage content from a label, page number, or document prefix. */
export function resolveContextPassage(
	fullText: string,
	excerpt: string | undefined,
	maxChars = MAX_CONTEXT_EXCERPT_CHARS,
): ContextPassage | null {
	const quote = (excerpt || '').trim();
	if (!quote || quote.length > MAX_CONTEXT_EXCERPT_CHARS || !Number.isFinite(maxChars) || maxChars < 1) return null;
	const start = fullText.indexOf(quote);
	if (start < 0 || fullText.indexOf(quote, start + 1) !== -1) return null;
	const text = quote.slice(0, Math.floor(maxChars));
	return { text, start, end: start + text.length, truncated: text.length < quote.length };
}
