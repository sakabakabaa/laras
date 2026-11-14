import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ model: vi.fn(), courseOwner: 'f1' }));

vi.mock('@/lib/logger.server', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: vi.fn(async (collection: string, id: string) => {
			if (collection === 'class_sessions') {
				if (id === 'missing000') throw new Error('404');
				return { course: 'course00001', week: 2, title: 'Arzt', topic: 'Beim Arzt', learningIndicator: 'Mampu menulis e-mail', learningMaterial: 'dürfen' };
			}
			if (collection === 'courses') return { owner: state.courseOwner, code: 'A1 JR241' };
			return {};
		}),
	},
}));
vi.mock('@/lib/task-assist.server', () => ({ collectModelWithProvenance: state.model, imageFilenames: () => [], storedFileUrl: () => '' }));
vi.mock('@/lib/context-retrieval.server', () => ({ cpmkOfSubCpmk: async () => '', retrieveContextBundle: async () => null }));

import {
	answersTextOf,
	buildLivePrompt,
	composeLiveFeedback,
	draftLiveAnswerReview,
	parseLiveDraftInput,
	validateLiveDraft,
} from '@/lib/live-answer-review.server';

const answer = 'Sehr geehrte Kollegen,\nich habe heute leider nicht zu Arbeit kommen.';
const body = {
	sessionId: 'session0001',
	activityTitle: 'Eine E-Mail schreiben',
	items: [{ prompt: 'Schreiben Sie eine E-Mail.', answer, modelAnswer: 'Ich kann heute nicht zur Arbeit kommen.', rubric: 'Anrede, Nachricht, Gruß' }],
	criteria: [
		{ id: 'g', label: 'Grammatik', maxPoints: 5 },
		{ id: 'w', label: 'Wortschatz', maxPoints: 5 },
	],
};
const parsedInput = () => {
	const parsed = parseLiveDraftInput(body);
	if ('error' in parsed) throw new Error('bad fixture');
	return parsed.input;
};

beforeEach(() => {
	process.env.AI_EVAL_TWO_PASS = '0';
	state.courseOwner = 'f1';
	state.model.mockReset();
});

describe('parseLiveDraftInput', () => {
	it('accepts a well-formed body', () => {
		const input = parsedInput();
		expect(input.items).toHaveLength(1);
		expect(input.criteria).toHaveLength(2);
	});
	it('rejects a bad session id and an empty submission', () => {
		expect(parseLiveDraftInput({ ...body, sessionId: 'bad id' })).toMatchObject({ error: { status: 422 } });
		expect(parseLiveDraftInput({ ...body, items: [{ prompt: 'x', answer: '   ' }] })).toMatchObject({ error: { status: 422 } });
		expect(parseLiveDraftInput(null)).toMatchObject({ error: { status: 422 } });
	});
	it('bounds item count, answer length and criteria', () => {
		const items = Array.from({ length: 80 }, () => ({ prompt: 'p', answer: 'a'.repeat(7000) }));
		const criteria = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, label: 'L', maxPoints: 5 }));
		const input = (parseLiveDraftInput({ ...body, items, criteria }) as { input: ReturnType<typeof parsedInput> }).input;
		expect(input.items.length).toBeLessThanOrEqual(30);
		expect(input.items.reduce((sum, item) => sum + item.answer.length, 0)).toBeLessThanOrEqual(12000);
		expect(input.criteria.length).toBeLessThanOrEqual(12);
	});
	it('drops criteria without a label or positive points', () => {
		const input = (parseLiveDraftInput({ ...body, criteria: [{ id: 'a', label: '', maxPoints: 5 }, { id: 'b', label: 'B', maxPoints: 0 }, { id: 'c', label: 'C', maxPoints: 4 }] }) as { input: ReturnType<typeof parsedInput> }).input;
		expect(input.criteria).toEqual([{ id: 'c', label: 'C', maxPoints: 4 }]);
	});
});

describe('buildLivePrompt', () => {
	it('carries the answer, model answer, rubric, CEFR and lesson context', () => {
		const prompt = buildLivePrompt(parsedInput(), { levelGuide: 'CEFR A1 guide', lessonContext: 'KONTEKS PEMBELAJARAN\n- Topik: Beim Arzt' });
		expect(prompt).toContain(answer);
		expect(prompt).toContain('Ich kann heute nicht zur Arbeit kommen.');
		expect(prompt).toContain('Anrede, Nachricht, Gruß');
		expect(prompt).toContain('CEFR A1 guide');
		expect(prompt).toContain('Beim Arzt');
		expect(prompt).toContain('[criterionId=g] Grammatik');
	});
});

describe('validateLiveDraft', () => {
	const text = answersTextOf(parsedInput().items);
	const model = (extra: Record<string, unknown> = {}) =>
		JSON.stringify({
			findings: [
				{ severity: 'major', quote: 'nicht zu Arbeit kommen', note: 'Artikel fehlt: zur Arbeit', correction: 'nicht zur Arbeit kommen', category: 'Morphology', subcategory: 'article', confidence: 0.9 },
				{ severity: 'minor', quote: 'a sentence the student never wrote', note: 'Erfunden' },
			],
			summary: 'Gute Anrede, Präposition prüfen.',
			rubricBreakdown: [
				{ criterionId: 'g', criterion: 'Grammatik', score: 60, note: 'Artikel' },
				{ criterionId: 'w', criterion: 'Wortschatz', score: 80, note: 'ok' },
			],
			...extra,
		});

	it('keeps verified quotes, demotes invented ones, and computes the weighted score', () => {
		const draft = validateLiveDraft(model(), text, parsedInput().criteria)!;
		expect(draft.findings[0].quote).toBe('nicht zu Arbeit kommen');
		expect(draft.findings.find((f) => f.note === 'Erfunden')?.quote).toBe('');
		expect(draft.suggestedScore).toBe(70);
		expect(draft.criterionScores).toEqual({ g: 60, w: 80 });
		// Student-facing feedback never lists findings at draft time (only approved ones are added later).
		expect(draft.feedback).toBe('Gute Anrede, Präposition prüfen.');
	});
	it('gives no score when the breakdown misses a criterion', () => {
		const partial = model({ rubricBreakdown: [{ criterionId: 'g', criterion: 'Grammatik', score: 60, note: '' }] });
		const draft = validateLiveDraft(partial, text, parsedInput().criteria)!;
		expect(draft.suggestedScore).toBeNull();
		expect(draft.criterionScores).toEqual({});
		expect(draft.findings.length).toBeGreaterThan(0);
	});
	it('uses the model score only when there is no rubric', () => {
		const draft = validateLiveDraft(model({ recommendedScore: 77, rubricBreakdown: [] }), text, [])!;
		expect(draft.suggestedScore).toBe(77);
	});
	it('rejects unreadable output and empty drafts', () => {
		expect(validateLiveDraft('not json', text, [])).toBeNull();
		expect(validateLiveDraft('{"findings":[],"summary":"","recommendedScore":null}', text, [])).toBeNull();
	});
});

describe('composeLiveFeedback', () => {
	it('puts the summary first and marks general findings', () => {
		const out = composeLiveFeedback({
			summary: 'Zusammenfassung',
			findings: [{ severity: 'minor', quote: '', note: 'Mehr Sätze' } as any],
		});
		expect(out.startsWith('Zusammenfassung')).toBe(true);
		expect(out).toContain('• Umum: Mehr Sätze');
	});
});

describe('draftLiveAnswerReview', () => {
	const ok = { content: JSON.stringify({ findings: [], summary: 'Gut.', recommendedScore: null, rubricBreakdown: [] }), model: 'm', modelVersion: 'v', durationMs: 1 };

	it('refuses a lecturer who does not own the course, without calling the model', async () => {
		state.courseOwner = 'someone-else';
		const result = await draftLiveAnswerReview('f1', parsedInput());
		expect(result).toMatchObject({ error: { status: 403 } });
		expect(state.model).not.toHaveBeenCalled();
	});
	it('reports a missing session as 404', async () => {
		expect(await draftLiveAnswerReview('f1', { ...parsedInput(), sessionId: 'missing000' })).toMatchObject({ error: { status: 404 } });
	});
	it('sends lesson context and the CEFR guide to the model and returns the draft', async () => {
		state.model.mockResolvedValue(ok);
		const result = await draftLiveAnswerReview('f1', parsedInput());
		expect('draft' in result && result.draft.summary).toBe('Gut.');
		const [prompt, images] = state.model.mock.calls[0];
		expect(images).toEqual([]);
		expect(prompt).toContain('KONTEKS PEMBELAJARAN');
		expect(prompt).toContain('Beim Arzt');
		expect(prompt).toContain('A1 (Pemula)');
	});
	it('turns a model outage into a 502 with a manual-grading note', async () => {
		state.model.mockRejectedValue(new Error('down'));
		const result = await draftLiveAnswerReview('f1', parsedInput());
		expect(result).toMatchObject({ error: { status: 502 } });
	});
	it('returns 422 when the model output cannot be verified', async () => {
		state.model.mockResolvedValue({ ...ok, content: 'garbage' });
		expect(await draftLiveAnswerReview('f1', parsedInput())).toMatchObject({ error: { status: 422 } });
	});
});
