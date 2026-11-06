import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appendBuilderContent, applyBuilderProposal, builderFromAiProposal } from '../src/lib/builder-authoring';
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
	it('preserves media options and existing assessment identities and keys when applying a proposal', () => {
		const source = builderFromAiProposal(proposal, context);
		const sourceActivity = source.document.activities[0];
		const mediaId = appendBlock(source, sourceActivity.id, 'video');
		const media = sourceActivity.blocks.find(block => block.id === mediaId)!;
		media.transcript = 'Proposal transcript';
		media.playback = { loop: true, muted: true };
		const target = blankBuilder('kelas', context.courseId, context.meetingId, context.sectionIds);
		const existingId = appendBlock(target, target.document.activities[0].id, 'question_group');
		const existingQuestionId = target.document.activities[0].blocks.find(block => block.id === existingId)!.questionIds![0];
		const existingQuestion = structuredClone(target.document.questionsById[existingQuestionId]);
		const existingKey = structuredClone(target.privateKeys.answersByQuestionId[existingQuestionId]);
		applyBuilderProposal(target, source, 'append');
		expect(target.document.questionsById[existingQuestionId]).toEqual(existingQuestion);
		expect(target.privateKeys.answersByQuestionId[existingQuestionId]).toEqual(existingKey);
		expect(target.document.activities.flatMap(activity => activity.blocks).find(block => block.transcript === 'Proposal transcript')).toMatchObject({ transcript: 'Proposal transcript', playback: { loop: true, muted: true } });
	});
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

	it('inserts before the stable activity target with remapped question and option IDs', () => {
		const target = blankBuilder('kelas', context.courseId, context.meetingId);
		const targetId = target.document.activities[0].id;
		const source = builderFromAiProposal(proposal, context);
		const sourceIds = Object.keys(source.document.questionsById);
		applyBuilderProposal(target, source, 'insert', targetId);
		expect(target.document.activities[4].id).toBe(targetId);
		expect(target.document.activities.slice(0, 4).map(a => a.title)).toEqual(proposal.draft.activities.map(a => a.title));
		expect(sourceIds.every(id => !target.document.questionsById[id])).toBe(true);
		expect(domain.exports.normalize(target)).toEqual(target);
	});

	it('replaces only the chosen activity content and prunes its orphaned private keys', () => {
		const target = blankBuilder('kelas', context.courseId, context.meetingId);
		const id = target.document.activities[0].id;
		appendBlock(target, id, 'question_group');
		const oldQuestions = questionIds(target.document.activities[0].blocks[0]);
		const replacement = builderFromAiProposal({ ...proposal, draft: { ...proposal.draft, activities: [proposal.draft.activities[0]] } }, context);
		const title = target.document.title, delivery = structuredClone(target.document.delivery);
		applyBuilderProposal(target, replacement, 'replace', id);
		expect(target.document.activities).toHaveLength(1);
		expect(target.document.activities[0].id).toBe(id);
		expect(target.document.activities[0].blocks).toHaveLength(replacement.document.activities[0].blocks.length);
		expect(oldQuestions.every(qid => !target.document.questionsById[qid] && !target.privateKeys.answersByQuestionId[qid])).toBe(true);
		expect(target.document.title).toBe(title);
		expect(target.document.delivery).toEqual(delivery);
		expect(domain.exports.normalize(target)).toEqual(target);
	});

	it('rejects multi-activity and empty replacements without discarding content or private keys', () => {
		const target = blankBuilder('kelas', context.courseId, context.meetingId);
		const id = target.document.activities[0].id;
		appendBlock(target, id, 'question_group');
		const source = builderFromAiProposal(proposal, context);
		const before = structuredClone(target);
		const sourceBefore = structuredClone(source);
		expect(() => applyBuilderProposal(target, source, 'replace', id)).toThrow('tepat satu kegiatan');
		expect(target).toEqual(before);
		expect(source).toEqual(sourceBefore);
		const empty = blankBuilder('kelas', context.courseId, context.meetingId);
		empty.document.activities = [];
		expect(() => applyBuilderProposal(target, empty, 'replace', id)).toThrow('tepat satu kegiatan');
		expect(target).toEqual(before);
	});

	it('rejects stale replacement targets and capacity overflow without changing the draft', () => {
		const target = blankBuilder('kelas', context.courseId, context.meetingId);
		const source = builderFromAiProposal(proposal, context);
		const replacement = builderFromAiProposal({ ...proposal, draft: { ...proposal.draft, activities: [proposal.draft.activities[0]] } }, context);
		const beforeStale = structuredClone(target);
		expect(() => applyBuilderProposal(target, replacement, 'replace', 'removed-target')).toThrow('Target usulan sudah berubah');
		expect(target).toEqual(beforeStale);
		target.document.activities = Array.from({ length: 50 }, (_, index) => ({ ...target.document.activities[0], id: `existing-${index}` }));
		const beforeFull = structuredClone(target);
		expect(() => applyBuilderProposal(target, source, 'append')).toThrow('batas');
		expect(target).toEqual(beforeFull);
	});
});
