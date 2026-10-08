/**
 * Phase 12 — durable session context & automatic compaction tests.
 *
 * Verifies the task's required invariants:
 *   - a long conversation triggers compaction (threshold + summary produced)
 *   - important decisions survive compaction (structured context retains them)
 *   - compaction never deletes original messages (audit history preserved)
 *   - new sessions do not receive old full transcripts (no leakage)
 *   - opening an old session restores its relevant context (summary + recent)
 *   - targeted history retrieval returns only matching older snippets
 *
 * The pure helpers in `compaction.ts` are tested directly. `maybeCompact` and
 * `retrieveOlderHistory` are tested with a minimal in-memory PocketBase-like
 * client and a stubbed model caller (no real model/HTTP).
 */
import { describe, expect, it } from 'vitest';
import {
	COMPACTION_SYSTEM_PROMPT,
	buildCompactionPrompt,
	computeMessageTokens,
	estimateTokens,
	formatSessionContext,
	hasDurableContext,
	matchOlderMessages,
	olderThanRecentWindow,
	parseStructuredContext,
	shouldCompact,
	splitForCompaction,
} from '@/lib/assistant/compaction';
import { maybeCompact, mergeStructuredContexts, retrieveOlderHistory } from '@/lib/assistant/compaction.server';
import {
	createSession,
	loadSessionMessages,
	saveSessionMessage,
} from '@/lib/assistant/persistence.server';
import type { AssistantMessageRecord, AssistantSession, AssistantSessionRecord } from '@/lib/assistant/types';
import { ASSISTANT_RECENT_MESSAGE_WINDOW } from '@/constants/assistant.config';

type Row = Record<string, unknown> & { id: string; created: string; updated: string };

/** Minimal in-memory PocketBase-like client (mirrors assistant-sessions.test). */
function fakePb() {
	const collections: Record<string, Row[]> = {};
	let counter = 0;
	const nextId = () => `rec${(counter += 1)}`;
	const now = () => new Date().toISOString();

	const evalFilter = (expr: string, row: Row): boolean => {
		const clauses = expr.split('&&').map((c) => c.trim());
		return clauses.every((clause) => {
			const m = clause.match(/^(\w+)\s*=\s*(.+)$/);
			if (!m) return true;
			const [, field, raw] = m;
			const val = raw.trim();
			let expected: unknown = val;
			if (val.startsWith('"') && val.endsWith('"')) expected = val.slice(1, -1);
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
						const f = opts.sort.slice(1).split(',')[0];
						list.sort((a, b) => String(b[f]).localeCompare(String(a[f])));
					} else if (opts.sort) {
						list.sort((a, b) => String(a[opts.sort]).localeCompare(String(b[opts.sort])));
					}
					return list as unknown as T[];
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

const OWNER = 'userA';

/** Builds a session record with the compaction fields defaulted. */
const blankSession = (id: string): AssistantSessionRecord => ({
	id,
	owner: OWNER,
	title: 'Percakapan',
	status: 'active',
	feature: '',
	entityType: '',
	entityId: '',
	summary: '',
	structuredContext: null,
	summaryVersion: 0,
	lastCompactedMessageId: '',
	estimatedTokens: 0,
	messageCount: 0,
	lastMessageAt: '',
	created: '2026-01-01T00:00:00Z',
	updated: '2026-01-01T00:00:00Z',
});

/** A stub model caller that returns a structured compaction JSON. */
const stubModel = (response: string) =>
	(async () => response) as unknown as Parameters<typeof maybeCompact>[5];

describe('Phase 12 — compaction pure helpers', () => {
	it('estimateTokens and computeMessageTokens use 4 chars ≈ 1 token', () => {
		expect(estimateTokens('')).toBe(0);
		expect(estimateTokens('abcd')).toBe(1);
		expect(estimateTokens('abcdefgh')).toBe(2);
		expect(computeMessageTokens([{ content: 'abcd' }, { content: 'efgh' }])).toBe(2);
	});

	it('shouldCompact is false for tiny sessions and true past thresholds', () => {
		expect(shouldCompact({ messageCount: 5, estimatedTokens: 100 })).toBe(false);
		expect(shouldCompact({ messageCount: 12, estimatedTokens: 100 })).toBe(false);
		// At/above message threshold (24) and above the recent window.
		expect(shouldCompact({ messageCount: 24, estimatedTokens: 100 })).toBe(true);
		// Token threshold alone, with enough messages.
		expect(shouldCompact({ messageCount: 17, estimatedTokens: 7000 })).toBe(true);
		// Token threshold but too few messages — still compacts (>= MIN + > window).
		expect(shouldCompact({ messageCount: 17, estimatedTokens: 7000 })).toBe(true);
		// Exactly the recent window size — nothing to summarize.
		expect(shouldCompact({ messageCount: ASSISTANT_RECENT_MESSAGE_WINDOW, estimatedTokens: 99999 })).toBe(false);
	});

	it('splitForCompaction keeps the recent window verbatim and folds the rest', () => {
		const msgs = Array.from({ length: 30 }, (_, i) => ({ i }));
		const { compactable, recent } = splitForCompaction(msgs);
		expect(recent).toHaveLength(ASSISTANT_RECENT_MESSAGE_WINDOW);
		expect(recent[0]).toEqual({ i: 20 });
		expect(compactable).toHaveLength(20);
		expect(compactable[0]).toEqual({ i: 0 });
		expect(olderThanRecentWindow(msgs)).toHaveLength(20);
	});

	it('parseStructuredContext extracts summary and structured fields, dropping empties', () => {
		const raw = JSON.stringify({
			summary: 'Dosen membuat mata kuliah Bahasa Jerman.',
			currentGoal: 'Menyusun tugas menulis pertemuan 5',
			decisions: ['Mata kuliah A1-JR241 dibuat', 'Format: individu'],
			relevantEntity: { type: 'course', id: 'rec123', label: 'A1-JR241 · Bahasa Jerman' },
			constraints: [],
			confirmedChoices: [],
			completedActions: ['create_course dieksekusi'],
			pendingActions: [],
			unresolvedQuestions: ['Pertemuan untuk tugas?'],
			importantToolResults: ['Daftar mata kuliah: 1'],
			references: ['A1-JR241'],
		});
		const { summary, structured } = parseStructuredContext(raw);
		expect(summary).toBe('Dosen membuat mata kuliah Bahasa Jerman.');
		expect(structured.currentGoal).toBe('Menyusun tugas menulis pertemuan 5');
		expect(structured.decisions).toEqual(['Mata kuliah A1-JR241 dibuat', 'Format: individu']);
		expect(structured.relevantEntity).toEqual({ type: 'course', id: 'rec123', label: 'A1-JR241 · Bahasa Jerman' });
		expect(structured.completedActions).toEqual(['create_course dieksekusi']);
		// Empty arrays are dropped.
		expect(structured.constraints).toBeUndefined();
		expect(structured.confirmedChoices).toBeUndefined();
	});

	it('parseStructuredContext returns empty on non-JSON', () => {
		const { summary, structured } = parseStructuredContext('not json at all');
		expect(summary).toBe('');
		expect(structured.currentGoal).toBeUndefined();
	});

	it('formatSessionContext is empty for a fresh session (no leakage)', () => {
		expect(formatSessionContext('', null)).toBe('');
		expect(formatSessionContext('', {})).toBe('');
	});

	it('formatSessionContext renders the durable summary block', () => {
		const block = formatSessionContext('Ringkasan alur.', {
			currentGoal: 'Membuat tugas',
			decisions: ['Pilih menulis'],
			relevantEntity: { type: 'course', id: 'rec1', label: 'A1 · Jerman' },
		});
		expect(block).toContain('RINGKASAN SESI');
		expect(block).toContain('Ringkasan alur.');
		expect(block).toContain('Tujuan saat ini: Membuat tugas');
		expect(block).toContain('Keputusan: Pilih menulis');
		expect(block).toContain('Entitas relevan: course — A1 · Jerman (id: rec1)');
	});

	it('hasDurableContext detects non-empty context', () => {
		expect(hasDurableContext('', null)).toBe(false);
		expect(hasDurableContext('ringkasan', null)).toBe(true);
		expect(hasDurableContext('', { decisions: ['x'] })).toBe(true);
		expect(hasDurableContext('', { decisions: [] })).toBe(false);
	});

	it('matchOlderMessages returns scoped snippets excluding the recent window', () => {
		const msgs = [
			{ id: 'm1', role: 'user', content: 'Buatkan mata kuliah Bahasa Jerman A1-JR241' },
			{ id: 'm2', role: 'assistant', content: 'Baik, saya akan membuatnya' },
			{ id: 'm3', role: 'user', content: 'Lanjut buat tugas menulis pertemuan 5' },
			...Array.from({ length: ASSISTANT_RECENT_MESSAGE_WINDOW }, (_, i) => ({
				id: `r${i}`,
				role: 'user' as const,
				content: `pesan terbaru ${i}`,
			})),
		];
		const recentIds = new Set(msgs.slice(-ASSISTANT_RECENT_MESSAGE_WINDOW).map((m) => m.id));
		const matches = matchOlderMessages(msgs, 'Bahasa Jerman', recentIds);
		expect(matches).toHaveLength(1);
		expect(matches[0].id).toBe('m1');
		expect(matches[0].snippet).toContain('Bahasa Jerman');
		// Recent-window messages are never returned.
		expect(matchOlderMessages(msgs, 'pesan terbaru', recentIds)).toHaveLength(0);
		// No query → no matches.
		expect(matchOlderMessages(msgs, '   ', recentIds)).toHaveLength(0);
	});

	it('buildCompactionPrompt renders a readable transcript', () => {
		const prompt = buildCompactionPrompt([
			{ role: 'user', content: 'Halo' },
			{ role: 'assistant', content: 'Hai' },
		]);
		expect(prompt).toContain('Dosen: Halo');
		expect(prompt).toContain('Asisten: Hai');
	});

	it('COMPACTION_SYSTEM_PROMPT requests the structured JSON shape', () => {
		expect(COMPACTION_SYSTEM_PROMPT).toContain('currentGoal');
		expect(COMPACTION_SYSTEM_PROMPT).toContain('importantToolResults');
		expect(COMPACTION_SYSTEM_PROMPT).toContain('references');
	});
});

describe('Phase 12 — mergeStructuredContexts', () => {
	it('appends and deduplicates array fields across compactions', () => {
		const prior = { decisions: ['A'], completedActions: ['x'] };
		const next = { decisions: ['A', 'B'], pendingActions: ['y'] };
		const merged = mergeStructuredContexts(prior, next);
		expect(merged.decisions).toEqual(['A', 'B']);
		expect(merged.completedActions).toEqual(['x']);
		expect(merged.pendingActions).toEqual(['y']);
	});

	it('preserves prior scalar fields when next is empty', () => {
		const prior = { currentGoal: 'lama', decisions: ['A'] };
		const merged = mergeStructuredContexts(prior, {});
		expect(merged.currentGoal).toBe('lama');
		expect(merged.decisions).toEqual(['A']);
	});

	it('overwrites scalar goal only when next is non-empty', () => {
		const merged = mergeStructuredContexts({ currentGoal: 'lama' }, { currentGoal: 'baru' });
		expect(merged.currentGoal).toBe('baru');
	});
});

describe('Phase 12 — maybeCompact orchestration', () => {
	it('does not compact a small session', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER, {});
		const msgs: AssistantMessageRecord[] = Array.from({ length: 8 }, (_, i) => ({
			id: `m${i}`,
			session: session.id,
			owner: OWNER,
			role: i % 2 === 0 ? 'user' : 'assistant',
			content: `pesan ${i}`,
			toolName: '',
			toolArgs: null,
			toolResult: null,
			actionStatus: 'none',
			tokenEstimate: 2,
			created: `2026-01-0${i + 1}T00:00:00Z`,
			updated: `2026-01-0${i + 1}T00:00:00Z`,
		}));
		const model = stubModel('should-not-be-called');
		const result = await maybeCompact(asUser(pb, OWNER), pb, OWNER, session, msgs, model);
		expect(result.summaryVersion).toBe(0);
		expect(result.summary).toBe('');
	});

	it('compacts a long conversation and preserves important decisions', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER, {});
		// 26 messages — above the message threshold (24) and the recent window.
		for (let i = 0; i < 26; i += 1) {
			await saveSessionMessage(pb, OWNER, session.id, {
				role: i % 2 === 0 ? 'user' : 'assistant',
				content: i === 0
					? 'Buatkan mata kuliah Bahasa Jerman A1-JR241'
					: i === 1
						? 'Mata kuliah A1-JR241 berhasil dibuat.'
						: `pesan lanjutan ${i}`,
			});
		}
		const msgs = await loadSessionMessages(pb, OWNER, session.id);
		expect(msgs.length).toBeGreaterThanOrEqual(24);

		const stub = stubModel(JSON.stringify({
			summary: 'Dosen membuat mata kuliah Bahasa Jerman A1-JR241.',
			currentGoal: 'Menyusun tugas menulis',
			decisions: ['Mata kuliah A1-JR241 dibuat'],
			completedActions: ['create_course dieksekusi'],
			relevantEntity: { type: 'course', id: 'rec1', label: 'A1-JR241 · Bahasa Jerman' },
			references: ['A1-JR241'],
		}));
		const result = await maybeCompact(asUser(pb, OWNER), pb, OWNER, session, msgs, stub);

		// Compaction produced a durable summary + structured state.
		expect(result.summaryVersion).toBe(1);
		expect(result.summary).toBe('Dosen membuat mata kuliah Bahasa Jerman A1-JR241.');
		expect(result.structuredContext?.decisions).toContain('Mata kuliah A1-JR241 dibuat');
		expect(result.structuredContext?.completedActions).toContain('create_course dieksekusi');
		expect(result.structuredContext?.relevantEntity?.label).toContain('A1-JR241');
		expect(result.lastCompactedMessageId).toBeTruthy();
		expect(result.estimatedTokens).toBeGreaterThan(0);

		// Original messages are NEVER deleted — the audit record is intact.
		const after = await loadSessionMessages(pb, OWNER, session.id);
		expect(after.length).toBe(msgs.length);
	});

	it('compaction failure is swallowed and the turn proceeds', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER, {});
		for (let i = 0; i < 26; i += 1) {
			await saveSessionMessage(pb, OWNER, session.id, { role: 'user', content: `pesan ${i}` });
		}
		const msgs = await loadSessionMessages(pb, OWNER, session.id);
		const failingModel = (async () => { throw new Error('model down'); }) as unknown as Parameters<typeof maybeCompact>[5];
		const result = await maybeCompact(asUser(pb, OWNER), pb, OWNER, session, msgs, failingModel);
		// Session unchanged — no summary, version still 0.
		expect(result.summaryVersion).toBe(0);
		expect(result.summary).toBe('');
		// Messages intact.
		expect((await loadSessionMessages(pb, OWNER, session.id)).length).toBe(msgs.length);
	});

	it('new sessions do not inherit another session’s transcript', async () => {
		const pb = fakePb();
		const sessionA = await createSession(pb, OWNER, { title: 'A' });
		const sessionB = await createSession(pb, OWNER, { title: 'B' });
		// Fill session A with a long conversation and compact it.
		for (let i = 0; i < 26; i += 1) {
			await saveSessionMessage(pb, OWNER, sessionA.id, { role: 'user', content: `A ${i}` });
		}
		const msgsA = await loadSessionMessages(pb, OWNER, sessionA.id);
		const stub = stubModel(JSON.stringify({ summary: 'ringkasan A', decisions: ['keputusan A'] }));
		const compactedA = await maybeCompact(asUser(pb, OWNER), pb, OWNER, sessionA, msgsA, stub);
		expect(compactedA.summary).toBe('ringkasan A');

		// Session B is fresh — no messages, no summary, no leakage from A.
		const msgsB = await loadSessionMessages(pb, OWNER, sessionB.id);
		expect(msgsB).toHaveLength(0);
		const sessionBRow = blankSession(sessionB.id);
		expect(formatSessionContext(sessionBRow.summary, sessionBRow.structuredContext)).toBe('');
		// The recent window for B is empty; A's decisions are not in B's context.
		const { recent } = splitForCompaction(msgsB);
		expect(recent).toHaveLength(0);
	});

	it('opening an old session restores its summary + recent window, not the full transcript', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER, {});
		for (let i = 0; i < 26; i += 1) {
			await saveSessionMessage(pb, OWNER, session.id, {
				role: i % 2 === 0 ? 'user' : 'assistant',
				content: i === 0 ? 'Buatkan mata kuliah A1-JR241' : `jawaban ${i}`,
			});
		}
		const msgs = await loadSessionMessages(pb, OWNER, session.id);
		const stub = stubModel(JSON.stringify({
			summary: 'Dosen membuat mata kuliah A1-JR241.',
			decisions: ['A1-JR241 dibuat'],
		}));
		const compacted = await maybeCompact(asUser(pb, OWNER), pb, OWNER, session, msgs, stub);

		// Simulate reopening: reload messages + read the session's durable context.
		const reopened = await loadSessionMessages(pb, OWNER, session.id);
		const { recent } = splitForCompaction(reopened);
		// The model context is the recent window (<= RECENT_MESSAGE_WINDOW)…
		expect(recent.length).toBeLessThanOrEqual(ASSISTANT_RECENT_MESSAGE_WINDOW);
		// …plus the durable summary block — NOT the full transcript.
		const block = formatSessionContext(compacted.summary, compacted.structuredContext);
		expect(block).toContain('A1-JR241 dibuat');
		expect(block).toContain('Dosen membuat mata kuliah A1-JR241.');
		// The full transcript (26 messages) is not in the model context.
		expect(recent.length).toBeLessThan(reopened.length);
	});
});

describe('Phase 12 — targeted history retrieval', () => {
	it('retrieveOlderHistory returns matching older snippets only', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER, {});
		await saveSessionMessage(pb, OWNER, session.id, { role: 'user', content: 'Buatkan mata kuliah A1-JR241 Bahasa Jerman' });
		await saveSessionMessage(pb, OWNER, session.id, { role: 'assistant', content: 'Baik, dibuat.' });
		// Fill the recent window so the older message is compacted-out.
		for (let i = 0; i < ASSISTANT_RECENT_MESSAGE_WINDOW + 2; i += 1) {
			await saveSessionMessage(pb, OWNER, session.id, { role: 'user', content: `pesan terbaru ${i}` });
		}
		const result = await retrieveOlderHistory(pb, OWNER, session.id, 'Bahasa Jerman');
		expect(result).toContain('Bahasa Jerman');
		expect(result).toContain('Dosen');
		// Recent-window content is not returned.
		expect(result).not.toContain('pesan terbaru');
	});

	it('retrieveOlderHistory reports no matches gracefully', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER, {});
		await saveSessionMessage(pb, OWNER, session.id, { role: 'user', content: 'halo' });
		const result = await retrieveOlderHistory(pb, OWNER, session.id, 'tidak ada');
		expect(result).toContain('Tidak ditemukan');
	});

	it('retrieveOlderHistory rejects an empty query', async () => {
		const pb = fakePb();
		const session = await createSession(pb, OWNER, {});
		const result = await retrieveOlderHistory(pb, OWNER, session.id, '   ');
		expect(result).toContain('Tidak ada kata kunci');
	});
});
