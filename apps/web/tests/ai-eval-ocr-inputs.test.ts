import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	countUncertain,
	findMarkerInsensitive,
	splitUncertain,
	stripOcrMarkers,
} from '@/lib/ai-marks';
import { answerTextFromExtraction, clipKeepLines } from '@/lib/ocr-clean';
import { applyOcrGuards, parseFindings, parseStructuredFindings, type EvalFinding } from '@/lib/ai-evaluation';
import { composeFeedback } from '@/lib/evaluation-publish.server';
import { parseStudentRecommendations, studentRecommendationText } from '@/lib/student-feedback';
import { clearPageImageCache, scannedPdfPageImages } from '@/lib/evaluation-page-images.server';
import { ANSWER_OCR_PROMPT } from '@/lib/pdf-ocr.server';

const TEXT = 'Am ⟦Abends⟧ isst er ein ⟦Brot⟧.\nSie [tidak terbaca] gern.';

describe('uncertain OCR markers', () => {
	it('splits ⟦…⟧ segments keeping every character', () => {
		const parts = splitUncertain(TEXT.split('\n')[0]);
		expect(parts.map((p) => p.text).join('')).toBe(TEXT.split('\n')[0]);
		expect(parts.filter((p) => p.uncertain).map((p) => p.inner)).toEqual(['Abends', 'Brot']);
		expect(countUncertain(TEXT)).toBe(2);
	});

	it('strips marker characters only', () => {
		expect(stripOcrMarkers(TEXT)).toBe('Am Abends isst er ein Brot.\nSie [tidak terbaca] gern.');
	});

	it('ocr-clean keeps the markers', () => {
		expect(answerTextFromExtraction(`[Halaman 1]\n${TEXT}`)).toBe(TEXT);
		expect(clipKeepLines(TEXT, 500)).toBe(TEXT);
	});

	it('the answer OCR prompt asks for ⟦ ⟧ and keeps [tidak terbaca]', () => {
		expect(ANSWER_OCR_PROMPT).toContain('⟦');
		expect(ANSWER_OCR_PROMPT).toContain('[tidak terbaca]');
	});
});

describe('quotes with markers', () => {
	it('anchors a quote that lacks the markers and stores the marked substring', () => {
		const found = findMarkerInsensitive(TEXT, 'Am Abends isst er');
		expect(found).not.toBeNull();
		const [finding] = parseStructuredFindings(
			[{ severity: 'minor', quote: 'isst er ein Brot', note: 'n', category: 'Lexicon', subcategory: 'word_choice' }],
			TEXT,
			[],
		);
		expect(finding.anchorValid).toBe(true);
		expect(finding.quote).toBe('isst er ein ⟦Brot⟧');
		expect(TEXT.slice(finding.quoteStart as number, finding.quoteEnd as number)).toBe(finding.quote);
	});

	it('an exact quote with markers still anchors', () => {
		const [finding] = parseStructuredFindings([{ severity: 'minor', quote: '⟦Abends⟧ isst', note: 'n' }], TEXT, []);
		expect(finding.anchorValid).toBe(true);
	});
});

describe('imageChecked', () => {
	it('is parsed only when true and survives parseFindings', () => {
		const [a, b] = parseStructuredFindings(
			[
				{ severity: 'minor', quote: '', note: 'a', imageChecked: true },
				{ severity: 'minor', quote: '', note: 'b', imageChecked: false },
			],
			'x',
			[],
		);
		expect(a.imageChecked).toBe(true);
		expect(b.imageChecked).toBeUndefined();
		expect(parseFindings([a])[0].imageChecked).toBe(true);
	});
});

describe('OCR guards', () => {
	const f = (quote: string, category: string, subcategory: string, extra: Partial<EvalFinding> = {}): EvalFinding => {
		const start = TEXT.indexOf(quote);
		return { severity: 'minor', quote, note: 'n', evidence: '', category, subcategory, anchorValid: true, quoteStart: start, quoteEnd: start + quote.length, ...extra };
	};

	it('drops orthography findings on uncertain words and on [tidak terbaca]', () => {
		const out = applyOcrGuards(
			[
				f('⟦Abends⟧', 'Orthography', 'capitalization'),
				f('⟦Brot⟧', 'Orthography', 'spelling'),
				f('[tidak terbaca]', 'Lexicon', 'word_choice'),
				f('isst er', 'Syntax', 'word_order'),
			],
			TEXT,
			{ ocrDerived: true, hasImages: true },
		);
		expect(out.map((x) => x.quote)).toEqual(['isst er']);
	});

	it('without an image drops capitalization and punctuation, keeps spelling', () => {
		const out = applyOcrGuards(
			[f('isst', 'Orthography', 'capitalization'), f('gern', 'Orthography', 'punctuation'), f('isst er', 'Orthography', 'spelling', { imageChecked: true })],
			TEXT,
			{ ocrDerived: true, hasImages: false },
		);
		expect(out).toHaveLength(1);
		expect(out[0].subcategory).toBe('spelling');
		expect(out[0].imageChecked).toBeUndefined();
	});

	it('keeps capitalization findings when an image is attached and leaves non-OCR text alone', () => {
		expect(applyOcrGuards([f('isst', 'Orthography', 'capitalization')], TEXT, { ocrDerived: true, hasImages: true })).toHaveLength(1);
		expect(applyOcrGuards([f('⟦Brot⟧', 'Orthography', 'spelling')], TEXT, { ocrDerived: false, hasImages: false })).toHaveLength(1);
	});
});

describe('student-facing text has no markers', () => {
	it('strips markers from published feedback and parsed recommendations', () => {
		const feedback = composeFeedback({
			findings: [{ id: 'a', source: 'ai', severity: 'minor', quote: 'isst er ⟦Brot⟧', note: 'Kata ⟦Brot⟧', evidence: '', status: 'approved' }],
			note: '',
		});
		expect(feedback).not.toMatch(/[⟦⟧]/);
		expect(feedback).toContain('isst er Brot');
		expect(studentRecommendationText('- Saran: x ⟦y⟧')).toBe('- Saran: x y');
		expect(parseStudentRecommendations('- Kesalahan berarti: catatan Pada teks: "a ⟦b⟧".')[0]?.quote).toBe('a b');
	});
});

describe('scanned PDF page images', () => {
	beforeEach(() => clearPageImageCache());
	const pages = ['data:image/jpeg;base64,AA', 'data:image/jpeg;base64,BB', 'data:image/jpeg;base64,CC'];

	it('renders only scanned PDFs, within the budget, first pages first', async () => {
		const render = vi.fn(async () => pages);
		const result = await scannedPdfPageImages(
			{ collection: 'assignment_submissions', recordId: 'r1', files: ['a.pdf', 'b.pdf', 'p.jpg'], budget: 4 },
			{ fetchFile: async () => Buffer.from('x'), hasTextLayer: async () => false, render },
		);
		expect(result.images).toEqual([...pages, pages[0]]);
		expect(result.labels[0]).toBe('pdf:a.pdf#halaman-1');
		expect(result.labels).toHaveLength(4);
	});

	it('skips PDFs with a text layer and returns nothing with no budget', async () => {
		const render = vi.fn(async () => pages);
		const deps = { fetchFile: async () => Buffer.from('x'), hasTextLayer: async () => true, render };
		expect((await scannedPdfPageImages({ collection: 'c', recordId: 'r2', files: ['a.pdf'], budget: 5 }, deps)).images).toEqual([]);
		expect((await scannedPdfPageImages({ collection: 'c', recordId: 'r3', files: ['a.pdf'], budget: 0 }, deps)).images).toEqual([]);
		expect(render).not.toHaveBeenCalled();
	});

	it('caches rendered pages per record and file, and does not cache failures', async () => {
		const render = vi.fn(async () => pages);
		const deps = { fetchFile: async () => Buffer.from('x'), hasTextLayer: async () => false, render };
		const input = { collection: 'c', recordId: 'r4', files: ['a.pdf'], budget: 5 };
		await scannedPdfPageImages(input, deps);
		await scannedPdfPageImages(input, deps);
		expect(render).toHaveBeenCalledTimes(1);
		const failing = vi.fn(async () => [] as string[]);
		const failDeps = { ...deps, render: failing };
		await scannedPdfPageImages({ ...input, recordId: 'r5' }, failDeps);
		await scannedPdfPageImages({ ...input, recordId: 'r5' }, failDeps);
		expect(failing).toHaveBeenCalledTimes(2);
	});
});
