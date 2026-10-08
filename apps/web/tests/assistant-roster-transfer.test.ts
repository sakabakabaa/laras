/**
 * add_roster_students — assistant roster transfer between owned mata kuliah.
 *
 * Covers: tool appears in the model-visible tool list and dispatches, correct
 * confirmed additions, no mutation on cancel, no duplicate additions,
 * authorization/ownership isolation, ambiguity/missing-section behavior, and
 * truthful persistence errors. The pure plan/summary builders and the
 * registry membership are also asserted.
 *
 * The executor is exercised against an in-memory fake PocketBase that honors
 * course/section filters; the runtime prepare/confirm/reject paths reuse the
 * same fakes plus mocked persistence and audit.
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
	prepareRosterTransfer,
	cleanRosterTransferSummary,
	executeAddRosterStudents,
	TOOL_REGISTRY,
} from '@/lib/assistant/tools.server';
import { WRITE_TOOLS, CONFIRMATION_REQUIRED_TOOLS } from '@/lib/assistant/types';
import type { AssistantSession, PreparedRosterTransfer } from '@/lib/assistant/types';

// ── Fake PocketBase (filter-aware for course/section) ─────────────────────

type Row = Record<string, unknown>;

/** Extracts `course = "..."` and `section = "..."` clauses from a PB filter. */
function parseFilter(filter: string): { course?: string; section?: string } {
	const out: { course?: string; section?: string } = {};
	const courseMatch = filter.match(/course\s*=\s*"([^"]+)"/);
	if (courseMatch) out.course = courseMatch[1];
	const sectionMatch = filter.match(/section\s*=\s*"([^"]+)"/);
	if (sectionMatch) out.section = sectionMatch[1];
	return out;
}

function makeFakePb(store: Record<string, Row[]>) {
	const pb = {
		collection: (name: string) => {
			const rows = store[name] || [];
			return {
				getFullList: async (opts?: Record<string, unknown>) => {
					const filter = typeof opts?.filter === 'string' ? opts.filter : '';
					const { course, section } = parseFilter(filter);
					let result = [...rows];
					if (course) result = result.filter((r) => r.course === course);
					if (section) result = result.filter((r) => r.section === section);
					return result;
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
					// Simulate the unique (course, nim) constraint.
					const nim = String(data.nim ?? '');
					const course = String(data.course ?? '');
					if (nim && course && rows.some((r) => r.nim === nim && r.course === course)) {
						throw Object.assign(new Error('unique constraint failed'), { status: 400 });
					}
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
const SOURCE_ID = 'src000000000001'; // 15 chars — matches PB id pattern
const DEST_ID = 'dst000000000001';

function seedStore(): Record<string, Row[]> {
	const courses = [
		{ id: SOURCE_ID, owner: UID, title: 'Verstehen A1', code: 'JR241' },
		{ id: DEST_ID, owner: UID, title: 'Schreiben A1', code: 'JR242' },
	];
	const sections = [
		{ id: 'secA', owner: UID, course: SOURCE_ID, name: 'A' },
		{ id: 'secB', owner: UID, course: SOURCE_ID, name: 'B' },
	];
	const roster = [
		{ id: 'r1', owner: UID, course: SOURCE_ID, section: 'secA', nim: '2021001', name: 'Budi Santoso' },
		{ id: 'r2', owner: UID, course: SOURCE_ID, section: 'secA', nim: '2021002', name: 'Siti Aminah' },
		{ id: 'r3', owner: UID, course: SOURCE_ID, section: 'secB', nim: '2021003', name: 'Ahmad Fauzi' },
		// One student already in the destination (should be skipped).
		{ id: 'r4', owner: UID, course: DEST_ID, section: null, nim: '2021001', name: 'Budi Santoso' },
	];
	return {
		courses,
		course_sections: sections,
		course_roster: roster,
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

describe('add_roster_students — registry & classification', () => {
	it('is registered as a write tool requiring confirmation', () => {
		const def = TOOL_REGISTRY.get('add_roster_students');
		expect(def).toBeDefined();
		expect(def?.permission).toBe('write');
		expect(def?.requiresConfirmation).toBe(true);
		expect(WRITE_TOOLS.has('add_roster_students')).toBe(true);
		expect(CONFIRMATION_REQUIRED_TOOLS.has('add_roster_students')).toBe(true);
	});

	it('requires sourceCourseId and destinationCourseId arguments', () => {
		const def = TOOL_REGISTRY.get('add_roster_students')!;
		expect(def.inputSchema.required).toContain('sourceCourseId');
		expect(def.inputSchema.required).toContain('destinationCourseId');
	});
});

// ── prepareRosterTransfer ─────────────────────────────────────────────────

describe('prepareRosterTransfer — plan & preview', () => {
	it('lists source-section students not already in the destination', async () => {
		const pb = makeFakePb(seedStore());
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareRosterTransfer(pb, UID, source, dest, 'A');
		expect('missing' in plan).toBe(false);
		const p = plan as PreparedRosterTransfer;
		expect(p.section).toBe('A');
		// Section A has 2 students; one (2021001) already in dest → 1 addition.
		expect(p.additions).toHaveLength(1);
		expect(p.additions[0].nim).toBe('2021002');
	});

	it('uses the whole source roster when section is empty', async () => {
		const pb = makeFakePb(seedStore());
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareRosterTransfer(pb, UID, source, dest, '');
		const p = plan as PreparedRosterTransfer;
		// 3 source students, 1 already in dest → 2 additions.
		expect(p.additions).toHaveLength(2);
	});

	it('returns missing:no_section when the named section does not exist', async () => {
		const pb = makeFakePb(seedStore());
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareRosterTransfer(pb, UID, source, dest, 'Z');
		expect(plan).toEqual({ missing: 'no_section' });
	});

	it('returns ambiguous:section when multiple sections share the name', async () => {
		const store = seedStore();
		store.course_sections.push({ id: 'secA2', owner: UID, course: SOURCE_ID, name: 'A' });
		const pb = makeFakePb(store);
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareRosterTransfer(pb, UID, source, dest, 'A');
		expect(plan).toEqual({ ambiguous: 'section' });
	});

	it('returns missing:no_source_roster when the source section is empty', async () => {
		const store = seedStore();
		// Remove all section-A students.
		store.course_roster = store.course_roster.filter((r) => r.section !== 'secA');
		const pb = makeFakePb(store);
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareRosterTransfer(pb, UID, source, dest, 'A');
		expect(plan).toEqual({ missing: 'no_source_roster' });
	});

	it('returns missing:all_duplicates when every source student is already enrolled', async () => {
		const store = seedStore();
		// Add the only section-A student not yet in dest into dest.
		store.course_roster.push({ id: 'r5', owner: UID, course: DEST_ID, section: null, nim: '2021002', name: 'Siti Aminah' });
		const pb = makeFakePb(store);
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = await prepareRosterTransfer(pb, UID, source, dest, 'A');
		expect(plan).toEqual({ missing: 'all_duplicates' });
	});

	it('preview lists every student to be added with NIM and name', () => {
		const plan: PreparedRosterTransfer = {
			sourceCourseId: SOURCE_ID,
			sourceCourseLabel: 'JR241 · Verstehen A1',
			destinationCourseId: DEST_ID,
			destinationCourseLabel: 'JR242 · Schreiben A1',
			section: 'A',
			additions: [{ nim: '2021002', name: 'Siti Aminah' }],
		};
		const summary = cleanRosterTransferSummary(plan);
		expect(summary).toContain('1 mahasiswa');
		expect(summary).toContain('JR241 · Verstehen A1');
		expect(summary).toContain('JR242 · Schreiben A1');
		expect(summary).toContain('kelas A');
		expect(summary).toContain('2021002 — Siti Aminah');
		expect(summary).toContain('tidak dihapus');
	});
});

// ── executeAddRosterStudents ──────────────────────────────────────────────

describe('executeAddRosterStudents — confirmed execution', () => {
	it('creates the proposed roster rows in the destination', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareRosterTransfer(pb, UID, source, dest, 'A')) as PreparedRosterTransfer;
		const result = await executeAddRosterStudents(pb, UID, { destinationCourseId: DEST_ID, draft: plan });
		expect(result.link).toBe(`/app/courses/${DEST_ID}/mahasiswa`);
		const destRoster = store.course_roster.filter((r) => r.course === DEST_ID);
		// Originally 1, plus 1 new addition.
		expect(destRoster).toHaveLength(2);
		expect(destRoster.some((r) => r.nim === '2021002' && r.name === 'Siti Aminah')).toBe(true);
	});

	it('does not duplicate NIMs already present in the destination', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareRosterTransfer(pb, UID, source, dest, '')) as PreparedRosterTransfer;
		// 2 additions expected (2021002, 2021003); 2021001 already in dest.
		await executeAddRosterStudents(pb, UID, { destinationCourseId: DEST_ID, draft: plan });
		const destRoster = store.course_roster.filter((r) => r.course === DEST_ID);
		expect(destRoster).toHaveLength(3);
		// No duplicate NIM.
		const nims = destRoster.map((r) => r.nim);
		expect(new Set(nims).size).toBe(nims.length);
	});

	it('is idempotent — re-running the same plan adds nothing new', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareRosterTransfer(pb, UID, source, dest, 'A')) as PreparedRosterTransfer;
		await executeAddRosterStudents(pb, UID, { destinationCourseId: DEST_ID, draft: plan });
		const after1 = JSON.stringify(store.course_roster.filter((r) => r.course === DEST_ID));
		await executeAddRosterStudents(pb, UID, { destinationCourseId: DEST_ID, draft: plan });
		const after2 = JSON.stringify(store.course_roster.filter((r) => r.course === DEST_ID));
		expect(after2).toBe(after1);
	});

	it('preserves existing destination roster records', async () => {
		const store = seedStore();
		// Pre-existing destination student unrelated to the source.
		store.course_roster.push({ id: 'r9', owner: UID, course: DEST_ID, section: null, nim: '2021999', name: 'Existing Student' });
		const pb = makeFakePb(store);
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareRosterTransfer(pb, UID, source, dest, 'A')) as PreparedRosterTransfer;
		await executeAddRosterStudents(pb, UID, { destinationCourseId: DEST_ID, draft: plan });
		const destRoster = store.course_roster.filter((r) => r.course === DEST_ID);
		expect(destRoster.some((r) => r.nim === '2021999')).toBe(true);
	});

	it('denies a foreign destination course (owner isolation)', async () => {
		const store = seedStore();
		// Destination owned by another lecturer.
		store.courses.find((c) => c.id === DEST_ID)!.owner = OTHER;
		const pb = makeFakePb(store);
		const plan: PreparedRosterTransfer = {
			sourceCourseId: SOURCE_ID,
			sourceCourseLabel: 'JR241',
			destinationCourseId: DEST_ID,
			destinationCourseLabel: 'JR242',
			section: 'A',
			additions: [{ nim: '2021002', name: 'Siti Aminah' }],
		};
		await expect(
			executeAddRosterStudents(pb, UID, { destinationCourseId: DEST_ID, draft: plan }),
		).rejects.toThrow(/tidak ditemukan atau bukan milik Anda/);
		// No row was added to the destination.
		expect(store.course_roster.filter((r) => r.course === DEST_ID)).toHaveLength(1);
	});

	it('reports an honest error when the plan is missing', async () => {
		const pb = makeFakePb(seedStore());
		await expect(
			executeAddRosterStudents(pb, UID, { destinationCourseId: DEST_ID }),
		).rejects.toThrow(/Rencana penambahan roster tidak tersedia/);
	});

	it('reports an honest error when destinationCourseId is empty', async () => {
		const pb = makeFakePb(seedStore());
		await expect(
			executeAddRosterStudents(pb, UID, {}),
		).rejects.toThrow(/Mata kuliah tujuan wajib diisi/);
	});
});

// ── Runtime integration: prepare → confirm / reject ──────────────────────

describe('add_roster_students — runtime prepare/confirm/reject', () => {
	it('surfaces a pending confirmation with a preview when data is complete', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const session = asSession(pb);
		vi.mocked(collectModel).mockResolvedValueOnce(
			`Saya akan menambah mahasiswa kelas A dari Verstehen ke Schreiben.\n[[TOOL_CALL]]\n{"name":"add_roster_students","args":{"sourceCourseId":"${SOURCE_ID}","destinationCourseId":"${DEST_ID}","section":"A"}}\n[[/TOOL_CALL]]`,
		);
		vi.mocked(saveSessionMessage).mockResolvedValueOnce({ id: 'msg1', role: 'assistant', content: '' } as never);
		const result = await handleSend(session, 'tambahkan mahasiswa kelas A dari JR241 ke JR242', '', '', '', [], '', {});
		expect(result.pendingAction).toBeDefined();
		expect(result.pendingAction?.tool).toBe('add_roster_students');
		expect(result.text).toContain('1 mahasiswa');
		expect(result.text).toContain('2021002');
	});

	it('asks for clarification when the section is ambiguous', async () => {
		const store = seedStore();
		store.course_sections.push({ id: 'secA2', owner: UID, course: SOURCE_ID, name: 'A' });
		const pb = makeFakePb(store);
		const session = asSession(pb);
		vi.mocked(collectModel).mockResolvedValueOnce(
			`[[TOOL_CALL]]\n{"name":"add_roster_students","args":{"sourceCourseId":"${SOURCE_ID}","destinationCourseId":"${DEST_ID}","section":"A"}}\n[[/TOOL_CALL]]`,
		);
		vi.mocked(saveSessionMessage).mockResolvedValueOnce({ id: 'msg1', role: 'assistant', content: '' } as never);
		const result = await handleSend(session, 'tambahkan kelas A', '', '', '', [], '', {});
		expect(result.clarification).toBeDefined();
		expect(result.pendingAction).toBeUndefined();
		expect(result.text).toContain('lebih dari satu kelas');
	});

	it('returns a plain message when the section is missing', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const session = asSession(pb);
		vi.mocked(collectModel).mockResolvedValueOnce(
			`[[TOOL_CALL]]\n{"name":"add_roster_students","args":{"sourceCourseId":"${SOURCE_ID}","destinationCourseId":"${DEST_ID}","section":"Z"}}\n[[/TOOL_CALL]]`,
		);
		vi.mocked(saveSessionMessage).mockResolvedValueOnce({ id: 'msg1', role: 'assistant', content: '' } as never);
		const result = await handleSend(session, 'tambahkan kelas Z', '', '', '', [], '', {});
		expect(result.pendingAction).toBeUndefined();
		expect(result.clarification).toBeUndefined();
		expect(result.text).toContain('tidak ditemukan');
	});

	it('confirm executes the plan and records a confirmed audit', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const session = asSession(pb);
		const source = (await pb.collection('courses').getOne(SOURCE_ID)) as unknown as import('@/lib/learning').Course;
		const dest = (await pb.collection('courses').getOne(DEST_ID)) as unknown as import('@/lib/learning').Course;
		const plan = (await prepareRosterTransfer(pb, UID, source, dest, 'A')) as PreparedRosterTransfer;
		store.assistant_messages.push({
			id: 'msg1',
			owner: UID,
			session: 'sess1',
			role: 'assistant',
			content: cleanRosterTransferSummary(plan),
			toolName: 'add_roster_students',
			toolArgs: { sourceCourseId: SOURCE_ID, destinationCourseId: DEST_ID, section: 'A', studentCount: 1 },
			toolResult: { draft: plan },
			actionStatus: 'pending',
		});
		vi.mocked(saveSessionMessage).mockResolvedValueOnce({ id: 'msg2', role: 'assistant', content: '' } as never);
		const result = await handleConfirm(session, 'msg1');
		expect(result.text).toContain('Berhasil menambah');
		expect(store.course_roster.filter((r) => r.course === DEST_ID)).toHaveLength(2);
		const auditCall = auditCreate.mock.calls.at(-1)?.[4] as Record<string, unknown>;
		expect(auditCall).toMatchObject({ tool: 'add_roster_students', status: 'confirmed', confirmationState: 'confirmed' });
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
			toolName: 'add_roster_students',
			toolArgs: { sourceCourseId: SOURCE_ID, destinationCourseId: DEST_ID },
			toolResult: null,
			actionStatus: 'pending',
		});
		await handleReject(session, 'msg1');
		const row = store.assistant_messages.find((m) => m.id === 'msg1')!;
		expect(row.actionStatus).toBe('rejected');
		expect(store.course_roster.filter((r) => r.course === DEST_ID)).toHaveLength(1);
		const auditCall = auditCreate.mock.calls.at(-1)?.[4] as Record<string, unknown>;
		expect(auditCall).toMatchObject({ tool: 'add_roster_students', status: 'rejected', confirmationState: 'rejected' });
	});

	it('denies a foreign owner on confirm', async () => {
		const store = seedStore();
		const pb = makeFakePb(store);
		const session = asSession(pb);
		store.assistant_messages.push({
			id: 'msg1',
			owner: OTHER,
			session: 'sess1',
			role: 'assistant',
			content: 'preview',
			toolName: 'add_roster_students',
			toolArgs: { destinationCourseId: DEST_ID },
			toolResult: { draft: { destinationCourseId: DEST_ID, additions: [] } },
			actionStatus: 'pending',
		});
		await expect(handleConfirm(session, 'msg1')).rejects.toThrow(/Aksi tidak ditemukan/);
		expect(store.course_roster.filter((r) => r.course === DEST_ID)).toHaveLength(1);
	});
});
