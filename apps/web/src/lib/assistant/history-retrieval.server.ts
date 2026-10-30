import type PocketBase from 'pocketbase';
import { ASSISTANT_RECENT_MESSAGE_WINDOW } from '@/constants/assistant.config';
import { matchOlderMessages } from './compaction';
import { getSession, loadSessionMessages } from './persistence.server';

/** Search messages outside the recent window for the assistant's history tool. */
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
	const recentIds = new Set(messages.slice(-ASSISTANT_RECENT_MESSAGE_WINDOW).map((message) => message.id));
	const matches = matchOlderMessages(
		messages.map((message) => ({ id: message.id, role: message.role, content: message.content })),
		q,
		recentIds,
	);
	if (matches.length === 0) return `Tidak ditemukan pesan lama yang cocok dengan "${q}".`;
	const lines = matches.map((match, index) => {
		const who = match.role === 'user' ? 'Dosen' : match.role === 'assistant' ? 'Asisten' : 'Tool';
		return `${index + 1}. [${who}] ${match.snippet}`;
	});
	return `Ditemukan ${matches.length} pesan lama yang cocok dengan "${q}":\n${lines.join('\n')}`;
};
