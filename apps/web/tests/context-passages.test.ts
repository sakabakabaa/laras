import { describe, expect, it } from 'vitest';
import { resolveContextPassage } from '@/lib/context-passages';

describe('exact context quotations', () => {
	it('returns a passage deep in the file, with exact extraction offsets', () => {
		const opening = 'Unrelated opening. '.repeat(300);
		const quote = 'Im Hauptsatz steht das finite Verb an zweiter Stelle.';
		const fullText = `  ${opening}\n${quote}\nNext topic.`;
		const passage = resolveContextPassage(fullText, quote)!;
		expect(passage.text).toBe(quote);
		expect(fullText.slice(passage.start, passage.end)).toBe(quote);
		expect(passage.start).toBeGreaterThan(1600);
	});

	it('rejects empty, invented, oversized and ambiguous quotes', () => {
		expect(resolveContextPassage('Exact text', '')).toBeNull();
		expect(resolveContextPassage('Exact text', 'Paraphrase')).toBeNull();
		expect(resolveContextPassage('same same', 'same')).toBeNull();
		expect(resolveContextPassage('a'.repeat(9000), 'a'.repeat(9000))).toBeNull();
	});

	it('caps supplied text and reports its actual offsets and truncation', () => {
		const passage = resolveContextPassage('before Unique quotation after', 'Unique quotation', 6)!;
		expect(passage).toEqual({ text: 'Unique', start: 7, end: 13, truncated: true });
		expect(resolveContextPassage('quote', 'quote', 0)).toBeNull();
	});
});
