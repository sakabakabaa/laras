import type { BuilderAppearance } from './builder-appearance';
import type { ScheduledLesson } from './scheduled-lesson';
import { findLayoutGroup, insertBlockIntoLayout, layoutItemLocation, removeBlockFromLayout, type BuilderLayout, type BuilderLayoutGroup, LAYOUT_LIMITS, countLayoutGroups, countLayoutNodes, layoutGroupDepth } from './builder-layout';
import pb from './pocketbase-client';

export type RichText = {
	type: 'doc';
	content: ({ type: 'paragraph'; content: RichTextRun[] } | { type: 'heading'; level: 2 | 3 | 4; content: RichTextRun[] } | { type: 'list_item'; list: 'bullet' | 'number'; content: RichTextRun[] })[];
};
export type RichTextRun = { type: 'text'; text: string; marks?: ('bold' | 'italic')[]; link?: { href: string } };
export function safeInlineUrl(value: string): string | null {
	if (!value || /[\u0000-\u0020\u007f\\]/.test(value) || value.startsWith('//')) return null;
	if (/^#[A-Za-z][A-Za-z0-9_.:-]{0,199}$/.test(value)) return value;
	return /^https?:\/\/(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?(?:[/?#][^\s<>"']*)?$/i.test(value) && !value.includes('..') ? value : null;
}
export const rich = (value: string): RichText => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
export const plain = (value?: RichText) =>
	value?.content.map((p) => p.content.map((t) => t.text).join('')).join('\n') ||
	'';

export function applyBlockFormat(value: RichText | undefined, start: number, end: number, format: 'paragraph' | 'heading2' | 'heading3' | 'heading4' | 'bullet' | 'number'): RichText {
	const paragraphs = value?.content || rich(plain(value)).content;
	const total = plain(value);
	const a = Math.max(0, Math.min(total.length, start));
	const b = Math.max(a, Math.min(total.length, end));
	let offset = 0;
	const content = paragraphs.map(p => {
		const from = offset, to = from + p.content.map(r => r.text).join('').length;
		const selected = a === b ? from <= a && a <= to : from < b && to > a;
		offset = to + 1;
		const runs = p.content.map(r => ({ ...r, ...(r.marks ? { marks: [...r.marks] } : {}), ...(r.link ? { link: { ...r.link } } : {}) }));
		if (!selected) return p.type === 'heading' ? { type: 'heading' as const, level: p.level, content: runs } : p.type === 'list_item' ? { type: 'list_item' as const, list: p.list, content: runs } : { type: 'paragraph' as const, content: runs };
		if (format === 'paragraph') return { type: 'paragraph' as const, content: runs };
		if (format.startsWith('heading')) return { type: 'heading' as const, level: Number(format.slice(-1)) as 2 | 3 | 4, content: runs };
		return { type: 'list_item' as const, list: format as 'bullet' | 'number', content: runs };
	});
	return { type: 'doc', content };
}

export function applyInlineMark(value: RichText | undefined, start: number, end: number, mark: 'bold' | 'italic'): RichText {
	const text = plain(value);
	const a = Math.max(0, Math.min(text.length, start));
	const b = Math.max(a, Math.min(text.length, end));
	if (a === b) return value || rich(text);
	const paragraphs: RichText['content'] = [];
	let offset = 0;
	for (const paragraph of value?.content || []) {
		const segments: { text: string; marks: ('bold' | 'italic')[]; link?: {href:string} }[] = [];
		for (const run of paragraph.content) {
			const runStart = offset;
			const runEnd = offset + run.text.length;
			offset = runEnd;
			const boundaries = [runStart, Math.max(runStart, Math.min(runEnd, a)), Math.max(runStart, Math.min(runEnd, b)), runEnd].sort((x, y) => x - y);
			for (let i = 0; i < boundaries.length - 1; i++) {
				const from = boundaries[i], to = boundaries[i + 1];
				if (from === to) continue;
				const marks = [...new Set((run.marks || []).filter(m => m === 'bold' || m === 'italic'))];
				if (from >= a && to <= b) marks.push(mark);
				segments.push({ text: text.slice(from, to), marks: [...new Set(marks)].sort(), link: run.link });
			}
		}
		const content: RichText['content'][number]['content'] = [];
		for (const segment of segments) {
			const prior = content.at(-1);
			if (prior && JSON.stringify(prior.marks || []) === JSON.stringify(segment.marks) && prior.link?.href === segment.link?.href) prior.text += segment.text;
			else content.push({ type: 'text', text: segment.text, ...(segment.marks.length ? { marks: segment.marks } : {}), ...(segment.link ? {link:segment.link}:{}) });
		}
		paragraphs.push(paragraph.type === 'heading' ? { type: 'heading', level: paragraph.level, content } : paragraph.type === 'list_item' ? { type: 'list_item', list: paragraph.list, content } : { type: 'paragraph', content });
		offset += 1;
	}
	return { type: 'doc', content: paragraphs };
}

export function replaceRichText(value: RichText | undefined, nextText: string): RichText {
	const previous = plain(value);
	let prefix = 0;
	while (prefix < previous.length && prefix < nextText.length && previous[prefix] === nextText[prefix]) prefix++;
	let suffix = 0;
	while (suffix < previous.length - prefix && suffix < nextText.length - prefix && previous[previous.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]) suffix++;
	const changedEnd = previous.length - suffix;
	const source: { text: string; marks: ('bold' | 'italic')[]; link?: {href:string}; start: number }[] = [];
	let offset = 0;
	for (let pi = 0; pi < (value?.content.length || 0); pi++) {
		for (const run of value!.content[pi].content) {
			source.push({ text: run.text, marks: run.marks || [], link: run.link, start: offset });
			offset += run.text.length;
		}
		if (pi < value!.content.length - 1) {
			source.push({ text: '\n', marks: [], start: offset });
			offset++;
		}
	}
	const inherited = source.find(run => run.text.length && run.start <= prefix && run.start + run.text.length >= prefix)?.marks || [];
	const inserted = nextText.slice(prefix, nextText.length - suffix);
	const runs: { text: string; marks: ('bold' | 'italic')[]; link?: {href:string} }[] = [];
	for (const run of source) {
		const beforeEnd = Math.min(run.start + run.text.length, prefix);
		if (run.start < beforeEnd) runs.push({ text: run.text.slice(0, beforeEnd - run.start), marks: run.marks, link: run.link });
	}
		if (inserted) runs.push({ text: inserted, marks: inherited, link: source.find(run => run.text.length && run.start <= prefix && run.start + run.text.length >= prefix)?.link });
	for (const run of source) {
		const afterStart = Math.max(run.start, changedEnd);
		if (afterStart < run.start + run.text.length) runs.push({ text: run.text.slice(afterStart - run.start), marks: run.marks, link: run.link });
	}
	const paragraphs: RichText['content'] = [{ type: 'paragraph', content: [] }];
	for (const run of runs) for (const [i, part] of run.text.split('\n').entries()) {
		if (i) paragraphs.push({ type: 'paragraph', content: [] });
		if (part) paragraphs.at(-1)!.content.push({ type: 'text', text: part, ...(run.marks.length ? { marks: run.marks } : {}), ...(run.link ? {link:run.link}:{}) });
	}
	let pi = 0;
	return { type: 'doc', content: paragraphs.map(p => {
		const prior = value?.content[Math.min(pi++, (value?.content.length || 1) - 1)];
		if (prior?.type === 'heading') return { type: 'heading' as const, level: prior.level, content: p.content };
		if (prior?.type === 'list_item') return { type: 'list_item' as const, list: prior.list, content: p.content };
		return p;
	}) };
}

export function applyInlineLink(value: RichText | undefined, start: number, end: number, href: string | null): RichText {
	const safe = href === null ? null : safeInlineUrl(href);
	if (href !== null && !safe) return value || rich(plain(value));
	const text = plain(value), a = Math.max(0, Math.min(text.length, start)), b = Math.max(a, Math.min(text.length, end));
	if (a === b) return value || rich(text);
	let offset = 0;
	const content = (value?.content || rich(text).content).map(paragraph => {
		const runs: typeof paragraph.content = [];
		for (const run of paragraph.content) {
			const from = offset, to = from + run.text.length; offset = to;
			const cuts = [...new Set([from, Math.max(from, Math.min(to, a)), Math.max(from, Math.min(to, b)), to])].sort((x,y)=>x-y);
			for (let i=0;i<cuts.length-1;i++) {
				const x=cuts[i], y=cuts[i+1]; if(x===y) continue;
				const marks=run.marks;
				const link = x >= a && y <= b ? (safe ? { href: safe } : undefined) : run.link;
				const prior=runs.at(-1);
				if(prior && JSON.stringify(prior.marks||[])===JSON.stringify(marks||[]) && prior.link?.href===link?.href) prior.text+=text.slice(x,y);
				else runs.push({type:'text',text:text.slice(x,y),...(marks?.length?{marks}:{}),...(link?{link}:{})});
			}
		}
		offset++;
		return paragraph.type === 'heading' ? { type: 'heading' as const, level: paragraph.level, content: runs } : paragraph.type === 'list_item' ? { type: 'list_item' as const, list: paragraph.list, content: runs } : {type:'paragraph' as const,content:runs};
	});
	return {type:'doc',content};
}
export type BuilderKind = 'kelas' | 'tugas';
export type BlockType =
	| 'instructions'
	| 'image'
	| 'audio'
	| 'video'
	| 'reference'
	| 'question_group'
	| 'matching'
	| 'gap_passage'
	| 'writing'
	| 'reflection'
	| 'acknowledgement'
	| 'lesson';
export type QuestionKind =
	'single_choice' | 'short_answer' | 'matching' | 'long_writing' | 'reflection';
export type BuilderQuestion = {
	id: string;
	kind: QuestionKind;
	prompt: RichText;
	required: boolean;
	points: number;
	options?: { id: string; label: string }[];
	maxCharacters?: number;
	rubric?: { criteria: { id: string; label: string; maxPoints: number }[] };
};
export type BuilderAsset = {
	fileId: string;
	filename: string;
	version: number;
	name: string;
};
export type BuilderImage = {
	id: string;
	asset?: BuilderAsset;
	url?: string;
	alt: string;
	caption: string;
	presentation?: BuilderImagePresentation;
};
export const BUILDER_TRANSCRIPT_MAX_LENGTH = 20000;
export type BuilderImagePresentation = { fit?: 'contain' | 'cover'; aspect?: 'natural' | 'square' | '4:3' | '3:2' | '16:9'; focalX?: number; focalY?: number };
export function resetBuilderImagePresentation(image: BuilderImage): BuilderImage {
	const retained = { ...image };
	delete retained.presentation;
	return retained;
}
export function normalizeBuilderImagePresentation(value: unknown): BuilderImagePresentation {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid image presentation');
	const source = value as Record<string, unknown>;
	if (Object.keys(source).some(key => !['fit', 'aspect', 'focalX', 'focalY'].includes(key))) throw new Error('Unknown image presentation style');
	if (source.fit !== undefined && !['contain', 'cover'].includes(source.fit as string)) throw new Error('Invalid image fit');
	if (source.aspect !== undefined && !['natural', 'square', '4:3', '3:2', '16:9'].includes(source.aspect as string)) throw new Error('Invalid image aspect');
	for (const key of ['focalX', 'focalY'] as const) if (source[key] !== undefined && (typeof source[key] !== 'number' || !Number.isFinite(source[key]) || source[key] < 0 || source[key] > 100)) throw new Error('Invalid image focal position');
	return { ...(source.fit ? {fit:source.fit as BuilderImagePresentation['fit']} : {}), ...(source.aspect ? {aspect:source.aspect as BuilderImagePresentation['aspect']} : {}), ...(source.focalX !== undefined ? {focalX:source.focalX as number} : {}), ...(source.focalY !== undefined ? {focalY:source.focalY as number} : {}) };
}
export function builderImagePresentationStyle(value: unknown) {
	const presentation = normalizeBuilderImagePresentation(value);
	return {
		width: '100%',
		aspectRatio: presentation.aspect && presentation.aspect !== 'natural' ? presentation.aspect === 'square' ? '1 / 1' : presentation.aspect.replace(':', ' / ') : undefined,
		objectFit: presentation.fit || (presentation.aspect && presentation.aspect !== 'natural' ? 'cover' : undefined),
		objectPosition: `${presentation.focalX ?? 50}% ${presentation.focalY ?? 50}%`,
	};
}
export type BuilderBlock = {
	appearance?: BuilderAppearance;
	id: string;
	type: BlockType;
	body?: RichText;
	label?: string;
	url?: string;
	alt?: string;
	asset?: BuilderAsset;
	transcript?: string;
	playback?: { loop?: true; muted?: true };
	images?: BuilderImage[];
	columns?: number;
	questionIds?: string[];
	questionId?: string;
	destinations?: { id: string; label: string; title: string; url?: string }[];
	sections?: {
		id: string;
		segments: (
			{ type: 'text'; text: string } | { type: 'gap'; questionId: string }
		)[];
	}[];
	lesson?: ScheduledLesson;
};
export function resetBuilderPlayback(block: BuilderBlock): BuilderBlock {
	delete block.playback;
	return block;
}
export type BuilderActivity = {
	id: string;
	title: string;
	required: boolean;
	plannedMinutes: number;
	blocks: BuilderBlock[];
	layout?: BuilderLayout;
};
export type BuilderDocument = {
	schemaVersion: 1;
	kind: BuilderKind;
	context: { courseId: string; meetingId: string; sectionIds: string[] };
	title: string;
	instructions: RichText;
	activities: BuilderActivity[];
	questionsById: Record<string, BuilderQuestion>;
	delivery: {
		kind: BuilderKind;
		progression: 'scheduled' | 'guided' | 'free';
		timeZone: 'Asia/Jakarta';
		startsAt: string;
		endsAt: string;
		checkInClosesAt: string;
		lateAfterMinutes: number;
		availableAt: string;
		dueAt: string;
		hardCloseAt: string;
		allowLate: boolean;
		timeLimitMinutes: number;
	};
	scoring: { mode: 'points' };
	results: { release: 'manual' };
};
export type BuilderKey = {
	review?: { source: 'printed' | 'inferred' | 'unknown'; confirmed: boolean };
	strategy:
		'single_choice' | 'exact_text' | 'matching' | 'rubric' | 'feedback_only';
	correctOptionId?: string;
	correctDestinationId?: string;
	accepted?: string[];
	comparison?: { ignoreCase: boolean; ignorePunctuation: boolean };
	modelAnswer?: RichText;
	privateGuidance?: RichText;
	explanation?: RichText;
};
export type BuilderEnvelope = {
	document: BuilderDocument;
	privateKeys: {
		schemaVersion: 1;
		answersByQuestionId: Record<string, BuilderKey>;
	};
};
export type SavedBuilderTemplate = BuilderEnvelope & { scope?: 'activity' | 'group' };

export function savedTemplateScope(scope: SavedBuilderTemplate['scope']): 'activity' | 'group' {
	return scope === 'group' ? 'group' : 'activity';
}

export function moveBuilderHistory(
	past: BuilderEnvelope[],
	future: BuilderEnvelope[],
	current: BuilderEnvelope | null,
	forward = false,
): BuilderEnvelope | null {
	const from = forward ? future : past;
	const to = forward ? past : future;
	const next = from.at(-1);
	if (!next || !current) return null;
	to.push(current);
	from.pop();
	return next;
}

export function insertGroupTemplate(
	target: BuilderEnvelope,
	activityId: string,
	parentId: string,
	source: SavedBuilderTemplate,
): string {
	const activity = target.document.activities.find(
		(item) => item.id === activityId,
	);
	const sourceActivity = source.document.activities[0];
	if (
		!activity ||
		!activity.layout ||
		!sourceActivity?.layout ||
		source.scope !== 'group'
	)
		throw new Error('Template bagian tidak valid.');
	const templateGroup = sourceActivity.layout.nodes[0];
	if (!templateGroup || templateGroup.kind === 'block')
		throw new Error('Template bagian tidak valid.');
	const parent = findLayoutGroup(activity.layout, parentId);
	if (!parent) throw new Error('Pilih bagian tujuan yang masih tersedia.');
	const groups = (node: BuilderLayoutGroup): number =>
		1 +
		node.children.reduce(
			(count, child) =>
				count + (child.kind === 'block' ? 0 : groups(child)),
			0,
		);
	const nodes = (node: BuilderLayoutGroup): number =>
		1 +
		node.children.reduce(
			(count, child) =>
				count + (child.kind === 'block' ? 1 : nodes(child)),
			0,
		);
	const depth = (node: BuilderLayoutGroup): number =>
		1 +
		Math.max(
			0,
			...node.children
				.filter(
					(child): child is BuilderLayoutGroup => child.kind !== 'block',
				)
				.map(depth),
		);
	if (
		countLayoutGroups(activity.layout) + groups(templateGroup) >
			LAYOUT_LIMITS.maxGroups ||
		countLayoutNodes(activity.layout) + nodes(templateGroup) >
			LAYOUT_LIMITS.maxNodes ||
		layoutGroupDepth(activity.layout, parentId) + depth(templateGroup) >
			LAYOUT_LIMITS.maxDepth
	)
		throw new Error(
			'Bagian ini melewati batas tata letak. Hapus atau pindahkan bagian lain sebelum menyisipkan template.',
		);
	const sourceCopy = structuredClone(source);
	const copiedActivityId = duplicateActivity(sourceCopy, sourceActivity.id);
	const copiedActivity = sourceCopy.document.activities.find(
		(item) => item.id === copiedActivityId,
	)!;
	const copiedGroup = copiedActivity.layout!.nodes[0] as BuilderLayoutGroup;
	const blockIds = new Set<string>();
	const collect = (group: BuilderLayoutGroup) => {
		for (const child of group.children) {
			if (child.kind === 'block') blockIds.add(child.blockId);
			else collect(child);
		}
	};
	collect(copiedGroup);
	const copiedBlocks = copiedActivity.blocks.filter((block) =>
		blockIds.has(block.id),
	);
	const copiedQuestions = [...new Set(copiedBlocks.flatMap(questionIds))];
	const totalBlocks = target.document.activities.reduce(
		(count, item) => count + item.blocks.length,
		0,
	);
	if (
		totalBlocks + copiedBlocks.length > 500 ||
		Object.keys(target.document.questionsById).length + copiedQuestions.length >
			500
	)
		throw new Error(
			'Batas elemen atau pertanyaan tercapai. Hapus isi lain sebelum menyisipkan template.',
		);
	activity.blocks.push(...copiedBlocks);
	for (const id of copiedQuestions) {
		target.document.questionsById[id] = sourceCopy.document.questionsById[id];
		target.privateKeys.answersByQuestionId[id] = sourceCopy.privateKeys.answersByQuestionId[id];
	}
	parent.children.push(copiedGroup);
	return copiedGroup.id;
}
export type BuilderRecord = BuilderEnvelope & {
	id: string;
	revision: number;
	updated: string;
	title: string;
	kind: BuilderKind;
};
export type BuilderListItem = {
	id: string;
	title: string;
	kind: BuilderKind;
	revision: number;
	updated: string;
	activityCount: number;
	courseTitle: string;
};
export type BuilderIssue = {
	field?: keyof BuilderDocument['delivery'];
	activityId?: string;
	blockId?: string;
	questionId?: string;
	message: string;
};
export const uid = () => crypto.randomUUID();
export const BLOCK_LABELS: Record<BlockType, string> = {
	instructions: 'Teks & instruksi',
	image: 'Gambar',
	audio: 'Audio',
	video: 'Video',
	reference: 'Tautan & referensi',
	question_group: 'Pilihan ganda / jawaban singkat',
	matching: 'Mencocokkan',
	gap_passage: 'Isian dalam teks',
	writing: 'Menulis panjang',
	reflection: 'Refleksi',
	acknowledgement: 'Konfirmasi membaca',
	lesson: 'Penjelasan interaktif',
};
export function newActivity(title = 'Kegiatan baru'): BuilderActivity {
	return { id: uid(), title, required: true, plannedMinutes: 15, blocks: [] };
}
export function blankBuilder(
	kind: BuilderKind,
	courseId: string,
	meetingId = '',
	sectionIds: string[] = [],
): BuilderEnvelope {
	return {
		document: {
			schemaVersion: 1,
			kind,
			context: { courseId, meetingId, sectionIds },
			title: kind === 'kelas' ? 'Kelas baru' : 'Tugas baru',
			instructions: rich(''),
			activities: [newActivity('Pengantar')],
			questionsById: {},
			delivery: {
				kind,
				progression: 'free',
				timeZone: 'Asia/Jakarta',
				startsAt: '',
				endsAt: '',
				checkInClosesAt: '',
				lateAfterMinutes: 10,
				availableAt: '',
				dueAt: '',
				hardCloseAt: '',
				allowLate: false,
				timeLimitMinutes: 0,
			},
			scoring: { mode: 'points' },
			results: { release: 'manual' },
		},
		privateKeys: { schemaVersion: 1, answersByQuestionId: {} },
	};
}
export function questionIds(block: BuilderBlock): string[] {
	return [
		...(block.questionIds || []),
		...(block.questionId ? [block.questionId] : []),
		...(block.sections || []).flatMap((s) =>
			s.segments.flatMap((t) => (t.type === 'gap' ? [t.questionId] : [])),
		),
	];
}
export function appendQuestion(
	draft: BuilderEnvelope,
	kind: QuestionKind,
): string {
	const id = uid(),
		options =
			kind === 'single_choice'
				? [
						{ id: uid(), label: '' },
						{ id: uid(), label: '' },
					]
				: undefined;
	draft.document.questionsById[id] = {
		id,
		kind,
		prompt: rich(''),
		required: true,
		points: kind === 'reflection' ? 0 : 1,
		...(options ? { options } : {}),
		...(['long_writing', 'reflection'].includes(kind)
			? { maxCharacters: 10000 }
			: {}),
	};
	draft.privateKeys.answersByQuestionId[id] =
		kind === 'single_choice'
			? { strategy: 'single_choice', correctOptionId: '' }
			: kind === 'matching'
				? { strategy: 'matching', correctDestinationId: '' }
				: kind === 'short_answer'
					? {
							strategy: 'exact_text',
							accepted: [],
							comparison: { ignoreCase: true, ignorePunctuation: false },
						}
					: {
							strategy: kind === 'reflection' ? 'feedback_only' : 'rubric',
							modelAnswer: rich(''),
							privateGuidance: rich(''),
						};
	return id;
}
export function appendBlock(
	draft: BuilderEnvelope,
	activityId: string,
	type: BlockType,
): string {
	const b: BuilderBlock = { id: uid(), type };
	if (type === 'instructions') b.body = rich('');
	if (['image', 'audio', 'video', 'reference'].includes(type)) {
		b.url = '';
		b.label = '';
		b.alt = '';
	}
	if (type === 'question_group')
		b.questionIds = [appendQuestion(draft, 'single_choice')];
	if (type === 'writing') b.questionId = appendQuestion(draft, 'long_writing');
	if (type === 'reflection')
		b.questionIds = [appendQuestion(draft, 'reflection')];
	if (type === 'matching') {
		b.questionIds = [appendQuestion(draft, 'matching')];
		b.destinations = [
			{ id: uid(), label: 'A', title: 'Kelompok A' },
			{ id: uid(), label: 'B', title: 'Kelompok B' },
		];
	}
	if (type === 'gap_passage') {
		const id = appendQuestion(draft, 'short_answer');
		b.sections = [
			{
				id: uid(),
				segments: [
					{ type: 'text', text: 'Tulis kalimat sebelum isian ' },
					{ type: 'gap', questionId: id },
					{ type: 'text', text: '.' },
				],
			},
		];
	}
	if (type === 'acknowledgement')
		b.body = rich('Saya sudah membaca dan memahami materi.');
	if (type === 'lesson')
		b.lesson = { goal: { de: '', id: '' }, steps: [], scenes: [] };
	draft.document.activities.find((a) => a.id === activityId)!.blocks.push(b);
	return b.id;
}
export function removeBlock(
	draft: BuilderEnvelope,
	activityId: string,
	blockId: string,
) {
	const a = draft.document.activities.find((a) => a.id === activityId)!;
	const b = a.blocks.find((b) => b.id === blockId);
	if (!b) return;
	for (const id of questionIds(b)) {
		delete draft.document.questionsById[id];
		delete draft.privateKeys.answersByQuestionId[id];
	}
	a.blocks = a.blocks.filter((b) => b.id !== blockId);
	removeBlockFromLayout(a, blockId);
}
export function duplicateActivity(draft: BuilderEnvelope, activityId: string) {
	const original = draft.document.activities.find((a) => a.id === activityId)!;
	const copy = structuredClone(original),
		ids = new Map<string, string>();
	const collect = (o: unknown) => {
		if (!o || typeof o !== 'object') return;
		if (Array.isArray(o)) {
			o.forEach(collect);
			return;
		}
		const r = o as Record<string, unknown>;
		if (typeof r.id === 'string' && !('de' in r)) ids.set(r.id, uid());
		Object.values(r).forEach(collect);
	};
	collect(copy);
	for (const b of original.blocks)
		for (const qid of questionIds(b)) {
			collect(draft.document.questionsById[qid]);
		}
	const remap = (o: unknown, field = ''): any =>
		typeof o === 'string'
			? [
					'id',
					'blockId',
					'questionId',
					'questionIds',
					'criterionIds',
					'correctOptionId',
					'correctDestinationId',
				].includes(field)
				? ids.get(o) || o
				: o
			: Array.isArray(o)
				? o.map((v) => remap(v, field))
				: o && typeof o === 'object'
					? Object.fromEntries(
							Object.entries(o).map(([k, v]) => [
								k,
								remap(v, 'de' in o && k === 'id' ? 'translation' : k),
							]),
						)
					: o;
	const next = remap(copy) as BuilderActivity;
	next.title = (next.title + ' (salinan)').slice(0, 200);
	for (const b of original.blocks)
		for (const qid of questionIds(b)) {
			const id = ids.get(qid)!;
			draft.document.questionsById[id] = remap(
				draft.document.questionsById[qid],
			);
			draft.privateKeys.answersByQuestionId[id] = remap(
				draft.privateKeys.answersByQuestionId[qid],
			);
		}
	draft.document.activities.splice(
		draft.document.activities.indexOf(original) + 1,
		0,
		next,
	);
	return next.id;
}
export function duplicateBlock(
	draft: BuilderEnvelope,
	activityId: string,
	blockId: string,
): string {
	const original = draft.document.activities.find((a) => a.id === activityId)!;
	const copyId = duplicateActivity(draft, activityId);
	const copy = draft.document.activities.find((a) => a.id === copyId)!;
	const at = original.blocks.findIndex((b) => b.id === blockId);
	const selected = copy.blocks[at];
	for (const b of [...copy.blocks])
		if (b.id !== selected.id) removeBlock(draft, copyId, b.id);
	draft.document.activities = draft.document.activities.filter(
		(a) => a.id !== copyId,
	);
	original.blocks.splice(at + 1, 0, selected);
	const location = layoutItemLocation(original, blockId);
	if (location) insertBlockIntoLayout(original, selected.id, location.parent?.id || null, location.index + 1);
	return selected.id;
}
export function activitySummary(
	draft: BuilderEnvelope,
	activity: BuilderActivity,
) {
	const ids = activity.blocks.flatMap(questionIds);
	return {
		questions: ids.length,
		points: ids.reduce(
			(sum, id) => sum + (draft.document.questionsById[id]?.points || 0),
			0,
		),
	};
}
export function builderIssues({
	document: d,
	privateKeys,
}: BuilderEnvelope, now = Date.now()): BuilderIssue[] {
	const issues: BuilderIssue[] = [];
	const add = (
		message: string,
		activityId?: string,
		blockId?: string,
		questionId?: string,
	) => issues.push({ message, activityId, blockId, questionId });
	if (!d.title.trim()) add('Isi judul dokumen.');
	if (!d.activities.length) add('Tambahkan kegiatan.');
	for (const a of d.activities) {
		if (!a.title.trim()) add('Isi judul kegiatan.', a.id);
		if (!a.blocks.length) add('Tambahkan elemen pada kegiatan.', a.id);
		if (d.kind === 'kelas' && a.plannedMinutes < 1)
			add('Durasi kegiatan minimal 1 menit.', a.id);
		for (const b of a.blocks) {
			if (
				[
					'question_group',
					'matching',
					'gap_passage',
					'writing',
					'reflection',
				].includes(b.type) &&
				!questionIds(b).length
			)
				add('Tambahkan pertanyaan pada elemen ini.', a.id, b.id);
			if (b.type === 'instructions' && !plain(b.body).trim())
				add('Isi teks instruksi.', a.id, b.id);
			if (
				['image', 'audio', 'video', 'reference'].includes(b.type) &&
				!b.url &&
				!b.asset &&
				!b.images?.length
			)
				add('Pilih atau unggah media.', a.id, b.id);
			if (b.type === 'image' && !b.images?.length && !b.alt?.trim())
				add('Isi teks alternatif gambar.', a.id, b.id);
			if (b.images?.some((image) => !image.alt.trim()))
				add('Isi teks alternatif setiap gambar.', a.id, b.id);
			if (b.images?.some((image) => !image.asset && !image.url))
				add('Pilih berkas untuk setiap gambar.', a.id, b.id);
			if (b.type === 'lesson' && !b.lesson?.scenes.length)
				add('Tambahkan penjelasan interaktif.', a.id, b.id);
			for (const id of questionIds(b)) {
				const q = d.questionsById[id],
					key = privateKeys.answersByQuestionId[id];
				if (!q || !key) {
					add(
						'Butir atau pengaturan penilaian tidak ditemukan.',
						a.id,
						b.id,
						id,
					);
					continue;
				}
				if (!plain(q.prompt).trim()) add('Isi pertanyaan.', a.id, b.id, id);
				if (key.review && !key.review.confirmed)
					add('Tinjau kunci dari sumber AI sebelum menerbitkan.', a.id, b.id, id);
				if (q.rubric?.criteria.some((c) => !c.label.trim()))
					add('Isi nama kriteria rubrik.', a.id, b.id, id);
				if (
					q.rubric?.criteria.length &&
					Math.abs(
						q.rubric.criteria.reduce((s, c) => s + c.maxPoints, 0) - q.points,
					) > 0.00001
				)
					add('Poin rubrik harus sama dengan poin pertanyaan.', a.id, b.id, id);
				if (q.options?.some((o) => !o.label.trim()))
					add('Lengkapi setiap pilihan jawaban.', a.id, b.id, id);
				if (key.strategy === 'single_choice' && !key.correctOptionId)
					add('Pilih kunci jawaban.', a.id, b.id, id);
				if (
					key.strategy === 'exact_text' &&
					!key.accepted?.some((v) => v.trim())
				)
					add('Isi jawaban yang diterima.', a.id, b.id, id);
				if (key.strategy === 'matching' && !key.correctDestinationId)
					add('Pilih pasangan yang benar.', a.id, b.id, id);
			}
		}
	}
	if (d.kind === 'kelas') {
		if (!d.context.meetingId) add('Pilih pertemuan untuk kelas.');
		if (!d.delivery.checkInClosesAt) add('Isi batas check-in.');
		else if (
			d.delivery.startsAt &&
			d.delivery.endsAt &&
			(Date.parse(d.delivery.checkInClosesAt) <
				Date.parse(d.delivery.startsAt) ||
				Date.parse(d.delivery.checkInClosesAt) > Date.parse(d.delivery.endsAt))
		)
			add('Batas check-in harus berada dalam waktu kelas.');
		if (!d.delivery.startsAt || !d.delivery.endsAt)
			add('Isi waktu mulai dan selesai.');
		else if (Date.parse(d.delivery.endsAt) <= Date.parse(d.delivery.startsAt))
			add('Waktu selesai harus setelah mulai.');
		if (d.delivery.endsAt && Date.parse(d.delivery.endsAt) <= now)
			issues.push({ message: 'Jadwal kelas sudah berakhir.', field: 'endsAt' });

	} else {
		if (!d.delivery.dueAt) add('Isi batas pengumpulan tugas.');
		if (
			d.delivery.availableAt &&
			d.delivery.dueAt &&
			Date.parse(d.delivery.availableAt) >= Date.parse(d.delivery.dueAt)
		)
			add('Waktu tersedia harus sebelum batas pengumpulan.');
		if (
			d.delivery.hardCloseAt &&
			d.delivery.dueAt &&
			Date.parse(d.delivery.hardCloseAt) < Date.parse(d.delivery.dueAt)
		)
			add(
				'Tutup pengumpulan harus setelah atau sama dengan batas pengumpulan.',
			);
		const cutoff = d.delivery.allowLate ? d.delivery.hardCloseAt || d.delivery.dueAt : d.delivery.dueAt;
		if (cutoff && Date.parse(cutoff) <= now)
			issues.push({ message: 'Jadwal tugas sudah berakhir.', field: d.delivery.allowLate && d.delivery.hardCloseAt ? 'hardCloseAt' : 'dueAt' });
	}
	return issues;
}
export function applyTemplate(
	draft: BuilderEnvelope,
	template: 'blank' | 'listening' | 'writing' | 'reflection',
) {
	if (template === 'blank') return;
	const a = draft.document.activities[0];
	a.title =
		template === 'listening'
			? 'Mendengarkan & latihan'
			: template === 'writing'
				? 'Menulis'
				: 'Refleksi akhir';
	appendBlock(draft, a.id, 'instructions');
	appendBlock(
		draft,
		a.id,
		template === 'listening'
			? 'audio'
			: template === 'writing'
				? 'writing'
				: 'reflection',
	);
	if (template === 'listening') appendBlock(draft, a.id, 'matching');
}
export async function builderRequest<T>(
	action: string,
	body: Record<string, unknown> = {},
): Promise<T> {
	try {
		return await pb.send<T>('/api/laras/builder', {
			method: 'POST',
			body: { action, ...body },
			requestKey: null,
			signal: AbortSignal.timeout(20000),
		});
	} catch (e) {
		const error = e as { response?: { message?: string }; message?: string };
		throw new Error(
			error.response?.message ||
				error.message ||
				'Builder belum dapat dihubungi. Coba lagi.',
		);
	}
}
export function copyBuilder(
	source: BuilderEnvelope,
	kind: BuilderKind,
	context: BuilderDocument['context'],
): BuilderEnvelope {
	const ids = new Map<string, string>();
	const collect = (o: unknown) => {
		if (Array.isArray(o)) o.forEach(collect);
		else if (o && typeof o === 'object') {
			const v = o as Record<string, unknown>;
			if (typeof v.id === 'string' && !('de' in v)) ids.set(v.id, uid());
			Object.values(v).forEach(collect);
		}
	};
	collect(source.document);
	const remap = (o: unknown, field = ''): any =>
		typeof o === 'string'
			? [
					'id',
					'blockId',
					'questionId',
					'questionIds',
					'criterionIds',
					'correctOptionId',
					'correctDestinationId',
				].includes(field)
				? ids.get(o) || o
				: o
			: Array.isArray(o)
				? o.map((v) => remap(v, field))
				: o && typeof o === 'object'
					? Object.fromEntries(
							Object.entries(o).map(([k, v]) => [
								['questionsById', 'answersByQuestionId'].includes(field)
									? ids.get(k) || k
									: k,
								remap(v, 'de' in o && k === 'id' ? 'translation' : k),
							]),
						)
					: o;
	const next = remap(source) as BuilderEnvelope;
	next.document.kind = kind;
	next.document.context = context;
	next.document.title = (source.document.title + ' (salinan)').slice(0, 200);
	next.document.delivery = blankBuilder(
		kind,
		context.courseId,
	).document.delivery;
	return next;
}
/** Copies authored content only. Attempts, participants, grading and schedule are never copied. */
export function copyScheduledToBuilder(
	state: import('./scheduled-classes').ScheduledClassState,
	context: BuilderDocument['context'],
	origin: string,
): BuilderEnvelope {
	const next = blankBuilder(
		'kelas',
		context.courseId,
		context.meetingId,
		context.sectionIds,
	);
	next.document.context = context;
	next.document.title = (
		(state.class?.title || state.session.title) + ' (salinan)'
	).slice(0, 200);
	next.document.instructions = rich(state.class?.instructions || '');
	next.document.activities = [];
	for (const source of state.activities) {
		const activity = newActivity(source.title);
		activity.required = source.required;
		activity.plannedMinutes = source.minutes;
		next.document.activities.push(activity);
		if (source.content) {
			const id = appendBlock(next, activity.id, 'instructions');
			activity.blocks.find((b) => b.id === id)!.body = rich(source.content);
		}
		if (source.lesson) {
			const id = appendBlock(next, activity.id, 'lesson');
			activity.blocks.find((b) => b.id === id)!.lesson = structuredClone({
				goal: source.lesson.goal,
				steps: source.lesson.steps,
				scenes: source.lesson.scenes,
			});
			for (const video of source.lesson.videos || []) {
				const bid = appendBlock(next, activity.id, 'video'),
					b = activity.blocks.find((b) => b.id === bid)!;
				b.url = new URL(video.src, origin).href;
				b.label = video.title.de;
			}
		}
		if (source.url && source.url.startsWith('https://')) {
			const bid = appendBlock(next, activity.id, 'reference'),
				b = activity.blocks.find((b) => b.id === bid)!;
			b.url = source.url;
			b.label = 'Materi kegiatan';
		}
		const questions = source.kind === 'quiz' ? source.questions || [] : [];
		for (const item of questions) {
			const id = appendQuestion(next, 'single_choice'),
				q = next.document.questionsById[id];
			q.prompt = rich(item.text);
			q.points = item.points;
			q.options = item.options.map((label) => ({ id: uid(), label }));
			next.privateKeys.answersByQuestionId[id] = {
				strategy: 'single_choice',
				correctOptionId: q.options[item.correctIndex]?.id || '',
				explanation: rich(item.explanation || ''),
			};
			activity.blocks.push({
				id: uid(),
				type: 'question_group',
				questionIds: [id],
			});
		}
		for (const item of source.worksheet?.items || []) {
			const key = source.worksheet?.answerKey?.items[item.id],
				kind: QuestionKind =
					item.type === 'select'
						? 'single_choice'
						: key?.mode === 'exact'
							? 'short_answer'
							: source.kind === 'exit_ticket'
								? 'reflection'
								: 'long_writing';
			const id = appendQuestion(next, kind),
				q = next.document.questionsById[id];
			q.prompt = rich(
				[item.prompt, item.translation].filter(Boolean).join('\n'),
			);
			if (item.type === 'select')
				q.options = item.options!.map((label) => ({ id: uid(), label }));
			if (key?.mode === 'exact') {
				q.points = key.points;
				next.privateKeys.answersByQuestionId[id] =
					item.type === 'select'
						? {
								strategy: 'single_choice',
								correctOptionId:
									q.options?.find((o) => key.accepted.includes(o.label))?.id ||
									'',
							}
						: {
								strategy: 'exact_text',
								accepted: [...key.accepted],
								comparison: { ignoreCase: true, ignorePunctuation: true },
							};
			}
			if (key?.mode === 'reference')
				next.privateKeys.answersByQuestionId[id] = {
					strategy: 'rubric',
					modelAnswer: rich(key.modelAnswer || ''),
					privateGuidance: rich(key.rubric || ''),
				};
			activity.blocks.push({
				id: uid(),
				type:
					kind === 'long_writing'
						? 'writing'
						: kind === 'reflection'
							? 'reflection'
							: 'question_group',
				...(kind === 'long_writing'
					? { questionId: id }
					: { questionIds: [id] }),
			});
		}
		if (!activity.blocks.length)
			appendBlock(next, activity.id, 'acknowledgement');
	}
	return next;
}

/** Stable draft comparison: field order is irrelevant; activity/element order is meaningful. */
export function encodeBuilderDraft(envelope: BuilderEnvelope): string {
	return JSON.stringify(envelope, (_key, value) =>
		value && typeof value === 'object' && !Array.isArray(value)
			? Object.fromEntries(
					Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')),
				)
			: value,
	);
}
