/**
 * Assistant runtime — compaction orchestrator (server-only).
 *
 * Runs automatic context compaction for a session when it crosses the
 * configurable message/token thresholds, and provides scoped retrieval of
 * older messages for the `search_history` tool.
 *
 * Compaction NEVER deletes messages. It summarizes the older portion of the
 * conversation (everything outside the recent-message window) into a durable
 * `summary` + `structuredContext` on the session row, increments
 * `summaryVersion`, and records the `lastCompactedMessageId` cursor. The
 * database remains the complete historical record; only the model context is
 * compacted.
 *
 * Best-effort: a compaction failure is logged and swallowed so a model hiccup
 * never blocks the lecturer's turn — the runtime falls back to the recent
 * window alone.
 */
import type PocketBase from 'pocketbase';
import { collectModel } from './model.server';
import { logAssistantError } from './logging.server';
import { getSession, loadSessionMessages, updateSessionContext } from './persistence.server';
import {
	COMPACTION_SYSTEM_PROMPT,
	buildCompactionPrompt,
	computeMessageTokens,
	estimateTokens,
	matchOlderMessages,
	parseStructuredContext,
	shouldCompact,
	splitForCompaction,
} from './compaction';
import { ASSISTANT_RECENT_MESSAGE_WINDOW, ASSISTANT_HISTORY_RETRIEVAL_LIMIT } from '@/constants/assistant.config';
import type { AssistantMessageRecord, AssistantSession, AssistantSessionRecord, SessionStructuredContext } from './types';

/** Injectable model caller — defaults to the real {@link collectModel}. */
export type ModelCaller = (
	user: AssistantSession,
	history: { role: string; content: string }[],
	systemPrompt: string,
	turn: 'primary' | 'summary',
) => Promise<string>;

/**
 * Runs compaction on a session when thresholds are crossed. Returns the
 * (possibly updated) session record. When no compaction is needed, the input
 * session is returned unchanged. When compaction runs but fails, the input
 * session is returned unchanged and the error is logged.
 *
 * @param messages The session's full message list (oldest first). Compaction
 *   does not reload — the caller already has them.
 * @param modelCall Injectable for tests; defaults to the real model.
 */
export const maybeCompact = async (
	user: AssistantSession,
	pb: PocketBase,
	userId: string,
	session: AssistantSessionRecord,
	messages: AssistantMessageRecord[],
	modelCall: ModelCaller = collectModel,
): Promise<AssistantSessionRecord> => {
	const estimatedTokens = computeMessageTokens(messages);
	if (!shouldCompact({ messageCount: messages.length, estimatedTokens })) return session;

	const { compactable, recent } = splitForCompaction(messages);
	if (compactable.length === 0) return session;

	// Only compact messages newer than the last compaction cursor, so repeated
	// compaction accumulates rather than re-summarizing already-summarized text.
	const cursor = session.lastCompactedMessageId || '';
	const cursorIndex = cursor ? compactable.findIndex((m) => m.id === cursor) : -1;
	const toSummarize = cursorIndex >= 0 ? compactable.slice(cursorIndex + 1) : compactable;
	if (toSummarize.length === 0) return session;

	const transcript = toSummarize.map((m) => ({ role: m.role, content: m.content }));
	let raw: string;
	try {
		raw = await modelCall(
			user,
			[{ role: 'user', content: buildCompactionPrompt(transcript) }],
			COMPACTION_SYSTEM_PROMPT,
			'summary',
		);
	} catch (error) {
		logAssistantError('compaction', user, error);
		return session;
	}

	const { summary, structured } = parseStructuredContext(raw);
	// Merge with any prior structured context so earlier decisions survive.
	const merged = mergeStructuredContexts(session.structuredContext, structured);
	const lastCompactedMessageId = compactable[compactable.length - 1].id;
	const recentTokens = computeMessageTokens(recent) + estimateTokens(summary);
	const nextVersion = (session.summaryVersion ?? 0) + 1;

	try {
		return await updateSessionContext(pb, userId, session.id, {
			summary: summary || session.summary,
			structuredContext: merged,
			summaryVersion: nextVersion,
			lastCompactedMessageId,
			estimatedTokens: recentTokens,
		});
	} catch (error) {
		logAssistantError('compaction:persist', user, error);
		return session;
	}
};

/**
 * Merges a prior structured context with a freshly compacted one. New values
 * append to existing arrays (deduplicated); scalar fields are overwritten only
 * when the new value is non-empty, so a sparse second compaction does not erase
 * earlier decisions.
 */
export const mergeStructuredContexts = (
	prior: SessionStructuredContext | null,
	next: SessionStructuredContext,
): SessionStructuredContext => {
	if (!prior) return next;
	const mergeArray = (key: keyof SessionStructuredContext): string[] | undefined => {
		const a = (prior[key] as string[] | undefined) ?? [];
		const b = (next[key] as string[] | undefined) ?? [];
		const merged = [...a, ...b].filter((value, index, arr) => arr.indexOf(value) === index);
		return merged.length ? merged.slice(0, 20) : undefined;
	};
	const result: SessionStructuredContext = {
		currentGoal: next.currentGoal || prior.currentGoal,
		decisions: mergeArray('decisions'),
		relevantEntity: next.relevantEntity || prior.relevantEntity,
		constraints: mergeArray('constraints'),
		confirmedChoices: mergeArray('confirmedChoices'),
		completedActions: mergeArray('completedActions'),
		pendingActions: mergeArray('pendingActions'),
		unresolvedQuestions: mergeArray('unresolvedQuestions'),
		importantToolResults: mergeArray('importantToolResults'),
		references: mergeArray('references'),
	};
	for (const key of Object.keys(result) as (keyof SessionStructuredContext)[]) {
		const value = result[key];
		if (Array.isArray(value) && value.length === 0) delete result[key];
	}
	return result;
};

/**
 * Retrieves older (compacted-out) messages matching a query for the
 * `search_history` tool. Searches only messages outside the recent window, so
 * a retrieval never dumps the whole transcript. Returns formatted snippets.
 */
export const retrieveOlderHistory = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	query: string,
): Promise<string> => {
	const q = query.trim();
	if (!q) return 'Tidak ada kata kunci pencarian.';
	await getSession(pb, userId, sessionId);
	const messages = await loadSessionMessages(pb, userId, sessionId);
	const recentIds = new Set(messages.slice(-ASSISTANT_RECENT_MESSAGE_WINDOW).map((m) => m.id));
	const matches = matchOlderMessages(
		messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
		q,
		recentIds,
	);
	if (matches.length === 0) {
		return `Tidak ditemukan pesan lama yang cocok dengan "${q}".`;
	}
	const lines = matches.map((m, i) => {
		const who = m.role === 'user' ? 'Dosen' : m.role === 'assistant' ? 'Asisten' : 'Tool';
		return `${i + 1}. [${who}] ${m.snippet}`;
	});
	return `Ditemukan ${matches.length} pesan lama yang cocok dengan "${q}":\n${lines.join('\n')}`;
};

export { ASSISTANT_HISTORY_RETRIEVAL_LIMIT };
