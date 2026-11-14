import { describe, expect, it } from 'vitest';
import {
	deriveAiReviewFindings,
	findingGroupLabel,
	groupFindings,
	parseFindings,
	parseReviewFindings,
	sanitizeGroup,
} from '@/lib/ai-evaluation';
import { splitEvidenceQuotes } from '@/components/app/grading/grading-panel';

const f = (over: Record<string, unknown>) => ({ severity: 'minor', quote: '', note: 'n', evidence: '', ...over }) as any;

describe('finding groups', () => {
	it('groups recurring findings by group key, falling back to category/subcategory, keeping order', () => {
		const list = [
			f({ id: 1, group: 'cap-noun' }),
			f({ id: 2, category: 'Syntax', subcategory: 'word_order' }),
			f({ id: 3, group: 'cap-noun' }),
			f({ id: 4, category: 'Syntax', subcategory: 'word_order' }),
			f({ id: 5, group: 'cap-noun' }),
			f({ id: 6 }),
		];
		const groups = groupFindings(list);
		expect(groups.map((g) => [g.label, g.items.length])).toEqual([
			['Kapitalisasi kata benda', 3],
			['Urutan kata', 2],
			['', 1],
		]);
	});

	it('leaves singletons ungrouped and labels unknown keys readably', () => {
		expect(groupFindings([f({ group: 'x' })])[0].key).toBe('');
		expect(findingGroupLabel('g:my-custom_key')).toBe('My custom key');
		expect(sanitizeGroup('  Cap Noun!! ')).toBe('cap-noun');
	});

	it('group and certainty survive parse and review derivation; old rows still parse', () => {
		const stored = [f({ group: 'cap-noun', certainty: 'mungkin', confidence: 0.6 }), f({ confidence: 0.95 })];
		const parsed = parseFindings(stored);
		expect(parsed[0]).toMatchObject({ group: 'cap-noun', certainty: 'mungkin' });
		expect(parsed[1].group).toBeUndefined();
		expect(parsed[1].certainty).toBeUndefined();
		const review = deriveAiReviewFindings(parsed);
		expect(review[0]).toMatchObject({ group: 'cap-noun', certainty: 'mungkin' });
		const saved = parseReviewFindings(review.map((r) => ({ ...r })));
		expect(saved[0]).toMatchObject({ group: 'cap-noun', certainty: 'mungkin' });
	});
});

describe('criterion evidence chips', () => {
	it('splits quoted evidence from the note', () => {
		const { text, quotes } = splitEvidenceQuotes('Kalimat sederhana tetapi benar: "Ich wohne in Jakarta" dan „Ich bin Student“.');
		expect(quotes).toEqual(['Ich wohne in Jakarta', 'Ich bin Student']);
		expect(text).toContain('Kalimat sederhana');
		expect(text).not.toContain('Jakarta');
	});
	it('returns the note unchanged without quotes', () => {
		expect(splitEvidenceQuotes('Cukup baik.')).toEqual({ text: 'Cukup baik.', quotes: [] });
	});
});
