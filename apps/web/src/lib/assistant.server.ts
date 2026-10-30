/**
 * LARAS Asisten Dosen — public facade.
 *
 * The assistant runtime has been decomposed into focused modules under
 * `./assistant/`, each owning one runtime responsibility:
 *
 *   - `types`              — AssistantSession, AssistantMessage, AssistantTool,
 *                            AssistantToolCall, AssistantToolResult,
 *                            AssistantPageContext, AssistantMemory, AssistantContext
 *   - `logging.server`     — privacy-safe stage logging (no secrets/tokens/student data)
 *   - `env.server`          — shared environment helpers
 *   - `auth.server`         — authentication & session resolution (resolveFaculty)
 *   - `persistence.server` — conversation persistence (load/save/clear history)
 *   - `model.server`       — model invocation (collectModel)
 *   - `parsing`            — response parsing & pure text helpers
 *   - `context.server`     — course resolution, page context, system prompt
 *   - `attachments.server` — attachment block construction
 *   - `tools.server`       — read-only tools, write-tool executors, draft prep, registry
 *   - `runtime.server`     — the orchestrator (handleSend/handleConfirm/handleReject)
 *
 * This file re-exports the public API so `api.assistant.ts` and any other
 * consumer keep importing from `@/lib/assistant.server` unchanged. Existing
 * behaviour is preserved verbatim: read-only tools execute immediately, write
 * actions require confirmation, clarifications continue working, RPS PDF
 * import and attachments continue working, and faculty authentication remains
 * mandatory.
 */
export { resolveFaculty } from './assistant/auth.server';
export { buildAttachmentBlock } from './assistant/attachments.server';
export {
	archiveSession,
	createSession,
	deleteSession,
	getSession,
	listSessions,
	mapSessionSummary,
	renameSession,
} from './assistant/persistence.server';
export { handleClear, handleHistory } from './assistant/persistence.server';
export { handleConfirm, handleReject, handleSend } from './assistant/runtime.server';

export type {
	AssistantContext,
	AssistantHistoryItem,
	AssistantMemory,
	AssistantMessage,
	AssistantMessageRecord,
	AssistantPageContext,
	AssistantSession,
	AssistantSessionRecord,
	AssistantSessionSummary,
	AssistantTool,
	AssistantToolCall,
	AssistantToolResult,
	AssistantUser,
	Clarification,
	ClarifyQuestion,
	PendingAction,
	SendResult,
} from './assistant/types';
