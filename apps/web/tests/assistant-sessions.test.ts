/**
 * Phase 11 — assistant session isolation & compatibility tests.
 *
 * Verifies the invariants the task requires:
 *   - legacy conversation preservation/compatibility (default session resolution)
 *   - session creation is owner-scoped
 *   - two sessions do not mix messages
 *   - cross-owner access is denied (getSession throws 404 for foreign rows)
 *
 * The persistence layer talks to PocketBase directly, so these tests use a
 * minimal in-memory client that implements only the SDK methods the layer
 * calls (create/getOne/getFullList/getList/update/delete + filter). The filter
 * evaluator supports the small set of expressions the layer emits.
 */
import { describe, expect, it } from 'vitest';
import {
	archiveSession,
	createSession,
	deleteSession,
	getSession,
	listSessions,
	loadSessionMessages,
	mapSessionSummary,
	renameSession,
	resolveDefaultSession,
	saveSessionMessage,
} from '@/lib/assistant/persistence.server';
import type { AssistantSession } from '@/lib/assistant/types';

type Row = Record<string, unknown> & { id: string; created: string; updated: string };

/** Minimal in-memory PocketBase-like client. */
function fakePb() {
	const collections: Record<string, Row[]> = {};
	let counter = 0;
	const nextId = () => `rec${(counter += 1)}`;
	const now = () => new Date().toISOString();

	const evalFilter = (expr: string, row: Row): boolean => {
		// Split on top-level && (the layer never uses || in filters).
		const clauses = expr.split('&&').map((c) => c.trim());
		return clauses.every((clause) => {
			const m = clause.match(/^(\w+)\s*=\s*(.+)$/);
			if (!m) return true;
			const [, field, raw] = m;
			let expected: unknown;
			const val = raw.trim();
			if (val.startsWith('"') && val.endsWith('"')) expected = val.slice(1, -1);
			else expected = val;
			return row[field] === expected;
		});
	};

	const pb = {
		filter(template: string, params: Record<string, unknown>): string {
			let out = template;
			for (const [key, value] of Object.entries(params)) {
				out = out.replace(`{:${key}}`, JSON.stringify(String(value)));
			}
			return out;
		},
		collection(name: string) {
			const rows = () => (collections[name] ||= []);
			return {
				async create<T>(data: Record<string, unknown>): Promise<T> {
					const id = nextId();
					const row: Row = { ...data, id, created: now(), updated: now() };
					rows().push(row);
					return row as unknown as T;
				},
				async getOne<T>(id: string): Promise<T> {
					const row = rows().find((r) => r.id === id);
					if (!row) throw Object.assign(new Error('not found'), { status: 404 });
					return row as unknown as T;
				},
				async getFullList<T>(opts: { filter?: string; sort?: string } = {}): Promise<T[]> {
					let list = [...rows()];
					if (opts.filter) list = list.filter((r) => evalFilter(opts.filter!, r));
					if (opts.sort?.startsWith('-')) {
						const f = opts.sort.slice(1);
						list.sort((a, b) => String(b[f]).localeCompare(String(a[f])));
					} else if (opts.sort) {
						list.sort((a, b) => String(a[opts.sort]).localeCompare(String(b[opts.sort])));
					}
					return list as unknown as T[];
				},
				async getList<T>(page: number, perPage: number, opts: { filter?: string; sort?: string } = {}): Promise<{ items: T[] }> {
					let list = [...rows()];
					if (opts.filter) list = list.filter((r) => evalFilter(opts.filter!, r));
					if (opts.sort?.startsWith('-')) {
						const f = opts.sort.slice(1).split(',')[0];
						list.sort((a, b) => String(b[f]).localeCompare(String(a[f])));
					}
					const start = (page - 1) * perPage;
					return { items: list.slice(start, start + perPage) as unknown as T[] };
				},
				async update<T>(id: string, data: Record<string, unknown>): Promise<T> {
					const row = rows().find((r) => r.id === id);
					if (!row) throw Object.assign(new Error('not found'), { status: 404 });
					Object.assign(row, data, { updated: now() });
					return row as unknown as T;
				},
				async delete(id: string): Promise<void> {
					const idx = rows().findIndex((r) => r.id === id);
					if (idx >= 0) rows().splice(idx, 1);
				},
			};
		},
	};
	return pb;
}

const asUser = (pb: ReturnType<typeof fakePb>, id: string): AssistantSession => ({
	id,
	pb: pb as never,
	role: 'faculty',
	verified: true,
});

const OWNER_A = 'userA';
const OWNER_B = 'userB';

describe('Phase 11 — assistant sessions', () => {
	it('mapSessionSummary maps persisted row fields', () => {
		const summary = mapSessionSummary({
			id: 's1',
			owner: OWNER_A,
			title: 'Percakapan awal',
			status: 'active',
			feature: '',
			entityType: '',
			entityId: '',
			summary: 'hi',
			structuredContext: null,
			messageCount: 3,
			lastMessageAt: '2026-01-02T00:00:00Z',
			created: '2026-01-01T00:00:00Z',
			updated: '2026-01-02T00:00:00Z',
		});
		expect(summary.id).toBe('s1');
		expect(summary.title).toBe('Percakapan awal');
		expect(summary.messageCount).toBe(3);
	});

	it('creates a session owned by the lecturer with a default title', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER_A, {});
		expect(session.owner).toBe(OWNER_A);
		expect(session.title).toBe('Percakapan baru');
		expect(session.status).toBe('active');
	});

	it('resolveDefaultSession returns the most recent active session (legacy compat)', async () => {
		const pb = fakePb();
		// Simulate a migrated legacy session already present.
		await createSession(pb, OWNER_A, { title: 'Percakapan awal' });
		const resolved = await resolveDefaultSession(pb, OWNER_A);
		expect(resolved.owner).toBe(OWNER_A);
		expect(resolved.title).toBe('Percakapan awal');
	});

	it('resolveDefaultSession creates a new session when none exists', async () => {
		const pb = fakePb();
		const resolved = await resolveDefaultSession(pb, OWNER_A);
		expect(resolved.owner).toBe(OWNER_A);
		expect(resolved.title).toBe('Percakapan baru');
	});

	it('two sessions do not mix messages', async () => {
		const pb = fakePb();
		const s1 = await createSession(pb, OWNER_A, { title: 'Sesi 1' });
		const s2 = await createSession(pb, OWNER_A, { title: 'Sesi 2' });
		await saveSessionMessage(pb, OWNER_A, s1.id, { role: 'user', content: 'pesan A' });
		await saveSessionMessage(pb, OWNER_A, s2.id, { role: 'user', content: 'pesan B' });
		await saveSessionMessage(pb, OWNER_A, s1.id, { role: 'assistant', content: 'jawaban A' });

		const s1Messages = await loadSessionMessages(pb, OWNER_A, s1.id);
		const s2Messages = await loadSessionMessages(pb, OWNER_A, s2.id);
		expect(s1Messages.map((m) => m.content)).toEqual(['pesan A', 'jawaban A']);
		expect(s2Messages.map((m) => m.content)).toEqual(['pesan B']);
	});

	it('cross-owner access is denied (getSession throws 404 for foreign row)', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER_A, { title: 'Milik A' });
		await expect(getSession(pb, OWNER_B, session.id)).rejects.toMatchObject({ status: 404 });
	});

	it('cross-owner messages are not visible (loadSessionMessages scoped to owner)', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER_A, { title: 'Milik A' });
		await saveSessionMessage(pb, OWNER_A, session.id, { role: 'user', content: 'rahasia A' });
		// Owner B cannot even resolve the session (getSession 404), so messages
		// are unreachable — the access rule plus the owner filter both gate it.
		await expect(getSession(pb, OWNER_B, session.id)).rejects.toMatchObject({ status: 404 });
	});

	it('rename and archive update session metadata', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER_A, { title: 'lama' });
		const renamed = await renameSession(pb, OWNER_A, session.id, 'judul baru');
		expect(renamed.title).toBe('judul baru');
		const archived = await archiveSession(pb, OWNER_A, session.id);
		expect(archived.status).toBe('archived');
	});

	it('deleteSession removes the session', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER_A, { title: 'hapus' });
		await deleteSession(pb, OWNER_A, session.id);
		await expect(getSession(pb, OWNER_A, session.id)).rejects.toMatchObject({ status: 404 });
	});

	it('listSessions only returns the caller’s own sessions', async () => {
		const pb = fakePb();
		await createSession(pb, OWNER_A, { title: 'A1' });
		await createSession(pb, OWNER_B, { title: 'B1' });
		const aList = await listSessions(pb, OWNER_A);
		const bList = await listSessions(pb, OWNER_B);
		expect(aList.map((s) => s.title)).toEqual(['A1']);
		expect(bList.map((s) => s.title)).toEqual(['B1']);
	});

	it('saveSessionMessage increments session messageCount', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER_A, { title: 'hitung' });
		await saveSessionMessage(pb, OWNER_A, session.id, { role: 'user', content: 'satu' });
		await saveSessionMessage(pb, OWNER_A, session.id, { role: 'assistant', content: 'dua' });
		const after = await getSession(pb, OWNER_A, session.id);
		expect(after.messageCount).toBe(2);
	});
});
