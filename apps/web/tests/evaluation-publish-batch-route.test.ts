import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	role: 'faculty',
	userId: 'lecturer1',
	owner: 'lecturer1',
	submissions: [] as { id: string; status: string; content: string; transcriptStatus?: string }[],
	rows: [] as Record<string, unknown>[],
	updates: [] as { collection: string; id: string; data: Record<string, unknown> }[],
}));

vi.mock('@/lib/api.server', () => ({
	withApi: (fn: unknown) => fn,
	json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
	apiError: (status: number, error: string) => Response.json({ error }, { status }),
	readJsonBody: (request: Request) => request.json(),
}));
vi.mock('@/lib/context-retrieval.server', () => ({
	authenticateUser: async () => ({ pb: {}, user: { id: state.userId, role: state.role } }),
}));
const assignment = () => ({
	id: 'assign1',
	owner: state.owner,
	shape: 'writing',
	activityType: 'formal',
	taskConfig: { prompt: 'Schreiben Sie eine E-Mail.', criteria: [{ id: 'c1', label: 'Inhalt', weight: 1 }] },
});
vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: async (collection: string, id: string) => {
			if (collection === 'assignments') return assignment();
			const sub = state.submissions.find((s) => s.id === id);
			if (!sub) throw new Error('missing');
			return { ...sub, assignment: 'assign1' };
		},
		listRecords: async (collection: string, query: { filter?: string }) => {
			if (collection === 'assignment_submissions') return { items: state.submissions.filter((s) => s.status === 'submitted' || s.status === 'late') };
			const match = query.filter?.match(/submission="([^"]+)"/);
			return { items: match ? state.rows.filter((r) => r.submission === match[1]) : state.rows };
		},
		updateRecord: async (collection: string, id: string, data: Record<string, unknown>) => {
			state.updates.push({ collection, id, data });
			return { id };
		},
		createRecord: async () => ({ id: 'new' }),
	},
}));

import routes from '../src/routes';
import { action } from '../src/routes/api.evaluation-publish-batch';

const call = (body: unknown) =>
	action({
		request: new Request('https://laras.test/api/evaluation-publish-batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		params: {},
		context: {},
	} as never) as Promise<Response>;

const readyRow = (submission: string, score = 90) => ({
	id: `ev-${submission}`,
	submission,
	status: 'ready',
	findings: [{ severity: 'minor', quote: 'Hallo', note: 'Anrede', evidence: '' }],
	rubricBreakdown: [{ criterionId: 'c1', criterion: 'Inhalt', score, note: '' }],
	recommendedScore: score,
	summary: 'Gut.',
});

beforeEach(() => {
	state.role = 'faculty';
	state.userId = 'lecturer1';
	state.owner = 'lecturer1';
	state.updates = [];
	state.submissions = [
		{ id: 'subready1', status: 'submitted', content: 'Hallo Anna, wie geht es dir?' },
		{ id: 'subnotready', status: 'submitted', content: 'Hallo' },
	];
	state.rows = [readyRow('subready1', 84), { id: 'ev-2', submission: 'subnotready', status: 'pending' }];
});

describe('POST /api/evaluation-publish-batch', () => {
	it('is registered like the single publish route', () => {
		expect(routes).toContainEqual(
			expect.objectContaining({ path: 'api/evaluation-publish-batch', file: 'routes/api.evaluation-publish-batch.ts' }),
		);
	});

	it('only lets the owning lecturer publish', async () => {
		state.role = 'student';
		expect((await call({ assignmentId: 'assign1' })).status).toBe(403);
		state.role = 'faculty';
		state.owner = 'someoneelse';
		expect((await call({ assignmentId: 'assign1' })).status).toBe(403);
		expect(state.updates).toEqual([]);
	});

	it('publishes ready drafts through the shared publish logic and reports the rest per item', async () => {
		const response = await call({ assignmentId: 'assign1', submissionIds: ['subready1', 'subnotready'] });
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({ published: 1, failed: 1 });
		expect(body.results).toContainEqual({ submissionId: 'subready1', ok: true, finalScore: 84 });
		expect(body.results).toContainEqual(expect.objectContaining({ submissionId: 'subnotready', ok: false }));
		const graded = state.updates.find((u) => u.collection === 'assignment_submissions');
		expect(graded).toMatchObject({ id: 'subready1', data: { grade: 84, status: 'graded', gradedBy: 'lecturer1' } });
		const snapshot = state.updates.find((u) => u.collection === 'ai_evaluations');
		expect((snapshot?.data.reviewFindings as { status: string }[]).every((f) => f.status === 'approved')).toBe(true);
		expect(state.updates.some((u) => u.id === 'subnotready')).toBe(false);
	});
});
