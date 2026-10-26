import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/hostinger-model.server', () => ({collectHostingerText: vi.fn()}));
import { collectHostingerText } from '@/lib/hostinger-model.server';
import { collectModel } from '@/lib/task-assist.server';

beforeEach(() => {vi.mocked(collectHostingerText).mockReset().mockResolvedValue({content: ' Guidance ', model: 'test-model', provider: 'hostinger'});});
describe('task assistance provider forwarding', () => {
  it('preserves the lecturer provider resolved for student practice', async () => {
    const resolved = {baseUrl: 'https://example.invalid/v1', apiKey: 'test-only', model: 'lecturer-model'};
    expect(await collectModel('prompt', [], 'practice instructions', resolved)).toBe('Guidance');
    expect(collectHostingerText).toHaveBeenCalledWith(expect.objectContaining({resolved, systemPrompt: 'practice instructions'}));
  });
  it('retains the deployment fallback for existing callers', async () => {
    expect(await collectModel('prompt', [])).toBe('Guidance');
    expect(collectHostingerText).toHaveBeenCalledWith(expect.objectContaining({resolved: undefined}));
  });
});
