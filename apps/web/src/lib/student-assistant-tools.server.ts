/**
 * Phase 4 — Context-Aware Student AI Tools.
 *
 * A narrow, typed tool registry the student assistant uses to fetch ONLY
 * student-authorized context and to run two model-backed learning operations
 * (draft analysis, practice generation). This is NOT a parallel AI system —
 * it reuses the Phase 1 policy gate (`authorizeCapability`), the Phase 5
 * context-retrieval layer (`retrieveContextBundle`), and the shared model
 * invocation (`collectModel`) the rest of LARAS uses.
 *
 * Security contract:
 *   - Every tool enforces authorization server-side (policy capability +, for
 *     students, course enrollment). The model never constructs queries.
 *   - A tool may access ONLY: the current student's identity, the current
 *     course/assignment, student-visible assignment info, the student's own
 *     work, explicitly permitted course materials, and the student's own
 *     feedback. It can NEVER access another student's work, lecturer private
 *     notes, hidden rubric/answer keys, hidden AI evaluations, research data,
 *     rater judgments, adjudication, or internal analytics.
 *   - Every invocation is audited (student, assignment, tool, capability,
 *     params, outcome, timestamp). Audit rows are never exposed to students.
 */
import type PocketBase from 'pocketbase';
import { collectModel } from '@/lib/task-assist.server';
import {
	authorizeCapability,
	resolveStudentAiPolicy,
} from '@/lib/ai-policy.server';
import { resolveAssignmentPolicy } from '@/lib/ai-policy';
import type { Capability } from '@/lib/ai-capabilities';
import {
	cpmkOfSubCpmk,
	retrieveContextBundle,
} from '@/lib/context-retrieval.server';
import type { AuthedUser } from '@/lib/context-retrieval.server';
import {
	loadAssistantContext,
	renderStudentDraft,
	submissionStateOf,
	type AssistantContext,
	type SubmissionState,
} from '@/lib/student-assistant.server';
import { activityTypeOf, letterGrade, type AssignmentSubmission } from '@/lib/assignments';
import logger from '@/lib/logger.server';

const AUDIT_COLLECTION = 'student_assistant_tool_audits';
const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

// ── Types ────────────────────────────────────────────────────

export type StudentToolName =
	| 'get_current_assignment'
	| 'get_assignment_instructions'
	| 'get_allowed_course_materials'
	| 'get_my_draft'
	| 'get_my_previous_submission'
	| 'analyze_my_draft'
	| 'explain_assignment_requirement'
	| 'generate_practice_activity';

export type StudentToolResult =
	| { ok: true; data: unknown; capability: Capability }
	| { ok: false; error: { code: string; message: string }; capability: Capability };

export type StudentToolContext = {
	pb: PocketBase;
	user: AuthedUser;
	ctx: AssistantContext;
	policy: ReturnType<typeof resolveAssignmentPolicy>;
};

type SchemaProp = {
	type: 'string' | 'number' | 'boolean';
	description?: string;
	required?: boolean;
	enum?: string[];
};

export type StudentToolDefinition = {
	name: StudentToolName;
	description: string;
	capability: Capability;
	inputSchema: { type: 'object'; properties: Record<string, SchemaProp>; required?: string[] };
	execute: (tc: StudentToolContext, args: Record<string, unknown>) => Promise<StudentToolResult>;
};

// ── Structured page context (controlled context builder) ────

/**
 * The minimal, controlled context the assistant receives about the page. This
 * is NOT a dump of application state — only the fields the model needs to act
 * context-aware, all student-authorized. Internal security metadata (policy
 * internals, audit ids, capability strings beyond labels) is never included.
 */
export type StudentPageContext = {
	page: string;
	role: 'student';
	course: { id: string };
	assignment: {
		id: string;
		title: string;
		mode: string;
		shape: string;
		activityType: string;
		deadline: string;
	};
	submissionState: SubmissionState;
	studentWork: { hasDraft: boolean; hasPreviousSubmission: boolean };
	/** Human-readable labels of what the assistant may do (never raw capability ids). */
	allowedCapabilities: string[];
};

export function buildStudentPageContext(
	ctx: AssistantContext,
	policy: ReturnType<typeof resolveAssignmentPolicy>,
): StudentPageContext {
	const a = ctx.assignment;
	return {
		page: 'student_worksheet',
		role: 'student',
		course: { id: a.course },
		assignment: {
			id: a.id,
			title: a.title,
			mode: a.mode,
			shape: a.shape || '',
			activityType: activityTypeOf(a) === 'formative' ? 'formative' : 'formal',
			deadline: a.deadline || '',
		},
		submissionState: ctx.state,
		studentWork: {
			hasDraft: !ctx.studentDraft.startsWith('(Belum ada draf'),
			hasPreviousSubmission: Boolean(ctx.submission && ctx.submission.status !== 'draft'),
		},
		allowedCapabilities: policy.allowedCapabilities,
	};
}

// ── Enrollment verification (student scope) ──────────────────

/**
 * Verifies the student is enrolled in the assignment's course. Faculty bypass
 * (they own the assignment). This is the server-side scope gate that keeps a
 * student out of another course's assignment — enforced here, not in the UI.
 */
async function verifyEnrollment(
	pb: PocketBase,
	user: AuthedUser,
	courseId: string,
): Promise<boolean> {
	if (user.role === 'faculty') return true;
	try {
		const rows = await pb.collection('enrollments').getList(1, 1, {
			filter: pb.filter('owner = {:o} && course = {:c}', { o: user.id, c: courseId }),
		});
		return rows.items.length > 0;
	} catch {
		return false;
	}
}

// ── Submission-state gate ────────────────────────────────────

/**
 * Whether a tool is available given the submission state. After a formal
 * submission is under review, draft analysis is unavailable (no replacement
 * answers); practice generation and context reads stay available.
 */
export function toolStateAvailability(
	tool: StudentToolName,
	state: SubmissionState,
	formative: boolean,
): { available: boolean; reason?: string } {
	if (formative || state === 'drafting' || state === 'revision') return { available: true };
	if (state === 'submitted') {
		if (tool === 'analyze_my_draft') {
			return {
				available: false,
				reason:
					'Tugas sudah dikumpulkan dan sedang dinilai. Saya tidak bisa menganalisis draf baru sekarang — tunggu umpan balik dosen setelah dinilai.',
			};
		}
		return { available: true };
	}
	// completed (graded): everything available for learning.
	return { available: true };
}

// ── Tool implementations ─────────────────────────────────────

const runGetCurrentAssignment = async (tc: StudentToolContext): Promise<StudentToolResult> => {
	const a = tc.ctx.assignment;
	return {
		ok: true,
		capability: 'explain_instruction',
		data: {
			id: a.id,
			title: a.title,
			mode: a.mode,
			shape: a.shape || '',
			activityType: activityTypeOf(a) === 'formative' ? 'formative' : 'formal',
			deadline: a.deadline || '',
			status: a.status,
			formative: tc.ctx.formative,
			submissionState: tc.ctx.state,
		},
	};
};

const runGetAssignmentInstructions = async (tc: StudentToolContext): Promise<StudentToolResult> => {
	const a = tc.ctx.assignment;
	return {
		ok: true,
		capability: 'explain_instruction',
		data: {
			instructions: a.instructions || '',
			requirements: a.requirements || '',
			groupInfo: a.groupInfo || '',
		},
	};
};

const runGetAllowedCourseMaterials = async (tc: StudentToolContext): Promise<StudentToolResult> => {
	const a = tc.ctx.assignment;
	const cpmk = await cpmkOfSubCpmk(a.subCpmk || '');
	const bundle = await retrieveContextBundle({
		feature: 'check',
		scope: {
			course: a.course,
			session: a.session || '',
			subCpmk: a.subCpmk || '',
			cpmk,
			assignment: a.id,
		},
		requester: {
			id: tc.user.id,
			role: tc.user.role === 'faculty' ? 'faculty' : 'student',
			label: `student:${tc.user.id}`,
		},
		ownerLecturerId: a.owner,
	});
	return {
		ok: true,
		capability: 'explain_concept',
		data: {
			result: bundle.result,
			reason: bundle.result === 'insufficient' ? bundle.reason : '',
			materials: bundle.sources.map((s) => ({
				title: s.title,
				kind: s.kind,
				sections: s.sections.map((sec) => sec.label),
				excerpt: s.text,
			})),
		},
	};
};

const runGetMyDraft = async (tc: StudentToolContext): Promise<StudentToolResult> => {
	return {
		ok: true,
		capability: 'give_hint',
		data: {
			draft: tc.ctx.studentDraft,
			hasDraft: !tc.ctx.studentDraft.startsWith('(Belum ada draf'),
			submissionState: tc.ctx.state,
		},
	};
};

const runGetMyPreviousSubmission = async (
	tc: StudentToolContext,
): Promise<StudentToolResult> => {
	const { pb, user, ctx } = { pb: tc.pb, user: tc.user, ctx: tc.ctx };
	const a = ctx.assignment;
	let rows: AssignmentSubmission[] = [];
	try {
		rows = await pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({
			filter: pb.filter('assignment = {:a} && owner = {:o}', { a: a.id, o: user.id }),
			sort: '-created',
			perPage: 10,
		});
	} catch {
		rows = [];
	}
	const visible = rows.map((r) => ({
		status: r.status || 'draft',
		created: r.created,
		content: (r.content || '').slice(0, 4000),
		feedback: (r.feedback || '').slice(0, 2000),
		gradeLetter: letterGrade(r.grade),
	}));
	return {
		ok: true,
		capability: 'explain_error',
		data: { submissions: visible, count: visible.length },
	};
};

const runAnalyzeMyDraft = async (
	tc: StudentToolContext,
	args: Record<string, unknown>,
): Promise<StudentToolResult> => {
	const { ctx } = tc;
	const focus = typeof args.focus === 'string' ? args.focus.trim().slice(0, 500) : '';
	const system = [
		'Anda adalah "Asisten Belajar" LARAS. Analisis draf mahasiswa di bawah dan berikan',
		'umpan balik formatif: kekuatan, area yang paling perlu diperbaiki, dan saran spesifik',
		'yang bisa dilakukan. JANGAN menulis ulang jawaban. Tandai sebagai "Panduan AI" — bukan',
		'umpan balik dosen. Jawab ringkas dalam Bahasa Indonesia, maksimal ~180 kata.',
	].join(' ');
	const prompt = [
		`Tugas: ${ctx.assignment.title} (format: ${ctx.assignment.mode}).`,
		ctx.assignment.instructions ? `Instruksi:\n"""\n${ctx.assignment.instructions.slice(0, 3000)}\n"""` : '',
		ctx.assignment.requirements ? `Ketentuan/rubrik:\n"""\n${ctx.assignment.requirements.slice(0, 2000)}\n"""` : '',
		ctx.materialContext ? `Materi disetujui:\n"""\n${ctx.materialContext.slice(0, 4000)}\n"""` : '',
		focus ? `Fokus mahasiswa: ${focus}` : '',
		'Draf mahasiswa:',
		`"""\n${ctx.studentDraft.slice(0, 8000)}\n"""`,
	].filter(Boolean).join('\n');
	try {
		const raw = await collectModel(prompt, [], system);
		return {
			ok: true,
			capability: 'analyze_own_draft',
			data: { analysis: (raw || '').trim().slice(0, 4000) },
		};
	} catch {
		return {
			ok: false,
			capability: 'analyze_own_draft',
			error: { code: 'model_error', message: 'Analisis belum tersedia. Coba lagi beberapa saat.' },
		};
	}
};

const runExplainRequirement = async (
	tc: StudentToolContext,
	args: Record<string, unknown>,
): Promise<StudentToolResult> => {
	const { ctx } = tc;
	const requirement = typeof args.requirement === 'string' ? args.requirement.trim().slice(0, 500) : '';
	if (!requirement) {
		return {
			ok: false,
			capability: 'explain_instruction',
			error: { code: 'invalid_args', message: 'requirement wajib diisi.' },
		};
	}
	const system = [
		'Anda adalah "Asisten Belajar" LARAS. Jelaskan satu ketentuan/persyaratan tugas',
		'kepada mahasiswa dengan kata-kata sendiri, langkah demi langkah, agar mahasiswa',
		'memahami apa yang harus dilakukan. Jangan menulis jawaban. Jawab ringkas dalam',
		'Bahasa Indonesia, maksimal ~150 kata.',
	].join(' ');
	const prompt = [
		`Tugas: ${ctx.assignment.title}.`,
		ctx.assignment.instructions ? `Instruksi:\n"""\n${ctx.assignment.instructions.slice(0, 2000)}\n"""` : '',
		`Ketentuan yang ditanyakan: ${requirement}`,
		ctx.materialContext ? `Materi terkait:\n"""\n${ctx.materialContext.slice(0, 3000)}\n"""` : '',
	].filter(Boolean).join('\n');
	try {
		const raw = await collectModel(prompt, [], system);
		return {
			ok: true,
			capability: 'explain_instruction',
			data: { requirement, explanation: (raw || '').trim().slice(0, 3000) },
		};
	} catch {
		return {
			ok: false,
			capability: 'explain_instruction',
			error: { code: 'model_error', message: 'Penjelasan belum tersedia. Coba lagi beberapa saat.' },
		};
	}
};

const runGeneratePractice = async (
	tc: StudentToolContext,
	args: Record<string, unknown>,
): Promise<StudentToolResult> => {
	const { ctx } = tc;
	const topic = typeof args.topic === 'string' ? args.topic.trim().slice(0, 300) : '';
	const system = [
		'Anda adalah "Asisten Belajar" LARAS. Buatkan SATU latihan singkat terkait konsep',
		'tugas ini agar mahasiswa berlatih (bukan tugas itu sendiri). Sertakan jawaban/penjelasan',
		'singkat agar mahasiswa bisa mengecek sendiri. Jawab ringkas dalam Bahasa Indonesia,',
		'maksimal ~200 kata.',
	].join(' ');
	const prompt = [
		`Tugas: ${ctx.assignment.title} (format: ${ctx.assignment.mode}).`,
		ctx.assignment.instructions ? `Instruksi:\n"""\n${ctx.assignment.instructions.slice(0, 2000)}\n"""` : '',
		topic ? `Topik fokus: ${topic}` : 'Topik: konsep utama tugas ini.',
		ctx.materialContext ? `Materi terkait:\n"""\n${ctx.materialContext.slice(0, 3000)}\n"""` : '',
	].filter(Boolean).join('\n');
	try {
		const raw = await collectModel(prompt, [], system);
		return {
			ok: true,
			capability: 'generate_practice',
			data: { practice: (raw || '').trim().slice(0, 4000) },
		};
	} catch {
		return {
			ok: false,
			capability: 'generate_practice',
			error: { code: 'model_error', message: 'Latihan belum tersedia. Coba lagi beberapa saat.' },
		};
	}
};

// ── Registry ────────────────────────────────────────────────

export const STUDENT_TOOL_REGISTRY: ReadonlyMap<string, StudentToolDefinition> = new Map<
	string,
	StudentToolDefinition
>([
	['get_current_assignment', {
		name: 'get_current_assignment',
		description: 'Mengambil ringkasan tugas saat ini (judul, format, jenis, tenggat, status).',
		capability: 'explain_instruction',
		inputSchema: { type: 'object', properties: {} },
		execute: runGetCurrentAssignment,
	}],
	['get_assignment_instructions', {
		name: 'get_assignment_instructions',
		description: 'Mengambil instruksi dan ketentuan tugas yang terlihat mahasiswa.',
		capability: 'explain_instruction',
		inputSchema: { type: 'object', properties: {} },
		execute: runGetAssignmentInstructions,
	}],
	['get_allowed_course_materials', {
		name: 'get_allowed_course_materials',
		description: 'Mengambil materi mata kuliah yang disetujui dosen untuk tugas ini.',
		capability: 'explain_concept',
		inputSchema: { type: 'object', properties: {} },
		execute: runGetAllowedCourseMaterials,
	}],
	['get_my_draft', {
		name: 'get_my_draft',
		description: 'Mengambil draf/jawaban mahasiswa sendiri saat ini.',
		capability: 'give_hint',
		inputSchema: { type: 'object', properties: {} },
		execute: runGetMyDraft,
	}],
	['get_my_previous_submission', {
		name: 'get_my_previous_submission',
		description: 'Mengambil pengumpulan dan umpan balik mahasiswa sendiri sebelumnya.',
		capability: 'explain_error',
		inputSchema: { type: 'object', properties: {} },
		execute: runGetMyPreviousSubmission,
	}],
	['analyze_my_draft', {
		name: 'analyze_my_draft',
		description: 'Menganalisis draf mahasiswa dan memberi umpan balik formatif (panduan AI).',
		capability: 'analyze_own_draft',
		inputSchema: {
			type: 'object',
			properties: { focus: { type: 'string', description: 'Aspek yang ingin dianalisis (opsional)' } },
		},
		execute: runAnalyzeMyDraft,
	}],
	['explain_assignment_requirement', {
		name: 'explain_assignment_requirement',
		description: 'Menjelaskan satu ketentuan/persyaratan tugas secara langkah demi langkah.',
		capability: 'explain_instruction',
		inputSchema: {
			type: 'object',
			properties: { requirement: { type: 'string', description: 'Ketentuan yang ditanyakan (wajib)', required: true } },
			required: ['requirement'],
		},
		execute: runExplainRequirement,
	}],
	['generate_practice_activity', {
		name: 'generate_practice_activity',
		description: 'Membuat satu latihan singkat terkait konsep tugas ini.',
		capability: 'generate_practice',
		inputSchema: {
			type: 'object',
			properties: { topic: { type: 'string', description: 'Topik fokus latihan (opsional)' } },
		},
		execute: runGeneratePractice,
	}],
]);

export const STUDENT_TOOL_NAMES: StudentToolName[] = [
	'get_current_assignment',
	'get_assignment_instructions',
	'get_allowed_course_materials',
	'get_my_draft',
	'get_my_previous_submission',
	'analyze_my_draft',
	'explain_assignment_requirement',
	'generate_practice_activity',
];

export function getStudentToolDefinition(name: string): StudentToolDefinition | undefined {
	return STUDENT_TOOL_REGISTRY.get(name);
}

export function isStudentToolName(name: string): name is StudentToolName {
	return STUDENT_TOOL_REGISTRY.has(name);
}

// ── Argument validation ─────────────────────────────────────

export type ToolValidation = { ok: true; args: Record<string, unknown> } | { ok: false; errors: string[] };

export function validateStudentToolArgs(
	def: StudentToolDefinition,
	rawArgs: Record<string, unknown>,
): ToolValidation {
	const errors: string[] = [];
	const cleaned: Record<string, unknown> = {};
	for (const [key, spec] of Object.entries(def.inputSchema.properties)) {
		const value = rawArgs[key];
		if (value === undefined || value === null || value === '') {
			if (spec.required || def.inputSchema.required?.includes(key)) {
				errors.push(`Argumen wajib "${key}" tidak boleh kosong.`);
			}
			continue;
		}
		if (spec.type === 'number') {
			const num = typeof value === 'number' ? value : Number(value);
			if (!Number.isFinite(num)) {
				errors.push(`Argumen "${key}" harus berupa angka.`);
				continue;
			}
			cleaned[key] = num;
		} else if (spec.type === 'boolean') {
			cleaned[key] = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
		} else {
			cleaned[key] = typeof value === 'string' ? value : String(value);
		}
		if (spec.enum && !spec.enum.includes(String(cleaned[key]))) {
			errors.push(`Argumen "${key}" harus salah satu dari: ${spec.enum.join(', ')}.`);
		}
	}
	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, args: cleaned };
}

// ── Audit ───────────────────────────────────────────────────

type AuditOutcome = 'success' | 'denied' | 'failure';

/**
 * Records one tool invocation. Written with the student's own token (the
 * audit collection's createRule allows owner = auth.id). The write is
 * non-fatal: a logging failure never breaks a legitimate tool call. Students
 * can never read these rows (list/view rules are null).
 */
async function recordToolAudit(
	pb: PocketBase,
	input: {
		owner: string;
		assignment: string;
		course: string;
		tool: string;
		capability: string;
		params: Record<string, unknown>;
		outcome: AuditOutcome;
		errorMessage?: string;
	},
): Promise<void> {
	try {
		await pb.collection(AUDIT_COLLECTION).create({
			owner: input.owner,
			assignment: input.assignment,
			course: input.course || null,
			tool: input.tool,
			capability: input.capability,
			params: input.params,
			result: input.outcome,
			errorMessage: (input.errorMessage || '').slice(0, 500) || null,
		});
	} catch (error) {
		logger.error(
			`student tool audit write failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

// ── Invocation (the gate) ───────────────────────────────────

export type InvokeStudentToolInput = {
	pb: PocketBase;
	user: AuthedUser;
	assignmentId: string;
	tool: string;
	params: Record<string, unknown>;
};

export type InvokeStudentToolOutcome =
	| { ok: true; result: StudentToolResult; audited: boolean }
	| { ok: false; status: number; message: string; audited: boolean };

/**
 * Resolve context, verify enrollment, authorize the tool's capability against
 * the assignment policy, gate by submission state, validate args, execute, and
 * audit — in that order. Returns a ready-to-return denial on any failure.
 *
 * This is the single entry point every student tool call goes through; the
 * model never bypasses it. A denied/failed call is still audited.
 */
export async function invokeStudentTool(
	input: InvokeStudentToolInput,
): Promise<InvokeStudentToolOutcome> {
	const { pb, user, assignmentId, tool, params } = input;

	const def = STUDENT_TOOL_REGISTRY.get(tool);
	if (!def) {
		await recordToolAudit(pb, {
			owner: user.id,
			assignment: assignmentId,
			course: '',
			tool,
			capability: 'unknown',
			params,
			outcome: 'denied',
			errorMessage: 'Tool tidak dikenali.',
		});
		return { ok: false, status: 422, message: 'Tool tidak dikenali.', audited: true };
	}

	// 1. Resolve the student-authorized context (policy + assignment + draft).
	const ctxResult = await loadAssistantContext({ pb, user, assignmentId });
	if (!ctxResult.ok) {
		await recordToolAudit(pb, {
			owner: user.id,
			assignment: assignmentId,
			course: '',
			tool,
			capability: def.capability,
			params,
			outcome: 'denied',
			errorMessage: ctxResult.message,
		});
		return { ok: false, status: ctxResult.status, message: ctxResult.message, audited: true };
	}
	const ctx = ctxResult.context;
	const policy = resolveAssignmentPolicy(ctx.assignment);

	// 2. Enrollment scope gate (students must be enrolled in the course).
	const enrolled = await verifyEnrollment(pb, user, ctx.courseId);
	if (!enrolled) {
		await recordToolAudit(pb, {
			owner: user.id,
			assignment: assignmentId,
			course: ctx.courseId,
			tool,
			capability: def.capability,
			params,
			outcome: 'denied',
			errorMessage: 'Mahasiswa tidak terdaftar pada mata kuliah ini.',
		});
		return {
			ok: false,
			status: 403,
			message: 'Anda belum terdaftar pada mata kuliah tugas ini.',
			audited: true,
		};
	}

	// 3. Policy capability gate.
	const auth = authorizeCapability(policy, def.capability);
	if (!auth.ok) {
		await recordToolAudit(pb, {
			owner: user.id,
			assignment: assignmentId,
			course: ctx.courseId,
			tool,
			capability: def.capability,
			params,
			outcome: 'denied',
			errorMessage: auth.message,
		});
		return { ok: false, status: auth.status, message: auth.message, audited: true };
	}

	// 4. Submission-state gate.
	const availability = toolStateAvailability(def.name, ctx.state, ctx.formative);
	if (!availability.available) {
		await recordToolAudit(pb, {
			owner: user.id,
			assignment: assignmentId,
			course: ctx.courseId,
			tool,
			capability: def.capability,
			params,
			outcome: 'denied',
			errorMessage: availability.reason,
		});
		return { ok: false, status: 422, message: availability.reason || 'Tidak tersedia.', audited: true };
	}

	// 5. Argument validation.
	const validation = validateStudentToolArgs(def, params || {});
	if (!validation.ok) {
		await recordToolAudit(pb, {
			owner: user.id,
			assignment: assignmentId,
			course: ctx.courseId,
			tool,
			capability: def.capability,
			params,
			outcome: 'denied',
			errorMessage: validation.errors.join(' '),
		});
		return { ok: false, status: 422, message: validation.errors.join(' '), audited: true };
	}

	// 6. Execute.
	const tc: StudentToolContext = { pb, user, ctx, policy };
	try {
		const result = await def.execute(tc, validation.args);
		const outcome: AuditOutcome = result.ok ? 'success' : 'failure';
		await recordToolAudit(pb, {
			owner: user.id,
			assignment: assignmentId,
			course: ctx.courseId,
			tool,
			capability: def.capability,
			params: validation.args,
			outcome,
			errorMessage: result.ok ? undefined : result.error.message,
		});
		return { ok: true, result, audited: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Gagal menjalankan tool.';
		await recordToolAudit(pb, {
			owner: user.id,
			assignment: assignmentId,
			course: ctx.courseId,
			tool,
			capability: def.capability,
			params: validation.args,
			outcome: 'failure',
			errorMessage: message,
		});
		return { ok: false, status: 500, message, audited: true };
	}
}

// Re-export the shared resolution so the API route has one import surface.
export { resolveStudentAiPolicy, submissionStateOf };
