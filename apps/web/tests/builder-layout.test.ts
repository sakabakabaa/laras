import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	appendBlock,
	blankBuilder,
	duplicateActivity,
	duplicateBlock,
	removeBlock,
	rich,
	type BuilderEnvelope,
} from '../src/lib/builder-document';
import {
	LAYOUT_LIMITS,
	addLayoutGroup,
	ensureLayout,
	findLayoutGroup,
	insertBlockIntoLayout,
	moveBlockBetweenActivities,
	moveLayoutGroup,
	moveBlockBefore,
	moveLayoutItem,
	reparentLayoutItem,
	canMoveLayoutItem,
	reconcileActivityLayout,
	removeBlockFromLayout,
	removeLayoutGroup,
	resolveActivityLayout,
	flattenResolvedBlocks,
} from '../src/lib/builder-layout';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';

const domain = { exports: {} as { normalize: (value: unknown) => BuilderEnvelope } };
runInNewContext(
	readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'),
	{ module: domain },
);
const normalize = domain.exports.normalize;

function fixture() {
	const draft = blankBuilder('kelas', 'course000000001', 'meeting00000001');
	const activity = draft.document.activities[0];
	const first = appendBlock(draft, activity.id, 'instructions');
	const second = appendBlock(draft, activity.id, 'instructions');
	const third = appendBlock(draft, activity.id, 'instructions');
	draft.document.activities[0].blocks.find((block) => block.id === first)!.body = rich('Blok pertama');
	draft.document.activities[0].blocks.find((block) => block.id === second)!.body = rich('Blok kedua');
	draft.document.activities[0].blocks.find((block) => block.id === third)!.body = rich('Blok ketiga');
	return { draft, activity: draft.document.activities[0], first, second, third };
}

describe('builder layout tree', () => {
	it('keeps legacy documents flat and unchanged until a layout is authored', () => {
		const { draft, activity } = fixture();
		expect(activity.layout).toBeUndefined();
		expect(resolveActivityLayout(activity).map((node) => (node.kind === 'block' ? node.block.id : '')).filter(Boolean)).toEqual(activity.blocks.map((block) => block.id));
		expect(normalize(draft)).toEqual(draft);
	});

	it('renders nested sections and trailing unplaced blocks exactly once', () => {
		const { draft, activity, first, second, third } = fixture();
		const layout = ensureLayout(activity);
		const group = addLayoutGroup(activity, 'section', null, 2);
		const container = addLayoutGroup(activity, 'container', group, 1);
		const target = findLayoutGroup(layout, container)!;
		target.title = 'Kontainer dalam';
		findLayoutGroup(layout, group)!.title = 'Bagian utama';
		layout.nodes = [
			{ kind: 'block', blockId: first },
			{ ...findLayoutGroup(layout, group)! },
			{ kind: 'block', blockId: third },
		];
		const sectionNode = layout.nodes.find((node) => node.kind !== 'block' && node.id === group);
		if (!sectionNode || sectionNode.kind === 'block') throw new Error('expected group');
		sectionNode.children.push({ kind: 'block', blockId: second });
		removeBlockFromLayout(activity, second);
		insertBlockIntoLayout(activity, second, container);
		expect(flattenResolvedBlocks(resolveActivityLayout(activity)).map((block) => block.id)).toEqual([
			first,
			second,
			third,
		]);
		const html = renderToStaticMarkup(createElement(BuilderPreview, { document: draft.document }));
		expect(html).toContain('data-layout-node="' + group + '"');
		expect(html).toContain('data-layout-node="' + container + '"');
		expect(html).not.toContain('Bagian utama');
		expect(html).not.toContain('Kontainer dalam');
		expect(html.indexOf('Blok pertama')).toBeLessThan(html.indexOf('Blok kedua'));
		expect(html.indexOf('Blok kedua')).toBeLessThan(html.indexOf('Blok ketiga'));
		expect(html.match(/Blok kedua/g)).toHaveLength(1);
		expect(html.match(/Blok ketiga/g)).toHaveLength(1);
	});

	it('round trips validated layout through server normalization', () => {
		const { draft, activity, first, second } = fixture();
		const group = addLayoutGroup(activity, 'container', null, 3);
		findLayoutGroup(activity.layout!, group)!.title = 'Tiga kolom';
		insertBlockIntoLayout(activity, first, group);
		insertBlockIntoLayout(activity, second, group);
		expect(normalize(draft)).toEqual(draft);
		const normalized = normalize(draft);
		expect(normalized.document.activities[0].layout?.nodes).toHaveLength(activity.layout!.nodes.length);
		expect(JSON.stringify(normalized.document)).toContain('Tiga kolom');
	});

	it('moves, duplicates and removes layout content without hiding questions', () => {
		const { draft, activity, first, second } = fixture();
		const questionBlock = appendBlock(draft, activity.id, 'question_group') as string;
		const questionId = activity.blocks.find((block) => block.id === questionBlock)!.questionIds![0];
		const group = addLayoutGroup(activity, 'section', null, 2);
		findLayoutGroup(activity.layout!, group)!.responsive = { tablet: { columns: 1 }, mobile: { gap: 'sm' } };
		insertBlockIntoLayout(activity, first, group);
		insertBlockIntoLayout(activity, questionBlock, group);
		const duplicated = duplicateActivity(draft, activity.id);
		const copy = draft.document.activities.find((item) => item.id === duplicated)!;
		const copyRefs = flattenResolvedBlocks(resolveActivityLayout(copy)).map((block) => block.id);
		expect(copyRefs).toContain(copy.blocks.find((block) => block.type === 'question_group')!.id);
		expect(copyRefs).not.toContain(questionBlock);
		expect(copy.layout!.nodes.some((node) => node.kind !== 'block')).toBe(true);
		expect(copy.layout!.nodes.find((node) => node.kind !== 'block')).toMatchObject({ responsive: { tablet: { columns: 1 }, mobile: { gap: 'sm' } } });
		const copyQuestion = copy.blocks.find((block) => block.type === 'question_group')!.questionIds![0];
		expect(copyQuestion).not.toBe(questionId);
		expect(() => normalize(draft)).not.toThrow();
		removeBlock(draft, activity.id, questionBlock);
		expect(flattenResolvedBlocks(resolveActivityLayout(activity)).map((block) => block.id)).not.toContain(questionBlock);
		expect(activity.blocks.map((block) => block.id)).toContain(second);
	});

	it('flattens a removed container without deleting its children', () => {
		const { activity, first, second } = fixture();
		const group = addLayoutGroup(activity, 'section', null, 2);
		const nested = addLayoutGroup(activity, 'container', group, 1);
		insertBlockIntoLayout(activity, first, group);
		insertBlockIntoLayout(activity, second, nested);
		expect(removeLayoutGroup(activity, group)).toBe(true);
		const ids = flattenResolvedBlocks(resolveActivityLayout(activity)).map((block) => block.id);
		expect(ids).toContain(first);
		expect(ids).toContain(second);
		expect(findLayoutGroup(activity.layout!, group)).toBeNull();
		expect(
			activity.layout!.nodes.some(
				(node) => node.kind !== 'block' && node.id === nested,
			),
		).toBe(true);
	});

	it('blocks cyclic reparenting and depth overflow', () => {
		const { activity } = fixture();
		const outer = addLayoutGroup(activity, 'section', null, 2);
		const inner = addLayoutGroup(activity, 'container', outer, 2);
		expect(moveLayoutGroup(activity, outer, inner)).toBe(false);
		const deep = addLayoutGroup(activity, 'section', inner, 2);
		expect(deep).not.toBe('');
		expect(addLayoutGroup(activity, 'container', deep, 2)).toBe('');
		expect(moveLayoutGroup(activity, inner, deep)).toBe(false);
		expect(LAYOUT_LIMITS.maxDepth).toBe(3);
	});

	it('moves a populated group to the deepest allowed group level', () => {
		const { draft, activity, first } = fixture();
		const outer = addLayoutGroup(activity, 'section');
		const inner = addLayoutGroup(activity, 'container', outer);
		const moving = addLayoutGroup(activity, 'container');
		insertBlockIntoLayout(activity, first, moving);
		expect(moveLayoutGroup(activity, moving, inner)).toBe(true);
		expect(() => normalize(draft)).not.toThrow();
	});

	it('inserts before nested blocks and keeps duplicates beside their original', () => {
		const { draft, activity, first, second } = fixture();
		const group = addLayoutGroup(activity, 'section');
		insertBlockIntoLayout(activity, first, group);
		const block = appendBlock(draft, activity.id, 'instructions');
		expect(moveBlockBefore(activity, block, first)).toBe(true);
		const copy = duplicateBlock(draft, activity.id, first);
		const children = findLayoutGroup(activity.layout!, group)!.children;
		expect(children).toEqual([
			{ kind: 'block', blockId: block },
			{ kind: 'block', blockId: first },
			{ kind: 'block', blockId: copy },
		]);
		expect(canMoveLayoutItem(activity, first, -1)).toBe(true);
		expect(canMoveLayoutItem(activity, copy, 1)).toBe(false);
		expect(moveLayoutItem(activity, first, -1)).toBe(true);
		expect(activity.blocks.some(item => item.id === second)).toBe(true);
		expect(() => normalize(draft)).not.toThrow();
	});

	it('places unassigned blocks before reparenting and preserves failed insertions', () => {
		const { draft, activity } = fixture();
		const group = addLayoutGroup(activity, 'section');
		const block = appendBlock(draft, activity.id, 'instructions');
		expect(reparentLayoutItem(activity, block, 'in')).toBe(true);
		expect(findLayoutGroup(activity.layout!, group)!.children).toContainEqual({ kind: 'block', blockId: block });
		expect(insertBlockIntoLayout(activity, block, 'missing-parent')).toBe(false);
		expect(findLayoutGroup(activity.layout!, group)!.children).toContainEqual({ kind: 'block', blockId: block });
		expect(() => normalize(draft)).not.toThrow();
	});

	it('moves across activities before the chosen target in flat and nested layouts', () => {
		const { draft, activity, first, second, third } = fixture();
		const target = structuredClone(activity);
		target.id = 'target-activity';
		target.blocks = [activity.blocks.find(block => block.id === third)!];
		activity.blocks = activity.blocks.filter(block => block.id !== third);
		draft.document.activities.push(target);
		expect(moveBlockBetweenActivities(activity, target, first, third)).toBe(true);
		expect(target.blocks.map(block => block.id)).toEqual([first, third]);
		const group = addLayoutGroup(target, 'container');
		insertBlockIntoLayout(target, third, group);
		expect(moveBlockBetweenActivities(activity, target, second, third)).toBe(true);
		expect(findLayoutGroup(target.layout!, group)!.children).toEqual([
			{ kind: 'block', blockId: second }, { kind: 'block', blockId: third },
		]);
		expect(moveBlockBetweenActivities(target, target, first)).toBe(false);
		const source = structuredClone(activity);
		source.id = 'third-activity';
		source.blocks = [target.blocks.find(block => block.id === first)!];
		target.blocks = target.blocks.filter(block => block.id !== first);
		reconcileActivityLayout(target);
		draft.document.activities.push(source);
		const emptyGroup = addLayoutGroup(target, 'container');
		expect(moveBlockBetweenActivities(source, target, first, undefined, emptyGroup)).toBe(true);
		expect(findLayoutGroup(target.layout!, emptyGroup)!.children).toEqual([{ kind: 'block', blockId: first }]);
		expect(() => normalize(draft)).not.toThrow();
	});

	it('keeps cross-activity moves and reconciliation reference-safe', () => {
		const { draft, activity, first, second } = fixture();
		const target = structuredClone(activity);
		target.id = 'activity0000002';
		target.blocks = [];
		target.layout = { schemaVersion: 1, nodes: [] };
		draft.document.activities.push(target);
		const group = addLayoutGroup(activity, 'section', null, 2);
		insertBlockIntoLayout(activity, first, group);
		expect(moveBlockBetweenActivities(activity, target, first)).toBe(true);
		expect(flattenResolvedBlocks(resolveActivityLayout(activity)).map((block) => block.id)).not.toContain(first);
		expect(resolveActivityLayout(target).some((node) => node.kind === 'block' && node.block.id === first)).toBe(true);
		expect(removeBlockFromLayout(activity, second)).toBe(true);
		activity.layout!.nodes.push({ kind: 'block', blockId: second });
		activity.blocks = activity.blocks.filter((block) => block.id !== second);
		expect(reconcileActivityLayout(activity)).toBe(true);
		expect(() => normalize(draft)).not.toThrow();
	});
});

describe('server layout validation', () => {
	function withLayout() {
		const { draft, activity, first, second } = fixture();
		const group = addLayoutGroup(activity, 'section', null, 2);
		insertBlockIntoLayout(activity, first, group);
		insertBlockIntoLayout(activity, second, group);
		return { draft, activity, first, second, group };
	}

	it('rejects foreign, duplicate, cyclic/depth and unsafe layout data', () => {
		const { draft, activity, group } = withLayout();
		const bad = structuredClone(draft);
		const layout = bad.document.activities[0].layout!;
		const section = layout.nodes.find((node) => node.kind !== 'block' && node.id === group)!;
		if (section.kind === 'block') throw new Error('expected group');
		(section.children[0] as { blockId: string }).blockId = 'missing00000001';
		expect(() => normalize(bad)).toThrow();
		const duplicate = structuredClone(draft);
		const duplicateSection = duplicate.document.activities[0].layout!.nodes.find((node) => node.kind !== 'block' && node.id === group)!;
		if (duplicateSection.kind === 'block') throw new Error('expected group');
		duplicateSection.children.push(structuredClone(duplicateSection.children[0]));
		expect(() => normalize(duplicate)).toThrow();
		const unsafe = structuredClone(draft) as any;
		const unsafeSection = unsafe.document.activities[0].layout.nodes.find((node: any) => node.id === group);
		unsafeSection.css = 'position:fixed;inset:0';
		unsafeSection.columns = 4;
		expect(() => normalize(unsafe)).toThrow();
		const duplicateId = structuredClone(draft);
		const duplicateIdSection = duplicateId.document.activities[0].layout!.nodes.find((node) => node.kind !== 'block' && node.id === group)!;
		if (duplicateIdSection.kind === 'block') throw new Error('expected group');
		duplicateIdSection.children.push({ kind: 'container', id: group, title: '', columns: 1, gap: 'md', padding: 'none', surface: 'none', children: [] });
		expect(() => normalize(duplicateId)).toThrow();
		const deep = structuredClone(draft);
		let parent = deep.document.activities[0].layout!.nodes.find((node) => node.kind !== 'block' && node.id === group)!;
		for (let depth = 0; depth < LAYOUT_LIMITS.maxDepth; depth++) {
			const next = { kind: 'container' as const, id: 'deep' + depth, title: '', columns: 1 as const, gap: 'md' as const, padding: 'sm' as const, surface: 'none' as const, children: [] };
			if (parent.kind === 'block') throw new Error('expected group');
			parent.children.push(next);
			parent = next;
		}
		expect(() => normalize(deep)).toThrow();
	});

	it('strips unknown layout fields instead of echoing arbitrary payloads', () => {
		const { draft, activity, group } = withLayout();
		const unsafe = structuredClone(draft) as any;
		const section = unsafe.document.activities[0].layout.nodes.find((node: any) => node.id === group);
		section.css = 'color:red';
		section.html = '<script>alert(1)</script>';
		section.style = { position: 'fixed' };
		const normalized = normalize(unsafe);
		const clean = normalized.document.activities[0].layout!.nodes.find((node) => node.kind !== 'block' && node.id === group)!;
		expect(clean).not.toHaveProperty('css');
		expect(clean).not.toHaveProperty('html');
		expect(clean).not.toHaveProperty('style');
		expect(activity.layout!.nodes).toHaveLength(activity.layout!.nodes.length);
	});

	it('keeps private keys out of the layout snapshot and preserves question identity', () => {
		const { draft, activity } = withLayout();
		const block = appendBlock(draft, activity.id, 'question_group');
		const questionId = activity.blocks.find((item) => item.id === block)!.questionIds![0];
		draft.privateKeys.answersByQuestionId[questionId].explanation = rich('PRIVATE SENTINEL');
		insertBlockIntoLayout(activity, block);
		const normalized = normalize(draft);
		expect(normalized.document.activities[0].layout).toBeDefined();
		expect(JSON.stringify(normalized.document)).not.toContain('PRIVATE SENTINEL');
		expect(normalized.document.questionsById[questionId]).toBeDefined();
		expect(normalized.privateKeys.answersByQuestionId[questionId]).toBeDefined();
	});
});
