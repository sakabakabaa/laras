/**
 * Assistant runtime — privacy-minimized tool audit logging.
 *
 * Persists one append-only `assistant_tool_audits` row per tool execution and
 * per confirmation/rejection. The record carries only what is needed for
 * accountability and debugging — never secrets, auth tokens, prepared drafts,
 * document text, or student data.
 *
 * Argument sanitization is the core privacy control: large or sensitive fields
 * (drafts, instructions, source text, file contents) are stripped before the
 * args reach the audit row. Only small identifying fields survive.
 */
import type PocketBase from 'pocketbase';
import logger from '@/lib/logger.server';
import type { AssistantToolAudit } from './types';

const AUDIT_COLLECTION = 'assistant_tool_audits';

/**
 * Fields small enough to be safe in an audit row. Everything else (drafts,
 * instructions, sourceText, generated content, file bytes) is dropped. The
 * allowlist is deliberately tiny so a future tool adding a large field does
 * not accidentally leak it into the audit trail.
 */
const AUDIT_ARG_ALLOWLIST = new Set([
	'title',
	'code',
	'courseId',
	'shape',
	'week',
	'mode',
	'activityType',
	'sessionLabel',
	'subCpmkLabel',
	'query',
	'courseLabel',
	'sessionCount',
	'outcomeCount',
]);

/** Maximum length for any single sanitized argument value. */
const AUDIT_ARG_MAX = 200;

/** Truncates a value to a bounded string. */
const clip = (value: unknown, max: number): string => {
	const s = typeof value === 'string' ? value : value == null ? '' : String(value);
	return s.length > max ? `${s.slice(0, max)}…` : s;
};

/**
 * Sanitizes tool arguments for the audit row. Keeps only the small
 * identifying fields in the allowlist, truncated to a safe length. Drafts,
 * instructions, source text, and any unknown field are removed entirely.
 */
export const sanitizeArgsForAudit = (
	tool: string,
	args: Record<string, unknown> | null,
): Record<string, unknown> | null => {
	if (!args || typeof args !== 'object') return null;
	const cleaned: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(args)) {
		if (!AUDIT_ARG_ALLOWLIST.has(key)) continue;
		if (value === undefined || value === null || value === '') continue;
		// Preserve numbers/booleans; clip strings; stringify anything else.
		if (typeof value === 'number' || typeof value === 'boolean') {
			cleaned[key] = value;
		} else {
			cleaned[key] = clip(value, AUDIT_ARG_MAX);
		}
	}
	return Object.keys(cleaned).length ? cleaned : null;
};

/**
 * Builds the privacy-minimized result metadata for an audit row. Carries only
 * the ok flag, source provenance, error code, and a link — never the full
 * data payload (which may contain document text or student aggregates).
 */
const buildResultMeta = (
	result: { ok: boolean; source?: { type: string; id?: string }; error?: { code: string }; link?: string } | null,
): AssistantToolAudit['resultMeta'] => {
	if (!result) return null;
	const meta: NonNullable<AssistantToolAudit['resultMeta']> = { ok: result.ok };
	if (result.source) meta.source = { type: result.source.type, ...(result.source.id ? { id: result.source.id } : {}) };
	if (result.error?.code) meta.errorCode = result.error.code;
	if (result.link) meta.link = result.link;
	return meta;
};

/**
 * Persists a single tool-audit row. Best-effort: a persistence failure is
 * logged and swallowed so it never blocks the lecturer's turn. The audit row
 * is append-only (the collection denies update/delete via REST).
 *
 * @param pb        The lecturer's authenticated PocketBase client.
 * @param userId    The lecturer's user id (audit owner).
 * @param sessionId The session the tool ran in.
 * @param messageId The message row the tool produced (optional for pre-execution denials).
 * @param audit     The audit payload (tool, sanitized args, status, result meta, duration, confirmation state).
 */
export const recordToolAudit = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	messageId: string | undefined,
	audit: AssistantToolAudit,
): Promise<void> => {
	try {
		await pb.collection(AUDIT_COLLECTION).create({
			owner: userId,
			session: sessionId,
			...(messageId ? { message: messageId } : {}),
			tool: audit.tool,
			args: sanitizeArgsForAudit(audit.tool, audit.args),
			status: audit.status,
			resultMeta: buildResultMeta(audit.resultMeta as never),
			durationMs: Math.round(audit.durationMs),
			confirmationState: audit.confirmationState,
		});
	} catch (error) {
		// Audit persistence is best-effort — never block the turn on it.
		logger.error(
			`assistant tool audit write failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};
