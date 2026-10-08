/**
 * Assistant runtime — model invocation.
 *
 * Calls the platform model endpoint and returns the full streamed text. The
 * model API key and proxy entrance id are read per request from the
 * environment and never logged. A 60s abort guards against a hung stream.
 */
import { collectBynaraText, type BynaraTool } from '@/lib/bynara-model.server';
import { TOOL_REGISTRY } from './tools.server';
import { logModelRequest, logModelResult } from './logging.server';
import type { AssistantSession } from './types';

/** Calls the platform model and returns the full streamed text. */
export const collectModel = async (
	session: AssistantSession,
	history: { role: string; content: string; images?: string[] }[],
	systemPrompt: string,
	turn: 'primary' | 'summary' = 'primary',
): Promise<string> => {
	logModelRequest(session, turn);
	const started = Date.now();
	try {
		const messages = [
			{ role: 'system' as const, content: systemPrompt },
			...history.map((message) => ({
				role: (message.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
				content: message.images?.length
					? [
							{ type: 'text' as const, text: message.content },
							...message.images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
						]
					: message.content,
			})),
		];
		const tools: BynaraTool[] = [...TOOL_REGISTRY.values()].map((tool) => ({
			type: 'function',
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.inputSchema as unknown as Record<string, unknown>,
			},
		}));
		const { content, toolCalls } = await collectBynaraText({ messages, tools });
		const toolProtocol = toolCalls?.map((call) => `[[TOOL_CALL]]${JSON.stringify({ name: call.name, args: call.arguments })}[[/TOOL_CALL]]`).join('\n') || '';
		const output = [content, toolProtocol].filter(Boolean).join('\n');
		logModelResult(session, true, Date.now() - started);
		return output;
	} catch (error) {
		logModelResult(session, false, Date.now() - started);
		throw error;
	}
};
