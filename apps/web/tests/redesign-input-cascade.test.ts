import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const redesignCss = readFileSync(new URL('../src/styles/redesign-v1.css', import.meta.url), 'utf8');
const sharedCss = readFileSync(new URL('../src/styles/shared-components.css', import.meta.url), 'utf8');
const searchCss = readFileSync(new URL('../src/styles/global-search-palette.css', import.meta.url), 'utf8');

function rules(css: string) {
	const parsed = postcss.parse(css);
	const result = new Map<string, postcss.Rule>();
	parsed.walkRules((rule) => {
		result.set(rule.selector, rule);
	});
	return result;
}

function specificity(selector: string): [number, number, number] {
	let visible = '';
	for (let index = 0; index < selector.length; index++) {
		if (!selector.startsWith(':where(', index)) {
			visible += selector[index];
			continue;
		}
		let depth = 1;
		index += 7;
		for (; index < selector.length && depth; index++) {
			if (selector[index] === '(') depth++;
			if (selector[index] === ')') depth--;
		}
		index--;
	}
	const ids = visible.match(/#[\w-]+/g)?.length ?? 0;
	const classes = visible.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g)?.length ?? 0;
	const types = visible.replace(/::[\w-]+/g, 'x').match(/(?:^|[\s>+~,(])(?:[a-zA-Z][\w-]*|::[\w-]+)/g)?.length ?? 0;
	return [ids, classes, types];
}

describe('redesign input theme cascade', () => {
	it('keeps generic shell and portaled dialog input styling below composite control styles', () => {
		const redesign = rules(redesignCss);
		const shared = rules(sharedCss);
		const search = rules(searchCss);
		const shellControl = [...shared.keys()].find((selector) => selector.startsWith(':where(.ld-layout) :where(input:not'));
		const shellFocus = [...shared.keys()].find((selector) => selector.startsWith(':where(.ld-layout) :where(input:not') && selector.includes(':focus'));
		const dialogControl = [...shared.keys()].find((selector) => selector.startsWith(':where([role=\'dialog\']) :where(input:not'));
		const compositeFocus = shared.get('.ld-search-bar input:focus,\n.ms-search input:focus,\n.asst-composer-box .asst-input:focus,\n.gs-input input:focus');

		expect(shellControl).toBeDefined();
		expect(shellFocus).toBeDefined();
		expect(dialogControl).toBeDefined();
		expect(specificity(shellControl!)).toEqual([0, 0, 0]);
		expect(specificity(shellFocus!)).toEqual([0, 0, 0]);
		expect(specificity(dialogControl!)).toEqual([0, 0, 0]);
		expect(specificity('.ld-greet .asst-input')).toEqual([0, 2, 0]);
		expect(specificity('.ld-search-bar input')).toEqual([0, 1, 1]);
		expect(specificity('.gs-input input')).toEqual([0, 1, 1]);
		expect(shared.has('.ld-greet .asst-input,\n.asst-drawer .asst-input')).toBe(true);
		expect(shared.has('.ld-search-bar input')).toBe(true);
		expect(search.has('.gs-input input')).toBe(true);
		expect(compositeFocus?.nodes?.filter((node) => node.type === 'decl').map((node) => (node as postcss.Declaration).prop)).toEqual(
			expect.arrayContaining(['border', 'box-shadow', 'outline']),
		);
		expect(compositeFocus?.nodes).toEqual(expect.arrayContaining([
			expect.objectContaining({ prop: 'border', value: '0' }),
			expect.objectContaining({ prop: 'box-shadow', value: 'none' }),
			expect.objectContaining({ prop: 'outline', value: '0' }),
		]));
		expect(specificity('.asst-composer-box .asst-input:focus')).toEqual([0, 3, 0]);
		expect(shared.get('.ld-search-bar:focus-within,\n.ms-search:focus-within')?.nodes).toEqual(expect.arrayContaining([
			expect.objectContaining({ prop: 'box-shadow', value: 'var(--r-focus-ring)' }),
		]));

		expect((shared.get(shellControl!)!.nodes ?? []).some((node) => node.type === 'decl' && node.prop === 'border')).toBe(true);
		expect((shared.get(shellFocus!)!.nodes ?? []).some((node) => node.type === 'decl' && node.prop === 'border-color')).toBe(true);
		expect((shared.get(dialogControl!)!.nodes ?? []).some((node) => node.type === 'decl' && node.prop === 'border')).toBe(true);
		expect([...redesign.keys()].some((selector) => selector.startsWith(':where(.ld-layout) :where(input:not'))).toBe(false);
		expect([...redesign.keys()].some((selector) => selector.startsWith(':where([role=\'dialog\']) :where(input:not'))).toBe(false);
	});
});
