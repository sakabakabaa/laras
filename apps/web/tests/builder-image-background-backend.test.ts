import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appendBlock, blankBuilder, builderNodeVisibilitySafe, builderWriteAction, insertGroupTemplate, savedTemplateScope, type BuilderEnvelope } from '../src/lib/builder-document';
import { insertActivityTemplate } from '../src/components/app/builder/builder-saved-items';
import { addLayoutGroup, findLayoutGroup } from '../src/lib/builder-layout';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';
import { BuilderLayoutView } from '../src/components/app/builder/builder-layout-view';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeBuilderRichText } from '../src/lib/builder-document';

const hooks = new URL('../../pocketbase/pb_hooks/', import.meta.url);
const domain = { exports: {} as Record<string, unknown> };
runInNewContext(readFileSync(new URL('builder-domain.js', hooks), 'utf8'), {
	module: domain, __hooks: '', require: () => ({}),
});
const documentAssets = domain.exports.documentAssets as (d: unknown) => { asset: Asset; kind: string }[];
const normalizeServer = domain.exports.normalize as (value: unknown) => BuilderEnvelope;
const extractGroupTemplate = domain.exports.extractGroupTemplate as (envelope: unknown, activityId: string, groupId: string) => BuilderEnvelope & { scope: 'group' };
type Asset = { fileId: string; filename: string; version: number; name: string };
type Row = { id: string; getString: (name: string) => string; getInt: (name: string) => number; getBool: (name: string) => boolean; getStringSlice?: (name: string) => string[] };
const asset = (fileId = 'abcdefghijklmno', filename = 'background.png', version = 2): Asset => ({ fileId, filename, version, name: 'Background' });
const doc = (background: Asset, block = false) => ({
	kind: 'kelas', context: { courseId: 'course', sectionIds: [] },
	delivery: { startsAt: '2020-01-01T00:00:00Z' }, activities: [{ blocks: block ? [{ type: 'image', asset: background }] : [], layout: { nodes: [{ kind: 'section', background: { mode: 'image', asset: background }, children: [{ kind: 'container', children: [{ kind: 'section', background: { mode: 'image', asset: background }, children: [] }] }] }] } }],
});
const deviceOnlyDoc = (background: Asset) => {
	const value = doc(background);
	const root = value.activities[0].layout.nodes[0];
	root.background = undefined;
	root.responsive = { mobile: { background: { mode: 'image', asset: background } } };
	root.children[0].background = undefined;
	root.children[0].children[0].background = undefined;
	return value;
};
const deviceOnlyEnvelope = (background: Asset) => {
	const envelope = blankBuilder('kelas', 'course');
	const activity = envelope.document.activities[0];
	appendBlock(envelope, activity.id, 'instructions');
	const groupId = addLayoutGroup(activity, 'section', null, 1);
	findLayoutGroup(activity.layout!, groupId)!.responsive = { mobile: { background: { mode: 'image', asset: background } } };
	return envelope;
};
const record = (id: string, values: Record<string, unknown>): Row => ({
	id, getString: (name) => typeof values[name] === 'string' ? values[name] as string : '',
	getInt: (name) => Number(values[name] ?? 0), getBool: (name) => Boolean(values[name]),
	getStringSlice: (name) => Array.isArray(values[name]) ? values[name] as string[] : [],
});
const service = { exports: {} as Record<string, unknown> };
class TestRecord {
	id = 'saved-caption-item';
	values: Record<string, any> = {};
	constructor(_collection: unknown) {}
	load(values: Record<string, unknown>) { this.values = values; }
	getString(name: string) { return String(this.values[name] ?? ''); }
	getInt(name: string) { return Number(this.values[name] ?? 0); }
}
runInNewContext(readFileSync(new URL('builder-service.js', hooks), 'utf8'), {
	module: service, __hooks: '', Record: TestRecord, require: (path: string) => path.endsWith('builder-domain.js') ? domain.exports : {},
	ForbiddenError: class ForbiddenError extends Error {}, BadRequestError: class BadRequestError extends Error {},
});
const authorizeAssets = service.exports.authorizeAssets as (app: unknown, user: { id: string }, d: unknown) => void;
const handleBuilder = service.exports.handle as (app: unknown, user: { id: string; getString: (name: string) => string }, body: Record<string, unknown>) => unknown;
const faculty = { id: 'faculty', getString: () => 'faculty' };

describe('saved-item mixed-feature reads', () => {
	it('lists snapshots with every required feature marker without routing the read as a write', () => {
		const envelope = blankBuilder('kelas', 'course');
		const activity = envelope.document.activities[0];
		const instructionsId = appendBlock(envelope, activity.id, 'instructions');
		const instructions = activity.blocks.find(block => block.id === instructionsId)!;
		instructions.anchor = 'chapter';
		instructions.presentation = { mobile: false };
		instructions.body = { type: 'doc', content: [
			{ type: 'list_item', list: 'bullet', content: [{ type: 'text', text: 'Parent' }] },
			{ type: 'list_item', list: 'bullet', depth: 1, content: [{ type: 'text', text: 'Child' }] },
		] };
		instructions.appearance = { responsive: { mobile: { corners: { topLeft: 0 } } } };
		const audioId = appendBlock(envelope, activity.id, 'audio');
		const audio = activity.blocks.find(block => block.id === audioId)!;
		audio.captions = { cues: [{ start: 0, end: 2, text: 'Caption' }] };
		audio.playback = { start: 0, end: 2, rate: 1.25 };
		envelope.document.theme = { palette: {
			light: { base: { foreground: '#000000', background: '#FFFFFF' }, accent: { foreground: '#FFFFFF', background: '#000000' } },
			dark: { base: { foreground: '#FFFFFF', background: '#000000' }, accent: { foreground: '#000000', background: '#FFFFFF' } },
		} };
		const source = record('draft0000000001', { owner: 'faculty', document: JSON.stringify(envelope.document), kind: 'kelas', course: 'course' });
		const key = record('keys', { keys: JSON.stringify(envelope.privateKeys) });
		const saved = record('saved0000000001', { title: 'Existing snapshot', kind: 'snapshot', revision: 7, created: '2026-01-01T00:00:00Z' });
		const app = {
			findRecordById: (collection: string, id: string) => collection === 'builder_documents' ? source : record(id, { owner: 'faculty' }),
			findRecordsByFilter: (collection: string) => collection === 'builder_private_keys' ? [key] : collection === 'builder_saved_items' ? [saved] : [],
		};
		const markers = { themePalette: true, presentationVisibility: true, documentAnchors: true, nestedRichText: true, mediaCaptions: true, mediaPlayback: true, responsiveBorderRadius: true };
		for (const marker of Object.keys(markers)) {
			const missing = { ...markers, [marker]: false };
			expect(() => handleBuilder(app, faculty, { id: source.id, ...missing, action: builderWriteAction('savedList', missing) })).toThrow();
		}
		const result = handleBuilder(app, faculty, { id: source.id, ...markers, action: builderWriteAction('savedList', markers) });
		expect(result).toMatchObject({ items: [{ id: saved.id, title: 'Existing snapshot' }] });
	});
});

function authorizationApp(file: Row, prior?: Row) {
	return {
		findRecordById: (_collection: string, id: string) => id === file.id ? file : record(id, {}),
		findRecordsByFilter: (_collection: string) => prior ? [prior] : [],
	};
}
const deliveryModule = { exports: {} as Record<string, unknown> };
runInNewContext(readFileSync(new URL('builder-delivery.js', hooks), 'utf8'), {
	module: deliveryModule, __hooks: '', require: (path: string) => path.endsWith('builder-domain.js') ? domain.exports : path.endsWith('builder-service.js') ? service.exports : {},
	ForbiddenError: class ForbiddenError extends Error {}, BadRequestError: class BadRequestError extends Error {},
});
const deliveryHandle = deliveryModule.exports.handle as (app: unknown, user: { id: string; getString: (name: string) => string }, body: Record<string, unknown>) => unknown;
function deliveryFixture(d: ReturnType<typeof doc>, file: Row, prior?: Row) {
	const run = record('run', { version: 'version', owner: 'faculty', course: 'course' });
	const version = record('version', { document: 'draft', content: JSON.stringify(d), revision: 4 });
	const app = {
		findRecordById: (collection: string, id: string) => collection === 'builder_runs' ? run : collection === 'builder_versions' ? version : collection === 'file_library' ? file : record(id, { owner: 'faculty' }),
		findRecordsByFilter: (collection: string) => collection === 'file_versions' && prior ? [prior] : [],
	};
	return app;
}
const owner = { id: 'faculty', getString: (name: string) => name === 'role' ? 'faculty' : 'faculty' };

describe('builder background asset authorization', () => {
	it('roundtrips strict lesson palettes through PocketBase and protects mixed-feature writes and publish', () => {
		const envelope = blankBuilder('kelas', 'palette-version');
		const activity = envelope.document.activities[0];
		appendBlock(envelope, activity.id, 'instructions');
		envelope.document.theme = { palette: {
			light: { base: { foreground: '#102030', background: '#F0F1F2' }, accent: { foreground: '#FFFFFF', background: '#900000' } },
			dark: { base: { foreground: '#E0E1E2', background: '#101112' }, accent: { foreground: '#FFFFFF', background: '#770000' } },
		} };
		const normalized = normalizeServer(envelope);
		expect(normalized.document.theme).toEqual(envelope.document.theme);
		for (const badTheme of [
			{ ...envelope.document.theme, injected: true },
			{ palette: { ...envelope.document.theme.palette, light: { ...envelope.document.theme.palette.light, extra: true } } },
			{ palette: { ...envelope.document.theme.palette, dark: { ...envelope.document.theme.palette.dark, accent: { foreground: 'url(javascript:bad)', background: '#FFFFFF' } } } },
		]) expect(() => normalizeServer({ ...envelope, document: { ...envelope.document, theme: badTheme } })).toThrow();
		const exotic = Object.create({ inherited: true }); Object.assign(exotic, envelope.document.theme);
		expect(() => normalizeServer({ ...envelope, document: { ...envelope.document, theme: exotic } })).toThrow(/prototipe/i);

		expect(() => handleBuilder({}, faculty, { action: 'save', document: envelope.document })).toThrow(/palet tema dokumen memerlukan/i);
		expect(() => handleBuilder({}, faculty, { action: 'themePalette:save', themePalette: false, document: envelope.document })).toThrow(/perintah palet tema dokumen tidak valid/i);
		expect(() => handleBuilder({}, faculty, { action: 'themePalette:save', themePalette: true, id: 'bad-id', document: envelope.document })).toThrow(/ID draf tidak valid/i);
		const source = record('draft0000000001', { owner: 'faculty', deleted: false, document: JSON.stringify(envelope.document), title: 'Palette draft', kind: 'kelas', revision: 7, updated: '', course: 'course' });
		const key = record('keys', { keys: JSON.stringify(envelope.privateKeys) });
		let savedEnvelope: any;
		const app = {
			findRecordById: (collection: string, id: string) => collection === 'builder_documents' ? source : collection === 'courses' ? record(id, { owner: 'faculty' }) : record(id, {}),
			findRecordsByFilter: (collection: string) => collection === 'builder_private_keys' ? [key] : [],
			findCollectionByNameOrId: () => 'saved', save: (item: TestRecord) => { savedEnvelope = item.values.envelope; },
		};
		for (const action of ['saveSnapshot', 'saveTemplate']) {
			expect(() => handleBuilder(app, faculty, { action, id: source.id, baseRevision: 7, commandId: `legacy-${action}`, title: 'Salinan', activityId: activity.id, scope: 'activity' })).toThrow(/palet tema dokumen memerlukan/i);
			handleBuilder(app, faculty, { action: `themePalette:${action}`, themePalette: true, id: source.id, baseRevision: 7, commandId: `palette-${action}`, title: 'Salinan', activityId: activity.id, scope: 'activity' });
			expect(savedEnvelope.document.theme).toEqual(envelope.document.theme);
		}
		const groupId = addLayoutGroup(activity, 'section');
		const template = { ...normalized, document: { ...normalized.document, activities: [activity] }, scope: 'group' };
		expect(extractGroupTemplate(template, activity.id, groupId).document).not.toHaveProperty('theme');
		const publishedDraft = record('draft', { owner: 'faculty', deleted: false, document: JSON.stringify(envelope.document), revision: 7, kind: 'kelas', course: 'course' });
		const deliveryApp = deliveryFixture(doc(asset()), record('file', {})) as any;
		const findRecordById = deliveryApp.findRecordById;
		deliveryApp.findRecordById = (collection: string, id: string) => collection === 'builder_documents' ? publishedDraft : findRecordById(collection, id);
		expect(() => deliveryHandle(deliveryApp, owner, { action: 'publish', id: 'draft', commandId: 'palette-publish', baseRevision: 7 })).toThrow(/palet tema dokumen memerlukan/i);
		expect(() => deliveryHandle(deliveryApp, owner, { action: 'themePalette:publish', themePalette: false, id: 'draft', commandId: 'palette-publish-false', baseRevision: 7 })).toThrow(/perintah palet tema dokumen tidak valid/i);
	});

	it('requires the visibility schema marker for old saves, templates, snapshots, and publish', () => {
		const envelope = blankBuilder('kelas', 'visibility-version');
		const activity = envelope.document.activities[0];
		const blockId = appendBlock(envelope, activity.id, 'instructions');
		const block = activity.blocks.find(item => item.id === blockId)!;
		block.presentation = { desktop: false };
		expect(normalizeServer(envelope).document.activities[0].blocks[0].presentation).toEqual({ desktop: false });
		expect(() => handleBuilder({}, faculty, { action: 'save', document: envelope.document })).toThrow(/perintah versi khusus/i);
		expect(() => handleBuilder({}, faculty, { action: 'presentationVisibility:save', presentationVisibility: false, document: envelope.document })).toThrow(/perintah visibilitas presentasi/i);
		const source = record('draft', { owner: 'faculty', deleted: false, document: JSON.stringify(envelope.document), title: 'Visibility draft', kind: 'kelas', revision: 7, updated: '', course: 'course' });
		const key = record('keys', { keys: JSON.stringify(envelope.privateKeys) });
		const app = { findRecordById: (collection: string, id: string) => collection === 'builder_documents' ? source : collection === 'courses' ? record(id, { owner: 'faculty' }) : record(id, {}), findRecordsByFilter: (collection: string) => collection === 'builder_private_keys' ? [key] : [] };
		for (const action of ['saveSnapshot', 'saveTemplate']) {
			expect(() => handleBuilder(app, faculty, { action, id: 'draft', commandId: 'visibility-save', activityId: activity.id })).toThrow(/perintah versi khusus/i);
			expect(() => handleBuilder(app, faculty, { action: `presentationVisibility:${action}`, presentationVisibility: true, id: 'draft', commandId: '@', title: 'Copy', activityId: activity.id })).toThrow(/identitas penyimpanan tidak valid/i);
		}
		const publishedDraft = record('draft', { owner: 'faculty', deleted: false, document: JSON.stringify(envelope.document), revision: 7, kind: 'kelas', course: 'course' });
		const deliveryApp = deliveryFixture(doc(asset()), record('file', {})) as any;
		const findRecordById = deliveryApp.findRecordById;
		deliveryApp.findRecordById = (collection: string, id: string) => collection === 'builder_documents' ? publishedDraft : findRecordById(collection, id);
		expect(() => deliveryHandle(deliveryApp, owner, { action: 'publish', id: 'draft', commandId: 'visibility-publish', baseRevision: 7 })).toThrow(/visibilitas presentasi memerlukan perintah versi khusus/i);
		expect(() => deliveryHandle(deliveryApp, owner, { action: 'presentationVisibility:publish', presentationVisibility: false, id: 'draft', commandId: 'visibility-publish-false', baseRevision: 7 })).toThrow(/perintah visibilitas presentasi tidak valid/i);
	});
	it('validates visibility-bearing saved template reads before returning them', () => {
		const envelope = blankBuilder('kelas', 'course-visibility-template');
		const activity = envelope.document.activities[0];
		const id = appendBlock(envelope, activity.id, 'instructions');
		activity.blocks.find(block => block.id === id)!.presentation = { desktop: false };
		const saved = { ...envelope, scope: 'activity' };
		const item = new TestRecord('visibility-template');
		item.load({ owner: 'faculty', kind: 'template', document: 'draft', envelope: JSON.stringify(saved) });
		const app = { findRecordById: (collection: string, rowId: string) => collection === 'builder_saved_items' ? item : record(rowId, { owner: 'faculty' }), findRecordsByFilter: () => [] };
		expect((handleBuilder(app, owner, { action: 'savedGet', itemId: item.id }) as any).envelope.document.activities[0].blocks[0].presentation).toEqual({ desktop: false });
		const unsafe = structuredClone(envelope);
		const sectionId = addLayoutGroup(unsafe.document.activities[0], 'section');
		const section = findLayoutGroup(unsafe.document.activities[0].layout!, sectionId)!;
		const questionId = appendBlock(unsafe, unsafe.document.activities[0].id, 'question_group');
		section.children.push({ kind: 'block', blockId: id }, { kind: 'block', blockId: questionId });
		unsafe.document.activities[0].layout!.nodes = [section];
		section.presentation = { mobile: false };
		item.values.envelope = JSON.stringify({ ...unsafe, scope: 'group' });
		expect(() => handleBuilder(app, owner, { action: 'savedGet', itemId: item.id })).toThrow(/tidak dapat disembunyikan/i);
	});
	it('strictly preserves document anchors and refuses unversioned saves and publishes', () => {
		const envelope = blankBuilder('kelas', 'anchor-check');
		const activity = envelope.document.activities[0];
		const blockId = appendBlock(envelope, activity.id, 'instructions');
		activity.blocks.find(block => block.id === blockId)!.anchor = 'intro';
		expect(normalizeServer(envelope).document.activities[0].blocks[0].anchor).toBe('intro');
		expect(() => handleBuilder({}, faculty, { action: 'save', document: envelope.document })).toThrow(/versi jangkar/i);
		expect(() => handleBuilder({}, faculty, { action: 'documentAnchors:save', documentAnchors: false, document: envelope.document })).toThrow(/perintah tautan bagian tidak valid/i);
		const background = asset();
		const saved = doc(background);
		(saved as any).context = { courseId: 'course', sectionIds: [] };
		saved.activities[0].layout.nodes[0].anchor = 'intro';
		const app = deliveryFixture(saved, record(background.fileId, { owner: 'faculty', filename: background.filename, version: background.version, kind: 'image' })) as any;
		const findRecordById = app.findRecordById;
		app.findRecordById = (collection: string, id: string) => collection === 'builder_documents' ? record('draft', { owner: 'faculty', deleted: false, document: JSON.stringify(saved) }) : findRecordById(collection, id);
		expect(() => deliveryHandle(app, owner, { action: 'publish', id: 'draft', commandId: 'publish-anchor-old', baseRevision: 4 })).toThrow(/versi jangkar/i);
		expect(() => deliveryHandle(app, owner, { action: 'documentAnchors:publish', documentAnchors: false, id: 'draft', commandId: 'publish-anchor-false', baseRevision: 4 })).toThrow(/perintah tautan bagian tidak valid/i);
		expect(() => deliveryHandle(app, owner, { action: 'documentAnchors:publish', documentAnchors: true, id: 'draft', commandId: '@', baseRevision: 4 })).toThrow(/identitas penerbitan tidak valid/i);
	});
	it('requires the anchor version marker for stored-document snapshots and templates', () => {
		const envelope = blankBuilder('kelas', 'anchor-saved-items');
		const activity = envelope.document.activities[0];
		const blockId = appendBlock(envelope, activity.id, 'instructions');
		activity.blocks.find(block => block.id === blockId)!.anchor = 'intro';
		const source = record('draft', { owner: 'faculty', deleted: false, document: JSON.stringify(envelope.document), title: 'Anchor draft', kind: 'kelas', revision: 7, updated: '', course: 'course' });
		const key = record('keys', { keys: JSON.stringify(envelope.privateKeys) });
		const app = {
			findRecordById: (collection: string, id: string) => collection === 'builder_documents' ? source : collection === 'courses' ? record(id, { owner: 'faculty' }) : record(id, {}),
			findRecordsByFilter: (collection: string) => collection === 'builder_private_keys' ? [key] : [],
		};
		for (const action of ['saveSnapshot', 'saveTemplate']) {
			expect(() => handleBuilder(app, faculty, { action, id: 'draft', commandId: 'anchor-save' })).toThrow(/versi jangkar/i);
			expect(() => handleBuilder(app, faculty, { action: `documentAnchors:${action}`, documentAnchors: false, id: 'draft', commandId: 'anchor-save' })).toThrow(/perintah tautan bagian tidak valid/i);
			expect(() => handleBuilder(app, faculty, { action: `documentAnchors:${action}`, documentAnchors: true, id: 'draft', commandId: '@' })).toThrow(/identitas penyimpanan tidak valid/i);
		}
	});
	it('keeps client and PocketBase rich-list normalization aligned and rejects malformed depths', () => {
		const envelope = blankBuilder('kelas', 'course-rich-lists');
		const activityId = envelope.document.activities[0].id;
		const blockId = appendBlock(envelope, activityId, 'instructions');
		const block = envelope.document.activities[0].blocks.find(item => item.id === blockId)!;
		block.body = normalizeBuilderRichText({ type: 'doc', content: [
			{ type: 'heading', level: 2, content: [{ type: 'text', text: 'Heading' }] },
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Top' }] },
			{ type: 'list_item', list: 'bullet', depth: 1, content: [{ type: 'text', text: 'Nested' }] },
		] });
		const normalized = normalizeServer(envelope);
		expect(normalized.document.activities[0].blocks[0].body?.content[2]).toMatchObject({ type: 'list_item', list: 'bullet', depth: 1 });
		for (const content of [
			[{ type: 'list_item', list: 'bullet', depth: 1, content: [] }],
			[{ type: 'list_item', list: 'bullet', content: [] }, { type: 'list_item', list: 'bullet', depth: 2, content: [] }],
			[{ type: 'list_item', list: 'bullet', depth: 3, content: [] }],
		]) {
			const bad = structuredClone(envelope); bad.document.activities[0].blocks[0].body = { type: 'doc', content } as never;
			expect(() => normalizeServer(bad)).toThrow(/kedalaman daftar tidak valid/i);
		}
	});
	it('rejects cue-bearing writes unless the new media caption action and marker are present', () => {
		const envelope = blankBuilder('kelas', 'course');
		const id = appendBlock(envelope, envelope.document.activities[0].id, 'audio');
		envelope.document.activities[0].blocks.find(block => block.id === id)!.captions = { cues: [{ start: 0, end: 1, text: 'Caption' }] };
		expect(() => handleBuilder({}, faculty, { action: 'save', document: envelope.document })).toThrow(/perintah versi captions/i);
		expect(() => handleBuilder({}, faculty, { action: 'mediaCaptions:save', document: envelope.document })).toThrow(/perintah keterangan media tidak valid/i);
		expect(() => handleBuilder({}, faculty, { action: 'mediaCaptions:save', mediaCaptions: false, document: envelope.document })).toThrow(/perintah keterangan media tidak valid/i);
		// A legacy client or rolled-back endpoint cannot silently fall back to a plain save.
		expect(() => handleBuilder({}, faculty, { action: 'responsiveStyles:save', document: envelope.document, responsiveBorderRadius: true })).toThrow(/perintah versi captions/i);
	});

	it('preserves explicit zero-time cues through versioned snapshots and activity templates', () => {
		const envelope = blankBuilder('kelas', 'course-caption-batch');
		const activity = envelope.document.activities[0];
		const blockId = appendBlock(envelope, activity.id, 'audio');
		activity.blocks.find(block => block.id === blockId)!.captions = { language: 'id', cues: [{ start: 0, end: 1, text: 'Zero start survives' }] };
		const source = record('draft-caption', { owner: 'faculty', course: 'course-caption-batch', revision: 7, document: JSON.stringify(envelope.document), kind: 'kelas', title: 'Caption draft', deleted: false });
		const key = record('private-key-row', { keys: JSON.stringify(envelope.privateKeys) });
		const course = record('course-caption-batch', { owner: 'faculty' });
		const saved: TestRecord[] = [];
		const app = {
			findRecordById: (collection: string) => collection === 'builder_documents' ? source : collection === 'builder_private_keys' ? key : course,
			findRecordsByFilter: (collection: string) => collection === 'builder_private_keys' ? [key] : [],
			findCollectionByNameOrId: (name: string) => name,
			save: (item: TestRecord) => { saved.push(item); },
		};
		for (const [action, suffix] of [['mediaCaptions:saveSnapshot', 'snapshot'], ['mediaCaptions:saveTemplate', 'template']] as const) {
			handleBuilder(app, faculty, { action, mediaCaptions: true, id: source.id, baseRevision: 7, commandId: `caption-${suffix}`, title: suffix, activityId: activity.id, scope: 'activity' });
		}
		expect(saved.map(item => item.values.kind)).toEqual(['snapshot', 'template']);
		expect(saved.map(item => item.values.envelope.document.activities[0].blocks.find((block: { type: string }) => block.type === 'audio').captions.cues[0].start)).toEqual([0, 0]);
	});

	it('reads and inserts representative legacy activity and nested group templates through PB normalization and the shared student renderer', () => {
		const legacyActivity = blankBuilder('kelas', 'course');
		const activity = legacyActivity.document.activities[0];
		activity.title = 'Legacy equal columns';
		const instructionsId = appendBlock(legacyActivity, activity.id, 'instructions');
		const questionBlockId = appendBlock(legacyActivity, activity.id, 'question_group');
		const questionBlock = activity.blocks.find(block => block.id === questionBlockId)!;
		legacyActivity.document.questionsById[questionBlock.questionIds![0]].prompt = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy prompt' }] }] };
		activity.blocks.find(block => block.id === instructionsId)!.body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy section text' }] }] };
		activity.layout = { schemaVersion: 1, nodes: [{ kind: 'section', id: 'old-section', title: 'Old section', columns: 2, gap: 'md', padding: 'none', surface: 'none', children: [{ kind: 'block', blockId: instructionsId }, { kind: 'container', id: 'old-nested', title: 'Old nested', columns: 2, gap: 'md', padding: 'none', surface: 'none', children: [{ kind: 'block', blockId: questionBlockId }] }] }] };
		for (const block of activity.blocks) delete block.appearance;
		const legacyGroup = extractGroupTemplate(structuredClone(legacyActivity), activity.id, 'old-section');
		for (const block of legacyGroup.document.activities[0].blocks) delete block.appearance;
		delete legacyGroup.document.activities[0].layout!.nodes[0].appearance;
		const responsiveGroup = structuredClone(legacyGroup);
		const responsiveRoot = responsiveGroup.document.activities[0].layout!.nodes[0];
		if (responsiveRoot.kind !== 'block') {
			responsiveRoot.responsive = { tablet: { columns: 3, padding: 'md' }, mobile: { columns: 1 } };
			responsiveRoot.appearance = { shadow: 'md', responsive: { mobile: { corners: { topLeft: 0 } } } };
		}
		const templateRows = new Map<string, Row>([
			['activity-template', record('activity-template', { owner: 'faculty', kind: 'template', document: 'draft', envelope: JSON.stringify(legacyActivity) })],
			['group-template', record('group-template', { owner: 'faculty', kind: 'template', document: 'draft', envelope: JSON.stringify(legacyGroup) })],
			['responsive-template', record('responsive-template', { owner: 'faculty', kind: 'template', document: 'draft', envelope: JSON.stringify(responsiveGroup) })],
		]);
		const app = {
			findRecordById: (collection: string, id: string) => collection === 'builder_saved_items' ? templateRows.get(id)! : collection === 'courses' ? record(id, { owner: 'faculty' }) : record(id, {}),
			findRecordsByFilter: () => [],
		};
		const oldActivityRead = handleBuilder(app, owner, { action: 'savedGet', itemId: 'activity-template' }) as { envelope: BuilderEnvelope & { scope?: 'activity' | 'group' } };
		const oldGroupRead = handleBuilder(app, owner, { action: 'savedGet', itemId: 'group-template' }) as { envelope: BuilderEnvelope & { scope: 'group' } };
		const responsiveRead = handleBuilder(app, owner, { action: 'savedGet', itemId: 'responsive-template' }) as { envelope: BuilderEnvelope & { scope: 'group' } };
		expect(oldActivityRead.envelope.scope).toBeUndefined();
		expect(savedTemplateScope(oldActivityRead.envelope.scope)).toBe('activity');
		const normalizedActivity = normalizeServer(oldActivityRead.envelope);
		const normalizedGroup = { ...normalizeServer(oldGroupRead.envelope), scope: oldGroupRead.envelope.scope };
		const normalizedResponsive = { ...normalizeServer(responsiveRead.envelope), scope: responsiveRead.envelope.scope };
		expect(normalizedActivity.document.activities[0].layout?.nodes[0]).toMatchObject({ kind: 'section', columns: 2, children: [{ kind: 'block' }, { kind: 'container', columns: 2 }] });
		expect(normalizedGroup.document.activities[0].blocks.every(block => block.appearance === undefined)).toBe(true);
		expect(normalizedGroup.document.activities[0].blocks.every(block => block.layout === undefined)).toBe(true);
		expect(normalizedGroup.document.activities[0].layout?.nodes[0]).toMatchObject({ kind: 'section', columns: 2, children: [{ kind: 'block' }, { kind: 'container', columns: 2 }] });

		const target = blankBuilder('kelas', 'course');
		const insertedActivityId = insertActivityTemplate(target, normalizedActivity);
		const targetActivity = target.document.activities[0];
		const destinationId = addLayoutGroup(targetActivity, 'section');
		const insertedGroupId = insertGroupTemplate(target, targetActivity.id, destinationId, normalizedGroup);
		const insertedActivity = target.document.activities.find(item => item.id === insertedActivityId)!;
		expect(insertedActivity.blocks[0].id).not.toBe(activity.blocks[0].id);
		const copiedQuestionBlock = insertedActivity.blocks.find(block => block.type === 'question_group')!;
		const copiedQuestionId = copiedQuestionBlock.questionIds![0];
		expect(copiedQuestionId).not.toBe(questionBlock.questionIds![0]);
		expect(target.document.questionsById[copiedQuestionId]).toBeTruthy();
		expect(target.privateKeys.answersByQuestionId[copiedQuestionId]).toBeTruthy();
		expect(Object.keys(target.document.questionsById).sort()).toEqual(Object.keys(target.privateKeys.answersByQuestionId).sort());
		const copiedGroup = findLayoutGroup(targetActivity.layout!, insertedGroupId)!;
		expect(copiedGroup.id).not.toBe('old-section');
		expect(copiedGroup.appearance).toBeUndefined();
		expect(copiedGroup.responsive).toBeUndefined();
		const copiedNested = copiedGroup.children.find(node => node.kind === 'container');
		expect(copiedNested?.id).not.toBe('old-nested');
		const destinationTwo = addLayoutGroup(targetActivity, 'section');
		const responsiveGroupId = insertGroupTemplate(target, targetActivity.id, destinationTwo, normalizedResponsive);
		const copiedResponsiveGroup = findLayoutGroup(targetActivity.layout!, responsiveGroupId)!;
		expect(copiedResponsiveGroup.responsive).toEqual({ tablet: { columns: 3, padding: 'md' }, mobile: { columns: 1 } });
		expect(copiedResponsiveGroup.appearance).toEqual({ shadow: 'md', responsive: { mobile: { corners: { topLeft: 0 } } } });
		const html = renderToStaticMarkup(createElement(BuilderPreview, { document: target.document, readOnly: true }));
		expect(html).toContain('Legacy section text');
		expect(html).toContain('Legacy prompt');
		expect(html).toContain('bl-cols-2');
		expect(html).not.toContain('ba-has-border-detail');
		expect(html).not.toContain('PRIVATE');
	});

	it('authorizes template reads by owner and protected media ownership', () => {
		const ref = asset();
		const envelope = { document: doc(ref), privateKeys: { schemaVersion: 1, answersByQuestionId: {} }, scope: 'group' };
		const item = record('saved', { owner: 'faculty', kind: 'template', document: 'draft', envelope: JSON.stringify(envelope) });
		const file = record(ref.fileId, { owner: 'faculty', course: ['course'], file: ref.filename, version: 2 });
		const app = {
			findRecordById: (collection: string, id: string) => collection === 'builder_saved_items' ? item : collection === 'courses' ? record(id, { owner: 'faculty' }) : id === file.id ? file : record(id, {}),
			findRecordsByFilter: () => [],
		};
		expect(handleBuilder(app, owner, { action: 'savedGet', itemId: 'saved' })).toMatchObject({ envelope: { scope: 'group' } });
		const foreign = record(ref.fileId, { owner: 'other', course: ['course'], file: ref.filename, version: 2 });
		const foreignApp = { ...app, findRecordById: (collection: string, id: string) => collection === 'builder_saved_items' ? item : collection === 'courses' ? record(id, { owner: 'faculty' }) : id === foreign.id ? foreign : record(id, {}) };
		expect(() => handleBuilder(foreignApp, owner, { action: 'savedGet', itemId: 'saved' })).toThrow();
		const foreignItem = record('saved', { owner: 'another-faculty', kind: 'template', document: 'draft', envelope: JSON.stringify(envelope) });
		const foreignOwnerApp = { ...app, findRecordById: (collection: string, id: string) => collection === 'builder_saved_items' ? foreignItem : collection === 'courses' ? record(id, { owner: 'faculty' }) : id === file.id ? file : record(id, {}) };
		expect(() => handleBuilder(foreignOwnerApp, owner, { action: 'savedGet', itemId: 'saved' })).toThrow('Salinan tidak tersedia');
	});
	it('rejects a foreign mobile-only image when reading a saved template', () => {
		const ref = asset('ghijklmnopqr1234', 'template-mobile.png', 1);
		const envelope = { document: deviceOnlyDoc(ref), privateKeys: { schemaVersion: 1, answersByQuestionId: {} }, scope: 'group' };
		const item = record('saved', { owner: 'faculty', kind: 'template', document: 'draft', envelope: JSON.stringify(envelope) });
		const foreign = record(ref.fileId, { owner: 'another-faculty', course: ['course'], file: ref.filename, version: 1 });
		const app = {
			findRecordById: (collection: string, id: string) => collection === 'builder_saved_items' ? item : collection === 'courses' ? record(id, { owner: 'faculty' }) : id === foreign.id ? foreign : record(id, {}),
			findRecordsByFilter: () => [],
		};
		expect(() => handleBuilder(app, owner, { action: 'savedGet', itemId: 'saved' })).toThrow();
	});
	it('authorizes nested background images from current and retained prior versions', () => {
		const current = asset();
		expect(documentAssets(doc(current)).map((entry) => entry.kind)).toEqual(['image', 'image']);
		expect(() => authorizeAssets(authorizationApp(record(current.fileId, { owner: 'faculty', course: ['course'], file: current.filename, version: 2 })), faculty, doc(current))).not.toThrow();
		const priorAsset = asset('pqrstuvwxyzabcd1', 'prior.webp', 1);
		expect(() => authorizeAssets(authorizationApp(record(priorAsset.fileId, { owner: 'faculty', course: ['course'], file: 'new.png', version: 3 }), record('prior', { filename: priorAsset.filename, fileData: 'stored' })), faculty, doc(priorAsset))).not.toThrow();
	});
	it('rejects foreign owners, wrong courses, missing or mismatched prior versions, and nonimages', () => {
		const ref = asset();
		for (const file of [
			record(ref.fileId, { owner: 'other', course: ['course'], file: ref.filename, version: 2 }),
			record(ref.fileId, { owner: 'faculty', course: ['elsewhere'], file: ref.filename, version: 2 }),
		]) expect(() => authorizeAssets(authorizationApp(file), faculty, doc(ref))).toThrow();
		const old = asset(ref.fileId, 'old.png', 1);
		expect(() => authorizeAssets(authorizationApp(record(ref.fileId, { owner: 'faculty', course: ['course'], file: 'new.png', version: 3 })), faculty, doc(old))).toThrow();
		expect(() => authorizeAssets(authorizationApp(record(ref.fileId, { owner: 'faculty', course: ['course'], file: 'new.png', version: 3 }), record('prior', { filename: 'different.png', fileData: 'stored' })), faculty, doc(old))).toThrow();
		const bad = asset(ref.fileId, 'background.pdf', 2);
		expect(() => authorizeAssets(authorizationApp(record(bad.fileId, { owner: 'faculty', course: ['course'], file: bad.filename, version: 2 })), faculty, doc(bad))).toThrow('Jenis berkas');
	});
	it('rejects a foreign mobile-only image through save and publish asset authorization', () => {
		const ref = asset('defghijklmnopqr1', 'mobile-only.png', 1);
		const document = deviceOnlyDoc(ref);
		expect(documentAssets(document).map((entry) => entry.asset.filename)).toEqual(['mobile-only.png']);
		const foreign = authorizationApp(record(ref.fileId, { owner: 'another-faculty', course: ['course'], file: ref.filename, version: ref.version }));
		expect(() => authorizeAssets(foreign, faculty, document)).toThrow();
		expect(() => authorizeAssets(foreign, faculty, document)).toThrow();
	});
	it('rejects a foreign mobile-only image in an actual draft save', () => {
		const ref = asset('ijklmnopqr123456', 'save-mobile.png', 1);
		const envelope = deviceOnlyEnvelope(ref);
		const app = {
			findRecordsByFilter: () => [],
			findRecordById: (collection: string, id: string) => collection === 'courses' ? record(id, { owner: 'faculty' }) : record(id, { owner: 'another-faculty', course: ['course'], file: ref.filename, version: 1 }),
		};
		expect(() => handleBuilder(app, owner, { action: 'create', commandId: 'save-device-image', ...envelope })).toThrow();
	});
	it('rejects a foreign mobile-only image during actual publication', () => {
		const ref = asset('jklmnopqr1234567', 'publish-mobile.png', 1);
		const envelope = deviceOnlyEnvelope(ref);
		const source = record('draft', { owner: 'faculty', deleted: false, document: JSON.stringify(envelope.document), revision: 4, course: 'course' });
		const app = {
			findRecordById: (collection: string, id: string) => collection === 'builder_documents' ? source : collection === 'courses' ? record(id, { owner: 'faculty' }) : record(id, { owner: 'another-faculty', course: ['course'], file: ref.filename, version: 1 }),
			findRecordsByFilter: () => [],
		};
		expect(() => deliveryHandle(app, owner, { action: 'publish', id: source.id, commandId: 'publish-device-image', baseRevision: 4 })).toThrow();
	});
	it('keeps existing block and gallery image assets in traversal', () => {
		const image = asset();
		const d = doc(image, true) as ReturnType<typeof doc> & { activities: { blocks: { type: string; images: { asset: Asset }[] }[] }[] };
		d.activities[0].blocks[0].images = [{ asset: asset('bcdefghijklmnop', 'gallery.jpg', 1) }];
		expect(documentAssets(d).map((entry) => entry.asset.filename)).toEqual(['background.png', 'gallery.jpg', 'background.png', 'background.png']);
	});
});

describe('builder delivery media lookup', () => {
	it('requires the nested-list marker on both publish aliases and reads the protected draft before publication', () => {
		const envelope = blankBuilder('kelas', 'course-nested-publish');
		const activityId = envelope.document.activities[0].id;
		appendBlock(envelope, activityId, 'instructions');
		envelope.document.activities[0].blocks[0].body = normalizeBuilderRichText({ type: 'doc', content: [
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Parent' }] },
			{ type: 'list_item', list: 'bullet', depth: 1, content: [{ type: 'text', text: 'Child' }] },
		] });
		const source = record('draft-nested', { owner: 'faculty', deleted: false, document: JSON.stringify(envelope.document), revision: 4, course: envelope.document.context.courseId });
		const app = { findRecordById: (collection: string) => collection === 'builder_documents' ? source : record('course', { owner: 'faculty' }), findRecordsByFilter: () => [] };
		expect(() => deliveryHandle(app, owner, { action: 'publish', id: source.id, commandId: 'publish-nested', baseRevision: 4 })).toThrow(/versi daftar/i);
		expect(() => deliveryHandle(app, owner, { action: 'nestedLists:publish', nestedRichText: false, id: source.id, commandId: 'publish-nested', baseRevision: 4 })).toThrow(/perintah daftar bertingkat tidak valid/i);
		expect(() => deliveryHandle(app, owner, { action: 'nestedLists:publish', nestedRichText: true, id: source.id, commandId: '@', baseRevision: 4 })).toThrow(/identitas penerbitan tidak valid/i);
	});

	it('requires the playback publish alias for advanced media settings and rejects downgrade to legacy publish', () => {
		const envelope = blankBuilder('kelas', 'course-playback-publish');
		const activity = envelope.document.activities[0]; appendBlock(envelope, activity.id, 'audio');
		activity.blocks[0].playback = { start: 0, end: 9, rate: 2 };
		activity.blocks[0].appearance = { responsive: { mobile: { corners: { topLeft: 0 } } } };
		const source = record('draft-playback', { owner: 'faculty', deleted: false, document: JSON.stringify(envelope.document), revision: 4, course: envelope.document.context.courseId });
		const app = { findRecordById: (collection: string) => collection === 'builder_documents' ? source : record('course', { owner: 'faculty' }), findRecordsByFilter: () => [] };
		expect(() => deliveryHandle(app, owner, { action: 'publish', id: source.id, commandId: 'publish-playback-old', baseRevision: 4 })).toThrow(/versi pemutaran/i);
		expect(() => deliveryHandle(app, owner, { action: 'mediaPlayback:publish', mediaPlayback: false, responsiveBorderRadius: true, id: source.id, commandId: 'publish-playback-false', baseRevision: 4 })).toThrow(/perintah pemutaran media tidak valid/i);
		expect(() => deliveryHandle(app, owner, { action: 'mediaPlayback:publish', mediaPlayback: true, commandId: 'publish-playback-no-responsive', baseRevision: 4 })).toThrow(/gaya responsif memerlukan perintah versi responsif/i);
		expect(() => deliveryHandle(app, owner, { action: 'mediaPlayback:publish', mediaPlayback: true, responsiveBorderRadius: true, id: source.id, commandId: '@', baseRevision: 4 })).toThrow(/identitas penerbitan tidak valid/i);
	});
	it('normalizes nested depth and bounds total rich-text payload in PocketBase', () => {
		const envelope = blankBuilder('kelas', 'course-rich-bounds');
		appendBlock(envelope, envelope.document.activities[0].id, 'instructions');
		envelope.document.activities[0].blocks[0].body = { type: 'doc', content: Array.from({ length: 2 }, () => ({ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(10001) }] })) };
		expect(() => normalizeServer(envelope)).toThrow(/terlalu panjang/i);
	});
	it('returns the exact published nested background reference as a plain asset', () => {
		const ref = asset();
		const file = record(ref.fileId, { owner: 'faculty', course: ['course'], file: ref.filename, version: 2 });
		const result = deliveryHandle(deliveryFixture(doc(ref), file), owner, { action: 'media', runId: 'run', ...ref }) as { asset: Asset };
		expect(result).toEqual({ asset: ref });
		expect(result.asset.fileId).toBe(ref.fileId);
	});
	it('delivers a mobile-only image only from the immutable published reference', () => {
		const ref = asset('efghijklmnopqr12', 'mobile-only.png', 2);
		const file = record(ref.fileId, { owner: 'faculty', course: ['course'], file: ref.filename, version: 2 });
		const app = deliveryFixture(deviceOnlyDoc(ref), file);
		expect(deliveryHandle(app, owner, { action: 'media', runId: 'run', ...ref })).toEqual({ asset: ref });
		expect(() => deliveryHandle(app, owner, { action: 'media', runId: 'run', ...ref, filename: 'other.png' })).toThrow();
	});
	it('denies foreign, unreferenced and filename/version-mismatched media', () => {
		const ref = asset();
		const app = deliveryFixture(doc(ref), record(ref.fileId, { owner: 'faculty', course: ['course'], file: ref.filename, version: 2 }));
		for (const request of [
			{ ...ref, fileId: 'pqrstuvwxyzabcd1' },
			{ ...ref, filename: 'other.png' },
			{ ...ref, version: 3 },
		]) expect(() => deliveryHandle(app, owner, { action: 'media', runId: 'run', ...request })).toThrow();
	});
	it('denies published assets after their course association is removed or changed', () => {
		const ref = asset();
		for (const course of [[], ['another-course']]) {
			const file = record(ref.fileId, { owner: 'faculty', course, file: ref.filename, version: 2 });
			expect(() => deliveryHandle(deliveryFixture(doc(ref), file), owner, { action: 'media', runId: 'run', ...ref })).toThrow('Media tidak tersedia');
		}
	});
	it('continues to deliver existing block and gallery image assets', () => {
		const block = asset('bcdefghijklmnop', 'block.png', 1);
		const gallery = asset('cdefghijklmnopq', 'gallery.jpg', 1);
		const d = doc(asset());
		d.activities[0].blocks = [{ type: 'image', asset: block, images: [{ asset: gallery }] }];
		const app = deliveryFixture(d, record(block.fileId, { owner: 'faculty', course: ['course'], file: block.filename, version: 1 }));
		expect(deliveryHandle(app, owner, { action: 'media', runId: 'run', ...block })).toEqual({ asset: block });
		const galleryApp = deliveryFixture(d, record(gallery.fileId, { owner: 'faculty', course: ['course'], file: gallery.filename, version: 1 }));
		expect(deliveryHandle(galleryApp, owner, { action: 'media', runId: 'run', ...gallery })).toEqual({ asset: gallery });
	});
	it('retains explicit visibility false/true values and rejects protected or malformed hidden ancestry', () => {
		const envelope = blankBuilder('kelas', 'course-visibility');
		const activity = envelope.document.activities[0];
		const textId = appendBlock(envelope, activity.id, 'instructions');
		envelope.document.activities[0].blocks.find(block => block.id === textId)!.presentation = { desktop: false, tablet: true, mobile: false };
		const normalized = normalizeServer(envelope);
		expect(normalized.document.activities[0].blocks.find(block => block.id === textId)?.presentation).toEqual({ desktop: false, tablet: true, mobile: false });
		const linked = structuredClone(envelope);
		linked.document.activities[0].blocks.find(block => block.id === textId)!.body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Link', link: { href: 'https://example.org' } }] }] };
		expect(() => normalizeServer(linked)).toThrow(/tidak dapat disembunyikan/i);
		const interactiveReference = structuredClone(envelope);
		const referenceId = appendBlock(interactiveReference, activity.id, 'reference');
		interactiveReference.document.activities[0].blocks.find(block => block.id === referenceId)!.presentation = { desktop: false };
		expect(() => normalizeServer(interactiveReference)).toThrow(/tidak dapat disembunyikan/i);
		const groupId = addLayoutGroup(activity, 'section', null, 1);
		const group = findLayoutGroup(activity.layout!, groupId)!;
		group.children.push({ kind: 'block', blockId: textId });
		activity.layout!.nodes = [group];
		group.presentation = { mobile: false };
		expect(normalizeServer(envelope).document.activities[0].layout?.nodes).toBeDefined();
		const questionId = appendBlock(envelope, activity.id, 'question_group');
		group.children.push({ kind: 'block', blockId: questionId });
		expect(() => normalizeServer(envelope)).toThrow(/tidak dapat disembunyikan/i);
		group.children.pop();
		(group as any).presentation.mobile = 'false';
		expect(() => normalizeServer(envelope)).toThrow(/visibilitas perangkat/i);
	});
	it('renders safe visibility responsively, keeps editor content discoverable, and defends malformed protected ancestry', () => {
		const envelope = blankBuilder('kelas', 'course-visibility-render');
		const activity = envelope.document.activities[0];
		const textId = appendBlock(envelope, activity.id, 'instructions');
		const groupId = addLayoutGroup(activity, 'section', null, 1);
		const group = findLayoutGroup(activity.layout!, groupId)!;
		group.children.push({ kind: 'block', blockId: textId });
		activity.layout!.nodes = [group];
		group.presentation = { desktop: false, tablet: true, mobile: false };
		const markup = renderToStaticMarkup(createElement(BuilderLayoutView, { activity, renderBlock: block => block.type, editorMode: true }));
		expect(markup).toContain('data-presentation-desktop="hidden"');
		expect(markup).toContain('data-presentation-tablet="visible"');
		expect(markup).toContain('data-editor-presentation-hidden="true"');
		expect(markup).toContain('instructions');
		const studentMarkup = renderToStaticMarkup(createElement(BuilderLayoutView, { activity, renderBlock: block => block.type }));
		expect(studentMarkup).not.toContain('data-editor-presentation-hidden');
		expect(studentMarkup).toContain('data-presentation-desktop="hidden"');
		const css = readFileSync(new URL('../src/styles/builder-appearance.css', import.meta.url), 'utf8');
		expect(css).toContain('@container laras-activity (max-width: 900px)');
		expect(css).toContain('@container laras-activity (max-width: 600px)');
		expect(css).toContain('display: none');
		const questionId = appendBlock(envelope, activity.id, 'question_group');
		group.children.push({ kind: 'block', blockId: questionId });
		expect(builderNodeVisibilitySafe(envelope)).toBe(false);
		const guarded = renderToStaticMarkup(createElement(BuilderLayoutView, { activity, renderBlock: block => block.type }));
		expect(guarded).not.toContain('data-presentation-desktop="hidden"');
		expect(guarded).toContain('question_group');
	});
});
