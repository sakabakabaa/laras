import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
	ENHANCED_AUTHORING_ALLOWLIST_ENV,
	ENHANCED_AUTHORING_DENIED,
	ENHANCED_AUTHORING_ENV,
	builderAuthoringGate,
	builderCapabilityPayload,
	enhancedAuthoringNotice,
	isEnhancedAuthoringDenied,
	parseEnhancedAuthoringAllowlist,
	parseEnhancedAuthoringMode,
	resolveEnhancedAuthoring,
	serverEnhancedAuthoring,
	usesEnhancedAuthoring,
} from '../src/lib/builder-capability';
import { appendBlock, blankBuilder } from '../src/lib/builder-document';
import { addLayoutGroup, ensureLayout } from '../src/lib/builder-layout';
import type { BuilderEnvelope } from '../src/lib/builder-document';

type MockRecord = {
	id: string;
	getString: (name: string) => string;
	getInt: (name: string) => number;
	getBool: (name: string) => boolean;
	set: (name: string, value: unknown) => void;
};
type MockUser = { id: string; getString: (name: string) => string };
type MockApp = {
	findRecordById: ReturnType<typeof vi.fn>;
	findRecordsByFilter: ReturnType<typeof vi.fn>;
	findCollectionByNameOrId: ReturnType<typeof vi.fn>;
	save: ReturnType<typeof vi.fn>;
};

const service = { exports: {} as Record<string, unknown> };
const domainModule = { exports: {} as Record<string, unknown> };
runInNewContext(
	readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'),
	{ module: domainModule, __hooks: '', require: () => ({}) },
);
runInNewContext(
	readFileSync(new URL('../../pocketbase/pb_hooks/builder-service.js', import.meta.url), 'utf8'),
	{
		module: service,
		__hooks: '',
		// Lightweight stand-in for builder-domain.js: the capability gate must decide
		// before normalization, and these tests exercise the flat/normalized shape.
		require: () => ({
			normalize: (value: { document: unknown; privateKeys: unknown }) => value,
			documentAssets: (domainModule.exports as { documentAssets: (d: unknown) => unknown[] }).documentAssets,
		}),
		BadRequestError: class BadRequestError extends Error {},
		ForbiddenError: class ForbiddenError extends Error {},
		Record: class Record {},
	},
);
const handle = service.exports.handle as (app: MockApp, user: MockUser, body: Record<string, unknown>) => unknown;
const enhancedDocumentJs = service.exports.enhancedDocument as (document: unknown) => boolean;

function facultyEnvelope(): BuilderEnvelope {
	return blankBuilder('kelas', 'course', '', []);
}

function advancedEnvelope(): BuilderEnvelope {
	const envelope = facultyEnvelope();
	const activity = envelope.document.activities[0];
	ensureLayout(activity);
	addLayoutGroup(activity, 'section', null);
	return envelope;
}

function draftApp(values: Record<string, unknown>) {
	return {
		id: 'draft0000000001',
		getString: (name: string) => String(values[name] ?? ''),
		getInt: (name: string) => Number(values[name] || 0),
		getBool: (name: string) => Boolean(values[name]),
		set: (name: string, value: unknown) => {
			values[name] = value;
		},
		load: (next: Record<string, unknown>) => {
			Object.assign(values, next);
		},
	};
}

function app(values: Record<string, unknown>, hasPrivateKeys = true, ownsDraft = true) {
	const draft = draftApp(values);
	const mockApp: MockApp = {
		findRecordById: vi.fn((collection: string) => {
			if (collection === 'courses') return { id: 'course', getString: () => 'faculty-user' };
			// An unrelated draft never matches the caller's ownership filter.
			return ownsDraft ? draft : draftApp({ owner: 'someone-else' });
		}),
		findRecordsByFilter: vi.fn((collection: string) =>
			collection === 'builder_private_keys' && hasPrivateKeys ? [draftApp({ keys: '{}' })] : [],
		),
		findCollectionByNameOrId: vi.fn(() => ({ id: 'collection' })),
		save: vi.fn(),
	};
	return { mockApp, draft };
}

const faculty = (id = 'faculty-user'): MockUser => ({ id, getString: () => 'faculty' });

function withEnv(values: Record<string, string | undefined>, run: () => void) {
	const saved: Record<string, string | undefined> = {};
	for (const key of [ENHANCED_AUTHORING_ENV, ENHANCED_AUTHORING_ALLOWLIST_ENV]) {
		saved[key] = process.env[key];
		if (values[key] === undefined) delete process.env[key];
		else process.env[key] = values[key];
	}
	try {
		run();
	} finally {
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

describe('enhanced authoring capability — default (flag unset) preserves production', () => {
	it('treats unset and unrecognised values as enabled', () => {
		expect(parseEnhancedAuthoringMode(undefined)).toBe('on');
		expect(parseEnhancedAuthoringMode('')).toBe('on');
		expect(parseEnhancedAuthoringMode('typo')).toBe('on');
		expect(parseEnhancedAuthoringMode('on')).toBe('on');
		for (const value of ['off', 'OFF', '0', 'false', 'no', 'disabled']) {
			expect(parseEnhancedAuthoringMode(value)).toBe('off');
		}
	});

	it('resolves enabled for a lecturer and keeps shared rendering on', () => {
		const capability = resolveEnhancedAuthoring({ userId: 'u1', role: 'faculty', mode: 'on', allowlist: [] });
		expect(capability).toMatchObject({ authoring: true, readOnlyRendering: true, reason: 'enabled' });
		expect(usesEnhancedAuthoring(advancedEnvelope().document)).toBe(true);
		expect(builderAuthoringGate({ capability, envelope: advancedEnvelope() })).toEqual({ allowed: true });
		expect(enhancedAuthoringNotice(capability, false)).toBe('');
		expect(enhancedAuthoringNotice(capability, true)).toBe('');
	});

	it('reads env through serverEnhancedAuthoring, defaulting to enabled', () => {
		withEnv({ [ENHANCED_AUTHORING_ENV]: undefined, [ENHANCED_AUTHORING_ALLOWLIST_ENV]: undefined }, () => {
			expect(serverEnhancedAuthoring({ id: 'u1', role: 'faculty' }).authoring).toBe(true);
			expect(serverEnhancedAuthoring(null).authoring).toBe(false);
		});
	});
});

describe('enhanced authoring capability — explicitly off', () => {
	it('denies a lecturer and explains the state without disabling shared rendering', () => {
		const capability = resolveEnhancedAuthoring({ userId: 'u1', role: 'faculty', mode: 'off', allowlist: [] });
		expect(capability).toMatchObject({ authoring: false, readOnlyRendering: true, reason: 'disabled' });
		const payload = builderCapabilityPayload(capability, true);
		expect(payload.authoring).toBe(false);
		expect(payload.readOnlyRendering).toBe(true);
		expect(payload.notice).toContain('hanya-baca');
		expect(payload.notice).toContain('mengunduh salinan pribadi');
	});

	it('still allows a legacy flat document through the reduced editor', () => {
		const capability = resolveEnhancedAuthoring({ userId: 'u1', role: 'faculty', mode: 'off', allowlist: [] });
		expect(usesEnhancedAuthoring(facultyEnvelope().document)).toBe(false);
		expect(builderAuthoringGate({ capability, envelope: facultyEnvelope() })).toEqual({ allowed: true });
	});
	it('treats semantic rich text as enhanced so fallback editors cannot discard it', () => {
		const envelope = facultyEnvelope();
		const blockId = appendBlock(envelope, envelope.document.activities[0].id, 'instructions');
		const block = envelope.document.activities[0].blocks.find((item: any) => item.id === blockId)! as any;
		block.body = { type: 'doc', content: [{ type: 'heading', level: 2, content: [{ type: 'text', text: 'Keep me' }] }] };
		expect(usesEnhancedAuthoring(envelope.document)).toBe(true);
		expect(enhancedDocumentJs(envelope.document)).toBe(true);
		expect(builderAuthoringGate({ capability: resolveEnhancedAuthoring({ userId: 'student', role: 'student', mode: 'off', allowlist: [] }), envelope }).allowed).toBe(false);
	});
	it('keeps image presentation documents out of fallback editors', () => {
		const envelope = facultyEnvelope();
		const blockId = appendBlock(envelope, envelope.document.activities[0].id, 'image');
		const block = envelope.document.activities[0].blocks.find((item: any) => item.id === blockId)! as any;
		block.images = [{id:'photo_1',url:'https://example.org/photo.jpg',alt:'Photo',caption:'',presentation:{fit:'cover',aspect:'16:9',focalX:30,focalY:60}}];
		expect(usesEnhancedAuthoring(envelope.document)).toBe(true);
	});
	it('blocks fallback authoring for media transcripts and playback settings', () => {
		const envelope = facultyEnvelope();
		const blockId = appendBlock(envelope, envelope.document.activities[0].id, 'audio');
		const block = envelope.document.activities[0].blocks.find((item: any) => item.id === blockId)! as any;
		block.transcript = 'Preserve me';
		expect(usesEnhancedAuthoring(envelope.document)).toBe(true);
		expect(enhancedDocumentJs(envelope.document)).toBe(true);
		delete block.transcript;
		block.playback = { loop: true };
		expect(builderAuthoringGate({ capability: resolveEnhancedAuthoring({ userId: 'u1', role: 'faculty', mode: 'off', allowlist: [] }), envelope }).allowed).toBe(false);
	});

	it('does not infer flat compatibility when enhanced fields exist', () => {
		const capability = resolveEnhancedAuthoring({ userId: 'u1', role: 'faculty', mode: 'off', allowlist: [] });
		const advanced = advancedEnvelope();
		// Route the same JSON round-trip the real request performs.
		const sent = JSON.parse(JSON.stringify(advanced)) as BuilderEnvelope;
		expect(usesEnhancedAuthoring(sent.document)).toBe(true);
		const gate = builderAuthoringGate({ capability, envelope: sent });
		expect(gate.allowed).toBe(false);
		if (!gate.allowed) {
			expect(gate.status).toBe(409);
			expect(gate.message.startsWith(ENHANCED_AUTHORING_DENIED)).toBe(true);
		}
		expect(isEnhancedAuthoringDenied(new Error(gate.message))).toBe(true);
	});

	it('detects mixed sections and layout-only activities', () => {
		const enriched = facultyEnvelope();
		const blockId = appendBlock(enriched, enriched.document.activities[0].id, 'gap_passage');
		enriched.document.activities[0].blocks.find((item) => item.id === blockId)!.sections = [
			{ id: 'section1', segments: [] },
		] as never;
		expect(usesEnhancedAuthoring(enriched.document)).toBe(true);
		expect(enhancedDocumentJs(enriched.document)).toBe(true);
		expect(usesEnhancedAuthoring(facultyEnvelope().document)).toBe(false);
		expect(enhancedDocumentJs(facultyEnvelope().document)).toBe(false);
	});
});

describe('enhanced authoring capability — lecturer allowlist', () => {
	it('authorizes only listed lecturer IDs while the mode is off', () => {
		const allowlist = parseEnhancedAuthoringAllowlist(' alpha , beta ,,alpha ');
		expect(allowlist).toEqual(['alpha', 'beta']);
		expect(resolveEnhancedAuthoring({ userId: 'alpha', role: 'faculty', mode: 'off', allowlist }).reason).toBe('allowlisted');
		expect(resolveEnhancedAuthoring({ userId: 'gamma', role: 'faculty', mode: 'off', allowlist }).authoring).toBe(false);
		// Students are never authorized, even if their ID is listed.
		expect(resolveEnhancedAuthoring({ userId: 'alpha', role: 'student', mode: 'on', allowlist }).authoring).toBe(false);
	});

	it('reads the allowlist from env', () => {
		withEnv(
			{ [ENHANCED_AUTHORING_ENV]: 'off', [ENHANCED_AUTHORING_ALLOWLIST_ENV]: 'staging-lecturer' },
			() => {
				expect(serverEnhancedAuthoring({ id: 'staging-lecturer', role: 'faculty' }).authoring).toBe(true);
				expect(serverEnhancedAuthoring({ id: 'other', role: 'faculty' }).authoring).toBe(false);
			},
		);
	});
});
// ── Server-side enforcement in the PocketBase builder hook ───────────────────

const hookSource = readFileSync(new URL('../../pocketbase/pb_hooks/builder-service.js', import.meta.url), 'utf8');

type HookRecord = {
	id: string;
	getString: (name: string) => string;
	getInt: (name: string) => number;
	getBool: (name: string) => boolean;
	set: (name: string, value: unknown) => void;
	load: (next: Record<string, unknown>) => void;
};

/**
 * A fresh hook context per test. `process` is injected so the env flag is
 * deterministic, and records behave like PocketBase rows (set/load/getters).
 */
function serviceContext(env: Record<string, string | undefined>, options: { privateKeys?: boolean; owned?: boolean } = {}) {
	const { privateKeys = true, owned = true } = options;
	// PocketBase keeps `document` as a JSON-encoded text field.
	const saved: unknown[] = [];
	const draftColumns: Record<string, unknown> = {
		owner: 'faculty-user',
		kind: 'kelas',
		revision: 2,
		document: JSON.stringify({
			schemaVersion: 1,
			kind: 'kelas',
			context: { courseId: 'course', sectionIds: [] },
			activities: [],
			questionsById: {},
			delivery: {},
		}),
	};
	const values = draftColumns;
	const keyColumns: Record<string, unknown> = {
		document: 'draft0000000001',
		keys: '{"schemaVersion":1,"answersByQuestionId":{}}',
	};
	const record = (columns: Record<string, unknown>): HookRecord => {
		// PocketBase rows carry their columns; app.save() persists this object.
		const row = columns;
		row.id = 'draft0000000001';
		return {
			id: 'draft0000000001',
			getString: (name: string) => {
				const value = row[name];
				return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
			},
			getInt: (name: string) => Number(row[name] ?? 0),
			getBool: (name: string) => Boolean(row[name]),
			set: (name: string, value: unknown) => {
				row[name] = value;
			},
			load: (next: Record<string, unknown>) => {
				Object.assign(row, next);
			},
		};
	};
	const draft = record(draftColumns);
	const findRow = (collection: string) =>
		collection === 'builder_private_keys'
			? record(keyColumns)
			: collection === 'courses'
				? { id: 'course', getString: () => 'faculty-user' }
				: owned
					? draft
					: record({ owner: 'someone-else' });
	const app = {
		findRecordById: findRow,
		findRecordsByFilter: (collection: string, filter: string, _sort: string, _limit: number, _offset: number, params: Record<string, unknown>) =>
			collection === 'builder_private_keys' && privateKeys && filter === 'document={:d}' && params.d === 'draft0000000001' ? [record(keyColumns)] : [],
		findCollectionByNameOrId: () => ({ id: 'collection', name: 'builder_documents' }),
		save: (item: unknown) => {
			const row = item as { getString: (name: string) => string };
			if (row.getString('keys')) {
				keyColumns.document = row.getString('document');
				keyColumns.keys = row.getString('keys');
			} else {
				for (const field of ['course', 'title', 'kind', 'revision', 'document', 'lastSaveId']) {
					const value = row.getString(field);
					if (value) draftColumns[field] = value;
				}
			}
			saved.push(item);
		},
	};
	// Plain JavaScript only: type annotations inside a vm context are not stripped.
	const mod = { exports: {} as Record<string, unknown> };
	const hookGlobals: Record<string, unknown> = {
		module: mod,
		__hooks: '',
		// The capability gate decides before normalization, and these fixtures
		// are already-normalized envelopes, so no domain logic is needed here.
		require: () => ({
			// Same contract as builder-domain.js: the returned document is stored; the
			// PocketBase text column serialization happens at the column boundary.
			normalize: (envelope: Record<string, unknown>) => envelope,
			documentAssets: (domainModule.exports as { documentAssets: (d: unknown) => unknown[] }).documentAssets,
		}),
		process: { env },
		// The handler constructs a Record when a private-keys row does not exist.
		Record: class Record {
			id = 'draft0000000001';
			private row: Record<string, unknown> = {};
			getString(name: string) {
				const value = this.row[name];
				return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
			}
			getInt(name: string) {
				return Number(this.row[name] ?? 0);
			}
			getBool(name: string) {
				return Boolean(this.row[name]);
			}
			set(name: string, value: unknown) {
				this.row[name] = value;
			}
			load(next: Record<string, unknown>) {
				Object.assign(this.row, next);
			}
		},
		BadRequestError: class BadRequestError extends Error {},
		ForbiddenError: class ForbiddenError extends Error {},
	};
	runInNewContext(hookSource, hookGlobals);
	const handle = mod.exports.handle as (app: typeof app, user: MockUser, body: Record<string, unknown>) => unknown;
	return { handle, app, values, saved };
}

const OFF = { [ENHANCED_AUTHORING_ENV]: 'off' };

describe('builder service — server-side enforcement', () => {
	it('accepts versioned lock writes through the normal revision and ownership path', () => {
		const { handle, app, values, saved } = serviceContext({});
		const advanced = advancedEnvelope();
		appendBlock(advanced, advanced.document.activities[0].id, 'instructions');
		advanced.document.activities[0].blocks[0].layoutLocked = true;
		values.document = JSON.stringify(advanced.document);
		handle(app, faculty(), {
			action: 'layoutLocks:save', id: 'draft0000000001', baseRevision: 2,
			commandId: 'cmd-versioned', ...advanced,
		});
		expect(saved).toHaveLength(2);
		expect(JSON.parse(values.document as string).activities[0].blocks[0].layoutLocked).toBe(true);
		expect(() => handle(app, faculty(), {
			action: 'layoutLocks:save', id: 'draft0000000001', baseRevision: 2,
			commandId: 'cmd-stale', ...advanced,
		})).toThrow('REVISION_CONFLICT');
		expect(saved).toHaveLength(2);
	});

	it('rejects unknown versioned commands without persisting anything', () => {
		const { handle, app, saved } = serviceContext({});
		expect(() => handle(app, faculty(), { action: 'layoutLocks:unknown' })).toThrow('Perintah builder tidak didukung');
		expect(saved).toHaveLength(0);
	});

	it('saves an advanced draft when the flag is unset (production default)', () => {
		const { handle, app, values, saved } = serviceContext({});
		const advanced = advancedEnvelope();
		values.document = JSON.stringify(advanced.document);
		handle(app, faculty(), {
			action: 'save',
			id: 'draft0000000001',
			baseRevision: 2,
			commandId: 'cmd-default',
			document: advanced.document,
			privateKeys: advanced.privateKeys,
		});
		expect(saved).toHaveLength(2);
		const persisted = JSON.parse(values.document as string) as { activities: { layout?: unknown }[] };
		expect(persisted.activities[0].layout).toBeDefined();
	});

	it('rejects saving an advanced draft when disabled, leaving the stored draft intact', () => {
		const { handle, app, values, saved } = serviceContext(OFF);
		const advanced = advancedEnvelope();
		values.document = JSON.stringify(advanced.document);
		const before = values.document;
		expect(() =>
			handle(app, faculty(), {
				action: 'save',
				id: 'draft0000000001',
				baseRevision: 2,
				commandId: 'cmd-1',
				document: advanced.document,
				privateKeys: advanced.privateKeys,
			}),
		).toThrow('ENHANCED_AUTHORING_DENIED');
		expect(values.document).toBe(before);
		expect(saved).toHaveLength(0);
	});

	it('rejects introducing enhanced fields through a denied create', () => {
		const { handle, app, saved } = serviceContext(OFF, { privateKeys: false, owned: false });
		const advanced = advancedEnvelope();
		expect(() =>
			handle(app, faculty(), {
				action: 'create',
				commandId: 'cmd-2',
				document: advanced.document,
				privateKeys: advanced.privateKeys,
			}),
		).toThrow('ENHANCED_AUTHORING_DENIED');
		expect(saved).toHaveLength(0);
	});

	it('rejects a denied snapshot of an advanced draft', () => {
		const { handle, app, values, saved } = serviceContext(OFF);
		values.document = JSON.stringify(advancedEnvelope().document);
		expect(() =>
			handle(app, faculty(), {
				action: 'saveSnapshot',
				id: 'draft0000000001',
				commandId: 'cmd-snap',
				baseRevision: 2,
				title: 'Salinan',
			}),
		).toThrow('ENHANCED_AUTHORING_DENIED');
		expect(saved).toHaveLength(0);
	});

	it('authorizes an allowlisted lecturer even while the flag is off', () => {
		const { handle, app, values, saved } = serviceContext({
			...OFF,
			[ENHANCED_AUTHORING_ALLOWLIST_ENV]: 'faculty-user',
		});
		const advanced = advancedEnvelope();
		values.document = JSON.stringify(advanced.document);
		handle(app, faculty(), {
			action: 'save',
			id: 'draft0000000001',
			baseRevision: 2,
			commandId: 'cmd-3',
			document: advanced.document,
			privateKeys: advanced.privateKeys,
		});
		expect(saved).toHaveLength(2);
	});

	it('keeps reads, export and legacy flat saves reachable while disabled', () => {
		const { handle, app, values, saved } = serviceContext(OFF);
		const advanced = advancedEnvelope();
		values.document = JSON.stringify(advanced.document);
		// get: the denied lecturer still receives the full document (export/preview).
		const record = handle(app, faculty(), { action: 'get', id: 'draft0000000001' }) as {
			document: { activities: { layout?: unknown }[] };
		};
		expect(record.document.activities[0].layout).toBeDefined();
		// A legacy flat draft stays editable and keeps its flat shape.
		const flat = facultyEnvelope();
		values.document = JSON.stringify(flat.document);
		handle(app, faculty(), {
			action: 'save',
			id: 'draft0000000001',
			baseRevision: 2,
			commandId: 'cmd-4',
			document: flat.document,
			privateKeys: flat.privateKeys,
		});
		expect(saved).toHaveLength(2);
		const persistedFlat = JSON.parse(values.document as string) as { activities: { layout?: unknown }[] };
		expect(persistedFlat.activities[0].layout).toBeUndefined();
	});

	it('keeps lecturer-only authoring closed regardless of the flag', () => {
		const { handle, app } = serviceContext(OFF);
		expect(() =>
			handle(app, { id: 'student', getString: () => 'student' }, { action: 'save', id: 'draft0000000001', baseRevision: 2 }),
		).toThrow('Builder hanya tersedia untuk dosen');
	});
});
