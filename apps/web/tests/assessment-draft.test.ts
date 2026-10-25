import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAssessmentDraft } from '@/lib/assessment-draft';

const state = vi.hoisted(() => ({ existing: null as any, writes: [] as any[], denied: false }));
vi.mock('@/lib/api.server', () => ({
	withApi: (handler: unknown) => handler,
	readJsonBody: (request: Request) => request.json(),
	json: (body: unknown) => Response.json(body),
	apiError: (status: number, error: string) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/evaluation-review.server', () => ({
	loadEvaluationTarget: async () => state.denied ? { error: { status: 403, message: 'Forbidden' } } : {
		target: { channel: 'enrolled', recordId: 'submission123', content: 'Ich wohne in Bandung.', assignment: { id: 'assignment123', owner: 'teacher123' } },
	},
	validateReviewFindings: (findings: unknown) => ({ findings, omitted: 0 }),
}));
vi.mock('@/lib/pocketbase-client.server', () => ({ pocketbaseAdmin: {
	listRecords: async () => ({ items: state.existing ? [state.existing] : [] }),
	updateRecord: async (collection: string, id: string, payload: any) => { state.writes.push({ collection, id, payload }); Object.assign(state.existing, payload); },
	createRecord: async (collection: string, payload: any) => { state.writes.push({ collection, payload }); },
} }));
import { action } from '@/routes/api.evaluation-review';
const call = (reviewDraft?: unknown) => action({ request: new Request('http://localhost/api/evaluation-review', {
	method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId: 'submission123', findings: [], criterionScores: { grammar: 75 }, ...(reviewDraft === undefined ? {} : { reviewDraft }) }),
}), params: {} });
beforeEach(() => { state.existing = null; state.writes = []; state.denied = false; });

describe('complete lecturer assessment draft', () => {
	it('saves note and score override with findings and criterion scores without publishing', async () => {
		const reviewDraft = { version: 1, finalScore: 82, note: 'Perbaiki posisi kata kerja.' };
		expect((await call(reviewDraft)).status).toBe(200);
		expect(state.writes).toHaveLength(1);
		expect(state.writes[0]).toMatchObject({ collection: 'ai_evaluations', payload: { reviewDraft, reviewFindings: [], reviewCriterionScores: { grammar: 75 } } });
		expect(state.writes[0].payload).not.toHaveProperty('publishedAt');
		expect(state.writes[0].payload).not.toHaveProperty('finalScore');
	});
	it('keeps a published grade and original AI output unchanged when updating the draft', async () => {
		state.existing = { id: 'evaluation123', publishedAt: '2026-10-24', finalScore: 88, findings: [{ id: 'original-ai' }] };
		await call({ version: 1, finalScore: 79, note: 'New unpublished note' });
		expect(state.existing.finalScore).toBe(88);
		expect(state.existing.publishedAt).toBe('2026-10-24');
		expect(state.existing.findings).toEqual([{ id: 'original-ai' }]);
		expect(state.existing.reviewDraft.finalScore).toBe(79);
	});
	it.each([-1, 101, '82', null])('rejects invalid draft payload %s', async (value) => {
		const payload = value === null ? null : { version: 1, finalScore: value, note: '' };
		expect((await call(payload)).status).toBe(422);
		expect(state.writes).toEqual([]);
	});
	it('rejects oversized notes and invalid numeric values', () => {
		expect(parseAssessmentDraft({ version: 1, finalScore: 80, note: 'x'.repeat(2001) })).toBeNull();
		expect(parseAssessmentDraft({ version: 1, finalScore: NaN, note: '' })).toBeNull();
		expect(parseAssessmentDraft({ version: 1, finalScore: null, note: '' })).toEqual({ version: 1, finalScore: null, note: '' });
	});
	it('preserves saved notes for older clients that omit the new field', async () => {
		const draft = { version: 1, finalScore: null, note: 'Keep this note' };
		state.existing = { id: 'evaluation123', reviewDraft: draft };
		await call();
		expect(state.existing.reviewDraft).toEqual(draft);
	});
	it('keeps owner authorization ahead of all writes', async () => {
		state.denied = true;
		expect((await call({ version: 1, finalScore: 80, note: '' })).status).toBe(403);
		expect(state.writes).toEqual([]);
	});
});
