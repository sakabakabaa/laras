/**
 * Assistant runtime — persistence.
 *
 * Reads and writes the lecturer's sessions and messages in the
 * `assistant_sessions` and `assistant_messages` collections. Owner-scoped:
 * only the lecturer who owns a session/message can read or change it. Writes
 * happen through the user's own token (create) or superuser (status updates
 * after confirmation), always after faculty auth is verified.
 *
 * The legacy `assistant_conversations` collection is preserved as a
 * compatibility layer; the runtime now reads/writes the new collections. The
 * old `handleHistory`/`handleClear` entry points remain, resolving a default
 * session so the previous API contract keeps working during migration.
 */
import type PocketBase from 'pocketbase';
import { isSessionStale } from './session-stale';
import type {
	AssistantHistoryItem,
	AssistantMessageRecord,
	AssistantSession,
	AssistantSessionRecord,
	AssistantSessionSummary,
	SessionStructuredContext,
} from './types';

const SESSIONS = 'assistant_sessions';
const MESSAGES = 'assistant_messages';

/** Rough token estimate used for the `tokenEstimate` column (4 chars ≈ 1 token). */
const estimateTokens = (text: string): number => Math.ceil((text || '').length / 4);

/** Maps a persisted session row to the client-facing summary. */
export const mapSessionSummary = (row: AssistantSessionRecord): AssistantSessionSummary => ({
	id: row.id,
	title: row.title,
	status: row.status,
	messageCount: row.messageCount ?? 0,
	lastMessageAt: row.lastMessageAt || row.updated || row.created,
	created: row.created,
	updated: row.updated,
	summaryVersion: row.summaryVersion ?? 0,
	estimatedTokens: row.estimatedTokens ?? 0,
	feature: row.feature || '',
	summary: row.summary || '',
});

/** Creates a new session owned by the lecturer. */
export const createSession = async (
	pb: PocketBase,
	userId: string,
	data: { title?: string; feature?: string; entityType?: string; entityId?: string } = {},
): Promise<AssistantSessionRecord> => {
	const title = (data.title || '').trim().slice(0, 200) || 'Percakapan baru';
	const rec = await pb.collection(SESSIONS).create<AssistantSessionRecord>({
		owner: userId,
		title,
		status: 'active',
		feature: data.feature || '',
		entityType: data.entityType || '',
		entityId: data.entityId || '',
		summary: '',
		structuredContext: null,
		summaryVersion: 0,
		lastCompactedMessageId: '',
		estimatedTokens: 0,
		messageCount: 0,
	});
	return rec;
};

/** Lists the lecturer's sessions, most recently active first. */
export const listSessions = async (
	pb: PocketBase,
	userId: string,
): Promise<AssistantSessionSummary[]> => {
	const rows = await pb.collection(SESSIONS).getFullList<AssistantSessionRecord>({
		filter: pb.filter('owner = {:id}', { id: userId }),
		sort: '-lastMessageAt,-updated',
		perPage: 100,
	});
	return rows.map(mapSessionSummary);
};

/** Returns a session owned by the lecturer, or throws 404-style when missing/foreign. */
export const getSession = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
): Promise<AssistantSessionRecord> => {
	const row = await pb
		.collection(SESSIONS)
		.getOne<AssistantSessionRecord>(sessionId)
		.catch(() => null);
	if (!row || row.owner !== userId) {
		throw Object.assign(new Error('Percakapan tidak ditemukan.'), { status: 404 });
	}
	return row;
};

/**
 * Resolves the most recent active session, creating one when none exists.
 *
 * If the most-recent active session has been idle longer than the auto-new
 * threshold (3 hours), a fresh session is started instead of reviving the
 * stale one. The old session is left in place as history — only a new default
 * is returned, so the lecturer resumes on a clean conversation.
 */
export const resolveDefaultSession = async (
	pb: PocketBase,
	userId: string,
): Promise<AssistantSessionRecord> => {
	const list = await pb.collection(SESSIONS).getList<AssistantSessionRecord>(1, 1, {
		filter: pb.filter('owner = {:id} && status = "active"', { id: userId }),
		sort: '-lastMessageAt,-updated',
	});
	if (list.items.length) {
		const latest = list.items[0];
		if (!isSessionStale(latest.lastMessageAt || latest.updated || latest.created)) {
			return latest;
		}
		return createSession(pb, userId, { title: 'Percakapan baru' });
	}
	return createSession(pb, userId, { title: 'Percakapan baru' });
};

/** Renames a session (owner-scoped). */
export const renameSession = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	title: string,
): Promise<AssistantSessionRecord> => {
	const row = await getSession(pb, userId, sessionId);
	const clean = title.trim().slice(0, 200);
	if (!clean) throw Object.assign(new Error('Judul tidak boleh kosong.'), { status: 422 });
	const updated = await pb.collection(SESSIONS).update<AssistantSessionRecord>(row.id, { title: clean });
	return updated;
};

/** Sets a session's status (active/archived). */
export const setSessionStatus = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	status: 'active' | 'archived',
): Promise<AssistantSessionRecord> => {
	const row = await getSession(pb, userId, sessionId);
	return pb.collection(SESSIONS).update<AssistantSessionRecord>(row.id, { status });
};

/** Archives a session. */
export const archiveSession = (pb: PocketBase, userId: string, sessionId: string) =>
	setSessionStatus(pb, userId, sessionId, 'archived');

/** Deletes a session and (via cascade) its messages. */
export const deleteSession = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
): Promise<void> => {
	const row = await getSession(pb, userId, sessionId);
	await pb.collection(SESSIONS).delete(row.id);
};

/** Loads a session's messages, oldest first. */
export const loadSessionMessages = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
): Promise<AssistantMessageRecord[]> => {
	await getSession(pb, userId, sessionId);
	const rows = await pb.collection(MESSAGES).getFullList<AssistantMessageRecord>({
		filter: pb.filter('session = {:id} && owner = {:owner}', { id: sessionId, owner: userId }),
		sort: 'created',
		perPage: 200,
	});
	return rows;
};

/** Maps a persisted message row to the client-facing history item. */
export const mapHistoryItem = (row: AssistantMessageRecord): AssistantHistoryItem => ({
	id: row.id,
	role: row.role === 'tool' ? 'assistant' : row.role,
	content: row.content,
	toolName: row.toolName || '',
	toolArgs: row.toolArgs ?? null,
	actionStatus: row.actionStatus || 'none',
	created: row.created,
});

/** Persists a single message in a session and returns the stored row. */
export const saveSessionMessage = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	data: {
		role: 'user' | 'assistant' | 'tool';
		content: string;
		toolName?: string;
		toolArgs?: Record<string, unknown> | null;
		toolResult?: unknown;
		actionStatus?: string;
	},
): Promise<AssistantMessageRecord> => {
	const rec = await pb.collection(MESSAGES).create<AssistantMessageRecord>({
		session: sessionId,
		owner: userId,
		role: data.role,
		content: data.content,
		toolName: data.toolName ?? '',
		toolArgs: data.toolArgs ?? null,
		toolResult: data.toolResult ?? null,
		actionStatus: data.actionStatus ?? 'none',
		tokenEstimate: estimateTokens(data.content),
	});
	await touchSession(pb, userId, sessionId, data.content);
	return rec;
};

/** Updates session metadata after a message is written.
 *  Note: `summary`/`structuredContext` are owned by the compaction step — this
 *  only bumps the message count and last-activity timestamp so the compacted
 *  summary is never overwritten by a per-message touch. */
export const touchSession = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	_latestContent: string,
): Promise<void> => {
	const row = await pb
		.collection(SESSIONS)
		.getOne<AssistantSessionRecord>(sessionId)
		.catch(() => null);
	if (!row || row.owner !== userId) return;
	await pb
		.collection(SESSIONS)
		.update(row.id, {
			messageCount: (row.messageCount ?? 0) + 1,
			lastMessageAt: new Date().toISOString(),
		})
		.catch(() => {});
};

/**
 * Persists durable session context produced by compaction. Writes the narrative
 * `summary`, the `structuredContext`, an incremented `summaryVersion`, the
 * `lastCompactedMessageId` cursor, and a refreshed `estimatedTokens` cache.
 * Original messages are never touched — the database stays the audit record.
 */
export const updateSessionContext = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	data: {
		summary: string;
		structuredContext: SessionStructuredContext | null;
		summaryVersion: number;
		lastCompactedMessageId: string;
		estimatedTokens: number;
	},
): Promise<AssistantSessionRecord> => {
	const row = await getSession(pb, userId, sessionId);
	return pb.collection(SESSIONS).update<AssistantSessionRecord>(row.id, {
		summary: data.summary.slice(0, 1000),
		structuredContext: data.structuredContext,
		summaryVersion: data.summaryVersion,
		lastCompactedMessageId: data.lastCompactedMessageId,
		estimatedTokens: data.estimatedTokens,
	});
};

/**
 * Marks prior pending clarification messages in a session as resolved. The
 * answered one becomes `confirmed`; any other still-pending clarifications
 * become `rejected`.
 */
export const dismissPendingClarify = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	answeredId = '',
): Promise<void> => {
	const rows = await loadSessionMessages(pb, userId, sessionId);
	for (const row of rows) {
		if (row.role !== 'assistant' || row.toolName !== 'clarify' || row.actionStatus !== 'pending') continue;
		await pb
			.collection(MESSAGES)
			.update(row.id, {
				actionStatus: row.id === answeredId ? 'confirmed' : 'rejected',
			})
			.catch(() => {});
	}
};

// ── Legacy compatibility entry points ──────────────────────────────────────
// The previous API contract (history/clear/send without an explicit session)
// keeps working by resolving a default session. New callers pass a sessionId.

/** Returns the lecturer's conversation history for a session (or the default). */
export const handleHistory = async (
	user: AssistantSession,
	sessionId = '',
): Promise<{ items: AssistantHistoryItem[]; sessionId: string; session: AssistantSessionRecord }> => {
	const { pb, id: userId } = user;
	const session = sessionId ? await getSession(pb, userId, sessionId) : await resolveDefaultSession(pb, userId);
	const rows = await loadSessionMessages(pb, userId, session.id);
	// Return the resolved session record so the caller can adopt it directly.
	// `resolveDefaultSession` may create a brand-new session (first-time user,
	// or the latest active session has gone stale); without returning it the
	// client would never learn the id and `currentSession` would stay null,
	// silently dropping every message.
	return { items: rows.map(mapHistoryItem), sessionId: session.id, session };
};

/** Clears a session's messages (or the default session's). */
export const handleClear = async (user: AssistantSession, sessionId = ''): Promise<void> => {
	const { pb, id: userId } = user;
	const session = sessionId ? await getSession(pb, userId, sessionId) : await resolveDefaultSession(pb, userId);
	const rows = await loadSessionMessages(pb, userId, session.id);
	for (const row of rows) {
		await pb.collection(MESSAGES).delete(row.id).catch(() => {});
	}
	await pb
		.collection(SESSIONS)
		.update(session.id, { messageCount: 0, summary: '' })
		.catch(() => {});
};

// ── Legacy aliases used by the runtime before it was session-aware ─────────
// These keep the old call sites compiling while routing through sessions.

/** @deprecated use loadSessionMessages */
export const loadHistory = (pb: PocketBase, userId: string, sessionId: string) =>
	loadSessionMessages(pb, userId, sessionId);

/** @deprecated use saveSessionMessage */
export const saveMessage = (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	data: Parameters<typeof saveSessionMessage>[3],
) => saveSessionMessage(pb, userId, sessionId, data);
