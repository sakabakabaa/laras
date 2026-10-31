import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
	appendBlock,
	blankBuilder,
	copyBuilder,
	duplicateActivity,
	questionIds,
	removeBlock,
	rich,
	copyScheduledToBuilder,
} from '../src/lib/builder-document';
const mod = { exports: {} } as { exports: { normalize: (v: unknown) => any } };
runInNewContext(
	readFileSync(
		new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url),
		'utf8',
	),
	{ module: mod },
);
const normalize = mod.exports.normalize;
function fixture() {
	const d = blankBuilder('kelas', 'course000000001', 'meeting00000001');
	appendBlock(d, d.document.activities[0].id, 'question_group');
	appendBlock(d, d.document.activities[0].id, 'matching');
	appendBlock(d, d.document.activities[0].id, 'gap_passage');
	return d;
}
describe('shared builder identity and private envelope', () => {
	it('round trips incomplete drafts without changing question identity or alternatives', () => {
		const d = fixture(),
			id = Object.keys(d.document.questionsById).find(
				(id) => d.document.questionsById[id].kind === 'short_answer',
			)!;
		d.privateKeys.answersByQuestionId[id].accepted = ['muss', 'müsste'];
		expect(normalize(d)).toEqual(d);
	});
	it('duplicates an activity with all question, option, destination and private-key references remapped', () => {
		const d = fixture(),
			original = structuredClone(d),
			a = d.document.activities[0],
			match = a.blocks.find((b) => b.type === 'matching')!,
			qid = match.questionIds![0],
			destination = match.destinations![0].id;
		d.privateKeys.answersByQuestionId[qid].correctDestinationId = destination;
		const source = structuredClone(d.document.activities[0]);
		const copied = duplicateActivity(d, a.id),
			copy = d.document.activities.find((a) => a.id === copied)!;
		expect(d.document.activities[0]).toEqual(source);
		expect(copy.id).not.toBe(a.id);
		const copiedMatch = copy.blocks.find((b) => b.type === 'matching')!,
			newQ = copiedMatch.questionIds![0];
		expect(newQ).not.toBe(qid);
		expect(d.privateKeys.answersByQuestionId[newQ].correctDestinationId).toBe(
			copiedMatch.destinations![0].id,
		);
		expect(copiedMatch.destinations![0].id).not.toBe(destination);
		expect(normalize(d).document.activities).toHaveLength(2);
		expect(original.document.activities).toHaveLength(1);
	});
	it('copies a document to new context and mode while resetting the whole delivery policy', () => {
		const d = fixture();
		d.document.delivery.startsAt = '2030-01-01T00:00:00Z';
		const copy = copyBuilder(d, 'tugas', {
			courseId: 'course000000002',
			meetingId: '',
			sectionIds: [],
		});
		expect(copy.document.kind).toBe('tugas');
		expect(copy.document.delivery.kind).toBe('tugas');
		expect(copy.document.delivery.startsAt).toBe('');
		expect(copy.document.context.courseId).toBe('course000000002');
		expect(
			Object.keys(copy.document.questionsById).some(
				(id) => id in d.document.questionsById,
			),
		).toBe(false);
		expect(Object.keys(copy.privateKeys.answersByQuestionId)).toEqual(
			Object.keys(copy.document.questionsById),
		);
		expect(normalize(copy)).toEqual(copy);
	});
	it('keeps lesson translations and literal text intact while duplicating identity references', () => {
		const d = fixture(),
			a = d.document.activities[0];
		appendBlock(d, a.id, 'lesson');
		const lesson = a.blocks.at(-1)!;
		lesson.lesson!.goal = { de: 'Goal', id: 'Terjemahan tujuan' };
		const qid = Object.keys(d.document.questionsById)[0];
		d.document.questionsById[qid].prompt = rich(qid);
		const copied = copyBuilder(d, 'kelas', d.document.context);
		expect(copied.document.activities[0].blocks.at(-1)!.lesson!.goal.id).toBe(
			'Terjemahan tujuan',
		);
		expect(
			Object.values(copied.document.questionsById).some(
				(q) => q.prompt.content[0].content[0].text === qid,
			),
		).toBe(true);
		expect(() => normalize(copied)).not.toThrow();
	});
	it('copies source authoring content without student records or private source references', () => {
		const source: any = {
			class: { title: 'Source', instructions: 'Instructions' },
			session: { title: 'Meeting' },
			activities: [
				{
					title: 'Writing',
					minutes: 10,
					required: true,
					kind: 'assignment',
					content: 'Do this',
					worksheet: {
						items: [
							{
								id: 'original-question',
								type: 'text',
								prompt: 'Schreiben',
								translation: 'Tuliskan',
							},
						],
						sourceMaterialId: 'private-source',
						answerKey: {
							items: {
								'original-question': {
									mode: 'reference',
									modelAnswer: 'A model',
									rubric: 'Review clarity',
								},
							},
						},
					},
				},
			],
			attempts: [{ answers: 'STUDENT SENTINEL' }],
			report: [{ name: 'STUDENT NAME' }],
		};
		const copied = copyScheduledToBuilder(
			source,
			{
				courseId: 'course000000001',
				meetingId: 'meeting00000001',
				sectionIds: [],
			},
			'https://example.com',
		);
		expect(JSON.stringify(copied)).not.toContain('STUDENT SENTINEL');
		expect(JSON.stringify(copied)).not.toContain('STUDENT NAME');
		expect(JSON.stringify(copied)).not.toContain('private-source');
		expect(JSON.stringify(copied)).not.toContain('original-question');
		expect(JSON.stringify(copied)).toContain('Tuliskan');
		expect(() => normalize(copied)).not.toThrow();
	});
	it('removing a passage deletes its canonical gap questions and keys together', () => {
		const d = fixture(),
			a = d.document.activities[0],
			b = a.blocks.find((b) => b.type === 'gap_passage')!,
			ids = questionIds(b);
		removeBlock(d, a.id, b.id);
		for (const id of ids) {
			expect(d.document.questionsById[id]).toBeUndefined();
			expect(d.privateKeys.answersByQuestionId[id]).toBeUndefined();
		}
		expect(() => normalize(d)).not.toThrow();
	});
	it('rejects dangling references and duplicate response locations', () => {
		const d = fixture(),
			a = d.document.activities[0],
			group = a.blocks[0];
		group.questionIds!.push('missing');
		expect(() => normalize(d)).toThrow();
		group.questionIds!.pop();
		group.questionIds!.push(group.questionIds![0]);
		expect(() => normalize(d)).toThrow();
	});
	it('rejects cross-group destination keys and foreign option keys', () => {
		const d = fixture(),
			q = d.document.activities[0].blocks[0].questionIds![0];
		d.privateKeys.answersByQuestionId[q].correctOptionId = 'foreign-option';
		expect(() => normalize(d)).toThrow();
		delete d.privateKeys.answersByQuestionId[q].correctOptionId;
		const m = d.document.activities[0].blocks[1].questionIds![0];
		d.privateKeys.answersByQuestionId[m].correctDestinationId =
			'foreign-destination';
		expect(() => normalize(d)).toThrow();
	});
	it('strips unknown public/private fields instead of echoing an arbitrary payload', () => {
		const d: any = fixture();
		d.document.owner = 'fake';
		d.document.secret = 'private';
		d.privateKeys.answersByQuestionId[
			Object.keys(d.document.questionsById)[0]
		].extra = 'bad';
		const normalized = normalize(d);
		expect(normalized.document.owner).toBeUndefined();
		expect(normalized.document.secret).toBeUndefined();
		expect(
			Object.values(normalized.privateKeys.answersByQuestionId).some(
				(k: any) => k.extra,
			),
		).toBe(false);
	});
	it('rejects prototype keys, unsafe media URLs, oversized documents and unsupported schema versions', () => {
		const d: any = fixture();
		d.document.activities[0].id = 'constructor';
		expect(() => normalize(d)).toThrow();
		const clean = fixture();
		const a = clean.document.activities[0];
		appendBlock(clean, a.id, 'reference');
		a.blocks.at(-1)!.url = 'javascript:alert(1)';
		expect(() => normalize(clean)).toThrow();
		a.blocks.at(-1)!.url = 'https://example.com/resource';
		clean.document.instructions = rich('x'.repeat(20001));
		expect(() => normalize(clean)).toThrow();
		clean.document.instructions = rich('');
		(clean.document as any).schemaVersion = 2;
		expect(() => normalize(clean)).toThrow();
	});
});
