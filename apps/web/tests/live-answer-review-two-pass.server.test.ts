import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	model: vi.fn(),
	session: {} as Record<string, unknown>,
	courseSubs: [] as Record<string, unknown>[],
	listFilter: '',
}));

vi.mock('@/lib/logger.server', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: vi.fn(async (collection: string, id: string) => {
			if (collection === 'class_sessions') return structuredClone(state.session);
			if (collection === 'sub_cpmk') return { code: `SC-${id}`, description: `Sub ${id}`, cpmk: 'cpmk00001' };
			if (collection === 'cpmk') return { code: 'CP-1', description: 'Menulis teks sederhana' };
			return { owner: 'f1', code: 'A1 JR241' };
		}),
		listRecords: vi.fn(async (_c: string, options: { filter?: string; perPage?: number }) => {
			state.listFilter = options.filter || '';
			return { items: state.courseSubs.slice(0, options.perPage || 30) };
		}),
	},
}));
vi.mock('@/lib/task-assist.server', () => ({ collectModelWithProvenance: state.model, imageFilenames: () => [], storedFileUrl: () => '' }));

import { generateLiveDraft, parseLiveDraftInput } from '@/lib/live-answer-review.server';
import { lessonContextForScheduled } from '@/lib/ai-evaluation.server';

const answer = 'ich habe haus und auto';
const input = (extra: Record<string, unknown> = {}) => {
	const parsed = parseLiveDraftInput({
		sessionId: 'session0001',
		activityTitle: 'Schreiben',
		items: [{ prompt: 'Schreiben Sie.', answer, modelAnswer: '', rubric: '' }],
		criteria: [{ id: 'g', label: 'Grammatik', maxPoints: 6 }, { id: 'w', label: 'Wortschatz', maxPoints: 4 }],
	});
	if ('error' in parsed) throw new Error('fixture');
	return { ...parsed.input, ...extra };
};
const reply = (value: unknown) => ({ content: typeof value === 'string' ? value : JSON.stringify(value), model: 'm', modelVersion: 'v', durationMs: 1 });
const find = {
	findings: [
		{ severity: 'major', quote: 'haus', group: 'cap-noun', note: 'Nomen groß', correction: 'Haus' },
		{ severity: 'minor', quote: 'auto', group: 'cap-noun', note: 'Nomen groß', correction: 'Auto' },
		{ severity: 'minor', quote: 'und', note: 'Kein Fehler' },
	],
};
const verify = {
	verdicts: [
		{ id: 'f1', verdict: 'keep', certainty: 'pasti', reason: 'ok' },
		{ id: 'f2', verdict: 'keep', certainty: 'mungkin', reason: 'ok' },
		{ id: 'f3', verdict: 'drop', reason: 'kein Fehler' },
	],
	rubricBreakdown: [
		{ criterionId: 'g', criterion: 'Grammatik', score: 60, note: '"haus"' },
		{ criterionId: 'w', criterion: 'Wortschatz', score: 100, note: '"auto"' },
	],
	recommendedScore: 5,
	summary: 'Gut, aber Nomen groß.',
};

beforeEach(() => {
	delete process.env.AI_EVAL_TWO_PASS;
	state.model.mockReset();
	state.session = { course: 'course00001', week: 2, title: 'Arzt', topic: 'Beim Arzt', notes: 'n'.repeat(900), subCpmks: ['sub000001', 'sub000002'] };
	state.courseSubs = [];
});

describe('lessonContextForScheduled', () => {
	it('uses the meeting Sub-CPMK, clipped notes, book reference and material excerpt', async () => {
		const ctx = await lessonContextForScheduled({ session: 'session0001', bookReference: 'ÜB (Übungsbuch) · 11c · S. 105', materialExcerpt: 'Text '.repeat(500) });
		expect(ctx.usedSubCpmk).toBe(true);
		expect(ctx.usedLessonContext).toBe(true);
		expect(ctx.text).toContain('Sub-CPMK pertemuan: SC-sub000001 Sub sub000001');
		expect(ctx.text).toContain('SC-sub000002');
		expect(ctx.text).toContain('CPMK terkait: CP-1');
		expect(ctx.text).toContain('Rujukan buku kegiatan: ÜB (Übungsbuch) · 11c · S. 105');
		expect(ctx.text).not.toContain('n'.repeat(601));
		expect(ctx.text).toContain('n'.repeat(600));
		const excerpt = ctx.text.split('\n').find((l) => l.includes('Cuplikan'))!;
		expect(excerpt.length).toBeLessThanOrEqual(1600);
	});

	it('falls back to up to three course Sub-CPMK when the meeting names none', async () => {
		state.session = { course: 'course00001', topic: 'Beim Arzt', subCpmks: [] };
		state.courseSubs = Array.from({ length: 5 }, (_, i) => ({ code: `RPS-${i}`, description: `Tujuan ${i}` }));
		const ctx = await lessonContextForScheduled({ session: 'session0001' });
		expect(state.listFilter).toBe('course="course00001"');
		expect(ctx.usedSubCpmk).toBe(true);
		expect((ctx.text.match(/Sub-CPMK mata kuliah \(RPS\)/g) || []).length).toBe(3);
		expect(ctx.text).not.toContain('RPS-3');
	});

	it('reports no Sub-CPMK / lesson context when nothing is available and never throws', async () => {
		state.session = { course: 'course00001', subCpmks: [] };
		const ctx = await lessonContextForScheduled({ session: 'session0001' });
		expect(ctx).toMatchObject({ text: '', usedSubCpmk: false, usedLessonContext: false });
	});
});

describe('generateLiveDraft two-pass', () => {
	it('keeps verified findings with certainty and group, recomputes the score, records provenance', async () => {
		state.model.mockResolvedValueOnce(reply(find)).mockResolvedValueOnce(reply(verify));
		const result = await generateLiveDraft(input(), 'A1 JR241');
		if (!('draft' in result)) throw new Error('expected draft');
		const { draft } = result;
		expect(state.model).toHaveBeenCalledTimes(2);
		expect(state.model.mock.calls[0][0]).toContain('maksimal 15 temuan');
		expect(state.model.mock.calls[0][0]).toContain('Sub-CPMK pertemuan');
		expect(draft.findings.map((f) => [f.quote, f.certainty, f.group])).toEqual([['haus', 'pasti', 'cap-noun'], ['auto', 'mungkin', 'cap-noun']]);
		// 60% of 6 + 100% of 4 by weight -> 76, never the model's own "5".
		expect(draft.suggestedScore).toBe(76);
		expect(draft.criterionScores).toEqual({ g: 60, w: 100 });
		expect(draft.verifyFailed).toBe(false);
		expect(draft.usedSubCpmk).toBe(true);
		expect(draft.usedLessonContext).toBe(true);
		// Findings never enter the draft-time feedback.
		expect(draft.feedback).toBe('Gut, aber Nomen groß.');
	});

	it('keeps pass-1 findings as "mungkin" without score when verification fails', async () => {
		state.model.mockResolvedValueOnce(reply(find)).mockResolvedValueOnce(reply('not json'));
		const result = await generateLiveDraft(input(), 'A1 JR241');
		if (!('draft' in result)) throw new Error('expected draft');
		expect(result.draft.verifyFailed).toBe(true);
		expect(result.draft.suggestedScore).toBeNull();
		expect(result.draft.criterionScores).toEqual({});
		expect(result.draft.findings).toHaveLength(3);
		expect(result.draft.findings.every((f) => f.certainty === 'mungkin')).toBe(true);
	});

	it('also falls back when the verify call throws', async () => {
		state.model.mockResolvedValueOnce(reply(find)).mockRejectedValueOnce(new Error('down'));
		const result = await generateLiveDraft(input(), 'A1 JR241');
		expect('draft' in result && result.draft.verifyFailed).toBe(true);
	});

	it('runs the existing single pass when AI_EVAL_TWO_PASS is "0"', async () => {
		process.env.AI_EVAL_TWO_PASS = '0';
		state.model.mockResolvedValueOnce(reply({ findings: [{ severity: 'minor', quote: 'haus', note: 'Nomen groß' }], summary: 'Gut.', recommendedScore: 80, rubricBreakdown: [{ criterionId: 'g', criterion: 'Grammatik', score: 80, note: 'a' }, { criterionId: 'w', criterion: 'Wortschatz', score: 80, note: 'b' }] }));
		const result = await generateLiveDraft(input(), 'A1 JR241');
		if (!('draft' in result)) throw new Error('expected draft');
		expect(state.model).toHaveBeenCalledTimes(1);
		expect(result.draft.suggestedScore).toBe(80);
		expect(result.draft.verifyFailed).toBe(false);
		expect(result.draft.findings[0].certainty).toBeUndefined();
	});

	it('returns 422 when pass 1 is unreadable', async () => {
		state.model.mockResolvedValueOnce(reply('garbage'));
		expect(await generateLiveDraft(input(), 'A1 JR241')).toMatchObject({ error: { status: 422 } });
	});
});
