import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

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
