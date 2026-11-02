import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const styles = new URL('../src/styles/', import.meta.url);
const shared = readFileSync(new URL('shared-components.css', styles), 'utf8');
const redesign = readFileSync(new URL('redesign-v1.css', styles), 'utf8');
const palette = readFileSync(new URL('global-search-palette.css', styles), 'utf8');

describe('shared component stylesheet ownership and cascade', () => {
	it('owns the extracted surface, control, and portaled input rules once', () => {
		const sharedRules = new Set<string>();
		postcss.parse(shared).walkRules((rule) => {
			sharedRules.add(rule.selector);
		});
		const redesignRules = new Set<string>();
		postcss.parse(redesign).walkRules((rule) => {
			redesignRules.add(rule.selector);
		});
		for (const selector of ['.ld-panel,\n.ld-stat,\n.ld-document-side,\n.ld-settings-panel,\n.ld-courses-list-panel,\n.ld-schedule-card,\n.ld-coming-block', '.ld-btn-primary', ":where([role='dialog']) :where(input:not([type='checkbox']):not([type='radio']):not([type='range']), select, textarea)"]) {
			expect(sharedRules.has(selector)).toBe(true);
			expect(redesignRules.has(selector)).toBe(false);
		}
	});

	it('loads shared components before redesign refinements and theme last', () => {
		const root = readFileSync(new URL('../src/root.tsx', import.meta.url), 'utf8');
		const links = root.slice(root.indexOf('export const links:'), root.indexOf("{ rel: 'icon'"));
		const hrefs = [...links.matchAll(/href:\s*(\w+)/g)].map((match) => match[1]);
		expect(hrefs.indexOf('sharedComponents')).toBeLessThan(hrefs.indexOf('redesignV1'));
		expect(hrefs.indexOf('redesignV1')).toBeLessThan(hrefs.indexOf('theme'));
		expect(hrefs.at(-1)).toBe('theme');
		const touchStart = redesign.indexOf('/* ── 7. Touch targets');
		const printStart = redesign.indexOf('/* ── 10. Print');
		expect(touchStart).toBeGreaterThan(-1);
		expect(printStart).toBeGreaterThan(touchStart);
	});

	it('keeps the body portaled search palette on root semantic tokens with red category states', () => {
		expect(palette).not.toContain(':root.dark');
		expect(palette).not.toContain('var(--p-');
		expect(palette).toContain('background: var(--r-red-tint);');
		expect(palette).toContain('background: var(--r-red-700);');
		expect(palette).toContain('color: var(--r-ink);');
	});

	it('retires competing legacy search and composer theme rules', () => {
		for (const filename of ['../index.css', 'dark-overrides.css', 'premium-workspace.css']) {
			const source = readFileSync(new URL(filename, styles), 'utf8');
			postcss.parse(source).walkRules((rule) => {
				if (!rule.selector.includes(':focus-visible')) {
					expect(rule.selector).not.toMatch(/\.gs-(?:panel|input|pills|group|row-icon|foot)(?:\b|\s)/);
				}
				expect(rule.selector).not.toMatch(/\.asst-composer-box|\.asst-input(?:\b|:)/);
			});
		}
		expect(shared).toContain('box-shadow: var(--r-focus-ring)');
		expect(shared).toContain('.asst-composer-box:focus-within');
	});
});
