/**
 * POST /api/student-assistant — Phase 2 Student Learning Assistant.
 *
 * A tutor-first AI assistant for enrolled students, gated by the Phase 1 AI
 * assistance policy. Actions:
 *   - `load`: resolve context + return the chat history and a context summary
 *     (policy level, submission state, available modes).
 *   - `send`: authorize the mode's capability, build the grounded prompt, call
 *     the model, persist the turn, return the assistant message.
 *   - `clear`: reset the conversation.
 *
 * Only student-authorized data reaches the model. The model is never called
 * when a capability is prohibited or the submission state forbids it — a
 * helpful redirect message is returned instead.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { resolveAssignmentPolicy } from '@/lib/ai-policy';
import {
	commitUsage,
	deriveIdempotencyKey,
	enforceAiAccess,
	toAiRole,
} from '@/lib/ai-usage.server';
import { capabilityWeight } from '@/lib/ai-rate-limits';
import {
	authenticateUser,
	appendMessages,
	buildAssistantTurn,
	clearChat,
	loadAssistantContext,
	loadChat,
	MODE_CAPABILITY,
	MODE_KIND,
	MODE_LABEL,
	modeAvailability,
	submissionStateOf,
	SUBMISSION_STATE_LABEL,
	type AssistantMode,
	type AssistantMessage,
} from '@/lib/student-assistant.server';
import { activityTypeOf } from '@/lib/assignments';
import {
	buildStudentPageContext,
	invokeStudentTool,
	STUDENT_TOOL_NAMES,
	STUDENT_TOOL_REGISTRY,
	toolStateAvailability,
} from '@/lib/student-assistant-tools.server';

type Body = {
	action?: string;
	assignmentId?: string;
	courseId?: string;
	mode?: string;
	message?: string;
	tool?: string;
	params?: Record<string, unknown>;
};

const isMode = (value: string): value is AssistantMode =>
	Object.prototype.hasOwnProperty.call(MODE_CAPABILITY, value);

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { pb, user } = auth;

	const body = await readJsonBody<Body>(request);
	const action = (body.action || '').trim();
	const assignmentId = (body.assignmentId || '').trim();
	const courseId = (body.courseId || '').trim();

	if (!assignmentId) return apiError(422, 'assignmentId wajib diisi.');

	if (action === 'load') {
		const ctxResult = await loadAssistantContext({ pb, user, assignmentId });
		if (!ctxResult.ok) return apiError(ctxResult.status, ctxResult.message);
		const ctx = ctxResult.context;
		const chat = await loadChat(pb, user, assignmentId, ctx.courseId);
		const policy = resolveAssignmentPolicy(ctx.assignment);
		const formative = activityTypeOf(ctx.assignment) === 'formative';
		const state = submissionStateOf(ctx.submission);
		const modes = (Object.keys(MODE_LABEL) as AssistantMode[]).map((mode) => {
			const availability = modeAvailability(mode, state, formative);
			const capability = MODE_CAPABILITY[mode];
			const allowed = availability.available && policy.enabled && policy.allowedCapabilities.includes(capability);
			return {
				mode,
				label: MODE_LABEL[mode],
				kind: MODE_KIND[mode],
				available: Boolean(allowed),
				reason: availability.reason,
			};
		});
		return json({
			chatId: chat.id,
			messages: chat.messages || [],
			hintLevel: chat.hintLevel || 1,
			context: {
				state,
				stateLabel: SUBMISSION_STATE_LABEL[state],
				formative,
				policyLabel: `${policy.assistanceLevel}`,
				policyEnabled: policy.enabled,
				materialsResult: ctx.materialsResult,
				materialsReason: ctx.materialsReason,
				hasDraft: !ctx.studentDraft.startsWith('(Belum ada draf'),
			},
			// Phase 4 — controlled page context + available tools for the model.
			pageContext: buildStudentPageContext(ctx, policy),
			tools: STUDENT_TOOL_NAMES.map((name) => {
				const def = STUDENT_TOOL_REGISTRY.get(name)!;
				const availability = toolStateAvailability(name, state, formative);
				const allowed =
					availability.available &&
					policy.enabled &&
					policy.allowedCapabilities.includes(def.capability);
				return { name, description: def.description, available: Boolean(allowed) };
			}),
			modes,
		});
	}

	if (action === 'clear') {
		const filter = pb.filter('assignment = {:a} && owner = {:o}', { a: assignmentId, o: user.id });
		const rows = await pb.collection('student_assistant_chats').getList<{ id: string }>(1, 1, {
			filter,
		});
		if (rows.items[0]) await clearChat(pb, rows.items[0].id);
		return json({ ok: true });
	}

	if (action === 'send') {
		const mode = (body.mode || 'chat').trim();
		if (!isMode(mode)) return apiError(422, 'Mode bantuan tidak dikenali.');
		const message = (body.message || '').trim();
		if (!message) return apiError(422, 'Pesan tidak boleh kosong.');

		// Rate limit + usage budget + concurrency + idempotency, BEFORE any
		// expensive context loading or model call. User-based (not IP-based):
		// many students share one university network.
		const capability = MODE_CAPABILITY[mode];
		const access = await enforceAiAccess({
			userId: user.id,
			role: toAiRole(user.role),
			capability,
			assignmentId,
			idempotencyKey: deriveIdempotencyKey(user.id, message),
			inputChars: message.length,
		});
		if (!access.ok) return apiError(access.status, access.message);
		try {
			const ctxResult = await loadAssistantContext({ pb, user, assignmentId });
		if (!ctxResult.ok) return apiError(ctxResult.status, ctxResult.message);
		const ctx = ctxResult.context;
		const policy = resolveAssignmentPolicy(ctx.assignment);
		if (!policy.enabled) {
			return apiError(422, 'Bantuan AI tidak diaktifkan untuk tugas ini.');
		}

		const chat = await loadChat(pb, user, assignmentId, ctx.courseId);
		const history = (chat.messages || []) as AssistantMessage[];

		const result = await buildAssistantTurn({
			ctx,
			policy,
			mode,
			message,
			history,
			currentHintLevel: chat.hintLevel || 1,
		});

		const now = new Date().toISOString();
		const userMessage: AssistantMessage = {
			role: 'user',
			content: message,
			mode,
			kind: MODE_KIND[mode],
			createdAt: now,
		};
		const assistantMessage: AssistantMessage = {
			role: 'assistant',
			content: result.text,
			mode: result.mode,
			level: result.level || undefined,
			kind: result.kind,
			createdAt: now,
		};
			await appendMessages(pb, chat.id, userMessage, assistantMessage, result.nextHintLevel);

			// Commit usage only when the model actually ran (not on a policy
			// redirect or a provider failure).
			if (result.modelCalled) {
				void commitUsage({
					userId: user.id,
					role: toAiRole(user.role),
					capability,
					assignmentId,
					weight: capabilityWeight(capability),
				});
			}

			return json({
				ok: true,
				message: assistantMessage,
				hintLevel: result.nextHintLevel,
			});
		} finally {
			access.release();
		}
	}

	if (action === 'invoke_tool') {
		const tool = (body.tool || '').trim();
		const params = body.params && typeof body.params === 'object' ? body.params : {};
		if (!tool) return apiError(422, 'tool wajib diisi.');
		// Model-backed tools consume the per-student budget (same as `send`).
		const isModelTool = tool === 'analyze_my_draft' || tool === 'explain_assignment_requirement' || tool === 'generate_practice_activity';
		if (isModelTool) {
			const def = STUDENT_TOOL_REGISTRY.get(tool);
			const capability = def?.capability || 'give_hint';
			const access = await enforceAiAccess({
				userId: user.id,
				role: toAiRole(user.role),
				capability,
				assignmentId,
				idempotencyKey: deriveIdempotencyKey(user.id, `${tool}:${JSON.stringify(params)}`),
			});
			if (!access.ok) return apiError(access.status, access.message);
			try {
				const outcome = await invokeStudentTool({ pb, user, assignmentId, tool, params });
				if (!outcome.ok) return apiError(outcome.status, outcome.message);
				if (outcome.result.ok) {
					void commitUsage({
						userId: user.id,
						role: toAiRole(user.role),
						capability,
						assignmentId,
						weight: capabilityWeight(capability),
					});
				}
				return json({ ok: true, tool, result: outcome.result, audited: outcome.audited });
			} finally {
				access.release();
			}
		}
		const outcome = await invokeStudentTool({ pb, user, assignmentId, tool, params });
		if (!outcome.ok) return apiError(outcome.status, outcome.message);
		return json({ ok: true, tool, result: outcome.result, audited: outcome.audited });
	}

	return apiError(422, 'Aksi tidak dikenali.');
});
