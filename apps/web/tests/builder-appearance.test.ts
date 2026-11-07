import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	applyAppearancePreset,
	APPEARANCE_OPTIONS,
	APPEARANCE_FIELDS,
	appearanceClassName,
	BUILDER_APPEARANCE_PRESETS,
	matchingAppearancePreset,
	PRESET_APPEARANCE_FIELDS,
	resetBuilderAppearance,
	type BuilderAppearance,
} from '../src/lib/builder-appearance';
import {
	appendBlock,
	blankBuilder,
	duplicateActivity,
	duplicateBlock,
	moveBuilderHistory,
	rich,
	type BuilderEnvelope,
} from '../src/lib/builder-document';
import {
	addLayoutGroup,
	findLayoutGroup,
	insertBlockIntoLayout,
} from '../src/lib/builder-layout';
import { guardedLayoutEdit } from '../src/lib/builder-layout-lock';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';
import {
	BuilderElementLibrary,
	BUILDER_ELEMENTS,
} from '../src/components/app/builder/builder-element-library';
import { BuilderAppearanceControls } from '../src/components/app/builder/builder-appearance-controls';

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
	it('keeps preset values inside the appearance allowlist and reports exact or custom state', () => {
		for (const preset of Object.values(BUILDER_APPEARANCE_PRESETS)) {
			for (const [key, value] of Object.entries(preset.values)) {
				expect(APPEARANCE_FIELDS).toContain(key);
				expect(Object.hasOwn(APPEARANCE_OPTIONS[key as keyof BuilderAppearance].values, value)).toBe(true);
			}
		}
		expect(PRESET_APPEARANCE_FIELDS).toEqual(['background', 'color', 'border', 'radius', 'padding']);
		for (const [name, preset] of Object.entries(BUILDER_APPEARANCE_PRESETS))
			expect(matchingAppearancePreset(preset.values as BuilderAppearance)).toBe(name);
		expect(matchingAppearancePreset({ ...BUILDER_APPEARANCE_PRESETS.note.values, size: 'lg' })).toBe('custom');
	});
	it('applies and resets only appearance data without aliasing or changing protected document fields', () => {
		const { draft, activity, block, group } = fixture();
		group.background = { mode: 'gradient', from: 'action', to: 'surface', angle: 135, overlay: 'surface-2', opacity: 20 };
		group.responsive = { tablet: { columns: 2, background: { mode: 'solid', token: 'surface-2' } }, mobile: { columns: 1, background: { mode: 'transparent' } } };
		group.paddingSides = { top: 18, right: 19, bottom: 20, left: 21 };
		group.layoutLocked = false;
		group.appearance = { padding: 'lg', size: 'xl' };
		block.layoutLocked = false;
		block.appearance = { size: 'xl' };
		const before = structuredClone(draft);
		const changed = applyAppearancePreset(block.appearance, 'highlight')!;
		group.appearance = applyAppearancePreset(group.appearance, 'exercise', ['padding']);
		expect(group.appearance?.padding).toBe('lg');
		expect(group.appearance?.size).toBeUndefined();
		expect(matchingAppearancePreset(group.appearance, ['padding'])).toBe('exercise');
		group.appearance = resetBuilderAppearance(group.appearance, ['padding']);
		expect(group.appearance).toEqual({ padding: 'lg' });
		expect(block.appearance).toEqual({ size: 'xl' });
		block.appearance = changed;
		expect(changed).toEqual(BUILDER_APPEARANCE_PRESETS.highlight.values);
		expect(matchingAppearancePreset(changed)).toBe('highlight');
		const reset = resetBuilderAppearance(block.appearance);
		block.appearance = reset;
		expect(reset).toBeUndefined();
		expect(resetBuilderAppearance(reset)).toBeUndefined();
		const afterWithoutAppearance = structuredClone(draft);
		delete afterWithoutAppearance.document.activities[0].blocks[0].appearance;
		delete before.document.activities[0].blocks[0].appearance;
		findLayoutGroup(before.document.activities[0].layout!, group.id)!.appearance = { padding: 'lg' };
		expect(afterWithoutAppearance).toEqual(before);
		expect(activity.blocks[0].layoutLocked).toBe(false);
		expect(group.layoutLocked).toBe(false);
		expect(group.paddingSides).toEqual({ top: 18, right: 19, bottom: 20, left: 21 });
	});
	it('renders accessible preset pressed state, custom state, and retained-background guidance', () => {
		const html = renderToStaticMarkup(createElement(BuilderAppearanceControls, {
			value: { ...BUILDER_APPEARANCE_PRESETS.note.values, size: 'lg' } as BuilderAppearance,
			onChange: vi.fn(),
			backgroundNotice: true,
		}));
		expect(html).toContain('aria-pressed="false"');
		expect(html).toContain('Kustom');
		expect(html).toContain('Latar kustom bagian dan latar responsif tetap dipertahankan');
		expect(html).toContain('Reset gaya');
	});
	it('records a style change once through the guarded history path and safely ignores a stale target', () => {
		const { draft, activity, block } = fixture();
		block.layoutLocked = true;
		const result = guardedLayoutEdit(draft, next => {
			const target = next.document.activities.find(item => item.id === activity.id)?.blocks.find(item => item.id === block.id);
			if (target) target.appearance = applyAppearancePreset(target.appearance, 'exercise');
		}, true);
		expect(result.reason).toBeNull();
		const next = result.next!;
		const past = [draft];
		const future: BuilderEnvelope[] = [];
		expect(moveBuilderHistory(past, future, next)).toBe(draft);
		expect(moveBuilderHistory(past, future, draft, true)).toBe(next);
		expect(past).toHaveLength(1);
		expect(next.document.activities[0].blocks[0].appearance).toEqual(BUILDER_APPEARANCE_PRESETS.exercise.values);
		const stale = guardedLayoutEdit(next, value => {
			const target = value.document.activities.find(item => item.id === activity.id)?.blocks.find(item => item.id === 'deleted-block');
			if (target) target.appearance = applyAppearancePreset(target.appearance, 'note');
		}, true).next!;
		expect(stale).toEqual(next);
	});
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
