import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Codex Responses adapter.
 *
 * The point of these tests is the wire contract: which URL, which headers, which
 * body, and how an SSE stream is turned into text. If the backend changes, these
 * are the assertions that should fail first.
 */

const credentials = vi.hoisted(() => ({ codexCredentialsFor: vi.fn() }));

vi.mock('@/lib/ai/codex-oauth.server', () => ({
	codexCredentialsFor: credentials.codexCredentialsFor,
	CODEX_ACCOUNT_HEADER: 'chatgpt-account-id',
	CODEX_ORIGINATOR: 'codex_cli_rs',
}));

const sse = (events: unknown[]): string =>
	events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

type FetchCall = { url: string; init: RequestInit };
const calls: FetchCall[] = [];
let respond: () => Response;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
	calls.push({ url, init });
	return respond();
});

const streamResponse = (body: string) =>
	new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });

beforeEach(() => {
	vi.clearAllMocks();
	calls.length = 0;
	credentials.codexCredentialsFor.mockResolvedValue({ accessToken: 'token-1', accountId: 'acct-1' });
	vi.stubGlobal('fetch', fetchMock);
	respond = () => streamResponse(sse([{ type: 'response.output_text.delta', delta: 'OK' }]));
});

const importModule = async () => import('@/lib/ai/codex-responses.server');

const target = { providerId: 'prov1', providerLabel: 'Akun Codex', baseUrl: 'https://chatgpt.com/backend-api/codex', model: 'gpt-x' };

describe('request shape', () => {
	it('posts to the Codex responses path with the account and originator headers', async () => {
		const mod = await importModule();
		await mod.collectCodexResponse(target, { prompt: 'Halo', systemPrompt: 'Anda asisten.' });

		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe('https://chatgpt.com/backend-api/codex/responses');
		const headers = calls[0]!.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer token-1');
		expect(headers['chatgpt-account-id']).toBe('acct-1');
		expect(headers.originator).toBe('codex_cli_rs');
		expect(headers.Accept).toBe('text/event-stream');
		// The beta header is WebSocket-only in the Codex client; the HTTP POST
		// must not carry it.
		expect(headers).not.toHaveProperty('[OI]-Beta');
	});

	it('sends a Responses body, not a Chat Completions body', async () => {
		const mod = await importModule();
		await mod.collectCodexResponse(target, { prompt: 'Halo', systemPrompt: 'Sistem' });
		const body = JSON.parse(String(calls[0]!.init.body));
		expect(body).toMatchObject({
			model: 'gpt-x',
			store: false,
			stream: true,
		});
		// Codex has no top-level `instructions` field: the system prompt is the
		// first input item, followed by the user turn.
		expect(body).not.toHaveProperty('instructions');
		expect(body.input).toEqual([
			{ type: 'message', role: 'system', content: [{ type: 'input_text', text: 'Sistem' }] },
			{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Halo' }] },
		]);
		// Chat Completions fields must never leak in.
		expect(body).not.toHaveProperty('messages');
	});

	it('omits the system item when no system prompt is given', async () => {
		const mod = await importModule();
		await mod.collectCodexResponse(target, { prompt: 'Halo' });
		const body = JSON.parse(String(calls[0]!.init.body));
		expect(body.input).toHaveLength(1);
		expect(body.input[0].role).toBe('user');
	});

	it('carries images as input_image parts', async () => {
		const mod = await importModule();
		await mod.collectCodexResponse(target, { prompt: 'Lihat', images: ['https://example.test/a.png'] });
		const body = JSON.parse(String(calls[0]!.init.body));
		expect(body.input[0].content).toContainEqual({ type: 'input_image', image_url: 'https://example.test/a.png' });
	});

	it('requests a JSON response format only when asked', async () => {
		const mod = await importModule();
		await mod.collectCodexResponse(target, { prompt: 'A', responseFormat: { type: 'json_object' } });
		expect(JSON.parse(String(calls[0]!.init.body)).text).toEqual({ format: { type: 'json_object' } });

		calls.length = 0;
		await mod.collectCodexResponse(target, { prompt: 'A' });
		expect(JSON.parse(String(calls[0]!.init.body))).not.toHaveProperty('text');
	});
});

describe('stream parsing', () => {
	it('accumulates deltas', async () => {
		const mod = await importModule();
		respond = () =>
			streamResponse(
				sse([
					{ type: 'response.output_text.delta', delta: '{"a":' },
					{ type: 'response.output_text.delta', delta: '1}' },
				]),
			);
		const result = await mod.collectCodexResponse(target, { prompt: 'x' });
		expect(result.content).toBe('{"a":1}');
	});

	it('prefers the completed item over the deltas', async () => {
		const mod = await importModule();
		respond = () =>
			streamResponse(
				sse([
					{ type: 'response.output_text.delta', delta: 'partial' },
					{
						type: 'response.output_item.done',
						item: { type: 'message', content: [{ type: 'output_text', text: 'final answer' }] },
					},
					{
						type: 'response.completed',
						response: {
							model: 'gpt-actual',
							output: [{ type: 'message', content: [{ type: 'output_text', text: 'final answer' }] }],
						},
					},
				]),
			);
		const result = await mod.collectCodexResponse(target, { prompt: 'x' });
		expect(result.content).toBe('final answer');
		// The reported model, not the requested one, is what provenance records.
		expect(result.model).toBe('gpt-actual');
	});

	it('ignores reasoning and other non-message items', async () => {
		const mod = await importModule();
		respond = () =>
			streamResponse(
				sse([
					{ type: 'response.output_item.done', item: { type: 'reasoning', summary: [] } },
					{
						type: 'response.output_item.done',
						item: { type: 'message', content: [{ type: 'output_text', text: 'answer' }] },
					},
				]),
			);
		const result = await mod.collectCodexResponse(target, { prompt: 'x' });
		expect(result.content).toBe('answer');
	});

	it('accepts a plain JSON body for a non-streamed response', async () => {
		const mod = await importModule();
		respond = () =>
			new Response(
				JSON.stringify({
					model: 'gpt-json',
					output: [{ type: 'message', content: [{ type: 'output_text', text: 'json answer' }] }],
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		const result = await mod.collectCodexResponse(target, { prompt: 'x' });
		expect(result.content).toBe('json answer');
		expect(result.model).toBe('gpt-json');
	});
});

describe('failures are explicit', () => {
	it('throws on a failed response event', async () => {
		const mod = await importModule();
		respond = () =>
			streamResponse(
				sse([{ type: 'response.failed', response: { error: { message: 'model overloaded' } } }]),
			);
		await expect(mod.collectCodexResponse(target, { prompt: 'x' })).rejects.toThrow(/model overloaded/);
	});

	it('throws on a stream error event', async () => {
		const mod = await importModule();
		respond = () => streamResponse(sse([{ type: 'error', message: 'bad request' }]));
		await expect(mod.collectCodexResponse(target, { prompt: 'x' })).rejects.toThrow(/bad request/);
	});

	it('turns a 401 into a reconnect instruction, not a raw status', async () => {
		const mod = await importModule();
		respond = () => new Response('unauthorized detail', { status: 401 });
		await expect(mod.collectCodexResponse(target, { prompt: 'x' })).rejects.toThrow(/hubungkan ulang/i);
	});

	it('does not leak the upstream body into the error', async () => {
		const mod = await importModule();
		respond = () => new Response('secret-ish upstream detail', { status: 500 });
		await expect(mod.collectCodexResponse(target, { prompt: 'x' })).rejects.toThrow(/HTTP 500/);
		await expect(mod.collectCodexResponse(target, { prompt: 'x' })).rejects.not.toThrow(/secret-ish/);
	});

	it('throws on an empty completion rather than returning an empty draft', async () => {
		const mod = await importModule();
		respond = () => streamResponse(sse([{ type: 'response.completed', response: { output: [] } }]));
		await expect(mod.collectCodexResponse(target, { prompt: 'x' })).rejects.toThrow(/kosong/i);
	});

	it('propagates a credential failure from the grant layer', async () => {
		const mod = await importModule();
		credentials.codexCredentialsFor.mockRejectedValueOnce(new Error('Sesi akun Codex sudah tidak berlaku.'));
		await expect(mod.collectCodexResponse(target, { prompt: 'x' })).rejects.toThrow(/tidak berlaku/);
		expect(calls).toHaveLength(0);
	});
});
