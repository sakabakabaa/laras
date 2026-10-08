import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: null as any, writes: [] as any[], submission: { id: 's1', assignment: 'a1', content: '  Ich bin.\n' + 'x'.repeat(13000), files: [], link: '', status: 'submitted', taskAnswers: {}, created: '2026-01-01', updated: '2026-10-01' }, model: vi.fn() }));
vi.mock('@/lib/logger.server', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/pocketbase-client.server', () => ({ pocketbaseAdmin: {
 getRecord: vi.fn(async (collection: string) => collection === 'courses' ? { code: '' } : collection === 'ai_evaluations' ? structuredClone(state.row) : state.submission),
 listRecords: vi.fn(async () => ({ items: state.row ? [structuredClone(state.row)] : [] })),
 createRecord: vi.fn(async (_: string, payload: any) => { state.row = { id: 'e1', ...structuredClone(payload) }; state.writes.push(structuredClone(payload)); return state.row; }),
 updateRecord: vi.fn(async (_: string, id: string, payload: any) => { state.writes.push(structuredClone(payload)); state.row = { ...state.row, id, ...structuredClone(payload) }; return state.row; }),
} }));
vi.mock('@/lib/task-assist.server', () => ({ collectModelWithProvenance: state.model, imageFilenames: () => [], storedFileUrl: () => '' }));
vi.mock('@/lib/context-retrieval.server', () => ({ cpmkOfSubCpmk: async () => '', retrieveContextBundle: async () => null }));
import { queueEvaluationDraft } from '@/lib/ai-evaluation.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
const assignment = { id: 'a1', owner: 'f1', course: 'c1', title: 'Original task', shape: 'writing', activityType: 'formal', instructions: 'Write German', requirements: 'Text', taskConfig: {} } as any;
const settle = async () => { for (let n = 0; n < 30; n++) await new Promise((resolve) => setTimeout(resolve, 0)); };
beforeEach(() => { state.row = null; state.writes = []; state.model.mockReset(); state.model.mockResolvedValue({ content: '{"findings":[],"summary":"Review","recommendedScore":80}', model: 'gpt-6-luna', modelVersion: 'unknown', durationMs: 3 }); });
describe('generation-time persistence', () => {
 it('refuses provider invocation when snapshot read-back is missing', async () => {
  vi.mocked(pocketbaseAdmin.getRecord).mockImplementationOnce(async () => state.submission as any)
   .mockImplementationOnce(async () => state.submission as any)
   .mockImplementationOnce(async () => ({ code: '' }) as any)
   .mockImplementationOnce(async () => ({ id: 'e1', researchSnapshot: null }) as any);
  await queueEvaluationDraft({ assignment, submissionId: 's1' });
  await settle();
  expect(state.model).not.toHaveBeenCalled();
  expect(state.row.status).toBe('failed');
 });
 it('does not start overlapping generations for the same submission', async () => {
  const results = await Promise.all([queueEvaluationDraft({ assignment, submissionId: 's1' }), queueEvaluationDraft({ assignment, submissionId: 's1' })]);
  await settle();
  expect(results.filter((result) => result.queued)).toHaveLength(1);
  expect(state.model).toHaveBeenCalledOnce();
 });
 it('retains captured evidence on provider failure without inventing a revision', async () => {
  state.model.mockRejectedValue(new Error('unavailable'));
  await queueEvaluationDraft({ assignment, submissionId: 's1' });
  await settle();
  expect(state.row.status).toBe('failed');
  expect(state.row.researchSnapshot.studentText).toBe(state.submission.content.slice(0, 12000));
  expect(state.row.researchSnapshot.providerConfig.modelVersion).toBe('unknown');
 });
 it('archives previous evidence, outputs and review state atomically before resetting a regenerated row', async () => {
  const old = { id: 'e1', status: 'ready', generatedAt: '2026-01-01', rawOutput: 'old raw', findings: [{ quote: 'old' }], recommendedScore: 95, summary: 'old summary', reviewStatus: 'approved', researchSnapshot: { generationId: 'old-generation', studentText: 'old text' }, generationHistory: [{ generationId: 'older' }] };
  state.row = structuredClone(old);
  let finish: any;
  state.model.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await queueEvaluationDraft({ assignment, submissionId: 's1' });
  await settle();
  const reset = state.writes[0];
  expect(reset.generationHistory).toHaveLength(2);
  expect(reset.generationHistory[1].researchSnapshot).toEqual(old.researchSnapshot);
  expect(reset.generationHistory[1].rawOutput).toBe('old raw');
  expect(reset.generationHistory[1].reviewStatus).toBe('approved');
  expect(reset.generationHistory[1]).not.toHaveProperty('generationHistory');
  expect(reset.rawOutput).toBe('');
  expect(reset.findings).toEqual([]);
  expect(reset.recommendedScore).toBeNull();
  expect(reset.reviewFindings).toEqual([]);
  finish({ content: '{"summary":"new"}', model: 'gpt-6-luna', modelVersion: 'unknown', durationMs: 1 });
  await settle();
  expect(state.row.generationHistory[1].summary).toBe('old summary');
 });
 it('persists the exact consumed snapshot before calling the model', async () => {
  state.model.mockImplementation(async (prompt: string, images: string[], systemPrompt: string) => {
   expect(state.row.researchSnapshot.studentText).toBe(state.submission.content.slice(0, 12000));
   expect(state.row.researchSnapshot.userPrompt).toBe(prompt);
   expect(state.row.researchSnapshot.systemPrompt).toBe(systemPrompt);
   expect(state.row.researchSnapshot.images).toEqual(images);
   expect(state.row.researchSnapshot.providerConfig.modelVersion).toBe('unknown');
   return { content: '{"summary":"Review"}', model: 'gpt-6-luna', modelVersion: 'unknown', durationMs: 3 };
  });
  expect((await queueEvaluationDraft({ assignment, submissionId: 's1' })).queued).toBe(true);
  await settle();
  expect(state.model).toHaveBeenCalledOnce();
  expect(state.row.status).toBe('ready');
  expect(state.row.researchSnapshot.task.title).toBe('Original task');
  expect(state.row.researchSchemaVersion).toBe(2);
 });
});
