import { beforeEach, expect, test, vi } from 'vitest';
const db = vi.hoisted(() => ({ getRecord: vi.fn(), listRecords: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn(), deleteRecord: vi.fn() }));
const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/pocketbase-client.server', () => ({ pocketbaseAdmin: db }));
vi.mock('@/lib/context-retrieval.server', () => ({ authenticateUser: auth }));
import { saveResearchAnnotation, saveMissedErrorAnnotation, loadResearchRatings, deleteMissedErrorAnnotation } from '@/lib/evaluation-annotation.server';
import { loadResearchTarget } from '@/lib/research-target.server';
import { findingFingerprint } from '@/lib/research-annotation';
import { loadEvaluationTarget } from '@/lib/evaluation-review.server';
import { action } from '@/routes/api.evaluation-annotation';
const request = new Request('https://synthetic.invalid');
test.each([0, 1, '2', -1, 3, null])('the assignment cannot be used for unauthorized round %s', async (round) => {
 const result = await loadResearchTarget(request, { submissionId: 'sub00000000001', round });
 expect(result).toHaveProperty('error');
 expect(db.createRecord).not.toHaveBeenCalled();
});
test('assignment owners have no implicit research-rater privilege', async () => {
 auth.mockResolvedValue({ user: { id: 'owner000000001' } });
 db.listRecords.mockResolvedValue({ items: [] });
 expect(await loadResearchTarget(request, { submissionId: 'sub00000000001' })).toMatchObject({ error: { status: 403 } });
});
test('assigned research raters do not acquire grade/review/publish authorization', async () => {
 expect(await loadEvaluationTarget(request, { submissionId: 'sub00000000001' })).toMatchObject({ error: { status: 403 } });
});
test('the owner retains grade/review/publish authorization without a research assignment', async () => {
 auth.mockResolvedValue({ user: { id: 'owner000000001' } });
 db.listRecords.mockResolvedValue({ items: [] });
 expect(await loadEvaluationTarget(request, { submissionId: 'sub00000000001' })).toHaveProperty('target');
});
test('revoked assignments fail closed', async () => {
 db.listRecords.mockResolvedValue({ items: [{ reviewer: 'rater0000000002', round: '2', active: false }] });
 expect(await loadResearchTarget(request, { submissionId: 'sub00000000001', round: 2 })).toMatchObject({ error: { status: 403 } });
});
test('authorization storage failure never falls back to owner permissions', async () => {
 db.listRecords.mockRejectedValue(new Error('synthetic unavailable'));
 expect(await loadResearchTarget(request, { submissionId: 'sub00000000001', round: 2 })).toMatchObject({ error: { status: 503 } });
});
test.each([{ submissionId: 'bad id' }, { submissionId: 'sub00000000001', publicSubmissionId: 'pub00000000001' }, { submissionId: ' sub00000000001' }])('malformed or ambiguous target IDs are rejected', async (body) => {
 expect(await loadResearchTarget(request, { ...body, round: 2 })).toMatchObject({ error: { status: 422 } });
});
test('Rater 2 adds their original without modifying Rater 1', async () => {
 const original = { round: 1, reviewer: 'rater0000000001', reviewedAt: '2026-01-01', note: 'private one', detectionJudgment: 'incorrect' };
 withFinding([{ id: 'item0000000001', raterJudgments: [original] }]);
 expect(await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 2, findingFingerprint: findingFingerprint(finding), detectionJudgment: 'correct' })).toMatchObject({ ok: true });
 expect(db.updateRecord).toHaveBeenCalledWith('ai_feedback_items', 'item0000000001', expect.objectContaining({ raterJudgments: [original, expect.objectContaining({ round: 2, reviewer: 'rater0000000002' })] }));
 expect(db.deleteRecord).toHaveBeenCalledWith('research_annotation_locks', 'item0000000001');
});
test('the annotation action provides authenticated POST-only blind research loading', async () => {
 withFinding();
 const response = await action({ params: {}, request: new Request('https://synthetic.invalid/api/evaluation-annotation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent: 'load', submissionId: 'sub00000000001', round: 2 }) }) });
 expect(response.status).toBe(200);
 expect(response.headers.get('Cache-Control')).toBe('no-store');
 expect(await response.json()).toMatchObject({ ok: true, round: 2, content: 'Ich gehen.' });
 expect(db.createRecord).not.toHaveBeenCalled();
});
test('human candidate adjudication preserves both originals and requires the explicit candidate ID', async () => {
 const originals = [{ round: 1, reviewer: 'rater0000000001', reviewedAt: '2026-01-01', detectionJudgment: 'missed' }, { round: 2, reviewer: 'rater0000000002', reviewedAt: '2026-01-01', detectionJudgment: 'missed' }];
 auth.mockResolvedValue({ user: { id: 'adjud000000001' } });
 db.getRecord.mockImplementation(async (collection: string) => collection === 'ai_feedback_items' ? { id: 'human000000001', evaluation: 'eval0000000001', assignment: 'assign000000001', origin: 'human', parentAiFindingId: 'fp_human', quote: 'gehen', quoteStart: 4, quoteEnd: 9, anchorValid: true, raterJudgments: originals }
  : collection === 'assignments' ? { id: 'assign000000001', owner: 'owner000000001', activityType: 'formal', shape: 'essay' }
  : { assignment: 'assign000000001', content: 'Ich gehen.' });
 db.listRecords.mockImplementation(async (collection: string) => ({ items: collection === 'research_rater_assignments' ? [{ reviewer: 'adjud000000001', round: '0', active: true }] : collection === 'ai_evaluations' ? [{ id: 'eval0000000001', findings: [] }] : [] }));
 expect(await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 0, itemId: 'human000000001', detectionJudgment: 'missed', errorPresent: 'yes' } as any)).toMatchObject({ ok: true });
 expect(db.updateRecord).toHaveBeenCalledWith('ai_feedback_items', 'human000000001', expect.objectContaining({ adjudicationStatus: 'adjudicated', detectionJudgment: 'missed', raterJudgments: [...originals, expect.objectContaining({ round: 0, reviewer: 'adjud000000001' })] }));
});
test('concurrent writes to the same finding fail closed on the database lock', async () => {
 withFinding();
 db.createRecord.mockImplementation(async (collection: string) => {
  if (collection === 'research_annotation_locks') throw { status: 400 };
  return { id: 'item0000000001' };
 });
 expect(await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 2, findingFingerprint: findingFingerprint(finding) })).toMatchObject({ error: { status: 409 } });
 expect(db.createRecord.mock.calls.some(([collection]) => collection === 'ai_feedback_items')).toBe(false);
});
test('legacy reviewed missed-error originals cannot be deleted', async () => {
 db.getRecord.mockImplementation(async (collection: string) => collection === 'assignment_submissions'
  ? { assignment: 'assign000000001', content: 'Ich gehen.' }
  : collection === 'assignments' ? { id: 'assign000000001', owner: 'owner000000001', activityType: 'formal', shape: 'essay' }
  : { owner: 'rater0000000002', origin: 'human', adjudicationStatus: 'reviewed', reviewer: 'rater0000000002', raterJudgments: [], assignment: 'assign000000001', submission: 'sub00000000001' });
 withFinding();
 expect(await deleteMissedErrorAnnotation(request, 'item0000000001', { submissionId: 'sub00000000001', round: 2 })).toMatchObject({ error: { status: 403 } });
 expect(db.deleteRecord).not.toHaveBeenCalled();
});
test('submitted originals cannot be deleted even by their owner', async () => {
 db.getRecord.mockImplementation(async (collection: string) => collection === 'assignment_submissions'
  ? { assignment: 'assign000000001', content: 'Ich gehen.' }
  : collection === 'assignments' ? { id: 'assign000000001', owner: 'owner000000001', activityType: 'formal', shape: 'essay' }
  : { owner: 'rater0000000002', origin: 'human', raterJudgments: [{ round: 2, reviewer: 'rater0000000002', reviewedAt: '2026-01-01' }], assignment: 'assign000000001', submission: 'sub00000000001' });
 withFinding();
 expect(await deleteMissedErrorAnnotation(request, 'item0000000001', { submissionId: 'sub00000000001', round: 2 })).toMatchObject({ error: { status: 403 } });
 expect(db.deleteRecord).not.toHaveBeenCalled();
});
test('annotation history read failures must not create a replacement row', async () => {
 withFinding();
 const impl = db.listRecords.getMockImplementation()!;
 db.listRecords.mockImplementation(async (collection: string, query: unknown) => {
  if (collection === 'ai_feedback_items') throw new Error('synthetic storage unavailable');
  return impl(collection, query);
 });
 expect(await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 2, findingFingerprint: findingFingerprint(finding) })).toMatchObject({ error: { status: 503 } });
 expect(db.createRecord.mock.calls.some(([collection]) => collection === 'ai_feedback_items')).toBe(false);
});
test('unknown source fingerprints must not create phantom AI findings', async () => {
 expect(await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 2, findingFingerprint: 'fp_unknown' })).toMatchObject({ error: { status: 422 } });
 expect(db.createRecord.mock.calls.some(([collection]) => collection === 'ai_feedback_items')).toBe(false);
});
test('independent research reads expose only this account and round, never flat shared values', async () => {
 withFinding([{ id: 'item0000000001', origin: 'ai', parentAiFindingId: findingFingerprint(finding), reviewerNote: 'LEAK', detectionJudgment: 'LEAK', raterJudgments: [
  { round: 1, reviewer: 'rater0000000001', reviewedAt: '2026-01-01', note: 'OTHER_PRIVATE' },
  { round: 2, reviewer: 'rater0000000002', reviewedAt: '2026-01-01', note: 'MY_PRIVATE' },
 ] }, { id: 'human000000001', origin: 'human', quote: 'OTHER_QUOTE', raterJudgments: [{ round: 1, reviewer: 'rater0000000001', reviewedAt: '2026-01-01' }] }]);
 const result = await loadResearchRatings(request, { submissionId: 'sub00000000001', round: 2 });
 const serialized = JSON.stringify(result);
 expect(serialized).not.toContain('LEAK');
 expect(serialized).not.toContain('OTHER_PRIVATE');
 expect(serialized).not.toContain('OTHER_QUOTE');
 expect(serialized).toContain('MY_PRIVATE');
 expect(result).toMatchObject({ ok: true, round: 2, content: 'Ich gehen.' });
});
beforeEach(() => {
 vi.resetAllMocks();
 auth.mockResolvedValue({ user: { id: 'rater0000000002', role: 'lecturer' } });
 db.getRecord.mockImplementation(async (collection: string) => collection === 'assignments'
  ? { id: 'assign000000001', owner: 'owner000000001', activityType: 'formal', shape: 'essay' }
  : { assignment: 'assign000000001', content: 'Ich gehen.', status: 'submitted' });
 db.listRecords.mockImplementation(async (collection: string) => ({ items: collection === 'research_rater_assignments'
  ? [{ reviewer: 'rater0000000002', round: '2', active: true }]
  : collection === 'ai_evaluations' ? [{ id: 'eval0000000001', findings: [] }] : [] }));
 db.createRecord.mockResolvedValue({ id: 'item0000000001' });
});
test('an assigned non-owner rater may create a missed-error observation, never gold', async () => {
 const result = await saveMissedErrorAnnotation(request, { submissionId: 'sub00000000001', round: 2, quote: 'gehen', referenceCategory: 'Morphology', referenceSubcategory: 'verb_conjugation', referenceSeverity: 'major' });
 expect(result).toEqual({ ok: true, id: 'item0000000001' });
 expect(db.createRecord).toHaveBeenCalledWith('ai_feedback_items', expect.objectContaining({ owner: 'owner000000001', adjudicationStatus: 'reviewed', raterJudgments: [expect.objectContaining({ round: 2, reviewer: 'rater0000000002', detectionJudgment: 'missed' })] }));
});

const finding = { severity: 'major', quote: 'gehen', note: 'Synthetic conjugation finding', category: 'Morphology', subcategory: 'verb_conjugation' };
function withFinding(existing: unknown[] = []) {
 db.listRecords.mockImplementation(async (collection: string) => ({ items: collection === 'research_rater_assignments'
  ? [{ reviewer: 'rater0000000002', round: '2', active: true }]
  : collection === 'ai_evaluations' ? [{ id: 'eval0000000001', findings: [finding] }]
  : existing }));
}
test('ambiguous AI and human candidate selectors are rejected', async () => {
 withFinding();
 expect(await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 2, itemId: 'human000000001', findingFingerprint: findingFingerprint(finding) })).toMatchObject({ error: { status: 422 } });
});
test('independent AI saves never populate shared judgment fields', async () => {
 withFinding();
 const result = await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 2, findingFingerprint: findingFingerprint(finding), detectionJudgment: 'correct', reviewerNote: 'private original' });
 expect(result).toMatchObject({ ok: true, id: 'item0000000001' });
 const payload = db.createRecord.mock.calls.find(([collection]) => collection === 'ai_feedback_items')![1];
 expect(payload.detectionJudgment).toBe('');
 expect(payload.reviewerNote).toBe('');
 expect(payload.reviewer).toBe('');
 expect(payload.raterJudgments).toEqual([expect.objectContaining({ round: 2, detectionJudgment: 'correct', note: 'private original' })]);
});
test('legacy flat originals are not erased or fabricated as a new rater history', async () => {
 withFinding([{ id: 'item0000000001', reviewer: 'legacy00000001', reviewedAt: '2026-01-01', adjudicationStatus: 'reviewed', detectionJudgment: 'incorrect', raterJudgments: [] }]);
 expect(await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 2, findingFingerprint: findingFingerprint(finding), detectionJudgment: 'correct' })).toMatchObject({ error: { status: 409 } });
 expect(db.updateRecord).not.toHaveBeenCalled();
});
test('an original round judgment is immutable after submission', async () => {
 withFinding([{ id: 'item0000000001', raterJudgments: [{ round: 2, reviewer: 'rater0000000002', reviewedAt: '2026-01-01', detectionJudgment: 'incorrect' }] }]);
 const result = await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 2, findingFingerprint: findingFingerprint(finding), detectionJudgment: 'correct' });
 expect(result).toMatchObject({ error: { status: 409 } });
 expect(db.updateRecord).not.toHaveBeenCalled();
});
test('adjudication requires two independent originals', async () => {
 withFinding([]);
 db.listRecords.mockImplementation(async (collection: string) => ({ items: collection === 'research_rater_assignments' ? [{ reviewer: 'rater0000000002', round: '0', active: true }] : collection === 'ai_evaluations' ? [{ id: 'eval0000000001', findings: [finding] }] : [] }));
 const result = await saveResearchAnnotation(request, { submissionId: 'sub00000000001', round: 0, findingFingerprint: findingFingerprint(finding), detectionJudgment: 'correct' });
 expect(result).toMatchObject({ error: { status: 409 } });
 expect(db.createRecord.mock.calls.some(([collection]) => collection === 'ai_feedback_items')).toBe(false);
});
test('a missed-error discovery cannot begin in adjudication round', async () => {
 db.listRecords.mockImplementation(async (collection: string) => ({ items: collection === 'research_rater_assignments' ? [{ reviewer: 'rater0000000002', round: '0', active: true }] : collection === 'ai_evaluations' ? [{ id: 'eval0000000001' }] : [] }));
 const result = await saveMissedErrorAnnotation(request, { submissionId: 'sub00000000001', round: 0, quote: 'gehen', referenceCategory: 'Morphology', referenceSubcategory: 'verb_conjugation', referenceSeverity: 'major' });
 expect(result).toMatchObject({ error: { status: 409 } });
 expect(db.createRecord.mock.calls.some(([collection]) => collection === 'ai_feedback_items')).toBe(false);
});
