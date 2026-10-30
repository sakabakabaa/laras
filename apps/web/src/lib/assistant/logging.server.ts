/**
 * Privacy-safe server-side logging for the assistant runtime.
 *
 * Every log helper takes the resolved session (or just a user id) and emits a
 * single structured line for a runtime stage. Nothing logged here ever
 * includes secrets, model API keys, auth tokens, or sensitive student
 * information (names, NIMs, emails, submission contents). User ids are
 * truncated to an 8-character prefix for correlation without exposure.
 */
import logger from '@/lib/logger.server';
import type { AssistantSession } from './types';

/** Truncate a PocketBase record id to a correlation-safe prefix. */
const tag = (id: string | undefined): string => (id ? id.slice(0, 8) : 'anon');

/** Logs the start of an assistant API request. */
export function logAssistantRequest(action: string, session: AssistantSession): void {
	logger.info(`[assistant] request action=${action} user=${tag(session.id)} role=${session.role}`);
}

/** Logs a model invocation. `turn` distinguishes the initial call from a follow-up summary. */
export function logModelRequest(session: AssistantSession, turn: 'primary' | 'summary'): void {
	logger.info(`[assistant] model request turn=${turn} user=${tag(session.id)}`);
}

/** Logs the outcome of a model invocation. */
export function logModelResult(session: AssistantSession, ok: boolean, durationMs: number): void {
	logger.info(`[assistant] model result ok=${ok} ms=${durationMs} user=${tag(session.id)}`);
}

/** Logs a tool execution attempt and its outcome. */
export function logToolExecution(
	session: AssistantSession,
	tool: string,
	kind: 'read' | 'write',
	ok: boolean,
): void {
	logger.info(`[assistant] tool exec tool=${tool} kind=${kind} ok=${ok} user=${tag(session.id)}`);
}

/** Logs a confirmation or rejection of a pending write action. */
export function logConfirmation(
	session: AssistantSession,
	tool: string,
	status: 'confirmed' | 'rejected' | 'executed' | 'failed',
): void {
	logger.info(`[assistant] confirmation tool=${tool} status=${status} user=${tag(session.id)}`);
}

/** Logs an assistant-stage error without secrets or sensitive detail. */
export function logAssistantError(
	stage: string,
	session: AssistantSession | undefined,
	error: unknown,
): void {
	const message = error instanceof Error ? error.message : String(error);
	logger.error(`[assistant] error stage=${stage} user=${session ? tag(session.id) : 'anon'}: ${message}`);
}
