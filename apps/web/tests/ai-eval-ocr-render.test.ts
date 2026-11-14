import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkedText, MarkLegend } from '../src/components/app/grading/marked-text';
import { parseStructuredFindings } from '../src/lib/ai-evaluation';

const TEXT = 'Am ⟦Abends⟧ isst er ein Brot heute.\nSie [tidak terbaca] gern und viel.';

describe('MarkedText with OCR markers', () => {
	it('shows uncertain words dotted, hides brackets, never green', () => {
		const html = renderToStaticMarkup(createElement(MarkedText, { text: TEXT, checked: { start: 0, end: TEXT.length } }));
		expect(html).toContain('aev-mark uncertain');
		expect(html).toContain('OCR ragu, cek dengan file asli');
		expect(html).toContain('(OCR ragu)');
		expect(html).toContain('<span class="aev-ocr-br" aria-hidden="true">⟦</span>Abends');
		expect(html).toMatch(/aev-mark ok/);
		expect(html).not.toMatch(/aev-mark ok[^>]*>[^<]*<span[^>]*>⟦/);
	});

	it('keeps markers hidden inside a finding mark and shows "dicek di foto"', () => {
		const findings = parseStructuredFindings(
			[{ severity: 'major', quote: 'isst er ein ⟦Brot⟧', note: 'Catatan', imageChecked: true }],
			TEXT,
			[],
		);
		const html = renderToStaticMarkup(createElement(MarkedText, { text: TEXT, findings }));
		expect(html).toContain('aev-mark major');
		expect(html).toContain('dicek di foto');
		expect(html).toContain('aev-ocr-br');
	});

	it('legend explains the dotted underline', () => {
		expect(renderToStaticMarkup(createElement(MarkLegend))).toContain('OCR ragu');
	});
});
