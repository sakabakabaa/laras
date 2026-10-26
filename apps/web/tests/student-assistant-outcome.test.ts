import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('@/lib/task-assist.server', () => ({ collectModel: vi.fn() }));
import { collectModel } from '@/lib/task-assist.server';
import { buildAssistantTurn, type AssistantContext } from '@/lib/student-assistant.server';
import { resolveAssignmentPolicy } from '@/lib/ai-policy';
import type { Assignment } from '@/lib/assignments';
const assignment = { id: 'task123', shape: 'writing', title: 'Task', activityType: 'formative', status: 'published', instructions: 'Explain this concept.', taskConfig: { sourceText: 'Authored passage for correction.' } } as Assignment;
const ctx: AssistantContext = { assignment, courseId: 'course123', submission: null, state: 'drafting', formative: true, policyLabel: 'Learning support', policyDescription: '', materialContext: '', materialsResult: 'insufficient', materialsReason: '', studentDraft: '(Belum ada draf)', interfaceLanguage: 'de' };
beforeEach(() => vi.resetAllMocks());
describe('assistant response outcomes', () => {
 it('keeps provider outages distinct from policy limits and preserves the hint level', async () => {
  vi.mocked(collectModel).mockRejectedValueOnce(new Error('Provider down'));
  const result = await buildAssistantTurn({ ctx, policy: resolveAssignmentPolicy(assignment), mode: 'give_hint', message: 'Hint please', history: [], currentHintLevel: 2 });
  expect(result).toMatchObject({ outcome: 'unavailable', modelCalled: false, nextHintLevel: 2 });
  expect(result.text).not.toContain('Cek jawaban');
 });
 it('does not mark an ordinary model answer as restricted based on its wording', async () => {
  vi.mocked(collectModel).mockResolvedValueOnce('The source text says this resource is tidak tersedia.');
  const result = await buildAssistantTurn({ ctx, policy: resolveAssignmentPolicy(assignment), mode: 'chat', message: 'Explain the source.', history: [], currentHintLevel: 1 });
  expect(result.outcome).toBe('response');
  const [prompt, , system] = vi.mocked(collectModel).mock.calls[0];
  expect(prompt).toContain('Authored passage for correction.');
  expect(system).toContain('Respond in German');
 });
});
