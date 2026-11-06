import { appendBlock, appendQuestion, blankBuilder, copyBuilder, newActivity, plain, questionIds, rich, uid, type BuilderEnvelope } from './builder-document';
import type { ScheduledAiProposal } from './scheduled-class-ai';
import { countLayoutGroups, countLayoutNodes, LAYOUT_LIMITS, type BuilderLayout } from './builder-layout';

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

export type ProposalOperation = 'append' | 'insert' | 'replace';

/** Applies reviewed content to one draft copy; callers install it as one history change. */
export function applyBuilderProposal(target: BuilderEnvelope, source: BuilderEnvelope, operation: ProposalOperation, targetActivityId?: string): string {
	if (operation === 'replace' && source.document.activities.length !== 1) throw new Error('REPLACE memerlukan tepat satu kegiatan dalam usulan. Gunakan APPEND atau INSERT untuk usulan dengan beberapa kegiatan.');
	const copied = copyBuilder(source, target.document.kind, target.document.context);
	const activities = target.document.activities;
	const targetIndex = targetActivityId ? activities.findIndex(activity => activity.id === targetActivityId) : -1;
	if (operation !== 'append' && targetIndex < 0) throw new Error('Target usulan sudah berubah. Tinjau ulang sebelum menerapkan.');
	if (operation === 'replace' && !targetActivityId) throw new Error('Pilih kegiatan yang akan diganti.');
	const removed = operation === 'replace' ? activities[targetIndex].blocks.flatMap(questionIds) : [];
	const nextActivities = operation === 'replace' ? activities.length : activities.length + copied.document.activities.length;
	const nextQuestions = Object.keys(target.document.questionsById).length - removed.length + Object.keys(copied.document.questionsById).length;
	const nextBlocks = activities.reduce((sum, activity) => sum + activity.blocks.length, 0) - (operation === 'replace' ? activities[targetIndex].blocks.length : 0) + copied.document.activities.reduce((sum, activity) => sum + activity.blocks.length, 0);
	if (nextActivities > 50 || nextQuestions > 500 || nextBlocks > 500) throw new Error('Draf melebihi batas 50 kegiatan, 500 elemen, atau 500 pertanyaan.');
	const projected = operation === 'replace'
		? activities.map((activity, index) => index === targetIndex ? copied.document.activities[0] : activity)
		: [...activities, ...copied.document.activities];
	const layouts = projected.flatMap(activity => activity?.layout ? [activity.layout] : []);
	const depth = (layout: BuilderLayout): number => {
		const walk = (nodes: BuilderLayout['nodes'], level: number): number => nodes.reduce((max, node) => node.kind === 'block' ? max : Math.max(max, level + 1, walk(node.children, level + 1)), 0);
		return walk(layout.nodes, 0);
	};
	if (layouts.reduce((sum, layout) => sum + countLayoutGroups(layout), 0) > LAYOUT_LIMITS.maxGroups || layouts.reduce((sum, layout) => sum + countLayoutNodes(layout), 0) > LAYOUT_LIMITS.maxNodes || layouts.some(layout => depth(layout) > LAYOUT_LIMITS.maxDepth)) throw new Error('Tata letak usulan melewati batas kedalaman atau kapasitas draf.');
	if (operation === 'replace') {
		const destination = activities[targetIndex];
		for (const id of removed) { delete target.document.questionsById[id]; delete target.privateKeys.answersByQuestionId[id]; }
		const replacement = copied.document.activities[0];
		if (!replacement) throw new Error('Usulan tidak memiliki kegiatan untuk mengganti target.');
		destination.blocks = replacement.blocks;
		destination.layout = replacement.layout;
		Object.assign(target.document.questionsById, copied.document.questionsById);
		Object.assign(target.privateKeys.answersByQuestionId, copied.privateKeys.answersByQuestionId);
	} else {
		const at = operation === 'insert' ? targetIndex : activities.length;
		activities.splice(at, 0, ...copied.document.activities);
		Object.assign(target.document.questionsById, copied.document.questionsById);
		Object.assign(target.privateKeys.answersByQuestionId, copied.privateKeys.answersByQuestionId);
	}
	const liveQuestionIds = new Set(activities.flatMap(activity => activity.blocks.flatMap(questionIds)));
	for (const id of Object.keys(target.document.questionsById)) if (!liveQuestionIds.has(id)) { delete target.document.questionsById[id]; delete target.privateKeys.answersByQuestionId[id]; }
	const inserted = operation === 'replace' ? activities[targetIndex].id : copied.document.activities[0]?.id || '';
	return inserted;
}
