import { apiError, json, readFormData, readJsonBody, withApi } from '@/lib/api.server';
import {
	archiveSession,
	buildAttachmentBlock,
	createSession,
	deleteSession,
	getSession,
	handleClear,
	handleConfirm,
	handleHistory,
	handleReject,
	handleSend,
	listSessions,
	mapSessionSummary,
	renameSession,
	resolveFaculty,
} from '@/lib/assistant.server';
import {
	commitUsage,
	deriveIdempotencyKey,
	enforceAiAccess,
} from '@/lib/ai-usage.server';
import { capabilityWeight } from '@/lib/ai-rate-limits';
import type { AssistantImageRef } from '@/lib/assistant/attachments.server';
import type { AssistantSessionSummary } from '@/lib/assistant.server';
import type { AssistantPageContextInput } from '@/lib/assistant/types';

type Body = {
	action?: string;
	message?: string;
	messageId?: string;
	clarifyMessageId?: string;
	courseRoute?: string;
	sessionId?: string;
	title?: string;
	status?: string;
	pageContext?: unknown;
};

/**
 * POST /api/assistant
 * Faculty-only LARAS Asisten Dosen endpoint. Handles session lifecycle
 * (create/list/get/rename/archive/delete/messages) and conversation turns
 * (send with read-only tool execution and write-tool confirmations).
 *
 * The previous action contract (history/clear/send/confirm/reject without an
 * explicit sessionId) remains usable: it resolves a default session so existing
 * conversations keep working during migration.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	let user;
	try {
		user = await resolveFaculty(request);
	} catch (error) {
		const status = (error as { status?: number }).status ?? 401;
		return apiError(status, error instanceof Error ? error.message : 'Sesi tidak valid.');
	}

	const contentType = request.headers.get('content-type') || '';
	let actionName = '';
	let message = '';
	let messageId = '';
	let clarifyMessageId = '';
	let courseRoute = '';
	let sessionId = '';
	let title = '';
	let status = '';
	let pageContext: unknown = null;
	let files: File[] = [];
	if (contentType.includes('multipart/form-data')) {
		const form = await readFormData(request);
		actionName = String(form.get('action') || '').trim();
		message = String(form.get('message') || '');
		messageId = String(form.get('messageId') || '').trim();
		clarifyMessageId = String(form.get('clarifyMessageId') || '').trim();
		courseRoute = String(form.get('courseRoute') || '').trim();
		sessionId = String(form.get('sessionId') || '').trim();
		title = String(form.get('title') || '').trim();
		status = String(form.get('status') || '').trim();
		const pageContextRaw = String(form.get('pageContext') || '');
		if (pageContextRaw) {
			try {
				pageContext = JSON.parse(pageContextRaw);
			} catch {
				pageContext = null;
			}
		}
		files = form.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
	} else {
		const body = await readJsonBody<Body>(request);
		actionName = (body.action || '').trim();
		message = body.message || '';
		messageId = (body.messageId || '').trim();
		clarifyMessageId = (body.clarifyMessageId || '').trim();
		courseRoute = (body.courseRoute || '').trim();
		sessionId = (body.sessionId || '').trim();
		title = (body.title || '').trim();
		status = (body.status || '').trim();
		pageContext = body.pageContext ?? null;
	}
	const action = actionName;

	try {
		// ── Session lifecycle ────────────────────────────────────────────────
		if (action === 'list_sessions') {
			const sessions: AssistantSessionSummary[] = await listSessions(user.pb, user.id);
			return json({ sessions });
		}
		if (action === 'create_session') {
			const session = await createSession(user.pb, user.id, { title });
			return json({ session: mapSessionSummary(session) });
		}
		if (action === 'get_session') {
			if (!sessionId) return apiError(422, 'sessionId wajib diisi.');
			const session = await getSession(user.pb, user.id, sessionId);
			return json({ session: mapSessionSummary(session) });
		}
		if (action === 'rename_session') {
			if (!sessionId) return apiError(422, 'sessionId wajib diisi.');
			const session = await renameSession(user.pb, user.id, sessionId, title);
			return json({ session: mapSessionSummary(session) });
		}
		if (action === 'archive_session') {
			if (!sessionId) return apiError(422, 'sessionId wajib diisi.');
			const session = await archiveSession(user.pb, user.id, sessionId);
			return json({ session: mapSessionSummary(session) });
		}
		if (action === 'delete_session') {
			if (!sessionId) return apiError(422, 'sessionId wajib diisi.');
			await deleteSession(user.pb, user.id, sessionId);
			return json({ ok: true });
		}
		if (action === 'session_messages') {
			if (!sessionId) return apiError(422, 'sessionId wajib diisi.');
			const { items, session } = await handleHistory(user, sessionId);
			return json({ items, sessionId, session: mapSessionSummary(session) });
		}

		// ── Conversation turns (session-aware, backward compatible) ─────────
		if (action === 'history') {
			const { items, sessionId: resolved, session } = await handleHistory(user, sessionId);
			return json({ items, sessionId: resolved, session: mapSessionSummary(session) });
		}
		if (action === 'clear') {
			await handleClear(user, sessionId);
			return json({ ok: true });
		}
		if (action === 'send') {
			const { block: attachmentBlock, images } = files.length ? await buildAttachmentBlock(files) : { block: '', images: [] as AssistantImageRef[] };
			if (!message.trim() && !attachmentBlock && !images.length) return apiError(422, 'Pesan tidak boleh kosong.');
			// Rate limit + usage budget + concurrency + idempotency before any
			// model work. A turn with attachments is a heavier (document-analysis)
			// operation and consumes more usage weight.
			const capability = files.length > 0 ? 'large_document_analysis' : undefined;
			const access = await enforceAiAccess({
				userId: user.id,
				role: 'lecturer',
				capability,
				idempotencyKey: deriveIdempotencyKey(user.id, `${message}|${attachmentBlock}`),
				inputChars: message.length + attachmentBlock.length,
			});
			if (!access.ok) return apiError(access.status, access.message);
			try {
				const result = await handleSend(user, message, attachmentBlock, images, clarifyMessageId, courseRoute, files, sessionId, (pageContext ?? {}) as AssistantPageContextInput);
				void commitUsage({
					userId: user.id,
					role: 'lecturer',
					capability,
					weight: capabilityWeight(capability),
				});
				return json({
					ok: true,
					text: result.text,
					pendingAction: result.pendingAction ?? null,
					clarification: result.clarification ?? null,
					toolActivity: result.toolActivity ?? [],
					suppressedDuplicate: result.suppressedDuplicate ?? false,
				});
			} finally {
				access.release();
			}
		}
		if (action === 'confirm') {
			if (!messageId) return apiError(422, 'messageId wajib diisi.');
			// Confirm claims and executes the approved write. Automatic continuation
			// obtains its own model budget inside the runtime after the write succeeds.
			const access = await enforceAiAccess({
				userId: user.id,
				role: 'lecturer',
				weight: 0,
				idempotencyKey: deriveIdempotencyKey(user.id, `confirm:${messageId}`),
			});
			if (!access.ok) return apiError(access.status, access.message);
			try {
				const result = await handleConfirm(user, messageId, courseRoute);
				return json({ ok: true, ...result });
			} finally {
				access.release();
			}
		}
		if (action === 'reject') {
			if (messageId) await handleReject(user, messageId);
			return json({ ok: true });
		}
		return apiError(422, 'Aksi tidak dikenali.');
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return apiError(status, error instanceof Error ? error.message : 'Terjadi kesalahan.');
	}
});
