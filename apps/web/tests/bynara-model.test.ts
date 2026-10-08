import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectBynaraText } from '../src/lib/bynara-model.server';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('collectBynaraText', () => {
	it('posts chat messages with configured model and parses streamed content', async () => {
		vi.stubEnv('BYNARA_API_KEY', 'test-secret');
		vi.stubEnv('BYNARA_MODEL', 'gpt-6-luna');
		const fetchMock = vi.fn().mockResolvedValue(new Response(
			'data: {"choices":[{"delta":{"content":"Hallo"}}]}\n\ndata: {"choices":[{"delta":{"content":" Welt"}}]}\n\ndata: [DONE]\n\n',
			{ status: 200, headers: { 'content-type': 'text/event-stream' } },
		));
		vi.stubGlobal('fetch', fetchMock);

		const result = await collectBynaraText({ prompt: 'Sag Hallo', systemPrompt: 'Deutsch' });
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body));
		expect(url).toBe('https://router.bynara.id/v1/chat/completions');
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-secret');
		expect(body.model).toBe('gpt-6-luna');
		expect(body.messages).toEqual([{ role: 'system', content: 'Deutsch' }, { role: 'user', content: 'Sag Hallo' }]);
		expect(body.stream).toBe(true);
		expect(result.content).toBe('Hallo Welt');
		expect(result.model).toBe('gpt-6-luna');
		expect(result.provider).toBe('bynara');
	});

	it('supports provider tool calls without streaming so structured arguments survive', async () => {
		vi.stubEnv('BYNARA_API_KEY', 'test-secret');
		vi.stubEnv('BYNARA_MODEL', 'gpt-6-luna');
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			model: 'gpt-6-luna',
			choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{\"query\":\"ping\"}' } }] } }],
		}), { status: 200, headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);
		const result = await collectBynaraText({
			messages: [{ role: 'user', content: 'look up ping' }],
			tools: [{ type: 'function', function: { name: 'lookup', description: 'lookup', parameters: { type: 'object', properties: { query: { type: 'string' } } } } }],
		});
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(String(init.body));
		expect(body.stream).toBe(false);
		expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'lookup', arguments: { query: 'ping' } }]);
		expect(result.provider).toBe('bynara');
	});

	it('rejects non-success responses without exposing the API key', async () => {
		vi.stubEnv('BYNARA_API_KEY', 'do-not-leak');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
		await expect(collectBynaraText({ prompt: 'test' })).rejects.toThrow('Bynara request failed (HTTP 401)');
	});
});
