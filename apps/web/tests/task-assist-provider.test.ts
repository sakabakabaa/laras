import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Task assistance provider forwarding.
 *
 * The contract this file pins changed with the Codex provider work: a resolved
 * provider is no longer handed to the legacy Hostinger client, because that
 * client only understands an API key. A resolved provider now goes through the
 * dispatcher, which picks the right transport; the legacy path remains only for
 * callers that pass no provider at all (the formal evaluation pipeline).
 */

vi.mock('@/lib/hostinger-model.server', () => ({ collectHostingerText: vi.fn() }));
vi.mock('@/lib/ai/openai-compatible.server', () => ({ collectChatCompletion: vi.fn() }));
vi.mock('@/lib/ai/codex-responses.server', () => ({ collectCodexResponse: vi.fn() }));

import { collectHostingerText } from '@/lib/hostinger-model.server';
import { collectChatCompletion } from '@/lib/ai/openai-compatible.server';
import { collectCodexResponse } from '@/lib/ai/codex-responses.server';
import { collectModel } from '@/lib/task-assist.server';

const capabilities = { tools: true, vision: true, json: true, streaming: true };

beforeEach(() => {
	vi.mocked(collectHostingerText).mockReset().mockResolvedValue({ content: ' Guidance ', model: 'test-model', provider: 'hostinger' });
	vi.mocked(collectChatCompletion).mockReset().mockResolvedValue({ content: ' Guidance ', model: 'chat-model', provider: 'p1' });
	vi.mocked(collectCodexResponse).mockReset().mockResolvedValue({
		content: ' Guidance ',
		model: 'codex-model',
		providerId: 'p2',
		providerLabel: 'Akun Codex',
	});
});

describe('task assistance provider forwarding', () => {
	it('sends a lecturer API-key provider through the dispatcher, not the legacy client', async () => {
		const resolved = {
			kind: 'openai_compatible' as const,
			providerId: 'p1',
			providerLabel: 'Router kampus',
			baseUrl: 'https://example.invalid/v1',
			apiKey: 'test-only',
			model: 'lecturer-model',
			source: 'default' as const,
			capabilities,
			configVersion: 'v1',
		};
		expect(await collectModel('prompt', [], 'practice instructions', resolved)).toBe('Guidance');
		expect(collectChatCompletion).toHaveBeenCalledWith(
			expect.objectContaining({ providerId: 'p1', model: 'lecturer-model' }),
			expect.objectContaining({ prompt: 'prompt', systemPrompt: 'practice instructions' }),
		);
		expect(collectHostingerText).not.toHaveBeenCalled();
	});

	it('sends a Codex provider through the Responses transport', async () => {
		const resolved = {
			kind: 'codex_oauth' as const,
			providerId: 'p2',
			providerLabel: 'Akun Codex',
			baseUrl: 'https://chatgpt.com/backend-api/codex',
			model: 'gpt-x',
			source: 'default' as const,
			capabilities: { ...capabilities, tools: false },
			configVersion: 'v2',
		};
		expect(await collectModel('prompt', [], 'practice instructions', resolved)).toBe('Guidance');
		expect(collectCodexResponse).toHaveBeenCalledWith(
			expect.objectContaining({ providerId: 'p2', baseUrl: 'https://chatgpt.com/backend-api/codex' }),
			expect.objectContaining({ prompt: 'prompt', systemPrompt: 'practice instructions' }),
		);
		expect(collectHostingerText).not.toHaveBeenCalled();
	});

	it('retains the deployment fallback for callers that pass no provider', async () => {
		expect(await collectModel('prompt', [])).toBe('Guidance');
		expect(collectHostingerText).toHaveBeenCalledTimes(1);
		// The legacy call passes no `resolved` at all, so the client falls back
		// to the deployment environment itself.
		const legacyArgs = vi.mocked(collectHostingerText).mock.calls[0]![0] as Record<string, unknown>;
		expect('resolved' in legacyArgs).toBe(false);
		expect(collectChatCompletion).not.toHaveBeenCalled();
	});
});
