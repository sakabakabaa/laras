import { describe, expect, it } from 'vitest';
import { greenAllowed, lineGreenEligible, splitUnreadable, wordCount } from '@/lib/ai-marks';
import { buildMarkedSegments, findingAnchoredIn, locateQuote, type EvalFinding } from '@/lib/ai-evaluation';

const f = (quote: string, extra: Partial<EvalFinding> = {}): EvalFinding => ({ severity: 'major', quote, note: 'n', evidence: '', anchorValid: true, ...extra });

describe('ai marks rules', () => {
	it('green only for ready, current drafts (zero findings included)', () => {
		expect(greenAllowed({ ready: true, stale: false })).toBe(true);
		expect(greenAllowed({ ready: true, stale: true })).toBe(false);
		expect(greenAllowed({ ready: false, stale: false })).toBe(false);
		expect(greenAllowed({ ready: true, stale: false, insufficient: true })).toBe(false);
	});

	it('skips lines shorter than 3 words and ignores placeholders', () => {
		expect(lineGreenEligible('Übung 3')).toBe(false);
		expect(lineGreenEligible('Ich gehe heute.')).toBe(true);
		expect(wordCount('a [tidak terbaca] b')).toBe(2);
	});

	it('splits [tidak terbaca] out of plain text', () => {
		expect(splitUnreadable('Ich [tidak terbaca] gehe')).toEqual([
			{ text: 'Ich ', unreadable: false },
			{ text: '[tidak terbaca]', unreadable: true },
			{ text: ' gehe', unreadable: false },
		]);
	});
});

describe('quote anchoring on the current text', () => {
	const text = 'Ich gehe zu Schule. Er ist müde.';
	it('anchors only quotes still present exactly once', () => {
		expect(findingAnchoredIn(f('zu Schule'), text)).toBe(true);
		expect(findingAnchoredIn(f('nicht mehr da'), text)).toBe(false);
		expect(findingAnchoredIn(f('zu Schule', { anchorValid: false }), text)).toBe(false);
		expect(findingAnchoredIn(f('zu Schule', { anchorAmbiguous: true }), text)).toBe(false);
		expect(findingAnchoredIn(f(''), text)).toBe(false);
	});

	it('does not trust stored offsets that no longer slice to the quote', () => {
		const moved = f('zu Schule', { quoteStart: 0, quoteEnd: 9 });
		expect(locateQuote(moved, text)).toEqual({ start: 9, end: 18 });
		const gone = f('Hund', { quoteStart: 0, quoteEnd: 4 });
		expect(buildMarkedSegments(text, [gone])).toEqual([{ text }]);
	});
});
