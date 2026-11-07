import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { addLayoutGroup, findLayoutGroup, removeLayoutGroup, type BuilderLayoutNode } from '../src/lib/builder-layout';
import {
	appendBlock,
	blankBuilder,
	copyBuilder,
	duplicateActivity,
	insertGroupTemplate,
	moveBuilderHistory,
	questionIds,
	removeBlock,
	rich,
	copyScheduledToBuilder,
	encodeBuilderDraft,
	builderWriteAction,
	applyInlineMark,
	applyInlineLink,
	safeInlineUrl,
	plain,
	resetBuilderPlayback,
	BUILDER_TRANSCRIPT_MAX_LENGTH,
	BUILDER_PLAYBACK_RATES,
	BUILDER_PLAYBACK_MAX_SECONDS,
	normalizeBuilderPlayback,
	normalizeBuilderCaptions,
	applyBlockFormat,
	adjustRichListDepth,
	normalizeBuilderRichText,
	builderRichTextValid,
	builderImagePresentationStyle,
	resetBuilderImagePresentation,
	replaceRichText,
	savedTemplateScope,
	validateBuilderAnchors,
	builderNodeVisibilitySafe,
	builderVisibilityForDevice,
	normalizeBuilderVisibility,
	remapDuplicateBuilderAnchors,
	type BuilderEnvelope,
} from '../src/lib/builder-document';
const mod = { exports: {} } as { exports: { normalize: (v: unknown) => any; extractGroupTemplate: (v: any, activityId: string, groupId: string) => any } };

describe('bounded nested rich text lists', () => {
	const sample = () => normalizeBuilderRichText({ type: 'doc', content: [
		{ type: 'heading', level: 2, content: [{ type: 'text', text: 'Heading' }] },
		{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Parent', marks: ['bold'] }] },
		{ type: 'list_item', list: 'bullet', depth: 1, content: [{ type: 'text', text: 'Child', marks: ['italic'], link: { href: 'https://example.org' } }] },
		{ type: 'list_item', list: 'number', depth: 2, content: [{ type: 'text', text: 'Grandchild' }] },
		{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Sibling' }] },
	] });
	it('normalizes flat legacy lists unchanged and preserves nested depth and inline-safe marks', () => {
		const flat = normalizeBuilderRichText({ type: 'doc', content: [{ type: 'list_item', list: 'bullet', content: [{ type: 'text', text: 'Legacy' }] }] });
		expect(flat.content[0]).not.toHaveProperty('depth');
		const nested = sample();
		expect(nested.content.map(node => node.type === 'list_item' ? node.depth || 0 : -1)).toEqual([-1, 0, 1, 2, 0]);
		expect(nested.content[2].content[0]).toMatchObject({ marks: ['italic'], link: { href: 'https://example.org' } });
	});
	it.each([
		[{ type: 'list_item', list: 'bullet', depth: 1, content: [] }],
		[{ type: 'list_item', list: 'bullet', content: [] }, { type: 'list_item', list: 'bullet', depth: 2, content: [] }],
		[{ type: 'list_item', list: 'bullet', depth: 3, content: [] }],
		[{ type: 'paragraph', depth: 1, content: [] }],
	])('rejects invalid nesting structure', content => expect(() => normalizeBuilderRichText({ type: 'doc', content })).toThrow());
	it('rejects text aggregate overflow consistently with the server bound', () => {
		expect(() => normalizeBuilderRichText({ type: 'doc', content: Array.from({ length: 2 }, () => ({ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(10001) }] })) })).toThrow(/terlalu panjang/);
		const envelope = blankBuilder('kelas', 'course');
		envelope.document.instructions = { type: 'doc', content: [{ type: 'list_item', list: 'bullet', depth: 2, content: [{ type: 'text', text: 'jump' }] }] };
		expect(builderRichTextValid(envelope)).toBe(false);
	});
	it('indents and outdents selected list rows while retaining marks, links, numbering, and headings', () => {
		const source = sample(), text = plain(source), start = text.indexOf('Sibling');
		const indented = adjustRichListDepth(source, start, start + 5, 'indent');
		expect(indented.content[0]).toEqual(source.content[0]);
		expect(indented.content[2]).toMatchObject({ type: 'list_item', list: 'bullet', depth: 1, content: [{ marks: ['italic'], link: { href: 'https://example.org' } }] });
		expect(indented.content[3]).toMatchObject({ depth: 2 });
		const outdented = adjustRichListDepth(indented, start, start + 5, 'outdent');
		expect(outdented.content[4]).toMatchObject({ list: 'number' });
		expect(outdented.content[4]).not.toHaveProperty('depth');
		const childStart = text.indexOf('Child');
		const parentOutdent = adjustRichListDepth(source, childStart, childStart + 5, 'outdent');
		expect(parentOutdent.content[2]).not.toHaveProperty('depth');
		expect(parentOutdent.content[3]).toMatchObject({ type: 'list_item', depth: 1 });
		expect(adjustRichListDepth(source, 0, 0, 'indent')).toBe(source);
	});
});

describe('builder versioned appearance writes', () => {
	it('selects the presentation visibility command for documents and saved snapshots/templates', () => {
		const document = { activities: [{ blocks: [{ presentation: { desktop: false } }], layout: { nodes: [{ kind: 'section', presentation: { mobile: false }, children: [] }] } }] };
		expect(builderWriteAction('save', { document })).toBe('presentationVisibility:save');
		expect(builderWriteAction('create', { document })).toBe('presentationVisibility:create');
		expect(builderWriteAction('saveSnapshot', { presentationVisibility: true })).toBe('presentationVisibility:saveSnapshot');
		expect(builderWriteAction('saveTemplate', { presentationVisibility: true })).toBe('presentationVisibility:saveTemplate');
	});
	it('selects the no-downgrade document anchor command for document and snapshot/template envelopes', () => {
		const document = { activities: [{ blocks: [{ anchor: 'intro' }] }] };
		expect(builderWriteAction('save', { document })).toBe('documentAnchors:save');
		expect(builderWriteAction('create', { document })).toBe('documentAnchors:create');
		expect(builderWriteAction('saveSnapshot', { documentAnchors: true })).toBe('documentAnchors:saveSnapshot');
		expect(builderWriteAction('saveTemplate', { documentAnchors: true })).toBe('documentAnchors:saveTemplate');
	});
	it('selects a separate nested-list version family that composes with other current schema flags', () => {
		const document = { activities: [{ blocks: [{ body: { type: 'doc', content: [{ type: 'list_item', list: 'bullet', depth: 1, content: [] }] }, captions: { cues: [] }, appearance: { responsive: { mobile: { corners: { topLeft: 0 } } } } }] }] };
		expect(builderWriteAction('save', { document })).toBe('nestedLists:save');
		expect(builderWriteAction('saveSnapshot', { nestedRichText: true })).toBe('nestedLists:saveSnapshot');
		expect(builderWriteAction('create', { document })).toBe('nestedLists:create');
	});
	it('dispatches every additive shadow/hover and detailed field through the protected command family', () => {
		for (const appearance of [{ shadow: 'sm' }, { hover: 'lift' }, { borderDetail: { style: 'solid' } }, { corners: { topLeft: 4 } }]) {
			expect(builderWriteAction('save', { document: { activities: [{ blocks: [{ appearance }] }] } })).toBe('detailedStyles:save');
		}
		expect(builderWriteAction('save', { document: { activities: [{ blocks: [{ appearance: { shadow: 'sm', responsive: { tablet: { corners: { topLeft: 4 } } } } }] }] } })).toBe('responsiveStyles:save');
	});
});

describe('document anchors', () => {
	it('keeps legacy documents anchor-free and validates bounded document-wide names', () => {
		const envelope = blankBuilder('kelas', 'course');
		appendBlock(envelope, envelope.document.activities[0].id, 'instructions');
		const activity = envelope.document.activities[0];
		activity.blocks[0].anchor = 'intro';
		activity.layout = { schemaVersion: 1, nodes: [{ kind: 'section', id: 'section-1', title: 'Section', columns: 1, gap: 'md', padding: 'none', surface: 'none', anchor: 'details', children: [] }] };
		expect(validateBuilderAnchors(envelope)).toBe(true);
		(activity.layout.nodes[0] as any).anchor = 'intro';
		expect(validateBuilderAnchors(envelope)).toBe(false);
		const legacy = blankBuilder('kelas', 'course');
		expect(validateBuilderAnchors(legacy)).toBe(true);
	});
	it('remaps copied conflicting names deterministically and retains numeric IDs', () => {
		const envelope = blankBuilder('kelas', 'course');
		const activity = envelope.document.activities[0];
		appendBlock(envelope, activity.id, 'instructions');
		activity.blocks[0].anchor = 'intro';
		const copied = duplicateActivity(envelope, activity.id);
		expect(envelope.document.activities.find(item => item.id === copied)?.blocks[0]).toMatchObject({ anchor: 'intro-2' });
		remapDuplicateBuilderAnchors(envelope);
		expect(validateBuilderAnchors(envelope)).toBe(true);
	});
	it('remaps copied fragment links with copied anchor targets while preserving unrelated links', () => {
		const envelope = blankBuilder('kelas', 'course');
		const activity = envelope.document.activities[0];
		const sourceId = appendBlock(envelope, activity.id, 'instructions');
		const source = activity.blocks.find(block => block.id === sourceId)!;
		source.anchor = 'intro';
		source.body = { type: 'doc', content: [{ type: 'paragraph', content: [
			{ type: 'text', text: 'within copy', link: { href: '#intro' } },
			{ type: 'text', text: 'unrelated external fragment', link: { href: '#external' } },
		] }] };
		const other = appendBlock(envelope, activity.id, 'instructions');
		activity.blocks.find(block => block.id === other)!.anchor = 'other';
		const copied = duplicateActivity(envelope, activity.id);
		const copy = envelope.document.activities.find(item => item.id === copied)!.blocks[0];
		expect(copy.anchor).toBe('intro-2');
		expect(copy.body!.content[0].content.map(run => run.link?.href)).toEqual(['#intro-2', '#external']);
		expect(envelope.document.activities[0].blocks[0].body!.content[0].content[0].link?.href).toBe('#intro');
		expect(validateBuilderAnchors(envelope)).toBe(true);
	});
	it('server normalization rejects invalid and duplicate block/group anchors', () => {
		const envelope = blankBuilder('kelas', 'course');
		const activity = envelope.document.activities[0];
		appendBlock(envelope, activity.id, 'instructions');
		activity.blocks[0].anchor = 'lesson-intro';
		const accepted = normalize(envelope);
		expect(accepted.document.activities[0].blocks[0].anchor).toBe('lesson-intro');
		activity.layout = { schemaVersion: 1, nodes: [{ kind: 'section', id: 'section-1', title: '', columns: 1, gap: 'md', padding: 'none', surface: 'none', anchor: 'lesson-intro', children: [] }] };
		expect(() => normalize(envelope)).toThrow(/ganda/);
		(activity.layout.nodes[0] as any).anchor = 'Bad selector';
		expect(() => normalize(envelope)).toThrow(/tautan bagian/);
	});
});

describe('synchronized media captions', () => {
	it('strictly bounds cue timing, order, overlap, count, text, and language', () => {
		const valid = { language: 'en-US', cues: [{ start: 0, end: 2.5, text: 'First' }, { start: 2.5, end: 4, text: '<script>alert(1)</script>' }] };
		expect(normalizeBuilderCaptions(valid)).toEqual(valid);
		for (const bad of [
			{ cues: [{ start: -1, end: 1, text: 'x' }] },
			{ cues: [{ start: 1, end: 1, text: 'x' }] },
			{ cues: [{ start: 2, end: 3, text: 'x' }, { start: 1, end: 2, text: 'y' }] },
			{ cues: [{ start: 0, end: 3, text: 'x' }, { start: 2, end: 4, text: 'y' }] },
			{ cues: [{ start: NaN, end: 1, text: 'x' }] },
			{ language: 'not a language!', cues: [] },
			{ label: 'unsupported metadata', cues: [] },
			{ cues: [{ start: 0, end: 1, text: 'x'.repeat(501) }] },
			{ cues: [{ start: 0, end: 1, text: 'x\u0000y' }] },
			{ cues: [{ start: 0, end: 1, text: 'x', html: '<b>' }] },
			{ cues: Array.from({ length: 301 }, (_, i) => ({ start: i * 2, end: i * 2 + 1, text: 'x' })) },
		]) expect(() => normalizeBuilderCaptions(bad)).toThrow();
	});

	it('routes cue-bearing writes through the new capability family and server normalization', () => {
		const d = fixture(); appendBlock(d, d.document.activities[0].id, 'audio');
		const audio = d.document.activities[0].blocks.at(-1)!;
		audio.captions = { language: 'id', cues: [{ start: 0, end: 1, text: '<script>alert(1)</script>' }] };
		expect(builderWriteAction('save', { document: d.document })).toBe('mediaCaptions:save');
		expect(builderWriteAction('saveSnapshot', { mediaCaptions: true })).toBe('mediaCaptions:saveSnapshot');
		expect(builderWriteAction('saveTemplate', { mediaCaptions: true })).toBe('mediaCaptions:saveTemplate');
		expect(builderWriteAction('save', { document: { activities: [{ blocks: [{ playback: { start: 0, rate: 1.25 } }] }] } })).toBe('mediaPlayback:save');
		expect(builderWriteAction('saveSnapshot', { mediaPlayback: true })).toBe('mediaPlayback:saveSnapshot');
		expect(normalize(d).document.activities[0].blocks.at(-1)?.captions).toEqual(audio.captions);
		for (const invalid of [
			{ type: 'reference', captions: audio.captions },
			{ type: 'video', captions: { cues: [{ start: 0, end: 1, text: 'x', onerror: 'bad' }] } },
			{ type: 'video', captions: { cues: [{ start: 2, end: 3, text: 'a' }, { start: 1, end: 2, text: 'b' }] } },
		]) {
			const bad = structuredClone(d); Object.assign(bad.document.activities[0].blocks.at(-1)!, invalid);
			expect(() => normalize(bad)).toThrow();
		}
	});
});

runInNewContext(
	readFileSync(
		new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url),
		'utf8',
	),
	{ module: mod },
);
const normalize = mod.exports.normalize;
function fixture() {
	const d = blankBuilder('kelas', 'course000000001', 'meeting00000001');
	appendBlock(d, d.document.activities[0].id, 'question_group');
	appendBlock(d, d.document.activities[0].id, 'matching');
	appendBlock(d, d.document.activities[0].id, 'gap_passage');
	appendBlock(d, d.document.activities[0].id, 'instructions');
	return d;
}
describe('shared builder identity and private envelope', () => {
	it('roundtrips bounded audio and video transcript and playback settings through copies', () => {
		expect(BUILDER_TRANSCRIPT_MAX_LENGTH).toBe(20000);
		const d = fixture();
		const activity = d.document.activities[0];
		appendBlock(d, activity.id, 'audio');
		expect(normalize(d).document.activities[0].blocks.at(-1)).toMatchObject({ type: 'audio', url: '', label: '', alt: '' });
		expect(normalize(d).document.activities[0].blocks.at(-1)).not.toHaveProperty('playback');
		for (const type of ['audio', 'video'] as const) {
			appendBlock(d, activity.id, type);
			const block = activity.blocks.at(-1)!;
			block.transcript = 'Line one\n<script>alert(1)</script>';
			block.playback = { loop: true, muted: true, start: 0, end: 18.5, rate: 1.5 };
		}
		const saved = normalize(d);
		const reset = resetBuilderPlayback(structuredClone(saved.document.activities[0].blocks.at(-1)!));
		expect(reset).not.toHaveProperty('playback');
		expect(reset).toMatchObject({ transcript: 'Line one\n<script>alert(1)</script>' });
		expect(saved.document.questionsById).toEqual(d.document.questionsById);
		expect(saved.privateKeys.answersByQuestionId).toEqual(d.privateKeys.answersByQuestionId);
		expect(saved.document.activities[0].blocks.slice(-2).map(block => [block.transcript, block.playback])).toEqual([
			['Line one\n<script>alert(1)</script>', { loop: true, muted: true, start: 0, end: 18.5, rate: 1.5 }],
			['Line one\n<script>alert(1)</script>', { loop: true, muted: true, start: 0, end: 18.5, rate: 1.5 }],
		]);
		const copied = copyBuilder(saved, saved.document.kind, saved.document.context);
		expect(copied.document.activities[0].blocks.slice(-2).map(block => [block.transcript, block.playback])).toEqual(saved.document.activities[0].blocks.slice(-2).map(block => [block.transcript, block.playback]));
		const duplicated = structuredClone(saved);
		duplicateActivity(duplicated, activity.id);
		expect(duplicated.document.activities[1].blocks.slice(-2).map(block => [block.transcript, block.playback])).toEqual(saved.document.activities[0].blocks.slice(-2).map(block => [block.transcript, block.playback]));
		const activityWithMedia = structuredClone(d);
		const mediaActivity = activityWithMedia.document.activities[0];
		const media = mediaActivity.blocks.at(-1)!;
		media.type = 'video';
		media.transcript = 'Template transcript';
		media.playback = { loop: true };
		const group = { kind: 'section' as const, id: 'media_group', title: 'Media', columns: 1 as const, gap: 'md' as const, padding: 'none' as const, surface: 'none' as const, children: [{ kind: 'block' as const, blockId: media.id }] };
		mediaActivity.layout = { schemaVersion: 1, nodes: [group] };
		const template = mod.exports.extractGroupTemplate(activityWithMedia, mediaActivity.id, group.id) as BuilderEnvelope & { scope: 'group' };
		expect(template.document.activities[0].blocks[0]).toMatchObject({ transcript: 'Template transcript', playback: { loop: true } });
		for (const invalid of [
			{ type: 'reference', transcript: 'no' },
			{ type: 'audio', transcript: 'x'.repeat(20001) },
			{ type: 'video', playback: { autoplay: true } },
			{ type: 'video', playback: { loop: false } },
			{ type: 'video', playback: { start: -1 } },
			{ type: 'video', playback: { start: 5, end: 4 } },
			{ type: 'video', playback: { rate: 1.1 } },
			{ type: 'video', playback: { end: Infinity } },
		]) {
			const bad = structuredClone(d);
			const target = bad.document.activities[0].blocks.at(-1)!;
			Object.assign(target, invalid);
			expect(() => normalize(bad)).toThrow();
		}
	});
	it('validates bounded playback range and allowlisted initial speed while preserving explicit zero', () => {
		expect(BUILDER_PLAYBACK_MAX_SECONDS).toBe(86400);
		expect(BUILDER_PLAYBACK_RATES).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
		expect(normalizeBuilderPlayback({ start: 0, end: 4, rate: 1.5, loop: true })).toEqual({ start: 0, end: 4, rate: 1.5, loop: true });
		expect(normalizeBuilderPlayback({ loop: true, muted: true })).toEqual({ loop: true, muted: true });
		for (const value of [{ start: -1 }, { end: Infinity }, { start: NaN }, { start: 2, end: 2 }, { start: 3, end: 2 }, { end: 86401 }, { rate: 1.1 }, { autoplay: true }]) expect(() => normalizeBuilderPlayback(value)).toThrow();
	});
	it('roundtrips legacy images and validated presentation through normalization and templates', () => {
		const d = fixture(); const activity=d.document.activities[0]; appendBlock(d,activity.id,'image');
		activity.blocks.at(-1)!.images=[{id:'photo_1',url:'https://example.org/photo.jpg',alt:'A photo',caption:'Caption'}];
		const legacy=normalize(d); expect(legacy.document.activities[0].blocks.at(-1)!.images?.[0]).toEqual({id:'photo_1',url:'https://example.org/photo.jpg',alt:'A photo',caption:'Caption'});
		activity.blocks.at(-1)!.images![0].presentation={fit:'cover',aspect:'16:9',focalX:22,focalY:75};
		const normalized=normalize(d); expect(normalized.document.activities[0].blocks.at(-1)!.images?.[0].presentation).toEqual({fit:'cover',aspect:'16:9',focalX:22,focalY:75});
		const copied=copyBuilder(normalized,normalized.document.kind,normalized.document.context); expect(copied.document.activities[0].blocks.at(-1)!.images?.[0].presentation).toEqual(normalized.document.activities[0].blocks.at(-1)!.images?.[0].presentation);
		for(const presentation of [{focalX:101},{focalY:NaN},{fit:'stretch'},{aspect:'2:1'}]) { activity.blocks.at(-1)!.images![0].presentation=presentation as any; expect(()=>normalize(d)).toThrow(); }
	});
	it('uses bounded focal crop styles and natural dimensions by default', () => {
		expect(builderImagePresentationStyle({})).toEqual({width:'100%',aspectRatio:undefined,objectFit:undefined,objectPosition:'50% 50%'});
		expect(builderImagePresentationStyle({fit:'cover',aspect:'16:9',focalX:20,focalY:80})).toEqual({width:'100%',aspectRatio:'16 / 9',objectFit:'cover',objectPosition:'20% 80%'});
		expect(resetBuilderImagePresentation({id:'photo',alt:'Alt',caption:'Caption',presentation:{fit:'cover',focalX:0}})).toEqual({id:'photo',alt:'Alt',caption:'Caption'});
		for(const value of [{focalX:101},{focalY:NaN},{fit:'stretch'},{aspect:'2:1'}]) expect(()=>builderImagePresentationStyle(value)).toThrow();
	});
	it('keeps legacy activity templates visible when scope metadata is absent', () => {
		const legacyEnvelope = fixture();
		// Existing builder_saved_items rows predate the additive scope field.
		expect(savedTemplateScope((legacyEnvelope as BuilderEnvelope & { scope?: 'activity' | 'group' }).scope)).toBe('activity');
		expect(savedTemplateScope('group')).toBe('group');
	});
	it('makes group-template insertion one undoable and redoable workspace change', () => {
		const source = fixture();
		const activity = source.document.activities[0];
		const block = activity.blocks[0];
		const group = { kind: 'section' as const, id: 'undo_source', title: 'Bagian', columns: 1 as const, gap: 'md' as const, padding: 'none' as const, surface: 'none' as const, children: [{ kind: 'block' as const, blockId: block.id }] };
		activity.blocks = [block];
		activity.layout = { schemaVersion: 1, nodes: [group] };
		const template = { ...source, scope: 'group' as const };
		const current = fixture();
		const targetActivity = current.document.activities[0];
		const destination = { ...group, id: 'undo_destination', children: [] as BuilderLayoutNode[] };
		targetActivity.layout = { schemaVersion: 1, nodes: [...targetActivity.blocks.map(item => ({ kind: 'block' as const, blockId: item.id })), destination] };
		const before = structuredClone(current);
		insertGroupTemplate(current, targetActivity.id, destination.id, template);
		const past = [before], future: BuilderEnvelope[] = [];
		const undone = moveBuilderHistory(past, future, current);
		expect(undone).toEqual(before);
		expect(past).toHaveLength(0);
		expect(future).toHaveLength(1);
		const redone = moveBuilderHistory(past, future, undone, true);
		expect(redone).toEqual(current);
		expect(future).toHaveLength(0);
		expect(past).toHaveLength(1);
	});
	it('inserts a nested group template as an independent identity-remapped copy', () => {
		const source = fixture();
		const sourceActivity = source.document.activities[0];
		const selected = sourceActivity.blocks.find(block => block.type === 'question_group')!;
		const nested = sourceActivity.blocks.find(block => block.type === 'matching')!;
		const outside = sourceActivity.blocks.find(block => block.type === 'gap_passage')!;
		const questionIdsInGroup = [...questionIds(selected), ...questionIds(nested)];
		const group = { kind: 'section' as const, id: 'group_source', title: 'Isi', columns: 1 as const, gap: 'md' as const, padding: 'none' as const, surface: 'none' as const, responsive: { mobile: { columns: 1 as const } }, children: [{ kind: 'block' as const, blockId: selected.id }, { kind: 'container' as const, id: 'nested_source', title: 'Bersarang', columns: 1 as const, gap: 'md' as const, padding: 'none' as const, surface: 'none' as const, children: [{ kind: 'block' as const, blockId: nested.id }] }] };
		sourceActivity.layout = { schemaVersion: 1, nodes: [group, { kind: 'block', blockId: outside.id }] };
		const template = mod.exports.extractGroupTemplate(source, sourceActivity.id, group.id) as BuilderEnvelope & { scope: 'group' };
		expect(template.scope).toBe('group');
		expect(template.document.activities[0].blocks.map(block => block.id)).toEqual([selected.id, nested.id]);
		expect(Object.keys(template.document.questionsById)).toEqual(questionIdsInGroup);
		expect(Object.keys(template.privateKeys.answersByQuestionId)).toEqual(questionIdsInGroup);
		expect(template.document.title).toBe('');
		expect(template.document.context.meetingId).toBe('');
		expect(template.document.delivery.dueAt).toBe('');
		expect(normalize(template).document.activities[0].layout?.nodes).toEqual([group]);
		const target = fixture();
		const targetActivity = target.document.activities[0];
		const destination = { ...group, id: 'group_destination', title: 'Tujuan', children: [] as BuilderLayoutNode[] };
		targetActivity.layout = { schemaVersion: 1, nodes: [...targetActivity.blocks.map(block => ({ kind: 'block' as const, blockId: block.id })), destination] };
		const priorBlockIds = targetActivity.blocks.map(block => block.id);
		const priorQuestionIds = Object.keys(target.document.questionsById);
		const inserted = insertGroupTemplate(target, targetActivity.id, destination.id, template);
		const copy = destination.children.at(-1)!;
		expect(copy).toMatchObject({ kind: 'section', title: 'Isi' });
		expect(copy.kind).toBe('section');
		if (copy.kind === 'block') throw new Error('Expected copied group.');
		expect(copy.id).not.toBe(group.id);
		expect(copy.children[0]).not.toMatchObject({ blockId: selected.id });
		expect(inserted).toBe(copy.id);
		const newBlockIds: string[] = [];
		const collectBlockIds = (nodes: BuilderLayoutNode[]) => { for (const node of nodes) { if (node.kind === 'block') newBlockIds.push(node.blockId); else collectBlockIds(node.children); } };
		collectBlockIds([copy]);
		expect(newBlockIds).toHaveLength(2);
		expect(newBlockIds.every(id => ![selected.id, nested.id].includes(id))).toBe(true);
		expect(targetActivity.blocks.map(block => block.id)).toEqual([...priorBlockIds, ...newBlockIds]);
		expect(Object.keys(target.document.questionsById)).toHaveLength(priorQuestionIds.length + questionIdsInGroup.length);
		expect(Object.keys(target.privateKeys.answersByQuestionId)).toHaveLength(priorQuestionIds.length + questionIdsInGroup.length);
		expect(template.document.activities[0].layout?.nodes[0]).toEqual(group);
		const collectReferences = (nodes: BuilderLayoutNode[]): string[] => nodes.flatMap(node => node.kind === 'block' ? [node.blockId] : collectReferences(node.children));
		expect(collectReferences(targetActivity.layout!.nodes).sort()).toEqual(targetActivity.blocks.map(block => block.id).sort());
		expect(removeLayoutGroup(targetActivity, inserted)).toBe(true);
		expect(collectReferences(targetActivity.layout!.nodes).sort()).toEqual(targetActivity.blocks.map(block => block.id).sort());
	});
	it('rejects depth and capacity before changing the destination', () => {
		const source = fixture(), block = source.document.activities[0].blocks[0];
		const group = { kind: 'section' as const, id: 'group_source', title: 'Isi', columns: 1 as const, gap: 'md' as const, padding: 'none' as const, surface: 'none' as const, children: [{ kind: 'block' as const, blockId: block.id }] };
		source.document.activities[0].blocks = [block];
		source.document.activities[0].layout = { schemaVersion: 1, nodes: [group] };
		const target = fixture(), activity = target.document.activities[0];
		const parent = { ...group, id: 'deep1', children: [{ ...group, id: 'deep2', children: [{ ...group, id: 'deep3', children: [] }] }] };
		activity.layout = { schemaVersion: 1, nodes: [...activity.blocks.map(item => ({ kind: 'block' as const, blockId: item.id })), parent] };
		const before = JSON.stringify(target);
		expect(() => insertGroupTemplate(target, activity.id, 'deep3', { ...source, scope: 'group' })).toThrow('batas tata letak');
		expect(JSON.stringify(target)).toBe(before);
	});
	it('converts selected blocks and returns them to paragraphs without losing inline runs', () => {
		const value = { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'one', marks: ['bold' as const], link: { href: 'https://example.org' } }] }, { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'two' }] }] };
		const list = applyBlockFormat(value, 0, 7, 'number');
		expect(list.content[0]).toMatchObject({ type: 'list_item', list: 'number' });
		expect(list.content[0].content[0]).toMatchObject({ marks: ['bold'], link: { href: 'https://example.org' } });
		const reverted = applyBlockFormat(list, 0, 7, 'paragraph');
		expect(reverted.content.map(p => p.type)).toEqual(['paragraph', 'paragraph']);
		expect(plain(reverted)).toBe('one\ntwo');
	});
	it('preserves semantic formatting on blocks outside the selection', () => {
		const value = { type: 'doc' as const, content: [
			{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'one' }] },
			{ type: 'heading' as const, level: 2 as const, content: [{ type: 'text' as const, text: 'two' }] },
			{ type: 'list_item' as const, list: 'bullet' as const, content: [{ type: 'text' as const, text: 'three' }] },
		] };
		expect(applyBlockFormat(value, 0, 3, 'number').content.map(p => p.type)).toEqual(['list_item', 'heading', 'list_item']);
		expect(applyBlockFormat(value, 4, 7, 'paragraph').content.map(p => p.type)).toEqual(['paragraph', 'paragraph', 'list_item']);
	});
	it('retains heading and list metadata while typing after formatting', () => {
		const source = { type: 'doc' as const, content: [{ type: 'heading' as const, level: 2 as const, content: [{ type: 'text' as const, text: 'Title', marks: ['bold' as const], link: { href: 'https://example.org' } }] }, { type: 'list_item' as const, list: 'bullet' as const, content: [{ type: 'text' as const, text: 'Item' }] }] };
		const edited = replaceRichText(source, 'Title!\nItem');
		expect(edited.content.map(p => p.type)).toEqual(['heading', 'list_item']);
		expect(edited.content[0].content[0]).toMatchObject({ marks: ['bold'], link: { href: 'https://example.org' } });
		expect(plain(edited)).toBe('Title!\nItem');
	});
	it('round trips semantic blocks and rejects unsupported structures or levels', () => {
		const d = fixture(), block = d.document.activities[0].blocks.find(b => b.type === 'instructions')!;
		block.body = { type: 'doc', content: [{ type: 'heading', level: 3, content: [{ type: 'text', text: 'Head', marks: ['italic'] }] }, { type: 'list_item', list: 'bullet', content: [{ type: 'text', text: 'Item' }] }] };
		const roundtrip = normalize(d).document.activities[0].blocks.find(b => b.type === 'instructions')!.body!;
		expect(roundtrip).toEqual(block.body);
		(block.body!.content[0] as any).level = 1;
		expect(() => normalize(d)).toThrow();
		(block.body!.content[0] as any).level = 3;
		(block.body!.content[0] as any).type = 'html';
		expect(() => normalize(d)).toThrow();
		(block.body!.content[0] as any).type = 'heading';
		const question = Object.values(d.document.questionsById)[0];
		question.prompt = structuredClone(block.body!);
		expect(() => normalize(d)).toThrow();
		block.body = { type: 'doc', content: Array.from({ length: 101 }, () => ({ type: 'paragraph', content: [{ type: 'text', text: 'x' }] })) };
		expect(() => normalize(d)).toThrow();
		block.body = { type: 'doc', content: [{ type: 'list_item', list: 'bullet', content: [{ type: 'list_item', list: 'number', content: [] } as any] }] } as any;
		expect(() => normalize(d)).toThrow();
	});
	it('round trips bounded inline marks, strips unknown marks, and preserves plain text', () => {
		const d = fixture();
		const block = d.document.activities[0].blocks.find(b => b.type === 'instructions')!;
		block.body = { type: 'doc', content: [{ type: 'paragraph', content: [
			{ type: 'text', text: 'Keep ' }, { type: 'text', text: 'this', marks: ['bold', 'italic'] },
		] }] };
		const result = normalize(d);
		expect(plain(result.document.activities[0].blocks.find(b => b.type === 'instructions')!.body)).toBe('Keep this');
		expect(result.document.activities[0].blocks.find(b => b.type === 'instructions')!.body).toEqual(block.body);
		(block.body!.content[0].content[1] as any).marks.push('link');
		expect(normalize(d).document.activities[0].blocks.find(b => b.type === 'instructions')!.body!.content[0].content[1].marks).toEqual(['bold', 'italic']);
	});
	it('applies inline marks to a selection and merges adjacent runs without losing marks', () => {
		const marked = applyInlineMark({ type: 'doc', content: [{ type: 'paragraph', content: [
			{ type: 'text', text: 'ab', marks: ['italic'] }, { type: 'text', text: 'cd', marks: ['italic'] },
		] }] }, 1, 3, 'bold');
		expect(plain(marked)).toBe('abcd');
		expect(marked.content[0].content).toEqual([
			{ type: 'text', text: 'a', marks: ['italic'] },
			{ type: 'text', text: 'bc', marks: ['bold', 'italic'] },
			{ type: 'text', text: 'd', marks: ['italic'] },
		]);
	});
	it('applies and removes links on a selection while preserving marks and subsequent edits', () => {
		const value = {type:'doc' as const,content:[{type:'paragraph' as const,content:[{type:'text' as const,text:'go '},{type:'text' as const,text:'there',marks:['bold' as const]}]}]};
		const linked=applyInlineLink(value,3,8,'https://example.org/path');
		expect(linked.content[0].content[1]).toEqual({type:'text',text:'there',marks:['bold'],link:{href:'https://example.org/path'}});
		expect(replaceRichText(linked,'go there!').content[0].content.at(-1)?.link).toEqual({href:'https://example.org/path'});
		expect(applyInlineLink(linked,3,8,null).content[0].content[1]).toEqual({type:'text',text:'there',marks:['bold']});
	});
	it('rejects unsafe URLs identically at client and server and retains invalid linked text as plain text', () => {
		for(const value of ['javascript:alert(1)','data:text/html,x','vbscript:foo','//example.org','https://example.org/\nfoo','https://bad host']) expect(safeInlineUrl(value)).toBeNull();
		for(const value of ['https://example.org/a','http://example.org',' #bad']) {
			if(value.startsWith(' ')) continue;
			expect(safeInlineUrl(value)).toBe(value);
		}
		const d=fixture(), block=d.document.activities[0].blocks.find(b=>b.type==='instructions')!;
		block.body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'safe',link:{href:'javascript:alert(1)'}} as any]}]};
		const normalized=normalize(d).document.activities[0].blocks.find(b=>b.type==='instructions')!.body!;
		expect(plain(normalized)).toBe('safe'); expect(normalized.content[0].content[0].link).toBeUndefined();
		block.body={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'linked',marks:['bold'],link:{href:'https://example.org'}} as any]}]};
		expect(normalize(d).document.activities[0].blocks.find(b=>b.type==='instructions')!.body!.content[0].content[0]).toEqual({type:'text',text:'linked',marks:['bold'],link:{href:'https://example.org'}});
		const question=Object.values(d.document.questionsById)[0]; question.prompt={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'assessment',link:{href:'https://example.org'}} as any]}]};
		expect(normalize(d).document.questionsById[question.id].prompt.content[0].content[0].link).toBeUndefined();
		const serverPolicy=readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js',import.meta.url),'utf8');
		expect(serverPolicy).toContain('function inlineLink(v)');
	});
	it('reconciles edits with run offsets while retaining untouched formatting', () => {
		const value = { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [
			{ type: 'text' as const, text: 'before ' },
			{ type: 'text' as const, text: 'marked', marks: ['bold' as const] },
			{ type: 'text' as const, text: ' after', marks: ['italic' as const] },
		] }] };
		const edited = replaceRichText(value, 'before X marked after');
		expect(plain(edited)).toBe('before X marked after');
		expect(edited.content[0].content).toEqual([
			{ type: 'text', text: 'before ' },
			{ type: 'text', text: 'X ' },
			{ type: 'text', text: 'marked', marks: ['bold'] },
			{ type: 'text', text: ' after', marks: ['italic'] },
		]);
	});
	it('normalizes adjacent marked runs and keeps legacy unmarked rich text shape', () => {
		const d = fixture();
		const block = d.document.activities[0].blocks.find(b => b.type === 'instructions')!;
		block.body = { type: 'doc', content: [{ type: 'paragraph', content: [
			{ type: 'text', text: 'legacy' },
			{ type: 'text', text: ' bold', marks: ['bold', 'bold', 'unknown'] as any },
			{ type: 'text', text: ' text', marks: ['bold'] },
		] }] };
		const body = normalize(d).document.activities[0].blocks.find(b => b.type === 'instructions')!.body!;
		expect(body.content[0].content).toEqual([
			{ type: 'text', text: 'legacy' },
			{ type: 'text', text: ' bold text', marks: ['bold'] },
		]);
	});
	it('does not mistake normalized media field order for unsaved recovery edits', () => {
		const d = fixture();
		appendBlock(d, d.document.activities[0].id, 'image');
		const saved = normalize(d);
		expect(JSON.stringify(d)).not.toBe(JSON.stringify(saved));
		expect(encodeBuilderDraft(d)).toBe(encodeBuilderDraft(saved));
		const changed = structuredClone(d);
		changed.document.activities[0].blocks.reverse();
		expect(encodeBuilderDraft(changed)).not.toBe(encodeBuilderDraft(saved));
	});

	it('round trips incomplete drafts without changing question identity or alternatives', () => {
		const d = fixture(),
			id = Object.keys(d.document.questionsById).find(
				(id) => d.document.questionsById[id].kind === 'short_answer',
			)!;
		d.privateKeys.answersByQuestionId[id].accepted = ['muss', 'müsste'];
		expect(normalize(d)).toEqual(d);
	});
	it('duplicates an activity with all question, option, destination and private-key references remapped', () => {
		const d = fixture(),
			original = structuredClone(d),
			a = d.document.activities[0],
			match = a.blocks.find((b) => b.type === 'matching')!,
			qid = match.questionIds![0],
			destination = match.destinations![0].id;
		d.privateKeys.answersByQuestionId[qid].correctDestinationId = destination;
		const source = structuredClone(d.document.activities[0]);
		const copied = duplicateActivity(d, a.id),
			copy = d.document.activities.find((a) => a.id === copied)!;
		expect(d.document.activities[0]).toEqual(source);
		expect(copy.id).not.toBe(a.id);
		const copiedMatch = copy.blocks.find((b) => b.type === 'matching')!,
			newQ = copiedMatch.questionIds![0];
		expect(newQ).not.toBe(qid);
		expect(d.privateKeys.answersByQuestionId[newQ].correctDestinationId).toBe(
			copiedMatch.destinations![0].id,
		);
		expect(copiedMatch.destinations![0].id).not.toBe(destination);
		expect(normalize(d).document.activities).toHaveLength(2);
		expect(original.document.activities).toHaveLength(1);
	});
	it('copies a document to new context and mode while resetting the whole delivery policy', () => {
		const d = fixture();
		d.document.delivery.startsAt = '2030-01-01T00:00:00Z';
		const copy = copyBuilder(d, 'tugas', {
			courseId: 'course000000002',
			meetingId: '',
			sectionIds: [],
		});
		expect(copy.document.kind).toBe('tugas');
		expect(copy.document.delivery.kind).toBe('tugas');
		expect(copy.document.delivery.startsAt).toBe('');
		expect(copy.document.context.courseId).toBe('course000000002');
		expect(
			Object.keys(copy.document.questionsById).some(
				(id) => id in d.document.questionsById,
			),
		).toBe(false);
		expect(Object.keys(copy.privateKeys.answersByQuestionId)).toEqual(
			Object.keys(copy.document.questionsById),
		);
		expect(normalize(copy)).toEqual(copy);
	});
	it('keeps lesson translations and literal text intact while duplicating identity references', () => {
		const d = fixture(),
			a = d.document.activities[0];
		appendBlock(d, a.id, 'lesson');
		const lesson = a.blocks.at(-1)!;
		lesson.lesson!.goal = { de: 'Goal', id: 'Terjemahan tujuan' };
		const qid = Object.keys(d.document.questionsById)[0];
		d.document.questionsById[qid].prompt = rich(qid);
		const copied = copyBuilder(d, 'kelas', d.document.context);
		expect(copied.document.activities[0].blocks.at(-1)!.lesson!.goal.id).toBe(
			'Terjemahan tujuan',
		);
		expect(
			Object.values(copied.document.questionsById).some(
				(q) => q.prompt.content[0].content[0].text === qid,
			),
		).toBe(true);
		expect(() => normalize(copied)).not.toThrow();
	});
	it('copies source authoring content without student records or private source references', () => {
		const source: any = {
			class: { title: 'Source', instructions: 'Instructions' },
			session: { title: 'Meeting' },
			activities: [
				{
					title: 'Writing',
					minutes: 10,
					required: true,
					kind: 'assignment',
					content: 'Do this',
					worksheet: {
						items: [
							{
								id: 'original-question',
								type: 'text',
								prompt: 'Schreiben',
								translation: 'Tuliskan',
							},
						],
						sourceMaterialId: 'private-source',
						answerKey: {
							items: {
								'original-question': {
									mode: 'reference',
									modelAnswer: 'A model',
									rubric: 'Review clarity',
								},
							},
						},
					},
				},
			],
			attempts: [{ answers: 'STUDENT SENTINEL' }],
			report: [{ name: 'STUDENT NAME' }],
		};
		const copied = copyScheduledToBuilder(
			source,
			{
				courseId: 'course000000001',
				meetingId: 'meeting00000001',
				sectionIds: [],
			},
			'https://example.com',
		);
		expect(JSON.stringify(copied)).not.toContain('STUDENT SENTINEL');
		expect(JSON.stringify(copied)).not.toContain('STUDENT NAME');
		expect(JSON.stringify(copied)).not.toContain('private-source');
		expect(JSON.stringify(copied)).not.toContain('original-question');
		expect(JSON.stringify(copied)).toContain('Tuliskan');
		expect(() => normalize(copied)).not.toThrow();
	});
	it('removing a passage deletes its canonical gap questions and keys together', () => {
		const d = fixture(),
			a = d.document.activities[0],
			b = a.blocks.find((b) => b.type === 'gap_passage')!,
			ids = questionIds(b);
		removeBlock(d, a.id, b.id);
		for (const id of ids) {
			expect(d.document.questionsById[id]).toBeUndefined();
			expect(d.privateKeys.answersByQuestionId[id]).toBeUndefined();
		}
		expect(() => normalize(d)).not.toThrow();
	});
	it('rejects dangling references and duplicate response locations', () => {
		const d = fixture(),
			a = d.document.activities[0],
			group = a.blocks[0];
		group.questionIds!.push('missing');
		expect(() => normalize(d)).toThrow();
		group.questionIds!.pop();
		group.questionIds!.push(group.questionIds![0]);
		expect(() => normalize(d)).toThrow();
	});
	it('rejects cross-group destination keys and foreign option keys', () => {
		const d = fixture(),
			q = d.document.activities[0].blocks[0].questionIds![0];
		d.privateKeys.answersByQuestionId[q].correctOptionId = 'foreign-option';
		expect(() => normalize(d)).toThrow();
		delete d.privateKeys.answersByQuestionId[q].correctOptionId;
		const m = d.document.activities[0].blocks[1].questionIds![0];
		d.privateKeys.answersByQuestionId[m].correctDestinationId =
			'foreign-destination';
		expect(() => normalize(d)).toThrow();
	});
	it('strips unknown public/private fields instead of echoing an arbitrary payload', () => {
		const d: any = fixture();
		d.document.owner = 'fake';
		d.document.secret = 'private';
		d.privateKeys.answersByQuestionId[
			Object.keys(d.document.questionsById)[0]
		].extra = 'bad';
		const normalized = normalize(d);
		expect(normalized.document.owner).toBeUndefined();
		expect(normalized.document.secret).toBeUndefined();
		expect(
			Object.values(normalized.privateKeys.answersByQuestionId).some(
				(k: any) => k.extra,
			),
		).toBe(false);
	});
	it('rejects prototype keys, unsafe media URLs, oversized documents and unsupported schema versions', () => {
		const d: any = fixture();
		d.document.activities[0].id = 'constructor';
		expect(() => normalize(d)).toThrow();
		const clean = fixture();
		const a = clean.document.activities[0];
		appendBlock(clean, a.id, 'reference');
		a.blocks.at(-1)!.url = 'javascript:alert(1)';
		expect(() => normalize(clean)).toThrow();
		a.blocks.at(-1)!.url = 'https://example.com/resource';
		clean.document.instructions = rich('x'.repeat(20001));
		expect(() => normalize(clean)).toThrow();
		clean.document.instructions = rich('');
		(clean.document as any).schemaVersion = 2;
		expect(() => normalize(clean)).toThrow();
	});
	it('allows inherited responsive visibility on presentation-only content and rejects protected descendants transitively', () => {
		const d = fixture();
		const activity = d.document.activities[0];
		const text = appendBlock(d, activity.id, 'instructions');
		activity.blocks.find(block => block.id === text)!.presentation = { desktop: false, tablet: true, mobile: false };
		activity.blocks.find(block => block.id === text)!.body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Link', link: { href: 'https://example.org' } }] }] };
		expect(builderNodeVisibilitySafe(d)).toBe(false);
		delete activity.blocks.find(block => block.id === text)!.body;
		expect(builderNodeVisibilitySafe(d)).toBe(true);
		expect(builderVisibilityForDevice({ desktop: false, tablet: true }, 'tablet')).toBe(true);
		expect(builderVisibilityForDevice({ desktop: false, tablet: true }, 'mobile')).toBe(true);
		expect(builderVisibilityForDevice({ desktop: false }, 'mobile')).toBe(false);
		expect(() => normalizeBuilderVisibility({ mobile: 0 })).toThrow();
		const groupId = addLayoutGroup(activity, 'section', null, 1);
		const group = findLayoutGroup(activity.layout!, groupId)!;
		group.children.push({ kind: 'block', blockId: text });
		group.presentation = { mobile: false };
		expect(builderNodeVisibilitySafe(d)).toBe(true);
		const reference = appendBlock(d, activity.id, 'reference');
		group.children.push({ kind: 'block', blockId: reference });
		expect(builderNodeVisibilitySafe(d)).toBe(false);
		group.children.pop();
		const assessment = appendBlock(d, activity.id, 'question_group');
		group.children.push({ kind: 'block', blockId: assessment });
		expect(builderNodeVisibilitySafe(d)).toBe(false);
		group.children.pop();
		activity.blocks.find(block => block.id === assessment)!.presentation = { desktop: false };
		expect(builderNodeVisibilitySafe(d)).toBe(false);
	});
});
