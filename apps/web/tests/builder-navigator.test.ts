import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BuilderNavigatorTitle } from '../src/components/app/builder/builder-navigator-title';
import { appendBlock, blankBuilder, moveBuilderHistory, rich, type BuilderEnvelope } from '../src/lib/builder-document';
import { addLayoutGroup, findLayoutGroup, insertBlockIntoLayout } from '../src/lib/builder-layout';
import { finishNavigatorRename, navigatorTitle, renameNavigatorGroup, revealNavigatorAncestors, revealNavigatorCanvas } from '../src/lib/builder-navigator';

function fixture() {
	const draft = blankBuilder('kelas', 'course000000001', 'meeting00000001');
	const activity = draft.document.activities[0];
	const blockId = appendBlock(draft, activity.id, 'instructions');
	activity.blocks[0].body = rich('Educational content must stay intact');
	const sectionId = addLayoutGroup(activity, 'section');
	const containerId = addLayoutGroup(activity, 'container', sectionId);
	insertBlockIntoLayout(activity, blockId, containerId);
	return { draft, activity, blockId, sectionId, containerId };
}

describe('bounded navigator rename (pure helpers and static/source wiring)', () => {
	it.each(['sectionId', 'containerId'] as const)('commits trimmed %s only and roundtrips existing server bounds', key => {
		const context = fixture();
		const before = structuredClone(context.draft);
		const result = finishNavigatorRename('  Renamed group  ', 'commit');
		expect(result).toEqual({ kind: 'commit', title: 'Renamed group' });
		if (result.kind !== 'commit') throw new Error('Expected commit');
		expect(renameNavigatorGroup(context.draft, context.activity.id, context[key], result.title)).toBe(true);
		expect(findLayoutGroup(context.activity.layout!, context[key])?.title).toBe('Renamed group');
		expect(context.activity.blocks).toEqual(before.document.activities[0].blocks);
		expect(context.draft.privateKeys).toEqual(before.privateKeys);
		const domain = { exports: {} as { normalize: (input: unknown) => BuilderEnvelope } };
		runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'), { module: domain });
		expect(renameNavigatorGroup(context.draft, context.activity.id, context[key], 'x'.repeat(200))).toBe(true);
		expect(findLayoutGroup(domain.exports.normalize(context.draft).document.activities[0].layout!, context[key])?.title).toHaveLength(200);
	});
	it.each(['escape', 'blur'] as const)('cancels %s without a mutation', action => {
		const { draft } = fixture();
		const before = structuredClone(draft);
		expect(finishNavigatorRename('New title', action)).toEqual({ kind: 'cancel' });
		expect(draft).toEqual(before);
	});
	it.each(['', '   ', '\n\t', 'x'.repeat(201)])('rejects blank or oversized input', value => {
		const { draft, activity, sectionId } = fixture();
		const before = structuredClone(draft);
		expect(navigatorTitle(value)).toBeNull();
		expect(finishNavigatorRename(value, 'commit')).toEqual({ kind: 'invalid' });
		expect(renameNavigatorGroup(draft, activity.id, sectionId, value)).toBe(false);
		expect(draft).toEqual(before);
	});
	it.each(['read-only capability', 'recovery', 'conflict'])('blocks edits under %s', () => {
		const { draft, activity, sectionId } = fixture();
		const before = structuredClone(draft);
		expect(finishNavigatorRename('New title', 'commit', true)).toEqual({ kind: 'cancel' });
		expect(renameNavigatorGroup(draft, activity.id, sectionId, 'New title', true)).toBe(false);
		expect(draft).toEqual(before);
	});
	it('rejects stale IDs, block labels and unchanged titles', () => {
		const { draft, activity, sectionId, blockId } = fixture();
		const before = structuredClone(draft);
		expect(renameNavigatorGroup(draft, 'missing', sectionId, 'New')).toBe(false);
		expect(renameNavigatorGroup(draft, activity.id, 'missing', 'New')).toBe(false);
		expect(renameNavigatorGroup(draft, activity.id, blockId, 'New')).toBe(false);
		expect(renameNavigatorGroup(draft, activity.id, sectionId, findLayoutGroup(activity.layout!, sectionId)!.title)).toBe(false);
		expect(draft).toEqual(before);
	});
	it('supports one undo/redo using existing history, not workspace event evidence', () => {
		const { draft, activity, sectionId } = fixture();
		const next = structuredClone(draft);
		renameNavigatorGroup(next, activity.id, sectionId, 'New');
		const past = [draft], future: BuilderEnvelope[] = [];
		const undone = moveBuilderHistory(past, future, next);
		expect(undone).toEqual(draft);
		expect(past).toHaveLength(0);
		expect(moveBuilderHistory(past, future, undone, true)).toEqual(next);
		expect(past).toHaveLength(1);
		expect(future).toHaveLength(0);
	});
	it('renders explicit accessible rename actions and leaves selection enabled when blocked', () => {
		const props = { title: 'Bagian', columns: 1, selected: true, disabled: false, onSelect: vi.fn(), onMoveKey: vi.fn(), onRename: vi.fn() };
		expect(renderToStaticMarkup(createElement(BuilderNavigatorTitle, props))).toContain('aria-label="Ubah nama Bagian"');
		const blocked = renderToStaticMarkup(createElement(BuilderNavigatorTitle, { ...props, disabled: true }));
		expect(blocked.match(/disabled=""/g)).toHaveLength(1);
		expect(blocked).toContain('aria-current="true"');
	});
	it('wires F2, Enter, Escape, blur-cancel, IME guard and one guarded workspace change (source evidence)', () => {
		const title = readFileSync(new URL('../src/components/app/builder/builder-navigator-title.tsx', import.meta.url), 'utf8');
		for (const marker of ["event.key === 'F2'", "event.key === 'Enter'", "event.key === 'Escape'", 'onBlur={() => cancel(false)}', 'event.nativeEvent.isComposing']) expect(title).toContain(marker);
		const workspace = readFileSync(new URL('../src/components/app/builder/builder-workspace.tsx', import.meta.url), 'utf8');
		expect(workspace).toContain('change(next => { renameNavigatorGroup(');
		expect(workspace).toContain('if (!activity || locked || readOnly) return;');
		expect(workspace).toContain("id={'builder-group-' + group.id}");
		expect(workspace).not.toContain('document.querySelector(`[data-layout-node=');
	});
});

describe('navigator reveal (pure tree and mocked DOM evidence)', () => {
	it('opens every ancestor, retaining unrelated collapse and target collapse', () => {
		const { activity, sectionId, containerId, blockId } = fixture();
		expect(revealNavigatorAncestors(activity, blockId, [sectionId, containerId, 'unrelated'])).toEqual(['unrelated']);
		expect(revealNavigatorAncestors(activity, containerId, [sectionId, containerId, 'unrelated'])).toEqual([containerId, 'unrelated']);
		const unchanged = ['unrelated'];
		expect(revealNavigatorAncestors(activity, blockId, unchanged)).toBe(unchanged);
		expect(revealNavigatorAncestors(activity, 'missing', unchanged)).toBe(unchanged);
	});
	it.each(['group', 'block'] as const)('scrolls the exact %s canvas ID without selector interpolation or desktop focus theft', kind => {
		const target = { scrollIntoView: vi.fn(), focus: vi.fn() };
		const root = { getElementById: vi.fn().mockReturnValue(target) };
		expect(revealNavigatorCanvas({ kind, id: 'id"[]', focus: false }, root, false)).toBe(true);
		expect(root.getElementById).toHaveBeenCalledExactlyOnceWith(`builder-${kind}-id"[]`);
		expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'smooth' });
		expect(target.focus).not.toHaveBeenCalled();
	});
	it('honors reduced motion and explicit focus; missing targets are safe', () => {
		const target = { scrollIntoView: vi.fn(), focus: vi.fn() };
		revealNavigatorCanvas({ kind: 'block', id: 'target', focus: true }, { getElementById: vi.fn().mockReturnValue(target) }, true);
		expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'instant' });
		expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
		expect(revealNavigatorCanvas({ kind: 'group', id: 'gone', focus: true }, { getElementById: vi.fn().mockReturnValue(null) }, true)).toBe(false);
	});
	it('consumes only explicit reveal requests after render and prevents drawer focus restoration (source evidence)', () => {
		const workspace = readFileSync(new URL('../src/components/app/builder/builder-workspace.tsx', import.meta.url), 'utf8');
		expect(workspace).toContain('if (!canvasReveal || activityDrawer) return;');
		expect(workspace).toContain('}, [canvasReveal, activityDrawer]);');
		expect(workspace).toContain('onCloseAutoFocus={event => {');
		expect(workspace).toContain('drawerReveal.current = null;');
	});
});
