import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { layoutGroupClassName } from '../src/components/app/builder/builder-layout-view';
import {
	resolveActivityLayout,
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
});
