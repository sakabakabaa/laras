/**
 * Assistant runtime type definitions.
 *
 * These interfaces formalise the LARAS Asisten Dosen runtime architecture:
 * the authenticated faculty session, the conversation memory, the page
 * context, the tool protocol, and the context bundle a turn is executed in.
 *
 * They wrap the existing concepts (previously loose types in
 * `assistant.server.ts`) without changing runtime behaviour — every shape here
 * is structurally compatible with the data the persisted collection and the
 * model already exchange.
 */
import type PocketBase from 'pocketbase';
import type { Course } from '@/lib/learning';
import type { AssignmentStage } from '@/lib/assignments';

/**
 * An authenticated faculty session resolved from the request.
 *
 * Replaces the old `AssistantUser` loose type. The PocketBase client carries
 * the lecturer's own token, so collection access rules remain the
 * authorization layer — the runtime never escalates to superuser for
 * assistant work.
 */
export interface AssistantSession {
	id: string;
	pb: PocketBase;
	role: 'faculty';
	verified: boolean;
}

/** Backwards-compatible alias; the API route and handlers still accept this. */
export type AssistantUser = AssistantSession;

/**
 * A single persisted conversation message (the `assistant_conversations` row).
 *
 * `owner` is the lecturer's user id; `toolResult` holds either a read-tool's
 * raw result, a prepared write-tool draft, or a confirmation link/error.
 */
export interface AssistantMessage {
	id: string;
	owner: string;
	role: 'user' | 'assistant';
	content: string;
	toolName: string;
	toolArgs: Record<string, unknown> | null;
	toolResult: unknown;
	actionStatus: string;
	created: string;
}

/** The raw persisted row — kept as an alias for internal call sites. */
export type ConvRow = AssistantMessage;

/** A message mapped for the client-facing history payload. */
export type AssistantHistoryItem = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	toolName: string;
	toolArgs: Record<string, unknown> | null;
	actionStatus: string;
	created: string;
};

/**
 * A persisted assistant session (`assistant_sessions` row).
 *
 * Session metadata is kept separate from the message stream. The model context
 * is composed from the durable `summary` + `structuredContext` (produced by
 * compaction) plus a small recent-message window — the full message stream is
 * never loaded into a model request. Original messages remain in the database
 * as the complete audit record.
 */
export interface AssistantSessionRecord {
	id: string;
	owner: string;
	title: string;
	status: 'active' | 'archived';
	feature: string;
	entityType: string;
	entityId: string;
	/** Narrative summary of the compacted (older) portion of the conversation. */
	summary: string;
	/** Structured session state produced by compaction (goal, decisions, …). */
	structuredContext: SessionStructuredContext | null;
	/** Increments each time compaction runs. 0 = never compacted. */
	summaryVersion: number;
	/** Id of the newest message folded into the summary (compaction cursor). */
	lastCompactedMessageId: string;
	/** Cached token estimate of the recent window + summary. */
	estimatedTokens: number;
	messageCount: number;
	lastMessageAt: string;
	created: string;
	updated: string;
}

/**
 * Structured session state preserved across compaction. Each field is optional
 * and only populated when the compaction model found relevant content; the
 * shape is deliberately permissive so partial summaries stay valid.
 */
export interface SessionStructuredContext {
	currentGoal?: string;
	decisions?: string[];
	relevantEntity?: { type: string; id: string; label: string };
	constraints?: string[];
	confirmedChoices?: string[];
	completedActions?: string[];
	pendingActions?: string[];
	unresolvedQuestions?: string[];
	importantToolResults?: string[];
	references?: string[];
}

/**
 * A persisted assistant message (`assistant_messages` row), scoped to a session.
 * `role` may be `tool` for tool-result turns the model should see as context.
 */
export interface AssistantMessageRecord {
	id: string;
	session: string;
	owner: string;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	toolName: string;
	toolArgs: Record<string, unknown> | null;
	toolResult: unknown;
	actionStatus: string;
	tokenEstimate: number;
	created: string;
	updated: string;
}

/** A session row mapped for the client-facing session list payload. */
export type AssistantSessionSummary = {
	id: string;
	title: string;
	status: 'active' | 'archived';
	messageCount: number;
	lastMessageAt: string;
	created: string;
	updated: string;
	/** Increments each time compaction runs (0 = never compacted). Diagnostic only. */
	summaryVersion: number;
	/** Cached token estimate of the recent window + summary. Diagnostic only. */
	estimatedTokens: number;
	/** The feature key active when the session was last used. Diagnostic only. */
	feature: string;
	/** Narrative summary of the compacted (older) portion. Diagnostic only. */
	summary: string;
};

/** A tool definition in the assistant runtime (legacy shape, kept for compat). */
export interface AssistantTool {
	name: string;
	/** Read tools execute immediately; write tools require lecturer confirmation. */
	kind: 'read' | 'write';
	description: string;
}

// ── Phase 14: structured tool registry ─────────────────────────────────────

/**
 * Execution permission level for a registered tool.
 *
 * - `read`        — retrieves data; executes immediately, no confirmation.
 * - `draft`       — produces a reviewable draft with NO protected persistent
 *                   side effect; executes immediately, no confirmation.
 * - `write`       — creates/modifies a protected record; requires explicit
 *                   lecturer confirmation before anything is persisted.
 * - `destructive` — removes or irreversibly changes a record; requires
 *                   explicit confirmation with a clear human-readable
 *                   description of what will be destroyed.
 */
export type ToolPermission = 'read' | 'draft' | 'write' | 'destructive';

/**
 * A single field in a tool's structured input schema. A minimal JSON-schema-
 * like spec used for validation, documentation, and the system prompt — never
 * natural-language parsing.
 */
export interface ToolFieldSchema {
	type: 'string' | 'number' | 'boolean';
	description?: string;
	required?: boolean;
	enum?: string[];
}

/** The structured input schema for a registered tool. */
export interface ToolInputSchema {
	type: 'object';
	properties: Record<string, ToolFieldSchema>;
	required?: string[];
}

/** Context handed to a tool's execute function. */
export interface ToolExecutionContext {
	pb: PocketBase;
	userId: string;
	files: File[];
	courseRoute: string;
	/** The active session id (for search_history retrieval). */
	sessionId: string;
}

/**
 * The standardized, typed result of executing a tool. Read tools return this
 * from `execute`; write tools return a {@link PreparedAction} instead (they
 * only prepare a draft pending confirmation).
 */
export interface TypedToolResult {
	ok: boolean;
	data?: unknown;
	error?: { code: string; message: string };
	source?: { type: string; id?: string };
}

/**
 * A fully registered assistant tool: a typed name, a structured input schema,
 * a permission level, whether it requires lecturer confirmation, and (for read
 * tools) a typed execute function. Write tools omit `execute` and instead
 * expose `prepare` (draft) + `executeWrite` (on confirmation).
 */
export interface AssistantToolDefinition {
	name: string;
	description: string;
	permission: ToolPermission;
	requiresConfirmation: boolean;
	inputSchema: ToolInputSchema;
	/** Read tools execute immediately and return a typed result. */
	execute?: (ctx: ToolExecutionContext, args: Record<string, unknown>) => Promise<TypedToolResult>;
	/**
	 * For `destructive` tools only: a clear, human-readable description of what
	 * the confirmed action will destroy or irreversibly change. Surfaced in the
	 * confirmation card so the lecturer understands the consequence.
	 */
	destructiveDescription?: string;
}

/** A parsed tool call extracted from the model's response (structured format). */
export interface StructuredToolCall {
	name: string;
	args: Record<string, unknown>;
}

/** A parsed tool call extracted from the model's response. */
export interface AssistantToolCall {
	tool: string;
	args: Record<string, unknown>;
}

/** The outcome of executing a tool (read result or confirmed write). */
export interface AssistantToolResult {
	text: string;
	link?: string;
	draft?: unknown;
}

/**
 * Client-provided semantic page context (sent with each assistant turn).
 *
 * Pages publish a small structured snapshot of what the lecturer is viewing —
 * never the raw DOM, HTML, or React tree. Entity IDs are validated and
 * authorized server-side before they reach the model; an unauthorized ID is
 * silently dropped.
 */
export interface AssistantPageContextInput {
	/** The current route path (e.g. "/app/courses/abc123/rps"). */
	route?: string;
	/** Feature key from the registry (courses, rps, assignments, …). */
	feature?: string;
	/** The primary entity open on the page, if any. */
	entity?: { type: string; id: string };
	/** Small page state (active tab, editing flag, selected filter, …). */
	state?: Record<string, unknown>;
	/** Actions available on the page, used to ground assistant suggestions. */
	availableActions?: string[];
}

/**
 * Server-resolved page context: the validated client input plus the course the
 * lecturer currently has open (resolved from the entity or the route, never
 * trusted from the client). The `course`/`courseRoute` fields are filled in
 * server-side; the rest mirrors {@link AssistantPageContextInput}.
 */
export interface AssistantPageContext {
	route: string;
	feature: string;
	entity?: { type: string; id: string };
	state?: Record<string, unknown>;
	availableActions?: string[];
	/** The course code/id segment from the URL, if any. */
	courseRoute: string;
	/** The resolved course the lecturer currently has open, if any. */
	course: Course | null;
}

/** The conversation memory: prior turns available to the model. */
export interface AssistantMemory {
	/** Persisted rows, oldest first. */
	rows: AssistantMessage[];
	/** Rows mapped into the `{ role, content }` shape the model API expects. */
	history: { role: string; content: string }[];
}

/** The full context bundle a turn is executed within. */
export interface AssistantContext {
	session: AssistantSession;
	memory: AssistantMemory;
	pageContext: AssistantPageContext;
	systemPrompt: string;
}

/** A record-creating action awaiting lecturer confirmation. */
export type PendingAction = {
	messageId: string;
	tool: string;
	args: Record<string, unknown>;
	summary: string;
};

/** A single clarification question shown to the lecturer. */
export type ClarifyQuestion = {
	prompt: string;
	placeholder: string;
};

/** A clarification request surfaced by the assistant. */
export type Clarification = {
	messageId: string;
	questions: ClarifyQuestion[];
};

/** The result of processing a lecturer message. */
export type SendResult = {
	text: string;
	pendingAction?: PendingAction;
	clarification?: Clarification;
	/** Read tools executed during this turn, in order, for the activity trail. */
	toolActivity?: { tool: string; ok: boolean }[];
	/** The model repeated a confirmation already shown. Nothing was written. */
	suppressedDuplicate?: boolean;
};

/** The two task shapes the creator offers. */
export const ACTIVE_SHAPES = ['writing', 'speaking'] as const;
export type ActiveShape = (typeof ACTIVE_SHAPES)[number];

/**
 * A fully prepared writing/speaking assignment draft, built the same way as
 * the Tugas editor's "Susun dengan AI". Persisted in `toolResult` (not
 * `toolArgs`) so it fits the JSON column limit, and read back on confirm.
 */
export type PreparedAssignment = {
	title: string;
	instructions: string;
	requirements: string;
	groupInfo: string;
	stages: AssignmentStage[];
	deadline: string;
	sessionId: string;
	subCpmkId: string;
	taskConfig: Record<string, unknown> | null;
	answerKey: unknown;
	sessionLabel: string;
	subCpmkLabel: string;
	detail: string;
};

/**
 * A prepared mass-linkage plan for `link_session_outcomes`: distributes the
 * course's imported Sub-CPMK (and their parent CPMK/CPL) across the stored
 * weekly meetings. Persisted in `toolResult.draft` and re-verified on confirm.
 * Only the `subCpmks`/`cpmks`/`cpls` relation arrays on `class_sessions` are
 * ever modified — no other academic record is touched.
 */
export type PreparedLinkPlan = {
	courseId: string;
	courseLabel: string;
	sessionCount: number;
	outcomeCount: number;
	links: Array<{
		sessionId: string;
		week: number;
		title: string;
		subCpmks: string[];
		subCpmkCodes: string[];
		cpmks: string[];
		cpls: string[];
	}>;
};

/** Read-only tools execute immediately; their result is fed back to the model. */
export const READ_TOOLS = new Set([
	'list_courses',
	'list_assignments',
	'course_detail',
	'summarize_insights',
	'import_rps_pdf',
	'search_history',
]);

/** Write tools surface a confirmation card; nothing is written until confirmed. */
export const WRITE_TOOLS = new Set(['create_course', 'create_assignment', 'link_session_outcomes', 'add_roster_students']);

/**
 * Tools that require explicit lecturer confirmation before any protected
 * record is created, modified, or destroyed. Derived from the permission
 * classification: `write` and `destructive` both require confirmation.
 */
export const CONFIRMATION_REQUIRED_TOOLS = new Set([
	'create_course',
	'create_assignment',
	'link_session_outcomes',
	'add_roster_students',
]);

/**
 * A prepared roster-transfer plan for `add_roster_students`: copies students
 * (optionally filtered by a source section/kelas) from one owned mata kuliah
 * into another, skipping NIMs already present in the destination. Persisted in
 * `toolResult.draft` and re-verified on confirm. Only `course_roster` rows are
 * ever created in the destination — no existing destination record is modified
 * or deleted, and no other academic record is touched.
 */
export type PreparedRosterTransfer = {
	sourceCourseId: string;
	sourceCourseLabel: string;
	destinationCourseId: string;
	destinationCourseLabel: string;
	/** Source section/kelas name used to filter, or '' for the whole roster. */
	section: string;
	/** Students to add (NIMs already present in the destination excluded). */
	additions: Array<{ nim: string; name: string }>;
};

/**
 * A privacy-minimized audit record for a single tool execution or confirmation.
 * Persisted in `assistant_tool_audits`. Never carries secrets, auth tokens,
 * prepared drafts, document text, or student data — only small identifying
 * arguments and result metadata.
 */
export interface AssistantToolAudit {
	tool: string;
	args: Record<string, unknown> | null;
	status: 'success' | 'failed' | 'denied' | 'pending' | 'confirmed' | 'rejected';
	resultMeta: { ok: boolean; source?: { type: string; id?: string }; errorCode?: string; link?: string } | null;
	durationMs: number;
	confirmationState: 'none' | 'pending' | 'confirmed' | 'rejected';
}
