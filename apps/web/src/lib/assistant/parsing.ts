/**
 * Assistant runtime — response parsing & pure text helpers.
 *
 * Pure functions that extract tool/clarify blocks from the model's response and
 * normalise the visible text. No server-only imports, so this module is safe to
 * reason about in isolation and unit-test.
 */
import type { ActiveShape, AssistantToolCall, ClarifyQuestion, StructuredToolCall } from './types';

const DEFAULT_PLACEHOLDER = 'Ketik jawaban Anda...';

/** Truncates an unknown value to a bounded string. */
export const str = (value: unknown, max = 200): string => {
	const s = typeof value === 'string' ? value : value == null ? '' : String(value);
	return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** Extracts the first ```tool JSON block from the model's response.
 * @deprecated Phase 14 — kept only as a legacy fallback. The primary protocol
 *   is the structured [[TOOL_CALL]] format parsed by {@link parseToolCalls}.
 *   New code must not depend on this fenced syntax. */
export const parseToolBlock = (text: string): AssistantToolCall | null => {
	const fence = text.match(/```tool\s*([\s\S]*?)```/);
	const raw = fence ? fence[1] : '';
	if (!raw.trim()) return null;
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return null;
	try {
		const parsed = JSON.parse(raw.slice(start, end + 1)) as { tool?: string; args?: Record<string, unknown> };
		if (!parsed.tool || typeof parsed.tool !== 'string') return null;
		return { tool: parsed.tool, args: parsed.args ?? {} };
	} catch {
		return null;
	}
};

/** Strips the tool block from the visible text, leaving the intro/summary. */
export const stripToolBlock = (text: string): string =>
	text.replace(/```tool\s*[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim();

// ── Phase 14: structured tool-call protocol ────────────────────────────────
// The primary protocol. The model emits one or more structured tool calls as
// JSON objects wrapped in [[TOOL_CALL]] ... [[/TOOL_CALL]] markers. This is a
// structured, schema-validated format — not the legacy fenced ```tool syntax.

const TOOL_CALL_RE = /\[\[TOOL_CALL\]\]\s*([\s\S]*?)\[\[\/TOOL_CALL\]\]/g;

/** Parses every structured [[TOOL_CALL]] block from the model's response. */
export const parseToolCalls = (text: string): StructuredToolCall[] => {
	const calls: StructuredToolCall[] = [];
	for (const match of text.matchAll(TOOL_CALL_RE)) {
		const raw = match[1] || '';
		const start = raw.indexOf('{');
		const end = raw.lastIndexOf('}');
		if (start === -1 || end === -1 || end <= start) continue;
		try {
			const parsed = JSON.parse(raw.slice(start, end + 1)) as { name?: unknown; args?: unknown };
			if (typeof parsed.name !== 'string' || !parsed.name.trim()) continue;
			const args = parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args)
				? (parsed.args as Record<string, unknown>)
				: {};
			calls.push({ name: parsed.name.trim(), args });
		} catch {
			/* skip malformed block */
		}
	}
	return calls;
};

/** Strips all structured tool-call blocks from the visible text. */
export const stripToolCalls = (text: string): string =>
	text.replace(TOOL_CALL_RE, '').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Parses tool calls using the primary structured protocol, falling back to the
 * legacy fenced ```tool block only when the structured format yields nothing.
 * Returns the first call (the agent loop executes one per turn and re-asks).
 */
export const parsePrimaryToolCall = (text: string): StructuredToolCall | null => {
	const structured = parseToolCalls(text);
	if (structured.length > 0) return structured[0];
	const legacy = parseToolBlock(text);
	return legacy ? { name: legacy.tool, args: legacy.args } : null;
};

const CLARIFY_FENCE_CLOSED = /```clarify\s*([\s\S]*?)```/i;
const CLARIFY_FENCE_OPEN = /```clarify\b([\s\S]*)$/i;

/** True when the model leaked the clarification protocol into visible text. */
export const hasClarifyProtocol = (text: string): boolean =>
	/```clarify\b/i.test(text) || /\{\s*"questions"\s*:/.test(text);

const questionsFromList = (value: unknown): ClarifyQuestion[] | null => {
	if (!Array.isArray(value)) return null;
	const questions = value
		.map((item) => {
			const row = item && typeof item === 'object' ? (item as { prompt?: unknown; placeholder?: unknown }) : {};
			const prompt = shortenClarifyPrompt(str(row.prompt, 400).replace(/\s+/g, ' ').trim());
			const placeholder = str(row.placeholder, 80).replace(/\s+/g, ' ').trim() || DEFAULT_PLACEHOLDER;
			return prompt ? { prompt, placeholder } : null;
		})
		.filter((item): item is ClarifyQuestion => Boolean(item))
		.slice(0, 3);
	return questions.length ? questions : null;
};

const questionsFromPayload = (raw: string): ClarifyQuestion[] | null => {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end <= start) return null;
	const slice = raw.slice(start, end + 1);
	const attempts = [slice, slice.replace(/[\r\n]+/g, ' ')];
	for (const candidate of attempts) {
		try {
			const parsed = JSON.parse(candidate) as { questions?: unknown };
			const questions = questionsFromList(parsed.questions);
			if (questions) return questions;
		} catch {
			/* try the next repair */
		}
	}
	const loose = [...slice.matchAll(/"prompt"\s*:\s*"((?:\\.|[^"\\])*)"/g)];
	if (!loose.length) return null;
	return questionsFromList(
		loose.map((match) => ({
			prompt: match[1].replace(/\\n/g, ' ').replace(/\\"/g, '"'),
			placeholder: DEFAULT_PLACEHOLDER,
		})),
	);
};

/**
 * Reads a clarification request from a closed ```clarify fence, an unclosed
 * fence (the model often omits the closing ```), or a bare questions JSON object.
 * Invalid or empty question lists are ignored.
 */
export const parseClarifyBlock = (text: string): ClarifyQuestion[] | null => {
	const payloads: string[] = [];
	const closed = text.match(CLARIFY_FENCE_CLOSED);
	if (closed) payloads.push(closed[1]);
	const open = text.match(CLARIFY_FENCE_OPEN);
	if (open) payloads.push(open[1]);
	const bare = text.search(/\{\s*"questions"\s*:/);
	if (bare >= 0) payloads.push(text.slice(bare));
	for (const payload of payloads) {
		const questions = questionsFromPayload(payload);
		if (questions) return questions;
	}
	return null;
};

/** Strips clarify fences and protocol JSON from lecturer-visible text. */
export const stripClarifyBlock = (text: string): string => {
	let next = text.replace(CLARIFY_FENCE_CLOSED, '');
	next = next.replace(CLARIFY_FENCE_OPEN, '');
	next = next.replace(/```clarify\b/gi, '');
	const bare = next.search(/\{\s*"questions"\s*:/);
	if (bare >= 0 && questionsFromPayload(next.slice(bare))) {
		next = next.slice(0, bare);
	}
	return next.replace(/\n{3,}/g, '\n\n').trim();
};

const GENERIC_CLOSER = /^(ada yang|apakah ada yang lain|ada lagi|mau saya|ingin saya|bisa saya bantu)/i;

/**
 * Fallback when the model asks in prose instead of a clarify block.
 * Only short, direct questions — not a summary that happens to end with "?".
 */
export const extractProseQuestions = (text: string): ClarifyQuestion[] | null => {
	const lines = text
		.split(/\n+/)
		.map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
		.filter((line) => line.endsWith('?') && line.length >= 12 && line.length <= 220 && !GENERIC_CLOSER.test(line));
	const unique = [...new Set(lines)].slice(0, 3);
	if (unique.length === 0) return null;
	const questionText = unique.join(' ');
	if (unique.length === 1 && questionText.length < text.trim().length * 0.45) return null;
	return unique.map((prompt) => ({ prompt: shortenClarifyPrompt(prompt), placeholder: DEFAULT_PLACEHOLDER }));
};

const LEGACY_SHAPE_LIST = /individual|group_project|case_study|presentation|practical|portfolio|discussion|language_project|vocabulary|quiz|listening|reading|conversation/i;

/** The creator only offers Menulis and Berbicara. Never surface the old shape list. */
export const shortenClarifyPrompt = (prompt: string): string => {
	if (!LEGACY_SHAPE_LIST.test(prompt)) return prompt.length > 180 ? `${prompt.slice(0, 177)}…` : prompt;
	if (/pertemuan|minggu/i.test(prompt) && !/menulis|berbicara|writing|speaking/i.test(prompt)) {
		return 'Pertemuan ke berapa, dan jenisnya Menulis atau Berbicara?';
	}
	return 'Jenis tugas: Menulis atau Berbicara?';
};

/** Extracts a pertemuan/minggu number (1–32) from free text. */
export const weekFromText = (text: string): number | null => {
	const match = text.match(/pertemuan\s*(?:ke[- ]*)?(\d{1,2})|minggu\s*(?:ke[- ]*)?(\d{1,2})/i);
	if (!match) return null;
	const week = Number(match[1] || match[2]);
	return week >= 1 && week <= 32 ? week : null;
};

/** Detects a writing/speaking skill hint from free text. */
export const skillFromText = (text: string): ActiveShape | '' => {
	const writing = /menulis|\bwriting\b|esai|karangan/i.test(text);
	const speaking = /berbicara|\bspeaking\b|\blisan\b/i.test(text);
	if (writing && !speaking) return 'writing';
	if (speaking && !writing) return 'speaking';
	if (writing) return 'writing';
	return '';
};

/** Normalises a shape argument (string) plus a free-text hint into writing/speaking. */
export const normalizeSkill = (value: unknown, hint: string): ActiveShape | '' => {
	const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
	if (raw === 'writing' || raw === 'language_project' || raw === 'menulis') return 'writing';
	if (raw === 'speaking' || raw === 'conversation' || raw === 'berbicara') return 'speaking';
	return skillFromText(`${raw} ${hint}`);
};

/**
 * Shown once when the model repeats an unconfirmed roster-add request.
 * It is not a confirmation and must never be treated as permission to write.
 */
export const ROSTER_ADD_CONFIRM_NOTE =
	'Permintaan itu sudah ditampilkan. Roster belum diubah — penambahan hanya berjalan setelah konfirmasi eksplisit, dan tidak menghapus roster yang sudah ada.';

/** Collapses whitespace so repeated confirmations can be compared stably. */
export const normalizeAssistantText = (text: string): string =>
	text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * True when two lecturer-visible replies are the same request, including a
 * second copy that was cut off mid-sentence.
 */
export const isSameAssistantText = (left: string, right: string): boolean => {
	const a = normalizeAssistantText(left);
	const b = normalizeAssistantText(right);
	if (!a || !b) return false;
	if (a === b) return true;
	const shorter = a.length < b.length ? a : b;
	const longer = a.length < b.length ? b : a;
	return shorter.length >= 40 && longer.startsWith(shorter);
};

/**
 * Drops a paragraph that repeats the previous one, and a second half that
 * repeats the first. Keeps the first copy so a confirmation is shown once.
 */
export const collapseRepeatedAssistantText = (text: string): string => {
	const source = text.replace(/\r\n/g, '\n').trim();
	if (!source) return '';
	const paragraphs = source.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
	const kept: string[] = [];
	for (const paragraph of paragraphs) {
		const previous = kept[kept.length - 1];
		if (previous && isSameAssistantText(previous, paragraph)) continue;
		kept.push(paragraph);
	}
	if (kept.length >= 2 && kept.length % 2 === 0) {
		const half = kept.length / 2;
		const first = kept.slice(0, half).join('\n\n');
		const second = kept.slice(half).join('\n\n');
		if (isSameAssistantText(first, second)) return first;
	}
	return kept.join('\n\n');
};

/** Prose that asks to add roster rows without deleting the ones already there. */
export const isUnconfirmedRosterAdd = (text: string): boolean =>
	/menambahkan/i.test(text) && /roster/i.test(text) && /tanpa menghapus/i.test(text);

export type DuplicateDecision =
	| { action: 'show'; text: string }
	| { action: 'note'; text: string }
	| { action: 'suppress' };

/**
 * Decides what the lecturer should see. A repeated roster-add confirmation
 * becomes a single note that nothing was written — never a second copy, and
 * never permission to change the roster.
 */
export const decideAssistantVisible = (text: string, recentAssistant: string[]): DuplicateDecision => {
	const collapsed = collapseRepeatedAssistantText(text);
	if (!collapsed) return { action: 'suppress' };
	const prior = recentAssistant.map((item) => collapseRepeatedAssistantText(item)).filter(Boolean);
	const repeated = prior.some((item) => isSameAssistantText(item, collapsed));
	if (!repeated) return { action: 'show', text: collapsed };
	if (isUnconfirmedRosterAdd(collapsed) && !prior.some((item) => isSameAssistantText(item, ROSTER_ADD_CONFIRM_NOTE))) {
		return { action: 'note', text: ROSTER_ADD_CONFIRM_NOTE };
	}
	return { action: 'suppress' };
};

/** Hides consecutive duplicate assistant bubbles, including ones already stored. */
export function collapseAssistantThread<T extends { role: string; content: string }>(items: T[]): T[] {
	const visible: T[] = [];
	for (const item of items) {
		if (item.role !== 'assistant') {
			visible.push(item);
			continue;
		}
		const text = collapseRepeatedAssistantText(item.content);
		if (!text) continue;
		const previous = [...visible].reverse().find((row) => row.role === 'assistant');
		if (previous && isSameAssistantText(previous.content, text)) continue;
		visible.push(text === item.content ? item : { ...item, content: text });
	}
	return visible;
}

/** Strips embedded JSON/tool payloads and markdown bold from a summary. */
export const stripEmbeddedPayload = (text: string): string =>
	text
		.replace(/```[\s\S]*?```/g, '')
		.replace(/\{[^{}]*"(?:courseId|tool)"[^{}]*\}/g, '')
		.replace(/\*\*/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

/** Slugifies a course code for matching. */
export const slugifyCode = (code: string): string =>
	code.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** PocketBase record id pattern. */
export const PB_ID_RE = /^[a-z0-9]{15}$/;

/** Generates a short random id (used for rubric criteria rows). */
export const rowId = (prefix: string): string => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

/** Human-readable labels for assignment shapes (legacy + active). */
export const SHAPE_LABEL: Record<string, string> = {
	individual: 'Individu',
	group_project: 'Proyek kelompok',
	case_study: 'Studi kasus',
	presentation: 'Presentasi',
	practical: 'Praktik',
	portfolio: 'Portofolio',
	discussion: 'Diskusi',
	quiz: 'Kuis',
	listening: 'Menyimak',
	writing: 'Menulis',
	speaking: 'Berbicara',
	reading: 'Membaca',
	conversation: 'Percakapan',
	vocabulary: 'Kosakata',
	language_project: 'Proyek bahasa',
};
