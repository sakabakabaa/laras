import { describe, expect, it } from 'vitest';
import { aiScoreNotice, isCorrectionTask, scoreSetupProblem } from '@/lib/evaluation-setup';
import { aiStateLabel, summarizeEvaluation } from '@/lib/evaluation-readiness';
import { cefrLevelForCourse } from '@/lib/cefr-level';

const rubric = [{ id: 'c1', label: 'Inhalt', weight: 1 }];
const tk = (extra: Record<string, unknown> = {}, title = 'Textkorrektur') => ({
	shape: 'writing',
	title,
	instructions: '',
	taskConfig: { prompt: 'Korrigieren Sie', criteria: rubric, ...extra },
});

describe('setup check', () => {
	it('detects a correction task without source text (flag or heuristic)', () => {
		expect(isCorrectionTask(tk())).toBe(true);
		expect(isCorrectionTask(tk({ requiresSourceText: true }, 'Aufgabe 3'))).toBe(true);
		expect(isCorrectionTask(tk({ prompt: 'Schreiben Sie' }, 'E-Mail'))).toBe(false);
		expect(scoreSetupProblem(tk())).toContain('teks sumber');
		expect(scoreSetupProblem(tk({ sourceText: 'Ich gehe zu Schule.' }))).toBe('');
	});

	it('flags a missing weighted rubric', () => {
		expect(scoreSetupProblem({ shape: 'writing', title: 'E-Mail', taskConfig: { prompt: 'x', criteria: [] } })).toContain('rubrik');
	});

	it('shows a notice instead of 0', () => {
		expect(aiScoreNotice({ assignment: tk(), recommendedScore: null })).toMatchObject({ kind: 'setup' });
		expect(aiScoreNotice({ assignment: tk(), recommendedScore: 0, summary: 'Teks sumber tidak ada' })).toMatchObject({ kind: 'setup' });
		const plain = { shape: 'writing', title: 'E-Mail', taskConfig: { prompt: 'x', criteria: rubric } };
		expect(aiScoreNotice({ assignment: plain, recommendedScore: 0 })).toEqual({ kind: 'zero' });
		expect(aiScoreNotice({ assignment: plain, recommendedScore: 0, reviewed: true })).toBeNull();
		expect(aiScoreNotice({ assignment: plain, recommendedScore: 70 })).toBeNull();
	});
});

describe('bulk publish readiness', () => {
	const assignment = { shape: 'writing', title: 'E-Mail', taskConfig: { prompt: 'x', criteria: rubric } };
	const submitted = { status: 'submitted', transcriptStatus: '' };
	const row = {
		status: 'ready',
		findings: [],
		rubricBreakdown: [{ criterionId: 'c1', criterion: 'Inhalt', score: 80, note: '' }],
		recommendedScore: 80,
		summary: 's',
	};

	it('is ready when current, blocked when stale', () => {
		expect(summarizeEvaluation({ assignment, submission: submitted, row }).ready).toBe(true);
		const stale = summarizeEvaluation({ assignment, submission: submitted, row, stale: true });
		expect(stale).toMatchObject({ ready: false, stale: true });
		expect(stale.blocker).toContain('Teks berubah');
		expect(aiStateLabel(stale)).toBe('AI usang');
	});

	it('is blocked when the AI score was not computed or is a bare 0', () => {
		const noScore = summarizeEvaluation({ assignment: tk(), submission: submitted, row: { ...row, recommendedScore: null } });
		expect(noScore.ready).toBe(false);
		expect(noScore.blocker).toContain('Skor AI tidak dihitung');
		const zero = summarizeEvaluation({ assignment, submission: submitted, row: { ...row, recommendedScore: 0, rubricBreakdown: [{ criterionId: 'c1', criterion: 'Inhalt', score: 0, note: '' }] } });
		expect(zero.ready).toBe(false);
		expect(zero.blocker).toContain('Skor AI 0');
	});
});

describe('cefrLevelForCourse', () => {
	it('uses the code, then the title', () => {
		expect(cefrLevelForCourse({ code: 'A2 JR241', title: 'X' })).toBe('A2');
		expect(cefrLevelForCourse({ code: 'JR241', title: 'VERSTEHEN A1' })).toBe('A1');
		expect(cefrLevelForCourse({ code: 'JR242', title: 'Schreiben' })).toBeNull();
		expect(cefrLevelForCourse(null)).toBeNull();
	});
});
