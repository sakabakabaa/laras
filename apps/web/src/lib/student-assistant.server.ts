/**
 * Phase 2 — Student Learning Assistant (server-side).
 *
 * A tutor-first AI assistant for enrolled students, built on the existing
 * model invocation (`collectModel`), the Phase 1 AI assistance policy
 * (`resolveStudentAiPolicy` / `authorizeCapability`), and the Phase 5
 * context-retrieval layer (`retrieveContextBundle`). It is NOT a second AI
 * architecture — it reuses the same model client, policy gate, and grounded
 * context the formative-check and practice-assist flows already use.
 *
 * Design principles:
 *   - "Tutor first, answer second": help the student understand, practice,
 *     and improve their own work; never complete assessed work for them.
 *   - Context-aware: the assistant loads the assignment, the student's own
 *     submission/draft, the submission state, and lecturer-approved
 *     materials — the student never re-explains what they are working on.
 *   - Only student-authorized data reaches the model (sanitizeStudentContext).
 *   - Submission-aware: after a formal submission is under review, the
 *     assistant will not generate or analyze replacement answers.
 *   - Helpful refusal: never a bare "I can't help"; always redirect to an
 *     allowed alternative.
 */
import type PocketBase from 'pocketbase';
import { collectModel } from '@/lib/task-assist.server';
import {
	authenticateUser,
	cpmkOfSubCpmk,
	retrieveContextBundle,
} from '@/lib/context-retrieval.server';
import {
	resolveStudentAiPolicy,
	authorizeCapability,
	sanitizeStudentContext,
} from '@/lib/ai-policy.server';
import {
	ASSISTANCE_LEVEL_DESCRIPTION,
	ASSISTANCE_LEVEL_LABEL,
	resolveAssignmentPolicy,
} from '@/lib/ai-policy';
import type { Capability } from '@/lib/ai-capabilities';
import { activityTypeOf, type Assignment, type AssignmentSubmission } from '@/lib/assignments';
import type { AuthedUser } from '@/lib/context-retrieval.server';
import { parseStructuredContentFromConfig, structuredChecklist } from '@/lib/structured-assignment';

// ── Modes ────────────────────────────────────────────────────

export type AssistantMode =
	| 'chat'
	| 'explain_instruction'
	| 'give_hint'
	| 'explain_grammar'
	| 'vocabulary'
	| 'check_draft'
	| 'give_practice'
	| 'explain_mistake';

/** Each mode invokes exactly one controlled capability. */
export const MODE_CAPABILITY: Record<AssistantMode, Capability> = {
	chat: 'give_hint',
	explain_instruction: 'explain_instruction',
	give_hint: 'give_hint',
	explain_grammar: 'grammar_help',
	vocabulary: 'vocabulary_help',
	check_draft: 'analyze_own_draft',
	give_practice: 'generate_practice',
	explain_mistake: 'explain_error',
};

/** Whether a mode analyzes the student's response (Feedback) vs helps while working (Bantuan AI). */
export const MODE_KIND: Record<AssistantMode, 'help' | 'feedback'> = {
	chat: 'help',
	explain_instruction: 'help',
	give_hint: 'help',
	explain_grammar: 'help',
	vocabulary: 'help',
	check_draft: 'feedback',
	give_practice: 'help',
	explain_mistake: 'feedback',
};

export const MODE_LABEL: Record<AssistantMode, string> = {
	chat: 'Tanya asisten',
	explain_instruction: 'Jelaskan instruksi',
	give_hint: 'Beri petunjuk',
	explain_grammar: 'Jelaskan tata bahasa',
	vocabulary: 'Bantuan kosakata',
	check_draft: 'Periksa draf saya',
	give_practice: 'Buat latihan',
	explain_mistake: 'Jelaskan kesalahan',
};

export const MODE_DESCRIPTION: Record<AssistantMode, string> = {
	chat: 'Tanya apa saja seputar tugas ini.',
	explain_instruction: 'Pahami apa yang harus dikerjakan, langkah demi langkah.',
	give_hint: 'Dapatkan petunjuk bertahap — bukan jawaban langsung.',
	explain_grammar: 'Pahami konsep tata bahasa yang relevan.',
	vocabulary: 'Bantuan arti, penggunaan, dan contoh kosakata.',
	check_draft: 'Analisis draf Anda dan dapatkan umpan balik formatif.',
	give_practice: 'Latihan singkat terkait konsep tugas ini.',
	explain_mistake: 'Pahami kesalahan pada jawaban/umpan balik Anda.',
};

/** Modes offered as quick contextual actions in the UI. */
export const QUICK_MODES: AssistantMode[] = [
	'explain_instruction',
	'give_hint',
	'explain_grammar',
	'vocabulary',
	'check_draft',
	'give_practice',
	'explain_mistake',
];

// ── Submission state ─────────────────────────────────────────

export type SubmissionState = 'drafting' | 'submitted' | 'revision' | 'completed';

export const SUBMISSION_STATE_LABEL: Record<SubmissionState, string> = {
	drafting: 'Sedang mengerjakan',
	submitted: 'Sudah dikumpulkan — menunggu penilaian',
	revision: 'Perlu revisi',
	completed: 'Sudah dinilai',
};

export function submissionStateOf(
	submission: AssignmentSubmission | null,
): SubmissionState {
	if (!submission) return 'drafting';
	const status = submission.status;
	if (status === 'revision') return 'revision';
	if (status === 'graded') return 'completed';
	if (status === 'draft' || !status) return 'drafting';
	return 'submitted'; // submitted | late → under review
}

/**
 * Whether a mode is available given the submission state. After a formal
 * submission is under review, the assistant will not analyze or generate
 * replacement answers — only explain instructions, concepts, grammar, and
 * vocabulary. Revision restores full help; completion enables mistake
 * explanation and draft analysis for learning.
 */
export function modeAvailability(
	mode: AssistantMode,
	state: SubmissionState,
	formative: boolean,
): { available: boolean; reason?: string } {
	// Formative practice is never "under review" — it stays fully available.
	if (formative || state === 'drafting' || state === 'revision') {
		return { available: true };
	}
	if (state === 'submitted') {
		const allowed: AssistantMode[] = [
			'explain_instruction',
			'give_hint',
			'explain_grammar',
			'vocabulary',
		];
		if (allowed.includes(mode)) return { available: true };
		return {
			available: false,
			reason:
				'Tugas ini sudah dikumpulkan dan sedang dinilai. Saya bisa menjelaskan instruksi, konsep, tata bahasa, atau kosakata — tapi tidak bisa menganalisis atau menulis jawaban baru. Setelah dinilai, saya bisa menjelaskan umpan balik dosen.',
		};
	}
	// completed (graded): enable learning-oriented analysis of the submitted work.
	if (mode === 'give_practice') return { available: true };
	return { available: true };
}

// ── Hint ladder ─────────────────────────────────────────────

export const HINT_LEVEL_LABEL: Record<number, string> = {
	1: 'Petunjuk konsep',
	2: 'Penjelasan aturan',
	3: 'Struktur/contoh sebagian',
	4: 'Umpan balik terarah',
};

const HINT_LEVEL_INSTRUCTION: Record<number, string> = {
	1: 'Tingkat 1 — petunjuk konseptual: arahkan mahasiswa ke konsep atau prinsip yang relevan TANPA menyebut jawaban. Ajukan pertanyaan pemandu yang membantu mahasiswa berpikir sendiri.',
	2: 'Tingkat 2 — jelaskan aturan/konsep yang relevan lebih rinci, tetap tanpa jawaban langsung dan tanpa contoh yang tinggal disalin.',
	3: 'Tingkat 3 — berikan struktur atau contoh sebagian (bukan jawaban lengkap) untuk membantu mahasiswa memulai. Tetap biarkan mahasiswa menulis sendiri.',
	4: 'Tingkat 4 — umpan balik terarah pada upaya mahasiswa: koreksi bentuk yang salah disertai penjelasan singkat mengapa. Hanya pada tingkat ini boleh menuliskan koreksi langsung; tetap ringkas, jangan menulis ulang seluruh jawaban.',
};

// ── Chat record ─────────────────────────────────────────────

export type AssistantMessage = {
	role: 'user' | 'assistant';
	content: string;
	mode?: AssistantMode;
	level?: number;
	kind: 'help' | 'feedback';
	createdAt: string;
};

export type AssistantChat = {
	id: string;
	owner: string;
	assignment: string;
	course: string;
	messages: AssistantMessage[];
	hintLevel: number;
	created: string;
	updated: string;
};

const MAX_STORED = 40;
const MAX_HISTORY = 10;

const clip = (value: string | undefined | null, max: number) => {
	const text = (value || '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
};

// ── Draft rendering ─────────────────────────────────────────

/**
 * Render the student's own current draft/submission as readable text for the
 * model. Works from the stored submission only (the autosaved draft) — never
 * from unsaved editor state, and never from other students' work.
 */
export function renderStudentDraft(submission: AssignmentSubmission | null): string {
	if (!submission) return '(Belum ada draf — mahasiswa belum menulis apa pun.)';
	const parts: string[] = [];
	if (submission.content?.trim()) parts.push(submission.content.trim());
	if (submission.link?.trim()) parts.push(`Tautan: ${submission.link.trim()}`);
	const ta = submission.taskAnswers as
		| { writing?: { answers?: Record<string, { content?: string }> }; quiz?: { answers?: Record<string, unknown> } }
		| null;
	if (ta?.writing?.answers) {
		const ans = Object.values(ta.writing.answers)
			.map((v) => v?.content?.trim())
			.filter(Boolean);
		if (ans.length) parts.push(ans.join('\n\n'));
	}
	if (ta?.quiz?.answers && Object.keys(ta.quiz.answers).length) {
		parts.push(`Jawaban pilihan: ${JSON.stringify(ta.quiz.answers)}`);
	}
	if (submission.files && submission.files.length) {
		parts.push(`Lampiran: ${submission.files.join(', ')}`);
	}
	return parts.join('\n\n') || '(Belum ada draf — mahasiswa belum menulis apa pun.)';
}

// ── Context resolution ───────────────────────────────────────

export type AssistantContext = {
	assignment: Assignment;
	courseId: string;
	submission: AssignmentSubmission | null;
	state: SubmissionState;
	formative: boolean;
	policyLabel: string;
	policyDescription: string;
	materialContext: string;
	materialsResult: 'sufficient' | 'insufficient';
	materialsReason: string;
	studentDraft: string;
};

/**
 * Resolve the full student-authorized context for one assignment: the
 * assignment (rule-enforced read), the student's own submission, the
 * submission state, the Phase 1 policy, and lecturer-approved materials.
 * Returns a ready-to-return API error on auth/policy failure.
 */
export async function loadAssistantContext(input: {
	pb: PocketBase;
	user: AuthedUser;
	assignmentId: string;
}): Promise<{ ok: true; context: AssistantContext } | { ok: false; status: number; message: string }> {
	const { pb, user, assignmentId } = input;
	const resolution = await resolveStudentAiPolicy({ pb, assignmentId });
	if (!resolution.ok) {
		return { ok: false, status: resolution.status, message: resolution.message };
	}
	const { assignment, policy } = resolution;
	const formative = activityTypeOf(assignment) === 'formative';

	let submission: AssignmentSubmission | null = null;
	try {
		const rows = await pb.collection('assignment_submissions').getList<AssignmentSubmission>(1, 1, {
			filter: pb.filter('assignment = {:a} && owner = {:o}', { a: assignmentId, o: user.id }),
			sort: '-updated',
		});
		submission = rows.items[0] || null;
	} catch {
		submission = null;
	}
	const state = submissionStateOf(submission);

	// Lecturer-approved, role-filtered materials (Phase 5 bundle). Student
	// scope = assignment's course/session/sub-CPMK/CPMK. Documents only here
	// (text-grounded); the assistant is a text tutor.
	const cpmk = await cpmkOfSubCpmk(assignment.subCpmk || '');
	const bundle = await retrieveContextBundle({
		feature: 'check',
		scope: {
			course: assignment.course,
			session: assignment.session || '',
			subCpmk: assignment.subCpmk || '',
			cpmk,
			assignment: assignment.id,
		},
		requester: {
			id: user.id,
			role: user.role === 'faculty' ? 'faculty' : 'student',
			label: `student:${user.id}`,
		},
		ownerLecturerId: assignment.owner,
	});
	const materialContext = bundle.sources
		.map((source) => {
			const sections = source.sections.map((s) => s.label).join(', ');
			return [
				`Materi: "${source.title}"${sections ? ` — bagian: ${sections}` : ''}`,
				source.text,
			]
				.filter(Boolean)
				.join('\n');
		})
		.join('\n\n');

	return {
		ok: true,
		context: {
			assignment,
			courseId: assignment.course,
			submission,
			state,
			formative,
			policyLabel: ASSISTANCE_LEVEL_LABEL[policy.assistanceLevel],
			policyDescription: ASSISTANCE_LEVEL_DESCRIPTION[policy.assistanceLevel],
			materialContext,
			materialsResult: bundle.result,
			materialsReason: bundle.result === 'insufficient' ? bundle.reason : '',
			studentDraft: renderStudentDraft(submission),
		},
	};
}

// ── System prompt ────────────────────────────────────────────

function buildSystemPrompt(ctx: AssistantContext, mode: AssistantMode, level: number): string {
	const stateLine =
		ctx.state === 'drafting'
			? 'Status: mahasiswa sedang mengerjakan (draf).'
			: ctx.state === 'revision'
				? 'Status: dosen meminta revisi — mahasiswa boleh memperbaiki dan mengumpulkan ulang.'
				: ctx.state === 'submitted'
					? 'Status: tugas formal sudah dikumpulkan dan sedang dinilai. JANGAN membantu menulis, menganalisis, atau mengganti jawaban. Hanya jelaskan instruksi, konsep, tata bahasa, atau kosakata.'
					: 'Status: tugas sudah dinilai. Mahasiswa boleh belajar dari umpan balik dan menjelaskan kesalahannya.';

	return [
		'Anda adalah "Asisten Belajar" LARAS — tutor belajar untuk mahasiswa, dalam Bahasa Indonesia.',
		'Prinsip utama: "Tutor dulu, jawaban kedua." Anda membantu mahasiswa memahami, berlatih, dan memperbaiki pekerjaan mereka sendiri — bukan menyelesaikan tugas untuk mereka.',
		`Tingkat bantuan tugas ini: ${ctx.policyLabel} — ${ctx.policyDescription}`,
		stateLine,
		'',
		'Aturan:',
		'- Bekerja HANYA dari instruksi tugas, materi yang disetujui dosen, dan draf/jawaban mahasiswa yang benar-benar dikirim. Jangan mengarang fakta, materi, atau kriteria yang tidak ada.',
		'- JANGAN menyusun jawaban lengkap, menyelesaikan tugas, atau menulis ulang seluruh jawaban mahasiswa.',
		'- Jika mahasiswa meminta jawaban langsung, JANGAN menolak mentah-mentah. Arahkan ke petunjuk bertahap atau alternatif yang diizinkan, mis: "Saya tidak bisa menulis jawaban lengkap untuk tugas ini, tapi saya bisa membantu menyusunnya. Mari mulai dari kalimat pertama."',
		'- Bedakan "Bantuan AI" (bantuan saat mengerjakan) dari "Feedback" (analisis jawaban mahasiswa). Jangan membuat feedback terlihat seperti umpan balik dosen — sebut sebagai panduan AI formatif.',
		'- Tetap membantu setelah menolak: tawarkan alternatif yang diizinkan.',
		'- Jawab ringkas, hangat, dan dalam Bahasa Indonesia. Maksimal ~180 kata kecuali diminta lebih rinci.',
		'- Jangan menyebutkan kebijakan AI, tingkat bantuan, atau istilah teknis internal kepada mahasiswa.',
	].join('\n');
}

const MODE_INSTRUCTION: Record<AssistantMode, string> = {
	chat: 'Balas pertanyaan mahasiswa sebagai tutor. Bantu memahami, bukan menyelesaikan.',
	explain_instruction:
		'Jelaskan instruksi tugas ini dengan kata-kata sendiri, langkah demi langkah, agar mahasiswa memahami apa yang harus dilakukan. Jika instruksi ambigu, bantu menguraikan apa yang mungkin dimaksud.',
	give_hint: '',
	explain_grammar:
		'Jelaskan konsep tata bahasa yang relevan dengan tugas/pertanyaan mahasiswa. Berikan aturan dan contoh minimal yang bukan dari jawaban mahasiswa.',
	vocabulary:
		'Bantu dengan kosakata: arti, penggunaan dalam konteks, dan contoh singkat. Jangan menerjemahkan seluruh jawaban mahasiswa.',
	check_draft:
		'Analisis draf/jawaban mahasiswa di bawah. Berikan umpan balik formatif: kekuatan, area yang paling perlu diperbaiki, dan saran spesifik yang bisa dilakukan. JANGAN menulis ulang jawaban. Tandai ini sebagai "Panduan AI" — bukan umpan balik dosen.',
	give_practice:
		'Buatkan satu latihan singkat terkait konsep/tugas ini agar mahasiswa berlatih (bukan tugas itu sendiri). Sertakan jawaban/penjelasan singkat agar mahasiswa bisa mengecek sendiri.',
	explain_mistake:
		'Jelaskan kesalahan pada jawaban/umpan balik mahasiswa: apa yang salah, mengapa, dan cara memperbaikinya. Gunakan bahasa suportif. Jangan menulis ulang seluruh jawaban.',
};

// ── Response building ───────────────────────────────────────

export type AssistantTurnResult = {
	text: string;
	mode: AssistantMode;
	level: number;
	kind: 'help' | 'feedback';
	nextHintLevel: number;
	/** True only when the model was actually invoked (usage is committed then). */
	modelCalled: boolean;
};

/**
 * Build one assistant turn: authorize the mode's capability against the
 * policy, gate it by submission state, build the grounded prompt, and call
 * the model. Returns a helpful redirect message (not an error) when the
 * capability is restricted or the submission state forbids it.
 */
export async function buildAssistantTurn(input: {
	ctx: AssistantContext;
	policy: ReturnType<typeof resolveAssignmentPolicy>;
	mode: AssistantMode;
	message: string;
	history: AssistantMessage[];
	currentHintLevel: number;
}): Promise<AssistantTurnResult> {
	const { ctx, policy, mode, message, history, currentHintLevel } = input;

	// 1. Submission-state gate (on top of the policy).
	const availability = modeAvailability(mode, ctx.state, ctx.formative);
	if (!availability.available) {
		return {
			text: availability.reason || 'Bantuan ini tidak tersedia pada status tugas saat ini.',
			mode,
			level: 0,
			kind: MODE_KIND[mode],
			nextHintLevel: currentHintLevel,
			modelCalled: false,
		};
	}

	// 2. Policy gate (Phase 1).
	const capability = MODE_CAPABILITY[mode];
	const decision = authorizeCapability(policy, capability);
	if (!decision.ok) {
		// Helpful refusal: explain the boundary and redirect to an allowed alternative.
		const redirect = helpfulRefusal(mode, ctx);
		return {
			text: redirect,
			mode,
			level: 0,
			kind: MODE_KIND[mode],
			nextHintLevel: currentHintLevel,
			modelCalled: false,
		};
	}

	// 3. Hint ladder for give_hint.
	let level = currentHintLevel;
	let nextHintLevel = currentHintLevel;
	if (mode === 'give_hint') {
		level = Math.min(currentHintLevel, 4);
		// Level 4 requires a draft; if none, cap at 3.
		if (level >= 4 && ctx.studentDraft.startsWith('(Belum ada draf')) {
			level = 3;
		}
		nextHintLevel = Math.min(level + 1, 4);
	}

	// 4. Sanitize context (filter before the model).
	const sanitized = sanitizeStudentContext({
		studentResponse: ctx.studentDraft,
		instructions: ctx.assignment.instructions,
		requirements: ctx.assignment.requirements,
		materialContext: ctx.materialContext,
		focus: message,
	});

	// Structured assignment context (task summary + "Yang harus ada") so the
	// assistant understands the task shape without re-analyzing it. The
	// structured requirements never bypass the assignment AI policy — the
	// policy gate above already authorized the mode's capability.
	const structured = parseStructuredContentFromConfig(ctx.assignment.taskConfig);
	const structuredText = structured
		? [
				`Ringkasan: ${structured.summary}`,
				structured.taskType ? `Jenis tugas: ${structured.taskType}` : '',
				`Format respons: ${structured.responseFormat}`,
				structured.language ? `Bahasa: ${structured.language}` : '',
				structuredChecklist(structured).length
					? `Yang harus ada: ${structuredChecklist(structured).map((i) => i.label).join('; ')}`
					: '',
			]
				.filter(Boolean)
				.join('\n')
		: '';

	const modeInstruction =
		mode === 'give_hint' ? HINT_LEVEL_INSTRUCTION[level] : MODE_INSTRUCTION[mode];

	const historyBlock = history
		.slice(-MAX_HISTORY)
		.map((m) => `${m.role === 'user' ? 'Mahasiswa' : 'Asisten'}: ${m.content}`)
		.join('\n');

	const prompt = [
		modeInstruction,
		'',
		`Tugas: ${clip(ctx.assignment.title, 200)} (format kerja: ${ctx.assignment.mode}).`,
		sanitized.instructions
			? `Instruksi tugas dosen:\n"""\n${sanitized.instructions}\n"""`
			: 'Instruksi tugas dosen: (tidak ada)',
		sanitized.requirements
			? `Ketentuan/rubrik tertulis dosen:\n"""\n${sanitized.requirements}\n"""`
			: '',
		structuredText
			? `Struktur tugas (ringkasan + "Yang harus ada"):\n"""\n${structuredText}\n"""`
			: '',
		sanitized.materialContext
			? `Materi mata kuliah yang disetujui dosen (satu-satunya materi sumber):\n"""\n${sanitized.materialContext}\n"""`
			: 'Materi mata kuliah yang disetujui dosen: (belum ada — gunakan instruksi dan ketentuan saja).',
		sanitized.focus ? `Pertanyaan/fokus mahasiswa: ${sanitized.focus}` : '',
		'Draf/jawaban mahasiswa saat ini (bekerjalah dari isi ini; jika kosong, bantu mahasiswa memulai):',
		`"""\n${sanitized.studentResponse}\n"""`,
		historyBlock ? `\nRiwayat percakapan singkat:\n${historyBlock}` : '',
	].join('\n');

	const system = buildSystemPrompt(ctx, mode, level);

	try {
		const raw = await collectModel(prompt, [], system);
		const text = (raw || '').trim() || 'Maaf, saya belum bisa menjawab saat ini. Coba tulis ulang pertanyaan Anda.';
		return {
			text: text.slice(0, 4000),
			mode,
			level: mode === 'give_hint' ? level : 0,
			kind: MODE_KIND[mode],
			nextHintLevel,
			modelCalled: true,
		};
	} catch {
		return {
			text: 'Asisten AI sedang tidak tersedia. Coba lagi beberapa saat — sementara itu, Anda bisa membaca instruksi tugas atau menggunakan Cek jawaban.',
			mode,
			level: mode === 'give_hint' ? level : 0,
			kind: MODE_KIND[mode],
			nextHintLevel: currentHintLevel,
			modelCalled: false,
		};
	}
}

/**
 * A helpful refusal that explains the boundary and redirects to an allowed
 * alternative — never a bare "I can't help with that."
 */
function helpfulRefusal(mode: AssistantMode, ctx: AssistantContext): string {
	const base = 'Bantuan jenis ini tidak tersedia untuk tugas ini.';
	if (mode === 'check_draft' || mode === 'explain_mistake') {
		if (ctx.state === 'submitted') {
			return `${base} Tugas sudah dikumpulkan dan sedang dinilai, jadi saya tidak bisa menganalisis jawaban baru. Saya bisa menjelaskan instruksi, konsep, atau tata bahasa — atau Anda bisa menunggu umpan balik dosen setelah dinilai.`;
		}
		return `${base} Saya tidak bisa menulis atau menyusun jawaban untuk Anda, tapi saya bisa memberi petunjuk bertahap, menjelaskan konsep, atau membantu kosakata. Mau mulai dari mana?`;
	}
	if (mode === 'give_practice') {
		return `${base} Saya tidak bisa membuat latihan untuk tugas ini, tapi saya bisa menjelaskan konsep atau memberi petunjuk. Mau saya jelaskan konsep utamanya?`;
	}
	return `${base} Saya tidak bisa menyusun atau menyelesaikan jawaban untuk Anda, tapi saya bisa membantu memahami instruksi, menjelaskan konsep, memberi petunjuk bertahap, atau membantu kosakata. Coba salah satunya — saya bantu sampai Anda bisa menulis sendiri.`;
}

// ── Chat persistence ────────────────────────────────────────

/** Load (or implicitly create) the student's chat record for an assignment. */
export async function loadChat(
	pb: PocketBase,
	user: AuthedUser,
	assignmentId: string,
	courseId: string,
): Promise<AssistantChat> {
	const filter = pb.filter('assignment = {:a} && owner = {:o}', { a: assignmentId, o: user.id });
	try {
		const rows = await pb.collection('student_assistant_chats').getList<AssistantChat>(1, 1, {
			filter,
			sort: '-updated',
		});
		if (rows.items[0]) return rows.items[0];
	} catch {
		/* fall through to create */
	}
	try {
		const created = await pb.collection('student_assistant_chats').create<AssistantChat>({
			owner: user.id,
			assignment: assignmentId,
			course: courseId,
			messages: [],
			hintLevel: 1,
		});
		return created;
	} catch {
		// Concurrent create lost the unique-(owner,assignment) race — re-query.
		const rows = await pb.collection('student_assistant_chats').getList<AssistantChat>(1, 1, {
			filter,
			sort: '-updated',
		});
		if (rows.items[0]) return rows.items[0];
		throw new Error('Tidak dapat memuat percakapan asisten.');
	}
}

/** Append a user + assistant message pair and persist (capped history). */
export async function appendMessages(
	pb: PocketBase,
	chatId: string,
	userMessage: AssistantMessage,
	assistantMessage: AssistantMessage,
	nextHintLevel: number,
): Promise<AssistantChat> {
	const existing = await pb.collection('student_assistant_chats').getOne<AssistantChat>(chatId);
	const messages = [...(existing.messages || []), userMessage, assistantMessage].slice(-MAX_STORED);
	const updated = await pb.collection('student_assistant_chats').update<AssistantChat>(chatId, {
		messages,
		hintLevel: nextHintLevel,
	});
	return updated;
}

/** Clear the conversation (keep the record, reset messages + hint level). */
export async function clearChat(pb: PocketBase, chatId: string): Promise<void> {
	await pb.collection('student_assistant_chats').update(chatId, {
		messages: [],
		hintLevel: 1,
	});
}

export { authenticateUser };
