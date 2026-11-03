import { describe, expect, it } from 'vitest';
import { appendBlock, blankBuilder, encodeBuilderDraft, plain, questionIds, rich } from '../src/lib/builder-document';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { canvasTextKeyboardAction } from '../src/components/app/builder/builder-elements';

const domain = { exports: {} as { normalize: (value: unknown) => any } };
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'), { module: domain });

describe('canvas text authoring persistence', () => {
	it('enters editing only from selected content and exits on Escape without reverting edits', () => {
		expect(canvasTextKeyboardAction('Enter', false, false)).toBeNull();
		expect(canvasTextKeyboardAction('Enter', false, true)).toBe('edit');
		expect(canvasTextKeyboardAction('F2', false, true)).toBe('edit');
		expect(canvasTextKeyboardAction('Escape', true, true)).toBe('exit');
		expect(canvasTextKeyboardAction('Enter', true, true)).toBeNull();
		expect(canvasTextKeyboardAction('Escape', true, true, true)).toBeNull();
		expect(canvasTextKeyboardAction('Enter', false, true, true)).toBeNull();
	});

	it('keeps multiline and pasted markup as literal RichText text and preserves assessment identity', () => {
		const draft = blankBuilder('kelas', 'course000000001', 'meeting00000001');
		const activity = draft.document.activities[0];
		const questionBlockId = appendBlock(draft, activity.id, 'question_group');
		const questionBlock = activity.blocks.find(block => block.id === questionBlockId)!;
		const questionId = questionIds(questionBlock)[0];
		const originalKey = structuredClone(draft.privateKeys.answersByQuestionId[questionId]);
		const instructionsId = appendBlock(draft, activity.id, 'instructions');
		const instructions = activity.blocks.find(block => block.id === instructionsId)!;
		const acknowledgementId = appendBlock(draft, activity.id, 'acknowledgement');
		const acknowledgement = activity.blocks.find(block => block.id === acknowledgementId)!;
		const pasted = '<img src=x onerror=alert(1)>\nBaris kedua';
		instructions.body = rich(pasted);
		acknowledgement.body = rich('Saya memahami.\nLanjutkan.');

		const persisted = JSON.parse(encodeBuilderDraft(draft));
		expect(plain(persisted.document.activities[0].blocks.find((block: { id: string }) => block.id === instructions.id).body)).toBe(pasted);
		expect(plain(persisted.document.activities[0].blocks.find((block: { id: string }) => block.id === acknowledgement.id).body)).toBe('Saya memahami.\nLanjutkan.');
		expect(persisted.document.questionsById[questionId]).toEqual(draft.document.questionsById[questionId]);
		expect(persisted.privateKeys.answersByQuestionId[questionId]).toEqual(originalKey);
		expect(domain.exports.normalize(persisted)).toEqual(persisted);
	});
});
