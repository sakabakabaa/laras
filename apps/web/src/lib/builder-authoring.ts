import { appendBlock, appendQuestion, blankBuilder, copyBuilder, newActivity, plain, questionIds, rich, uid, type BuilderEnvelope } from './builder-document';
import type { ScheduledAiProposal } from './scheduled-class-ai';

export function builderFromAiProposal(proposal: ScheduledAiProposal, context: BuilderEnvelope['document']['context']): BuilderEnvelope {
	const envelope = blankBuilder('kelas', context.courseId, context.meetingId, context.sectionIds);
	envelope.document.title = proposal.draft.title;
	envelope.document.instructions = rich(proposal.draft.instructions);
	envelope.document.activities = [];
	for (const source of proposal.draft.activities) {
		const activity = newActivity(source.title);
		activity.plannedMinutes = source.minutes;
		activity.required = source.required;
		envelope.document.activities.push(activity);
		if (source.content) {
			const blockId = appendBlock(envelope, activity.id, 'instructions');
			activity.blocks.find(block => block.id === blockId)!.body = rich(source.content);
		}
		if (source.kind === 'quiz') {
			const questionIds: string[] = [];
			for (const question of source.questions) {
				const questionId = appendQuestion(envelope, 'single_choice');
				const target = envelope.document.questionsById[questionId];
				target.prompt = rich(question.text); target.points = question.points;
				target.options = question.options.map(label => ({ id: uid(), label }));
				envelope.privateKeys.answersByQuestionId[questionId] = {
					strategy: 'single_choice', correctOptionId: target.options[question.correctIndex]?.id || '',
					explanation: rich(question.explanation), review: { source: 'inferred', confirmed: false },
					privateGuidance: rich([question.sourceId, question.sourceQuote].filter(Boolean).join('\n')),
				};
				questionIds.push(questionId);
			}
			activity.blocks.push({ id: uid(), type: 'question_group', questionIds });
		} else if (source.kind === 'material') {
			appendBlock(envelope, activity.id, 'acknowledgement');
		} else {
			const blockId = appendBlock(envelope, activity.id, source.kind === 'exit_ticket' ? 'reflection' : 'writing');
			const block = activity.blocks.find(item => item.id === blockId)!;
			for (const questionId of questionIds(block)) envelope.document.questionsById[questionId].prompt = rich(source.content || source.title);
		}
	}
	return envelope;
}

export function appendBuilderContent(target: BuilderEnvelope, source: BuilderEnvelope): string {
	const copied = copyBuilder(source, target.document.kind, target.document.context);
	const first = target.document.activities[0];
	const emptyStart = target.document.activities.length === 1 && first.blocks.length === 0 && first.title === 'Pengantar' && first.plannedMinutes === 15 && first.required;
	const activities = emptyStart ? [] : target.document.activities;
	if (activities.length + copied.document.activities.length > 50 || Object.keys(target.document.questionsById).length + Object.keys(copied.document.questionsById).length > 500 || [...activities, ...copied.document.activities].reduce((sum, activity) => sum + activity.blocks.length, 0) > 500)
		throw new Error('Draf melebihi batas 50 kegiatan, 500 elemen, atau 500 pertanyaan.');
	target.document.activities = [...activities, ...copied.document.activities];
	Object.assign(target.document.questionsById, copied.document.questionsById);
	Object.assign(target.privateKeys.answersByQuestionId, copied.privateKeys.answersByQuestionId);
	if (!plain(target.document.instructions).trim()) target.document.instructions = copied.document.instructions;
	return copied.document.activities[0]?.id || '';
}
