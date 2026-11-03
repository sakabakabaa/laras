import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parse } from 'postcss';
import { BuilderLayoutView, layoutGroupClassName } from '../src/components/app/builder/builder-layout-view';
import {
	resolveActivityLayout,
	setLayoutSide,
	type BuilderLayoutGroup,
} from '../src/lib/builder-layout';

const group: BuilderLayoutGroup = {
	kind: 'section',
	id: 'section',
	title: '',
	columns: 3,
	gap: 'md',
	padding: 'none',
	surface: 'none',
	children: [],
	responsive: { tablet: { columns: 2 }, mobile: { gap: 'sm' } },
};

const backend = {
	exports: {} as {
		normalize: (input: unknown) => {
			document: {
				activities: Array<{
					layout?: { nodes: Array<{ responsive?: unknown }> };
				}>;
			};
		};
	},
};
runInNewContext(
	readFileSync(
		new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url),
		'utf8',
	),
	{ module: backend },
);
function envelope(responsive: unknown) {
	return {
		document: {
			schemaVersion: 1,
			kind: 'kelas',
			context: { courseId: 'course', meetingId: '', sectionIds: [] },
			title: 'Title',
			instructions: { type: 'doc', content: [] },
			activities: [
				{
					id: 'activity',
					title: 'Activity',
					required: false,
					plannedMinutes: 0,
					blocks: [],
					layout: {
						schemaVersion: 1,
						nodes: [
							{
								kind: 'section',
								id: 'section',
								title: '',
								columns: 2,
								gap: 'md',
								padding: 'none',
								surface: 'none',
								...(responsive === undefined ? {} : { responsive }),
								children: [],
							},
						],
					},
				},
			],
			questionsById: {},
			delivery: {
				kind: 'kelas',
				progression: 'guided',
				timeZone: 'Asia/Jakarta',
				lateAfterMinutes: 0,
				timeLimitMinutes: 0,
			},
			scoring: {},
			results: {},
		},
		privateKeys: { schemaVersion: 1, answersByQuestionId: {} },
	};
}

describe('responsive group layout', () => {
	it('keeps legacy groups unchanged when device overrides are absent', () => {
		const activity = {
			id: 'a',
			blocks: [],
			layout: {
				schemaVersion: 1 as const,
				nodes: [{ ...group, responsive: undefined }],
			},
		} as never;
		expect(resolveActivityLayout(activity)[0]).toMatchObject({
			columns: 3,
			gap: 'md',
			padding: 'none',
		});
	});
	it('retains device overrides and emits render classes', () => {
		const activity = {
			id: 'a',
			blocks: [],
			layout: { schemaVersion: 1 as const, nodes: [group] },
		} as never;
		const resolved = resolveActivityLayout(activity)[0];
		expect(resolved).toMatchObject({
			responsive: { tablet: { columns: 2 }, mobile: { gap: 'sm' } },
		});
		expect(layoutGroupClassName(resolved as BuilderLayoutGroup)).toContain(
			'bl-tablet-cols-2',
		);
		expect(layoutGroupClassName(resolved as BuilderLayoutGroup)).toContain(
			'bl-mobile-gap-sm',
		);
	});
	it('renders bounded width and weighted columns through the shared layout resolver', () => {
		const activity = { id: 'a', blocks: [], layout: { schemaVersion: 1 as const, nodes: [{ ...group, width: 'contained' as const, maxWidth: 960, columnWeights: [2, 1, 1] as [number, number, number] }] } } as never;
		expect(resolveActivityLayout(activity)[0]).toMatchObject({ width: 'contained', maxWidth: 960, columnWeights: [2, 1, 1] });
		expect(layoutGroupClassName(resolveActivityLayout(activity)[0] as BuilderLayoutGroup)).toContain('bl-width-contained');
		const html = renderToStaticMarkup(createElement(BuilderLayoutView, { activity, renderBlock: () => null }));
		expect(html).toContain('style="--bl-max-width:960px;grid-template-columns:2fr 1fr 1fr"');
	});
	it('normalizes bounded overrides and rejects unsupported responsive fields', () => {
		const valid = backend.exports.normalize(
			envelope({ tablet: { columns: 2 }, mobile: { gap: 'sm' } }),
		);
		expect(valid.document.activities[0].layout?.nodes[0].responsive).toEqual({
			tablet: { columns: 2 },
			mobile: { gap: 'sm' },
		});
		expect(() =>
			backend.exports.normalize(envelope({ desktop: { columns: 2 } })),
		).toThrow();
		expect(() =>
			backend.exports.normalize(envelope({ mobile: { columns: 4 } })),
		).toThrow();
	});
	it('normalizes valid widths and ratios and rejects unsafe or mismatched values', () => {
		const input = envelope(undefined);
		const group = input.document.activities[0].layout.nodes[0] as Record<string, unknown>;
		group.width = 'contained'; group.maxWidth = 960; group.columnWeights = [2, 1];
		expect(backend.exports.normalize(input).document.activities[0].layout?.nodes[0]).toMatchObject({ width: 'contained', maxWidth: 960, columnWeights: [2, 1] });
		for (const [key, value] of [['width', 'wide'], ['maxWidth', 1e9], ['maxWidth', Number.POSITIVE_INFINITY], ['columnWeights', [2, 1, 1]]] as const) {
			const invalid = envelope(undefined); (invalid.document.activities[0].layout.nodes[0] as Record<string, unknown>)[key] = value;
			expect(() => backend.exports.normalize(invalid)).toThrow();
		}
	});
	it('normalizes linked or independent spacing including zero and rejects unsafe values', () => {
		const input = envelope({ tablet: { paddingSides: { left: 0, right: 12 }, paddingLinked: false, margin: { top: 4 }, marginLinked: true, rowGap: 0, columnGap: 16 }, mobile: { columnGap: 0 } });
		const group = input.document.activities[0].layout.nodes[0] as Record<string, unknown>;
		group.paddingSides = { top: 0, right: 12, bottom: 0, left: 12 }; group.paddingLinked = true;
		group.margin = { top: 8, right: 0, bottom: 8, left: 0 }; group.marginLinked = false;
		group.rowGap = 0; group.columnGap = 18;
		expect(backend.exports.normalize(input).document.activities[0].layout?.nodes[0]).toMatchObject({ paddingSides: { top: 0, right: 12, bottom: 0, left: 12 }, paddingLinked: true, margin: { top: 8, right: 0, bottom: 8, left: 0 }, marginLinked: false, rowGap: 0, columnGap: 18, responsive: { tablet: { paddingSides: { left: 0, right: 12 }, paddingLinked: false, margin: { top: 4 }, marginLinked: true, rowGap: 0, columnGap: 16 }, mobile: { columnGap: 0 } } });
		for (const [key, value] of [['rowGap', -1], ['columnGap', 81], ['paddingSides', { top: Number.POSITIVE_INFINITY }], ['margin', { inline: 4 }], ['rowGap', 'var(--danger)'], ['paddingLinked', 'yes']] as const) {
			const invalid = envelope(undefined); (invalid.document.activities[0].layout.nodes[0] as Record<string, unknown>)[key] = value;
			expect(() => backend.exports.normalize(invalid)).toThrow();
		}
	});
	it('renders per-side spacing and independent gaps as bounded pixel styles', () => {
		const activity = { id: 'a', blocks: [], layout: { schemaVersion: 1 as const, nodes: [{ ...group, paddingSides: { top: 0, right: 12 }, margin: { left: 6 }, rowGap: 0, columnGap: 20, responsive: { tablet: { paddingSides: { bottom: 8 }, rowGap: 4, columnGap: 0 }, mobile: { margin: { top: 2 } } } }] } } as never;
		const html = renderToStaticMarkup(createElement(BuilderLayoutView, { activity, renderBlock: () => null }));
		expect(html).toContain('--bl-pad-top:0px');
		expect(html).toContain('--bl-pad-right:12px');
		expect(html).toContain('--bl-tablet-pad-bottom:8px');
		expect(html).toContain('--bl-margin-left:6px');
		expect(html).toContain('--bl-mobile-margin-top:2px');
		expect(html).toContain('--bl-row-gap:0px');
		expect(html).toContain('--bl-column-gap:20px');
		expect(html).toContain('--bl-tablet-column-gap:0px');
	});
	it('roundtrips bounded flow fields and renders shared responsive classes', () => {
		const input = envelope({ tablet: { direction: 'column', align: 'center', distribute: 'between', wrap: false }, mobile: { direction: 'row' } });
		const node = input.document.activities[0].layout.nodes[0] as Record<string, unknown>;
		Object.assign(node, { direction: 'row', align: 'end', distribute: 'center', wrap: false });
		const normalized = backend.exports.normalize(input).document.activities[0].layout?.nodes[0];
		expect(normalized).toMatchObject({ direction: 'row', align: 'end', distribute: 'center', wrap: false, responsive: { tablet: { direction: 'column', align: 'center', distribute: 'between', wrap: false }, mobile: { direction: 'row' } } });
		const activity = { id: 'a', blocks: [], layout: { schemaVersion: 1 as const, nodes: [normalized as BuilderLayoutGroup] } } as never;
		const html = renderToStaticMarkup(createElement(BuilderLayoutView, { activity, renderBlock: () => null }));
		expect(html).toContain('bl-flow-row');
		expect(html).toContain('bl-tablet-flow-column');
		expect(html).toContain('bl-mobile-flow-row');
		expect(html).toContain('bl-wrap-no');
		const css = readFileSync(new URL('../src/styles/builder-responsive.css', import.meta.url), 'utf8');
		expect(css).toContain('.bl-layout .bl-group.bl-flow-row { flex-direction: row; flex-wrap: wrap; }');
		for (const [key, value] of [['direction', 'absolute'], ['align', 'baseline'], ['distribute', 'space-evenly'], ['wrap', 'yes']] as const) {
			const invalid = envelope(undefined); (invalid.document.activities[0].layout.nodes[0] as Record<string, unknown>)[key] = value;
			expect(() => backend.exports.normalize(invalid)).toThrow();
		}
		expect(() => backend.exports.normalize(envelope({ mobile: { direction: 'sideways' } }))).toThrow();
	});
	it.each([
		['inherited tablet row', 'grid', 'row', undefined, 390, 'column'],
		['phone breakpoint', 'grid', 'row', undefined, 600, 'column'],
		['tablet above phone breakpoint', 'grid', 'row', undefined, 601, 'row'],
		['tablet breakpoint', 'grid', 'row', undefined, 900, 'row'],
		['column base with tablet row', 'column', 'row', undefined, 390, 'column'],
		['tablet column over base row', 'row', 'column', undefined, 390, 'column'],
		['explicit phone row', 'grid', 'row', 'row', 390, 'row'],
		['explicit phone column', 'row', 'row', 'column', 390, 'column'],
	] as const)('resolves responsive flow for %s', (_label, direction, tablet, mobile, width, expected) => {
		const classes = new Set([
			'bl-layout',
			...layoutGroupClassName({
				...group,
				direction,
				responsive: {
					tablet: { direction: tablet },
					...(mobile ? { mobile: { direction: mobile } } : {}),
				},
			}).split(/\s+/),
		]);
		const stylesheet = parse(readFileSync(new URL('../src/styles/builder-responsive.css', import.meta.url), 'utf8'));
		let resolvedDirection = 'row';
		stylesheet.walkDecls('flex-direction', declaration => {
			const rule = declaration.parent;
			if (rule?.type !== 'rule') return;
			let ancestor = rule.parent;
			while (ancestor) {
				if (ancestor.type === 'atrule' && ancestor.name === 'container') {
					const limit = ancestor.params.match(/max-width:\s*(\d+)px/);
					if (!limit || width > Number(limit[1])) return;
				}
				ancestor = ancestor.parent;
			}
			if (rule.selectors.some(selector =>
				(selector.match(/\.[\w-]+/g) ?? []).every(className => classes.has(className.slice(1))),
			)) resolvedDirection = declaration.value;
		});
		expect(resolvedDirection).toBe(expected);
	});
	it('updates linked sides together and preserves independent sides when unlinked', () => {
		const target = { ...group };
		setLayoutSide(target, 'paddingSides', 'top', 0, true);
		expect(target.paddingSides).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
		setLayoutSide(target, 'paddingSides', 'right', 12, false);
		expect(target.paddingSides).toEqual({ top: 0, right: 12, bottom: 0, left: 0 });
		setLayoutSide(target, 'paddingSides', 'top', undefined, false);
		expect(target.paddingSides).toEqual({ right: 12, bottom: 0, left: 0 });
	});
});
