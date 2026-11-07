import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';
import { appendBlock, blankBuilder, builderWriteAction } from '../src/lib/builder-document';
import { builderThemePairContrast, builderThemePaletteStyle, normalizeBuilderDocumentTheme } from '../src/lib/builder-theme';

const palette = {
	palette: {
		light: { base: { foreground: '#102030', background: '#F0F1F2' }, accent: { foreground: '#FFFFFF', background: '#900000' } },
		dark: { base: { foreground: '#E0E1E2', background: '#101112' }, accent: { foreground: '#FFFFFF', background: '#770000' } },
	},
};

describe('lesson theme palette', () => {
	it('strictly accepts only the bounded light/dark base and accent hex pairs', () => {
		expect(normalizeBuilderDocumentTheme(palette)).toEqual(palette);
		for (const invalid of [
			{ ...palette, global: true },
			{ palette: { ...palette.palette, __proto__: { danger: true } } },
			{ palette: { ...palette.palette, light: { ...palette.palette.light, brand: palette.palette.light.base } } },
			{ palette: { ...palette.palette, light: { ...palette.palette.light, base: { foreground: 'red', background: '#FFFFFF' } } } },
		]) expect(() => normalizeBuilderDocumentTheme(invalid)).toThrow();
	});

	it('keeps legacy lessons unstyled and scopes independent palette variables to each rendered document', () => {
		const legacy = blankBuilder('kelas', 'course');
		appendBlock(legacy, legacy.document.activities[0].id, 'instructions');
		const plain = renderToStaticMarkup(createElement(BuilderPreview, { document: legacy.document }));
		expect(plain).not.toContain('bd-lesson-theme');
		const first = structuredClone(legacy); first.document.theme = normalizeBuilderDocumentTheme(palette);
		const second = structuredClone(legacy); second.document.theme = normalizeBuilderDocumentTheme({ palette: { ...palette.palette, light: { ...palette.palette.light, base: { foreground: '#000000', background: '#FFFF00' } } } });
		const html = renderToStaticMarkup(createElement('div', null,
			createElement(BuilderPreview, { document: first.document }),
			createElement(BuilderPreview, { document: second.document }),
		));
		expect(html.match(/class="bd-student-preview bd-lesson-theme"/g)).toHaveLength(2);
		expect(html).toContain('--bt-light-base-foreground:#102030');
		expect(html).toContain('--bt-light-base-foreground:#000000');
		expect(builderThemePaletteStyle(undefined)).toEqual({});
	});

	it('selects dark pairs only inside the lesson root and keeps node custom-color precedence', () => {
		const css = readFileSync(new URL('../src/styles/builder-appearance.css', import.meta.url), 'utf8');
		expect(css).toMatch(/\.bd-lesson-theme\s*\{[\s\S]*?--bd-theme-ink:\s*var\(--bt-light-base-foreground\)/);
		expect(css).toMatch(/:root\.dark\s+\.bd-lesson-theme\s*\{[\s\S]*?--bd-theme-ink:\s*var\(--bt-dark-base-foreground\)/);
		expect(css).toMatch(/\.bl-layout\s+\.bl-block\.ba-custom-colors\s*\{\s*background-color:\s*var\(--ba-custom-background\)/);
	});

	it('reports contrast for a text/background pair without claiming image or gradient coverage', () => {
		expect(builderThemePairContrast({ foreground: '#000000', background: '#FFFFFF' })).toBe(21);
	});

	it('selects the palette write fence for snapshots and templates containing lesson-level theme data', () => {
		expect(builderWriteAction('saveSnapshot', { themePalette: true })).toBe('themePalette:saveSnapshot');
		expect(builderWriteAction('saveTemplate', { themePalette: true })).toBe('themePalette:saveTemplate');
		expect(builderWriteAction('create', { document: { theme: palette } })).toBe('themePalette:create');
	});
});
