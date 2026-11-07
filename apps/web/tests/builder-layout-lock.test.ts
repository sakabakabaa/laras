import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { appendBlock, blankBuilder, builderRequest, builderWriteAction, copyBuilder, duplicateActivity, duplicateBlock, encodeBuilderDraft, insertGroupTemplate, moveBuilderHistory, newActivity, removeBlock, rich, type BuilderEnvelope } from '../src/lib/builder-document';
import pb from '../src/lib/pocketbase-client';
import { addLayoutGroup, findLayoutGroup, insertBlockIntoLayout, moveBlockBetweenActivities, moveLayoutItem, removeLayoutGroup, reparentLayoutItem } from '../src/lib/builder-layout';
import { guardedLayoutEdit, hasLayoutLockFields, layoutLockState, layoutLockTransitionReason, LAYOUT_LOCK_CAPABILITY_REASON, LAYOUT_LOCK_REASON } from '../src/lib/builder-layout-lock';
import { applyBuilderProposal } from '../src/lib/builder-authoring';
import { usesEnhancedAuthoring } from '../src/lib/builder-capability';
import { BuilderLayoutLockControl } from '../src/components/app/builder/builder-layout-lock-control';
import { BuilderLayoutNavigator } from '../src/components/app/builder/builder-layout-panels';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';

const backend = { exports: {} as { normalize: (value: unknown) => BuilderEnvelope; extractGroupTemplate: (value: unknown, activityId: string, groupId: string) => BuilderEnvelope } };
const hooks = new URL('../../pocketbase/pb_hooks/', import.meta.url);
runInNewContext(readFileSync(new URL('builder-domain.js', hooks), 'utf8'), { module: backend });
const normalize = backend.exports.normalize;

function fixture() {
	const draft = blankBuilder('kelas', 'course000000001', 'meeting00000001');
	const activity = draft.document.activities[0];
	const outerId = addLayoutGroup(activity, 'section');
	const innerId = addLayoutGroup(activity, 'container', outerId);
	const otherId = addLayoutGroup(activity, 'section');
	const blockId = appendBlock(draft, activity.id, 'question_group');
	insertBlockIntoLayout(activity, blockId, innerId);
	const outsideId = appendBlock(draft, activity.id, 'instructions');
	insertBlockIntoLayout(activity, outsideId, otherId);
	const inner = findLayoutGroup(activity.layout!, innerId)!;
	inner.layoutLocked = true;
	return { draft, activity, inner, outerId, innerId, otherId, blockId, outsideId };
}

describe('shared editor-only layout lock mutation boundary', () => {
	it('sends the guarded command and retains the local draft when a rolled-back backend rejects it', async () => {
		const { draft } = fixture();
		const before = encodeBuilderDraft(draft);
		const send = vi.spyOn(pb, 'send').mockRejectedValue(new Error('Perintah builder tidak didukung.'));
		try {
			await expect(builderRequest('save', { ...draft, action: 'save' })).rejects.toThrow('Perintah builder tidak didukung');
			expect(send).toHaveBeenCalledWith('/api/laras/builder', expect.objectContaining({
				body: expect.objectContaining({ action: 'layoutLocks:save', document: draft.document }),
			}));
			expect(encodeBuilderDraft(draft)).toBe(before);
			expect(send).toHaveBeenCalledTimes(1);
		} finally {
			send.mockRestore();
		}
	});
	it('uses rollback-safe write commands independently of the initial capability handshake', () => {
		const { draft, inner } = fixture();
		for (const locked of [true, false]) {
			inner.layoutLocked = locked;
			for (const action of ['create', 'save'])
				expect(builderWriteAction(action, draft)).toBe(`layoutLocks:${action}`);
		}
		const flat = blankBuilder('kelas', 'course000000001');
		expect(builderWriteAction('save', flat)).toBe('save');
		for (const action of ['saveSnapshot', 'saveTemplate'])
			expect(builderWriteAction(action, { id: 'draft0000000001' })).toBe(`layoutLocks:${action}`);
		for (const action of ['get', 'list', 'savedGet', 'delete'])
			expect(builderWriteAction(action, draft)).toBe(action);
	});
	it('distinguishes own and inherited protection and protects ancestors without locking content', () => {
		const { draft, activity, inner, outerId, blockId } = fixture();
		expect(layoutLockState(activity, inner.id)).toEqual({ own: true, inheritedFrom: undefined, protectedStructure: true });
		expect(layoutLockState(activity, blockId)).toEqual({ own: false, inheritedFrom: inner.id, protectedStructure: true });
		expect(layoutLockState(activity, outerId).protectedStructure).toBe(true);
		const result = guardedLayoutEdit(draft, next => {
			next.document.questionsById[activity.blocks[0].questionIds![0]].prompt = rich('Edited assessment content');
			findLayoutGroup(next.document.activities[0].layout!, inner.id)!.title = 'Edited title';
		}, true);
		expect(result.reason).toBeNull();
		expect(result.next!.privateKeys).toEqual(draft.privateKeys);
		expect(inner.title).not.toBe('Edited title');
	});

	it.each(['block-delete', 'group-delete', 'ancestor-delete', 'ancestor-move', 'reparent', 'activity-delete', 'activity-reorder', 'cross-activity', 'replace', 'snapshot'] as const)('rejects actual %s helpers atomically', operation => {
		const { draft, activity, outerId, innerId, blockId } = fixture();
		draft.document.activities.push(newActivity('Other'));
		const before = encodeBuilderDraft(draft);
		const result = guardedLayoutEdit(draft, next => {
			const target = next.document.activities[0];
			if (operation === 'block-delete') removeBlock(next, activity.id, blockId);
			if (operation === 'group-delete') removeLayoutGroup(target, innerId);
			if (operation === 'ancestor-delete') removeLayoutGroup(target, outerId);
			if (operation === 'ancestor-move') moveLayoutItem(target, outerId, 1);
			if (operation === 'reparent') reparentLayoutItem(target, blockId, 'out');
			if (operation === 'activity-delete') next.document.activities.shift();
			if (operation === 'activity-reorder') next.document.activities.reverse();
			if (operation === 'cross-activity') moveBlockBetweenActivities(target, next.document.activities[1], blockId);
			if (operation === 'replace') applyBuilderProposal(next, blankBuilder('kelas', 'course000000001'), 'replace', activity.id);
			if (operation === 'snapshot') Object.assign(next, blankBuilder('kelas', 'course000000001'));
		}, true);
		expect(result).toEqual({ next: null, reason: LAYOUT_LOCK_REASON });
		expect(encodeBuilderDraft(draft)).toBe(before);
	});

	it.each(['block', 'group', 'move', 'template'] as const)('rejects %s insertion into a locked destination', operation => {
		const { draft, innerId, otherId, outsideId, activity } = fixture();
		const source = backend.exports.extractGroupTemplate(structuredClone(draft), activity.id, otherId);
		const result = guardedLayoutEdit(draft, next => {
			const target = next.document.activities[0];
			if (operation === 'group') addLayoutGroup(target, 'container', innerId);
			if (operation === 'block') insertBlockIntoLayout(target, appendBlock(next, target.id, 'instructions'), innerId);
			if (operation === 'move') insertBlockIntoLayout(target, outsideId, innerId);
			if (operation === 'template') insertGroupTemplate(next, target.id, innerId, { ...source, scope: 'group' });
		}, true);
		expect(result.reason).toBe(LAYOUT_LOCK_REASON);
	});

	it('rejects cross-activity insertion into a locked group and accepts unrelated unlocked destinations', () => {
		const { draft, innerId, otherId } = fixture();
		const other = newActivity('Other');
		draft.document.activities.push(other);
		const id = appendBlock(draft, other.id, 'instructions');
		expect(guardedLayoutEdit(draft, next => { moveBlockBetweenActivities(next.document.activities[1], next.document.activities[0], id, undefined, innerId); }, true).reason).toBe(LAYOUT_LOCK_REASON);
		expect(guardedLayoutEdit(draft, next => { moveBlockBetweenActivities(next.document.activities[1], next.document.activities[0], id, undefined, otherId); }, true).reason).toBeNull();
	});

	it('uses conservative sibling positions but allows unrelated adds; unlock then structural edit succeeds', () => {
		const { draft, innerId, otherId, blockId } = fixture();
		expect(guardedLayoutEdit(draft, next => { addLayoutGroup(next.document.activities[0], 'container', otherId); }, true).reason).toBeNull();
		expect(guardedLayoutEdit(draft, next => { next.document.activities[0].layout!.nodes.reverse(); }, true).reason).toBe(LAYOUT_LOCK_REASON);
		expect(guardedLayoutEdit(draft, next => {
			findLayoutGroup(next.document.activities[0].layout!, innerId)!.layoutLocked = false;
			removeBlock(next, next.document.activities[0].id, blockId);
		}, true).reason).toBe(LAYOUT_LOCK_REASON);
		const unlocked = guardedLayoutEdit(draft, next => { findLayoutGroup(next.document.activities[0].layout!, innerId)!.layoutLocked = false; }, true).next!;
		expect(guardedLayoutEdit(unlocked, next => { removeBlock(next, next.document.activities[0].id, blockId); }, true).reason).toBeNull();
	});

	it('protects flat legacy blocks without requiring a parallel layout system', () => {
		const draft = blankBuilder('kelas', 'course000000001');
		const activity = draft.document.activities[0];
		const id = appendBlock(draft, activity.id, 'instructions');
		activity.blocks[0].layoutLocked = true;
		appendBlock(draft, activity.id, 'instructions');
		expect(guardedLayoutEdit(draft, next => { next.document.activities[0].blocks.reverse(); }, true).reason).toBe(LAYOUT_LOCK_REASON);
		expect(guardedLayoutEdit(draft, next => { removeBlock(next, activity.id, id); }, true).reason).toBe(LAYOUT_LOCK_REASON);
		expect(guardedLayoutEdit(draft, next => { addLayoutGroup(next.document.activities[0], 'section'); }, true).reason).toBeNull();
	});

	it('also protects unassigned blocks rendered after layout roots, without altering source flags', () => {
		const { draft, activity, inner } = fixture();
		inner.layoutLocked = false;
		const unassignedId = appendBlock(draft, activity.id, 'instructions');
		activity.layout!.nodes = activity.layout!.nodes.filter(node => node.kind !== 'block' || node.blockId !== unassignedId);
		activity.blocks.find(block => block.id === unassignedId)!.layoutLocked = true;
		expect(layoutLockState(activity, unassignedId).own).toBe(true);
		expect(guardedLayoutEdit(draft, next => { removeBlock(next, activity.id, unassignedId); }, true).reason).toBe(LAYOUT_LOCK_REASON);
		expect(guardedLayoutEdit(draft, next => { next.document.activities = []; }, true).reason).toBe(LAYOUT_LOCK_REASON);
		expect(normalize(draft).document.activities[0].blocks.at(-1)!.layoutLocked).toBe(true);
	});

	it('duplicates into independent unlocked identities/keys without modifying the locked source', () => {
		const { draft, activity, inner, blockId } = fixture();
		activity.blocks[0].layoutLocked = true;
		const sourceKey = activity.blocks[0].questionIds![0];
		const result = guardedLayoutEdit(draft, next => { duplicateActivity(next, activity.id); }, true);
		expect(result.reason).toBeNull();
		const copy = result.next!.document.activities[1];
		expect(copy.id).not.toBe(activity.id);
		expect(copy.blocks[0].id).not.toBe(blockId);
		expect(copy.blocks[0].questionIds![0]).not.toBe(sourceKey);
		expect(result.next!.privateKeys.answersByQuestionId[copy.blocks[0].questionIds![0]]).toEqual(draft.privateKeys.answersByQuestionId[sourceKey]);
		expect(hasLayoutLockFields({ ...result.next!, document: { ...result.next!.document, activities: [copy] } })).toBe(false);
		expect(inner.layoutLocked).toBe(true);
		expect(guardedLayoutEdit(draft, next => { duplicateBlock(next, activity.id, blockId); }, true).reason).toBe(LAYOUT_LOCK_REASON);
		const independent = copyBuilder(draft, draft.document.kind, draft.document.context);
		expect(hasLayoutLockFields(independent)).toBe(false);
	});

	it('permits a locked root block duplicate after itself and refuses shifts of later protected siblings', () => {
		const draft = blankBuilder('kelas', 'course000000001');
		const activity = draft.document.activities[0];
		const id = appendBlock(draft, activity.id, 'instructions');
		activity.blocks[0].layoutLocked = true;
		const result = guardedLayoutEdit(draft, next => { duplicateBlock(next, activity.id, id); }, true);
		expect(result.reason).toBeNull();
		expect(result.next!.document.activities[0].blocks[1].layoutLocked).toBeUndefined();
		appendBlock(draft, activity.id, 'instructions');
		activity.blocks[1].layoutLocked = true;
		expect(guardedLayoutEdit(draft, next => { duplicateBlock(next, activity.id, id); }, true).reason).toBe(LAYOUT_LOCK_REASON);
	});

	it('retains existing single-change undo/redo, including nested own locks after ancestor unlock', () => {
		const { draft, innerId, blockId } = fixture();
		draft.document.activities[0].blocks[0].layoutLocked = true;
		const next = guardedLayoutEdit(draft, value => { findLayoutGroup(value.document.activities[0].layout!, innerId)!.layoutLocked = false; }, true).next!;
		const past = [draft], future: BuilderEnvelope[] = [];
		expect(layoutLockState(next.document.activities[0], blockId).own).toBe(true);
		expect(layoutLockState(next.document.activities[0], blockId).inheritedFrom).toBeUndefined();
		expect(moveBuilderHistory(past, future, next)).toBe(draft);
		expect(moveBuilderHistory(past, future, draft, true)).toBe(next);
		expect(past).toHaveLength(1);
	});
});

describe('round-trip, capability and student compatibility', () => {
	it.each([true, false])('preserves explicit %s source flags through JSON and actual server normalization', flag => {
		const { draft, innerId } = fixture();
		draft.document.activities[0].blocks[0].layoutLocked = flag;
		findLayoutGroup(draft.document.activities[0].layout!, innerId)!.layoutLocked = flag;
		const saved = normalize(JSON.parse(encodeBuilderDraft(draft)));
		expect(saved.document.activities[0].blocks[0].layoutLocked).toBe(flag);
		expect(findLayoutGroup(saved.document.activities[0].layout!, innerId)!.layoutLocked).toBe(flag);
		expect(saved.privateKeys).toEqual(draft.privateKeys);
		expect(usesEnhancedAuthoring(saved)).toBe(true);
	});

	it.each([null, 'true', 1, [], {}])('rejects invalid flag %j on blocks and groups instead of coercing it', flag => {
		const { draft, inner } = fixture();
		Object.assign(inner, { layoutLocked: flag });
		expect(() => normalize(draft)).toThrow('Kunci tata letak');
		delete inner.layoutLocked;
		Object.assign(draft.document.activities[0].blocks[0], { layoutLocked: flag });
		expect(() => normalize(draft)).toThrow('Kunci tata letak');
	});

	it('keeps absent legacy flags absent and refuses old-backend writes of any flag-bearing document', () => {
		const draft = blankBuilder('kelas', 'course000000001');
		const id = appendBlock(draft, draft.document.activities[0].id, 'instructions');
		const saved = normalize(draft);
		expect(saved.document.activities[0].blocks[0]).not.toHaveProperty('layoutLocked');
		expect(guardedLayoutEdit(saved, next => { next.document.activities[0].blocks[0].body = rich('Allowed'); }, false).reason).toBeNull();
		expect(guardedLayoutEdit(saved, next => { next.document.activities[0].blocks[0].layoutLocked = false; }, false).reason).toBe(LAYOUT_LOCK_CAPABILITY_REASON);
		saved.document.activities[0].blocks[0].layoutLocked = false;
		expect(usesEnhancedAuthoring(saved)).toBe(true);
		expect(guardedLayoutEdit(saved, next => { removeBlock(next, next.document.activities[0].id, id); }, false).reason).toBe(LAYOUT_LOCK_CAPABILITY_REASON);
	});

	it('does not alter shared student rendering, assessment keys, required status or access fields', () => {
		const { draft, inner } = fixture();
		const unlocked = structuredClone(draft);
		findLayoutGroup(unlocked.document.activities[0].layout!, inner.id)!.layoutLocked = false;
		const render = (value: BuilderEnvelope) => renderToStaticMarkup(createElement(BuilderPreview, { document: value.document }));
		expect(render(draft)).toBe(render(unlocked));
		expect(draft.privateKeys).toEqual(unlocked.privateKeys);
		expect(draft.document.activities[0].required).toBe(unlocked.document.activities[0].required);
		for (const file of ['builder-run.tsx', 'builder-classroom-blocks.tsx', 'builder-layout-view.tsx']) {
			expect(readFileSync(new URL(`../src/components/app/builder/${file}`, import.meta.url), 'utf8')).not.toContain('layoutLocked');
		}
	});
});

describe('accessible controls and actual workspace wiring evidence', () => {
	it('executes the real toggle handler as one guarded history change and refuses blocked handlers', () => {
		const { draft, activity, innerId } = fixture();
		const past: BuilderEnvelope[] = [], future: BuilderEnvelope[] = [];
		let current = draft;
		const onChange = vi.fn((edit: (next: BuilderEnvelope) => void) => {
			const result = guardedLayoutEdit(current, edit, true);
			if (result.next) { past.push(current); current = result.next; }
		});
		const props = { activity, nodeId: innerId, disabled: false, supported: true, onChange };
		const control = BuilderLayoutLockControl(props);
		control.props.children[0].props.onClick();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(findLayoutGroup(current.document.activities[0].layout!, innerId)!.layoutLocked).toBe(false);
		expect(past).toHaveLength(1);
		expect(moveBuilderHistory(past, future, current)).toBe(draft);
		expect(moveBuilderHistory(past, future, draft, true)).toBe(current);
		for (const guard of [{ disabled: true }, { supported: false }]) {
			const blocked = BuilderLayoutLockControl({ ...props, ...guard });
			blocked.props.children[0].props.onClick();
		}
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('advertises actual backend read support while retaining the enhanced-authoring gate for flat locks', () => {
		const module = { exports: {} as { handle: (app: unknown, user: unknown, body: unknown) => { layoutLocks?: boolean }; enhancedDocument: (document: unknown) => boolean } };
		runInNewContext(readFileSync(new URL('builder-service.js', hooks), 'utf8'), {
			module, __hooks: '', require: () => backend.exports,
			BadRequestError: Error, ForbiddenError: Error,
		});
		const draft = blankBuilder('kelas', 'course000000001');
		appendBlock(draft, draft.document.activities[0].id, 'instructions');
		draft.document.activities[0].blocks[0].layoutLocked = false;
		expect(module.exports.enhancedDocument(draft.document)).toBe(true);
		const record = {
			id: 'draft0000000001', getInt: () => 1, getBool: () => false,
			getString: (field: string) => field === 'document' ? JSON.stringify(draft.document) : field === 'owner' ? 'faculty' : '',
		};
		const app = {
			findRecordById: (collection: string) => collection === 'builder_documents' ? record : { getString: () => 'faculty' },
			findRecordsByFilter: () => [{ getString: () => JSON.stringify(draft.privateKeys) }],
		};
		expect(module.exports.handle(app, { id: 'faculty', getString: () => 'faculty' }, { action: 'get', id: 'draft0000000001' }).layoutLocks).toBe(true);
	});

	it('keeps own unlock enabled under inherited protection and clearly distinguishes the ancestor', () => {
		const { activity, blockId, inner } = fixture();
		activity.blocks[0].layoutLocked = true;
		const props = { activity, nodeId: blockId, disabled: false, supported: true, onChange: vi.fn() };
		const html = renderToStaticMarkup(createElement(BuilderLayoutLockControl, props));
		expect(html).toContain('aria-pressed="true"');
		expect(html).toContain('Buka kunci tata letak sendiri');
		expect(html).toContain(`Dilindungi kunci leluhur: ${inner.title}`);
		expect(html).not.toContain('disabled=""');
		for (const guard of [{ disabled: true }, { supported: false }]) {
			expect(renderToStaticMarkup(createElement(BuilderLayoutLockControl, { ...props, ...guard }))).toContain('disabled=""');
		}
	});

	it('disables protected ancestor structural navigator actions without disabling selection/rename', () => {
		const { activity, outerId } = fixture();
		const html = renderToStaticMarkup(createElement(BuilderLayoutNavigator, {
			activity, selectedNodeId: outerId, selectedBlockId: '', disabled: false,
			onRenameGroup: vi.fn(), onSelectGroup: vi.fn(), onSelectBlock: vi.fn(), onAddGroup: vi.fn(), onMove: vi.fn(), onReparent: vi.fn(), onRemoveGroup: vi.fn(),
		}));
		expect(html).toMatch(/aria-label="Naikkan"[^>]*disabled=""/);
		expect(html).toContain(LAYOUT_LOCK_REASON);
		expect(html).toContain('Ubah nama');
	});

	it('routes all structural edits through policy before history/install, and guards alternate install paths', () => {
		const workspace = readFileSync(new URL('../src/components/app/builder/builder-workspace.tsx', import.meta.url), 'utf8');
		const boundary = workspace.slice(workspace.indexOf('const change: Change'), workspace.indexOf('const authoringTools'));
		expect(boundary.indexOf('guardedLayoutEdit(prior, edit, layoutLocksSupportedRef.current)')).toBeLessThan(boundary.indexOf('past.current ='));
		expect(boundary).toContain('if (!next)');
		expect(boundary).toContain('recovery || conflict || readOnlyRef.current');
		expect(workspace).toContain('layoutLockTransitionReason(current.current, source, layoutLocksSupportedRef.current)');
		expect(workspace).toContain('layoutLockTransitionReason(current.current, recovery, layoutLocksSupportedRef.current)');
		expect(workspace).toContain('!layoutLocksSupportedRef.current && hasLayoutLockFields(current.current)');
		expect(workspace.match(/<BuilderLayoutLockControl /g)).toHaveLength(2);
		expect(workspace).toContain('layoutLocksSupportedRef.current = r.layoutLocks === true');
		expect(workspace).toContain('const layoutLockFallback = !layoutLocksSupported && hasLayoutLockFields(draft)');
		const service = readFileSync(new URL('builder-service.js', hooks), 'utf8');
		expect(service).toContain('layoutLocks: true');
		expect(service).toContain('b.layoutLocked !== undefined');
	});
});
