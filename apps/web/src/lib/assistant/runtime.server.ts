/**
 * Assistant runtime — the orchestrator.
 *
 * Coordinates the runtime stages for a lecturer turn: persistence, context
 * construction, model invocation, response parsing, tool execution, and
 * confirmation handling. Read-only tools execute immediately and their result
 * is fed back to the model for a summary; write tools surface a confirmation
 * card and nothing is written until the lecturer confirms.
 *
 * This module is the single entry point for `handleSend`, `handleConfirm`, and
 * `handleReject`; the legacy `assistant.server.ts` re-exports them so the API
 * route stays unchanged.
 */
import type PocketBase from 'pocketbase';
import type { AssignmentMode } from '@/lib/assignments';
import { ASSISTANT_RECENT_MESSAGE_WINDOW } from '@/constants/assistant.config';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { toError } from './auth.server';
import { buildSystemPrompt, courseLabel, courseMissMessage, resolveCourseRef } from './context.server';
import { maybeCompact } from './compaction.server';
import { deicticCourseId } from './page-context';
import { validateAndAuthorizePageContext } from './page-context.server';
import {
	logAssistantError,
	logAssistantRequest,
	logConfirmation,
	logToolExecution,
} from './logging.server';
import { collectModel } from './model.server';
import {
	buildImageMarker,
	parseImageMarker,
	signImageRef,
	stripImageMarker,
	type AssistantImageRef,
} from './attachments.server';
import {
	dismissPendingClarify,
	getSession,
	loadSessionMessages,
	resolveDefaultSession,
	saveSessionMessage,
} from './persistence.server';
import {
	collapseRepeatedAssistantText,
	decideAssistantVisible,
	extractProseQuestions,
	normalizeSkill,
	hasClarifyProtocol,
	parseClarifyBlock,
	parsePrimaryToolCall,
	str,
	stripClarifyBlock,
	stripEmbeddedPayload,
	stripToolBlock,
	stripToolCalls,
} from './parsing';
import {
	cleanAssignmentSummary,
	cleanLinkSummary,
	cleanRosterTransferSummary,
	executeAddRosterStudents,
	executeCreateAssignment,
	executeCreateCourse,
	executeLinkSessionOutcomes,
	executeReadTool,
	getToolDefinition,
	prepareAssignmentDraft,
	prepareLinkPlan,
	prepareRosterTransfer,
	READ_TOOL_NAMES,
	serializeToolResult,
	WRITE_TOOL_NAMES,
} from './tools.server';
import { recordToolAudit } from './audit.server';
import { maxToolCallsPerTurn, enforceAiAccess, commitUsage, deriveIdempotencyKey } from '@/lib/ai-usage.server';
import { WRITE_TOOLS } from './types';
import type {
	AssistantPageContext,
	AssistantPageContextInput,
	AssistantSession,
	Clarification,
	ClarifyQuestion,
	PendingAction,
	PreparedAssignment,
	PreparedLinkPlan,
	PreparedRosterTransfer,
	SendResult,
	ToolExecutionContext,
} from './types';

/**
 * Maximum model→tool→model iterations in one user turn. Read from the
 * centralized AI protection config so the tool-call ceiling is not
 * hard-coded here. Read tools may chain before the model produces a final
 * answer; this ceiling prevents an unbounded loop.
 */
const MAX_TOOL_ITERATIONS = maxToolCallsPerTurn();

/** Processes a lecturer message: persists it, invokes the model, and routes the response. */
export const handleSend = async (
	user: AssistantSession,
	message: string,
	attachmentBlock = '',
	images: AssistantImageRef[] = [],
	clarifyMessageId = '',
	courseRoute = '',
	files: File[] = [],
	sessionId = '',
	pageContextInput: AssistantPageContextInput = {},
	resumeAfterAction = false,
): Promise<SendResult> => {
	const { pb, id: userId } = user;
	logAssistantRequest('send', user);
	const session = sessionId ? await getSession(pb, userId, sessionId) : await resolveDefaultSession(pb, userId);
	const sid = session.id;
	const trimmed = message.trim();
	const block = attachmentBlock.trim();
	if (!resumeAfterAction && !trimmed && !block && !images.length) throw Object.assign(new Error('Pesan tidak boleh kosong.'), { status: 422 });
	const imageMarker = buildImageMarker(images);
	const baseText = block ? `${trimmed || 'Tolong tinjau lampiran berikut.'}\n\n${block}` : trimmed;
	const stored = imageMarker ? `${baseText}\n${imageMarker}` : baseText;

	await dismissPendingClarify(pb, userId, sid, clarifyMessageId.trim());
	if (!resumeAfterAction) await saveSessionMessage(pb, userId, sid, { role: 'user', content: stored });

	const rows = await loadSessionMessages(pb, userId, sid);
	// Automatic compaction: when the session crosses the configurable message/
	// token thresholds, summarize older messages into the durable session
	// context (summary + structuredContext). Best-effort — a failure is logged
	// and swallowed so the turn proceeds with the recent window alone. Original
	// messages are never deleted; the database stays the complete audit record.
	const activeSession = await maybeCompact(user, pb, userId, session, rows);

	// Model context = recent-message window (verbatim) + durable session summary
	// (injected into the system prompt). The full transcript is never loaded.
	const recent = rows.slice(-ASSISTANT_RECENT_MESSAGE_WINDOW);
	// A short-lived file token lets the vision-capable model read the protected
	// image files. Issued once per turn only when images are present.
	const hasImages = images.length > 0 || rows.some((r) => r.content.includes('<<gambar'));
	const fileToken = hasImages ? await pocketbaseAdmin.getFileToken().catch(() => '') : '';
	const history = recent.map((r) => {
		const questions = r.toolName === 'clarify' && r.toolArgs && Array.isArray((r.toolArgs as { questions?: { prompt?: string }[] }).questions)
			? (r.toolArgs as { questions: { prompt?: string }[] }).questions
				.map((q, i) => `${i + 1}. ${q.prompt || ''}`)
				.filter((line) => line.length > 3)
			: [];
		const execution = r.actionStatus === 'executed' && WRITE_TOOLS.has(r.toolName) ? `\nAKSI SELESAI (jangan diulang): ${JSON.stringify({ tool: r.toolName, args: r.toolArgs, result: r.toolResult })}` : '';
		const rawContent = questions.length ? `${r.content}\n\nPertanyaan klarifikasi:\n${questions.join('\n')}` : r.content;
		const content = stripImageMarker(rawContent) + execution;
		const imgs = parseImageMarker(r.content);
		const signed = imgs.length && fileToken ? imgs.map((img) => signImageRef(img.ref, fileToken)).filter(Boolean) : [];
		return { role: r.role, content, ...(signed.length ? { images: signed } : {}) };
	});

	const pageContext = await validateAndAuthorizePageContext(pb, userId, pageContextInput, courseRoute);
	const baseSystemPrompt = buildSystemPrompt(pageContext, {
		summary: activeSession.summary || '',
		structured: activeSession.structuredContext ?? null,
	});

	const systemPrompt = baseSystemPrompt + (resumeAfterAction ? '\nAKSI TERAKHIR SUDAH DIEKSEKUSI DAN DIVERIFIKASI. Lanjutkan tujuan asli dari riwayat bila masih ada langkah yang diperlukan. Jangan mengulang aksi yang sudah selesai. Setiap perubahan baru tetap memerlukan persetujuan sendiri. Bila tujuan sudah tercapai, ringkas hasil dan tautan; jangan mengusulkan aksi tambahan di luar permintaan.' : '');
	const toolCtx: ToolExecutionContext = { pb, userId, files, courseRoute, sessionId: sid };

	// ── Agent loop ──────────────────────────────────────────────────────────
	// user message → model → tool call → execute → tool result → model → …
	// → final response. Read tools execute immediately and their typed result is
	// fed back to the model, which may issue another read tool before answering.
	// Write tools surface a confirmation card and stop the loop. The loop is
	// bounded by MAX_TOOL_ITERATIONS so a misbehaving model cannot run forever.
	let workingHistory = [...history];
	const toolActivity: { tool: string; ok: boolean }[] = [];
	const recentAssistant = rows.filter((row) => row.role === 'assistant').map((row) => row.content);
	/**
	 * Persists lecturer-visible text once. A repeated roster-add confirmation
	 * becomes a single "nothing was written" note. Further copies are not
	 * stored and never authorize a roster change.
	 */
	const publishVisible = async (rawText: string): Promise<SendResult> => {
		const decision = decideAssistantVisible(rawText, recentAssistant);
		if (decision.action === 'suppress') {
			return { text: '', suppressedDuplicate: true, toolActivity };
		}
		const saved = await saveSessionMessage(pb, userId, sid, { role: 'assistant', content: decision.text });
		recentAssistant.push(decision.text);
		return { text: saved.content, toolActivity };
	};
	for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration += 1) {
		let raw: string;
		try {
			raw = await collectModel(user, workingHistory, systemPrompt, iteration === 0 ? 'primary' : 'summary');
		} catch (error) {
			logAssistantError('model', user, error);
			throw Object.assign(new Error('Asisten AI sedang tidak tersedia. Coba beberapa saat lagi.'), { status: 502 });
		}

		const toolCall = parsePrimaryToolCall(raw);
		const clarifyQuestions = toolCall
			? null
			: parseClarifyBlock(raw) || extractProseQuestions(stripClarifyBlock(stripToolBlock(raw)));
		const stripped = stripToolCalls(stripClarifyBlock(stripToolBlock(raw))).trim();
		const visible = collapseRepeatedAssistantText(stripped || (hasClarifyProtocol(raw) || toolCall ? '' : raw.trim()));

		// ── Clarification: surface questions, stop the loop. ────────────────
		if (clarifyQuestions) {
			const saved = await saveSessionMessage(pb, userId, sid, {
				role: 'assistant',
				content: visible || 'Saya perlu beberapa detail sebelum melanjutkan.',
				toolName: 'clarify',
				toolArgs: { questions: clarifyQuestions },
				actionStatus: 'pending',
			});
			return {
				text: saved.content,
				clarification: { messageId: saved.id, questions: clarifyQuestions },
				toolActivity,
			};
		}

		// ── No tool call: this is the final answer. ─────────────────────────
		if (!toolCall) {
			return publishVisible(visible);
		}

		const def = getToolDefinition(toolCall.name);
		// Unknown / unregistered tool — treat the visible text as the final answer.
		if (!def || (!READ_TOOL_NAMES.has(toolCall.name) && !WRITE_TOOL_NAMES.has(toolCall.name))) {
			return publishVisible(visible);
		}

		// ── Read tool: validate, execute, feed the typed result back, loop. ─
		if (READ_TOOL_NAMES.has(toolCall.name)) {
			const startedAt = Date.now();
			const result = await executeReadTool(toolCtx, toolCall.name, toolCall.args);
			const durationMs = Date.now() - startedAt;
			logToolExecution(user, toolCall.name, 'read', result.ok);
			toolActivity.push({ tool: toolCall.name, ok: result.ok });
			const resultText = serializeToolResult(toolCall.name, result);
			const shown = decideAssistantVisible(visible, recentAssistant);
			const saved = await saveSessionMessage(pb, userId, sid, {
				role: 'assistant',
				content: shown.action === 'show' && shown.text ? shown.text : result.ok ? 'Data dibaca.' : 'Data belum dapat dibaca.',
				toolName: toolCall.name,
				toolArgs: toolCall.args,
				toolResult: resultText,
				actionStatus: 'executed',
			});
			if (shown.action === 'show') recentAssistant.push(shown.text);
			// Privacy-minimized audit: tool, sanitized args, status, result meta
			// (ok + source provenance + error code), duration, no confirmation.
			await recordToolAudit(pb, userId, sid, saved.id, {
				tool: toolCall.name,
				args: toolCall.args,
				status: result.ok ? 'success' : 'failed',
				resultMeta: {
					ok: result.ok,
					...(result.source ? { source: result.source } : {}),
					...(result.error ? { errorCode: result.error.code } : {}),
				},
				durationMs,
				confirmationState: 'none',
			});
			// Feed the structured result back; the model decides whether to call
			// another read tool or produce the final answer. Do NOT force a
			// final answer here.
			workingHistory = [
				...workingHistory,
				{ role: 'assistant' as const, content: visible },
				{ role: 'user' as const, content: resultText },
			];
			continue;
		}

		// A continuation cannot propose the same completed write again, even if
		// the model ignores the completion record. Feed the verified result back.
		if (resumeAfterAction) {
			const completed = [...rows].reverse().find(r => r.actionStatus === 'executed' && r.toolName === toolCall.name && sameCompletedWrite(toolCall.name, r.toolArgs || {}, toolCall.args));
			if (completed) {
				workingHistory.push({ role: 'assistant' as const, content: visible }, { role: 'user' as const, content: `Aksi ini sudah selesai. Dilarang membuatnya lagi. Baca hasil atau ringkas hasil yang sudah tersimpan: ${JSON.stringify({ tool: completed.toolName, args: completed.toolArgs, result: completed.toolResult })}` });
				continue;
			}
		}

		// ── Write tool: prepare a draft and surface a confirmation card. ─────
		// The loop stops here — nothing is written until the lecturer confirms.
		const writeOutcome = await prepareWriteAction(
			user, pb, userId, sid, rows, toolCall.name, toolCall.args, visible, message, courseRoute, pageContext,
		);
		if (writeOutcome.kind === 'message') {
			// Authorization denial or missing data — audit as denied, no confirmation.
			await recordToolAudit(pb, userId, sid, undefined, {
				tool: toolCall.name,
				args: toolCall.args,
				status: 'denied',
				resultMeta: { ok: false, errorCode: 'denied' },
				durationMs: 0,
				confirmationState: 'none',
			});
			return publishVisible(writeOutcome.text);
		}
		if (writeOutcome.kind === 'clarify') {
			const saved = await saveSessionMessage(pb, userId, sid, {
				role: 'assistant',
				content: writeOutcome.text,
				toolName: 'clarify',
				toolArgs: { questions: writeOutcome.questions },
				actionStatus: 'pending',
			});
			return { text: saved.content, clarification: { messageId: saved.id, questions: writeOutcome.questions }, toolActivity };
		}
		// pending — confirmation card
		const saved = await saveSessionMessage(pb, userId, sid, {
			role: 'assistant',
			content: writeOutcome.summary,
			toolName: toolCall.name,
			toolArgs: writeOutcome.args,
			...(writeOutcome.draft ? { toolResult: { draft: writeOutcome.draft } } : {}),
			actionStatus: 'pending',
		});
		// Audit the pending write: status pending, confirmationState pending.
		// The draft itself is NOT persisted in the audit (only sanitized args).
		await recordToolAudit(pb, userId, sid, saved.id, {
			tool: toolCall.name,
			args: writeOutcome.args,
			status: 'pending',
			resultMeta: { ok: true },
			durationMs: 0,
			confirmationState: 'pending',
		});
		return {
			text: writeOutcome.summary,
			pendingAction: { messageId: saved.id, tool: toolCall.name, args: writeOutcome.args, summary: writeOutcome.summary },
			toolActivity,
		};
	}

	// Loop exhausted without a final answer — persist the last model output.
	const fallback = 'Batas langkah untuk giliran ini tercapai. Tujuan belum dinyatakan selesai. Hasil yang sudah diperoleh tersimpan di percakapan; lanjutkan untuk mengerjakan langkah yang masih tersisa.';
	const saved = await saveSessionMessage(pb, userId, sid, { role: 'assistant', content: fallback });
	return { text: saved.content, toolActivity };
};

/**
 * Prepares a write-tool action (create_course / create_assignment): resolves
 * course context, builds the reviewable draft, and returns either a plain
 * message, a clarification, or a pending confirmation. Nothing is written.
 */
type WriteOutcome =
	| { kind: 'message'; text: string }
	| { kind: 'clarify'; text: string; questions: ClarifyQuestion[] }
	| { kind: 'pending'; summary: string; args: Record<string, unknown>; draft: PreparedAssignment | PreparedLinkPlan | PreparedRosterTransfer | null };

const prepareWriteAction = async (
	user: AssistantSession,
	pb: PocketBase,
	userId: string,
	sid: string,
	rows: { role: string; content: string }[],
	toolName: string,
	rawArgs: Record<string, unknown>,
	visible: string,
	message: string,
	courseRoute: string,
	pageContext: AssistantPageContext,
): Promise<WriteOutcome> => {
	const args = { ...rawArgs };
	let summary = collapseRepeatedAssistantText(stripEmbeddedPayload(visible));
	let pendingDraft: PreparedAssignment | PreparedLinkPlan | PreparedRosterTransfer | null = null;

	if (toolName === 'create_assignment') {
		const ref = typeof args.courseId === 'string' ? args.courseId : '';
		const contextCourse = deicticCourseId(message, pageContext) || pageContext.course?.id || '';
		const routeFallback = courseRoute || contextCourse;
		const resolved = await resolveCourseRef(pb, userId, ref, routeFallback);
		if (resolved.ambiguous) {
			return { kind: 'message', text: `Ada lebih dari satu mata kuliah yang cocok dengan “${ref}”. Sebutkan kode yang tepat. Tidak ada tugas yang dibuat.` };
		}
		if (!resolved.course) {
			return { kind: 'message', text: courseMissMessage(ref || courseRoute, resolved.courses) };
		}
		args.courseId = resolved.course.id;
		args.courseLabel = courseLabel(resolved.course);
		const hint = rows
			.filter((row) => row.role === 'user')
			.slice(-4)
			.map((row) => row.content)
			.join('\n');
		const shape = normalizeSkill(args.shape, hint);
		const mode: AssignmentMode = args.mode === 'collaborative' || /kelompok|kolaboratif/i.test(hint) ? 'collaborative' : 'individual';
		args.shape = shape;
		args.mode = mode;
		args.activityType = args.activityType === 'formative' ? 'formative' : 'formal';
		let prepared: PreparedAssignment | { missing: 'skill' | 'week' | 'mapping' };
		try {
			prepared = await prepareAssignmentDraft(pb, userId, resolved.course, args, hint);
		} catch (error) {
			logAssistantError('draft:assignment', user, error);
			return { kind: 'message', text: 'Draf lengkap tidak dapat disusun saat ini. Tidak ada tugas yang dibuat. Coba lagi dari editor tugas, atau ulangi permintaan.' };
		}
		if ('missing' in prepared) {
			const question = prepared.missing === 'skill'
				? 'Jenis tugas: Menulis atau Berbicara?'
				: prepared.missing === 'mapping'
					? 'Pertemuan itu belum terhubung ke Sub-CPMK. Hubungkan dulu di Editor RPS, atau sebut pertemuan lain.'
					: 'Pertemuan ke berapa?';
			return {
				kind: 'clarify',
				text: 'Saya perlu satu detail sebelum menyusun draf lengkap.',
				questions: [{ prompt: question, placeholder: prepared.missing === 'skill' ? 'menulis' : '5' }],
			};
		}
		args.title = prepared.title;
		args.shape = shape;
		args.sessionLabel = prepared.sessionLabel;
		args.subCpmkLabel = prepared.subCpmkLabel;
		args.generated = prepared.detail;
		pendingDraft = prepared;
		delete args.instructions;
		summary = cleanAssignmentSummary(resolved.course, args, prepared);
	} else if (toolName === 'create_course') {
		const title = str(args.title, 200);
		summary = title
			? `Mata kuliah baru “${title}”${args.code ? ` (${str(args.code, 40)})` : ''}. Catatan ini masih draf dan dapat dilengkapi di editor.`
			: 'Judul mata kuliah belum ada. Tidak ada catatan yang dibuat.';
		if (!title) {
			return { kind: 'message', text: summary };
		}
	} else if (toolName === 'link_session_outcomes') {
		const ref = typeof args.courseId === 'string' ? args.courseId : '';
		const contextCourse = deicticCourseId(message, pageContext) || pageContext.course?.id || '';
		const routeFallback = courseRoute || contextCourse;
		const resolved = await resolveCourseRef(pb, userId, ref, routeFallback);
		if (resolved.ambiguous) {
			return { kind: 'message', text: `Ada lebih dari satu mata kuliah yang cocok dengan “${ref}”. Sebutkan kode yang tepat. Tidak ada penautan yang dilakukan.` };
		}
		if (!resolved.course) {
			return { kind: 'message', text: courseMissMessage(ref || courseRoute, resolved.courses) };
		}
		args.courseId = resolved.course.id;
		args.courseLabel = courseLabel(resolved.course);
		let plan: PreparedLinkPlan | { missing: 'sessions' | 'outcomes' };
		try {
			plan = await prepareLinkPlan(pb, userId, resolved.course);
		} catch (error) {
			logAssistantError('draft:link_outcomes', user, error);
			return { kind: 'message', text: 'Rencana penautan tidak dapat disusun saat ini. Tidak ada penautan yang dilakukan. Coba lagi, atau lakukan penautan manual di Editor RPS.' };
		}
		if ('missing' in plan) {
			const question =
				plan.missing === 'sessions'
					? 'Belum ada jadwal pertemuan mingguan di RPS mata kuliah ini. Impor/simpan jadwal dulu di Editor RPS, lalu minta saya menautkan ulang. Lanjutkan?'
					: 'Belum ada CPMK/Sub-CPMK hasil impor di RPS mata kuliah ini. Impor/simpan capaian dulu di Editor RPS, lalu minta saya menautkan ulang. Lanjutkan?';
			return {
				kind: 'clarify',
				text: 'Saya tidak dapat menautkan capaian ke pertemuan karena data RPS belum lengkap.',
				questions: [{ prompt: question, placeholder: 'ya' }],
			};
		}
		args.sessionCount = plan.sessionCount;
		args.outcomeCount = plan.outcomeCount;
		pendingDraft = plan;
		summary = cleanLinkSummary(plan);
	} else if (toolName === 'add_roster_students') {
		const sourceRef = typeof args.sourceCourseId === 'string' ? args.sourceCourseId : '';
		const destRef = typeof args.destinationCourseId === 'string' ? args.destinationCourseId : '';
		const contextCourse = deicticCourseId(message, pageContext) || pageContext.course?.id || '';
		const sourceFallback = courseRoute || contextCourse;
		// Resolve the source course — fall back to the open page course when the
		// model omitted it (the lecturer is usually viewing the source).
		const sourceResolved = await resolveCourseRef(pb, userId, sourceRef, sourceFallback);
		if (sourceResolved.ambiguous) {
			return { kind: 'message', text: `Ada lebih dari satu mata kuliah sumber yang cocok dengan “${sourceRef}”. Sebutkan kode yang tepat. Tidak ada mahasiswa yang ditambahkan.` };
		}
		if (!sourceResolved.course) {
			return { kind: 'message', text: courseMissMessage(sourceRef || sourceFallback, sourceResolved.courses) };
		}
		// Resolve the destination course — never fall back to the page course,
		// because the destination must be stated explicitly.
		const destResolved = await resolveCourseRef(pb, userId, destRef, '');
		if (destResolved.ambiguous) {
			return { kind: 'message', text: `Ada lebih dari satu mata kuliah tujuan yang cocok dengan “${destRef}”. Sebutkan kode yang tepat. Tidak ada mahasiswa yang ditambahkan.` };
		}
		if (!destResolved.course) {
			return { kind: 'message', text: courseMissMessage(destRef, destResolved.courses) };
		}
		const sourceCourse = sourceResolved.course;
		const destCourse = destResolved.course;
		if (sourceCourse.id === destCourse.id) {
			return { kind: 'message', text: 'Mata kuliah sumber dan tujuan sama. Tidak ada mahasiswa yang ditambahkan.' };
		}
		args.sourceCourseId = sourceCourse.id;
		args.sourceCourseLabel = courseLabel(sourceCourse);
		args.destinationCourseId = destCourse.id;
		args.destinationCourseLabel = courseLabel(destCourse);
		const sectionName = typeof args.section === 'string' ? args.section : '';
		let plan: PreparedRosterTransfer | { missing: 'no_source_roster' | 'no_section' | 'all_duplicates' } | { ambiguous: 'section' };
		try {
			plan = await prepareRosterTransfer(pb, userId, sourceCourse, destCourse, sectionName);
		} catch (error) {
			logAssistantError('draft:roster_transfer', user, error);
			return { kind: 'message', text: 'Rencana penambahan roster tidak dapat disusun saat ini. Tidak ada mahasiswa yang ditambahkan. Coba lagi nanti.' };
		}
		if ('missing' in plan) {
			const text =
				plan.missing === 'no_source_roster'
					? `Roster ${courseLabel(sourceCourse)}${sectionName.trim() ? ` (kelas ${sectionName.trim()})` : ''} kosong. Tidak ada mahasiswa untuk ditambahkan.`
					: plan.missing === 'all_duplicates'
						? `Seluruh mahasiswa dari ${courseLabel(sourceCourse)} sudah terdaftar di ${courseLabel(destCourse)}. Tidak ada yang perlu ditambahkan.`
						: `Kelas “${sectionName.trim()}” tidak ditemukan di ${courseLabel(sourceCourse)}. Sebutkan nama kelas yang tepat, atau kosongkan untuk menambah seluruh roster.`;
			return { kind: 'message', text };
		}
		if ('ambiguous' in plan) {
			return {
				kind: 'clarify',
				text: `Ada lebih dari satu kelas bernama “${sectionName.trim()}” di ${courseLabel(sourceCourse)}.`,
				questions: [{ prompt: 'Sebutkan nama kelas yang tepat (atau kosongkan untuk menambah seluruh roster)?', placeholder: 'A' }],
			};
		}
		args.studentCount = plan.additions.length;
		pendingDraft = plan;
		summary = cleanRosterTransferSummary(plan);
	}

	return { kind: 'pending', summary, args, draft: pendingDraft };
};

/** Confirms and executes a pending write action. */
export const handleConfirm = async (
	user: AssistantSession,
	messageId: string,
	courseRoute = '',
): Promise<SendResult> => {
	const { pb, id: userId } = user;
	logAssistantRequest('confirm', user);
	const row = await pb.collection('assistant_messages').getOne<{ id: string; owner: string; session: string; toolName: string; actionStatus: string; toolArgs: Record<string, unknown> | null; toolResult: unknown }>(messageId).catch(() => null);
	if (!row || row.owner !== userId) {
		throw Object.assign(new Error('Aksi tidak ditemukan.'), { status: 404 });
	}
	if (row.actionStatus !== 'pending' || !WRITE_TOOLS.has(row.toolName)) {
		throw Object.assign(new Error('Aksi ini tidak dapat dikonfirmasi.'), { status: 422 });
	}
	const sid = row.session;
	const args = row.toolArgs ?? {};
	// The prepared draft lives in toolResult (not toolArgs) so it fits the JSON
	// column limit. Restore it onto args before executing the write tool.
	const storedDraft = row.toolResult && typeof row.toolResult === 'object' && 'draft' in (row.toolResult as Record<string, unknown>)
		? (row.toolResult as { draft?: unknown }).draft
		: undefined;
	if (storedDraft && typeof storedDraft === 'object') args.draft = storedDraft;
	// Atomically claim a pending action before executing; concurrent confirmations cannot duplicate writes.
	await pocketbaseAdmin.send(`/api/assistant-actions/${messageId}/claim`, { method: 'POST', body: { owner: userId } });
	try {
		const startedAt = Date.now();
		const result =
			row.toolName === 'create_course'
				? await executeCreateCourse(pb, userId, args)
				: row.toolName === 'link_session_outcomes'
					? await executeLinkSessionOutcomes(pb, userId, args)
					: row.toolName === 'add_roster_students'
						? await executeAddRosterStudents(pb, userId, args)
						: await executeCreateAssignment(pb, userId, args, courseRoute);
		await verifyWrittenAction(pb, userId, row.toolName, args, result.link || '');
		const durationMs = Date.now() - startedAt;
		logToolExecution(user, row.toolName, 'write', true);
		await pb.collection('assistant_messages').update(messageId, {
			actionStatus: 'executed',
			toolResult: { link: result.link },
			toolArgs: { ...(row.toolArgs || {}), link: result.link },
		});
		logConfirmation(user, row.toolName, 'executed');
		// Audit the confirmed write: status confirmed, with the resulting link as
		// result metadata. The actual record id/link is the only provenance kept.
		await recordToolAudit(pb, userId, sid, messageId, {
			tool: row.toolName,
			args,
			status: 'confirmed',
			resultMeta: { ok: true, ...(result.link ? { link: result.link } : {}) },
			durationMs,
			confirmationState: 'confirmed',
		});
		await saveSessionMessage(pb, userId, sid, { role: 'assistant', content: result.link ? `${result.text}\n\n[Buka catatan](${result.link})` : result.text });
		// Failure to continue must never label a successful write as failed.
  const continuationAccess = await enforceAiAccess({ userId, role: 'lecturer', idempotencyKey: deriveIdempotencyKey(userId, `resume:${messageId}`) });
  if (!continuationAccess.ok) return { text: `${result.text}\n\nHasil tersimpan dan diperiksa. ${continuationAccess.message}` };
  try {
   const next = await handleSend(user, '', '', [], '', courseRoute, [], sid, {}, true);
   await commitUsage({ userId, role: 'lecturer' });
   return { ...next, text: [result.text, next.text].filter(Boolean).join('\n\n') };
  } catch {
   return { text: `${result.text}\n\nHasil tersimpan dan diperiksa. Kelanjutan belum dapat diproses; lanjutkan percakapan untuk langkah berikutnya.` };
  } finally { continuationAccess.release(); }
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Gagal membuat catatan.';
		logToolExecution(user, row.toolName, 'write', false);
		logConfirmation(user, row.toolName, 'failed');
		await pb.collection('assistant_messages').update(messageId, { actionStatus: 'failed', toolResult: { error: message } }).catch(() => {});
		// Audit the failed confirmation: the lecturer confirmed, but execution failed.
		await recordToolAudit(pb, userId, sid, messageId, {
			tool: row.toolName,
			args,
			status: 'failed',
			resultMeta: { ok: false, errorCode: 'execution_error' },
			durationMs: 0,
			confirmationState: 'confirmed',
		});
		throw toError(Object.assign(new Error(message), { status: 422 }));
	}
};

/** Rejects (dismisses) a pending write action. */
export const handleReject = async (user: AssistantSession, messageId: string): Promise<void> => {
	const { pb, id: userId } = user;
	const row = await pb.collection('assistant_messages').getOne<{ id: string; owner: string; session: string; toolName: string; actionStatus: string }>(messageId).catch(() => null);
	if (!row || row.owner !== userId) return;
	if (row.actionStatus === 'pending') {
		await pb.collection('assistant_messages').update(messageId, { actionStatus: 'rejected' }).catch(() => {});
		logConfirmation(user, row.toolName, 'rejected');
		// Audit the rejection: the lecturer declined the pending write.
		await recordToolAudit(pb, userId, row.session, messageId, {
			tool: row.toolName,
			args: null,
			status: 'rejected',
			resultMeta: { ok: false, errorCode: 'rejected' },
			durationMs: 0,
			confirmationState: 'rejected',
		});
	}
};

export type { PendingAction, Clarification, SendResult };

/** Read back the action's persisted records before reporting success. */
async function verifyWrittenAction(pb: PocketBase, owner: string, tool: string, args: Record<string, unknown>, link: string) {
 const must = (ok: boolean) => { if (!ok) throw new Error('Perubahan sudah dijalankan tetapi hasil belum dapat diverifikasi. Periksa catatan sebelum mencoba lagi.'); };
 if (tool === 'create_course') {
  const id = link.split('/').at(-1) || '';
  const record = await pb.collection('courses').getOne(id);
  must(record.owner === owner && record.title === str(args.title, 200));
 } else if (tool === 'create_assignment') {
  const id = new URL(link, 'https://laras.invalid').searchParams.get('edit') || '';
  const record = await pb.collection('assignments').getOne(id);
  must(record.owner === owner && record.course === args.courseId && record.title === str(args.title, 200) && record.status === 'draft');
 } else if (tool === 'link_session_outcomes') {
  const plan = args.draft as PreparedLinkPlan;
  for (const item of plan.links) {
   const record = await pb.collection('class_sessions').getOne(item.sessionId);
   must(record.owner === owner && record.course === args.courseId && item.subCpmks.every(id => (record.subCpmks || []).includes(id)) && item.cpmks.every(id => (record.cpmks || []).includes(id)) && item.cpls.every(id => (record.cpls || []).includes(id)));
  }
 } else if (tool === 'add_roster_students') {
  const plan = args.draft as PreparedRosterTransfer;
  const rows = await pb.collection('course_roster').getFullList({ filter: pb.filter('course={:c} && owner={:u}', { c: args.destinationCourseId, u: owner }) });
  must(plan.additions.every(a => rows.some(r => r.nim === a.nim.trim())));
 }
}

function sameCompletedWrite(tool: string, saved: Record<string, unknown>, proposed: Record<string, unknown>): boolean {
 const normalized = (v: unknown) => String(v || '').trim().toLocaleLowerCase();
 if (tool === 'create_course') return !!saved.title && normalized(saved.title) === normalized(proposed.title);
 if (tool === 'create_assignment') return !!saved.title && normalized(saved.title) === normalized(proposed.title) && normalized(saved.courseId) === normalized(proposed.courseId);
 const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !['link', 'draft'].includes(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
 return JSON.stringify(canonical(saved)) === JSON.stringify(canonical(proposed));
}
