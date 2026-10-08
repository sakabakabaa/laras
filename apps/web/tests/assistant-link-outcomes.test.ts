/**
 * link_session_outcomes — assistant mass CPMK/Sub-CPMK/CPL → meeting linkage.
 *
 * Covers: successful confirmed linking, cancellation (no mutation), owner
 * isolation, invalid/missing outcomes or schedule, correct existing-relationship
 * semantics (union-merge preserves existing links), idempotence, and honest
 * error reporting. The pure plan/summary builders and the registry membership
 * are also asserted.
 *
 * The executor is exercised against an in-memory fake PocketBase; the runtime
 * prepare/confirm/reject paths reuse the same fakes plus mocked persistence
 * and audit, mirroring assistant-hardening-runtime.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks for the runtime's server-only dependencies ──────────────────────
const { auditCreate } = vi.hoisted(() => ({ auditCreate: vi.fn(async (data: Record<string, unknown>) => ({ ...data, id: 'audit1' })) }));

vi.mock('@/lib/assistant/model.server', () => ({ collectModel: vi.fn() }));
vi.mock('@/lib/assistant/persistence.server', () => ({
	dismissPendingClarify: vi.fn(async () => {}),
	getSession: vi.fn(async (_pb: unknown, _userId: string, sessionId: string) => ({
		id: sessionId || 'sess1',
		owner: 'dosen1',
	})),
	resolveDefaultSession: vi.fn(async () => ({ id: 'sess1', owner: 'dosen1' })),
	loadSessionMessages: vi.fn(async () => []),
	saveSessionMessage: vi.fn(async (_pb: unknown, _userId: string, _sid: string, data: { role: string; content: string }) => ({
		id: `m${Math.random().toString(36).slice(2, 8)}`,
		...data,
	})),
}));
vi.mock('@/lib/assistant/page-context.server', () => ({
	validateAndAuthorizePageContext: vi.fn(async () => ({ route: '', feature: '', courseRoute: '', course: null })),
}));
vi.mock('@/lib/assistant/page-context', () => ({ deicticCourseId: vi.fn(() => '') }));
vi.mock('@/lib/assistant/logging.server', () => ({
	logAssistantRequest: vi.fn(),
	logAssistantError: vi.fn(),
	logModelRequest: vi.fn(),
	logModelResult: vi.fn(),
	logToolExecution: vi.fn(),
	logConfirmation: vi.fn(),
}));
vi.mock('@/lib/assistant/compaction.server', () => ({
	maybeCompact: vi.fn(async (_u: unknown, _pb: unknown, _uid: string, session: unknown) => session),
	retrieveOlderHistory: vi.fn(async () => ''),
}));
vi.mock('@/lib/assistant/audit.server', () => ({ recordToolAudit: auditCreate }));

import { collectModel } from '@/lib/assistant/model.server';
import { saveSessionMessage } from '@/lib/assistant/persistence.server';
import { handleSend, handleConfirm, handleReject } from '@/lib/assistant/runtime.server';
import {
	prepareLinkPlan,
	cleanLinkSummary,
	executeLinkSessionOutcomes,
	TOOL_REGISTRY,
} from '@/lib/assistant/tools.server';
import { WRITE_TOOLS, CONFIRMATION_REQUIRED_TOOLS } from '@/lib/assistant/types';
import type { AssistantSession, PreparedLinkPlan } from '@/lib/assistant/types';

// ── Fake PocketBase ────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeFakePb(store: Record<string, Row[]>) {
	const pb = {
		collection: (name: string) => {
			const rows = store[name] || [];
			return {
				getFullList: async (_opts?: Record<string, unknown>) => {
					// honor a simple course filter when present
					return [...rows];
				},
				getOne: async (id: string) => {
					const row = rows.find((r) => r.id === id);
					if (!row) throw Object.assign(new Error('not found'), { status: 404 });
					return { ...row };
				},
				update: async (id: string, data: Record<string, unknown>) => {
					const row = rows.find((r) => r.id === id);
					if (!row) throw Object.assign(new Error('not found'), { status: 404 });
					Object.assign(row, data);
					return { ...row };
				},
				create: async (data: Record<string, unknown>) => {
					const rec = { id: `new${rows.length + 1}`, ...data };
					rows.push(rec);
					return rec;
				},
			};
		},
		filter: (template: string, params: Record<string, unknown>) => {
			let out = template;
			for (const [key, value] of Object.entries(params)) {
				out = out.replace(`{:${key}}`, JSON.stringify(String(value)));
			}
			return out;
		},
	};
	return pb as unknown as import('pocketbase').default;
}

const UID = 'dosen1';
const OTHER = 'dosen2';
const COURSE_ID = 'course000000001'; // 15 chars — matches PB id pattern

function seedStore(): Record<string, Row[]> {
	const cpl = [{ id: 'cpl1', owner: UID, course: COURSE_ID, code: 'CPL-1', description: 'CPL 1', order: 0 }];
	const cpmk = [
		{ id: 'cpmk1', owner: UID, course: COURSE_ID, code: 'CPMK-1', description: 'CPMK 1', order: 0, cpl: 'cpl1' },
		{ id: 'cpmk2', owner: UID, course: COURSE_ID, code: 'CPMK-2', description: 'CPMK 2', order: 1, cpl: 'cpl1' },
	];
	const sub = [
		{ id: 'sub1', owner: UID, course: COURSE_ID, code: '1.1', description: 'Sub 1.1', order: 0, cpmk: 'cpmk1' },
		{ id: 'sub2', owner: UID, course: COURSE_ID, code: '1.2', description: 'Sub 1.2', order: 1, cpmk: 'cpmk1' },
		{ id: 'sub3', owner: UID, course: COURSE_ID, code: '2.1', description: 'Sub 2.1', order: 2, cpmk: 'cpmk2' },
		{ id: 'sub4', owner: UID, course: COURSE_ID, code: '2.2', description: 'Sub 2.2', order: 3, cpmk: 'cpmk2' },
	];
	const sessions = [
		{ id: 'sess1', owner: UID, course: COURSE_ID, week: 1, title: 'Pertemuan 1', subCpmks: [], cpmks: [], cpls: [] },
		{ id: 'sess2', owner: UID, course: COURSE_ID, week: 2, title: 'Pertemuan 2', subCpmks: [], cpmks: [], cpls: [] },
	];
	const courses = [{ id: COURSE_ID, owner: UID, title: 'Schreiben A1', code: 'JR242' }];
	return {
		courses,
		cpl,
		cpmk,
		sub_cpmk: sub,
		class_sessions: sessions,
		assistant_messages: [],
		assistant_tool_audits: [],
	};
}

const asSession = (pb: import('pocketbase').default): AssistantSession => ({
	id: UID,
	pb,
	role: 'faculty',
	verified: true,
});

beforeEach(() => {
	vi.clearAllMocks();
});

// ── Registry & classification ─────────────────────────────────────────────

describe('link_session_outcomes — registry & classification', () => {
	it('is registered as a write tool requiring confirmation', () => {
		const def = TOOL_REGISTRY.get('link_session_outcomes');
		expect(def).toBeDefined();
		expect(def?.permission).toBe('write');
		expect(def?.requiresConfirmation).toBe(true);
		expect(WRITE_TOOLS.has('link_session_outcomes')).toBe(true);
		expect(CONFIRMATION_REQUIRED_TOOLS.has('link_session_outcomes')).toBe(true);
	});

	it('requires a courseId argument', () => {
		const def = TOOL_REGISTRY.get('link_session_outcomes')!;
		expect(def.inputSchema.required).toContain('courseId');
	});
});

// ── prepareLinkPlan ───────────────────────────────────────────────────────

describe('prepareLinkPlan — distribution & preview', () => {
	it('distributes Sub-CPMK contiguously across meetings and derives CPMK/CPL', async () => {
		const pb = makeFakePb(seedStore());
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareLinkPlan(pb, UID, course);
		expect('missing' in plan).toBe(false);
		const p = plan as PreparedLinkPlan;
		expect(p.sessionCount).toBe(2);
		expect(p.outcomeCount).toBe(4);
		// 4 sub-cpmk across 2 sessions → 2 each, contiguous in order
		expect(p.links[0].subCpmks).toEqual(['sub1', 'sub2']);
		expect(p.links[1].subCpmks).toEqual(['sub3', 'sub4']);
		// CPMK/CPL derived from parents
		expect(p.links[0].cpmks).toEqual(['cpmk1']);
		expect(p.links[0].cpls).toEqual(['cpl1']);
		expect(p.links[1].cpmks).toEqual(['cpmk2']);
		expect(p.links[1].cpls).toEqual(['cpl1']);
	});

	it('returns missing:sessions when no weekly schedule exists', async () => {
		const store = seedStore();
		store.class_sessions = [];
		const pb = makeFakePb(store);
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareLinkPlan(pb, UID, course);
		expect(plan).toEqual({ missing: 'sessions' });
	});

	it('returns missing:outcomes when no Sub-CPMK exists', async () => {
		const store = seedStore();
		store.sub_cpmk = [];
		const pb = makeFakePb(store);
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareLinkPlan(pb, UID, course);
		expect(plan).toEqual({ missing: 'outcomes' });
	});

	it('preview lists every meeting with its assigned Sub-CPMK codes', () => {
		const plan: PreparedLinkPlan = {
			courseId: COURSE_ID,
			courseLabel: 'JR242 · Schreiben A1',
			sessionCount: 2,
			outcomeCount: 4,
			links: [
				{ sessionId: 'sess1', week: 1, title: 'Pertemuan 1', subCpmks: ['sub1', 'sub2'], subCpmkCodes: ['1.1', '1.2'], cpmks: ['cpmk1'], cpls: ['cpl1'] },
				{ sessionId: 'sess2', week: 2, title: 'Pertemuan 2', subCpmks: ['sub3', 'sub4'], subCpmkCodes: ['2.1', '2.2'], cpmks: ['cpmk2'], cpls: ['cpl1'] },
			],
		};
		const summary = cleanLinkSummary(plan);
		expect(summary).toContain('4 Sub-CPMK');
		expect(summary).toContain('2 pertemuan');
		expect(summary).toContain('Minggu 1 — Pertemuan 1: 1.1, 1.2');
		expect(summary).toContain('Minggu 2 — Pertemuan 2: 2.1, 2.2');
		expect(summary).toContain('dipertahankan');
	});
});

// ── executeLinkSessionOutcomes ────────────────────────────────────────────

describe('executeLinkSessionOutcomes — confirmed execution', () => {
	it('writes the proposed links to each session', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareLinkPlan(pb, UID, course)) as PreparedLinkPlan;
		const result = await executeLinkSessionOutcomes(pb, UID, { courseId: COURSE_ID, draft: plan });
		expect(result.link).toBe(`/app/courses/${COURSE_ID}`);
		const s1 = store.class_sessions.find((s) => s.id === 'sess1')!;
		const s2 = store.class_sessions.find((s) => s.id === 'sess2')!;
		expect(s1.subCpmks).toEqual(['sub1', 'sub2']);
		expect(s1.cpmks).toEqual(['cpmk1']);
		expect(s1.cpls).toEqual(['cpl1']);
		expect(s2.subCpmks).toEqual(['sub3', 'sub4']);
		expect(s2.cpmks).toEqual(['cpmk2']);
	});

	it('preserves existing links (union-merge, no overwrite)', async () => {
		const store = seedStore();
		// Pre-existing manual link on session 1
		store.class_sessions[0].subCpmks = ['sub3'];
		store.class_sessions[0].cpmks = ['cpmk2'];
		const pb = makeFakePb(store);
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareLinkPlan(pb, UID, course)) as PreparedLinkPlan;
		await executeLinkSessionOutcomes(pb, UID, { courseId: COURSE_ID, draft: plan });
		const s1 = store.class_sessions.find((s) => s.id === 'sess1')!;
		// Existing 'sub3' kept, new 'sub1','sub2' appended (no duplicates)
		expect(s1.subCpmks).toEqual(['sub3', 'sub1', 'sub2']);
		expect(s1.cpmks).toEqual(['cpmk2', 'cpmk1']);
	});

	it('is idempotent — re-running the same plan adds nothing new', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareLinkPlan(pb, UID, course)) as PreparedLinkPlan;
		await executeLinkSessionOutcomes(pb, UID, { courseId: COURSE_ID, draft: plan });
		const after1 = JSON.stringify(store.class_sessions);
		await executeLinkSessionOutcomes(pb, UID, { courseId: COURSE_ID, draft: plan });
		const after2 = JSON.stringify(store.class_sessions);
		expect(after2).toBe(after1);
	});

	it('denies a foreign course (owner isolation)', async () => {
		const store = seedStore();
		// Course owned by another lecturer
		store.courses[0].owner = OTHER;
		const pb = makeFakePb(store);
		const plan: PreparedLinkPlan = {
			courseId: COURSE_ID,
			courseLabel: 'JR242',
			sessionCount: 2,
			outcomeCount: 4,
			links: [
				{ sessionId: 'sess1', week: 1, title: '', subCpmks: ['sub1'], subCpmkCodes: ['1.1'], cpmks: ['cpmk1'], cpls: ['cpl1'] },
			],
		};
		await expect(
			executeLinkSessionOutcomes(pb, UID, { courseId: COURSE_ID, draft: plan }),
		).rejects.toThrow(/tidak ditemukan atau bukan milik Anda/);
		// No session was modified
		expect(store.class_sessions[0].subCpmks).toEqual([]);
	});

	it('filters out stale/foreign outcome ids at execution time', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareLinkPlan(pb, UID, course)) as PreparedLinkPlan;
		// Simulate a Sub-CPMK deleted between prepare and confirm
		store.sub_cpmk = store.sub_cpmk.filter((s) => s.id !== 'sub2');
		await executeLinkSessionOutcomes(pb, UID, { courseId: COURSE_ID, draft: plan });
		const s1 = store.class_sessions.find((s) => s.id === 'sess1')!;
		// 'sub2' was filtered out; only 'sub1' applied
		expect(s1.subCpmks).toEqual(['sub1']);
	});

	it('skips sessions no longer present and reports honestly', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareLinkPlan(pb, UID, course)) as PreparedLinkPlan;
		// Remove one session between prepare and confirm
		store.class_sessions = store.class_sessions.filter((s) => s.id !== 'sess2');
		const result = await executeLinkSessionOutcomes(pb, UID, { courseId: COURSE_ID, draft: plan });
		expect(result.text).toContain('1 pertemuan');
		expect(result.text).toContain('1 pertemuan tidak ditemukan dilewati');
	});

	it('reports an honest error when the plan is missing', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		await expect(
			executeLinkSessionOutcomes(pb, UID, { courseId: COURSE_ID }),
		).rejects.toThrow(/Rencana penautan tidak tersedia/);
	});

	it('reports an honest error when courseId is empty', async () => {
		const pb = makeFakePb(seedStore());
		await expect(
			executeLinkSessionOutcomes(pb, UID, {}),
		).rejects.toThrow(/Mata kuliah tujuan wajib diisi/);
	});
});

// ── Runtime integration: prepare → confirm / reject ──────────────────────

describe('link_session_outcomes — runtime prepare/confirm/reject', () => {
	it('surfaces a pending confirmation with a preview when data is complete', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const session = asSession(pb);
		// Model emits a link_session_outcomes tool call.
		vi.mocked(collectModel).mockResolvedValueOnce(
			`Saya akan menautkan capaian ke pertemuan.\n[[TOOL_CALL]]\n{"name":"link_session_outcomes","args":{"courseId":"${COURSE_ID}"}}\n[[/TOOL_CALL]]`,
		);
		vi.mocked(saveSessionMessage).mockResolvedValueOnce({ id: 'msg1', role: 'assistant', content: '' } as never);
		const result = await handleSend(session, 'tautkan CPMK ke pertemuan', '', '', '', [], '', {});
		expect(result.pendingAction).toBeDefined();
		expect(result.pendingAction?.tool).toBe('link_session_outcomes');
		expect(result.text).toContain('Rincian penautan');
		expect(result.text).toContain('Minggu 1');
	});

	it('asks for clarification when no schedule exists', async () => {
		const store = seedStore();
		store.class_sessions = [];
		const pb = makeFakePb(store);
		const session = asSession(pb);
		vi.mocked(collectModel).mockResolvedValueOnce(
			`[[TOOL_CALL]]\n{"name":"link_session_outcomes","args":{"courseId":"${COURSE_ID}"}}\n[[/TOOL_CALL]]`,
		);
		vi.mocked(saveSessionMessage).mockResolvedValueOnce({ id: 'msg1', role: 'assistant', content: '' } as never);
		const result = await handleSend(session, 'tautkan', '', '', '', [], '', {});
		expect(result.clarification).toBeDefined();
		expect(result.pendingAction).toBeUndefined();
		expect(result.text).toContain('data RPS belum lengkap');
	});

	it('confirm executes the plan and records a confirmed audit', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const session = asSession(pb);
		// Build a plan via prepareLinkPlan, then store it as a pending message.
		const course = (await pb.collection('courses').getOne(COURSE_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareLinkPlan(pb, UID, course)) as PreparedLinkPlan;
		store.assistant_messages.push({
			id: 'msg1',
			owner: UID,
			session: 'sess1',
			role: 'assistant',
			content: cleanLinkSummary(plan),
			toolName: 'link_session_outcomes',
			toolArgs: { courseId: COURSE_ID, courseLabel: 'JR242 · Schreiben A1', sessionCount: 2, outcomeCount: 4 },
			toolResult: { draft: plan },
			actionStatus: 'pending',
		});
		vi.mocked(saveSessionMessage).mockResolvedValueOnce({ id: 'msg2', role: 'assistant', content: '' } as never);
		const result = await handleConfirm(session, 'msg1');
		expect(result.text).toContain('berhasil diterapkan');
		expect(store.class_sessions[0].subCpmks).toEqual(['sub1', 'sub2']);
		const auditCall = auditCreate.mock.calls.at(-1)?.[4] as Record<string, unknown>;
		expect(auditCall).toMatchObject({ tool: 'link_session_outcomes', status: 'confirmed', confirmationState: 'confirmed' });
	});

	it('reject dismisses the pending action with no mutation', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const session = asSession(pb);
		store.assistant_messages.push({
			id: 'msg1',
			owner: UID,
			session: 'sess1',
			role: 'assistant',
			content: 'preview',
			toolName: 'link_session_outcomes',
			toolArgs: { courseId: COURSE_ID },
			toolResult: null,
			actionStatus: 'pending',
		});
		await handleReject(session, 'msg1');
		const row = store.assistant_messages.find((m) => m.id === 'msg1')!;
		expect(row.actionStatus).toBe('rejected');
		expect(store.class_sessions[0].subCpmks).toEqual([]);
		const auditCall = auditCreate.mock.calls.at(-1)?.[4] as Record<string, unknown>;
		expect(auditCall).toMatchObject({ tool: 'link_session_outcomes', status: 'rejected', confirmationState: 'rejected' });
	});

	it('denies a foreign owner on confirm', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const session = asSession(pb);
		// Pending message owned by another lecturer
		store.assistant_messages.push({
			id: 'msg1',
			owner: OTHER,
			session: 'sess1',
			role: 'assistant',
			content: 'preview',
			toolName: 'link_session_outcomes',
			toolArgs: { courseId: COURSE_ID },
			toolResult: { draft: { courseId: COURSE_ID, links: [] } },
			actionStatus: 'pending',
		});
		await expect(handleConfirm(session, 'msg1')).rejects.toThrow(/Aksi tidak ditemukan/);
		expect(store.class_sessions[0].subCpmks).toEqual([]);
	});
});
