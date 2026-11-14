import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEXT = 'Ich habe haus und auto. Ich trinke wasser. Das Wetter ist gut.';
const state = vi.hoisted(() => ({
	row: null as any,
	model: vi.fn(),
	submission: {
		id: 's1', assignment: 'a1', content: 'Ich habe haus und auto. Ich trinke wasser. Das Wetter ist gut.',
		files: [], link: '', status: 'submitted', taskAnswers: {}, created: '2026-01-01', updated: '2026-10-01',
	} as any,
}));
vi.mock('@/lib/logger.server', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: vi.fn(async (collection: string) =>
			collection === 'courses' ? { code: 'A1 JR241' } : collection === 'ai_evaluations' ? structuredClone(state.row) : state.submission),
		listRecords: vi.fn(async () => ({ items: state.row ? [structuredClone(state.row)] : [] })),
		createRecord: vi.fn(async (_: string, payload: any) => { state.row = { id: 'e1', ...structuredClone(payload) }; return state.row; }),
		updateRecord: vi.fn(async (_: string, id: string, payload: any) => { state.row = { ...state.row, id, ...structuredClone(payload) }; return state.row; }),
	},
}));
vi.mock('@/lib/task-assist.server', () => ({ collectModelWithProvenance: state.model, imageFilenames: () => [], storedFileUrl: () => '' }));
vi.mock('@/lib/context-retrieval.server', () => ({
	cpmkOfSubCpmk: async () => '',
	retrieveContextBundle: async () => ({ result: 'insufficient', reason: 'none', sources: [], citations: [] }),
}));

import {
	AI_EVALUATION_PROMPT_VERSION,
	dryRunEvaluation,
	fallbackFromCandidates,
	parseFindPass,
	queueEvaluationDraft,
	twoPassEnabled,
	validateVerification,
} from '@/lib/ai-evaluation.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

const assignment = {
	id: 'a1', owner: 'f1', course: 'c1', title: 'Task', shape: 'writing', activityType: 'formal',
	instructions: 'Write', requirements: 'Text',
	taskConfig: { criteria: [{ id: 'k1', label: 'Tata bahasa', weight: 3 }, { id: 'k2', label: 'Isi', weight: 1 }] },
} as any;
const settle = async () => { for (let n = 0; n < 40; n++) await new Promise((r) => setTimeout(r, 0)); };
const reply = (obj: unknown, durationMs = 5) => ({ content: JSON.stringify(obj), model: 'gpt-6-luna', modelVersion: 'gpt-6-luna', durationMs });

const find = {
	findings: [
		{ severity: 'minor', quote: 'haus', group: 'Cap Noun', category: 'Orthography', subcategory: 'capitalization', note: 'Kata benda harus huruf besar', correction: 'Haus', confidence: 0.99 },
		{ severity: 'minor', quote: 'auto', group: 'cap-noun', category: 'Orthography', subcategory: 'capitalization', note: 'Kata benda harus huruf besar', correction: 'Auto' },
		{ severity: 'minor', quote: 'wasser', group: 'cap-noun', category: 'Orthography', subcategory: 'capitalization', note: 'Kata benda harus huruf besar', correction: 'Wasser' },
		{ severity: 'major', quote: 'Das Wetter ist gut', category: 'Syntax', subcategory: 'word_order', note: 'Salah (palsu)', correction: 'Das Wetter gut ist' },
	],
};
const verify = {
	verdicts: [
		{ id: 'f1', verdict: 'keep', reason: 'Jelas', certainty: 'pasti' },
		{ id: 'f2', verdict: 'keep', reason: 'Jelas', certainty: 'mungkin', correction: 'Auto!' },
		{ id: 'f3', verdict: 'keep', reason: 'Jelas', certainty: 'pasti' },
		{ id: 'f4', verdict: 'drop', reason: 'Kalimat sudah benar' },
	],
	rubricBreakdown: [
		{ criterionId: 'k1', criterion: 'Tata bahasa', score: 60, note: 'Kata benda kecil: "haus und auto"' },
		{ criterionId: 'k2', criterion: 'Isi', score: 100, note: 'Lengkap: "Das Wetter ist gut"' },
	],
	recommendedScore: 99,
	summary: 'Ringkasan',
};

beforeEach(() => {
	delete process.env.AI_EVAL_TWO_PASS;
	state.row = null;
	state.model.mockReset();
});

describe('two-pass evaluation', () => {
	it('flag: on by default, only "0" reverts to single pass', () => {
		expect(twoPassEnabled({})).toBe(true);
		expect(twoPassEnabled({ AI_EVAL_TWO_PASS: '1' })).toBe(true);
		expect(twoPassEnabled({ AI_EVAL_TWO_PASS: '0' })).toBe(false);
	});

	it('runs find then verify, stores kept findings, audits dropped ones and recomputes the score', async () => {
		state.model.mockResolvedValueOnce(reply(find, 7)).mockResolvedValueOnce(reply(verify, 11));
		await queueEvaluationDraft({ assignment, submissionId: 's1' });
		await settle();
		expect(state.model).toHaveBeenCalledTimes(2);
		const [findPrompt, , findSystem] = state.model.mock.calls[0];
		const [verifyPrompt, , verifySystem] = state.model.mock.calls[1];
		expect(findPrompt).toContain('TAHAP 1');
		expect(findPrompt).toContain('"group"');
		expect(findPrompt).toContain('maksimal 25');
		expect(findPrompt).not.toContain('"recommendedScore"');
		expect(findSystem).toContain('TAHAP 1 (CARI)');
		expect(findSystem).not.toContain('HILANGKAN temuan tersebut daripada menebak');
		expect(verifySystem).toContain('memverifikasi');
		expect(verifyPrompt).toContain(TEXT);
		expect(verifyPrompt).toContain('"id": "f4"');
		expect(verifyPrompt).toContain('[criterionId=k1]');

		const row = state.row;
		expect(row.status).toBe('ready');
		expect(row.promptVersion).toBe(AI_EVALUATION_PROMPT_VERSION);
		expect(row.promptVersion).toBe('german-gfl-feedback-v5-two-pass');
		expect(row.findings.map((f: any) => f.quote)).toEqual(['haus', 'auto', 'wasser']);
		expect(row.findings[0]).toMatchObject({ certainty: 'pasti', confidence: 0.9, group: 'cap-noun' });
		expect(row.findings[1]).toMatchObject({ certainty: 'mungkin', confidence: 0.6, correction: 'Auto!' });
		// weighted mean (60*3 + 100*1) / 4 = 70 — the model's own 99 is ignored
		expect(row.recommendedScore).toBe(70);
		expect(row.rubricBreakdown).toHaveLength(2);
		expect(row.generationDurationMs).toBe(18);
		expect(row.rawOutput).toContain('TAHAP 2');
		const snap = row.researchSnapshot;
		expect(snap.droppedFindings).toEqual([expect.objectContaining({ id: 'f4', reason: 'Kalimat sudah benar', by: 'verify' })]);
		expect(snap.passes.find.durationMs).toBe(7);
		expect(snap.passes.verify.durationMs).toBe(11);
		expect(snap.passes.verify).toMatchObject({ modelRecommendedScore: 99, recomputedScore: 70, ok: true });
		expect(snap.userPrompt).toBe(findPrompt);
	});

	it('falls back to pass-1 findings (mungkin, no score) when verification returns invalid JSON', async () => {
		state.model.mockResolvedValueOnce(reply(find)).mockResolvedValueOnce({ content: 'bukan json', model: 'm', modelVersion: 'm', durationMs: 2 });
		await queueEvaluationDraft({ assignment, submissionId: 's1' });
		await settle();
		const row = state.row;
		expect(row.status).toBe('ready');
		expect(row.findings).toHaveLength(4);
		expect(row.findings.every((f: any) => f.certainty === 'mungkin' && f.confidence === 0.6)).toBe(true);
		expect(row.recommendedScore).toBeNull();
		expect(row.rubricBreakdown).toEqual([]);
		expect(row.contextNote).toContain('Verifikasi AI gagal; skor tidak dihitung');
	});

	it('falls back when the verification call throws', async () => {
		state.model.mockResolvedValueOnce(reply(find)).mockRejectedValueOnce(new Error('down'));
		await queueEvaluationDraft({ assignment, submissionId: 's1' });
		await settle();
		expect(state.row.status).toBe('ready');
		expect(state.row.recommendedScore).toBeNull();
		expect(state.row.contextNote).toContain('Verifikasi AI gagal');
	});

	it('uses the existing failure path when pass 1 fails or is unreadable', async () => {
		state.model.mockRejectedValueOnce(new Error('down'));
		await queueEvaluationDraft({ assignment, submissionId: 's1' });
		await settle();
		expect(state.row.status).toBe('failed');
		expect(state.model).toHaveBeenCalledTimes(1);

		state.row = null;
		state.model.mockReset();
		state.model.mockResolvedValueOnce({ content: 'kosong', model: 'm', modelVersion: 'm', durationMs: 1 });
		await queueEvaluationDraft({ assignment, submissionId: 's1' });
		await settle();
		expect(state.row.status).toBe('failed');
		expect(state.model).toHaveBeenCalledTimes(1);
	});

	it('AI_EVAL_TWO_PASS=0 runs the v4 single pass', async () => {
		process.env.AI_EVAL_TWO_PASS = '0';
		state.model.mockResolvedValue(reply({ findings: [], summary: 'S', recommendedScore: 80 }));
		await queueEvaluationDraft({ assignment, submissionId: 's1' });
		await settle();
		expect(state.model).toHaveBeenCalledTimes(1);
		expect(state.row.promptVersion).toBe('german-gfl-feedback-v4-ocr');
	});

	it('dry run returns the draft and writes nothing', async () => {
		state.model.mockResolvedValueOnce(reply(find)).mockResolvedValueOnce(reply(verify));
		const out = await dryRunEvaluation({ assignment, submissionId: 's1' });
		expect(out.status).toBe('ready');
		expect((out.findings as any[]).map((f) => f.quote)).toEqual(['haus', 'auto', 'wasser']);
		expect(out.recommendedScore).toBe(70);
		expect(pocketbaseAdmin.updateRecord).not.toHaveBeenCalled();
		expect(pocketbaseAdmin.createRecord).not.toHaveBeenCalled();
	});
});

describe('pass parsing and validation', () => {
	const crit = [{ id: 'k1', label: 'Tata bahasa', weight: 1 }];
	const ocr = { ocrDerived: false, hasImages: false };

	it('parseFindPass accepts up to 25 candidates and keeps group keys', () => {
		const many = { findings: Array.from({ length: 30 }, (_, i) => ({ severity: 'minor', quote: '', note: `n${i}`, group: 'g' })) };
		const out = parseFindPass(JSON.stringify(many), TEXT, crit, ocr)!;
		expect(out).toHaveLength(25);
		expect(out[0].group).toBe('g');
		expect(parseFindPass('tidak ada json', TEXT, crit, ocr)).toBeNull();
	});

	it('validateVerification: missing verdict keeps as mungkin, missing verdict list is invalid', () => {
		const candidates = parseFindPass(JSON.stringify(find), TEXT, crit, ocr)!;
		const out = validateVerification(JSON.stringify({ verdicts: [{ id: 'f1', verdict: 'drop', reason: 'dup' }], rubricBreakdown: [], summary: '' }), candidates, TEXT, crit, ocr)!;
		expect(out.dropped.map((d) => d.id)).toEqual(['f1']);
		expect(out.findings).toHaveLength(3);
		expect(out.findings.every((f) => f.certainty === 'mungkin')).toBe(true);
		expect(validateVerification('{"findings":[]}', candidates, TEXT, crit, ocr)).toBeNull();
	});

	it('validateVerification re-applies OCR guards to kept findings', () => {
		const text = 'Am ⟦abends⟧ isst er ein Brot.';
		const cands = parseFindPass(JSON.stringify({ findings: [{ severity: 'minor', quote: '⟦abends⟧', category: 'Orthography', subcategory: 'spelling', note: 'x' }] }), text, crit, { ocrDerived: false, hasImages: true })!;
		expect(cands).toHaveLength(1);
		const out = validateVerification(JSON.stringify({ verdicts: [{ id: 'f1', verdict: 'keep', certainty: 'pasti' }], rubricBreakdown: [], summary: '' }), cands, text, crit, { ocrDerived: true, hasImages: true })!;
		expect(out.findings).toHaveLength(0);
		expect(out.dropped[0]).toMatchObject({ id: 'f1', by: 'ocr-guard' });
	});

	it('fallbackFromCandidates marks everything mungkin', () => {
		const out = fallbackFromCandidates([{ severity: 'minor', quote: '', note: 'n', evidence: '', certainty: 'pasti', confidence: 0.9 }]);
		expect(out[0]).toMatchObject({ certainty: 'mungkin', confidence: 0.6 });
	});
});
