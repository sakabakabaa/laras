import type { BuilderAppearance } from './builder-appearance';
import type { ScheduledLesson } from './scheduled-lesson';
import { findLayoutGroup, flattenResolvedBlocks, insertBlockIntoLayout, layoutItemLocation, removeBlockFromLayout, resolveActivityLayout, type BuilderLayout, type BuilderLayoutGroup, LAYOUT_LIMITS, countLayoutGroups, countLayoutNodes, layoutGroupDepth } from './builder-layout';
import pb from './pocketbase-client';
import { BUILDER_BLOCK_REGISTRY, createBuilderBlockDefaults, isBuilderRegistryKind, type BuilderPlacement } from './builder-element-registry';
import { normalizeBuilderDocumentTheme, type BuilderDocumentTheme } from './builder-theme';
import { cardMatchingTargets } from './card-matching';
import { worksheetBlocks } from './worksheet-layout';
import type {
	ActivityKind,
	Bilingual,
	ScheduledActivity,
	ScheduledClassState,
	ScheduledWorksheet,
	WorksheetAnswerKeyEntry,
	WorksheetBlock as ScheduledWorksheetBlock,
	WorksheetDestination,
	WorksheetSegment,
} from './scheduled-classes';
import type { QuizQuestionEditable } from './task-types';

export type RichText = {
	type: 'doc';
	content: ({ type: 'paragraph'; content: RichTextRun[] } | { type: 'heading'; level: 2 | 3 | 4; content: RichTextRun[] } | { type: 'list_item'; list: 'bullet' | 'number'; depth?: number; content: RichTextRun[] })[];
};
export const BUILDER_RICH_LIST_MAX_DEPTH = 2;
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

export function normalizeBuilderRichText(value: unknown): RichText {
	if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>).type !== 'doc') throw new Error('Format teks tidak didukung.');
	const raw = value as { content?: unknown };
	if (!Array.isArray(raw.content) || raw.content.length > 100) throw new Error('Jumlah paragraf teks melewati batas.');
	let previousDepth = 0, previousWasList = false, total = 0;
	const content = raw.content.map((entry): RichText['content'][number] => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Paragraf tidak valid.');
		const node = entry as Record<string, unknown>;
		const isList = node.type === 'list_item';
		if (node.type !== 'paragraph' && node.type !== 'heading' && !isList) throw new Error('Paragraf tidak valid.');
		if (node.type === 'heading' && ![2, 3, 4].includes(Number(node.level))) throw new Error('Judul tidak valid.');
		if (isList && node.list !== 'bullet' && node.list !== 'number') throw new Error('Daftar tidak valid.');
		const depth = isList ? (node.depth === undefined ? 0 : node.depth) : 0;
		if (isList && (!Number.isInteger(depth) || Number(depth) < 0 || Number(depth) > BUILDER_RICH_LIST_MAX_DEPTH || (Number(depth) > 0 && (!previousWasList || Number(depth) > previousDepth + 1)))) throw new Error('Kedalaman daftar tidak valid.');
		if (!isList && node.depth !== undefined) throw new Error('Kedalaman daftar tidak valid.');
		if (!Array.isArray(node.content) || node.content.length > 100) throw new Error('Jumlah format teks melewati batas.');
		const runs = node.content.map((item): RichTextRun => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Teks tidak valid.');
			const run = item as Record<string, unknown>;
			if (run.type !== 'text' || typeof run.text !== 'string' || run.text.length > 20000) throw new Error('Teks tidak valid.');
			total += run.text.length; if (total > 20000) throw new Error('Teks draf terlalu panjang.');
			const marks = Array.isArray(run.marks) ? [...new Set(run.marks.filter(mark => mark === 'bold' || mark === 'italic'))].sort() as ('bold' | 'italic')[] : [];
			const href = run.link && typeof run.link === 'object' ? safeInlineUrl(String((run.link as { href?: unknown }).href || '')) : null;
			return { type: 'text', text: run.text, ...(marks.length ? { marks } : {}), ...(href ? { link: { href } } : {}) };
		});
		previousWasList = isList; previousDepth = Number(depth);
		return node.type === 'heading' ? { type: 'heading', level: Number(node.level) as 2 | 3 | 4, content: runs } : isList ? { type: 'list_item', list: node.list as 'bullet' | 'number', ...(Number(depth) ? { depth: Number(depth) } : {}), content: runs } : { type: 'paragraph', content: runs };
	});
	return { type: 'doc', content };
}

/** Adjust selected list lines. First-item indent and depth-zero outdent are no-ops. */
export function adjustRichListDepth(value: RichText | undefined, start: number, end: number, direction: 'indent' | 'outdent'): RichText {
	const source = value || rich('');
	const text = plain(source), a = Math.max(0, Math.min(text.length, start)), b = Math.max(a, Math.min(text.length, end));
	const ranges: { from: number; to: number }[] = [];
	let offset = 0;
	for (const node of source.content) { const length = node.content.map(run => run.text).join('').length; ranges.push({ from: offset, to: offset + length }); offset += length + 1; }
	const selected = ranges.map((range, index) => ({ range, index })).filter(({ range }) => a === b ? range.from <= a && a <= range.to : range.from < b && range.to > a).map(({ index }) => index);
	if (!selected.length || selected.some(index => source.content[index].type !== 'list_item')) return source;
	const next = source.content.map(node => node.type === 'list_item' ? { ...node, depth: node.depth || 0 } : node);
	const affected = new Set(selected);
	for (const index of selected) {
		const depth = (next[index] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0;
		for (let child = index + 1; child < next.length && next[child].type === 'list_item'; child++) {
			const childDepth = (next[child] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0;
			if (childDepth <= depth) break;
			affected.add(child);
		}
	}
	if (direction === 'indent') {
		const first = selected[0];
		if (first === 0 || next[first - 1].type !== 'list_item') return source;
		const target = (next[first] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0;
		if (target >= BUILDER_RICH_LIST_MAX_DEPTH || ((next[first - 1] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0) < target || [...affected].some(index => ((next[index] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0) >= BUILDER_RICH_LIST_MAX_DEPTH)) return source;
		for (const index of affected) (next[index] as Extract<typeof next[number], { type: 'list_item' }>).depth = ((next[index] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0) + 1;
	} else {
		if (selected.some(index => !((next[index] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0))) return source;
		for (const index of affected) (next[index] as Extract<typeof next[number], { type: 'list_item' }>).depth = ((next[index] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0) - 1;
	}
	for (let i = 0; i < next.length; i++) if (next[i].type === 'list_item') {
		const depth = (next[i] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0;
		if (depth > BUILDER_RICH_LIST_MAX_DEPTH || (depth > 0 && (i === 0 || next[i - 1].type !== 'list_item' || depth > (((next[i - 1] as Extract<typeof next[number], { type: 'list_item' }>).depth || 0) + 1)))) return source;
	}
	return { type: 'doc', content: next.map(node => {
		if (node.type !== 'list_item') return node;
		const { depth, ...flat } = node;
		return depth ? { ...flat, depth } : flat;
	}) };
}

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
		if (!selected) return p.type === 'heading' ? { type: 'heading' as const, level: p.level, content: runs } : p.type === 'list_item' ? { type: 'list_item' as const, list: p.list, ...(p.depth ? { depth: p.depth } : {}), content: runs } : { type: 'paragraph' as const, content: runs };
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
		paragraphs.push(paragraph.type === 'heading' ? { type: 'heading', level: paragraph.level, content } : paragraph.type === 'list_item' ? { type: 'list_item', list: paragraph.list, ...(paragraph.depth ? { depth: paragraph.depth } : {}), content } : { type: 'paragraph', content });
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
		if (prior?.type === 'list_item') return { type: 'list_item' as const, list: prior.list, ...(prior.depth ? { depth: prior.depth } : {}), content: p.content };
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
		return paragraph.type === 'heading' ? { type: 'heading' as const, level: paragraph.level, content: runs } : paragraph.type === 'list_item' ? { type: 'list_item' as const, list: paragraph.list, ...(paragraph.depth ? { depth: paragraph.depth } : {}), content: runs } : {type:'paragraph' as const,content:runs};
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
export const BUILDER_CAPTIONS_MAX_CUES = 300;
export const BUILDER_CAPTIONS_MAX_TEXT = 500;
export const BUILDER_CAPTIONS_MAX_TOTAL = 30000;
export type BuilderCaptionCue = { start: number; end: number; text: string };
export type BuilderCaptions = { language?: string; cues: BuilderCaptionCue[] };
export const BUILDER_PLAYBACK_MAX_SECONDS = 86400;
export const BUILDER_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type BuilderPlayback = { loop?: true; muted?: true; start?: number; end?: number; rate?: typeof BUILDER_PLAYBACK_RATES[number] };
export function normalizeBuilderPlayback(value: unknown): BuilderPlayback {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid playback settings');
	const raw = value as Record<string, unknown>;
	if (Object.keys(raw).some(key => !['loop', 'muted', 'start', 'end', 'rate'].includes(key))) throw new Error('Unknown playback setting');
	if (raw.loop !== undefined && raw.loop !== true || raw.muted !== undefined && raw.muted !== true) throw new Error('Invalid playback setting');
	for (const key of ['start', 'end'] as const) if (raw[key] !== undefined && (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]) || raw[key] < 0 || raw[key] > BUILDER_PLAYBACK_MAX_SECONDS)) throw new Error('Invalid playback time');
	if (typeof raw.start === 'number' && typeof raw.end === 'number' && raw.end <= raw.start) throw new Error('Playback end must follow start');
	if (raw.rate !== undefined && !(BUILDER_PLAYBACK_RATES as readonly unknown[]).includes(raw.rate)) throw new Error('Invalid playback rate');
	return { ...(raw.loop ? { loop: true as const } : {}), ...(raw.muted ? { muted: true as const } : {}), ...(raw.start !== undefined ? { start: raw.start as number } : {}), ...(raw.end !== undefined ? { end: raw.end as number } : {}), ...(raw.rate !== undefined ? { rate: raw.rate as BuilderPlayback['rate'] } : {}) };
}
export function normalizeBuilderCaptions(value: unknown): BuilderCaptions {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid captions');
	const raw = value as Record<string, unknown>;
	if (Object.keys(raw).some(key => !['language', 'cues'].includes(key))) throw new Error('Unknown captions field');
	if (raw.language !== undefined && (typeof raw.language !== 'string' || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(raw.language))) throw new Error('Invalid caption language');
	if (!Array.isArray(raw.cues) || raw.cues.length > BUILDER_CAPTIONS_MAX_CUES) throw new Error('Invalid caption cues');
	let previousStart = -1, previousEnd = -1, total = 0;
	const cues = raw.cues.map((entry) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid caption cue');
		const cue = entry as Record<string, unknown>;
		if (Object.keys(cue).some(key => !['start', 'end', 'text'].includes(key))) throw new Error('Unknown caption cue field');
		if (typeof cue.start !== 'number' || !Number.isFinite(cue.start) || cue.start < 0 || typeof cue.end !== 'number' || !Number.isFinite(cue.end) || cue.end <= cue.start || cue.start < previousStart || cue.start < previousEnd || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > BUILDER_CAPTIONS_MAX_TEXT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cue.text)) throw new Error('Invalid caption cue');
		previousStart = cue.start; previousEnd = cue.end; total += cue.text.length;
		return { start: cue.start, end: cue.end, text: cue.text };
	});
	if (total > BUILDER_CAPTIONS_MAX_TOTAL) throw new Error('Caption text limit exceeded');
	return { ...(raw.language ? { language: raw.language as string } : {}), cues };
}
export function hasNestedBuilderLists(envelope: unknown): boolean {
	const root = envelope && typeof envelope === 'object' && 'document' in envelope ? (envelope as { document: unknown }).document : envelope;
	let found = false;
	const scan = (value: unknown) => {
		if (found || !value || typeof value !== 'object') return;
		if (Array.isArray(value)) { value.forEach(scan); return; }
		const record = value as Record<string, unknown>;
		if (record.type === 'list_item' && typeof record.depth === 'number' && record.depth > 0) { found = true; return; }
		Object.values(record).forEach(scan);
	};
	scan(root); return found;
}
export function builderRichTextValid(envelope: BuilderEnvelope): boolean {
	try {
		normalizeBuilderRichText(envelope.document.instructions);
		for (const activity of envelope.document.activities) for (const block of activity.blocks) {
			if ((block.type === 'instructions' || block.type === 'acknowledgement') && block.body) normalizeBuilderRichText(block.body);
		}
		return true;
	} catch { return false; }
}
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
	presentation?: Partial<Record<'desktop' | 'tablet' | 'mobile', boolean>>;
	layoutLocked?: boolean;
	appearance?: BuilderAppearance;
	/** Optional document-scoped safe fragment name; never copied as style. */
	anchor?: string;
	id: string;
	type: BlockType;
	body?: RichText;
	label?: string;
	url?: string;
	alt?: string;
	asset?: BuilderAsset;
	transcript?: string;
	captions?: BuilderCaptions;
	playback?: BuilderPlayback;
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

export const BUILDER_ANCHOR_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
export type BuilderVisibilityDevice = 'desktop' | 'tablet' | 'mobile';
export function normalizeBuilderVisibility(value: unknown): Partial<Record<BuilderVisibilityDevice, boolean>> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Pengaturan tampilan perangkat tidak valid.');
	const source = value as Record<string, unknown>;
	if (Object.keys(source).some(key => !['desktop', 'tablet', 'mobile'].includes(key)) || Object.values(source).some(item => typeof item !== 'boolean')) throw new Error('Pengaturan tampilan perangkat tidak valid.');
	return { ...(source.desktop !== undefined ? { desktop: source.desktop as boolean } : {}), ...(source.tablet !== undefined ? { tablet: source.tablet as boolean } : {}), ...(source.mobile !== undefined ? { mobile: source.mobile as boolean } : {}) };
}
export function builderVisibilityForDevice(value: Partial<Record<BuilderVisibilityDevice, boolean>> | undefined, device: BuilderVisibilityDevice): boolean {
	if (device === 'mobile' && value?.mobile !== undefined) return value.mobile;
	if (device !== 'desktop' && value?.tablet !== undefined) return value.tablet;
	return value?.desktop ?? true;
}
const SAFE_PRESENTATION_BLOCKS = new Set<BlockType>(['instructions', 'image']);
export function builderNodeVisibilitySafe(envelope: Pick<BuilderEnvelope, 'document'>): boolean {
	try {
		for (const activity of envelope.document.activities) {
			for (const block of activity.blocks) if (block.presentation !== undefined) normalizeBuilderVisibility(block.presentation);
			const visitFields = (nodes: import('./builder-layout').BuilderLayoutNode[]) => nodes.forEach(node => { if (node.kind !== 'block') { if (node.presentation !== undefined) normalizeBuilderVisibility(node.presentation); visitFields(node.children); } });
			if (activity.layout) visitFields(activity.layout.nodes);
		}
	} catch { return false; }
	const blocks = new Map(envelope.document.activities.flatMap(activity => activity.blocks.map(block => [block.id, block] as const)));
	const nodeSafe = (node: import('./builder-layout').BuilderLayoutNode): boolean => {
		if (node.kind === 'block') { const block = blocks.get(node.blockId); return Boolean(block && builderBlockCanBeHidden(block)); }
		return node.children.length > 0 && node.children.every(nodeSafe);
	};
	for (const activity of envelope.document.activities) {
		for (const block of activity.blocks) if (block.presentation && Object.values(block.presentation).some(value => value === false) && !nodeSafe({ kind: 'block', blockId: block.id })) return false;
		if (activity.layout) {
			const visit = (nodes: import('./builder-layout').BuilderLayoutNode[]): boolean => nodes.every(node => node.kind === 'block' ? true : (!node.presentation || Object.values(node.presentation).every(value => value !== false) || nodeSafe(node)) && visit(node.children));
			if (!visit(activity.layout.nodes)) return false;
		}
	}
	return true;
}
export function builderBlockCanBeHidden(block: BuilderBlock): boolean { return SAFE_PRESENTATION_BLOCKS.has(block.type) && !block.questionId && !(block.questionIds?.length) && !(block.sections?.some(section => section.segments.some(segment => segment.type === 'gap'))) && !(block.body?.content.some(node => node.content.some(run => Boolean(run.link)))); }
export function builderLayoutGroupCanBeHidden(group: BuilderLayoutGroup, blocks: BuilderBlock[]): boolean {
	const byId = new Map(blocks.map(block => [block.id, block]));
	const safe = (node: import('./builder-layout').BuilderLayoutNode): boolean => node.kind === 'block' ? Boolean(byId.get(node.blockId) && builderBlockCanBeHidden(byId.get(node.blockId)!)) : node.children.length > 0 && node.children.every(safe);
	return group.children.length > 0 && group.children.every(safe);
}
export function hasBuilderVisibility(envelope: unknown): boolean {
	const document = (envelope as { document?: any })?.document ?? envelope as any;
	return Array.isArray(document?.activities) && document.activities.some((activity: any) => activity?.blocks?.some((block: any) => block?.presentation !== undefined) || activity?.layout?.nodes?.some((node: any) => hasLayoutPresentation(node)));
}
function hasLayoutPresentation(node: any): boolean { return Boolean(node && node.kind !== 'block' && (node.presentation !== undefined || node.children?.some(hasLayoutPresentation))); }
export function builderAnchors(envelope: Pick<BuilderEnvelope, 'document'>): { anchor: string; owner: BuilderBlock | BuilderLayoutGroup }[] {
	const found: { anchor: string; owner: BuilderBlock | BuilderLayoutGroup }[] = [];
	const visit = (nodes: import('./builder-layout').BuilderLayoutNode[]) => nodes.forEach(node => {
		if (node.kind === 'block') return;
		if (node.anchor) found.push({ anchor: node.anchor, owner: node });
		visit(node.children);
	});
	for (const activity of envelope.document.activities) {
		for (const block of activity.blocks) if (block.anchor) found.push({ anchor: block.anchor, owner: block });
		if (activity.layout) visit(activity.layout.nodes);
	}
	return found;
}
export function normalizeBuilderAnchor(value: unknown): string {
	if (typeof value !== 'string' || !BUILDER_ANCHOR_PATTERN.test(value)) throw new Error('Nama tautan bagian tidak valid. Gunakan huruf kecil, angka, dan tanda hubung; mulai dengan huruf.');
	return value;
}
export function validateBuilderAnchors(envelope: Pick<BuilderEnvelope, 'document'>): boolean {
	try {
		const seen = new Set<string>();
		for (const { anchor } of builderAnchors(envelope)) { normalizeBuilderAnchor(anchor); if (seen.has(anchor)) return false; seen.add(anchor); }
		return true;
	} catch { return false; }
}
/** Preserve the first document-scoped name and deterministically suffix later inserted collisions. */
export function remapDuplicateBuilderAnchors(
	envelope: Pick<BuilderEnvelope, 'document'>,
	incomingOwners?: Array<{ anchor?: string }>,
	incomingBlocks?: BuilderBlock[],
): void {
	if (incomingOwners) {
		const incoming = new Set(incomingOwners);
		const used = new Set(builderAnchors(envelope).filter(item => !incoming.has(item.owner)).map(item => item.anchor));
		const remapped = new Map<string, string>();
		for (const owner of incomingOwners) {
			if (!owner.anchor || !BUILDER_ANCHOR_PATTERN.test(owner.anchor)) continue;
			const original = owner.anchor;
			if (!used.has(original)) { used.add(original); continue; }
			for (let suffix = 2; suffix < 10000; suffix++) {
				const candidate = `${original.slice(0, 40 - String(suffix).length - 1)}-${suffix}`;
				if (!used.has(candidate)) { owner.anchor = candidate; used.add(candidate); remapped.set(original, candidate); break; }
			}
		}
		if (remapped.size && incomingBlocks) {
			for (const block of incomingBlocks) for (const paragraph of block.body?.content || []) for (const run of paragraph.content) {
				const replacement = run.link?.href.startsWith('#') ? remapped.get(run.link.href.slice(1)) : undefined;
				if (replacement) run.link = { ...run.link!, href: `#${replacement}` };
			}
		}
		return;
	}
	const used = new Set<string>();
	const visit = (owner: { anchor?: string }) => {
		if (!owner.anchor) return;
		const original = owner.anchor;
		if (!BUILDER_ANCHOR_PATTERN.test(original)) return;
		if (!used.has(original)) { used.add(original); return; }
		for (let suffix = 2; suffix < 10000; suffix++) {
			const candidate = `${original.slice(0, 40 - String(suffix).length - 1)}-${suffix}`;
			if (!used.has(candidate)) { owner.anchor = candidate; used.add(candidate); return; }
		}
		delete owner.anchor;
	};
	const groups = (nodes: import('./builder-layout').BuilderLayoutNode[]) => nodes.forEach(node => {
		if (node.kind === 'block') return;
		visit(node); groups(node.children);
	});
	for (const activity of envelope.document.activities) {
		activity.blocks.forEach(visit);
		if (activity.layout) groups(activity.layout.nodes);
	}
}
export type BuilderDocument = {
	schemaVersion: 1;
	theme?: BuilderDocumentTheme;
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

export function hasBuilderThemePalette(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	const document = (value as { document?: unknown }).document ?? value;
	return Boolean(document && typeof document === 'object' && Object.hasOwn(document, 'theme'));
}

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
	const owners: Array<{ anchor?: string }> = [...copiedBlocks];
	const collectOwners = (node: BuilderLayoutGroup) => { owners.push(node); for (const child of node.children) if (child.kind !== 'block') collectOwners(child); };
	collectOwners(copiedGroup);
	remapDuplicateBuilderAnchors(target, owners, copiedBlocks);
	return copiedGroup.id;
}
export type BuilderRecord = BuilderEnvelope & {
	layoutLocks?: boolean;
	customColors?: boolean;
	detailedBorderRadius?: boolean;
	responsiveBorderRadius?: boolean;
	mediaCaptions?: boolean;
	mediaPlayback?: boolean;
	nestedRichText?: boolean;
	documentAnchors?: boolean;
	presentationVisibility?: boolean;
	themePalette?: boolean;
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
	if (!isBuilderRegistryKind(type) || !BUILDER_BLOCK_REGISTRY[type]) throw new Error('Unknown builder block kind');
	const activity = draft.document.activities.find((item) => item.id === activityId);
	const placement: BuilderPlacement = 'activity';
	if (!activity || !BUILDER_BLOCK_REGISTRY[type].placements.includes(placement)) throw new Error('Builder block kind is not allowed at this placement');
	const b: BuilderBlock = { id: uid(), type };
	const pendingQuestions: BuilderEnvelope = {
		document: { ...draft.document, questionsById: {} },
		privateKeys: { ...draft.privateKeys, answersByQuestionId: {} },
	};
	Object.assign(b, createBuilderBlockDefaults(type, { rich, uid, question: (questionKind) => appendQuestion(pendingQuestions, questionKind) }));
	activity.blocks.push(b);
	Object.assign(draft.document.questionsById, pendingQuestions.document.questionsById);
	Object.assign(draft.privateKeys.answersByQuestionId, pendingQuestions.privateKeys.answersByQuestionId);
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
function clearActivityLayoutLocks(activity: BuilderActivity) {
	for (const block of activity.blocks) delete block.layoutLocked;
	const walk = (nodes: import('./builder-layout').BuilderLayoutNode[]) => {
		for (const node of nodes) {
			if (node.kind === 'block') continue;
			delete node.layoutLocked;
			walk(node.children);
		}
	};
	if (activity.layout) walk(activity.layout.nodes);
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
	clearActivityLayoutLocks(next);
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
	const owners: Array<{ anchor?: string }> = [...next.blocks];
	const collectOwners = (nodes: import('./builder-layout').BuilderLayoutNode[]) => nodes.forEach(node => { if (node.kind !== 'block') { owners.push(node); collectOwners(node.children); } });
	if (next.layout) collectOwners(next.layout.nodes);
	remapDuplicateBuilderAnchors(draft, owners, next.blocks);
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
	if (d.theme !== undefined) try { normalizeBuilderDocumentTheme(d.theme); } catch { add('Palet tema dokumen tidak valid.'); }
	if (!validateBuilderAnchors({ document: d })) add('Nama tautan bagian harus unik dan memakai huruf kecil, angka, serta tanda hubung.');
	if (!builderNodeVisibilitySafe({ document: d })) add('Visibilitas presentasi ditolak karena elemen tersembunyi berisi asesmen, pengakuan, atau jenis elemen yang belum didukung.');
	if (!d.activities.length) add('Tambahkan kegiatan.');
	for (const a of d.activities) {
		if (!a.title.trim()) add('Isi judul kegiatan.', a.id);
		if (!a.blocks.length) add('Tambahkan elemen pada kegiatan.', a.id);
		if (d.kind === 'kelas' && a.plannedMinutes < 1)
			add('Durasi kegiatan minimal 1 menit.', a.id);
		for (const b of a.blocks) {
			if (b.body !== undefined && (b.type === 'instructions' || b.type === 'acknowledgement')) {
				try { normalizeBuilderRichText(b.body); } catch { add('Format teks atau kedalaman daftar tidak valid.', a.id, b.id); }
			}
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
	try { normalizeBuilderRichText(d.instructions); } catch { add('Format instruksi atau kedalaman daftar tidak valid.'); }
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
export function builderWriteAction(action: string, body: Record<string, unknown>): string {
	if (action === 'savedList') return action;
	if (body.themePalette === true || hasBuilderThemePalette(body.document)) return `themePalette:${action}`;
	const contains = (value: unknown, predicate: (record: Record<string, unknown>) => boolean): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Array.isArray(value)) return value.some(item => contains(item, predicate));
		const record = value as Record<string, unknown>;
		return predicate(record) || Object.values(record).some(item => contains(item, predicate));
	};
	const containsLocks = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Object.prototype.hasOwnProperty.call(value, 'layoutLocked')) return true;
		return Object.values(value).some(containsLocks);
	};
	const containsColors = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Object.prototype.hasOwnProperty.call(value, 'customColors')) return true;
		return Object.values(value).some(containsColors);
	};
	const containsDetailed = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Object.prototype.hasOwnProperty.call(value, 'borderDetail') || Object.prototype.hasOwnProperty.call(value, 'corners') || Object.prototype.hasOwnProperty.call(value, 'shadow') || Object.prototype.hasOwnProperty.call(value, 'hover')) return true;
		return Object.values(value).some(containsDetailed);
	};
	const containsResponsive = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Object.prototype.hasOwnProperty.call(value, 'responsive')) {
			const responsive = (value as { responsive?: unknown }).responsive;
			if (responsive && typeof responsive === 'object' && Object.values(responsive).some(device => device && typeof device === 'object' && (Object.hasOwn(device, 'borderDetail') || Object.hasOwn(device, 'corners')))) return true;
		}
		return Object.values(value).some(containsResponsive);
	};
	const containsCaptions = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Object.prototype.hasOwnProperty.call(value, 'captions')) return true;
		return Object.values(value).some(containsCaptions);
	};
	const containsNestedLists = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Array.isArray(value)) return value.some(containsNestedLists);
		const record = value as Record<string, unknown>;
		if (record.type === 'list_item' && typeof record.depth === 'number' && record.depth > 0) return true;
		return Object.values(record).some(containsNestedLists);
	};
	const containsPlayback = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Array.isArray(value)) return value.some(containsPlayback);
		const record = value as Record<string, unknown>;
		if (record.playback && typeof record.playback === 'object' && ['start', 'end', 'rate'].some(key => Object.hasOwn(record.playback as object, key))) return true;
		return Object.values(record).some(containsPlayback);
	};
	const containsAnchor = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') return false;
		if (Object.prototype.hasOwnProperty.call(value, 'anchor')) return true;
		return Object.values(value).some(containsAnchor);
	};
	if (body.presentationVisibility === true || contains(body.document, record => Object.hasOwn(record, 'presentation'))) return `presentationVisibility:${action}`;
	if (body.documentAnchors === true || body.document && containsAnchor(body.document)) return `documentAnchors:${action}`;
	if (body.mediaPlayback === true || containsPlayback(body.document)) return `mediaPlayback:${action}`;
	if (body.nestedRichText === true || containsNestedLists(body.document)) return `nestedLists:${action}`;
	if (body.mediaCaptions === true || containsCaptions(body.document)) return `mediaCaptions:${action}`;
	if (body.responsiveBorderRadius === true || containsResponsive(body)) return `responsiveStyles:${action}`;
	if (body.detailedBorderRadius === true || containsDetailed(body)) return `detailedStyles:${action}`;
	if ((action === 'save' || action === 'create') && containsColors(body.document)) return `themeColors:${action}`;
	if (action === 'saveSnapshot' || action === 'saveTemplate') return `themeColors:${action}`;
	if ((action === 'save' || action === 'create') && containsLocks(body.document)) return `layoutLocks:${action}`;
	return action;
}
export async function builderRequest<T>(
	action: string,
	body: Record<string, unknown> = {},
): Promise<T> {
	try {
		const writeAction = builderWriteAction(action, body);
		const contains = (value: unknown, predicate: (record: Record<string, unknown>) => boolean): boolean => {
			if (!value || typeof value !== 'object') return false;
			if (Array.isArray(value)) return value.some(item => contains(item, predicate));
			const record = value as Record<string, unknown>;
			return predicate(record) || Object.values(record).some(item => contains(item, predicate));
		};
		const document = body.document;
		return await pb.send<T>('/api/laras/builder', {
			method: 'POST',
		body: { ...body, ...(writeAction.startsWith('themePalette:') || body.themePalette === true || hasBuilderThemePalette(document) ? { themePalette: true } : {}), ...(writeAction.startsWith('presentationVisibility:') || contains(document, record => Object.hasOwn(record, 'presentation')) ? { presentationVisibility: true } : {}), ...(writeAction.startsWith('documentAnchors:') || contains(document, record => Object.hasOwn(record, 'anchor')) ? { documentAnchors: true } : {}), ...(writeAction.startsWith('responsiveStyles:') || contains(document, record => Boolean(record.responsive && typeof record.responsive === 'object' && Object.values(record.responsive as object).some((device: any) => device && typeof device === 'object' && (Object.hasOwn(device, 'borderDetail') || Object.hasOwn(device, 'corners'))))) ? { responsiveBorderRadius: true } : {}), ...(writeAction.startsWith('mediaCaptions:') || contains(document, record => Object.hasOwn(record, 'captions')) ? { mediaCaptions: true } : {}), ...(writeAction.startsWith('nestedLists:') || contains(document, record => record.type === 'list_item' && typeof record.depth === 'number' && record.depth > 0) ? { nestedRichText: true } : {}), ...(writeAction.startsWith('mediaPlayback:') || contains(document, record => Boolean(record.playback && typeof record.playback === 'object' && ['start', 'end', 'rate'].some(key => Object.hasOwn(record.playback as object, key)))) ? { mediaPlayback: true } : {}), action: writeAction },
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
	for (const activity of next.document.activities) clearActivityLayoutLocks(activity);
	next.document.kind = kind;
	next.document.context = context;
	next.document.title = (source.document.title + ' (salinan)').slice(0, 200);
	next.document.delivery = blankBuilder(
		kind,
		context.courseId,
	).document.delivery;
	return next;
}
export function matchingPictures(block: BuilderBlock, images: BuilderImage[] | undefined) {
	if (!images || !block.destinations || images.length !== block.destinations.length) return undefined;
	const result = block.destinations.map((dest) =>
		images.find(
			(img) =>
				img.caption.trim().toLowerCase() === dest.title.trim().toLowerCase() ||
				(img.caption.trim().match(/\bBild ([A-Z])\b/i)?.[1] ||
					img.caption.trim().match(/^([A-Z])(?:\s*[·.)-]|\s*$)/)?.[1]) === dest.label,
		),
	);
	if (result.some((img) => !img) || new Set(result.map((img) => img?.id)).size !== images.length) return undefined;
	return result as BuilderImage[];
}

export type ScheduledActivityPlan = {
	kind: ActivityKind;
	title: string;
	minutes: number;
	required: boolean;
	content: string;
	url: string;
	questions: QuizQuestionEditable[];
	worksheet?: ScheduledWorksheet;
	lesson?: ScheduledLesson;
	materialIds: string[];
	cpmkIds: string[];
	subCpmkIds: string[];
};

export type ScheduledGradingPlan = {
	activityIndex: number;
	mode: 'ungraded' | 'points' | 'rubric';
	maxPoints: number;
	criteria: { id: string; label: string; maxPoints: number }[];
};

export type ScheduledClassPlan = {
	title: string;
	instructions: string;
	section: string;
	startsAt: string;
	joinUntil: string;
	lateAfterMin: number;
	activities: ScheduledActivityPlan[];
	gradingSettings: ScheduledGradingPlan[];
};

function bilingualFromText(value: string, translation?: string): Bilingual {
	const trimmed = value.trim();
	const tr = translation?.trim();
	return {
		...(trimmed ? { de: trimmed } : {}),
		...(tr ? { id: tr } : {}),
	};
}

function splitPromptAndTranslation(text: string): { prompt: string; translation?: string } {
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	if (lines.length >= 2) {
		return {
			prompt: lines[0].slice(0, 1000),
			translation: lines.slice(1).join(' ').slice(0, 1000),
		};
	}
	return { prompt: (lines[0] || text.trim() || 'Pertanyaan').slice(0, 1000) };
}

function safeItemId(id: string, fallbackPrefix: string, index: number, used: Set<string>): string {
	const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 70);
	let candidate = cleaned || `${fallbackPrefix}-${index + 1}`;
	let suffix = 2;
	while (used.has(candidate)) {
		candidate = `${(cleaned || fallbackPrefix).slice(0, 65)}-${suffix++}`;
	}
	used.add(candidate);
	return candidate;
}

function isPocketBaseId(value?: string): value is string {
	return Boolean(value && /^[a-zA-Z0-9]{15}$/.test(value));
}

function extractFileIdFromUrl(url?: string): string | undefined {
	if (!url) return undefined;
	const match = url.match(/\/api\/files\/(?:file_library|[a-zA-Z0-9_]+)\/([a-zA-Z0-9]{15})\//);
	return match?.[1];
}

function defaultStepPair(title: string, instructions: string) {
	const clean = instructions.trim() || title.trim() || 'Pelajari penjelasan berikut.';
	return {
		de: clean.slice(0, 800),
		id: clean.slice(0, 800),
	};
}

function normalizeScheduledLesson(
	lesson: ScheduledLesson | undefined,
	activityTitle: string,
	fallbackInstructions: string,
	materialIds: string[],
): ScheduledLesson | undefined {
	if (!lesson) return undefined;
	const fallback = defaultStepPair(activityTitle, fallbackInstructions);
	const goal = {
		de: (lesson.goal?.de?.trim() || lesson.goal?.id?.trim() || fallback.de).slice(0, 500),
		id: (lesson.goal?.id?.trim() || lesson.goal?.de?.trim() || fallback.id).slice(0, 500),
	};
	const rawSteps = (lesson.steps || []).filter((s) => s?.de?.trim() || s?.id?.trim());
	const steps = (rawSteps.length ? rawSteps.slice(0, 8) : [fallback]).map((s) => ({
		de: (s.de?.trim() || s.id?.trim() || fallback.de).slice(0, 800),
		id: (s.id?.trim() || s.de?.trim() || fallback.id).slice(0, 800),
	}));
	const scenes = (lesson.scenes || []).slice(0, 10).map((scene) => {
		const titleDe = (scene.title?.de?.trim() || scene.title?.id?.trim() || activityTitle || 'Penjelasan').slice(0, 200);
		const titleId = (scene.title?.id?.trim() || scene.title?.de?.trim() || activityTitle || 'Penjelasan').slice(0, 200);
		const introDe = (scene.intro?.de?.trim() || scene.intro?.id?.trim() || goal.de).slice(0, 1500);
		const introId = (scene.intro?.id?.trim() || scene.intro?.de?.trim() || goal.id).slice(0, 1500);
		const out: ScheduledLesson['scenes'][number] = {
			kind: scene.kind,
			title: { de: titleDe, id: titleId },
			intro: { de: introDe, id: introId },
		};
		if (scene.cards?.length) {
			out.cards = scene.cards.slice(0, 8).map((c, idx) => ({
				label: (c.label?.trim() || `Kartu ${idx + 1}`).slice(0, 100),
				tone: ['neutral', 'must', 'may', 'stop'].includes(c.tone) ? c.tone : 'neutral',
				text: {
					de: (c.text?.de?.trim() || c.text?.id?.trim() || titleDe).slice(0, 1000),
					id: (c.text?.id?.trim() || c.text?.de?.trim() || titleId).slice(0, 1000),
				},
			}));
		}
		if (scene.sentence) {
			out.sentence = scene.sentence;
		}
		if (scene.turns?.length) {
			out.turns = scene.turns.slice(0, 16).map((t) => ({
				role: t.role === 'patient' ? 'patient' : 'doctor',
				text: {
					de: (t.text?.de?.trim() || t.text?.id?.trim() || '...').slice(0, 800),
					id: (t.text?.id?.trim() || t.text?.de?.trim() || '...').slice(0, 800),
				},
			}));
		}
		return out;
	});
	const out: ScheduledLesson = {
		goal,
		steps,
		scenes,
	};
	if (lesson.videos?.length) {
		const validVideos = lesson.videos.filter(
			(v) =>
				v.id?.trim() &&
				/^\/media\/lessons\/[a-z0-9/-]+\.mp4$/.test(v.src || '') &&
				/^\/media\/lessons\/[a-z0-9/-]+\.jpg$/.test(v.poster || ''),
		);
		if (validVideos.length) out.videos = validVideos.slice(0, 5);
	}
	if (lesson.videoNote?.de?.trim() && lesson.videoNote?.id?.trim()) {
		out.videoNote = {
			de: lesson.videoNote.de.trim().slice(0, 1000),
			id: lesson.videoNote.id.trim().slice(0, 1000),
		};
	}
	if (lesson.note?.de?.trim() && lesson.note?.id?.trim()) {
		out.note = {
			de: lesson.note.de.trim().slice(0, 1000),
			id: lesson.note.id.trim().slice(0, 1000),
		};
	}
	if (
		lesson.source &&
		materialIds.includes(lesson.source.sourceMaterialId) &&
		Number.isInteger(lesson.source.sourcePage) &&
		lesson.source.sourcePage >= 1
	) {
		out.source = {
			sourceMaterialId: lesson.source.sourceMaterialId,
			sourcePage: lesson.source.sourcePage,
			sourceLabel: (lesson.source.sourceLabel?.trim() || 'Buku').slice(0, 160),
		};
	}
	return out;
}

function isPureSingleChoiceActivity(activity: BuilderActivity, questionsById: Record<string, BuilderQuestion>): boolean {
	const blocks = flattenResolvedBlocks(resolveActivityLayout(activity));
	const assessable = blocks.filter((b) =>
		['question_group', 'matching', 'gap_passage', 'writing', 'reflection'].includes(b.type),
	);
	if (!assessable.length) return false;
	if (assessable.some((b) => b.type !== 'question_group')) return false;
	if (blocks.some((b) => b.type === 'lesson')) return false;
	const qids = assessable.flatMap(questionIds);
	if (!qids.length) return false;
	return qids.every((id) => {
		const q = questionsById[id];
		return q && q.kind === 'single_choice' && (q.options?.length || 0) >= 2 && (q.options?.length || 0) <= 6;
	});
}

/**
 * Converts a BuilderEnvelope (`kind: 'kelas'`) into a ScheduledClassPlan ready for
 * `scheduledRequest(meetingId, 'schedule' | 'savePlan', ...)`.
 */
export function builderToScheduledPlan(envelope: BuilderEnvelope): ScheduledClassPlan {
	const { document: d, privateKeys } = envelope;
	const totalPlannedMinutes = d.activities.reduce((sum, a) => sum + Math.max(1, Math.round(a.plannedMinutes || 15)), 0);
	const startsAtMs = Date.parse(d.delivery.startsAt);
	const endsAtMs = Date.parse(d.delivery.endsAt);
	const slotMinutes =
		Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs) && endsAtMs > startsAtMs
			? Math.round((endsAtMs - startsAtMs) / 60000)
			: totalPlannedMinutes;

	const activities: ScheduledActivityPlan[] = [];
	const gradingSettings: ScheduledGradingPlan[] = [];

	d.activities.forEach((builderActivity, activityIndex) => {
		const blocks = flattenResolvedBlocks(resolveActivityLayout(builderActivity));
		const usedItemIds = new Set<string>();
		const usedBlockIds = new Set<string>();
		const materialIdSet = new Set<string>();
		const addMaterialId = (id?: string) => {
			if (isPocketBaseId(id) && materialIdSet.size < 8) {
				materialIdSet.add(id);
			}
		};

		const instructionTexts: string[] = [];
		let referenceUrl = '';
		let rawLesson: ScheduledLesson | undefined;

		for (const block of blocks) {
			if (block.type === 'instructions') {
				const text = plain(block.body).trim();
				if (text) instructionTexts.push(text);
			} else if (block.type === 'reference' && block.url && /^https:\/\//i.test(block.url.trim())) {
				if (!referenceUrl) referenceUrl = block.url.trim();
			} else if (block.type === 'lesson' && block.lesson) {
				if (!rawLesson) rawLesson = block.lesson;
			}
			if (block.asset?.fileId) addMaterialId(block.asset.fileId);
			for (const img of block.images || []) {
				if (img.asset?.fileId) addMaterialId(img.asset.fileId);
				addMaterialId(extractFileIdFromUrl(img.url));
			}
			for (const dest of block.destinations || []) {
				addMaterialId(extractFileIdFromUrl(dest.url));
			}
		}

		let minutes = Math.max(1, Math.min(600, Math.round(builderActivity.plannedMinutes || 15)));
		if (
			activityIndex === d.activities.length - 1 &&
			slotMinutes > totalPlannedMinutes &&
			slotMinutes - totalPlannedMinutes + minutes <= 600
		) {
			minutes = slotMinutes - totalPlannedMinutes + minutes;
		}

		const pureQuiz = isPureSingleChoiceActivity(builderActivity, d.questionsById);
		const hasReflection = blocks.some((b) => b.type === 'reflection');
		const hasAssessable = blocks.some((b) =>
			['question_group', 'matching', 'gap_passage', 'writing', 'reflection'].includes(b.type),
		);

		const kind: ActivityKind = pureQuiz
			? 'quiz'
			: hasReflection && !blocks.some((b) => ['matching', 'gap_passage', 'writing', 'question_group'].includes(b.type))
				? 'exit_ticket'
				: hasAssessable
					? 'assignment'
					: 'material';

		const content =
			instructionTexts.join('\n\n').slice(0, 20000) ||
			(kind !== 'quiz' ? builderActivity.title.trim() : '');

		const materialIds = [...materialIdSet];
		const lesson = normalizeScheduledLesson(rawLesson, builderActivity.title, content, materialIds);

		if (kind === 'quiz') {
			const qids = blocks.filter((b) => b.type === 'question_group').flatMap(questionIds);
			const questions: QuizQuestionEditable[] = qids.slice(0, 100).map((qid, qIdx) => {
				const q = d.questionsById[qid];
				const key = privateKeys.answersByQuestionId[qid];
				const options = (q?.options || []).slice(0, 6).map((o, oIdx) => o.label.trim() || `Pilihan ${oIdx + 1}`);
				const correctIndex = Math.max(
					0,
					(q?.options || []).findIndex((o) => o.id === key?.correctOptionId),
				);
				return {
					id: `q${qIdx}`,
					text: (plain(q?.prompt).trim() || `Pertanyaan ${qIdx + 1}`).slice(0, 2000),
					options: options.length >= 2 ? options : ['A', 'B'],
					correctIndex,
					points: Math.max(1, Math.min(100, Number(q?.points) || 1)),
					explanation: plain(key?.explanation).trim().slice(0, 2000),
				};
			});
			activities.push({
				kind: 'quiz',
				title: builderActivity.title.trim() || `Kegiatan ${activityIndex + 1}`,
				minutes,
				required: builderActivity.required !== false,
				content,
				url: referenceUrl,
				questions,
				...(lesson ? { lesson } : {}),
				materialIds,
				cpmkIds: [],
				subCpmkIds: [],
			});
			return;
		}

		if (kind === 'material') {
			const ackBlock = blocks.find((b) => b.type === 'acknowledgement');
			const ackText = plain(ackBlock?.body).trim();
			const fullContent = [content, ackText && ackText !== 'Saya sudah membaca dan memahami materi.' ? ackText : '']
				.filter(Boolean)
				.join('\n\n')
				.slice(0, 20000) || builderActivity.title.trim();
			activities.push({
				kind: 'material',
				title: builderActivity.title.trim() || `Kegiatan ${activityIndex + 1}`,
				minutes,
				required: builderActivity.required !== false,
				content: fullContent,
				url: referenceUrl,
				questions: [],
				...(lesson ? { lesson } : {}),
				materialIds,
				cpmkIds: [],
				subCpmkIds: [],
			});
			return;
		}

		const items: ScheduledWorksheet['items'] = [];
		const wsBlocks: ScheduledWorksheetBlock[] = [];
		const answerKeyItems: Record<string, WorksheetAnswerKeyEntry> = {};
		const rubricCriteria: { id: string; label: string; maxPoints: number }[] = [];
		let totalManualPoints = 0;
		let hasManualQuestion = false;
		let allFeedbackOnly = true;

		const consumedImageBlockIds = new Set<string>();
		for (let i = 0; i < blocks.length; i++) {
			const b = blocks[i];
			const prev = blocks[i - 1];
			if (b.type === 'matching' && prev?.type === 'image') {
				const matchedImgs = matchingPictures(b, prev.images);
				if (matchedImgs) consumedImageBlockIds.add(prev.id);
			}
		}

		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			const prev = blocks[i - 1];
			const blockId = safeItemId(block.id, 'block', i, usedBlockIds);

			if (block.type === 'instructions') {
				const bodyText = plain(block.body).trim();
				if (bodyText && i > 0) {
					wsBlocks.push({
						id: blockId,
						type: 'instructions',
						body: bilingualFromText(bodyText),
					});
				}
				continue;
			}

			if (block.type === 'image') {
				if (consumedImageBlockIds.has(block.id)) continue;
				const images = block.images?.length
					? block.images
					: block.asset || block.url
						? [{ id: block.id, asset: block.asset, url: block.url, alt: block.alt || '', caption: block.label || '' }]
						: [];
				for (const [imgIdx, img] of images.entries()) {
					const imgBlockId = safeItemId(`${blockId}-img-${imgIdx}`, 'img', imgIdx, usedBlockIds);
					const assetId = img.asset?.fileId || extractFileIdFromUrl(img.url);
					if (assetId) addMaterialId(assetId);
					wsBlocks.push({
						id: imgBlockId,
						type: 'image',
						body: bilingualFromText(img.alt || img.caption || 'Gambar'),
						...(img.caption ? { caption: bilingualFromText(img.caption) } : {}),
						...(assetId ? { asset: assetId } : img.url ? { asset: img.url.slice(0, 80) } : {}),
					});
				}
				continue;
			}

			if (block.type === 'audio') {
				const assetId = block.asset?.fileId || extractFileIdFromUrl(block.url) || block.url?.slice(0, 80);
				if (isPocketBaseId(assetId)) addMaterialId(assetId);
				if (assetId) {
					wsBlocks.push({
						id: blockId,
						type: 'audio',
						asset: assetId,
						...(block.label ? { label: block.label.slice(0, 80) } : {}),
					});
				}
				continue;
			}

			if (block.type === 'matching') {
				const pairedImages = prev?.type === 'image' ? matchingPictures(block, prev.images) : undefined;
				const rawDestinations = block.destinations?.length
					? block.destinations.slice(0, 6)
					: [
							{ id: 'A', label: 'A', title: 'Kelompok A' },
							{ id: 'B', label: 'B', title: 'Kelompok B' },
						];
				const usedLabels = new Set<string>();
				const destByOriginalId = new Map<string, WorksheetDestination>();
				const destinations: WorksheetDestination[] = rawDestinations.map((dest, dIdx) => {
					let label = (dest.label?.trim() || String.fromCharCode(65 + dIdx)).slice(0, 40);
					if (usedLabels.has(label)) label = `${label}-${dIdx + 1}`;
					usedLabels.add(label);
					const pairedImg = pairedImages?.[dIdx];
					const imageFileId =
						pairedImg?.asset?.fileId ||
						extractFileIdFromUrl(pairedImg?.url) ||
						extractFileIdFromUrl(dest.url);
					if (imageFileId) addMaterialId(imageFileId);
					const titleParts = splitPromptAndTranslation(dest.title || label);
					const wsDest: WorksheetDestination = {
						id: label,
						label,
						title: bilingualFromText(titleParts.prompt, titleParts.translation),
						...(isPocketBaseId(imageFileId) ? { image: imageFileId } : {}),
					};
					destByOriginalId.set(dest.id, wsDest);
					destByOriginalId.set(label, wsDest);
					return wsDest;
				});

				const optionLabels = destinations.map((d) => d.label);
				const cardItemIds: string[] = [];
				for (const [qIdx, qid] of (block.questionIds || []).entries()) {
					if (items.length >= 30) break;
					const q = d.questionsById[qid];
					if (!q) continue;
					const itemId = safeItemId(qid, 'match', qIdx, usedItemIds);
					const { prompt, translation } = splitPromptAndTranslation(plain(q.prompt));
					items.push({
						id: itemId,
						prompt,
						...(translation ? { translation } : {}),
						type: 'select',
						options: optionLabels,
					});
					cardItemIds.push(itemId);
					const key = privateKeys.answersByQuestionId[qid];
					const targetDest = key?.correctDestinationId
						? destByOriginalId.get(key.correctDestinationId)
						: undefined;
					if (targetDest) {
						answerKeyItems[itemId] = {
							mode: 'exact',
							accepted: [targetDest.label],
							points: Math.max(1, Math.min(100, Number(q.points) || 1)),
						};
						allFeedbackOnly = false;
					}
				}
				if (cardItemIds.length && destinations.length >= 2) {
					wsBlocks.push({
						id: blockId,
						type: 'match',
						prompt: bilingualFromText('Cocokkan pernyataan ke kelompok tujuan.'),
						layout: 'destinations-above',
						destinations,
						cardItemIds,
					});
				}
				continue;
			}

			if (block.type === 'gap_passage') {
				const sections: NonNullable<Extract<ScheduledWorksheetBlock, { type: 'passage' }>['sections']> = [];
				const usedSectionIds = new Set<string>();
				for (const [sIdx, sec] of (block.sections || []).slice(0, 12).entries()) {
					const secId = safeItemId(sec.id || `sec-${sIdx + 1}`, 'sec', sIdx, usedSectionIds);
					const segments: WorksheetSegment[] = [];
					let gapCountInSec = 0;
					for (const seg of sec.segments || []) {
						if (seg.type === 'text') {
							if (seg.text.trim()) {
								segments.push({
									type: 'text',
									text: { de: seg.text.slice(0, 2000) },
								});
							}
						} else if (seg.type === 'gap' && items.length < 30) {
							const q = d.questionsById[seg.questionId];
							if (!q) continue;
							gapCountInSec++;
							const itemId = safeItemId(seg.questionId, 'gap', items.length, usedItemIds);
							const rawPrompt = plain(q.prompt).trim();
							const contextPreview = (sec.segments || [])
								.map((part, pIdx) => {
									if (part.type === 'text') return part.text;
									const gNum =
										(sec.segments || [])
											.slice(0, pIdx + 1)
											.filter((x) => x.type === 'gap').length;
									return `(${gNum}) ______`;
								})
								.join('')
								.trim();
							const itemPrompt =
								rawPrompt && rawPrompt !== 'Isian baru' && !/^Isian \d+$/i.test(rawPrompt)
									? rawPrompt.slice(0, 1000)
									: `Bagian ${sIdx + 1} · Lücke ${gapCountInSec}: ${contextPreview}`.slice(0, 1000);
							items.push({
								id: itemId,
								prompt: itemPrompt,
								type: 'text',
							});
							segments.push({ type: 'gap', itemId });
							const key = privateKeys.answersByQuestionId[seg.questionId];
							const accepted = (key?.accepted || []).map((v) => v.trim()).filter(Boolean);
							if (accepted.length) {
								answerKeyItems[itemId] = {
									mode: 'exact',
									accepted,
									points: Math.max(1, Math.min(100, Number(q.points) || 1)),
								};
								allFeedbackOnly = false;
							}
						}
					}
					if (segments.some((s) => s.type === 'gap')) {
						sections.push({ id: secId, segments });
					}
				}
				if (sections.length) {
					wsBlocks.push({
						id: blockId,
						type: 'passage',
						sections,
					});
				}
				continue;
			}

			if (block.type === 'writing' || block.type === 'reflection' || block.type === 'question_group') {
				const qids = questionIds(block);
				const reflectionItemIds: string[] = [];
				for (const [qIdx, qid] of qids.entries()) {
					if (items.length >= 30) break;
					const q = d.questionsById[qid];
					if (!q) continue;
					const key = privateKeys.answersByQuestionId[qid];
					const itemId = safeItemId(qid, 'item', items.length, usedItemIds);
					const { prompt, translation } = splitPromptAndTranslation(plain(q.prompt));

					if (q.kind === 'single_choice' && (q.options?.length || 0) >= 2) {
						const opts = q.options!.slice(0, 6).map((o, oIdx) => (o.label.trim() || `Pilihan ${oIdx + 1}`).slice(0, 200));
						items.push({
							id: itemId,
							prompt,
							...(translation ? { translation } : {}),
							type: 'select',
							options: opts,
						});
						const correctOpt = q.options!.find((o) => o.id === key?.correctOptionId);
						if (correctOpt) {
							answerKeyItems[itemId] = {
								mode: 'exact',
								accepted: [correctOpt.label.trim() || opts[0]],
								points: Math.max(1, Math.min(100, Number(q.points) || 1)),
							};
							allFeedbackOnly = false;
						}
					} else {
						items.push({
							id: itemId,
							prompt,
							...(translation ? { translation } : {}),
							type: 'text',
						});
						if (key?.strategy === 'exact_text') {
							const accepted = (key.accepted || []).map((v) => v.trim()).filter(Boolean);
							if (accepted.length) {
								answerKeyItems[itemId] = {
									mode: 'exact',
									accepted,
									points: Math.max(1, Math.min(100, Number(q.points) || 1)),
								};
								allFeedbackOnly = false;
							}
						} else if (key?.strategy === 'rubric') {
							hasManualQuestion = true;
							allFeedbackOnly = false;
							totalManualPoints += Math.max(0, Number(q.points) || 0);
							const modelAnswer = plain(key.modelAnswer).trim().slice(0, 4000);
							const guidance = plain(key.privateGuidance).trim().slice(0, 2000);
							if (q.rubric?.criteria.length) {
								for (const c of q.rubric.criteria) {
									if (c.label.trim() && c.maxPoints > 0) {
										rubricCriteria.push({
											id: safeItemId(c.id, 'crit', rubricCriteria.length, new Set(rubricCriteria.map((x) => x.id))),
											label: c.label.trim().slice(0, 200),
											maxPoints: c.maxPoints,
										});
									}
								}
							}
							const rubricSummary = [
								guidance,
								...(q.rubric?.criteria || []).map((c) => `${c.label.trim()} (${c.maxPoints} poin)`),
							]
								.filter(Boolean)
								.join('\n')
								.slice(0, 2000);
							if (modelAnswer || rubricSummary) {
								answerKeyItems[itemId] = {
									mode: 'reference',
									...(modelAnswer ? { modelAnswer } : {}),
									...(rubricSummary ? { rubric: rubricSummary } : {}),
								};
							}
						}

						if (block.type === 'reflection' || q.kind === 'reflection') {
							reflectionItemIds.push(itemId);
						} else {
							const isExtended = block.type === 'writing' || q.kind === 'long_writing';
							wsBlocks.push({
								id: safeItemId(`${blockId}-w-${qIdx}`, 'write', qIdx, usedBlockIds),
								type: 'writing',
								itemId,
								prompt: bilingualFromText(prompt, translation),
								responseLength: isExtended ? 'extended' : 'short',
								rows: isExtended ? 10 : 3,
							});
						}
					}
				}
				if (reflectionItemIds.length) {
					wsBlocks.push({
						id: blockId,
						type: 'reflection',
						itemIds: reflectionItemIds,
						prompt: bilingualFromText(builderActivity.title || 'Refleksi'),
					});
				}
			}
		}

		const answeredIds = new Map<string, number>();
		const bump = (id: string) => answeredIds.set(id, (answeredIds.get(id) || 0) + 1);
		for (const wb of wsBlocks) {
			if (wb.type === 'match') wb.cardItemIds.forEach(bump);
			else if (wb.type === 'gap') wb.segments.filter((s) => s.type === 'gap').forEach((s) => bump(s.itemId));
			else if (wb.type === 'passage')
				wb.sections.forEach((sec) => sec.segments.filter((s) => s.type === 'gap').forEach((s) => bump(s.itemId)));
			else if (wb.type === 'writing') bump(wb.itemId);
			else if (wb.type === 'reflection') wb.itemIds.forEach(bump);
		}
		const validBlocks =
			wsBlocks.length > 0 &&
			wsBlocks.length <= 60 &&
			items.every((item) => answeredIds.get(item.id) === 1);

		const finalMaterialIds = [...materialIdSet];
		const worksheet: ScheduledWorksheet | undefined = items.length
			? {
					items,
					...(validBlocks ? { blocks: wsBlocks } : {}),
					...(Object.keys(answerKeyItems).length
						? { answerKey: { version: 1, items: answerKeyItems } }
						: {}),
				}
			: undefined;

		activities.push({
			kind,
			title: builderActivity.title.trim() || `Kegiatan ${activityIndex + 1}`,
			minutes,
			required: builderActivity.required !== false,
			content,
			url: referenceUrl,
			questions: [],
			...(worksheet ? { worksheet } : {}),
			...(lesson ? { lesson } : {}),
			materialIds: finalMaterialIds,
			cpmkIds: [],
			subCpmkIds: [],
		});

		if (hasManualQuestion) {
			if (rubricCriteria.length) {
				const maxPoints = rubricCriteria.reduce((s, c) => s + c.maxPoints, 0);
				gradingSettings.push({
					activityIndex,
					mode: 'rubric',
					maxPoints,
					criteria: rubricCriteria,
				});
			} else {
				gradingSettings.push({
					activityIndex,
					mode: 'points',
					maxPoints: totalManualPoints > 0 ? totalManualPoints : 100,
					criteria: [],
				});
			}
		} else if (kind === 'exit_ticket' && allFeedbackOnly) {
			gradingSettings.push({
				activityIndex,
				mode: 'ungraded',
				maxPoints: 0,
				criteria: [],
			});
		}
	});

	return {
		title: d.title.trim(),
		instructions: plain(d.instructions).trim(),
		section: d.context.sectionIds[0] || '',
		startsAt: d.delivery.startsAt,
		joinUntil: d.delivery.checkInClosesAt || d.delivery.startsAt,
		lateAfterMin: Number.isInteger(d.delivery.lateAfterMinutes) ? d.delivery.lateAfterMinutes : 10,
		activities,
		gradingSettings,
	};
}

function sourceToAsset(
	source: NonNullable<ScheduledActivity['sources']>[number],
): BuilderAsset | undefined {
	if (!source.id) return undefined;
	const filename =
		source.filename ||
		(source.url ? decodeURIComponent(source.url.split('/').pop() || '') : '');
	if (!filename) return undefined;
	return {
		fileId: source.id,
		filename,
		version: source.version || 1,
		name: source.title || filename,
	};
}

function populateQuestionFromWorksheetItem(
	envelope: BuilderEnvelope,
	item: ScheduledWorksheet['items'][number],
	key: WorksheetAnswerKeyEntry | undefined,
	kind: QuestionKind,
): string {
	const id = appendQuestion(envelope, kind);
	const q = envelope.document.questionsById[id];
	q.prompt = rich([item.prompt, item.translation].filter(Boolean).join('\n'));
	if (item.type === 'select' && kind === 'single_choice') {
		q.options = (item.options || []).map((label) => ({ id: uid(), label }));
	}
	if (key?.mode === 'exact') {
		q.points = key.points;
		if (kind === 'single_choice') {
			envelope.privateKeys.answersByQuestionId[id] = {
				strategy: 'single_choice',
				correctOptionId:
					q.options?.find((o) => key.accepted.includes(o.label))?.id || '',
			};
		} else if (kind === 'matching') {
			envelope.privateKeys.answersByQuestionId[id] = {
				strategy: 'matching',
				correctDestinationId: key.accepted[0] || '',
			};
		} else {
			envelope.privateKeys.answersByQuestionId[id] = {
				strategy: 'exact_text',
				accepted: [...key.accepted],
				comparison: { ignoreCase: true, ignorePunctuation: true },
			};
		}
	} else if (key?.mode === 'reference') {
		envelope.privateKeys.answersByQuestionId[id] = {
			strategy: 'rubric',
			modelAnswer: rich(key.modelAnswer || ''),
			privateGuidance: rich(key.rubric || ''),
		};
	}
	return id;
}

/**
 * Losslessly converts a ScheduledClassState into a BuilderEnvelope (`kind: 'kelas'`),
 * preserving matching blocks (with Berkas images), gap passages, lessons, audio/images,
 * writing rows, and answer keys.
 */
export function scheduledStateToBuilder(
	state: ScheduledClassState,
	context: BuilderDocument['context'],
	origin: string,
	options: { isCopy?: boolean } = { isCopy: true },
): BuilderEnvelope {
	const isCopy = options.isCopy !== false;
	const next = blankBuilder(
		'kelas',
		context.courseId,
		context.meetingId,
		context.sectionIds,
	);
	next.document.context = context;
	const baseTitle = state.class?.title || state.session.title || 'Kelas baru';
	next.document.title = (isCopy ? `${baseTitle} (salinan)` : baseTitle).slice(0, 200);
	next.document.instructions = rich(state.class?.instructions || '');
	if (!isCopy && state.class) {
		next.document.delivery = {
			...next.document.delivery,
			startsAt: state.class.startsAt || '',
			endsAt: state.class.endsAt || '',
			checkInClosesAt: state.class.joinUntil || '',
			lateAfterMinutes: state.class.lateAfterMin ?? 10,
		};
	}
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
				...(source.lesson.videos ? { videos: source.lesson.videos } : {}),
				...(source.lesson.videoNote ? { videoNote: source.lesson.videoNote } : {}),
				...(source.lesson.note ? { note: source.lesson.note } : {}),
				...(source.lesson.source ? { source: source.lesson.source } : {}),
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

		const wsBlocks = source.worksheet?.blocks || [];
		const audioAssetsInBlocks = new Set(
			wsBlocks.filter((b): b is Extract<ScheduledWorksheetBlock, { type: 'audio' }> => b.type === 'audio').map((b) => b.asset),
		);
		for (const src of source.sources || []) {
			const nameOrUrl = src.filename || src.url || '';
			if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(nameOrUrl) && src.id && !audioAssetsInBlocks.has(src.id)) {
				const asset = sourceToAsset(src);
				if (asset) {
					const bid = appendBlock(next, activity.id, 'audio');
					const b = activity.blocks.find((x) => x.id === bid)!;
					b.asset = asset;
					b.label = src.title;
				}
			}
		}

		const questions = source.kind === 'quiz' ? source.questions || [] : [];
		if (questions.length) {
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
		}

		const sheet = source.worksheet;
		if (sheet?.items.length) {
			const itemsById = new Map(sheet.items.map((item) => [item.id, item]));
			const keys = sheet.answerKey?.items || {};

			if (wsBlocks.length) {
				for (const wb of wsBlocks) {
					if (wb.type === 'instructions') {
						const text = [wb.body.de, wb.body.id].filter(Boolean).join('\n');
						if (text) {
							const bid = appendBlock(next, activity.id, 'instructions');
							activity.blocks.find((b) => b.id === bid)!.body = rich(text);
						}
					} else if (wb.type === 'image') {
						const src = (source.sources || []).find((s) => s.id === wb.asset);
						const asset = src ? sourceToAsset(src) : undefined;
						const bid = appendBlock(next, activity.id, 'image');
						const b = activity.blocks.find((x) => x.id === bid)!;
						if (asset) b.asset = asset;
						else if (wb.asset && /^https:\/\//i.test(wb.asset)) b.url = wb.asset;
						b.alt = wb.body.de || wb.body.id || src?.title || 'Gambar';
						b.label = wb.caption?.de || wb.caption?.id || '';
					} else if (wb.type === 'audio') {
						const src = (source.sources || []).find((s) => s.id === wb.asset);
						const asset = src ? sourceToAsset(src) : undefined;
						const bid = appendBlock(next, activity.id, 'audio');
						const b = activity.blocks.find((x) => x.id === bid)!;
						if (asset) b.asset = asset;
						else if (/^https:\/\//i.test(wb.asset)) b.url = wb.asset;
						b.label = wb.label || src?.title || 'Audio';
					} else if (wb.type === 'match') {
						const destImages: BuilderImage[] = [];
						for (const dest of wb.destinations) {
							if (dest.image) {
								const src = (source.sources || []).find((s) => s.id === dest.image);
								const asset = src ? sourceToAsset(src) : undefined;
								if (asset || src?.url) {
									destImages.push({
										id: uid(),
										...(asset ? { asset } : {}),
										...(src?.url && /^https:\/\//i.test(src.url) ? { url: src.url } : {}),
										alt: dest.title.de || dest.title.id || dest.label,
										caption: `${dest.label} · ${dest.title.de || dest.title.id || dest.label}`,
									});
								}
							}
						}
						if (destImages.length === wb.destinations.length) {
							activity.blocks.push({
								id: uid(),
								type: 'image',
								images: destImages,
								columns: Math.min(4, destImages.length),
							});
						}
						const destinations = wb.destinations.map((dest) => ({
							id: uid(),
							label: dest.label,
							title: [dest.title.de, dest.title.id].filter(Boolean).join(' / ') || dest.label,
						}));
						const destIdByLabel = new Map(destinations.map((d) => [d.label, d.id]));
						const qids: string[] = [];
						for (const itemId of wb.cardItemIds) {
							const item = itemsById.get(itemId);
							if (!item) continue;
							const key = keys[item.id];
							const qid = populateQuestionFromWorksheetItem(next, item, key, 'matching');
							const targetLabel = key?.mode === 'exact' ? key.accepted[0] : '';
							if (targetLabel && destIdByLabel.has(targetLabel)) {
								next.privateKeys.answersByQuestionId[qid].correctDestinationId = destIdByLabel.get(targetLabel)!;
							}
							qids.push(qid);
						}
						activity.blocks.push({
							id: uid(),
							type: 'matching',
							destinations,
							questionIds: qids,
						});
					} else if (wb.type === 'passage' || wb.type === 'gap') {
						const rawSections =
							wb.type === 'passage'
								? wb.sections
								: [{ id: wb.id, segments: wb.segments }];
						const sections: NonNullable<BuilderBlock['sections']> = [];
						for (const sec of rawSections) {
							const segments: NonNullable<BuilderBlock['sections']>[number]['segments'] = [];
							for (const seg of sec.segments) {
								if (seg.type === 'text') {
									segments.push({
										type: 'text',
										text: seg.text.de || seg.text.id || '',
									});
								} else if (seg.type === 'gap') {
									const item = itemsById.get(seg.itemId);
									if (!item) continue;
									const qid = populateQuestionFromWorksheetItem(next, item, keys[item.id], 'short_answer');
									segments.push({ type: 'gap', questionId: qid });
								}
							}
							if (segments.length) sections.push({ id: uid(), segments });
						}
						if (sections.length) {
							activity.blocks.push({
								id: uid(),
								type: 'gap_passage',
								sections,
							});
						}
					} else if (wb.type === 'writing') {
						const item = itemsById.get(wb.itemId);
						if (!item) continue;
						const key = keys[item.id];
						const isShortExact = key?.mode === 'exact' && wb.responseLength === 'short';
						const qKind: QuestionKind = isShortExact ? 'short_answer' : 'long_writing';
						const qid = populateQuestionFromWorksheetItem(next, item, key, qKind);
						activity.blocks.push({
							id: uid(),
							type: isShortExact ? 'question_group' : 'writing',
							...(isShortExact ? { questionIds: [qid] } : { questionId: qid }),
						});
					} else if (wb.type === 'reflection') {
						const qids: string[] = [];
						for (const itemId of wb.itemIds) {
							const item = itemsById.get(itemId);
							if (!item) continue;
							qids.push(populateQuestionFromWorksheetItem(next, item, keys[item.id], 'reflection'));
						}
						if (qids.length) {
							activity.blocks.push({
								id: uid(),
								type: 'reflection',
								questionIds: qids,
							});
						}
					}
				}
			} else {
				const targets = cardMatchingTargets(source);
				if (targets.length >= 2) {
					const destImages: BuilderImage[] = [];
					for (const target of targets) {
						const label = target.value;
						const src = (source.sources || []).find(
							(s) =>
								s.available &&
								((s.title.match(/\bBild ([A-Z])\b/i)?.[1] ||
									s.title.match(/^([A-Z])\s*·/)?.[1]) === label ||
									s.title === target.title),
						);
						const asset = src ? sourceToAsset(src) : undefined;
						if (asset) {
							destImages.push({
								id: uid(),
								asset,
								alt: target.title,
								caption: `${label} · ${target.title}`,
							});
						}
					}
					if (destImages.length === targets.length) {
						activity.blocks.push({
							id: uid(),
							type: 'image',
							images: destImages,
							columns: Math.min(4, destImages.length),
						});
					}
					const destinations = targets.map((t) => ({
						id: uid(),
						label: t.value,
						title: t.title,
						...(t.url.startsWith('https://') ? { url: t.url } : {}),
					}));
					const destIdByLabel = new Map(destinations.map((d) => [d.label, d.id]));
					const qids: string[] = [];
					for (const item of sheet.items) {
						const key = keys[item.id];
						const qid = populateQuestionFromWorksheetItem(next, item, key, 'matching');
						const targetLabel = key?.mode === 'exact' ? key.accepted[0] : '';
						if (targetLabel && destIdByLabel.has(targetLabel)) {
							next.privateKeys.answersByQuestionId[qid].correctDestinationId = destIdByLabel.get(targetLabel)!;
						}
						qids.push(qid);
					}
					activity.blocks.push({
						id: uid(),
						type: 'matching',
						destinations,
						questionIds: qids,
					});
				} else {
					const layoutBlocks = worksheetBlocks(sheet.items);
					for (const lb of layoutBlocks) {
						if (lb.context && lb.gaps?.length) {
							const segments: NonNullable<BuilderBlock['sections']>[number]['segments'] = [];
							const parts = lb.context.split(/(\(\d+\)\s*_{3,})/g);
							for (const part of parts) {
								const number = part.match(/^\((\d+)\)\s*_{3,}$/)?.[1];
								const gap = number ? lb.gaps.find((g) => g.number === number) : undefined;
								if (gap) {
									const qid = populateQuestionFromWorksheetItem(
										next,
										gap.item,
										keys[gap.item.id],
										'short_answer',
									);
									segments.push({ type: 'gap', questionId: qid });
								} else if (part) {
									segments.push({ type: 'text', text: part });
								}
							}
							activity.blocks.push({
								id: uid(),
								type: 'gap_passage',
								sections: [{ id: uid(), segments }],
							});
						} else {
							const item = lb.items[0];
							const key = keys[item.id];
							const kind: QuestionKind =
								item.type === 'select'
									? 'single_choice'
									: key?.mode === 'exact'
										? 'short_answer'
										: source.kind === 'exit_ticket'
											? 'reflection'
											: 'long_writing';
							const qid = populateQuestionFromWorksheetItem(next, item, key, kind);
							activity.blocks.push({
								id: uid(),
								type:
									kind === 'long_writing'
										? 'writing'
										: kind === 'reflection'
											? 'reflection'
											: 'question_group',
								...(kind === 'long_writing'
									? { questionId: qid }
									: { questionIds: [qid] }),
							});
						}
					}
				}
			}
		}

		const gradingSetting = state.gradingSettings?.find((g) => g.activity === source.id);
		if (gradingSetting?.mode === 'rubric' && gradingSetting.criteria.length) {
			const writingQids = activity.blocks
				.filter((b) => b.type === 'writing' || b.type === 'reflection')
				.flatMap(questionIds);
			const firstWritingQid = writingQids[0];
			if (firstWritingQid && next.document.questionsById[firstWritingQid]) {
				const q = next.document.questionsById[firstWritingQid];
				q.rubric = {
					criteria: gradingSetting.criteria.map((c) => ({
						id: uid(),
						label: c.label,
						maxPoints: c.maxPoints,
					})),
				};
				q.points = gradingSetting.criteria.reduce((s, c) => s + c.maxPoints, 0);
			}
		}

		if (!activity.blocks.length) {
			appendBlock(next, activity.id, 'acknowledgement');
		}
	}
	return next;
}

/** Copies authored content only. Attempts, participants, grading and schedule are never copied. */
export function copyScheduledToBuilder(
	state: ScheduledClassState,
	context: BuilderDocument['context'],
	origin: string,
): BuilderEnvelope {
	return scheduledStateToBuilder(state, context, origin, { isCopy: true });
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
