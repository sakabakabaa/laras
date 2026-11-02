import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { appendBlock, blankBuilder, builderIssues, rich, type BuilderEnvelope } from '../src/lib/builder-document';
import { bookPagePlan, compileBookPage } from '../src/lib/builder-import-plan.server';

const delivery = { exports: {} as { publishIssues: (document: BuilderEnvelope['document'], keys: BuilderEnvelope['privateKeys']['answersByQuestionId'], now: number) => string[] } };
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/builder-delivery.js', import.meta.url), 'utf8'), { module: delivery, __hooks: '', require: () => ({}) });
const domain = { exports: {} as { normalize: (value: unknown) => BuilderEnvelope } };
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'), { module: domain });
const now = Date.parse('2030-01-01T10:00:00Z');
const date = (offset: number) => new Date(now + offset).toISOString();

function messages(envelope: BuilderEnvelope) {
	return [builderIssues(envelope, now).map(issue => issue.message), delivery.exports.publishIssues(envelope.document, envelope.privateKeys.answersByQuestionId, now)];
}

describe('builder publish validation parity', () => {
	it('rejects class end at the exact deadline on client and server', () => {
		const draft = blankBuilder('kelas', 'course000000001', 'meeting00000001');
		draft.document.delivery = { ...draft.document.delivery, startsAt: date(-3600000), checkInClosesAt: date(-1800000), endsAt: date(0) };
		for (const issues of messages(draft)) expect(issues).toContain('Jadwal kelas sudah berakhir.');
		draft.document.delivery.endsAt = date(1);
		for (const issues of messages(draft)) expect(issues).not.toContain('Jadwal kelas sudah berakhir.');
	});

	it.each([false, true])('uses the effective assignment cutoff when allowLate=%s', allowLate => {
		const draft = blankBuilder('tugas', 'course000000001');
		draft.document.delivery = { ...draft.document.delivery, dueAt: date(-1), hardCloseAt: date(3600000), allowLate };
		for (const issues of messages(draft)) expect(issues.includes('Jadwal tugas sudah berakhir.')).toBe(!allowLate);
		draft.document.delivery.hardCloseAt = date(0);
		for (const issues of messages(draft)) expect(issues).toContain('Jadwal tugas sudah berakhir.');
	});

	it('round trips private AI review and blocks publishing until confirmed', () => {
		const draft = blankBuilder('tugas', 'course000000001');
		appendBlock(draft, draft.document.activities[0].id, 'question_group');
		const questionId = Object.keys(draft.document.questionsById)[0];
		draft.document.questionsById[questionId].prompt = rich('Question');
		draft.privateKeys.answersByQuestionId[questionId].review = { source: 'inferred', confirmed: false };
		expect(domain.exports.normalize(draft)).toEqual(draft);
		expect(JSON.stringify(draft.document)).not.toContain('confirmed');
		for (const issues of messages(draft)) expect(issues).toContain('Tinjau kunci dari sumber AI sebelum menerbitkan.');
		draft.privateKeys.answersByQuestionId[questionId].review!.confirmed = true;
		for (const issues of messages(draft)) expect(issues).not.toContain('Tinjau kunci dari sumber AI sebelum menerbitkan.');
		const invalid = structuredClone(draft) as any;
		invalid.privateKeys.answersByQuestionId[questionId].review.confirmed = 'yes';
		expect(() => domain.exports.normalize(invalid)).toThrow();
	});

	it.each(['printed', 'inferred', 'unknown'] as const)('persists %s evidence from AI import in private keys only', async source => {
		const plan = bookPagePlan.parse({ title: 'Import', instructions: '', warnings: [], activities: [{ title: 'Exercise', minutes: 10, blocks: [{ type: 'short_answer', text: '', items: [{ prompt: 'Question', accepted: ['answer'], keyEvidence: source }] }] }] });
		const { envelope } = await compileBookPage(plan, { kind: 'tugas', context: { courseId: 'course000000001', meetingId: '', sectionIds: [] } }, async () => { throw new Error('Unexpected crop'); });
		const key = Object.values(envelope.privateKeys.answersByQuestionId)[0];
		expect(key.review).toEqual({ source, confirmed: source === 'printed' });
		expect(JSON.stringify(envelope.document)).not.toContain('confirmed');
		expect(domain.exports.normalize(envelope)).toEqual(envelope);
	});
});
