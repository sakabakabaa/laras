import { appendBlock, appendQuestion, blankBuilder, copyBuilder, newActivity, plain, questionIds, rich, uid, type BuilderEnvelope } from './builder-document';
import type { ScheduledAiProposal } from './scheduled-class-ai';
import { countLayoutGroups, countLayoutNodes, ensureLayout, findLayoutGroup, LAYOUT_LIMITS, type BuilderLayout, type BuilderLayoutNode } from './builder-layout';

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
export type ProposalTarget = { kind: 'activity' | 'block' | 'group'; id: string; activityId: string };

/** Applies reviewed content to one draft copy; callers install it as one history change. */
export function applyBuilderProposal(target: BuilderEnvelope, source: BuilderEnvelope, operation: ProposalOperation, requestedTarget?: ProposalTarget | string): string {
	if (operation === 'replace' && source.document.activities.length !== 1) throw new Error('REPLACE memerlukan tepat satu kegiatan dalam usulan. Gunakan APPEND atau INSERT untuk usulan dengan beberapa kegiatan.');
	const scope = typeof requestedTarget === 'string' ? { kind: 'activity' as const, id: requestedTarget, activityId: requestedTarget } : requestedTarget;
	const copied = copyBuilder(source, target.document.kind, target.document.context);
	const activities = target.document.activities;
	const targetIndex = scope ? activities.findIndex(activity => activity.id === scope.activityId) : -1;
	if (operation !== 'append' && targetIndex < 0) throw new Error('Target usulan sudah berubah. Tinjau ulang sebelum menerapkan.');
	if (operation === 'replace' && !scope) throw new Error('Pilih target yang akan diganti.');
	const destination = operation === 'replace' ? activities[targetIndex] : undefined;
	const sourceActivity = copied.document.activities[0];
	if (operation === 'replace' && !sourceActivity) throw new Error('Usulan tidak memiliki kegiatan untuk mengganti target.');
	const beforeBlocks = destination ? [...destination.blocks] : [];
	let removedBlockIds: string[] = [];
	if (destination && scope?.kind === 'activity') removedBlockIds = beforeBlocks.map(block => block.id);
	if (destination && scope?.kind === 'block') {
		if (!beforeBlocks.some(block => block.id === scope.id)) throw new Error('Target usulan sudah berubah. Tinjau ulang sebelum menerapkan.');
		removedBlockIds = [scope.id];
	}
	if (destination && scope?.kind === 'group') {
		const group = destination.layout && findLayoutGroup(destination.layout, scope.id);
		if (!group) throw new Error('Target usulan sudah berubah. Tinjau ulang sebelum menerapkan.');
		const collect = (nodes: BuilderLayoutNode[]): string[] => nodes.flatMap(node => node.kind === 'block' ? [node.blockId] : collect(node.children));
		removedBlockIds = collect(group.children);
	}
	const nextActivities = operation === 'replace' ? activities.length : activities.length + copied.document.activities.length;
	const nextBlocks = activities.reduce((sum, activity) => sum + activity.blocks.length, 0) - removedBlockIds.length + (operation === 'replace' ? sourceActivity?.blocks.length || 0 : copied.document.activities.reduce((sum, activity) => sum + activity.blocks.length, 0));
	const projected = operation === 'replace' ? activities.map((activity, index) => index === targetIndex ? { ...activity, layout: structuredClone(activity.layout) } : activity) : [...activities, ...copied.document.activities];
	if (operation === 'replace' && destination && sourceActivity && scope) {
		const draftDestination = projected[targetIndex];
		const destinationLayout = ensureLayout(draftDestination);
		const incomingLayout = structuredClone(ensureLayout(sourceActivity));
		const findSlot = (nodes: BuilderLayoutNode[], id: string): { list: BuilderLayoutNode[]; index: number; node: BuilderLayoutNode } | null => {
			for (let index = 0; index < nodes.length; index++) { const node = nodes[index]; if ((node.kind === 'block' ? node.blockId : node.id) === id) return { list: nodes, index, node }; if (node.kind !== 'block') { const found = findSlot(node.children, id); if (found) return found; } }
			return null;
		};
		const blocksBefore = (nodes: BuilderLayoutNode[], id: string): number | null => {
			let count = 0;
			for (const node of nodes) {
				if ((node.kind === 'block' ? node.blockId : node.id) === id) return count;
				if (node.kind === 'block') count++;
				else { const nested = blocksBefore(node.children, id); if (nested !== null) return count + nested; count += blocksBeforeCount(node.children); }
			}
			return null;
		};
		const blocksBeforeCount = (nodes: BuilderLayoutNode[]): number => nodes.reduce((count, node) => count + (node.kind === 'block' ? 1 : blocksBeforeCount(node.children)), 0);
		if (scope.kind === 'activity') { draftDestination.blocks = structuredClone(sourceActivity.blocks); draftDestination.layout = incomingLayout; }
		else if (scope.kind === 'block') {
			const slot = findSlot(destinationLayout.nodes, scope.id); if (!slot || slot.node.kind !== 'block') throw new Error('Target usulan sudah berubah. Tinjau ulang sebelum menerapkan.');
			const inserted = incomingLayout.nodes; slot.list.splice(slot.index, 1, ...inserted);
			const blockIndex = draftDestination.blocks.findIndex(block => block.id === scope.id); draftDestination.blocks.splice(blockIndex, 1, ...structuredClone(sourceActivity.blocks));
		} else {
			const group = findLayoutGroup(destinationLayout, scope.id); if (!group) throw new Error('Target usulan sudah berubah. Tinjau ulang sebelum menerapkan.');
			const oldIds = removedBlockIds; group.children = structuredClone(incomingLayout.nodes);
			const position = blocksBefore(destinationLayout.nodes, scope.id);
			const first = draftDestination.blocks.findIndex(block => oldIds.includes(block.id));
			const insertion = first < 0 ? Math.min(position ?? draftDestination.blocks.length, draftDestination.blocks.length) : first;
			draftDestination.blocks = draftDestination.blocks.filter(block => !oldIds.includes(block.id)); draftDestination.blocks.splice(insertion, 0, ...structuredClone(sourceActivity.blocks));
		}
	}
	const projectedQuestions = new Set(projected.flatMap(activity => activity.blocks.flatMap(questionIds)));
	const nextQuestions = [...new Set([...Object.keys(target.document.questionsById), ...Object.keys(copied.document.questionsById)])].filter(id => projectedQuestions.has(id)).length;
	if (nextActivities > 50 || nextQuestions > 500 || nextBlocks > 500) throw new Error('Draf melebihi batas 50 kegiatan, 500 elemen, atau 500 pertanyaan.');
	const layouts = projected.flatMap(activity => activity?.layout ? [activity.layout] : []);
	const depth = (layout: BuilderLayout): number => {
		const walk = (nodes: BuilderLayout['nodes'], level: number): number => nodes.reduce((max, node) => node.kind === 'block' ? max : Math.max(max, level + 1, walk(node.children, level + 1)), 0);
		return walk(layout.nodes, 0);
	};
	if (layouts.reduce((sum, layout) => sum + countLayoutGroups(layout), 0) > LAYOUT_LIMITS.maxGroups || layouts.reduce((sum, layout) => sum + countLayoutNodes(layout), 0) > LAYOUT_LIMITS.maxNodes || layouts.some(layout => depth(layout) > LAYOUT_LIMITS.maxDepth)) throw new Error('Tata letak usulan melewati batas kedalaman atau kapasitas draf.');
	if (operation !== 'replace') {
		const at = operation === 'insert' ? targetIndex : activities.length;
		activities.splice(at, 0, ...copied.document.activities);
		Object.assign(target.document.questionsById, copied.document.questionsById);
		Object.assign(target.privateKeys.answersByQuestionId, copied.privateKeys.answersByQuestionId);
	}
	else {
		const replacement = projected[targetIndex];
		Object.assign(activities[targetIndex], replacement);
	}
	Object.assign(target.document.questionsById, copied.document.questionsById);
	Object.assign(target.privateKeys.answersByQuestionId, copied.privateKeys.answersByQuestionId);
	const liveQuestionIds = new Set(activities.flatMap(activity => activity.blocks.flatMap(questionIds)));
	for (const id of Object.keys(target.document.questionsById)) if (!liveQuestionIds.has(id)) { delete target.document.questionsById[id]; delete target.privateKeys.answersByQuestionId[id]; }
	const inserted = operation === 'replace' ? activities[targetIndex].id : copied.document.activities[0]?.id || '';
	return inserted;
}
