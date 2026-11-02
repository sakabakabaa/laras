import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/global-search-palette.css', import.meta.url), 'utf8');

function declarations(selector: string) {
	const parsed = postcss.parse(css);
	const rule = parsed.nodes.find((node) => node.type === 'rule' && node.selector === selector);
	return new Map(
		(rule?.nodes ?? [])
			.filter((node): node is postcss.Declaration => node.type === 'decl')
			.map((declaration) => [declaration.prop, declaration.value]),
	);
}

describe('global search palette layout', () => {
	it('keeps the input and category rows from shrinking while results scroll', () => {
		const input = declarations('.gs-input.gs-input');
		const categories = declarations('.gs-pills');
		const results = declarations('.gs-results');

		expect(input.get('flex')).toBe('none');
		expect(input.get('height')).toBe('58px');
		expect(input.get('min-height')).toBe('58px');
		expect(categories.get('flex')).toBe('none');
		expect(results.get('flex')).toBe('1 1 auto');
		expect(results.get('min-height')).toBe('0');
		expect(results.get('overflow')).toBe('auto');
	});
});
