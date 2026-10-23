/**
 * Generic [OI]-compatible Chat Completions client.
 *
 * This is the single place that speaks HTTP to a model provider. Every surface
 * (assistant, evaluation, lesson plans, practice, RPS import) goes through it
 * with a resolved provider config, so adding a provider never means touching a
 * call site.
 *
 * Behaviour preserved from the previous Hostinger-only client: SSE or JSON
 * responses, tool-call parsing, a 60s abort, and JSON-Schema normalisation for
 * routers that reject boolean `required` annotations.
 */

export type ChatTool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ChatToolCall = { id?: string; name: string; arguments: Record<string, unknown> };

export type ChatMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
	tool_call_id?: string;
	tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
};

export type ProviderConfig = {
	providerId: string;
	providerLabel: string;
	baseUrl: string;
	apiKey: string;
	model: string;
};

export type ChatResult = {
	content: string;
	model: string;
	provider: string;
	toolCalls?: ChatToolCall[];
};

const chatUrl = (baseUrl: string): string => `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

/**
 * Some locally-authored schemas mark properties with `required: true`; JSON
 * Schema wants a string array on the containing object. Drop only the invalid
 * boolean annotations — the registry already carries the arrays.
 */
const normalizeToolParameters = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(normalizeToolParameters);
	if (!value || typeof value !== 'object') return value;
	const normalized: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (key === 'required' && !Array.isArray(entry)) continue;
		normalized[key] = normalizeToolParameters(entry);
	}
	return normalized;
};

export async function collectChatCompletion(
	config: ProviderConfig,
	{
		prompt,
		model,
		systemPrompt,
		images = [],
		messages,
		tools,
		responseFormat,
		timeoutMs = 60_000,
	}: {
		prompt?: string;
		model?: string;
		systemPrompt?: string;
		images?: string[];
		messages?: ChatMessage[];
		tools?: ChatTool[];
		responseFormat?: { type: 'json_object' };
		timeoutMs?: number;
	},
): Promise<ChatResult> {
	if (!config.apiKey) throw new Error(`Provider "${config.providerLabel}" has no API key`);
	const selectedModel = model || config.model;
	const requestMessages =
		messages ||
		([
			...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
			{
				role: 'user' as const,
				content: images.length
					? [
							{ type: 'text' as const, text: prompt || '' },
							...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
						]
					: prompt || '',
			},
		] as ChatMessage[]);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(chatUrl(config.baseUrl), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
			},
			body: JSON.stringify({
				model: selectedModel,
				messages: requestMessages,
				stream: !tools,
				...(responseFormat ? { response_format: responseFormat } : {}),
				...(tools?.length
					? {
							tools: tools.map((tool) => ({
								type: tool.type,
								function: {
									...tool.function,
									parameters: normalizeToolParameters(tool.function.parameters) as Record<string, unknown>,
								},
							})),
							tool_choice: 'auto',
						}
					: {}),
			}),
			signal: controller.signal,
		});
		if (!response.ok || !response.body) {
			await response.text().catch(() => '');
			throw new Error(`${config.providerLabel} request failed (HTTP ${response.status})`);
		}

		const contentType = response.headers.get('content-type') || '';
		if (contentType.includes('application/json')) {
			const result = (await response.json()) as {
				model?: string;
				choices?: Array<{
					message?: {
						content?: string | Array<{ text?: string }>;
						tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
					};
				}>;
			};
			const value = result.choices?.[0]?.message?.content;
			const content = typeof value === 'string' ? value : value?.map((part) => part.text || '').join('') || '';
			const toolCalls =
				result.choices?.[0]?.message?.tool_calls?.flatMap((call) => {
					try {
						const name = call.function?.name;
						const args = JSON.parse(call.function?.arguments || '{}');
						return name && args && typeof args === 'object' && !Array.isArray(args)
							? [{ id: call.id, name, arguments: args as Record<string, unknown> }]
							: [];
					} catch {
						return [];
					}
				}) || [];
			if (!content && !toolCalls.length) throw new Error(`${config.providerLabel} returned an empty completion`);
			return { content, model: result.model || selectedModel, provider: config.providerId, ...(toolCalls.length ? { toolCalls } : {}) };
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let content = '';
		let actualModel = selectedModel;
		const consume = (line: string) => {
			if (!line.startsWith('data:')) return;
			const payload = line.slice(5).trim();
			if (!payload || payload === '[DONE]') return;
			const event = JSON.parse(payload) as {
				model?: string;
				choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
				error?: { message?: string };
			};
			if (event.error) throw new Error(`${config.providerLabel} stream error: ${event.error.message || 'unknown error'}`);
			if (event.model) actualModel = event.model;
			content += event.choices?.[0]?.delta?.content || '';
		};
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';
			for (const line of lines) consume(line.trimEnd());
		}
		buffer += decoder.decode();
		if (buffer.trim()) consume(buffer.trim());
		if (!content) throw new Error(`${config.providerLabel} returned an empty completion`);
		return { content, model: actualModel, provider: config.providerId };
	} finally {
		clearTimeout(timeout);
	}
}
