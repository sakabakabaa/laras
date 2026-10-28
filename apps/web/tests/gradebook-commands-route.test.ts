import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ role: 'faculty', owner: 'faculty1', proposalOwner: 'faculty1', authError: false, commandError: 0, received: null as any, calls: [] as string[], proposal: { id: 'proposal1', course: 'course1', revision: 2, payloadHash: 'hash1', status: 'awaiting_approval', items: [], result: null } }));
vi.mock('@/lib/api.server', () => ({ withApi: (fn: any) => fn, json: (data: any, init?: ResponseInit) => Response.json(data, init), apiError: (status: number, error: string) => Response.json({ error }, { status }), readJsonBody: (r: Request) => r.json() }));
vi.mock('@/lib/context-retrieval.server', () => ({ authenticateUser: async () => state.authError ? { error: { status: 401, message: 'Unauthorized' } } : { pb: { owner: 'faculty1' }, user: { id: 'faculty1', role: state.role } } }));
vi.mock('@/lib/pocketbase-client.server', () => ({ pocketbaseAdmin: { getRecord: async (collection: string) => collection === 'courses' ? { owner: state.owner } : { owner: state.proposalOwner, course: 'course1' } } }));
vi.mock('@/lib/gradebook/commands.server', () => ({
 prepareGradeChanges: async (_pb: any, input: any) => { state.calls.push('prepare'); return { ...state.proposal, items: input.items }; },
 approveGradeChanges: async (input: any) => { state.received = input; state.calls.push('approve'); if (state.commandError) throw { status: state.commandError, message: 'secret database internals' }; return { ...state.proposal, status: 'approved' }; },
 rejectGradeChanges: async () => { state.calls.push('reject'); return { ...state.proposal, status: 'rejected' }; },
 applyGradeChanges: async () => { state.calls.push('apply'); return { ...state.proposal, status: 'verified' }; },
 getGradeChangeStatus: async () => { state.calls.push('status'); return state.proposal; },
 reconcileGradeChanges: async () => { state.calls.push('reconcile'); return state.proposal; },
}));
async function call(body: any, headers: Record<string, string> = {}) {
 const module = await import('../src/routes/api.gradebook-commands');
 return module!.action({ request: new Request('https://laras.test/api/gradebook-commands', { method: 'POST', headers: { Origin: 'https://laras.test', 'Content-Type': 'application/json', 'X-Laras-Grade-Action': 'review', ...headers }, body: JSON.stringify(body) }), params: {} });
}
const ref = { action: 'approve', proposalId: 'proposal1', revision: 2, payloadHash: 'hash1', explicitAction: 'approve' };
beforeEach(() => { state.role = 'faculty'; state.owner = 'faculty1'; state.proposalOwner = 'faculty1'; state.authError = false; state.commandError = 0; state.received = null; state.calls = []; });
describe('real gradebook command route', () => {
 it('requires same-origin approval before invoking the privileged command', async () => {
  const response = await call(ref, { Origin: 'https://evil.test' });
  expect(response.status).toBe(403); expect(state.calls).toEqual([]);
 });
 it.each([{ Origin: '' }, { 'X-Laras-Grade-Action': '' }, { 'Content-Type': 'text/plain' }, { 'Sec-Fetch-Site': 'cross-site' }])('rejects missing CSRF protections %j', async (headers) => {
  expect((await call(ref, headers)).status).toBe(403); expect(state.calls).toEqual([]);
 });
 it('requires authenticated faculty and course ownership', async () => {
  state.authError = true; expect((await call(ref)).status).toBe(401);
  state.authError = false; state.role = 'student'; expect((await call(ref)).status).toBe(403);
  state.role = 'faculty'; state.owner = 'foreign'; expect((await call(ref)).status).toBe(403);
  expect(state.calls).toEqual([]);
 });
 it('rejects another lecturer proposal even if the course matches', async () => {
  state.proposalOwner = 'foreign'; expect((await call(ref)).status).toBe(403); expect(state.calls).toEqual([]);
 });
 it('does not treat a forged approved flag as an explicit approval', async () => {
  expect((await call({ ...ref, explicitAction: undefined, approved: true })).status).toBe(422); expect(state.calls).toEqual([]);
 });
 it('approves exact reference without applying or trusting submitted replacement items', async () => {
  const response = await call({ ...ref, items: [{ value: 100 }], ownerId: 'foreign' });
  expect(response.status).toBe(200); expect(state.calls).toEqual(['approve']);
  expect(state.received).toEqual({ ownerId: 'faculty1', proposalId: 'proposal1', revision: 2, payloadHash: 'hash1' });
 });
 it('surfaces stale errors without exposing internal exceptions or applying', async () => {
  state.commandError = 409;
  const response = await call(ref);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: 'stale_proposal', error: expect.stringContaining('review a new proposal') });
  expect(state.calls).toEqual(['approve']);
 });
 it('persists explicit rejection without applying', async () => {
  const response = await call({ ...ref, action: 'reject', explicitAction: 'reject' });
  expect(response.status).toBe(200); expect(state.calls).toEqual(['reject']);
 });
 it('applies only through a separate request', async () => {
  expect((await call({ ...ref, action: 'apply' })).status).toBe(200); expect(state.calls).toEqual(['apply']);
 });
 it('pins the UI provenance while preserving explicit score zero', async () => {
  const items = [{ componentId: 'component1', studentId: 'student1', operation: { op: 'set_score', score: 0 } }];
  const response = await call({ action: 'prepare', courseId: 'course1', operationKey: 'unique1', source: 'assistant_input', items });
  expect(response.status).toBe(200); expect((await response.json()).proposal.items).toEqual(items); expect(state.calls).toEqual(['prepare']);
 });
});
