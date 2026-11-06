import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appendBlock, blankBuilder } from '../src/lib/builder-document';
import { addLayoutGroup, findLayoutGroup } from '../src/lib/builder-layout';

const hooks = new URL('../../pocketbase/pb_hooks/', import.meta.url);
const domain = { exports: {} as Record<string, unknown> };
runInNewContext(readFileSync(new URL('builder-domain.js', hooks), 'utf8'), {
	module: domain, __hooks: '', require: () => ({}),
});
const documentAssets = domain.exports.documentAssets as (d: unknown) => { asset: Asset; kind: string }[];
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
runInNewContext(readFileSync(new URL('builder-service.js', hooks), 'utf8'), {
	module: service, __hooks: '', require: (path: string) => path.endsWith('builder-domain.js') ? domain.exports : {},
	ForbiddenError: class ForbiddenError extends Error {}, BadRequestError: class BadRequestError extends Error {},
});
const authorizeAssets = service.exports.authorizeAssets as (app: unknown, user: { id: string }, d: unknown) => void;
const handleBuilder = service.exports.handle as (app: unknown, user: { id: string; getString: (name: string) => string }, body: Record<string, unknown>) => unknown;
const faculty = { id: 'faculty', getString: () => 'faculty' };
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
});
