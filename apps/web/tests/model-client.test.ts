import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Provider resolution and transport dispatch.
 *
 * These tests cover the two things a caller relies on: `resolveModel` returns a
 * target that describes the right transport, and `collectModel` sends the
 * request to exactly that transport without leaking a Codex grant into a place
 * that expects an API key.
 */

const db = vi.hoisted(() => ({ providers: new Map<string, Record<string, unknown>>(), secrets: new Map<string, Record<string, unknown>>(), prefs: [] as Record<string, unknown>[] }));

vi.mock('@/lib/logger.server', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		listRecords: vi.fn(async (collection: string, query: Record<string, unknown> = {}) => {
			const filter = typeof query.filter === 'string' ? query.filter : '';
			if (collection === 'ai_provider_secrets') {
				const provider = /provider="([^"]+)"/.exec(filter)?.[1];
				const row = provider ? db.secrets.get(provider) : undefined;
				const rows = row ? [row] : [];
				return { items: rows, totalItems: rows.length, page: 1, perPage: 30, totalPages: 1 };
			}
			const rows = [...db.providers.values()].filter((row) => {
				if (collection !== 'ai_providers') return false;
				const owner = /owner="([^"]+)"/.exec(filter)?.[1];
				if (owner && row.owner !== owner) return false;
				if (filter.includes('isDefault=true') && row.isDefault !== true) return false;
				return true;
			});
			return { items: rows, totalItems: rows.length, page: 1, perPage: 30, totalPages: 1 };
		}),
		getRecord: vi.fn(async (collection: string, id: string) => {
			if (collection === 'ai_providers') {
				const row = db.providers.get(id);
				if (!row) throw new Error('404');
				return structuredClone(row);
			}
			throw new Error(`unexpected ${collection}`);
		}),
	},
}));

vi.mock('@/lib/ai/secrets.server', () => ({
	encryptSecret: (value: string) => `enc:${value}`,
	decryptSecret: (value: string) => String(value).replace(/^enc:/, ''),
	maskSecret: (last4: string) => (last4 ? `••••${last4}` : ''),
	secretLast4: (value: string) => value.slice(-4),
}));

const transports = vi.hoisted(() => ({ chat: vi.fn(), codex: vi.fn() }));

vi.mock('@/lib/ai/openai-compatible.server', () => ({ collectChatCompletion: transports.chat }));
vi.mock('@/lib/ai/codex-responses.server', () => ({ collectCodexResponse: transports.codex }));

beforeEach(() => {
	vi.clearAllMocks();
	db.providers.clear();
	db.secrets.clear();
	transports.chat.mockResolvedValue({ content: 'chat answer', model: 'chat-model', provider: 'p1' });
	transports.codex.mockResolvedValue({ content: 'codex answer', model: 'codex-model', providerId: 'p2', providerLabel: 'Akun Codex' });
});

const codexProvider = () => ({
	id: 'p2',
	owner: 'user1',
	label: 'Akun Codex',
	kind: 'codex_oauth',
	baseUrl: 'https://chatgpt.com/backend-api',
	models: ['gpt-x'],
	capabilities: {},
	enabled: true,
	isDefault: true,
});

const compatibleProvider = () => ({
	id: 'p1',
	owner: 'user1',
	label: 'Router kampus',
	kind: 'openai_compatible',
	baseUrl: 'https://router.example.test/v1',
	models: ['m1'],
	capabilities: {},
	enabled: true,
	isDefault: true,
});

describe('resolveModel', () => {
	it('resolves a Codex provider without loading any secret', async () => {
		db.providers.set('p2', codexProvider());
		const { resolveModel } = await import('@/lib/ai/providers.server');
		const resolved = await resolveModel('user1', 'practice');
		expect(resolved.kind).toBe('codex_oauth');
		expect(resolved).toMatchObject({ providerId: 'p2', model: 'gpt-x', source: 'default' });
		// A Codex target must never carry an apiKey field.
		expect(resolved).not.toHaveProperty('apiKey');
	});

	it('resolves an API-key provider with its decrypted key', async () => {
		db.providers.set('p1', compatibleProvider());
		db.secrets.set('p1', { id: 's1', provider: 'p1', ciphertext: 'enc:secret-key-value' });
		const { resolveModel } = await import('@/lib/ai/providers.server');
		const resolved = await resolveModel('user1', 'practice');
		expect(resolved.kind).toBe('openai_compatible');
		expect((resolved as { apiKey?: string }).apiKey).toBe('secret-key-value');
	});

	it('refuses a Codex provider for a surface that needs tool calls', async () => {
		db.providers.set('p2', codexProvider());
		const { resolveModel } = await import('@/lib/ai/providers.server');
		await expect(resolveModel('user1', 'assistant')).rejects.toThrow(/tidak mendukung: tools/);
	});

	it('accepts a Codex provider for the evaluation surface', async () => {
		db.providers.set('p2', codexProvider());
		const { resolveModel } = await import('@/lib/ai/providers.server');
		const resolved = await resolveModel('user1', 'evaluation');
		expect(resolved.capabilities).toMatchObject({ vision: true, json: true, tools: false });
	});
});

describe('collectModel dispatch', () => {
	it('routes a Codex target to the Responses adapter', async () => {
		db.providers.set('p2', codexProvider());
		const { resolveModel } = await import('@/lib/ai/providers.server');
		const { collectModel } = await import('@/lib/ai/model-client.server');
		const resolved = await resolveModel('user1', 'practice');

		const result = await collectModel(resolved, { prompt: 'Halo', systemPrompt: 'S' });
		expect(transports.codex).toHaveBeenCalledOnce();
		expect(transports.chat).not.toHaveBeenCalled();
		expect(transports.codex.mock.calls[0]![0]).toMatchObject({
			providerId: 'p2',
			baseUrl: 'https://chatgpt.com/backend-api',
			model: 'gpt-x',
		});
		expect(result).toMatchObject({ content: 'codex answer', providerId: 'p2', providerLabel: 'Akun Codex' });
	});

	it('routes an API-key target to Chat Completions', async () => {
		db.providers.set('p1', compatibleProvider());
		db.secrets.set('p1', { id: 's1', provider: 'p1', ciphertext: 'enc:secret-key-value' });
		const { resolveModel } = await import('@/lib/ai/providers.server');
		const { collectModel } = await import('@/lib/ai/model-client.server');
		const resolved = await resolveModel('user1', 'practice');

		const result = await collectModel(resolved, { prompt: 'Halo' });
		expect(transports.chat).toHaveBeenCalledOnce();
		expect(transports.codex).not.toHaveBeenCalled();
		expect(result).toMatchObject({ content: 'chat answer', providerId: 'p1', providerLabel: 'Router kampus' });
	});

	it('passes tool calls back from the Chat Completions transport', async () => {
		transports.chat.mockResolvedValueOnce({
			content: '',
			model: 'chat-model',
			provider: 'p1',
			toolCalls: [{ id: 't1', name: 'lookup', arguments: {} }],
		});
		const { collectModel } = await import('@/lib/ai/model-client.server');
		const result = await collectModel(
			{
				kind: 'openai_compatible',
				providerId: 'p1',
				providerLabel: 'Router kampus',
				baseUrl: 'https://router.example.test/v1',
				apiKey: 'k',
				model: 'm1',
				source: 'default',
				capabilities: { tools: true, vision: true, json: true, streaming: true },
				configVersion: 'v',
			},
			{ messages: [], tools: [] },
		);
		expect(result.toolCalls).toEqual([{ id: 't1', name: 'lookup', arguments: {} }]);
	});

	it('refuses to run a tool request against a Codex target instead of dropping the tools', async () => {
		const { collectModel } = await import('@/lib/ai/model-client.server');
		await expect(
			collectModel(
				{
					kind: 'codex_oauth',
					providerId: 'p2',
					providerLabel: 'Akun Codex',
					baseUrl: 'https://chatgpt.com/backend-api',
					model: 'gpt-x',
					source: 'default',
					capabilities: { tools: false, vision: true, json: true, streaming: true },
					configVersion: 'v',
				},
				{ prompt: 'x', tools: [{ type: 'function', function: { name: 'n', description: 'd', parameters: {} } }] },
			),
		).rejects.toThrow(/tidak mendukung pemanggilan tool/i);
		expect(transports.codex).not.toHaveBeenCalled();
	});

	it('refuses a pre-built message list against a Codex target', async () => {
		const { collectModel } = await import('@/lib/ai/model-client.server');
		await expect(
			collectModel(
				{
					kind: 'codex_oauth',
					providerId: 'p2',
					providerLabel: 'Akun Codex',
					baseUrl: 'https://chatgpt.com/backend-api',
					model: 'gpt-x',
					source: 'default',
					capabilities: { tools: false, vision: true, json: true, streaming: true },
					configVersion: 'v',
				},
				{ messages: [{ role: 'user', content: 'hi' }] },
			),
		).rejects.toThrow(/permintaan teks tunggal/i);
	});
});
