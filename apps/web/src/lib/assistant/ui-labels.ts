/**
 * LARAS Asisten Dosen — pure UI label helpers.
 *
 * Client-safe, no server-only imports, no JSX, no PocketBase — so this module
 * is safe to import from components and to unit-test in isolation. It maps
 * internal tool names and page-context state into the compact Indonesian
 * labels shown in the assistant surface, and sanitizes error strings so
 * internal stack traces, PocketBase internals, API keys, and tokens never
 * reach the lecturer.
 */
import { FEATURE_BY_NAME } from './features';
import type { AssistantPageContextInput } from './types';

/** A single completed tool execution surfaced to the lecturer. */
export type ToolActivityItem = {
	tool: string;
	/** Friendly Indonesian label, e.g. "Memeriksa mata kuliah". */
	label: string;
	/** Whether the tool execution succeeded. */
	ok: boolean;
};

/** Maps a tool name to a compact Indonesian activity label. */
export function toolActivityLabel(toolName: string): string {
	switch (toolName) {
		case 'list_courses':
			return 'Memeriksa mata kuliah';
		case 'list_assignments':
			return 'Memeriksa tugas';
		case 'course_detail':
			return 'Memeriksa detail mata kuliah';
		case 'summarize_insights':
			return 'Menganalisis wawasan akademik';
		case 'student_profile':
			return 'Memeriksa ringkasan mahasiswa';
		case 'calendar_events':
			return 'Memeriksa kalender akademik';
		case 'course_materials':
			return 'Mencari materi mata kuliah';
		case 'import_rps_pdf':
			return 'Menganalisis RPS';
		case 'search_history':
			return 'Mencari riwayat percakapan';
		case 'create_course':
			return 'Menyiapkan mata kuliah';
		case 'create_assignment':
			return 'Menyiapkan tugas';
		default:
			return 'Memproses permintaan';
	}
}

/** Builds a ToolActivityItem from a tool name and its success flag. */
export function toolActivity(toolName: string, ok: boolean): ToolActivityItem {
	return { tool: toolName, label: toolActivityLabel(toolName), ok };
}

/**
 * Builds a compact context breadcrumb from the published page context, e.g.
 * ["Deutsch B1", "Tugas", "Tugas 3"]. Returns an empty array when no usable
 * signal is present (so the indicator can be hidden).
 *
 * Only human-readable labels from `state` are used — never raw entity ids.
 */
export function buildContextBreadcrumb(context: AssistantPageContextInput | null | undefined): string[] {
	if (!context) return [];
	const state = (context.state ?? {}) as Record<string, unknown>;
	const segments: string[] = [];

	const courseLabel =
		(typeof state.courseCode === 'string' && state.courseCode.trim()) ||
		(typeof state.courseTitle === 'string' && state.courseTitle.trim()) ||
		'';
	if (courseLabel) segments.push(courseLabel);

	const featureLabel = context.feature ? FEATURE_BY_NAME.get(context.feature)?.label : undefined;
	if (featureLabel) segments.push(featureLabel);

	const section = typeof state.section === 'string' ? state.section.trim() : '';
	if (section) segments.push(section);

	const assignmentTitle =
		typeof state.assignmentTitle === 'string' ? state.assignmentTitle.trim() : '';
	if (assignmentTitle) segments.push(assignmentTitle);

	// De-duplicate adjacent identical segments.
	return segments.filter((segment, index) => index === 0 || segment !== segments[index - 1]);
}

/** True when the page context carries any usable signal for the indicator. */
export function hasContextIndicator(context: AssistantPageContextInput | null | undefined): boolean {
	return buildContextBreadcrumb(context).length > 0;
}

// Patterns that should never reach the lecturer UI.
const INTERNAL_PATTERNS = [
	/sql:\s/i,
	/no rows in result set/i,
	/pocketbase/i,
	/stack trace/i,
	/at\s.+\.ts?:\d+/i,
	/\b(token|apikey|api_key|authorization|bearer)\b[:=]/i,
	/\/api\/collections\//i,
	/127\.0\.0\.1|localhost:\d+/i,
	/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i,
];

const MAX_ERROR_LEN = 220;

/**
 * Sanitizes an error message for display: drops stack traces, PocketBase
 * internals, API keys, tokens, file paths, and internal hostnames; truncates
 * to a readable length. Falls back to a generic Indonesian message when nothing
 * safe remains.
 */
export function sanitizeError(raw: string | unknown): string {
	if (raw instanceof Error) raw = raw.message;
	if (typeof raw !== 'string') return 'Terjadi kesalahan. Coba beberapa saat lagi.';

	// Keep only the first line — stack traces live below the first newline.
	const firstLine = raw.split('\n', 1)[0].trim();

	// If the first line itself smells internal, fall back rather than leak.
	const smellsInternal = INTERNAL_PATTERNS.some((pattern) => pattern.test(firstLine));
	if (smellsInternal) return 'Terjadi kesalahan pada layanan asisten. Coba beberapa saat lagi.';

	const cleaned = firstLine
		.replace(/^Error:\s*/i, '')
		.replace(/\s{2,}/g, ' ')
		.trim();

	if (!cleaned) return 'Terjadi kesalahan. Coba beberapa saat lagi.';
	return cleaned.length > MAX_ERROR_LEN ? `${cleaned.slice(0, MAX_ERROR_LEN)}…` : cleaned;
}

/** Formats a session's last-activity timestamp into a compact relative label. */
export function formatLastActivity(iso: string | null | undefined): string {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const now = Date.now();
	const diffMs = now - then;
	const minutes = Math.round(diffMs / 60000);
	if (minutes < 1) return 'Baru saja';
	if (minutes < 60) return `${minutes} mnt lalu`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days} hari lalu`;
	const date = new Date(iso);
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${day}/${month}`;
}
