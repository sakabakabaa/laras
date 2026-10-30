/**
 * Assistant runtime — compaction (pure helpers).
 *
 * Pure, server-import-free functions for token estimation, threshold checks,
 * message-window splitting, compaction-prompt construction, structured-context
 * parsing, and session-context formatting. Kept separate from
 * {@link ./compaction.server.ts} so every decision is unit-testable without a
 * model call or PocketBase.
 *
 * Design: compaction NEVER deletes messages. The database remains the complete
 * historical record; only the model context is compacted. Older messages are
 * folded into a durable `summary` + `structuredContext` on the session row,
 * and a small recent-message window is kept verbatim for conversational
 * continuity.
 */
import {
	ASSISTANT_COMPACTION_MESSAGE_THRESHOLD,
	ASSISTANT_COMPACTION_TOKEN_THRESHOLD,
	ASSISTANT_HISTORY_RETRIEVAL_LIMIT,
	ASSISTANT_MIN_MESSAGES_BEFORE_COMPACTION,
	ASSISTANT_RECENT_MESSAGE_WINDOW,
} from '@/constants/assistant.config';
import type { SessionStructuredContext } from './types';

/** Rough token estimate (4 chars ≈ 1 token). Matches the persisted column. */
export const estimateTokens = (text: string): number => Math.ceil((text || '').length / 4);

/** Sums token estimates across a list of messages. */
export const computeMessageTokens = (messages: { content: string }[]): number =>
	messages.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);

/** Input to the compaction threshold check. */
export interface CompactionInput {
	messageCount: number;
	estimatedTokens: number;
}

/**
 * Decides whether a session should be compacted. Compaction triggers on EITHER
 * the message-count threshold OR the token threshold, but only once the session
 * is large enough that there is something to summarize beyond the recent
 * window. Returns false for tiny sessions.
 */
export const shouldCompact = (input: CompactionInput): boolean => {
	if (input.messageCount < ASSISTANT_MIN_MESSAGES_BEFORE_COMPACTION) return false;
	// Need more messages than the recent window so compaction has content to fold.
	if (input.messageCount <= ASSISTANT_RECENT_MESSAGE_WINDOW) return false;
	return (
		input.messageCount >= ASSISTANT_COMPACTION_MESSAGE_THRESHOLD ||
		input.estimatedTokens >= ASSISTANT_COMPACTION_TOKEN_THRESHOLD
	);
};

/**
 * Splits a session's messages (oldest first) into the compactable older
 * portion and the verbatim recent window. The recent window is always kept in
 * the model context; only the compactable portion is summarized.
 */
export const splitForCompaction = <T>(messages: T[]): { compactable: T[]; recent: T[] } => {
	const recent = messages.slice(-ASSISTANT_RECENT_MESSAGE_WINDOW);
	const compactable = messages.slice(0, Math.max(0, messages.length - recent.length));
	return { compactable, recent };
};

/**
 * Returns the messages that are NOT in the recent window — i.e. the older,
 * already-compacted portion that `search_history` searches against.
 */
export const olderThanRecentWindow = <T>(messages: T[]): T[] =>
	splitForCompaction(messages).compactable;

/** The system prompt for the compaction model call. */
export const COMPACTION_SYSTEM_PROMPT = `Anda adalah sistem peringkas konteks untuk Asisten Dosen LARAS. Tugas Anda: meringkas percakapan dosen yang sudah panjang menjadi konteks terstruktur yang ringkas namun lengkap, agar asisten dapat melanjutkan percakapan tanpa memuat seluruh transkrip.

PERTAHANKAN informasi penting berikut (hanya yang benar-benar ada):
- currentGoal: tujuan atau niat utama dosen saat ini.
- decisions: keputusan yang sudah diambil.
- relevantEntity: entitas akademik relevan (mata kuliah, tugas, pertemuan) dengan type, id, dan label.
- constraints: batasan atau syarat yang dosen sebutkan.
- confirmedChoices: pilihan yang sudah dikonfirmasi dosen.
- completedActions: aksi yang sudah selesai/dijalankan.
- pendingActions: aksi yang masih tertunda/menunggu konfirmasi.
- unresolvedQuestions: pertanyaan terbuka yang belum terjawab.
- importantToolResults: hasil tool penting (ringkas, bukan salinan penuh).
- references: referensi penting (kode mata kuliah, id, nama).

Aturan:
- Jangan mengarang. Hanya rangkum yang benar-benar ada di percakapan.
- Buatlah "summary": narasi singkat 2-4 kalimat tentang alur percakapan.
- Kembalikan HANYA satu objek JSON (tanpa teks lain, tanpa markdown) dengan format:
{"summary":"...","currentGoal":"...","decisions":[...],"relevantEntity":{"type":"...","id":"...","label":"..."},"constraints":[...],"confirmedChoices":[...],"completedActions":[...],"pendingActions":[...],"unresolvedQuestions":[...],"importantToolResults":[...],"references":[...]}
- Jika sebuah field tidak relevan, kosongkan (string kosong atau array kosong). Jangan null.`;

/**
 * Builds the user-turn content for the compaction model call: the messages to
 * summarize, rendered as a readable transcript.
 */
export const buildCompactionPrompt = (messages: { role: string; content: string }[]): string => {
	const lines = messages.map((m) => {
		const who = m.role === 'user' ? 'Dosen' : m.role === 'assistant' ? 'Asisten' : 'Tool';
		return `${who}: ${m.content}`;
	});
	return `Ringkaslah percakapan berikut menjadi konteks terstruktur sesuai instruksi:\n\n${lines.join('\n')}`;
};

/** Coerces an unknown value into a string array (drops non-strings). */
const asStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === 'string' ? item.trim() : ''))
		.filter((item) => item.length > 0)
		.slice(0, 20);
};

/** Parses the compaction model's JSON response into a structured context. */
export const parseStructuredContext = (raw: string): { summary: string; structured: SessionStructuredContext } => {
	const fallback: SessionStructuredContext = {};
	const empty = { summary: '', structured: fallback };
	const text = (raw || '').trim();
	// Extract the first {...} JSON object — the model may wrap it in prose.
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return empty;
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
	} catch {
		return empty;
	}
	const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 1000) : '';
	const entityRaw = parsed.relevantEntity;
	const relevantEntity =
		entityRaw && typeof entityRaw === 'object' && !Array.isArray(entityRaw)
			? (() => {
					const e = entityRaw as { type?: unknown; id?: unknown; label?: unknown };
					const type = typeof e.type === 'string' ? e.type.trim() : '';
					const id = typeof e.id === 'string' ? e.id.trim() : '';
					const label = typeof e.label === 'string' ? e.label.trim() : '';
					return type || id || label ? { type: type || 'entity', id, label } : undefined;
				})()
			: undefined;
	const structured: SessionStructuredContext = {
		currentGoal: typeof parsed.currentGoal === 'string' ? parsed.currentGoal.trim().slice(0, 300) || undefined : undefined,
		decisions: asStringArray(parsed.decisions).slice(0, 12),
		relevantEntity,
		constraints: asStringArray(parsed.constraints).slice(0, 12),
		confirmedChoices: asStringArray(parsed.confirmedChoices).slice(0, 12),
		completedActions: asStringArray(parsed.completedActions).slice(0, 12),
		pendingActions: asStringArray(parsed.pendingActions).slice(0, 12),
		unresolvedQuestions: asStringArray(parsed.unresolvedQuestions).slice(0, 12),
		importantToolResults: asStringArray(parsed.importantToolResults).slice(0, 12),
		references: asStringArray(parsed.references).slice(0, 12),
	};
	// Drop empty arrays so the stored object stays compact.
	for (const key of Object.keys(structured) as (keyof SessionStructuredContext)[]) {
		const value = structured[key];
		if (Array.isArray(value) && value.length === 0) delete structured[key];
	}
	return { summary, structured };
};

/** True when the session has any durable context worth injecting. */
export const hasDurableContext = (
	summary: string,
	structured: SessionStructuredContext | null,
): boolean => {
	if (summary.trim()) return true;
	if (!structured) return false;
	return Object.values(structured).some((value) => {
		if (Array.isArray(value)) return value.length > 0;
		return value !== undefined && value !== '';
	});
};

/**
 * Formats the durable session context into a system-prompt block the model
 * reads alongside the page context. Returns an empty string when there is no
 * durable context (e.g. a fresh session).
 */
export const formatSessionContext = (
	summary: string,
	structured: SessionStructuredContext | null,
): string => {
	if (!hasDurableContext(summary, structured)) return '';
	const lines: string[] = ['RINGKASAN SESI (konteks percakapan sebelumnya yang sudah diringkas):'];
	if (summary.trim()) lines.push(`Ringkasan: ${summary.trim()}`);
	const s = structured || {};
	const block = (label: string, items?: string[]) => {
		if (items && items.length) lines.push(`- ${label}: ${items.join('; ')}`);
	};
	if (s.currentGoal) lines.push(`- Tujuan saat ini: ${s.currentGoal}`);
	if (s.relevantEntity) {
		const label = s.relevantEntity.label || s.relevantEntity.id || s.relevantEntity.type;
		lines.push(`- Entitas relevan: ${s.relevantEntity.type} — ${label}${s.relevantEntity.id ? ` (id: ${s.relevantEntity.id})` : ''}`);
	}
	block('Keputusan', s.decisions);
	block('Batasan', s.constraints);
	block('Pilihan dikonfirmasi', s.confirmedChoices);
	block('Aksi selesai', s.completedActions);
	block('Aksi tertunda', s.pendingActions);
	block('Pertanyaan terbuka', s.unresolvedQuestions);
	block('Hasil tool penting', s.importantToolResults);
	block('Referensi', s.references);
	lines.push('Gunakan ringkasan ini sebagai konteks. Untuk detail yang tidak ada di sini maupun di pesan terbaru, panggil tool search_history.');
	return lines.join('\n');
};

/**
 * Selects older messages matching a query (case-insensitive substring). Used by
 * the `search_history` tool to retrieve scoped historical context without
 * loading the whole transcript into the model context.
 */
export const matchOlderMessages = (
	messages: { id: string; role: string; content: string }[],
	query: string,
	recentIds: Set<string>,
): { id: string; role: string; snippet: string }[] => {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const matches: { id: string; role: string; snippet: string }[] = [];
	for (const m of messages) {
		if (recentIds.has(m.id)) continue;
		const content = m.content || '';
		const idx = content.toLowerCase().indexOf(q);
		if (idx === -1) continue;
		const start = Math.max(0, idx - 60);
		const end = Math.min(content.length, idx + q.length + 120);
		const prefix = start > 0 ? '…' : '';
		const suffix = end < content.length ? '…' : '';
		matches.push({ id: m.id, role: m.role, snippet: `${prefix}${content.slice(start, end)}${suffix}` });
		if (matches.length >= ASSISTANT_HISTORY_RETRIEVAL_LIMIT) break;
	}
	return matches;
};

export {
	ASSISTANT_RECENT_MESSAGE_WINDOW,
	ASSISTANT_COMPACTION_MESSAGE_THRESHOLD,
	ASSISTANT_COMPACTION_TOKEN_THRESHOLD,
	ASSISTANT_MIN_MESSAGES_BEFORE_COMPACTION,
	ASSISTANT_HISTORY_RETRIEVAL_LIMIT,
};
