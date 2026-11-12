/**
 * Model dispatcher — one call site for every transport.
 *
 * Laras has two model transports:
 *
 * - `openai_compatible` — Chat Completions with an API key
 *   ([openai-compatible.server.ts](./openai-compatible.server.ts))
 * - `codex_oauth` — the Responses API over a ChatGPT account grant
 *   ([codex-responses.server.ts](./codex-responses.server.ts))
 *
 * Callers should not know which one served them. `collectModel` takes a
 * resolved provider and the same request shape the Chat Completions client
 * already accepted, branches once, and returns a normalised result. This is the
 * only module that reads `ResolvedModel.kind`.
 */
import { collectChatCompletion, type ChatMessage, type ChatTool, type ChatToolCall } from './openai-compatible.server';
import { collectCodexResponse } from './codex-responses.server';
// The shared target types live in a leaf module so this dispatcher does not
// import the registry that produces them (that would be a cycle).
import type { ResolvedModel } from './target';

export type ModelRequest = {
	prompt?: string;
	model?: string;
	systemPrompt?: string;
	images?: string[];
	messages?: ChatMessage[];
	tools?: ChatTool[];
	responseFormat?: { type: 'json_object' };
	timeoutMs?: number;
};

export type ModelResult = {
	content: string;
	/** The model identifier the provider reported, or the requested one. */
	model: string;
	providerId: string;
	providerLabel: string;
	toolCalls?: ChatToolCall[];
};

/**
 * Runs one completion against whichever transport the provider resolved to.
 *
 * A Codex grant cannot serve a request that needs tool calls or a pre-built
 * message list, because Laras only drives its text/JSON path. That case throws
 * instead of silently dropping the tools: capability resolution should already
 * have refused the `assistant` surface, so reaching this error means a
 * preference was written before that check existed.
 */
export const collectModel = async (target: ResolvedModel, request: ModelRequest): Promise<ModelResult> => {
	if (target.kind === 'codex_oauth') {
		if (request.tools?.length) {
			throw new Error(`"${target.providerLabel}" tidak mendukung pemanggilan tool. Pilih provider lain untuk permukaan ini.`);
		}
		if (request.messages?.length) {
			throw new Error(`"${target.providerLabel}" hanya mendukung permintaan teks tunggal.`);
		}
		const result = await collectCodexResponse(
			{
				providerId: target.providerId,
				providerLabel: target.providerLabel,
				baseUrl: target.baseUrl,
				model: target.model,
			},
			{
				prompt: request.prompt,
				model: request.model,
				systemPrompt: request.systemPrompt,
				images: request.images,
				responseFormat: request.responseFormat,
				timeoutMs: request.timeoutMs,
			},
		);
		return {
			content: result.content,
			model: result.model,
			providerId: target.providerId,
			providerLabel: target.providerLabel,
		};
	}

	const result = await collectChatCompletion(target, request);
	return {
		content: result.content,
		model: result.model,
		providerId: target.providerId,
		providerLabel: target.providerLabel,
		...(result.toolCalls?.length ? { toolCalls: result.toolCalls } : {}),
	};
};
