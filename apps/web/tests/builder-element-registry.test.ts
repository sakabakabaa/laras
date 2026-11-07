import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUILDER_ELEMENTS } from '../src/components/app/builder/builder-element-library';
import { appendBlock, appendQuestion, blankBuilder, type BlockType } from '../src/lib/builder-document';
import { BUILDER_BLOCK_REGISTRY, builderPlacementAllows, isBuilderRegistryKind } from '../src/lib/builder-element-registry';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';

const domain = { exports: {} as { normalize: (value: unknown) => any } };
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'), { module: domain });

describe('builder block registry', () => {
	it('covers every library variant without conflating library IDs and persisted kinds', () => {
		const kinds = new Set(Object.keys(BUILDER_BLOCK_REGISTRY));
		for (const element of BUILDER_ELEMENTS) expect(kinds.has(element.type)).toBe(true);
		expect(BUILDER_ELEMENTS.filter(element => element.type === 'question_group').map(element => element.id)).toEqual(['single_choice', 'short_answer']);
		expect(Object.keys(BUILDER_BLOCK_REGISTRY)).toHaveLength(12);
	});
	it('rejects unknown kinds and enforces supported placements', () => {
		expect(isBuilderRegistryKind('unknown')).toBe(false);
		for (const kind of Object.keys(BUILDER_BLOCK_REGISTRY)) {
			expect(builderPlacementAllows(kind, 'activity')).toBe(true);
			expect(builderPlacementAllows(kind, 'group')).toBe(true);
		}
		expect(builderPlacementAllows('unknown', 'activity')).toBe(false);
	});
	it('keeps the intentional PocketBase allowlist exhaustive and equal to the registry', () => {
		const source = readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8');
		const allowlist = source.match(/const types = \[([\s\S]*?)\];/)?.[1];
		expect(allowlist).toBeTruthy();
		const serverKinds = [...allowlist!.matchAll(/'([a-z_]+)'/g)].map(match => match[1]).sort();
		expect(serverKinds).toEqual(Object.keys(BUILDER_BLOCK_REGISTRY).sort());
	});
	it('creates, server-normalizes and renders every registered kind without exposing private keys', () => {
		for (const kind of Object.keys(BUILDER_BLOCK_REGISTRY) as BlockType[]) {
			const draft = blankBuilder('kelas', 'course000000001');
			const activity = draft.document.activities[0];
			const firstId = appendBlock(draft, activity.id, kind);
			const first = activity.blocks.find(block => block.id === firstId)!;
			const before = JSON.stringify(first);
			const secondId = appendBlock(draft, activity.id, kind);
			const second = activity.blocks.find(block => block.id === secondId)!;
			expect(firstId).not.toBe(secondId);
			expect(first).not.toBe(second);
			expect(JSON.stringify(first)).toBe(before);
			const questionRefs = first.questionIds || (first.questionId ? [first.questionId] : []);
			for (const questionId of questionRefs) {
				expect(draft.document.questionsById[questionId]).toBeTruthy();
				draft.privateKeys.answersByQuestionId[questionId].explanation = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'PRIVATE_REGISTRY_SENTINEL' }] }] };
			}
			const saved = domain.exports.normalize(draft);
			expect(saved.document.activities[0].blocks.map((block: {type:string}) => block.type)).toEqual([kind, kind]);
			expect(saved.privateKeys.answersByQuestionId).toEqual(draft.privateKeys.answersByQuestionId);
			const html = renderToStaticMarkup(createElement(BuilderPreview, { document: saved.document }));
			expect(html).not.toContain('PRIVATE_REGISTRY_SENTINEL');
		}
	});
	it('creates every existing library variant with its established question kind', () => {
		for (const element of BUILDER_ELEMENTS) {
			const draft = blankBuilder('kelas', 'course000000001');
			const activity = draft.document.activities[0];
			const id = appendBlock(draft, activity.id, element.type);
			const block = activity.blocks.find(item => item.id === id)!;
			if (element.shortAnswer) {
				for (const questionId of block.questionIds || []) {
					delete draft.document.questionsById[questionId];
					delete draft.privateKeys.answersByQuestionId[questionId];
				}
				block.questionIds = [appendQuestion(draft, 'short_answer')];
			}
			const questionId = block.questionIds?.[0];
			if (element.id === 'single_choice') expect(draft.document.questionsById[questionId!].kind).toBe('single_choice');
			if (element.id === 'short_answer') expect(draft.document.questionsById[questionId!].kind).toBe('short_answer');
			const normalized = domain.exports.normalize(draft);
			expect(normalized.document.activities[0].blocks[0].type).toBe(element.type);
			const html = renderToStaticMarkup(createElement(BuilderPreview, { document: normalized.document }));
			expect(html).not.toContain('PRIVATE_REGISTRY_SENTINEL');
		}
	});
	it('throws before mutating a document for an unknown kind', () => {
		const draft = blankBuilder('kelas', 'course000000001');
		const activity = draft.document.activities[0];
		expect(() => appendBlock(draft, activity.id, 'not-real' as BlockType)).toThrow('Unknown builder block kind');
		expect(activity.blocks).toHaveLength(0);
	});
});
