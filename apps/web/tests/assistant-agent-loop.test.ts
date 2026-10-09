/**
 * Phase 14 — structured tool calling & agent loop tests.
 *
 * Verifies the required invariants:
 *  - structured argument validation (invalid args rejected, valid coerced)
 *  - typed results (ok/data/error/source contract)
 *  - multiple sequential reads (the loop continues after a tool result)
 *  - continuing after tool results (the model may call another tool)
 *  - permission/confirmation safeguards (read tools execute, write tools
 *    require confirmation and never execute on send)
 *  - provider compatibility (the model is called through the same collectModel
 *    entry point with the same history/system_prompt shape)
 *  - fenced ```tool text is no longer required (the structured [[TOOL_CALL]]
 *    format is the primary protocol; the legacy fence is only a fallback)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	parsePrimaryToolCall,
	parseToolCalls,
	stripToolCalls,
} from '@/lib/assistant/parsing';
import {
	executeReadTool,
	getToolDefinition,
	READ_TOOL_NAMES,
	serializeToolResult,
	TOOL_REGISTRY,
	validateToolArgs,
	WRITE_TOOL_NAMES,
} from '@/lib/assistant/tools.server';
import type { ToolExecutionContext } from '@/lib/assistant/types';

// ── Pure parsing & registry tests (no mocks) ───────────────────────────────

describe('Phase 14 — structured tool-call parsing', () => {
	it('parses a [[TOOL_CALL]] block into a structured call', () => {
		const text = 'Saya akan memeriksa.\n[[TOOL_CALL]]\n{"name":"list_courses","args":{}}\n[[/TOOL_CALL]]';
		expect(parseToolCalls(text)).toEqual([{ name: 'list_courses', args: {} }]);
	});

	it('parses multiple tool calls in one response', () => {
		const text = '[[TOOL_CALL]]\n{"name":"list_courses","args":{}}\n[[/TOOL_CALL]]\nteks\n[[TOOL_CALL]]\n{"name":"course_detail","args":{"courseId":"c1"}}\n[[/TOOL_CALL]]';
		expect(parseToolCalls(text)).toHaveLength(2);
		expect(parseToolCalls(text)[1].args).toEqual({ courseId: 'c1' });
	});

	it('stripToolCalls removes the blocks but keeps visible text', () => {
		const text = 'Intro.\n[[TOOL_CALL]]\n{"name":"list_courses","args":{}}\n[[/TOOL_CALL]]\nOutro.';
		const stripped = stripToolCalls(text);
		expect(stripped).toContain('Intro.');
		expect(stripped).toContain('Outro.');
		expect(stripped).not.toContain('TOOL_CALL');
	});

	it('parsePrimaryToolCall uses the structured format first', () => {
		const text = '[[TOOL_CALL]]\n{"name":"summarize_insights","args":{}}\n[[/TOOL_CALL]]';
		expect(parsePrimaryToolCall(text)).toEqual({ name: 'summarize_insights', args: {} });
	});

	it('fenced ```tool is no longer required — structured format works alone', () => {
		const text = 'Halo.\n[[TOOL_CALL]]\n{"name":"list_courses","args":{}}\n[[/TOOL_CALL]]';
		// No ```tool fence present anywhere.
		expect(text.includes('```tool')).toBe(false);
		expect(parsePrimaryToolCall(text)).not.toBeNull();
	});

	it('falls back to legacy fenced ```tool only when structured format is absent', () => {
		const legacy = '```tool\n{"tool":"list_courses","args":{}}\n```';
		expect(parsePrimaryToolCall(legacy)).toEqual({ name: 'list_courses', args: {} });
	});

	it('returns null when no tool call of any format is present', () => {
		expect(parsePrimaryToolCall('Hanya jawaban biasa tanpa tool.')).toBeNull();
	});

	it('ignores malformed JSON in a tool-call block', () => {
		const text = '[[TOOL_CALL]]\n{not json}\n[[/TOOL_CALL]]';
		expect(parseToolCalls(text)).toEqual([]);
	});
});

// ── Registry, permission & confirmation safeguards ──────────────────────────

describe('Phase 14 — tool registry permissions', () => {
	it('registers all available tools (including search_history)', () => {
		expect([...TOOL_REGISTRY.keys()].sort()).toEqual(
			['add_roster_students', 'calendar_events', 'course_detail', 'course_materials', 'create_assignment', 'create_course', 'import_rps_pdf', 'link_session_outcomes', 'list_assignments', 'list_courses', 'search_history', 'student_profile', 'summarize_insights'],
		);
	});

	it('read tools do not require confirmation; write tools do', () => {
		for (const name of READ_TOOL_NAMES) {
			expect(TOOL_REGISTRY.get(name)?.requiresConfirmation).toBe(false);
			expect(TOOL_REGISTRY.get(name)?.permission).toBe('read');
		}
		for (const name of WRITE_TOOL_NAMES) {
			expect(TOOL_REGISTRY.get(name)?.requiresConfirmation).toBe(true);
			expect(TOOL_REGISTRY.get(name)?.permission).toBe('write');
		}
	});

	it('read tools have an execute function; write tools do not', () => {
		for (const name of READ_TOOL_NAMES) {
			expect(typeof TOOL_REGISTRY.get(name)?.execute).toBe('function');
		}
		for (const name of WRITE_TOOL_NAMES) {
			expect(TOOL_REGISTRY.get(name)?.execute).toBeUndefined();
		}
	});

	it('every tool has a structured input schema', () => {
		for (const def of TOOL_REGISTRY.values()) {
			expect(def.inputSchema.type).toBe('object');
			expect(def.inputSchema.properties).toBeInstanceOf(Object);
		}
	});

	it('getToolDefinition returns undefined for an unknown tool', () => {
		expect(getToolDefinition('delete_everything')).toBeUndefined();
	});
});

// ── Structured argument validation ─────────────────────────────────────────

describe('Phase 14 — validateToolArgs', () => {
	it('accepts valid args and coerces numeric strings to numbers', () => {
		const def = getToolDefinition('create_assignment')!;
		const result = validateToolArgs(def, { courseId: 'c1', shape: 'writing', week: '5' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.args.week).toBe(5);
			expect(result.args.courseId).toBe('c1');
		}
	});

	it('rejects missing required fields', () => {
		const def = getToolDefinition('course_detail')!;
		const result = validateToolArgs(def, {});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.some((e) => e.includes('courseId'))).toBe(true);
	});

	it('rejects an invalid enum value', () => {
		const def = getToolDefinition('create_assignment')!;
		const result = validateToolArgs(def, { courseId: 'c1', shape: 'individual' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.some((e) => e.includes('shape'))).toBe(true);
	});

	it('accepts a valid enum value', () => {
		const def = getToolDefinition('create_assignment')!;
		const result = validateToolArgs(def, { courseId: 'c1', shape: 'speaking' });
		expect(result.ok).toBe(true);
	});

	it('rejects a non-numeric value for a number field', () => {
		const def = getToolDefinition('create_assignment')!;
		const result = validateToolArgs(def, { courseId: 'c1', shape: 'writing', week: 'abc' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.some((e) => e.includes('week'))).toBe(true);
	});
});

// ── Typed tool results ─────────────────────────────────────────────────────

describe('Phase 14 — typed tool results', () => {
	it('serializeToolResult renders an ok result with source', () => {
		const out = serializeToolResult('list_courses', { ok: true, data: '1. A\n2. B', source: { type: 'courses' } });
		expect(out).toContain('[HASIL TOOL: list_courses]');
		expect(out).toContain('ok: true');
		expect(out).toContain('source: courses');
		expect(out).toContain('1. A');
	});

	it('serializeToolResult renders an error result with code', () => {
		const out = serializeToolResult('course_detail', { ok: false, error: { code: 'invalid_args', message: 'courseId wajib' } });
		expect(out).toContain('ok: false');
		expect(out).toContain('invalid_args');
		expect(out).toContain('courseId wajib');
	});
});

// ── executeReadTool with a fake PocketBase ─────────────────────────────────

function fakePbForReads() {
	const courses = [
		{ id: 'c1', title: 'Deutsch 3', code: 'A1', semester: 'Ganjil', academicYear: '2026', credits: 4 },
	];
	const sessions = [{ id: 's1' }];
	const assignments = [{ id: 'a1', activityType: 'formal', status: 'published' }];
	const roster = [{ id: 'r1' }];
	const collection = (name: string) => ({
		async getFullList<T>(opts: { filter?: string } = {}): Promise<T[]> {
			const filter = opts.filter || '';
			if (name === 'courses') return (filter.includes('owner') ? courses : courses) as unknown as T[];
			if (name === 'class_sessions') return sessions as unknown as T[];
			if (name === 'assignments') return assignments as unknown as T[];
			if (name === 'course_roster') return roster as unknown as T[];
			if (name === 'check_attempts' || name === 'assignment_submissions') return [] as unknown as T[];
			return [] as unknown as T[];
		},
	});
	return {
		filter: (template: string, params: Record<string, unknown>) => {
			let out = template;
			for (const [key, value] of Object.entries(params)) out = out.replace(`{:${key}}`, JSON.stringify(String(value)));
			return out;
		},
		collection,
	};
}

describe('Phase 14 — executeReadTool typed contract', () => {
	let ctx: ToolExecutionContext;
	beforeEach(() => {
		ctx = { pb: fakePbForReads() as never, userId: 'u1', files: [], courseRoute: '' };
	});

	it('returns a typed ok result with data and source for list_courses', async () => {
		const result = await executeReadTool(ctx, 'list_courses', {});
		expect(result.ok).toBe(true);
		expect(typeof result.data).toBe('string');
		expect(result.source?.type).toBe('courses');
	});

	it('returns a typed ok result with source id for course_detail', async () => {
		const result = await executeReadTool(ctx, 'course_detail', { courseId: 'c1' });
		expect(result.ok).toBe(true);
		expect(result.source?.type).toBe('course');
		expect(result.source?.id).toBe('c1');
	});

	it('returns an invalid_args error without executing when required field is missing', async () => {
		const result = await executeReadTool(ctx, 'course_detail', {});
		expect(result.ok).toBe(false);
		expect(result.error?.code).toBe('invalid_args');
		expect(result.error?.message).toContain('courseId');
	});

	it('returns an unknown_tool error for an unregistered tool', async () => {
		const result = await executeReadTool(ctx, 'delete_all', {});
		expect(result.ok).toBe(false);
		expect(result.error?.code).toBe('unknown_tool');
	});

	it('returns a permission_denied error when a write tool is executed as a read', async () => {
		const result = await executeReadTool(ctx, 'create_course', { title: 'X' });
		expect(result.ok).toBe(false);
		expect(result.error?.code).toBe('permission_denied');
	});
});

// ── Agent loop: multiple sequential reads ───────────────────────────────────
//
// Mocks collectModel (the provider entry point) to return a scripted sequence,
// and mocks persistence + context so the loop runs in isolation. The real
// executeReadTool / parsing / registry are used — only the model and the
// PocketBase-touching helpers are stubbed.

vi.mock('@/lib/assistant/model.server', () => ({
	collectModel: vi.fn(),
}));

vi.mock('@/lib/assistant/persistence.server', () => ({
	dismissPendingClarify: vi.fn(async () => {}),
	getSession: vi.fn(async (_pb: unknown, _userId: string, sessionId: string) => ({ id: sessionId || 'sess1', owner: _userId })),
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

import { collectModel } from '@/lib/assistant/model.server';
import { saveSessionMessage } from '@/lib/assistant/persistence.server';
import { handleSend } from '@/lib/assistant/runtime.server';
import type { AssistantSession } from '@/lib/assistant/types';

const asSession = (): AssistantSession => ({
	id: 'u1',
	pb: fakePbForReads() as never,
	role: 'faculty',
	verified: true,
});

describe('Phase 14 — agent loop (multiple sequential reads)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('chains two read tools then produces a final answer', async () => {
		// Scripted model responses: tool call → tool call → final answer.
		const responses = [
			'Saya akan memeriksa mata kuliah Anda.\n[[TOOL_CALL]]\n{"name":"list_courses","args":{}}\n[[/TOOL_CALL]]',
			'Sekali saya lihat detail salah satunya.\n[[TOOL_CALL]]\n{"name":"course_detail","args":{"courseId":"c1"}}\n[[/TOOL_CALL]]',
			'Ringkasan: Anda punya 1 mata kuliah dengan 1 sesi, 1 tugas formal, dan 1 mahasiswa terdaftar.',
		];
		vi.mocked(collectModel).mockImplementation(async () => responses.shift() || '');

		const result = await handleSend(asSession(), 'Berapa mata kuliah saya dan detailnya?', '', '', '', [], 'sess1', {});

		// The model was called three times (two tool turns + one final).
		expect(collectModel).toHaveBeenCalledTimes(3);
		// Two tool-result messages were persisted (one per read tool).
		const saved = vi.mocked(saveSessionMessage).mock.calls;
		const toolMessages = saved.filter((call) => call[3]?.role === 'assistant' && call[3]?.actionStatus === 'executed');
		expect(toolMessages).toHaveLength(2);
		// The final answer is the third model response (no tool call).
		expect(result.text).toContain('Ringkasan');
		expect(result.pendingAction).toBeUndefined();
		expect(result.clarification).toBeUndefined();
	});

	it('does not force a final answer after the first tool call', async () => {
		const responses = [
			'[[TOOL_CALL]]\n{"name":"list_courses","args":{}}\n[[/TOOL_CALL]]',
			'Jawaban akhir setelah satu tool.',
		];
		vi.mocked(collectModel).mockImplementation(async () => responses.shift() || '');
		const result = await handleSend(asSession(), 'tanya', '', '', '', [], 'sess1', {});
		expect(collectModel).toHaveBeenCalledTimes(2);
		expect(result.text).toBe('Jawaban akhir setelah satu tool.');
	});

	it('continues after a tool result when the model issues another tool call', async () => {
		const responses = [
			'[[TOOL_CALL]]\n{"name":"list_courses","args":{}}\n[[/TOOL_CALL]]',
			'[[TOOL_CALL]]\n{"name":"summarize_insights","args":{}}\n[[/TOOL_CALL]]',
			'Selesai, ini ringkasannya.',
		];
		vi.mocked(collectModel).mockImplementation(async () => responses.shift() || '');
		await handleSend(asSession(), 'tanya', '', '', '', [], 'sess1', {});
		expect(collectModel).toHaveBeenCalledTimes(3);
	});

	it('stops at the loop ceiling without infinite recursion', async () => {
		// The model always emits a tool call — the loop must terminate at the ceiling.
		vi.mocked(collectModel).mockImplementation(async () => '[[TOOL_CALL]]\n{"name":"list_courses","args":{}}\n[[/TOOL_CALL]]');
		const result = await handleSend(asSession(), 'tanya', '', '', '', [], 'sess1', {});
		expect(collectModel.mock.calls.length).toBeLessThanOrEqual(7);
		expect(result.text).toBeTruthy();
	});

	it('calls the provider through collectModel with history and system_prompt', async () => {
		vi.mocked(collectModel).mockImplementation(async () => 'jawaban langsung');
		await handleSend(asSession(), 'halo', '', '', '', [], 'sess1', {});
		expect(collectModel).toHaveBeenCalledTimes(1);
		const args = vi.mocked(collectModel).mock.calls[0];
		// [session, history, systemPrompt, turn]
		expect(args[1]).toBeInstanceOf(Array);
		expect(typeof args[2]).toBe('string');
	});
});
