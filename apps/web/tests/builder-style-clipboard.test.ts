import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BuilderStyleActions } from '../src/components/app/builder/builder-style-actions';
import { APPEARANCE_OPTIONS } from '../src/lib/builder-appearance';
import { appendBlock, blankBuilder, moveBuilderHistory, rich, type BuilderEnvelope } from '../src/lib/builder-document';
import { addLayoutGroup, findLayoutGroup, type BuilderLayoutBackground } from '../src/lib/builder-layout';
import { canPasteBuilderStyle, copyBuilderStyle, pasteBuilderStyle } from '../src/lib/builder-style-clipboard';

const domain = { exports: {} as { normalize: (value: unknown) => BuilderEnvelope } };
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'), { module: domain });

function fixture() {
	const draft = blankBuilder('kelas', 'course000000001', 'meeting00000001');
	const activity = draft.document.activities[0];
	const sourceId = appendBlock(draft, activity.id, 'instructions');
	const targetId = appendBlock(draft, activity.id, 'instructions');
	const source = activity.blocks[0], target = activity.blocks[1];
	source.body = rich('Sumber'); target.body = rich('Target');
	const sourceGroupId = addLayoutGroup(activity, 'section');
	const targetGroupId = addLayoutGroup(activity, 'section');
	const sourceGroup = findLayoutGroup(activity.layout!, sourceGroupId)!;
	const targetGroup = findLayoutGroup(activity.layout!, targetGroupId)!;
	return { draft, activity, source, target, sourceGroup, targetGroup,
		from: { activityId: activity.id, blockId: sourceId }, to: { activityId: activity.id, blockId: targetId },
		fromGroup: { activityId: activity.id, groupId: sourceGroup.id }, toGroup: { activityId: activity.id, groupId: targetGroup.id } };
}

const imageBackground = (fileId: string): BuilderLayoutBackground => ({ mode: 'image', asset: { fileId, filename: 'private.png', version: 1, name: 'Private' } });

describe('bounded builder style clipboard', () => {
	it('copies and pastes allowlisted shadow and hover values without other style data', () => {
		const { draft, source, target, from, to } = fixture();
		source.appearance = { shadow: 'sm', hover: 'lift' };
		const clipboard = copyBuilderStyle(draft, from)!;
		expect(clipboard.appearance).toEqual({ shadow: 'sm', hover: 'lift' });
		pasteBuilderStyle(draft, to, clipboard);
		expect(target.appearance).toEqual({ shadow: 'sm', hover: 'lift' });
	});
	it('clones and freezes snapshots, then independently clones each paste', () => {
		const { draft, sourceGroup, targetGroup, fromGroup, toGroup } = fixture();
		sourceGroup.appearance = { size: 'lg' };
		sourceGroup.paddingSides = { top: 12 };
		sourceGroup.columnWeights = [2, 1]; sourceGroup.columns = 2;
		sourceGroup.responsive = { mobile: { margin: { left: 8 } } };
		const clip = copyBuilderStyle(draft, fromGroup)!;
		sourceGroup.paddingSides.top = 24; sourceGroup.responsive.mobile!.margin!.left = 16;
		expect(Object.isFrozen(clip.layout?.responsive?.mobile?.margin)).toBe(true);
		pasteBuilderStyle(draft, toGroup, clip);
		expect(targetGroup.paddingSides).toEqual({ top: 12 });
		expect(targetGroup.responsive?.mobile?.margin).toEqual({ left: 8 });
		targetGroup.paddingSides!.top = 99; targetGroup.appearance!.size = 'sm';
		pasteBuilderStyle(draft, toGroup, clip);
		expect(targetGroup.paddingSides?.top).toBe(12);
		expect(targetGroup.appearance?.size).toBe('lg');
		expect(targetGroup.columnWeights).not.toBe(clip.layout?.columnWeights);
	});

	it('copies only supported appearance, not block content, assets, assessment or identity', () => {
		const { draft, source, target, from, to } = fixture();
		Object.assign(source, { appearance: { size: 'lg', customColors: { light: { foreground: '#111111', background: '#FFFFFF' }, dark: { foreground: '#EEEEEE', background: '#111111' } }, css: 'position:fixed', constructor: 'bad' }, asset: { fileId: 'secret' }, questionId: 'secret', sections: [{ id: 'secret' }], locked: true });
		const before = structuredClone(draft);
		const clip = copyBuilderStyle(draft, from)!;
		expect(canPasteBuilderStyle(draft, to, clip)).toBe(true);
		expect(clip).toEqual({ type: 'block:instructions', appearance: { size: 'lg', customColors: { light: { foreground: '#111111', background: '#FFFFFF' }, dark: { foreground: '#EEEEEE', background: '#111111' } } } });
		pasteBuilderStyle(draft, to, clip);
		expect(target).toEqual({ ...before.document.activities[0].blocks[1], appearance: { size: 'lg', customColors: { light: { foreground: '#111111', background: '#FFFFFF' }, dark: { foreground: '#EEEEEE', background: '#111111' } } } });
		expect(draft.privateKeys).toEqual(before.privateKeys);
		expect(draft.document.questionsById).toEqual(before.document.questionsById);
	});
	it('deep clones bounded border and corner detail', () => {
		const { draft, source, target, from, to } = fixture();
		source.appearance = { borderDetail: { style: 'dashed', color: 'action', linked: false, widths: { top: 2, left: 4 } }, corners: { linked: false, topLeft: 8, bottomRight: 12 } };
		const clip = copyBuilderStyle(draft, from)!;
		expect(clip.appearance).toEqual(source.appearance);
		pasteBuilderStyle(draft, to, clip);
		expect(target.appearance).toEqual(source.appearance);
		expect(target.appearance?.borderDetail?.widths).not.toBe(source.appearance?.borderDetail?.widths);
	});
	it('copies responsive border and corner details without copying device backgrounds or layout', () => {
		const { draft, sourceGroup, targetGroup, fromGroup, toGroup } = fixture();
		sourceGroup.appearance = { responsive: { tablet: { borderDetail: { style: 'none', widths: { top: 0 } } }, mobile: { corners: { topLeft: 0 } } } };
		sourceGroup.responsive = { tablet: { gap: 'lg' }, mobile: { background: imageBackground('source_mobile'), columns: 1 } };
		targetGroup.responsive = { tablet: { background: imageBackground('target_tablet'), gap: 'sm' }, mobile: { background: imageBackground('target_mobile') } };
		const before = structuredClone(targetGroup.responsive);
		const clip = copyBuilderStyle(draft, fromGroup)!;
		expect(clip.appearance?.responsive).toEqual(sourceGroup.appearance.responsive);
		pasteBuilderStyle(draft, toGroup, clip);
		expect(targetGroup.appearance?.responsive).toEqual(sourceGroup.appearance.responsive);
		expect(targetGroup.responsive?.tablet).toEqual({ ...before?.tablet, gap: 'lg' });
		expect(targetGroup.responsive?.mobile).toEqual({ ...before?.mobile, columns: 1 });
	});

	it('requires an exact block type or group kind and a real unique target', () => {
		const { draft, activity, from, to, fromGroup, toGroup, target } = fixture();
		const clip = copyBuilderStyle(draft, from)!;
		expect(canPasteBuilderStyle(draft, to, null)).toBe(false);
		expect(canPasteBuilderStyle(draft, toGroup, clip)).toBe(false);
		target.type = 'audio';
		expect(canPasteBuilderStyle(draft, to, clip)).toBe(false);
		const containerId = addLayoutGroup(activity, 'container');
		expect(canPasteBuilderStyle(draft, { activityId: activity.id, groupId: containerId }, copyBuilderStyle(draft, fromGroup))).toBe(false);
		const secondContainerId = addLayoutGroup(activity, 'container');
		const fromContainer = { activityId: activity.id, groupId: containerId };
		const toContainer = { activityId: activity.id, groupId: secondContainerId };
		findLayoutGroup(activity.layout!, containerId)!.appearance = { border: 'accent' };
		expect(pasteBuilderStyle(draft, toContainer, copyBuilderStyle(draft, fromContainer))).toBe(true);
		expect(findLayoutGroup(activity.layout!, secondContainerId)?.appearance).toEqual({ border: 'accent' });
		const before = structuredClone(draft);
		for (const selection of [{ ...to, activityId: 'missing' }, { ...to, blockId: 'missing' }, { ...to, groupId: toGroup.groupId }, { activityId: activity.id }]) {
			expect(pasteBuilderStyle(draft, selection, clip)).toBe(false);
		}
		expect(draft).toEqual(before);
	});

	it('resets absent source style rather than merging stale target overrides', () => {
		const { draft, source, target, from, to, sourceGroup, targetGroup, fromGroup, toGroup } = fixture();
		target.appearance = { shadow: 'md' };
		pasteBuilderStyle(draft, to, copyBuilderStyle(draft, from));
		expect(target.appearance).toBeUndefined();
		source.appearance = { color: 'accent' }; target.appearance = { shadow: 'md', size: 'xl' };
		pasteBuilderStyle(draft, to, copyBuilderStyle(draft, from));
		expect(target.appearance).toEqual({ color: 'accent' });
		targetGroup.maxWidth = 1200; targetGroup.paddingSides = { top: 20 }; targetGroup.responsive = { tablet: { gap: 'lg' } };
		pasteBuilderStyle(draft, toGroup, copyBuilderStyle(draft, fromGroup));
		expect(targetGroup).toEqual({ ...sourceGroup, id: targetGroup.id, title: targetGroup.title, children: targetGroup.children });
	});

	it('never copies or erases base or device protected backgrounds, even with style resets', () => {
		const { draft, sourceGroup, targetGroup, fromGroup, toGroup } = fixture();
		sourceGroup.background = imageBackground('source_base');
		sourceGroup.responsive = { tablet: { background: imageBackground('source_tablet'), gap: 'lg' }, mobile: { background: imageBackground('source_mobile') } };
		targetGroup.background = imageBackground('target_base');
		targetGroup.responsive = { mobile: { background: imageBackground('target_mobile'), padding: 'md' } };
		const before = structuredClone(targetGroup);
		const clip = copyBuilderStyle(draft, fromGroup)!;
		expect(JSON.stringify(clip)).not.toMatch(/source_|asset|background/);
		pasteBuilderStyle(draft, toGroup, clip);
		expect(targetGroup.background).toEqual(before.background);
		expect(targetGroup.responsive?.mobile).toEqual({ background: before.responsive?.mobile?.background });
		expect(targetGroup.responsive?.tablet).toEqual({ gap: 'lg' });
		delete sourceGroup.responsive;
		pasteBuilderStyle(draft, toGroup, copyBuilderStyle(draft, fromGroup));
		expect(targetGroup.responsive).toEqual({ mobile: { background: before.responsive?.mobile?.background } });
	});

	it('preserves group identity, children, title, unknown lock metadata and all non-style fields', () => {
		const { draft, sourceGroup, targetGroup, fromGroup, toGroup } = fixture();
		Object.assign(sourceGroup, { title: 'Do not copy', locked: true });
		Object.assign(targetGroup, { locked: false });
		const children = targetGroup.children;
		const before = structuredClone(targetGroup);
		sourceGroup.columns = 3; sourceGroup.appearance = { radius: 'lg' };
		pasteBuilderStyle(draft, toGroup, copyBuilderStyle(draft, fromGroup));
		expect(targetGroup).toMatchObject({ id: before.id, title: before.title, locked: false, columns: 3, appearance: { radius: 'lg' } });
		expect(targetGroup.children).toBe(children);
	});

	it.each(['conflict', 'recovery', 'read-only capability'])('does not copy or mutate when blocked by %s', () => {
		const { draft, source, from, to } = fixture();
		source.appearance = { weight: 'bold' };
		const clip = copyBuilderStyle(draft, from);
		const before = structuredClone(draft);
		expect(copyBuilderStyle(draft, from, true)).toBeNull();
		expect(canPasteBuilderStyle(draft, to, clip, true)).toBe(false);
		expect(pasteBuilderStyle(draft, to, clip, true)).toBe(false);
		expect(draft).toEqual(before);
	});

	it('makes one reversible history entry for the entire style paste', () => {
		const { draft, sourceGroup, fromGroup, toGroup } = fixture();
		sourceGroup.appearance = { color: 'accent' }; sourceGroup.paddingSides = { top: 24 };
		sourceGroup.responsive = { mobile: { columns: 1, rowGap: 8 } };
		const next = structuredClone(draft);
		pasteBuilderStyle(next, toGroup, copyBuilderStyle(draft, fromGroup));
		const past = [draft], future: BuilderEnvelope[] = [];
		const undone = moveBuilderHistory(past, future, next);
		expect(undone).toEqual(draft); expect(past).toHaveLength(0);
		expect(moveBuilderHistory(past, future, undone, true)).toEqual(next);
		expect(past).toHaveLength(1); expect(future).toHaveLength(0);
	});

	it('roundtrips all appearance tokens and safe responsive layout through existing normalization', () => {
		const { draft, source, from, to, sourceGroup, targetGroup, fromGroup, toGroup } = fixture();
		for (const [key, option] of Object.entries(APPEARANCE_OPTIONS)) {
			for (const value of Object.keys(option.values)) {
				source.appearance = { [key]: value };
				pasteBuilderStyle(draft, to, copyBuilderStyle(draft, from));
				expect(domain.exports.normalize(draft).document.activities[0].blocks[1].appearance).toEqual(source.appearance);
			}
		}
		Object.assign(sourceGroup, { columns: 2, columnWeights: [2, 1], width: 'contained', maxWidth: 1200, direction: 'grid', align: 'center', distribute: 'between', wrap: true, margin: { top: 12 }, marginLinked: true, paddingSides: { left: 8 }, paddingLinked: false, rowGap: 16, columnGap: 24, responsive: { mobile: { columns: 1, gap: 'sm', paddingSides: { top: 8 } } } });
		pasteBuilderStyle(draft, toGroup, copyBuilderStyle(draft, fromGroup));
		const normalized = domain.exports.normalize(draft);
		expect(findLayoutGroup(normalized.document.activities[0].layout!, targetGroup.id)).toEqual(targetGroup);
	});

	it('offers native buttons, disabled paste, associated explanation and live status without keyboard traps', () => {
		const html = renderToStaticMarkup(createElement(BuilderStyleActions, { disabled: false, canPaste: false, status: 'Gaya disalin.', onCopy: () => {}, onPaste: () => {} }));
		expect(html).toMatch(/<button[^>]*type="button"[^>]*>Salin gaya/);
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Tempel gaya/);
		expect(html).toContain('aria-describedby='); expect(html).toContain('role="status"');
		expect(html).toContain('gambar latar target tetap'); expect(html).not.toContain('tabindex');
		const blocked = renderToStaticMarkup(createElement(BuilderStyleActions, { disabled: true, canPaste: true, status: '', onCopy: () => {}, onPaste: () => {} }));
		expect(blocked.match(/disabled=""/g)).toHaveLength(2);
	});
});
