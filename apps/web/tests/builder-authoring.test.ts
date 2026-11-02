import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appendBuilderContent, builderFromAiProposal } from '../src/lib/builder-authoring';
import { appendBlock, blankBuilder, builderIssues, plain, questionIds, rich } from '../src/lib/builder-document';
import type { ScheduledAiProposal } from '../src/lib/scheduled-class-ai';

const domain = { exports: {} as { normalize: (value: unknown) => unknown } };
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'), { module: domain });
const context = { courseId: 'course000000001', meetingId: 'meeting00000001', sectionIds: ['section00000001'] };
const proposal: ScheduledAiProposal = {
	draft: { title: 'Meeting-based draft', instructions: 'Work independently', notes: ['Private teacher note'], activities: [
		{ kind: 'material', title: 'Read', content: 'Read the meeting material', minutes: 10, required: true, url: '', questions: [], materialIds: [], cpmkIds: [], subCpmkIds: [] },
		{ kind: 'quiz', title: 'Check understanding', content: '', minutes: 10, required: true, url: '', questions: [{ id: 'source-question', text: 'Which option?', options: ['One', 'Two'], correctIndex: 1, points: 2, explanation: 'PRIVATE EXPLANATION', sourceId: 'material1234567', sourceQuote: 'PRIVATE EVIDENCE QUOTE' }], materialIds: [], cpmkIds: [], subCpmkIds: [] },
		{ kind: 'assignment', title: 'Write', content: 'Write your response', minutes: 10, required: true, url: '', questions: [], materialIds: [], cpmkIds: [], subCpmkIds: [] },
		{ kind: 'exit_ticket', title: 'Reflect', content: 'What did you learn?', minutes: 5, required: true, url: '', questions: [], materialIds: [], cpmkIds: [], subCpmkIds: [] },
	] }, sources: [], model: 'configured', generatedAt: '', bundleId: '',
};

describe('in-builder authoring additions', () => {
	it('converts each AI activity to editable native blocks and keeps key evidence private', () => {
		const envelope = builderFromAiProposal(proposal, context);
		expect(domain.exports.normalize(envelope)).toEqual(envelope);
		expect(envelope.document.context).toEqual(context);
		expect(envelope.document.activities).toHaveLength(4);
		const quiz = envelope.document.activities[1].blocks[0];
		const questionId = questionIds(quiz)[0], question = envelope.document.questionsById[questionId];
		expect(envelope.privateKeys.answersByQuestionId[questionId].correctOptionId).toBe(question.options![1].id);
		expect(envelope.privateKeys.answersByQuestionId[questionId].review).toEqual({ source: 'inferred', confirmed: false });
		expect(builderIssues(envelope).some(issue => issue.message.includes('Tinjau kunci'))).toBe(true);
		const reflection = envelope.document.activities[3].blocks.find(block => block.type === 'reflection')!;
		expect(plain(envelope.document.questionsById[questionIds(reflection)[0]].prompt)).toBe('What did you learn?');
		const publicDocument = JSON.stringify(envelope.document);
		for (const secret of ['PRIVATE EXPLANATION', 'PRIVATE EVIDENCE QUOTE', 'Private teacher note', 'correctOptionId', 'confirmed']) expect(publicDocument).not.toContain(secret);
	});

	it('appends remapped content without changing existing content, title, audience, or schedule', () => {
		const target = blankBuilder('kelas', context.courseId, context.meetingId, context.sectionIds);
		target.document.title = 'My meeting title'; target.document.instructions = rich('My instructions');
		target.document.delivery.startsAt = '2030-01-01T00:00:00Z';
		appendBlock(target, target.document.activities[0].id, 'question_group');
		const existing = structuredClone(target.document.activities[0]), delivery = structuredClone(target.document.delivery);
		const source = builderFromAiProposal(proposal, context), sourceBefore = structuredClone(source);
		appendBuilderContent(target, source);
		appendBuilderContent(target, source);
		expect(target.document.activities).toHaveLength(9);
		expect(target.document.activities[0]).toEqual(existing);
		expect(target.document.title).toBe('My meeting title');
		expect(plain(target.document.instructions)).toBe('My instructions');
		expect(target.document.delivery).toEqual(delivery);
		expect(target.document.context).toEqual(context);
		expect(source).toEqual(sourceBefore);
		expect(domain.exports.normalize(target)).toEqual(target);
		expect(new Set(Object.keys(target.document.questionsById)).size).toBe(7);
	});

	it('replaces only the untouched blank activity and adopts instructions when empty', () => {
		const target = blankBuilder('kelas', context.courseId, context.meetingId);
		const source = builderFromAiProposal(proposal, context);
		expect(appendBuilderContent(target, source)).toBe(target.document.activities[0].id);
		expect(target.document.activities).toHaveLength(4);
		expect(plain(target.document.instructions)).toBe('Work independently');
	});

	it('rejects oversized additions atomically', () => {
		const target = blankBuilder('kelas', context.courseId, context.meetingId);
		const source = builderFromAiProposal(proposal, context);
		target.document.activities = Array.from({ length: 50 }, (_, index) => ({ ...target.document.activities[0], id: `existing-${index}` }));
		const before = structuredClone(target);
		expect(() => appendBuilderContent(target, source)).toThrow('batas');
		expect(target).toEqual(before);
	});

	it('keeps a manually renamed empty activity instead of treating it as the starter placeholder', () => {
		const target = blankBuilder('kelas', context.courseId, context.meetingId);
		target.document.activities[0].title = 'My planned activity';
		appendBuilderContent(target, builderFromAiProposal(proposal, context));
		expect(target.document.activities).toHaveLength(5);
		expect(target.document.activities[0].title).toBe('My planned activity');
	});
});
