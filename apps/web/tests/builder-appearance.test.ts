import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	APPEARANCE_OPTIONS,
	appearanceClassName,
	type BuilderAppearance,
} from '../src/lib/builder-appearance';
import {
	appendBlock,
	blankBuilder,
	duplicateActivity,
	duplicateBlock,
	rich,
	type BuilderEnvelope,
} from '../src/lib/builder-document';
import {
	addLayoutGroup,
	findLayoutGroup,
	insertBlockIntoLayout,
} from '../src/lib/builder-layout';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';
import {
	BuilderElementLibrary,
	BUILDER_ELEMENTS,
} from '../src/components/app/builder/builder-element-library';

const domain = {
	exports: {} as { normalize: (value: unknown) => BuilderEnvelope },
};
runInNewContext(
	readFileSync(
		new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url),
		'utf8',
	),
	{ module: domain },
);
const normalize = domain.exports.normalize;
function fixture() {
	const draft = blankBuilder('kelas', 'course000000001', 'meeting00000001');
	const activity = draft.document.activities[0];
	const blockId = appendBlock(draft, activity.id, 'instructions');
	const block = activity.blocks[0];
	block.body = rich('Materi yang ditata');
	const groupId = addLayoutGroup(activity, 'section');
	const group = findLayoutGroup(activity.layout!, groupId)!;
	insertBlockIntoLayout(activity, blockId, groupId);
	return { draft, activity, block, group };
}

describe('builder appearance persistence and rendering', () => {
	it('preserves every supported override through server normalization', () => {
		for (const [key, setting] of Object.entries(APPEARANCE_OPTIONS)) {
			for (const value of Object.keys(setting.values)) {
				const { draft, activity, block, group } = fixture();
				block.appearance = { [key]: value };
				group.appearance = { [key]: value };
				const normalized = normalize(draft).document.activities[0];
				expect(normalized.blocks[0].appearance).toEqual(block.appearance);
				expect(
					findLayoutGroup(normalized.layout!, group.id)?.appearance,
				).toEqual(group.appearance);
				expect(normalized.blocks[0].id).toBe(activity.blocks[0].id);
			}
		}
	});
	it('rejects invalid values and strips unsupported style fields', () => {
		const { draft, block, group } = fixture();
		block.appearance = { size: '999px' } as unknown as BuilderAppearance;
		expect(() => normalize(draft)).toThrow('Pengaturan tampilan');
		delete block.appearance;
		group.appearance = {
			background: 'url(https://invalid.test)',
		} as unknown as BuilderAppearance;
		expect(() => normalize(draft)).toThrow('Pengaturan tampilan');
		group.appearance = {
			border: 'subtle',
			css: 'position:fixed',
			hidden: true,
		} as BuilderAppearance;
		expect(
			findLayoutGroup(normalize(draft).document.activities[0].layout!, group.id)
				?.appearance,
		).toEqual({ border: 'subtle' });
		expect(
			appearanceClassName({
				size: 'bad class',
			} as unknown as BuilderAppearance),
		).toBe('');
	});
	it('keeps styles when duplicating blocks and entire activities', () => {
		const { draft, activity, block, group } = fixture();
		block.appearance = { size: 'lg', color: 'accent', padding: 'md' };
		group.appearance = { border: 'subtle', radius: 'lg' };
		const copiedBlockId = duplicateBlock(draft, activity.id, block.id);
		expect(
			activity.blocks.find((item) => item.id === copiedBlockId)?.appearance,
		).toEqual(block.appearance);
		const copiedActivityId = duplicateActivity(draft, activity.id);
		const copied = draft.document.activities.find(
			(item) => item.id === copiedActivityId,
		)!;
		expect(copied.blocks[0].appearance).toEqual(block.appearance);
		expect(JSON.stringify(copied.layout)).toContain('"radius":"lg"');
		expect(() => normalize(draft)).not.toThrow();
	});
	it('uses normalized styles in the shared preview without adding overrides to legacy documents', () => {
		const { draft, block, group } = fixture();
		expect(
			normalize(draft).document.activities[0].blocks[0],
		).not.toHaveProperty('appearance');
		expect(findLayoutGroup(normalize(draft).document.activities[0].layout!, group.id)).not.toHaveProperty('background');
		block.appearance = { size: 'xl', color: 'accent' };
		group.appearance = { border: 'subtle', radius: 'md' };
		const html = renderToStaticMarkup(
			createElement(BuilderPreview, { document: normalize(draft).document }),
		);
		expect(html).toContain('ba-size-xl ba-color-accent');
		expect(html).toContain('ba-border-subtle ba-radius-md');
		expect(html).toContain('Materi yang ditata');
	});
	it('round-trips bounded authored group backgrounds and renders shared theme CSS values', () => {
		const { draft, group } = fixture();
		group.background = { mode: 'gradient', from: 'action', to: 'surface', angle: 135, overlay: 'surface-2', opacity: 20 };
		const normalized = normalize(draft).document.activities[0];
		expect(findLayoutGroup(normalized.layout!, group.id)?.background).toEqual(group.background);
		const html = renderToStaticMarkup(createElement(BuilderPreview, { document: normalize(draft).document }));
		expect(html).toContain('linear-gradient(color-mix(in srgb, var(--r-surface-2) 20%, transparent), color-mix(in srgb, var(--r-surface-2) 20%, transparent)), linear-gradient(135deg, var(--r-action), var(--r-surface))');
		expect(html).not.toMatch(/privateKey|answerKey|correctAnswer|privateKeys/);
	});
	it('rejects invalid background token, angle, opacity and mode while stripping unknown fields', () => {
		const { draft, group } = fixture();
		group.background = { mode: 'gradient', from: 'blue', to: 'action', angle: 90 } as never;
		expect(() => normalize(draft)).toThrow('Warna gradien');
		group.background = { mode: 'gradient', from: 'action', to: 'surface', angle: 361 };
		expect(() => normalize(draft)).toThrow('0–360');
		group.background = { mode: 'gradient', from: 'action', to: 'surface', angle: 90, overlay: 'action', opacity: 61 };
		expect(() => normalize(draft)).toThrow('0–60');
		group.background = { mode: 'solid', token: 'surface-2', css: 'position:fixed' } as never;
		expect(findLayoutGroup(normalize(draft).document.activities[0].layout!, group.id)?.background).toEqual({ mode: 'solid', token: 'surface-2' });
	});
});

it('makes the full element palette searchable immediately in the sidebar and disables locked additions', () => {
	const html = renderToStaticMarkup(
		createElement(BuilderElementLibrary, {
			compact: true,
			disabled: true,
			target: 'Tujuan: Bagian 1',
			onAdd: vi.fn(),
			onDragStart: vi.fn(),
			onDragEnd: vi.fn(),
		}),
	);
	expect(html).toContain('aria-label="Cari elemen"');
	for (const element of BUILDER_ELEMENTS)
		expect(html).toContain(
			`aria-label="Tambah ${element.label.replaceAll('&', '&amp;')}"`,
		);
	expect(html).toContain('Tujuan: Bagian 1');
	expect(html).not.toContain('draggable="true"');
	expect(html).toContain('disabled=""');
});
