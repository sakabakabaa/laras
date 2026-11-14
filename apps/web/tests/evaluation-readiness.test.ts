import { describe, expect, it } from 'vitest';
import { aiStateLabel, summarizeEvaluation, type EvaluationRowLike } from '@/lib/evaluation-readiness';

const assignment = {
	shape: 'writing',
	taskConfig: {
		prompt: 'Schreiben Sie eine E-Mail an Ihre Freundin.',
		criteria: [
			{ id: 'c1', label: 'Inhalt', weight: 2 },
			{ id: 'c2', label: 'Grammatik', weight: 1 },
		],
	},
};
const submitted = { status: 'submitted', transcriptStatus: '' };

function aiRow(extra: Partial<EvaluationRowLike> = {}): EvaluationRowLike {
	return {
		status: 'ready',
		findings: [{ severity: 'minor', quote: 'Hallo', note: 'Anrede prüfen', evidence: '', criterion: 'Grammatik' }],
		rubricBreakdown: [
			{ criterionId: 'c1', criterion: 'Inhalt', score: 90, note: '' },
			{ criterionId: 'c2', criterion: 'Grammatik', score: 100, note: '' },
		],
		recommendedScore: 92,
		summary: 'Gute E-Mail.',
		...extra,
	};
}

describe('summarizeEvaluation', () => {
	it('reports no draft, pending and failed runs as not ready', () => {
		expect(summarizeEvaluation({ assignment, submission: submitted, row: null })).toMatchObject({ state: 'none', ready: false });
		expect(summarizeEvaluation({ assignment, submission: submitted, row: { status: 'pending' } })).toMatchObject({ state: 'pending', ready: false });
		expect(summarizeEvaluation({ assignment, submission: submitted, row: { status: 'failed' } })).toMatchObject({ state: 'failed', ready: false });
	});

	it('makes a complete AI draft ready and approves its pending findings for the batch', () => {
		const summary = summarizeEvaluation({ assignment, submission: submitted, row: aiRow() });
		expect(summary).toMatchObject({ state: 'ai', ready: true, score: 93, pendingFindings: 1 });
		expect(summary.publish?.findings.every((f) => f.status === 'approved')).toBe(true);
		expect(summary.publish).toMatchObject({ criterionScores: { c1: 90, c2: 100 }, finalScore: null, scoreAdjusted: false, note: 'Gute E-Mail.' });
	});

	it('is not ready while a weighted criterion has no score', () => {
		const row = aiRow({ rubricBreakdown: [{ criterionId: 'c1', criterion: 'Inhalt', score: 90, note: '' }] });
		const summary = summarizeEvaluation({ assignment, submission: submitted, row });
		expect(summary.ready).toBe(false);
		expect(summary.blocker).toContain('kriteria');
		expect(summary.score).toBe(92);
	});

	it('never bulk-publishes a lecturer draft that still has pending AI findings', () => {
		const findings = [{ id: 'ai-0', source: 'ai', severity: 'minor', quote: '', note: 'x', evidence: '', status: 'pending' }];
		const row = aiRow({ reviewedAt: '2026-11-01', reviewFindings: findings, reviewCriterionScores: { c1: 80, c2: 70 } });
		expect(summarizeEvaluation({ assignment, submission: submitted, row })).toMatchObject({ state: 'lecturer', ready: false });
		const reviewed = aiRow({
			reviewedAt: '2026-11-01',
			reviewFindings: [{ ...findings[0], status: 'approved' }],
			reviewCriterionScores: { c1: 80, c2: 70 },
			reviewDraft: { version: 1, finalScore: 75, note: 'Eigene Notiz' },
		});
		const summary = summarizeEvaluation({ assignment, submission: submitted, row: reviewed });
		expect(summary).toMatchObject({ state: 'lecturer', ready: true, score: 75 });
		expect(summary.publish).toMatchObject({ finalScore: 75, scoreAdjusted: true, note: 'Eigene Notiz' });
	});

	it('only offers final, ungraded submissions with a ready transcript', () => {
		expect(summarizeEvaluation({ assignment, submission: { status: 'draft' }, row: aiRow() }).ready).toBe(false);
		expect(summarizeEvaluation({ assignment, submission: { status: 'graded' }, row: aiRow({ publishedAt: 'x', finalScore: 88 }) })).toMatchObject({ state: 'published', score: 88 });
		const speaking = { ...assignment, shape: 'speaking' };
		expect(summarizeEvaluation({ assignment: speaking, submission: { status: 'submitted', transcriptStatus: 'processing' }, row: aiRow() }).ready).toBe(false);
	});

	it('requires an explicit lecturer score when the task has no weighted rubric', () => {
		const noRubric = { shape: 'writing', taskConfig: { prompt: 'Schreiben Sie etwas.', criteria: [] } };
		expect(summarizeEvaluation({ assignment: noRubric, submission: submitted, row: aiRow() }).ready).toBe(false);
	});
});

describe('aiStateLabel', () => {
	it('labels each list state without reusing "Draf" for student work', () => {
		expect(aiStateLabel({ state: 'ai', score: 94 })).toBe('AI 94');
		expect(aiStateLabel({ state: 'failed', score: null })).toBe('AI gagal');
		expect(aiStateLabel({ state: 'lecturer', score: 80 })).toBe('Draf dosen');
		expect(aiStateLabel({ state: 'none', score: null })).toBe('');
		expect(aiStateLabel(undefined)).toBe('');
	});
});
