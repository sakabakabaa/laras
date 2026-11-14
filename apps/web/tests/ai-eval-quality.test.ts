import { describe, expect, it } from 'vitest';
import { aggregateRuns, quotesOverlap, scoreRun, splitGold, storedPrecision } from '@/lib/ai-eval-quality';

const review = [
	{ source: 'ai', status: 'approved', quote: 'haus', category: 'Orthography' },
	{ source: 'ai', status: 'edited', quote: 'ich bin gut', category: 'Morphology' },
	{ source: 'ai', status: 'rejected', quote: 'Das Wetter ist gut', category: 'Syntax' },
	{ source: 'lecturer', status: 'manual', quote: 'wasser', category: 'Orthography' },
	{ source: 'ai', status: 'pending', quote: 'ignoriert' },
	{ source: 'ai', status: 'approved', quote: '', category: 'Task' },
];

describe('quality metrics', () => {
	it('quote overlap ignores OCR marks, case and containment direction', () => {
		expect(quotesOverlap('⟦Haus⟧', 'haus')).toBe(true);
		expect(quotesOverlap('ich habe haus', 'haus')).toBe(true);
		expect(quotesOverlap('Ich bin sehr gut', 'ich bin gut')).toBe(true);
		expect(quotesOverlap('Auto', 'Wasser')).toBe(false);
		expect(quotesOverlap('', 'x')).toBe(false);
	});

	it('splits positives (approved/edited/lecturer) from negatives and skips quote-less findings', () => {
		const { positives, negatives } = splitGold(review);
		expect(positives.map((p) => p.quote)).toEqual(['haus', 'ich bin gut', 'wasser']);
		expect(negatives.map((n) => n.quote)).toEqual(['Das Wetter ist gut']);
	});

	it('computes precision, recall, undecided and score error for one run', () => {
		const run = scoreRun({
			reviewFindings: review,
			aiFindings: [
				{ quote: 'haus', category: 'Orthography' },
				{ quote: 'Das Wetter ist gut', category: 'Syntax' },
				{ quote: 'etwas anderes', category: 'Lexicon' },
				{ quote: '', category: 'Task' },
			],
			recommendedScore: 72,
			finalScore: 80,
		});
		expect(run).toMatchObject({ tp: 1, fp: 1, undecided: 1, recallHit: 1, recallTotal: 3, scoreError: 8 });
		expect(run.byCategory.Orthography).toMatchObject({ tp: 1, recallHit: 1, recallTotal: 2 });
		expect(run.byCategory.Syntax).toMatchObject({ fp: 1 });
	});

	it('aggregates micro-averages and MAE only over runs with both scores', () => {
		const a = scoreRun({ reviewFindings: review, aiFindings: [{ quote: 'haus', category: 'Orthography' }], recommendedScore: 70, finalScore: 80 });
		const b = scoreRun({ reviewFindings: review, aiFindings: [{ quote: 'wasser', category: 'Orthography' }, { quote: 'Das Wetter ist gut', category: 'Syntax' }], recommendedScore: null, finalScore: 90 });
		const agg = aggregateRuns([a, b]);
		expect(agg.submissions).toBe(2);
		expect(agg.precision).toBe(0.667);
		expect(agg.recall).toBe(0.333);
		expect(agg.scoreMae).toBe(10);
		expect(agg.scoreCount).toBe(1);
		expect(agg.byCategory.Syntax.precision).toBe(0);
		expect(aggregateRuns([]).precision).toBeNull();
	});

	it('stored draft precision counts only decided AI findings', () => {
		expect(storedPrecision(review)).toEqual({ approved: 3, rejected: 1 });
	});
});
