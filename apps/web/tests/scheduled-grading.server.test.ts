import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
	model: vi.fn(),
	collect: vi.fn(),
	created: [] as { collection: string; data: Record<string, unknown> }[],
	updated: [] as { collection: string; id: string; data: Record<string, unknown> }[],
	existingDraft: null as null | { id: string },
	settings: null as null | Record<string, unknown>,
	classOwner: 'other',
	courseOwner: 'f1',
	classStatus: 'closed',
	attemptClass: 'cls00001',
}));

const records: Record<string, Record<string, unknown>> = {
	class_sessions: { course: 'course00001', title: 'Arzt' },
	courses: { owner: '', code: 'A1 JR241' },
	scheduled_class_activities: {
		id: 'act00001',
		class: 'cls00001',
		kind: 'assignment',
		title: 'E-Mail',
		snapshot: {
			content: 'Schreiben Sie eine E-Mail.',
			worksheet: {
				items: [
					{ id: 'w', prompt: 'Schreiben Sie an Anna.' },
					{ id: 'x', prompt: 'Wählen Sie.' },
				],
				answerKey: { version: 1, items: { w: { mode: 'reference', modelAnswer: 'Liebe Anna, ich kann heute nicht kommen.', rubric: 'Anrede, Nachricht, Gruß' }, x: { mode: 'exact', accepted: ['A'], points: 1 } } },
			},
		},
	},
	scheduled_activity_attempts: { id: 'att00001', class: 'cls00001', activity: 'act00001', student: 'stu00001', status: 'submitted', revision: 2, answers: { responses: { w: 'Liebe Anna, ich komme heute nicht zu Arbeit.', x: 'A' } } },
};

vi.mock('@/lib/logger.server', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: vi.fn(async (collection: string) => {
			if (collection === 'courses') return { ...records.courses, owner: db.courseOwner };
			if (collection === 'scheduled_activity_attempts') return { ...records.scheduled_activity_attempts, class: db.attemptClass };
			if (!records[collection]) throw new Error('404');
			return records[collection];
		}),
		listRecords: vi.fn(async (collection: string) => {
			if (collection === 'scheduled_classes') return { items: [{ id: 'cls00001', session: 'ses00001', course: 'course00001', owner: db.classOwner, status: db.classStatus }] };
			if (collection === 'scheduled_grading_settings') return { items: db.settings ? [db.settings] : [] };
			if (collection === 'scheduled_ai_drafts') return { items: db.existingDraft ? [db.existingDraft] : [] };
			return { items: [] };
		}),
		createRecord: vi.fn(async (collection: string, data: Record<string, unknown>) => {
			db.created.push({ collection, data });
			return { id: 'new', ...data };
		}),
		updateRecord: vi.fn(async (collection: string, id: string, data: Record<string, unknown>) => {
			db.updated.push({ collection, id, data });
			return { id, ...data };
		}),
	},
}));
vi.mock('@/lib/task-assist.server', () => ({ collectModelWithProvenance: db.model, imageFilenames: () => [], storedFileUrl: () => '' }));
vi.mock('@/lib/assignment-draft.server', () => ({ collectModel: db.collect }));
vi.mock('@/lib/context-retrieval.server', () => ({ cpmkOfSubCpmk: async () => '', retrieveContextBundle: async () => null }));

import { draftScheduledAttempt, scheduledSuggestionInput } from '@/lib/scheduled-grading.server';
import { buildScheduledPrompt, buildScheduledRubricSuggestions } from '@/lib/rubric-suggestions.server';

const modelReply = JSON.stringify({
	findings: [{ severity: 'major', quote: 'zu Arbeit', errorDescription: 'Artikel fehlt', correction: 'zur Arbeit', explanation: '', note: 'Gunakan "zur Arbeit".', confidence: 0.9 }],
	recommendedScore: 78,
	rubricBreakdown: [
		{ criterionId: 'g', criterion: 'Grammatik', score: 70, note: '' },
		{ criterionId: 'i', criterion: 'Inhalt', score: 90, note: '' },
	],
	summary: 'Pesan jelas.',
});

beforeEach(() => {
	// These tests cover the single-pass wire shape; two-pass has its own tests.
	process.env.AI_EVAL_TWO_PASS = '0';
	db.model.mockReset();
	db.collect.mockReset();
	db.created = [];
	db.updated = [];
	db.existingDraft = null;
	db.settings = null;
	db.classOwner = 'other';
	db.courseOwner = 'f1';
	db.classStatus = 'closed';
	db.attemptClass = 'cls00001';
});

describe('stored scheduled AI drafts', () => {
	it('builds the draft from the stored answer and saved rubric, then stores it per answer', async () => {
		db.settings = { id: 'set', mode: 'rubric', revision: 4, criteria: [{ id: 'g', label: 'Grammatik', maxPoints: 6 }, { id: 'i', label: 'Inhalt', maxPoints: 4 }] };
		db.model.mockResolvedValue({ content: modelReply });
		// Client-sent criteria are ignored once settings exist.
		const result = await draftScheduledAttempt('f1', { sessionId: 'ses00001', attemptId: 'att00001', criteria: [{ id: 'evil', label: 'Evil', maxPoints: 1 }] });
		expect('error' in result).toBe(false);
		const prompt = db.model.mock.calls[0][0] as string;
		expect(prompt).toContain('ich komme heute nicht zu Arbeit');
		expect(prompt).toContain('Anrede, Nachricht, Gruß');
		expect(prompt).toContain('criterionId=g');
		expect(prompt).not.toContain('criterionId=evil');
		expect(prompt).not.toContain('Wählen Sie.');
		expect(db.created).toHaveLength(1);
		expect(db.created[0]).toMatchObject({
			collection: 'scheduled_ai_drafts',
			data: { class: 'cls00001', activity: 'act00001', attempt: 'att00001', student: 'stu00001', status: 'ready', attemptRevision: 2, settingsRevision: 4 },
		});
		expect((db.created[0].data.draft as { criterionScores: Record<string, number> }).criterionScores).toEqual({ g: 70, i: 90 });
		// Findings keep severity and are anchored to the answer they quote.
		const answer = 'Liebe Anna, ich komme heute nicht zu Arbeit.';
		const stored = db.created[0].data.draft as { findings: Record<string, unknown>[]; answers: unknown[] };
		expect(stored.findings[0]).toMatchObject({
			severity: 'major', quote: 'zu Arbeit', note: 'Gunakan "zur Arbeit".', correction: 'zur Arbeit', errorDescription: 'Artikel fehlt',
			anchorValid: true, anchorAmbiguous: false, quoteStart: answer.indexOf('zu Arbeit'), itemId: 'w', answerIndex: 0,
			answerStart: answer.indexOf('zu Arbeit'), answerEnd: answer.indexOf('zu Arbeit') + 9,
		});
		expect(stored.answers).toEqual([{ itemId: 'w', answerIndex: 0, length: answer.length }]);
	});

	it('updates the existing record on regeneration and uses provisional criteria only without settings', async () => {
		db.existingDraft = { id: 'draft001' };
		db.model.mockResolvedValue({ content: modelReply });
		await draftScheduledAttempt('f1', { sessionId: 'ses00001', attemptId: 'att00001', criteria: [{ id: 's1-ab', label: 'Anrede', maxPoints: 50 }, { id: 'bad id', label: 'X', maxPoints: 50 }] });
		expect(db.model.mock.calls[0][0]).toContain('criterionId=s1-ab');
		expect(db.model.mock.calls[0][0]).not.toContain('bad id');
		expect(db.created).toHaveLength(0);
		expect(db.updated[0]).toMatchObject({ collection: 'scheduled_ai_drafts', id: 'draft001', data: { status: 'ready', settingsRevision: 0 } });
	});

	it('stores a failure so the roster can show "AI gagal"', async () => {
		db.model.mockRejectedValue(new Error('down'));
		const result = await draftScheduledAttempt('f1', { sessionId: 'ses00001', attemptId: 'att00001' });
		expect(result).toMatchObject({ error: { status: 502 } });
		expect(db.created[0].data).toMatchObject({ status: 'failed' });
	});

	it('allows the scheduled-class owner, rejects other lecturers and foreign answers', async () => {
		db.model.mockResolvedValue({ content: modelReply });
		db.courseOwner = 'someone';
		db.classOwner = 'f1';
		expect('error' in (await draftScheduledAttempt('f1', { sessionId: 'ses00001', attemptId: 'att00001' }))).toBe(false);
		expect(await draftScheduledAttempt('intruder', { sessionId: 'ses00001', attemptId: 'att00001' })).toMatchObject({ error: { status: 403 } });
		db.attemptClass = 'cls99999';
		expect(await draftScheduledAttempt('f1', { sessionId: 'ses00001', attemptId: 'att00001' })).toMatchObject({ error: { status: 403 } });
		expect(await draftScheduledAttempt('f1', { sessionId: 'bad id', attemptId: 'att00001' })).toMatchObject({ error: { status: 422 } });
	});

	it('is only offered after the class has ended', async () => {
		db.classStatus = 'scheduled';
		expect(await draftScheduledAttempt('f1', { sessionId: 'ses00001', attemptId: 'att00001' })).toMatchObject({ error: { status: 400 } });
		expect(db.model).not.toHaveBeenCalled();
	});
});

describe('scheduled rubric suggestions', () => {
	it('derives input from the stored model answer and guidance for the owner only', async () => {
		const result = await scheduledSuggestionInput('f1', 'ses00001', 'act00001');
		expect(result).toEqual({
			input: {
				title: 'E-Mail',
				content: 'Schreiben Sie eine E-Mail.',
				items: [{ prompt: 'Schreiben Sie an Anna.', modelAnswer: 'Liebe Anna, ich kann heute nicht kommen.', rubric: 'Anrede, Nachricht, Gruß' }],
			},
		});
		expect(await scheduledSuggestionInput('intruder', 'ses00001', 'act00001')).toMatchObject({ error: { status: 403 } });
	});

	it('prompts with the guidance and returns sanitized criteria', async () => {
		const input = { title: 'E-Mail', content: '', items: [{ prompt: 'Schreiben Sie an Anna.', modelAnswer: 'Liebe Anna', rubric: 'Anrede, Nachricht, Gruß' }] };
		expect(buildScheduledPrompt(input)).toContain('Panduan penilaian dosen: Anrede, Nachricht, Gruß');
		db.collect.mockResolvedValue(JSON.stringify({ criteria: [{ label: 'Anrede & Gruß', weight: 1, rationale: 'Disebut di panduan.' }, { label: 'Isi pesan', weight: 2, rationale: '' }, { label: 'x', weight: 1 }] }));
		const result = await buildScheduledRubricSuggestions(input);
		expect(result.pending.map((c) => c.label)).toEqual(['Anrede & Gruß', 'Isi pesan']);
		expect(result.pending.every((c) => /^[A-Za-z0-9_-]+$/.test(c.id))).toBe(true);
	});

	it('does not call the model without enough lecturer-authored text', async () => {
		const result = await buildScheduledRubricSuggestions({ title: '', content: '', items: [{ prompt: 'Hi', modelAnswer: '', rubric: '' }] });
		expect(result.pending).toEqual([]);
		expect(result.reason).toContain('belum memiliki contoh jawaban');
		expect(db.collect).not.toHaveBeenCalled();
	});
});
