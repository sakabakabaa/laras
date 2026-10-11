export type HostingerTool = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type HostingerToolCall = { id?: string; name: string; arguments: Record<string, unknown> };
export type HostingerResult = { content: string; model: string; provider: 'hostinger'; toolCalls?: HostingerToolCall[] };

export type HostingerMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
	tool_call_id?: string;
	tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
};

const MODEL = 'gpt-6-luna';
const apiUrl = () => `${(process.env.HROUTER_BASE_URL || 'https://router.hostinger.com/v1').replace(/\/+$/, '')}/chat/completions`;

/**
 * Keep tool parameters within standard JSON Schema for the OpenAI-compatible router.
 * Some locally-authored schemas mark individual properties with
 * `required: true`; JSON Schema expresses required fields as a string array
 * on the containing object instead. The registry already has those arrays,
 * so discard only the invalid boolean annotations when sending tools upstream.
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

/** Call Hostinger AI Router's OpenAI-compatible Chat Completions API, collecting SSE or JSON output. */
export async function collectHostingerText({
	prompt,
	model: requestedModel,
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
	messages?: HostingerMessage[];
	tools?: HostingerTool[];
	responseFormat?: {type:'json_object'};
	timeoutMs?: number;
}): Promise<HostingerResult> {
	const apiKey = process.env.HROUTER_API_KEY;
	if (!apiKey) throw new Error('HROUTER_API_KEY is not set');
	const model = requestedModel || process.env.HROUTER_MODEL || MODEL;
	const requestMessages = messages || [
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
	];
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(apiUrl(), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
			},
			body: JSON.stringify({
				model,
				messages: requestMessages,
				stream: !tools,
				...(responseFormat ? {response_format:responseFormat} : {}),
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
			throw new Error(`Hostinger AI Router request failed (HTTP ${response.status})`);
		}

		const contentType = response.headers.get('content-type') || '';
		if (contentType.includes('application/json')) {
			const result = await response.json() as {
				model?: string;
				choices?: Array<{ message?: { content?: string | Array<{ text?: string }>; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>;
			};
			const value = result.choices?.[0]?.message?.content;
			const content = typeof value === 'string' ? value : value?.map((part) => part.text || '').join('') || '';
			const toolCalls = result.choices?.[0]?.message?.tool_calls?.flatMap((call) => {
				try {
					const name = call.function?.name;
					const args = JSON.parse(call.function?.arguments || '{}');
						return name && args && typeof args === 'object' && !Array.isArray(args) ? [{ id: call.id, name, arguments: args as Record<string, unknown> }] : [];
				} catch { return []; }
			}) || [];
			if (!content && !toolCalls.length) throw new Error('Hostinger AI Router returned an empty completion');
			return { content, model: result.model || model, provider: 'hostinger', ...(toolCalls.length ? { toolCalls } : {}) };
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let content = '';
		let actualModel = model;
		const consume = (line: string) => {
			if (!line.startsWith('data:')) return;
			const payload = line.slice(5).trim();
			if (!payload || payload === '[DONE]') return;
			const event = JSON.parse(payload) as {
				model?: string;
				choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
				error?: { message?: string };
			};
			if (event.error) throw new Error(`Hostinger AI Router stream error: ${event.error.message || 'unknown error'}`);
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
		if (!content) throw new Error('Hostinger AI Router returned an empty completion');
		return { content, model: actualModel, provider: 'hostinger' };
	} finally {
		clearTimeout(timeout);
	}
}
