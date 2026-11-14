import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
	approveAllPending, approveGroup, composeApprovedFeedback, decide, decisionsFromStored, pendingNotice,
	rejectGroup, reviewedFindings, reviewFindingsPayload, reviewLookup, withDecisions,
} from '@/lib/scheduled-finding-review';
import {scheduledAttemptMarks, type ScheduledAiFinding} from '@/lib/scheduled-answer-marks';
import {buildAssessmentPayload, hydrateGradeDraft, emptyGradeDraft} from '@/lib/scheduled-review';

const hook = {exports: {}} as {exports: Record<string, (...args: any[]) => any>};
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/scheduled-assessment.js', import.meta.url), 'utf8'), {module: hook});

const answer = 'ich habe haus und auto';
const findings: ScheduledAiFinding[] = [
	{quote: 'haus', note: 'Nomen groß', correction: 'Haus', severity: 'major', group: 'cap-noun', certainty: 'pasti', itemId: 'q1', answerStart: 9, answerEnd: 13},
	{quote: 'auto', note: 'Nomen groß', correction: 'Auto', severity: 'minor', group: 'cap-noun', certainty: 'mungkin', itemId: 'q1', answerStart: 18, answerEnd: 22},
	{quote: '', note: 'Terlalu singkat', severity: 'minor'},
];

describe('scheduled finding review state', () => {
	it('starts every finding pending and warns without blocking', () => {
		const reviewed = reviewedFindings(findings, undefined);
		expect(reviewed.map((f) => [f.id, f.status])).toEqual([['ai-0', 'pending'], ['ai-1', 'pending'], ['ai-2', 'pending']]);
		expect(pendingNotice(reviewed)).toBe('3 temuan AI belum ditinjau');
	});

	it('approves, rejects with an optional reason, and resets to pending', () => {
		let d = decide(undefined, {id: 'ai-0', quote: 'haus'}, 'approved');
		d = decide(d, {id: 'ai-1', quote: 'auto'}, 'rejected', '  bukan kesalahan ');
		expect(d).toEqual([{id: 'ai-0', quote: 'haus', status: 'approved'}, {id: 'ai-1', quote: 'auto', status: 'rejected', rejectReason: 'bukan kesalahan'}]);
		expect(decide(d, {id: 'ai-0', quote: 'haus'}, 'pending')).toHaveLength(1);
		expect(pendingNotice(reviewedFindings(findings, d))).toBe('1 temuan AI belum ditinjau');
		expect(pendingNotice(reviewedFindings(findings, approveAllPending(reviewedFindings(findings, d), d)))).toBe('');
	});

	it('approves and rejects a whole group, and ignores a decision about different text', () => {
		const reviewed = reviewedFindings(findings, undefined);
		const approved = approveGroup(reviewed, undefined, ['ai-0', 'ai-1']);
		expect(approved.map((x) => x.status)).toEqual(['approved', 'approved']);
		const rejected = rejectGroup(reviewedFindings(findings, approved), approved, ['ai-0', 'ai-1']);
		expect(rejected.map((x) => x.status)).toEqual(['rejected', 'rejected']);
		const regenerated = [{...findings[0], quote: 'Haus und'}];
		expect(reviewedFindings(regenerated, approved)[0].status).toBe('pending');
	});

	it('builds student feedback from the summary and APPROVED findings only', () => {
		const d = [
			{id: 'ai-0', quote: 'haus', status: 'approved' as const},
			{id: 'ai-1', quote: 'auto', status: 'rejected' as const},
		];
		const text = composeApprovedFeedback('Ringkasan.', reviewedFindings(findings, d));
		expect(text).toBe('Ringkasan.\n\n• “haus” → Haus: Nomen groß');
		expect(text).not.toContain('Terlalu singkat');
		expect(text).not.toContain('auto');
		expect(composeApprovedFeedback('Ringkasan.', reviewedFindings(findings, undefined))).toBe('Ringkasan.');
	});
});

describe('scheduled finding review persistence', () => {
	const d = [{id: 'ai-0', quote: 'haus', status: 'approved' as const}, {id: 'ai-1', quote: 'auto', status: 'rejected' as const, rejectReason: 'ok'}];

	it('round-trips through the assessment payload and hydration', () => {
		const payload = buildAssessmentPayload({attemptId: 'a', assessmentRevision: 0, attemptRevision: 1, settingsRevision: 1, status: 'draft', points: null, criterionScores: {}, feedback: 'x', reviewFindings: d});
		expect(payload.reviewFindings).toEqual(d);
		const hydrated = hydrateGradeDraft(emptyGradeDraft, null, 'a', {feedback: 'x', points: null, criterionScores: {}, reviewFindings: payload.reviewFindings}).draft;
		expect(hydrated.reviewFindings).toEqual(d);
		expect(hydrateGradeDraft(emptyGradeDraft, null, 'a', {feedback: '', points: null}).draft.reviewFindings).toBeUndefined();
		expect(withDecisions({feedback: '', points: '', criterionScores: {}, reviewFindings: d}, []).reviewFindings).toBeUndefined();
	});

	it('tolerates garbage stored values and keeps a full review snapshot shape', () => {
		expect(decisionsFromStored('not json')).toEqual([]);
		expect(decisionsFromStored([{id: 'x'}, {id: 'ai-1', status: 'pending'}, ...d])).toEqual(d);
		const snapshot = reviewFindingsPayload(reviewedFindings(findings, d));
		expect(snapshot[1]).toMatchObject({id: 'ai-1', status: 'rejected', rejectReason: 'ok', group: 'cap-noun', certainty: 'mungkin', source: 'ai'});
	});

	it('is validated server-side (shape, ids, size)', () => {
		expect(hook.exports.validateReviewFindings(d)).toEqual(d);
		expect(hook.exports.validateReviewFindings(undefined)).toEqual([]);
		expect(() => hook.exports.validateReviewFindings('x')).toThrow();
		expect(() => hook.exports.validateReviewFindings([{id: '../x', status: 'approved'}])).toThrow();
		expect(() => hook.exports.validateReviewFindings([{id: 'ai-1', status: 'pending'}])).toThrow();
		expect(() => hook.exports.validateReviewFindings([{id: 'ai-1', status: 'approved'}, {id: 'ai-1', status: 'rejected'}])).toThrow();
		expect(() => hook.exports.validateReviewFindings([{id: 'ai-1', status: 'rejected', rejectReason: 'x'.repeat(601)}])).toThrow();
		expect(() => hook.exports.validateReviewFindings(Array.from({length: 41}, (_, i) => ({id: `ai-${i}`, status: 'approved'})))).toThrow();
	});
});

describe('marks carry review state', () => {
	it('exposes status, certainty and rejection on the marks of an answer', () => {
		const record = {attempt: 'at', status: 'ready', attemptRevision: 1, draft: {findings, answers: [{itemId: 'q1', answerIndex: 0, length: answer.length}], usedSubCpmk: true, usedLessonContext: false}};
		const d = [{id: 'ai-1', quote: 'auto', status: 'rejected' as const, rejectReason: 'ok'}];
		const marks = scheduledAttemptMarks(record, {id: 'at', revision: 1}, [{id: 'q1', answer}], reviewLookup(d));
		if (marks.status !== 'ready') throw new Error('expected ready');
		const [first, second] = marks.cards.q1.findings;
		expect(first).toMatchObject({reviewId: 'ai-0', reviewStatus: 'pending', certainty: 'pasti', group: 'cap-noun'});
		expect(second).toMatchObject({reviewId: 'ai-1', reviewStatus: 'rejected', reviewReason: 'ok', certainty: 'mungkin'});
		expect(marks.meta).toMatchObject({usedSubCpmk: true, usedLessonContext: false});
	});
});
