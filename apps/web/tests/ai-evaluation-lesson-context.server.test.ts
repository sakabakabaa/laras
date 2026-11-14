import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	row: null as any,
	model: vi.fn(),
	courseCode: 'A1 JR241',
	submission: {
		id: 's1',
		assignment: 'a1',
		content: 'Ich bin Student. Ich wohne in Jakarta.',
		files: [],
		link: '',
		status: 'submitted',
		taskAnswers: {},
		created: '2026-01-01',
		updated: '2026-10-01',
	} as any,
}));

vi.mock('@/lib/logger.server', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: vi.fn(async (collection: string, id: string) => {
			if (collection === 'courses') return { code: state.courseCode };
			if (collection === 'ai_evaluations') return structuredClone(state.row);
			if (collection === 'class_sessions') {
				if (id === 'missing') throw new Error('404');
				return { week: 3, title: 'Vorstellung', topic: 'Sich vorstellen', learningIndicator: 'Mampu memperkenalkan diri', learningMaterial: 'sein, wohnen' };
			}
			if (collection === 'sub_cpmk') return { code: 'SC-1', description: 'Menulis perkenalan diri', cpmk: 'cp1' };
			if (collection === 'cpmk') return { code: 'CP-1', description: 'Menulis teks sederhana' };
			return state.submission;
		}),
		listRecords: vi.fn(async () => ({ items: state.row ? [structuredClone(state.row)] : [] })),
		createRecord: vi.fn(async (_: string, payload: any) => {
			state.row = { id: 'e1', ...structuredClone(payload) };
			return state.row;
		}),
		updateRecord: vi.fn(async (_: string, id: string, payload: any) => {
			state.row = { ...state.row, id, ...structuredClone(payload) };
			return state.row;
		}),
	},
}));
vi.mock('@/lib/task-assist.server', () => ({
	collectModelWithProvenance: state.model,
	imageFilenames: () => [],
	storedFileUrl: () => '',
}));
vi.mock('@/lib/context-retrieval.server', () => ({
	cpmkOfSubCpmk: async () => '',
	retrieveContextBundle: async () => ({ result: 'insufficient', reason: 'none', sources: [], citations: [] }),
}));

import { lessonContextOf, queueEvaluationDraft } from '@/lib/ai-evaluation.server';

const base = {
	id: 'a1',
	owner: 'f1',
	course: 'c1',
	title: 'Task',
	shape: 'writing',
	activityType: 'formal',
	instructions: 'Write German',
	requirements: 'Text',
	taskConfig: {},
	session: 'sess1',
	subCpmk: 'sub1',
} as any;
const settle = async () => {
	for (let n = 0; n < 30; n++) await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
	// These cases cover the single-pass (v4) prompt; two-pass is covered in ai-evaluation-two-pass.server.test.ts.
	process.env.AI_EVAL_TWO_PASS = '0';
	state.row = null;
	state.courseCode = 'A1 JR241';
	state.submission = { ...state.submission, content: 'Ich bin Student. Ich wohne in Jakarta.' };
	state.model.mockReset();
	state.model.mockResolvedValue({ content: '{"findings":[],"summary":"Review","recommendedScore":80}', model: 'gpt-6-luna', modelVersion: 'unknown', durationMs: 3 });
});

describe('lessonContextOf', () => {
	it('includes session topic, indicator, material, Sub-CPMK and CPMK', async () => {
		const text = await lessonContextOf(base);
		expect(text).toContain('Minggu 3 — Vorstellung');
		expect(text).toContain('Sich vorstellen');
		expect(text).toContain('Mampu memperkenalkan diri');
		expect(text).toContain('sein, wohne');
		expect(text).toContain('SC-1 Menulis perkenalan diri');
		expect(text).toContain('CP-1 Menulis teks sederhana');
	});

	it('is empty when the assignment is not linked to a session or outcome', async () => {
		expect(await lessonContextOf({ ...base, session: '', subCpmk: '' })).toBe('');
	});

	it('keeps the outcome lines when the session cannot be read', async () => {
		const text = await lessonContextOf({ ...base, session: 'missing' });
		expect(text).toContain('SC-1');
		expect(text).not.toContain('Sich vorstellen');
	});
});

describe('review prompt', () => {
	it('sends lesson context and the CEFR guide to the model', async () => {
		await queueEvaluationDraft({ assignment: base, submissionId: 's1' });
		await settle();
		const [prompt] = state.model.mock.calls[0];
		expect(prompt).toContain('KONTEKS PEMBELAJARAN');
		expect(prompt).toContain('Sich vorstellen');
		expect(prompt).toContain('A1 (Pemula)');
		expect(state.row.usedCefr).toBe(true);
	});

	it('applies the CEFR guide to non-language-builder shapes such as case studies', async () => {
		await queueEvaluationDraft({ assignment: { ...base, shape: 'case_study' }, submissionId: 's1' });
		await settle();
		expect(state.model.mock.calls[0][0]).toContain('A1 (Pemula)');
	});

	it('omits the CEFR guide when the course code has no level', async () => {
		state.courseCode = 'JR241';
		await queueEvaluationDraft({ assignment: base, submissionId: 's1' });
		await settle();
		expect(state.model.mock.calls[0][0]).not.toContain('CEFR');
		expect(state.row.usedCefr).toBe(false);
	});

	it('tells the model and the lecturer when the submission was cut', async () => {
		state.submission = { ...state.submission, content: 'Ich bin. ' + 'x'.repeat(13000) };
		await queueEvaluationDraft({ assignment: base, submissionId: 's1' });
		await settle();
		expect(state.model.mock.calls[0][0]).toContain('dipotong');
		expect(state.row.contextNote).toContain('dipotong');
		expect(state.row.contextNote.length).toBeLessThanOrEqual(500);
	});

	it('does not claim truncation for a normal-length submission', async () => {
		await queueEvaluationDraft({ assignment: base, submissionId: 's1' });
		await settle();
		expect(state.model.mock.calls[0][0]).not.toContain('dipotong');
	});

	it('tells the model not to score or invent criteria when there is no weighted rubric', async () => {
		await queueEvaluationDraft({ assignment: base, submissionId: 's1' });
		await settle();
		const [prompt] = state.model.mock.calls[0];
		expect(prompt).toContain('tidak ada kriteria rubrik berbobot');
		expect(prompt).not.toContain('maksimal 5 aspek');
		expect(state.row.recommendedScore).toBeNull();
	});

});
