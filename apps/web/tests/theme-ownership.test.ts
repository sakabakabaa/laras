import { readFileSync, readdirSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const styles = new URL('../src/styles/', import.meta.url);
const theme = postcss.parse(readFileSync(new URL('theme.css', styles), 'utf8'));

function tokens(selector: string) {
	const result = new Map<string, string>();
	theme.walkRules((rule) => {
		if (rule.selector !== selector) return;
		rule.walkDecls((declaration) => {
			result.set(declaration.prop, declaration.value);
		});
	});
	return result;
}

describe('global theme ownership', () => {
	it('owns the extracted palettes without feature stylesheet redefinitions', () => {
		for (const filename of readdirSync(styles).filter((name) => name.endsWith('.css') && name !== 'theme.css')) {
			const source = postcss.parse(readFileSync(new URL(filename, styles), 'utf8'));
			source.walkDecls(/^--(?:r-|p-)/, (declaration) => {
				expect(['--p-sidebar-width', '--p-sidebar-offset'], `${filename}: ${declaration.prop}`).toContain(declaration.prop);
			});
		}
	});

	it('contains only uniquely scoped theme definitions, not component styling', () => {
		const definitions = new Set<string>();
		theme.walkRules((rule) => {
			expect([':root', ':root.dark', '.ld-layout', ':root.dark .ld-layout']).toContain(rule.selector);
			rule.walkDecls((declaration) => {
				expect(declaration.prop.startsWith('--')).toBe(true);
				const key = `${rule.selector}:${declaration.prop}`;
				expect(definitions.has(key), key).toBe(false);
				definitions.add(key);
			});
		});
	});

	it('preserves both palettes and legacy and dialog aliases', () => {
		const light = tokens(':root');
		const dark = tokens(':root.dark');
		expect(light.get('--r-surface')).toBe('#ffffff');
		expect(dark.get('--r-surface')).toBe('#171b22');
		expect(light.get('--r-red-600')).toBe('#b3261e');
		expect(dark.get('--red')).toBe('#f07168');
		expect(light.get('--paper')).toBe('var(--r-canvas)');
		expect(light.get('--brand-900')).toBe('var(--r-red-900)');
		expect(dark.get('--brand-900')).toBe('#f07168');
		expect(light.get('--primary')).toBe('4 70% 29%');
		expect(dark.get('--primary')).toBe('4 83% 67%');
		expect(light.has('--r-focus-ring')).toBe(true);
		expect(dark.has('--r-focus-ring')).toBe(true);
		expect(tokens('.ld-layout').get('--p-canvas')).toBe('#f0efed');
		expect(tokens(':root.dark .ld-layout').get('--p-canvas')).toBe('#111419');
		expect(tokens(':root.dark .ld-layout').get('--p-action')).toBe('#a53830');
	});

	it.each([false, true])('keeps theme aliases resolvable without cycles (dark=%s)', (dark) => {
		const values = new Map([
			...tokens(':root'),
			...(dark ? tokens(':root.dark') : []),
			...tokens('.ld-layout'),
			...(dark ? tokens(':root.dark .ld-layout') : []),
		]);
		function resolve(property: string, ancestors: string[] = []): void {
			expect(ancestors, property).not.toContain(property);
			expect(values.has(property), property).toBe(true);
			for (const match of values.get(property)!.matchAll(/var\((--[\w-]+)/g)) {
				resolve(match[1], [...ancestors, property]);
			}
		}
		for (const property of values.keys()) resolve(property);
	});

	it('loads the theme once after the legacy global styles', () => {
		const root = readFileSync(new URL('../src/root.tsx', import.meta.url), 'utf8');
		expect(root).toContain("import theme from '@/styles/theme.css?url';");
		const links = root.slice(root.indexOf('export const links:'), root.indexOf("{ rel: 'icon'"));
		const hrefs = [...links.matchAll(/href:\s*(\w+)/g)].map((match) => match[1]);
		expect(root).toContain("import sharedComponents from '@/styles/shared-components.css?url';");
		expect(hrefs.filter((href) => href === 'theme')).toHaveLength(1);
		expect(hrefs.at(-1)).toBe('theme');
		expect(hrefs).toContain('redesignV1');
		expect(hrefs.indexOf('sharedComponents')).toBe(hrefs.indexOf('redesignV1') - 1);
		expect(hrefs.indexOf('sharedComponents')).toBeGreaterThan(hrefs.indexOf('themeReadabilityPass'));
		expect(hrefs).toContain('premiumWorkspace');
	});
});
