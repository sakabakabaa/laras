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
	appearanceDetailStyle,
	BUILDER_APPEARANCE_PRESETS,
	matchingAppearancePreset,
	PRESET_APPEARANCE_FIELDS,
	resetBuilderAppearance,
	resetResponsiveAppearance,
	resetDocumentAppearance,
	hasDocumentAppearanceToReset,
	contrastRatio,
	validHexColor,
	type BuilderAppearance,
} from '../src/lib/builder-appearance';
import {
	appendBlock,
	blankBuilder,
	newActivity,
	duplicateActivity,
	duplicateBlock,
	builderRequest,
	moveBuilderHistory,
	rich,
	type BuilderEnvelope,
} from '../src/lib/builder-document';
import pb from '../src/lib/pocketbase-client';
import {
	addLayoutGroup,
	findLayoutGroup,
	insertBlockIntoLayout,
} from '../src/lib/builder-layout';
import { guardedLayoutEdit } from '../src/lib/builder-layout-lock';
import { builderWriteAction } from '../src/lib/builder-document';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';
import {
	BuilderElementLibrary,
	BUILDER_ELEMENTS,
} from '../src/components/app/builder/builder-element-library';
import { BuilderAppearanceControls } from '../src/components/app/builder/builder-appearance-controls';
import { hasDetailedBorderRadius } from '../src/lib/builder-capability';

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
	it('resets appearance across activities and nested groups while preserving document data and is idempotent', () => {
		const { draft, activity, block, group } = fixture();
		const nestedId = addLayoutGroup(activity, 'container', group.id);
		const nestedBlockId = appendBlock(draft, activity.id, 'image');
		insertBlockIntoLayout(activity, nestedBlockId, nestedId);
		const second = newActivity('Kegiatan kedua');
		draft.document.activities.push(second);
		const secondBlockId = appendBlock(draft, second.id, 'reflection');
		const nested = findLayoutGroup(activity.layout!, nestedId)!;
		const background = { mode: 'image' as const, asset: { fileId: 'asset0000000001', filename: 'cover.png', version: 2, name: 'Cover' }, fit: 'cover' as const };
		group.background = structuredClone(background);
		group.responsive = { tablet: { columns: 2, background: structuredClone(background) }, mobile: { columns: 1, background: { mode: 'solid', token: 'surface-2' } } };
		group.appearance = { padding: 'lg', customColors: { light: { foreground: '#000000', background: '#FFFFFF' }, dark: { foreground: '#FFFFFF', background: '#000000' } }, borderDetail: { style: 'solid', widths: { top: 2 } }, corners: { topLeft: 8 }, shadow: 'md', hover: 'lift' };
		nested.appearance = { border: 'accent', radius: 'lg', shadow: 'sm', hover: 'emphasis' };
		block.appearance = { customColors: { light: { foreground: '#000000', background: '#FFFFFF' }, dark: { foreground: '#FFFFFF', background: '#000000' } }, borderDetail: { style: 'dotted' }, corners: { topLeft: 4 }, shadow: 'md', hover: 'lift' };
		const secondBlock = second.blocks.find(item => item.id === secondBlockId)!;
		const audioId = appendBlock(draft, second.id, 'audio');
		const audio = second.blocks.find(item => item.id === audioId)!;
		audio.captions = { language: 'id', cues: [{ start: 0, end: 1, text: 'Cue tetap' }] };
		audio.playback = { start: 0, end: 12, rate: 1.25, loop: true };
		secondBlock.appearance = { size: 'xl', color: 'accent', background: 'muted', padding: 'lg', border: 'accent', radius: 'lg', shadow: 'md', hover: 'emphasis' };
		secondBlock.asset = structuredClone(background.asset);
		draft.document.questionsById.keep = { id: 'keep', prompt: rich('question'), options: [], kind: 'short_answer' } as never;
		draft.privateKeys.answersByQuestionId.keep = { strategy: 'exact_text', accepted: ['keep'] };
		const before = structuredClone(draft);
		expect(hasDocumentAppearanceToReset(draft)).toBe(true);
		expect(resetDocumentAppearance(draft)).toBe(true);
		expect(block.appearance).toBeUndefined();
		expect(secondBlock.appearance).toBeUndefined();
		expect(group.appearance).toEqual({ padding: 'lg' });
		expect(nested.appearance).toBeUndefined();
		expect(group.background).toEqual(background);
		expect(group.responsive).toEqual(before.document.activities[0].layout && findLayoutGroup(before.document.activities[0].layout!, group.id)?.responsive);
		expect(group.paddingSides).toEqual(findLayoutGroup(before.document.activities[0].layout!, group.id)?.paddingSides);
		expect(secondBlock.asset).toEqual(before.document.activities[1].blocks[0].asset);
		expect(audio.captions).toEqual(before.document.activities[1].blocks.find(item => item.id === audioId)?.captions);
		expect(audio.playback).toEqual({ start: 0, end: 12, rate: 1.25, loop: true });
		expect(draft.document.questionsById).toEqual(before.document.questionsById);
		expect(draft.privateKeys).toEqual(before.privateKeys);
		expect(resetDocumentAppearance(draft)).toBe(false);
		expect(hasDocumentAppearanceToReset(draft)).toBe(false);
	});
	it('keeps preset values inside the appearance allowlist and reports exact or custom state', () => {
		expect(APPEARANCE_OPTIONS.shadow.values).toEqual({ none: 'Tanpa bayangan', sm: 'Lembut', md: 'Sedang' });
		expect(APPEARANCE_OPTIONS.hover.values).toEqual({ none: 'Tanpa efek', lift: 'Terangkat lembut', emphasis: 'Menonjol lembut' });
		for (const preset of Object.values(BUILDER_APPEARANCE_PRESETS)) {
			for (const [key, value] of Object.entries(preset.values)) {
				expect(APPEARANCE_FIELDS).toContain(key);
				expect(Object.hasOwn(APPEARANCE_OPTIONS[key as keyof BuilderAppearance].values, value)).toBe(true);
			}
		}
		expect(APPEARANCE_FIELDS).not.toContain('customColors');
		expect(PRESET_APPEARANCE_FIELDS).toEqual(['background', 'color', 'border', 'radius', 'padding']);
		for (const [name, preset] of Object.entries(BUILDER_APPEARANCE_PRESETS))
			expect(matchingAppearancePreset(preset.values as BuilderAppearance)).toBe(name);
		expect(matchingAppearancePreset({ ...BUILDER_APPEARANCE_PRESETS.note.values, size: 'lg' })).toBe('custom');
	});
	it('keeps legacy appearance neutral and handles hover defaults, preset, reset, and exact matching', () => {
		const { draft, block } = fixture();
		expect(normalize(draft).document.activities[0].blocks[0]).not.toHaveProperty('appearance');
		block.appearance = { shadow: 'md', hover: 'lift' };
		expect(appearanceClassName(block.appearance)).toBe('ba-shadow-md ba-hover-lift');
		expect(matchingAppearancePreset(block.appearance)).toBe('custom');
		const preset = applyAppearancePreset(block.appearance, 'default');
		expect(preset).toBeUndefined();
		expect(resetBuilderAppearance(block.appearance)).toBeUndefined();
		block.appearance = { hover: 'none' };
		expect(matchingAppearancePreset(block.appearance)).toBe('custom');
		expect(normalize(draft).document.activities[0].blocks[0].appearance).toEqual({ hover: 'none' });
	});
	it('uses safe transform-only hover rendering under device and motion guards', () => {
		const css = readFileSync(new URL('../src/styles/builder-appearance.css', import.meta.url), 'utf8');
		expect(css).toContain('@media (hover: hover) and (prefers-reduced-motion: no-preference)');
		expect(css).toContain('.ba-hover-lift:hover { transform: translateY(-2px); }');
		expect(css).toContain('.ba-hover-emphasis:hover { transform: scale(1.01); }');
		expect(css).not.toMatch(/ba-hover-[^{]+\{[^}]*box-shadow/s);
		expect(css).not.toMatch(/ba-hover-[^{]+\{[^}]*background/s);
		expect(css).not.toContain('cursor: pointer');
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
		const detailed = { borderDetail: { style: 'solid' as const, widths: { top: 2 } }, corners: { topLeft: 6 } };
		expect(resetBuilderAppearance(detailed)).toBeUndefined();
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
	it('uses versioned detailed-style actions for hover documents and snapshot/template writes', () => {
		const { draft, block } = fixture();
		block.appearance = { hover: 'emphasis' };
		expect(builderWriteAction('save', { document: draft.document })).toBe('detailedStyles:save');
		expect(builderWriteAction('saveSnapshot', { document: draft.document })).toBe('detailedStyles:saveSnapshot');
		expect(builderWriteAction('saveTemplate', { document: draft.document })).toBe('detailedStyles:saveTemplate');
		expect(hasDetailedBorderRadius(draft)).toBe(true);
		expect(hasDetailedBorderRadius({ ...draft, document: { ...draft.document, activities: [{ ...draft.document.activities[0], blocks: [{ ...block, appearance: { shadow: 'md' } }] }] } })).toBe(true);
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
	it('round-trips complete theme pairs and rejects partial or executable values', () => {
		const { draft, block } = fixture();
		const customColors = {
			light: { foreground: '#172033', background: '#FFFFFF' },
			dark: { foreground: '#E8EDF4', background: '#151A20' },
		};
		block.appearance = { customColors };
		expect(normalize(draft).document.activities[0].blocks[0].appearance).toEqual({ customColors });
		for (const malformed of [
			{ light: { foreground: '#000000' }, dark: { foreground: '#FFFFFF', background: '#000000' } },
			{ light: { foreground: 'url(x)', background: '#FFFFFF' }, dark: customColors.dark },
			{ light: { foreground: '#000', background: '#FFFFFF' }, dark: customColors.dark },
			{ light: { foreground: '#000000', background: '#FFFFFF', opacity: 0 }, dark: customColors.dark },
		]) {
			block.appearance = { customColors: malformed } as unknown as BuilderAppearance;
			expect(() => normalize(draft)).toThrow('Warna harus berupa kode #RRGGBB lengkap.');
		}
	});
	it('round-trips bounded detailed borders and corners while rejecting unsafe values', () => {
		const { draft, block, group } = fixture();
		const detail = { borderDetail: { style: 'dashed' as const, color: 'action' as const, linked: false, widths: { top: 0, right: 2.5, bottom: 8, left: 1 } }, corners: { linked: false, topLeft: 0, topRight: 12, bottomRight: 48, bottomLeft: 4 } };
		block.appearance = detail;
		group.appearance = structuredClone(detail);
		const normalized = normalize(draft).document.activities[0];
		expect(normalized.blocks[0].appearance).toEqual(detail);
		expect(findLayoutGroup(normalized.layout!, group.id)?.appearance).toEqual(detail);
		for (const invalid of [
			{ borderDetail: { style: 'double' } },
			{ borderDetail: { style: 'solid', color: 'url(x)' } },
			{ borderDetail: { style: 'solid', widths: { top: -1 } } },
			{ borderDetail: { style: 'solid', widths: { right: 8.01 } } },
			{ borderDetail: { style: 'solid', widths: { left: Number.NaN } } },
			{ borderDetail: { style: 'solid', widths: { left: 2, css: 'fixed' } } },
			{ corners: { topLeft: 49 } },
			{ corners: { topRight: Number.POSITIVE_INFINITY } },
			{ corners: { opacity: 1 } },
		]) {
			block.appearance = invalid as unknown as BuilderAppearance;
			expect(() => normalize(draft)).toThrow();
		}
	});
	it('retains responsive border and corner allowlists, legacy inheritance and explicit zero/none', () => {
		const { draft, block, group } = fixture();
		const responsive = { tablet: { borderDetail: { style: 'none' as const, linked: false, widths: { top: 0 } }, corners: { linked: false, topLeft: 0, bottomRight: 0 } }, mobile: { borderDetail: { style: 'solid' as const, color: 'action' as const, widths: { left: 0 } }, corners: { topLeft: 0, topRight: 48 } } };
		block.appearance = { borderDetail: { style: 'dashed', widths: { top: 2 } }, corners: { topLeft: 12 }, responsive };
		group.appearance = structuredClone(block.appearance);
		const normalized = normalize(draft).document.activities[0];
		expect(normalized.blocks[0].appearance).toEqual(block.appearance);
		expect(findLayoutGroup(normalized.layout!, group.id)?.appearance).toEqual(group.appearance);
		expect(appearanceDetailStyle(block.appearance)['--ba-tablet-border-top-width']).toBe('0px');
		expect(appearanceDetailStyle(block.appearance)['--ba-tablet-detail-border-style']).toBe('none');
		expect(appearanceDetailStyle(block.appearance)['--ba-mobile-border-left-width']).toBe('0px');
		const resetTablet = resetResponsiveAppearance(block.appearance, 'tablet')!;
		expect(resetTablet.responsive).toEqual({ mobile: responsive.mobile });
		expect(resetTablet.borderDetail).toEqual(block.appearance.borderDetail);
		expect(resetResponsiveAppearance(resetTablet, 'tablet')).toEqual(resetTablet);
		for (const bad of [
			{ ...responsive, desktop: { corners: { topLeft: 4 } } },
			{ ...responsive, mobile: { corners: { topLeft: 49 } } },
			{ ...responsive, mobile: { borderDetail: { style: 'solid', color: 'url(x)' } } },
			{ ...responsive, mobile: { corners: { topLeft: 4, css: 'position:fixed' } } },
		]) {
			block.appearance = { responsive: bad } as unknown as BuilderAppearance;
			expect(() => normalize(draft)).toThrow();
		}
	});
	it('writes an explicit responsive version marker for responsive document and saved-item commands', async () => {
		const send = vi.spyOn(pb, 'send').mockResolvedValue({} as never);
		try {
			expect(builderWriteAction('create', { document: { activities: [{ blocks: [{ appearance: { responsive: { mobile: { corners: { topLeft: 0 } } } } }] }] } })).toBe('responsiveStyles:create');
			await builderRequest('save', { document: { activities: [{ blocks: [{ appearance: { responsive: { tablet: { corners: { topLeft: 0 } } } } }] }] } });
			await builderRequest('saveSnapshot', { id: 'draft', responsiveBorderRadius: true });
			expect(send.mock.calls[0]?.[1]?.body).toMatchObject({ action: 'responsiveStyles:save', responsiveBorderRadius: true });
			expect(send.mock.calls[1]?.[1]?.body).toMatchObject({ action: 'responsiveStyles:saveSnapshot', responsiveBorderRadius: true });
		} finally { send.mockRestore(); }
	});
	it('requires the responsive version marker in the publish workspace and PocketBase delivery handler', () => {
		const workspace = readFileSync(new URL('../src/components/app/builder/builder-workspace.tsx', import.meta.url), 'utf8');
		const delivery = readFileSync(new URL('../../pocketbase/pb_hooks/builder-delivery.js', import.meta.url), 'utf8');
		expect(workspace).toContain("hasResponsiveDetails ? 'responsiveStyles:publish' : 'publish'");
		expect(workspace).toContain('...(hasResponsiveDetails ? { responsiveBorderRadius: true } : {})');
		expect(delivery).toContain("body.action === 'responsiveStyles:publish'");
		expect(delivery).toContain('body.responsiveBorderRadius !== true');
	});
	it('keeps responsive overrides intact when a rolled-back backend rejects the versioned save', async () => {
		const document = { activities: [{ blocks: [{ appearance: { responsive: { tablet: { borderDetail: { style: 'none', widths: { top: 0 } } } } } }] }] };
		const before = structuredClone(document);
		const send = vi.spyOn(pb, 'send').mockRejectedValue(new Error('Perintah builder tidak didukung.'));
		try {
			await expect(builderRequest('save', { document })).rejects.toThrow('Perintah builder tidak didukung');
			expect(send).toHaveBeenCalledWith('/api/laras/builder', expect.objectContaining({ body: expect.objectContaining({ action: 'responsiveStyles:save', responsiveBorderRadius: true, document }) }));
			expect(document).toEqual(before);
		} finally { send.mockRestore(); }
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
		group.appearance = { border: 'subtle', radius: 'md', customColors: { light: { foreground: '#172033', background: '#FFFFFF' }, dark: { foreground: '#E8EDF4', background: '#151A20' } } };
		const html = renderToStaticMarkup(
			createElement(BuilderPreview, { document: normalize(draft).document }),
		);
		expect(html).toContain('ba-size-xl ba-color-accent');
		expect(html).toContain('ba-border-subtle ba-radius-md');
		expect(html).toContain('ba-custom-colors');
		expect(html).toContain('--ba-custom-light-foreground:#172033');
		expect(readFileSync(new URL('../src/styles/builder-appearance.css', import.meta.url), 'utf8')).toContain(':root.dark .bl-layout .ba-custom-colors');
		expect(html).toContain('Materi yang ditata');
	});
	it('renders detailed styles on the shared block and group wrappers using theme tokens', () => {
		const { draft, block, group } = fixture();
		block.appearance = { borderDetail: { style: 'dotted', color: 'action', widths: { top: 2 } }, corners: { topLeft: 6 } };
		group.appearance = { borderDetail: { style: 'dashed', color: 'border', widths: { left: 3 } }, corners: { topRight: 10 } };
		const html = renderToStaticMarkup(createElement(BuilderPreview, { document: normalize(draft).document }));
		expect(html.match(/ba-has-border-detail/g)).toHaveLength(2);
		expect(html.match(/ba-has-corners/g)).toHaveLength(2);
		expect(html).toContain('--ba-detail-border-color:var(--r-action)');
		expect(html).toContain('--ba-border-left-width:3px');
		expect(html).toContain('--ba-corner-topRight:10px');
		const css = readFileSync(new URL('../src/styles/builder-appearance.css', import.meta.url), 'utf8');
		expect(css).toContain('.bl-layout .ba-has-border-detail');
		expect(css).toContain('.bl-layout .ba-has-corners');
		expect(css).not.toContain('overflow: hidden');
	});
	it('renders responsive detail on shared wrappers using activity container breakpoints and inherited values', () => {
		const { draft, block } = fixture();
		block.appearance = { borderDetail: { style: 'solid', color: 'action', widths: { top: 3 } }, corners: { topLeft: 18 }, responsive: { tablet: { borderDetail: { style: 'none', widths: { top: 0 } }, corners: { topLeft: 0 } }, mobile: { borderDetail: { style: 'dashed', widths: { left: 0 } } } } };
		const html = renderToStaticMarkup(createElement(BuilderPreview, { document: normalize(draft).document }));
		expect(html).toContain('ba-tablet-has-border-detail');
		expect(html).toContain('ba-mobile-has-border-detail');
		expect(html).toContain('--ba-mobile-border-left-width:0px');
		expect(html).toContain('--ba-tablet-corner-topLeft:0px');
		const css = readFileSync(new URL('../src/styles/builder-appearance.css', import.meta.url), 'utf8');
		expect(css).toContain('@container laras-activity (max-width: 900px)');
		expect(css).toContain('@container laras-activity (max-width: 600px)');
		expect(css).toContain('var(--ba-mobile-corner-topLeft, var(--ba-tablet-corner-topLeft, var(--ba-corner-topLeft, 0)))');
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

describe('custom theme color pairs', () => {
	it('validates strict canonical hex and known contrast vectors', () => {
		expect(validHexColor('#A1b2C3')).toBe(true);
		for (const value of ['red', '#fff', '#11223344', 'var(--x)', 'url(x)']) expect(validHexColor(value)).toBe(false);
		expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
		expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
		expect(contrastRatio('#777777', '#FFFFFF')).toBe(4.48);
	});
	it('clears pairs on preset and reset while keeping protected appearance fields', () => {
		const value: BuilderAppearance = { background: 'accent', customColors: { light: { foreground: '#000000', background: '#FFFFFF' }, dark: { foreground: '#FFFFFF', background: '#000000' } } };
		expect(applyAppearancePreset(value, 'default', ['background'])).toEqual({ background: 'accent' });
		expect(resetBuilderAppearance(value, ['background'])).toEqual({ background: 'accent' });
	});
	it('uses a rollback-safe versioned write for color-bearing documents and templates', () => {
		const document = { activities: [{ blocks: [{ appearance: { customColors: { light: {}, dark: {} } } }] }] };
		expect(builderWriteAction('save', { document })).toBe('themeColors:save');
		expect(builderWriteAction('create', { document })).toBe('themeColors:create');
		expect(builderWriteAction('saveTemplate', {})).toBe('themeColors:saveTemplate');
	});
	it('keeps the local custom-color draft when a rolled-back backend rejects the versioned command', async () => {
		const document = {
			activities: [{
				blocks: [{ appearance: {
					customColors: {
						light: { foreground: '#000000', background: '#FFFFFF' },
						dark: { foreground: '#FFFFFF', background: '#000000' },
					},
				} }],
			}],
		};
		const before = structuredClone(document);
		const send = vi.spyOn(pb, 'send').mockRejectedValue(new Error('Perintah builder tidak didukung.'));
		try {
			await expect(builderRequest('save', { document })).rejects.toThrow('Perintah builder tidak didukung');
			expect(send).toHaveBeenCalledWith('/api/laras/builder', expect.objectContaining({ body: expect.objectContaining({ action: 'themeColors:save', document }) }));
			expect(document).toEqual(before);
		} finally { send.mockRestore(); }
	});
});

describe('detailed border rollback command', () => {
	it('uses one versioned command for document and snapshot/template payloads', () => {
		const document = { activities: [{ blocks: [{ appearance: { corners: { topLeft: 8 }, hover: 'lift' } }] }] };
		expect(builderWriteAction('save', { document })).toBe('detailedStyles:save');
		expect(builderWriteAction('create', { document })).toBe('detailedStyles:create');
		expect(builderWriteAction('saveSnapshot', { document })).toBe('detailedStyles:saveSnapshot');
		expect(builderWriteAction('saveTemplate', { document })).toBe('detailedStyles:saveTemplate');
	});
	it('retains local detail data when an older backend rejects the command', async () => {
		const document = { activities: [{ blocks: [{ appearance: { borderDetail: { style: 'solid', widths: { top: 2 } }, hover: 'emphasis' } }] }] };
		const before = structuredClone(document);
		const send = vi.spyOn(pb, 'send').mockRejectedValue(new Error('Perintah builder tidak didukung.'));
		try {
			await expect(builderRequest('save', { document })).rejects.toThrow('Perintah builder tidak didukung');
			expect(send).toHaveBeenCalledWith('/api/laras/builder', expect.objectContaining({ body: expect.objectContaining({ action: 'detailedStyles:save', document }) }));
			expect(document).toEqual(before);
		} finally { send.mockRestore(); }
	});
});
