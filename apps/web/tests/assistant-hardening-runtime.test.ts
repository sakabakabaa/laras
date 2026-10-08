/**
 * Phase 13 — assistant hardening: runtime-level tests.
 *
 * Covers the runtime paths that touch persistence, the model, and the audit
 * log together:
 *  - rejected writes record a `rejected` audit and dismiss the pending action
 *  - failed tool execution feeds a structured error back to the model
 *  - successful writes record a `confirmed` audit grounded in the created link
 *
 * The runtime's server-only dependencies are mocked at the top level, mirroring
 * assistant-agent-loop.test.ts. The real parsing, registry, audit, and tool
 * execution are used.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mocks for the runtime's server-only dependencies ──────────────────────

// vi.hoisted runs before vi.mock factories, so the mock fn exists when the
// audit.server mock factory references it.
const { auditCreate } = vi.hoisted(() => ({ auditCreate: vi.fn(async (data: Record<string, unknown>) => ({ ...data, id: 'audit1' })) }));

vi.mock('@/lib/assistant/model.server', () => ({
	collectModel: vi.fn(),
}));

vi.mock('@/lib/assistant/persistence.server', () => ({
	dismissPendingClarify: vi.fn(async () => {}),
	getSession: vi.fn(async (_pb: unknown, _userId: string, sessionId: string) => ({
		id: sessionId || 'sess1',
		owner: 'u1',
	})),
	resolveDefaultSession: vi.fn(async () => ({ id: 'sess1', owner: 'u1' })),
	loadSessionMessages: vi.fn(async () => []),
	saveSessionMessage: vi.fn(async (_pb: unknown, _userId: string, _sid: string, data: { role: string; content: string }) => ({
		id: `m${Math.random().toString(36).slice(2, 8)}`,
		...data,
	})),
}));

vi.mock('@/lib/assistant/page-context.server', () => ({
	validateAndAuthorizePageContext: vi.fn(async () => ({ route: '', feature: '', courseRoute: '', course: null })),
}));

vi.mock('@/lib/assistant/context.server', () => ({
	buildSystemPrompt: vi.fn(() => 'SYSTEM'),
	courseLabel: vi.fn((c: { title: string; code?: string }) => (c.code ? `${c.code} · ${c.title}` : c.title)),
	courseMissMessage: vi.fn(() => 'tidak ditemukan'),
	resolveCourseRef: vi.fn(async () => ({ course: null, courses: [], ambiguous: false })),
}));

vi.mock('@/lib/assistant/page-context', () => ({
	deicticCourseId: vi.fn(() => ''),
}));

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

// Intercept audit writes so we can assert on them without a real PocketBase.
vi.mock('@/lib/assistant/audit.server', () => ({
	recordToolAudit: auditCreate,
}));

import { collectModel } from '@/lib/assistant/model.server';
import { saveSessionMessage } from '@/lib/assistant/persistence.server';
import { handleSend, handleConfirm, handleReject } from '@/lib/assistant/runtime.server';
import type { AssistantSession } from '@/lib/assistant/types';

// ── Fake PocketBase ────────────────────────────────────────────────────────

function fakePb(extra: Record<string, unknown> = {}) {
	return {
		collection: (name: string) => ({
			getFullList: async () => [] as unknown[],
			getOne: async (id: string) => {
				if (extra.getOne) return (extra.getOne as (n: string, i: string) => unknown)(name, id);
				throw Object.assign(new Error('not found'), { status: 404 });
			},
			update: async (id: string, data: Record<string, unknown>) => ({ id, ...data }),
			create: async (data: Record<string, unknown>) => ({ id: 'new1', ...data }),
		}),
		filter: (template: string, params: Record<string, unknown>) => {
			let out = template;
			for (const [key, value] of Object.entries(params)) out = out.replace(`{:${key}}`, JSON.stringify(String(value)));
			return out;
		},
	};
}

const asSession = (): AssistantSession => ({
	id: 'u1',
	pb: fakePb() as never,
	role: 'faculty',
	verified: true,
});

beforeEach(() => {
	vi.clearAllMocks();
});

// ── Rejected write ────────────────────────────────────────────────────────

describe('Task 3/5 — rejected write records a rejected audit', () => {
	it('handleReject updates the message to rejected and writes a rejected audit', async () => {
		const session = asSession();
		// The pending message row the runtime loads for rejection.
		(session.pb as unknown as { collection: (n: string) => unknown }).collection = (name: string) => ({
			getOne: async () => ({
				id: 'msg1',
				owner: 'u1',
				session: 'sess1',
				toolName: 'create_course',
				actionStatus: 'pending',
			}),
			update: async (id: string, data: Record<string, unknown>) => ({ id, ...data }),
			getFullList: async () => [],
			create: async (data: Record<string, unknown>) => ({ id: 'x', ...data }),
		});

		await handleReject(session, 'msg1');

		// The audit was recorded with status rejected / confirmationState rejected.
		expect(auditCreate).toHaveBeenCalled();
		const auditCall = auditCreate.mock.calls[auditCreate.mock.calls.length - 1];
		// recordToolAudit(pb, userId, sessionId, messageId, audit) — audit is arg index 4.
		expect(auditCall[4]).toMatchObject({ tool: 'create_course', status: 'rejected', confirmationState: 'rejected' });
	});
});

// ── Failed tool execution feeds a structured error back ───────────────────

describe('Task 7 — failed tool execution feeds a structured error to the model', () => {
	it('an unknown tool call is treated as a final answer (no crash)', async () => {
		vi.mocked(collectModel).mockImplementation(async () => '[[TOOL_CALL]]\n{"name":"delete_everything","args":{}}\n[[/TOOL_CALL]]');
		const result = await handleSend(asSession(), 'hapus semua', '', '', '', [], 'sess1', {});
		expect(typeof result.text).toBe('string');
		expect(result.pendingAction).toBeUndefined();
	});

	it('a read tool that returns an error result is serialized and fed back', async () => {
		// First model call: course_detail with a foreign id. The real
		// executeReadTool will return an error (the fake pb has no owned course),
		// which the runtime serializes and feeds back. Second call: final answer.
		let n = 0;
		vi.mocked(collectModel).mockImplementation(async () => {
			n += 1;
			if (n === 1) {
				return '[[TOOL_CALL]]\n{"name":"course_detail","args":{"courseId":"foreign00000001"}}\n[[/TOOL_CALL]]';
			}
			return 'Maaf, mata kuliah tidak ditemukan.';
		});
		const result = await handleSend(asSession(), 'detail mata kuliah asing', '', '', '', [], 'sess1', {});
		// The model was called at least twice (tool turn + final).
		expect(collectModel.mock.calls.length).toBeGreaterThanOrEqual(2);
		// A tool-result message was persisted with actionStatus executed.
		const toolMessages = vi.mocked(saveSessionMessage).mock.calls.filter(
			(c) => c[3]?.role === 'assistant' && c[3]?.actionStatus === 'executed',
		);
		expect(toolMessages.length).toBeGreaterThanOrEqual(1);
		// The fed-back tool result contains the structured error.
		expect(String(toolMessages[0][3]?.toolResult)).toContain('ok: false');
		expect(result.text).toContain('tidak ditemukan');
	});
});

// ── Successful write records a confirmed audit ────────────────────────────

describe('Task 6/7 — successful write records a confirmed audit grounded in the link', () => {
	it('handleConfirm executes the write and records a confirmed audit with the link', async () => {
		const session = asSession();
		// The pending create_course message row.
		(session.pb as unknown as { collection: (n: string) => unknown }).collection = (name: string) => ({
			getOne: async () => ({
				id: 'msg1',
				owner: 'u1',
				session: 'sess1',
				toolName: 'create_course',
				actionStatus: 'pending',
				toolArgs: { title: 'Deutsch N3', code: 'A1' },
				toolResult: null,
			}),
			update: async (id: string, data: Record<string, unknown>) => ({ id, ...data }),
			create: async (data: Record<string, unknown>) => ({ id: 'new_course', ...data }),
			getFullList: async () => [],
		});

		const result = await handleConfirm(session, 'msg1', '');

		// The confirmation text is grounded in the created record.
		expect(result.text).toContain('Deutsch N3');
		expect(result.text).toContain('berhasil dibuat');

		// A confirmed audit was recorded with the resulting link as provenance.
		const auditCall = auditCreate.mock.calls.find((c) => c[4]?.status === 'confirmed');
		expect(auditCall).toBeTruthy();
		expect(auditCall![4]).toMatchObject({
			tool: 'create_course',
			status: 'confirmed',
			confirmationState: 'confirmed',
		});
		expect(auditCall![4].resultMeta?.link).toBe('/app/courses/new_course');
	});
});
