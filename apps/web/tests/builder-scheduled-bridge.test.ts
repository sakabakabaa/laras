import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
	appendBlock,
	appendQuestion,
	blankBuilder,
	builderToScheduledPlan,
	copyScheduledToBuilder,
	plain,
	rich,
	scheduledStateToBuilder,
} from '../src/lib/builder-document';
import { cardMatchingTargets } from '../src/lib/card-matching';
import { worksheetBlocks } from '../src/lib/worksheet-layout';
import type { ScheduledActivity, ScheduledClassState } from '../src/lib/scheduled-classes';

const scheduledDomainMod = { exports: {} } as {
	exports: {
		validatePlan: (body: unknown, nowMs: number, publish?: boolean) => any;
	};
};
runInNewContext(
	readFileSync(new URL('../../pocketbase/pb_hooks/scheduled-classes-domain.js', import.meta.url), 'utf8'),
	{ module: scheduledDomainMod },
);

const builderDomainMod = { exports: {} } as {
	exports: {
		normalize: (value: unknown) => any;
	};
};
runInNewContext(
	readFileSync(new URL('../../pocketbase/pb_hooks/builder-domain.js', import.meta.url), 'utf8'),
	{ module: builderDomainMod },
);

const academicMod = { exports: {} } as {
	exports: {
		studentSources: (app: any, sources: any[], course: string, worksheet?: any) => any[];
	};
};
runInNewContext(
	readFileSync(new URL('../../pocketbase/pb_hooks/scheduled-class-academic.js', import.meta.url), 'utf8'),
	{ exports: academicMod.exports, BadRequestError: Error },
);

describe('Builder <-> Scheduled Classes unified bridge', () => {
	it('compiles a full Visual Builder kelas envelope into a domain-valid ScheduledClassPlan and round-trips losslessly', () => {
		const envelope = blankBuilder('kelas', '30152xyjuzxgpq4', 'sess00000000001', ['tataw8jvs6wbdbh']);
		envelope.document.title = 'Beim Arzt — Pertemuan 2';
		envelope.document.instructions = rich('Kerjakan berurutan selama kelas berlangsung.');
		envelope.document.delivery = {
			...envelope.document.delivery,
			startsAt: '2026-11-19T06:00:00.000Z',
			endsAt: '2026-11-19T09:30:00.000Z',
			checkInClosesAt: '2026-11-19T06:30:00.000Z',
			lateAfterMinutes: 10,
		};

		// Activity 1: Matching with Berkas images + Gap passage
		const act1 = envelope.document.activities[0];
		act1.title = 'Latihan 1 · Bildzuordnung & Lückentext';
		act1.plannedMinutes = 40;
		act1.blocks = [];
		delete act1.layout;

		const imgBlockId = appendBlock(envelope, act1.id, 'image');
		const imgBlock = act1.blocks.find((b) => b.id === imgBlockId)!;
		imgBlock.images = [
			{
				id: 'img_dest_a',
				asset: {
					fileId: 'mat000000000001',
					filename: 'bild_a.jpg',
					version: 1,
					name: 'Beim Arzt · Bild A',
				},
				alt: 'Beim Arzt · Bild A',
				caption: 'Beim Arzt · Bild A',
			},
			{
				id: 'img_dest_b',
				asset: {
					fileId: 'mat000000000002',
					filename: 'bild_b.jpg',
					version: 1,
					name: 'Beim Arzt · Bild B',
				},
				alt: 'Beim Arzt · Bild B',
				caption: 'Beim Arzt · Bild B',
			},
		];

		const matchBlockId = appendBlock(envelope, act1.id, 'matching');
		const matchBlock = act1.blocks.find((b) => b.id === matchBlockId)!;
		matchBlock.destinations = [
			{ id: 'dest_a', label: 'A', title: 'Wartezimmer' },
			{ id: 'dest_b', label: 'B', title: 'Sprechzimmer' },
		];
		const m1 = matchBlock.questionIds![0];
		const m2 = appendQuestion(envelope, 'matching');
		matchBlock.questionIds!.push(m2);
		envelope.document.questionsById[m1].prompt = rich('Das Wartezimmer ist voll.');
		envelope.document.questionsById[m2].prompt = rich('Die Ärztin untersucht den Patienten.');
		envelope.privateKeys.answersByQuestionId[m1] = {
			strategy: 'matching',
			correctDestinationId: 'dest_a',
		};
		envelope.privateKeys.answersByQuestionId[m2] = {
			strategy: 'matching',
			correctDestinationId: 'dest_b',
		};

		const gapBlockId = appendBlock(envelope, act1.id, 'gap_passage');
		const gapBlock = act1.blocks.find((b) => b.id === gapBlockId)!;
		const g1 = gapBlock.sections![0].segments.find((s) => s.type === 'gap')!.questionId;
		const g2 = appendQuestion(envelope, 'short_answer');
		gapBlock.sections = [
			{
				id: 'sec_1',
				segments: [
					{ type: 'text', text: 'Ich ' },
					{ type: 'gap', questionId: g1 },
					{ type: 'text', text: ' heute im Bett bleiben und ' },
					{ type: 'gap', questionId: g2 },
					{ type: 'text', text: ' nicht arbeiten.' },
				],
			},
		];
		envelope.privateKeys.answersByQuestionId[g1] = {
			strategy: 'exact_text',
			accepted: ['muss'],
			comparison: { ignoreCase: true, ignorePunctuation: true },
		};
		envelope.privateKeys.answersByQuestionId[g2] = {
			strategy: 'exact_text',
			accepted: ['kann'],
			comparison: { ignoreCase: true, ignorePunctuation: true },
		};

		// Activity 2: Writing (E-Mail) with rubric
		envelope.document.activities.push({
			id: 'act_writing_2',
			title: 'Latihan 2 · E-Mail an die Chefin',
			plannedMinutes: 45,
			required: true,
			blocks: [],
		});
		const act2 = envelope.document.activities[1];
		const writeBlockId = appendBlock(envelope, act2.id, 'writing');
		const writeBlock = act2.blocks.find((b) => b.id === writeBlockId)!;
		const wId = writeBlock.questionId!;
		envelope.document.questionsById[wId] = {
			id: wId,
			kind: 'long_writing',
			prompt: rich(
				'Sie sind krank und können heute nicht ins Büro kommen. Schreiben Sie an Ihre Chefin, Frau Meier.',
			),
			points: 10,
			required: true,
			rubric: {
				criteria: [
					{ id: 'rub_1', label: 'Inhalt & Umfang', maxPoints: 5 },
					{ id: 'rub_2', label: 'Sprache & Register', maxPoints: 5 },
				],
			},
		};
		envelope.privateKeys.answersByQuestionId[wId] = {
			strategy: 'rubric',
			modelAnswer: rich('Liebe Frau Meier, leider bin ich heute krank...'),
			privateGuidance: rich('Alle 3 Leitpunkte erwähnt.'),
		};

		const plan = builderToScheduledPlan(envelope);
		expect(plan.section).toBe('tataw8jvs6wbdbh');
		expect(plan.activities).toHaveLength(2);
		expect(plan.activities[0].materialIds).toEqual(['mat000000000001', 'mat000000000002']);

		// Verify domain validation accepts the generated ScheduledClassPlan
		const validated = scheduledDomainMod.exports.validatePlan(
			plan,
			Date.parse('2026-11-18T02:00:00.000Z'),
			true,
		);
		expect(validated.activities).toHaveLength(2);
		expect(validated.activities[0].snapshot.worksheet.blocks).toHaveLength(2);
		expect(validated.activities[0].snapshot.worksheet.blocks[0]).toMatchObject({
			type: 'match',
			destinations: [
				{ id: 'A', label: 'A', title: { de: 'Wartezimmer' }, image: 'mat000000000001' },
				{ id: 'B', label: 'B', title: { de: 'Sprechzimmer' }, image: 'mat000000000002' },
			],
		});
		expect(validated.activities[0].snapshot.worksheet.answerKey.items[m1]).toEqual({
			mode: 'exact',
			accepted: ['A'],
			points: 1,
		});
		expect(validated.activities[1].snapshot.worksheet.blocks[0]).toMatchObject({
			type: 'writing',
			itemId: wId,
			responseLength: 'extended',
			rows: 10,
		});
		expect(plan.gradingSettings).toEqual([
			{
				activityIndex: 1,
				mode: 'rubric',
				maxPoints: 10,
				criteria: [
					{ id: 'rub_1', label: 'Inhalt & Umfang', maxPoints: 5 },
					{ id: 'rub_2', label: 'Sprache & Register', maxPoints: 5 },
				],
			},
		]);

		// Simulate hydrating back from ScheduledClassState into BuilderEnvelope
		const state: ScheduledClassState = {
			serverNow: '2026-11-18T02:00:00.000Z',
			owner: true,
			session: {
				id: 'sess00000000001',
				course: '30152xyjuzxgpq4',
				title: 'Pertemuan 2',
				section: 'tataw8jvs6wbdbh',
			},
			class: {
				id: 'sclass000000001',
				title: validated.title,
				instructions: validated.instructions,
				section: plan.section,
				startsAt: validated.startsAt,
				endsAt: validated.endsAt,
				joinUntil: validated.joinUntil,
				lateAfterMin: validated.lateAfterMin,
				revision: 1,
				releaseResults: false,
				status: 'scheduled',
				phase: 'scheduled',
			},
			activities: validated.activities.map((a: any, idx: number) => ({
				...a,
				...a.snapshot,
				id: `sact0000000000${idx + 1}`,
				startsAt: validated.startsAt,
				endsAt: validated.endsAt,
				sources:
					idx === 0
						? [
								{
									id: 'mat000000000001',
									title: 'Beim Arzt · Bild A',
									version: 1,
									filename: 'bild_a.jpg',
									url: '/api/files/file_library/mat000000000001/bild_a.jpg',
									available: true,
								},
								{
									id: 'mat000000000002',
									title: 'Beim Arzt · Bild B',
									version: 1,
									filename: 'bild_b.jpg',
									url: '/api/files/file_library/mat000000000002/bild_b.jpg',
									available: true,
								},
							]
						: [],
			})),
			attempts: [],
			gradingSettings: [
				{
					id: 'gset00000000001',
					activity: 'sact00000000002',
					revision: 1,
					mode: 'rubric',
					maxPoints: 10,
					criteria: plan.gradingSettings[0].criteria,
				},
			],
			report: [],
			events: [],
		};

		const roundtripped = scheduledStateToBuilder(
			state,
			{ courseId: '30152xyjuzxgpq4', meetingId: 'sess00000000001', sectionIds: ['tataw8jvs6wbdbh'] },
			'https://laras.test',
			{ isCopy: false },
		);

		const normalizedBuilder = builderDomainMod.exports.normalize(roundtripped);
		expect(normalizedBuilder.document.title).toBe('Beim Arzt — Pertemuan 2');
		expect(normalizedBuilder.document.activities).toHaveLength(2);
		const rtAct1 = normalizedBuilder.document.activities[0];
		expect(rtAct1.blocks.map((b: any) => b.type)).toEqual(['instructions', 'image', 'matching', 'gap_passage']);
		const rtMatch = rtAct1.blocks[2];
		expect(rtMatch.destinations.map((d: any) => d.label)).toEqual(['A', 'B']);
		const rtM1 = rtMatch.questionIds[0];
		expect(normalizedBuilder.privateKeys.answersByQuestionId[rtM1].correctDestinationId).toBe(
			rtMatch.destinations[0].id,
		);

		const rtGap = rtAct1.blocks[3];
		const gapQ1 = rtGap.sections[0].segments.find((s: any) => s.type === 'gap').questionId;
		expect(normalizedBuilder.privateKeys.answersByQuestionId[gapQ1].accepted).toEqual(['muss']);

		const rtAct2 = normalizedBuilder.document.activities[1];
		const rtWriteBlock = rtAct2.blocks.find((b: any) => b.type === 'writing');
		expect(rtWriteBlock).toBeDefined();
		const rtWritingQ = normalizedBuilder.document.questionsById[rtWriteBlock.questionId];
		expect(rtWritingQ.kind).toBe('long_writing');
		expect(rtWritingQ.rubric.criteria).toHaveLength(2);
	});

	it('resolves explicit match blocks in cardMatchingTargets and explicit passage/writing blocks in worksheetBlocks', () => {
		const activity: ScheduledActivity = {
			id: 'act1',
			title: 'Latihan 1',
			kind: 'assignment',
			minutes: 30,
			startsAt: '2026-11-19T06:00:00.000Z',
			endsAt: '2026-11-19T06:30:00.000Z',
			required: true,
			sources: [
				{
					id: 'img000000000001',
					title: 'Uploaded Scene 1',
					version: 1,
					filename: 'scene_one.png',
					url: '/scene1.png',
					available: true,
				},
				{
					id: 'img000000000002',
					title: 'Uploaded Scene 2',
					version: 1,
					filename: 'scene_two.png',
					url: '/scene2.png',
					available: true,
				},
			],
			worksheet: {
				items: [
					{ id: 'm1', type: 'select', prompt: 'Aussage 1', options: ['A', 'B'] },
					{ id: 'm2', type: 'select', prompt: 'Aussage 2', options: ['A', 'B'] },
					{ id: 'g1', type: 'text', prompt: 'Lücke 1' },
					{ id: 'g2', type: 'text', prompt: 'Lücke 2' },
					{ id: 'w1', type: 'text', prompt: 'Schreiben Sie eine Nachricht.' },
				],
				blocks: [
					{
						id: 'b_match',
						type: 'match',
						prompt: { de: 'Ordnen Sie zu' },
						layout: 'destinations-above',
						cardItemIds: ['m1', 'm2'],
						destinations: [
							{ id: 'A', label: 'A', title: { de: 'Im Wartezimmer' }, image: 'img000000000001' },
							{ id: 'B', label: 'B', title: { de: 'In der Apotheke' }, image: 'img000000000002' },
						],
					},
					{
						id: 'b_passage',
						type: 'passage',
						prompt: { de: 'Ergänzen Sie' },
						sections: [
							{
								id: 'sec1',
								segments: [
									{ type: 'text', text: { de: 'Herr Taman ' } },
									{ type: 'gap', itemId: 'g1' },
									{ type: 'text', text: { de: ' Fieber und ' } },
									{ type: 'gap', itemId: 'g2' },
									{ type: 'text', text: { de: ' zum Arzt.' } },
								],
							},
						],
					},
					{
						id: 'b_writing',
						type: 'writing',
						prompt: { de: 'Nachricht schreiben' },
						itemId: 'w1',
						responseLength: 'extended',
						rows: 10,
					},
				],
			},
		};

		// Even though filenames are scene_one.png / scene_two.png (not "Bild A"), explicit match destinations resolve cleanly!
		const targets = cardMatchingTargets(activity);
		expect(targets).toEqual([
			{ value: 'A', title: 'A · Im Wartezimmer', url: '/scene1.png' },
			{ value: 'B', title: 'B · In der Apotheke', url: '/scene2.png' },
		]);

		// Non-matching items (g1, g2, w1) render with explicit passage & writing blocks
		const nonMatchingItems = activity.worksheet!.items.filter((item) => !['m1', 'm2'].includes(item.id));
		const renderedBlocks = worksheetBlocks(nonMatchingItems, activity.worksheet!.blocks);
		expect(renderedBlocks).toHaveLength(2);
		expect(renderedBlocks[0].context).toBe('Herr Taman (1) ______ Fieber und (2) ______ zum Arzt.');
		expect(renderedBlocks[0].gaps?.map((g) => g.item.id)).toEqual(['g1', 'g2']);
		expect(renderedBlocks[1].items[0].id).toBe('w1');
		expect(renderedBlocks[1].rows).toBe(10);
	});

	it('converts legacy Beim Arzt-style scheduled classes into structured matching and gap_passage builder blocks', () => {
		const legacyState: ScheduledClassState = {
			serverNow: '2026-11-18T02:00:00.000Z',
			owner: true,
			session: {
				id: 'oxeb6ykx9qlwqiy',
				course: '30152xyjuzxgpq4',
				title: 'Pertemuan 1',
				section: 'r4b1efx2s9f9b2q',
			},
			class: {
				id: 'legacy_class_1',
				title: 'Beim Arzt — Pertemuan 1',
				instructions: 'Kerjakan semua bagian.',
				section: 'r4b1efx2s9f9b2q',
				startsAt: '2026-11-12T06:00:00.000Z',
				endsAt: '2026-11-12T09:30:00.000Z',
				joinUntil: '2026-11-12T06:30:00.000Z',
				lateAfterMin: 10,
				revision: 1,
				releaseResults: true,
				status: 'closed',
				phase: 'closed',
			},
			activities: [
				{
					id: 'legacy_act_1',
					title: '1a–1b · Bildzuordnung',
					kind: 'assignment',
					minutes: 25,
					startsAt: '2026-11-12T06:00:00.000Z',
					endsAt: '2026-11-12T06:25:00.000Z',
					required: true,
					sources: [
						{
							id: 'img00000000000A',
							title: 'Beim Arzt · Bild A',
							version: 1,
							filename: 'bild_a.jpg',
							url: '/files/imgA/bild_a.jpg',
							available: true,
						},
						{
							id: 'img00000000000B',
							title: 'Beim Arzt · Bild B',
							version: 1,
							filename: 'bild_b.jpg',
							url: '/files/imgB/bild_b.jpg',
							available: true,
						},
					],
					worksheet: {
						items: [
							{ id: 'q1', type: 'select', prompt: 'Der Hals tut weh.', options: ['A', 'B'] },
							{ id: 'q2', type: 'select', prompt: 'Das Wartezimmer ist voll.', options: ['A', 'B'] },
						],
						answerKey: {
							version: 1,
							items: {
								q1: { mode: 'exact', accepted: ['A'], points: 1 },
								q2: { mode: 'exact', accepted: ['B'], points: 1 },
							},
						},
					},
				},
				{
					id: 'legacy_act_2',
					title: '1c · Lückentext',
					kind: 'assignment',
					minutes: 20,
					startsAt: '2026-11-12T06:25:00.000Z',
					endsAt: '2026-11-12T06:45:00.000Z',
					required: true,
					worksheet: {
						items: [
							{
								id: 'q3',
								type: 'text',
								prompt: 'A · Lücke 1: Ich (1) ______ im Bett bleiben und (2) ______ nicht arbeiten.',
							},
							{
								id: 'q4',
								type: 'text',
								prompt: 'A · Lücke 2: Ich (1) ______ im Bett bleiben und (2) ______ nicht arbeiten.',
							},
						],
						answerKey: {
							version: 1,
							items: {
								q3: { mode: 'exact', accepted: ['muss'], points: 1 },
								q4: { mode: 'exact', accepted: ['kann'], points: 1 },
							},
						},
					},
				},
			],
			attempts: [],
			report: [],
			events: [],
		};

		const copied = copyScheduledToBuilder(
			legacyState,
			{ courseId: '30152xyjuzxgpq4', meetingId: 'new_meeting_id', sectionIds: ['tataw8jvs6wbdbh'] },
			'https://laras.test',
		);
		expect(copied.document.title).toBe('Beim Arzt — Pertemuan 1 (salinan)');
		expect(copied.document.activities[0].blocks.map((b) => b.type)).toEqual(['image', 'matching']);
		expect(copied.document.activities[0].blocks[1].destinations?.map((d) => d.label)).toEqual(['A', 'B']);
		expect(copied.document.activities[1].blocks.map((b) => b.type)).toEqual(['gap_passage']);
		expect(copied.document.activities[1].blocks[0].sections?.[0].segments).toHaveLength(5);
	});

	it('projects non-PDF Builder media referenced by worksheet.blocks for students while never exposing faculty PDFs', () => {
		const records: Record<string, any> = {
			img_faculty_1: {
				id: 'img_faculty_1',
				getString: (f: string) =>
					f === 'access' ? 'faculty' : f === 'file' ? 'scene_a.jpg' : 'Scene A',
				getInt: () => 1,
				getStringSlice: () => ['30152xyjuzxgpq4'],
			},
			qyde12rb792mnwh: {
				id: 'qyde12rb792mnwh',
				getString: (f: string) =>
					f === 'access' ? 'faculty' : f === 'file' ? 'Linie_1_A1.pdf' : 'Linie 1 A1',
				getInt: () => 1,
				getStringSlice: () => ['30152xyjuzxgpq4'],
			},
		};
		const mockApp = {
			findRecordById: (_col: string, id: string) => {
				if (!records[id]) throw new Error('Not found');
				return records[id];
			},
		};
		const sources = [
			{ id: 'img_faculty_1', title: 'Scene A', version: 1, filename: 'scene_a.jpg', access: 'faculty' },
			{ id: 'qyde12rb792mnwh', title: 'Linie 1 A1', version: 1, filename: 'Linie_1_A1.pdf', access: 'faculty' },
		];
		const worksheet = {
			blocks: [
				{
					id: 'm1',
					type: 'match',
					destinations: [{ id: 'A', label: 'A', title: { de: 'A' }, image: 'img_faculty_1' }],
				},
				{
					id: 'bad_pdf',
					type: 'image',
					asset: 'qyde12rb792mnwh',
				},
			],
		};
		const projected = academicMod.exports.studentSources(
			mockApp,
			sources,
			'30152xyjuzxgpq4',
			worksheet,
		);
		expect(projected).toEqual([
			{
				id: 'img_faculty_1',
				title: 'Scene A',
				version: 1,
				available: true,
				url: '/hcgi/platform/api/files/file_library/img_faculty_1/scene_a.jpg',
			},
		]);
	});
});
