// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendBlock, appendQuestion, blankBuilder, rich, type BlockType, type BuilderBlock, type BuilderEnvelope } from '../src/lib/builder-document';
import { BUILDER_BLOCK_REGISTRY } from '../src/lib/builder-element-registry';
import { BuilderElementInspector } from '../src/components/app/builder/builder-element-inspector';
import { BUILDER_INSPECTOR_ROUTES } from '../src/components/app/builder/builder-inspector-dispatch';

let root: Root;
let host: HTMLDivElement;
let draft: BuilderEnvelope;

function fixture(kind: BlockType, questionVariant?: 'single_choice' | 'short_answer') {
	draft = blankBuilder('tugas', 'course000000001');
	const id = appendBlock(draft, draft.document.activities[0].id, kind);
	let block = draft.document.activities[0].blocks.find((item) => item.id === id)!;
	if (kind === 'question_group' && questionVariant) {
		for (const qid of block.questionIds || []) {
			delete draft.document.questionsById[qid];
			delete draft.privateKeys.answersByQuestionId[qid];
		}
		const qid = appendQuestion(draft, questionVariant);
		block.questionIds = [qid];
		block = draft.document.activities[0].blocks.find((item) => item.id === id)!;
	}
	return block;
}

function mount(block: BuilderBlock, onChange?: (edit: (value: BuilderEnvelope) => void) => void) {
	host = document.createElement('div');
	document.body.append(host);
	root = createRoot(host);
	act(() => root.render(createElement(BuilderElementInspector, {
		block,
		envelope: draft,
		disabled: false,
		onChange: onChange ?? ((edit: (value: BuilderEnvelope) => void) => {
			const next = structuredClone(draft);
			edit(next);
			draft = next;
		}),
	})));
}

function click(name: string) {
	const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === name);
	expect(button, `button ${name}`).toBeTruthy();
	act(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(() => {
	if (root) act(() => root.unmount());
	host?.remove();
});

describe('registry-backed mounted inspector dispatch', () => {
	it('requires an explicit typed route for every persisted registry kind', () => {
		expect(Object.keys(BUILDER_INSPECTOR_ROUTES).sort()).toEqual(Object.keys(BUILDER_BLOCK_REGISTRY).sort());
	});

	it.each([
		['instructions', undefined, 'Isi instruksi'],
		['image', undefined, 'bd-media-editor'],
		['audio', undefined, 'bd-media-editor'],
		['video', undefined, 'bd-media-editor'],
		['reference', undefined, 'Tautan HTTPS'],
		['question_group', 'single_choice', 'Pertanyaan'],
		['question_group', 'short_answer', 'Pertanyaan'],
		['matching', undefined, 'Pernyataan'],
		['gap_passage', undefined, 'Susun teks dan isian'],
		['writing', undefined, 'Pertanyaan'],
		['reflection', undefined, 'Pertanyaan'],
		['acknowledgement', undefined, 'Teks konfirmasi'],
		['lesson', undefined, 'Tujuan'],
	] as const)('mounts %s %s controls and safely saves style edits', (kind, variant, expected) => {
		const block = fixture(kind, variant);
		const questionId = block.questionIds?.[0] || block.questionId;
		if (questionId) draft.privateKeys.answersByQuestionId[questionId].explanation = rich('PRIVATE_INSPECTOR_KEY');
		mount(block);
		click('Isi');
		if (expected === 'bd-media-editor') expect(host.querySelector('.bd-media-editor')).toBeTruthy();
		else expect(host.textContent).toContain(expected);
		click('Tampilan');
		const control = [...host.querySelectorAll<HTMLSelectElement>('.bd-appearance-controls select')]
			.find((select) => select.closest('label')?.textContent?.includes('Bayangan'));
		expect(control).toBeTruthy();
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(control, 'sm');
			control!.dispatchEvent(new Event('change', { bubbles: true }));
		});
		const savedBlock = draft.document.activities[0].blocks[0];
		expect(savedBlock.appearance?.shadow).toBe('sm');
		expect(JSON.stringify(draft.document)).not.toContain('PRIVATE_INSPECTOR_KEY');
		if (questionId) expect(draft.privateKeys.answersByQuestionId[questionId].explanation).toEqual(rich('PRIVATE_INSPECTOR_KEY'));
	});

	it('keeps an unknown legacy kind read-only and does not invoke mutation', () => {
		const block = { id: 'unknown001', type: 'future_widget', appearance: { shadow: 'sm' } } as unknown as BuilderBlock;
		const onChange = vi.fn();
		draft = blankBuilder('tugas', 'course000000001');
		mount(block, onChange);
		expect(host.querySelector('[role="status"]')?.textContent).toContain('tidak dapat diedit');
		expect(host.querySelector('textarea, input, select, button')).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
	});
});
