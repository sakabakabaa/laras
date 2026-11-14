import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';

vi.mock('@/lib/pocketbase-client', () => ({default: {authStore: {token: '', record: null, onChange: () => () => {}}}}));

import {
	aiDraftFor,
	aiRowLabel,
	autoAttention,
	draftFromAi,
	draftPercent,
	effectiveSettings,
	finalizeChecklist,
	gradeBlockers,
	gradeFromDraft,
	panelAiDraft,
	panelCriteria,
	panelScores,
	setCriterionPercent,
	studentVisibilityHints,
	suggestionToCriteria,
	writtenItemsOf,
	writtenStatus,
	type ScheduledAiDraftRecord,
} from '@/lib/scheduled-grading';
import {scheduledGradingPanelProps, ScheduledGradingPanel, type ScheduledGradingPanelProps} from '@/components/app/grading/scheduled-grading-panel';
import {describeBatch, ScheduledFinalizeChecklist} from '@/components/app/scheduled-finalize-checklist';
import {runScheduledAiForAll} from '@/lib/scheduled-grading-aids';
import {ASSESSMENT_LABELS} from '@/lib/scheduled-session-workspace';
import type {GradingSetting, ScheduledActivity, ScheduledAttempt, ScheduledClassState} from '@/lib/scheduled-classes';

const rubric: GradingSetting = {id: 'set', activity: 'essay', revision: 2, mode: 'rubric', maxPoints: 10, criteria: [{id: 'g', label: 'Grammatik', maxPoints: 6}, {id: 'i', label: 'Inhalt', maxPoints: 4}]};
const essay = {id: 'essay', kind: 'assignment', title: 'E-Mail', minutes: 10, required: true, startsAt: '', endsAt: '', worksheet: {items: [{id: 'w', prompt: 'Schreiben Sie.', type: 'text'}, {id: 'x', prompt: 'Wählen Sie.', type: 'select', options: ['A', 'B']}], answerKey: {version: 1, items: {w: {mode: 'reference', modelAnswer: 'Liebe Anna, ...', rubric: 'Anrede, Nachricht, Gruß'}, x: {mode: 'exact', accepted: ['A'], points: 1}}}}} as ScheduledActivity;
const quiz = {id: 'quiz', kind: 'quiz', title: 'Kuis', minutes: 5, required: true, startsAt: '', endsAt: '', questions: [{id: 'q', text: 'Pick', options: ['A', 'B'], correctIndex: 0, points: 1}]} as unknown as ScheduledActivity;
const essayAttempt = {id: 'att1', activity: 'essay', student: 's1', revision: 3, status: 'submitted', complete: true, savedAt: '', finalizedAt: '', answers: {responses: {w: 'Hallo Anna, ich komme.', x: 'A'}}} as ScheduledAttempt;
const aiRecord: ScheduledAiDraftRecord = {attempt: 'att1', activity: 'essay', status: 'ready', attemptRevision: 3, settingsRevision: 2, draft: {suggestedScore: 85, criterionScores: {g: 80, i: 90}, feedback: 'Gut. Achten Sie auf den Gruß.', findings: [{quote: 'ich komme', note: 'Kalimat terlalu singkat.'}]}};

describe('scheduled grading adapter', () => {
	it('spreads 100 points over suggested criteria by weight and keeps safe ids', () => {
		const criteria = suggestionToCriteria([
			{id: 's1-ab', label: 'Anrede', weight: 1, rationale: ''},
			{id: 'bad id', label: 'Inhalt', weight: 2, rationale: ''},
			{id: 's3', label: 'Gruß', weight: 1, rationale: ''},
		]);
		expect(criteria.map((c) => c.maxPoints)).toEqual([25, 50, 25]);
		expect(criteria.reduce((sum, c) => sum + c.maxPoints, 0)).toBe(100);
		expect(criteria[1].id).toBe('c2');
	});

	it('prefers saved settings, then a suggested rubric, then a provisional 0–100 score', () => {
		expect(effectiveSettings(rubric, [{id: 's1', label: 'X', weight: 1, rationale: ''}])).toMatchObject({source: 'saved', provisional: false, revision: 2});
		expect(effectiveSettings(undefined, [{id: 's1', label: 'Anrede', weight: 1, rationale: ''}])).toMatchObject({source: 'suggested', mode: 'rubric', maxPoints: 100, provisional: true, revision: 0});
		expect(effectiveSettings(undefined, [])).toMatchObject({source: 'default', mode: 'points', maxPoints: 100, provisional: true});
	});

	it('maps criterion points to 0–100 achievement and back', () => {
		const settings = effectiveSettings(rubric);
		expect(panelCriteria(settings).map((c) => c.weightPercent)).toEqual([60, 40]);
		let draft = {feedback: '', points: '', criterionScores: {}};
		draft = setCriterionPercent(settings, draft, 'g', '85');
		expect(draft.criterionScores).toEqual({g: '5.1'});
		expect(panelScores(settings, draft)).toEqual({g: 85});
		expect(draftPercent(settings, draft)).toBeNull();
		draft = setCriterionPercent(settings, draft, 'i', '100');
		expect(draftPercent(settings, draft)).toBe(91);
		expect(gradeFromDraft(settings, draft)).toEqual({points: 9.1, criterionScores: {g: 5.1, i: 4}});
		expect(setCriterionPercent(settings, draft, 'i', '').criterionScores).toEqual({g: '5.1'});
	});

	it('explains why a grade cannot be saved yet', () => {
		const settings = effectiveSettings(rubric);
		expect(gradeBlockers(settings, {feedback: '', points: '', criterionScores: {g: '3'}}, {canGrade: true, submitted: true})).toEqual(['Nilai semua kriteria (1/2 terisi).']);
		expect(gradeBlockers(settings, {feedback: '', points: '', criterionScores: {g: '3', i: '9'}}, {canGrade: true, submitted: true})[0]).toContain('antara 0 dan 4');
		expect(gradeBlockers(settings, {feedback: '', points: '', criterionScores: {}}, {canGrade: false, submitted: true})).toEqual(['Penilaian tersedia setelah kelas selesai.']);
		expect(gradeFromDraft(effectiveSettings(undefined), {feedback: '', points: '', criterionScores: {}})).toEqual({error: 'Isi nilai sebelum menyimpan penilaian.'});
		expect(gradeFromDraft({...effectiveSettings(rubric), mode: 'ungraded', maxPoints: 0, criteria: []}, {feedback: 'ok', points: '', criterionScores: {}})).toEqual({points: null, criterionScores: {}});
	});

	it('turns a stored AI draft into the starting draft and panel status', () => {
		const settings = effectiveSettings(rubric);
		expect(draftFromAi(settings, aiRecord)).toEqual({feedback: 'Gut. Achten Sie auf den Gruß.', points: '', criterionScores: {g: '4.8', i: '3.6'}});
		expect(draftFromAi(effectiveSettings(undefined), aiRecord).points).toBe('85');
		expect(panelAiDraft(aiRecord, settings, {requesting: false, error: '', hasWritten: true})).toMatchObject({status: 'ready', score: 85, criterionScores: {g: 80, i: 90}});
		expect(panelAiDraft(undefined, settings, {requesting: false, error: '', hasWritten: true})?.status).toBe('none');
		expect(panelAiDraft(undefined, settings, {requesting: true, error: '', hasWritten: true})?.status).toBe('requesting');
		expect(panelAiDraft({...aiRecord, status: 'failed', error: 'Model tidak tersedia.'}, settings, {requesting: false, error: '', hasWritten: true})).toMatchObject({status: 'failed', message: 'Model tidak tersedia.'});
		expect(panelAiDraft(aiRecord, settings, {requesting: false, error: '', hasWritten: false})).toBeNull();
	});

	it('ignores an AI draft made for an older answer revision', () => {
		expect(aiDraftFor([aiRecord], essayAttempt)).toBe(aiRecord);
		expect(aiDraftFor([aiRecord], {...essayAttempt, revision: 4})).toBeUndefined();
	});

	it('uses one status vocabulary with Tugas', () => {
		expect(ASSESSMENT_LABELS).toEqual({unreviewed: 'Perlu dinilai', draft: 'Draf dosen', reviewed: 'Siap diterbitkan', published: 'Diterbitkan'});
		expect(writtenStatus(undefined, undefined, undefined)).toBe('missing');
		expect(writtenStatus(essayAttempt, undefined, undefined)).toBe('needs');
		expect(writtenStatus(essayAttempt, undefined, aiRecord)).toBe('ai');
		expect(writtenStatus(essayAttempt, {attempt: 'att1', activity: 'essay', points: 5, maxPoints: 10, status: 'draft', revision: 1}, aiRecord)).toBe('draft');
		expect(writtenStatus(essayAttempt, {attempt: 'att1', activity: 'essay', points: 5, maxPoints: 10, status: 'reviewed', revision: 1}, aiRecord)).toBe('ready');
		expect(aiRowLabel(aiRecord)).toBe('AI 85');
		expect(aiRowLabel({...aiRecord, status: 'failed'})).toBe('AI gagal');
		expect(aiRowLabel(undefined)).toBe('');
	});

	it('reads written answers with their model answer and guidance, skipping exact items', () => {
		expect(writtenItemsOf(essay, essayAttempt.answers)).toEqual([{prompt: 'Schreiben Sie.', answer: 'Hallo Anna, ich komme.', modelAnswer: 'Liebe Anna, ...', rubric: 'Anrede, Nachricht, Gruß'}]);
		expect(writtenItemsOf({title: 'Reflexion', content: 'Was haben Sie gelernt?'}, {text: 'Viel.'})).toEqual([{prompt: 'Was haben Sie gelernt?', answer: 'Viel.', modelAnswer: '', rubric: ''}]);
		expect(writtenItemsOf(essay, {responses: {w: '  '}})).toEqual([]);
	});

	it('lists auto-scored work that needs attention (overrides, low scores)', () => {
		const quizAttempt = {...essayAttempt, id: 'qa', activity: 'quiz', score: 40, answers: {q: 1}} as ScheduledAttempt;
		const items = autoAttention([
			{activity: quiz, attempt: quizAttempt, score: 40, wrong: 1},
			{activity: {...quiz, id: 'quiz2', title: 'Kuis 2'} as ScheduledActivity, attempt: {...quizAttempt, id: 'qb'}, assessment: {attempt: 'qb', activity: 'quiz2', points: 100, maxPoints: 100, status: 'draft', settingsRevision: 0, answerOverrides: {q: 'correct'}}, score: 100, wrong: 0},
			{activity: {...quiz, id: 'quiz3'} as ScheduledActivity, attempt: {...quizAttempt, id: 'qc'}, score: 90, wrong: 0},
		]);
		expect(items).toEqual([
			{activity: 'quiz', title: 'Kuis', score: 40, overrides: 0, wrong: 1, low: true, approved: false},
			{activity: 'quiz2', title: 'Kuis 2', score: 100, overrides: 1, wrong: 0, low: false, approved: false},
		]);
	});
});

function classState(extra: Partial<ScheduledClassState> = {}): ScheduledClassState {
	const quizAttempt = {id: 'qa', activity: 'quiz', student: 's1', revision: 1, status: 'submitted', complete: true, savedAt: '', finalizedAt: '', answers: {q: 0}, score: 100} as ScheduledAttempt;
	const second = {...essayAttempt, id: 'att2', student: 's2'};
	const third = {...essayAttempt, id: 'att3', student: 's3'};
	return {
		serverNow: '', owner: true, session: {id: 'session0001', title: 'Arzt', course: 'c'},
		class: {id: 'cls', phase: 'closed', status: 'closed', releaseResults: false} as ScheduledClassState['class'],
		activities: [essay, quiz],
		attempts: [essayAttempt, second, third, quizAttempt],
		report: [{roster: 'r1', student: 's1', name: 'Ana', nim: '1'}, {roster: 'r2', student: 's2', name: 'Budi', nim: '2'}, {roster: 'r3', student: 's3', name: 'Citra', nim: '3'}].map((row) => ({...row, checkedInAt: '', lastSeenAt: '', suggestion: '', completed: 0, total: 2, reason: '', attendance: '', attempts: []})),
		gradingSettings: [rubric],
		assessments: [
			{attempt: 'att2', activity: 'essay', points: 8, maxPoints: 10, status: 'reviewed', revision: 1, attemptRevision: 3, settingsRevision: 2},
			{attempt: 'att3', activity: 'essay', points: 5, maxPoints: 10, status: 'draft', revision: 1, attemptRevision: 3, settingsRevision: 2},
		],
		events: [],
		...extra,
	};
}

describe('Selesaikan kelas checklist', () => {
	it('counts auto scores to approve, answers to grade, grades ready to publish and quiz release', () => {
		const list = finalizeChecklist(classState());
		expect(list.autoToApprove).toEqual([{attemptId: 'qa', attemptRevision: 1, assessmentRevision: 0, activity: 'quiz', student: 's1'}]);
		expect(list.writtenToGrade).toBe(2);
		expect(list.writtenDrafts).toBe(1);
		expect(list.readyToPublish).toEqual([{attemptId: 'att2', baseRevision: 1, attemptRevision: 3, settingsRevision: 2, activity: 'essay', student: 's2'}]);
		expect(list.quizReleased).toBe(false);
		expect(list.pending).toEqual(['1 nilai otomatis perlu disetujui', '2 jawaban tertulis perlu dinilai', '1 penilaian siap diterbitkan', 'Hasil kuis belum diterbitkan']);
	});

	it('skips stale grades and approved auto scores', () => {
		const state = classState({
			gradingSettings: [{...rubric, revision: 3}],
			assessments: [
				{attempt: 'att2', activity: 'essay', points: 8, maxPoints: 10, status: 'reviewed', revision: 1, attemptRevision: 3, settingsRevision: 2},
				{attempt: 'qa', activity: 'quiz', points: 100, maxPoints: 100, status: 'reviewed', revision: 1, attemptRevision: 1, settingsRevision: 0},
			],
			class: {id: 'cls', phase: 'closed', status: 'closed', releaseResults: true} as ScheduledClassState['class'],
		});
		const list = finalizeChecklist(state);
		expect(list.readyToPublish).toEqual([]);
		expect(list.autoToApprove).toEqual([]);
		expect(list.pending).toEqual(['2 jawaban tertulis perlu dinilai']);
	});

	it('explains what students currently see, following the server release rule', () => {
		const hints = studentVisibilityHints(classState());
		expect(hints.release).toContain('Belum diterbitkan');
		expect(hints.release).toContain('(1 dari 3)');
		expect(hints.approval).toContain('nilai mentah');
		const released = studentVisibilityHints(classState({class: {id: 'cls', phase: 'closed', status: 'closed', releaseResults: true} as ScheduledClassState['class']}));
		expect(released.release).toContain('semua peserta melihat');
	});

	it('renders the checklist with inline actions and a guarded "Tandai kelas ditinjau"', () => {
		const html = renderToStaticMarkup(createElement(ScheduledFinalizeChecklist, {state: classState(), onAction: async () => ({})}));
		expect(html).toContain('Selesaikan kelas');
		expect(html).toContain('Setujui semua nilai otomatis (1)');
		expect(html).toContain('Terbitkan yang siap (1)');
		expect(html).toContain('Terbitkan hasil kuis');
		expect(html).toContain('Tandai kelas ditinjau');
		expect(html).toContain('Masih tertunda: 1 nilai otomatis perlu disetujui');
		expect(renderToStaticMarkup(createElement(ScheduledFinalizeChecklist, {state: classState({class: {id: 'cls', phase: 'open', status: 'scheduled', releaseResults: false} as ScheduledClassState['class']}), onAction: async () => ({})}))).toBe('');
	});

	it('reports batch failures per student and activity', () => {
		const result = describeBatch(classState(), {ok: 1, failed: 1, results: [{attemptId: 'att2', ok: true}, {attemptId: 'att3', ok: false, error: 'Tinjau penilaian sebelum menerbitkan.'}]}, 'penilaian diterbitkan');
		expect(result).toEqual({text: '1 penilaian diterbitkan, 1 gagal.', failures: ['Citra · E-Mail: Tinjau penilaian sebelum menerbitkan.']});
	});
});

describe('ScheduledGradingPanel (GradingPanel adapter)', () => {
	const noop = () => {};
	const base = (extra: Partial<ScheduledGradingPanelProps> = {}): ScheduledGradingPanelProps => ({
		activity: essay, attempt: essayAttempt, settings: effectiveSettings(rubric), locked: false,
		draft: {feedback: '', points: '', criterionScores: {}}, onDraftChange: noop, dirty: false,
		aiRequesting: false, aiError: '', hasWritten: true, onRequestAi: noop,
		suggestion: {loading: false, criteria: [], reason: ''}, canGrade: true, busy: false,
		onSave: noop, onPublish: noop, onAcceptSuggestion: noop, onPreset: noop, onOpenSettings: noop,
		...extra,
	});
	const render = (props: ScheduledGradingPanelProps) => renderToStaticMarkup(createElement(ScheduledGradingPanel, props));

	it('maps the rubric onto the shared panel with "Simpan & berikutnya" as primary action', () => {
		const mapped = scheduledGradingPanelProps(base(), {confirming: false, setConfirming: noop});
		expect(mapped.primaryAction.label).toBe('Simpan & berikutnya');
		expect(mapped.secondaryAction?.label).toBe('Simpan draf');
		expect(mapped.primaryAction.disabled).toBe(true);
		expect(mapped.disabledReasons).toEqual(['Nilai semua kriteria (0/2 terisi).']);
		expect(mapped.criteria.map((c) => c.label)).toEqual(['Grammatik', 'Inhalt']);
		expect(mapped.finalScore).toMatchObject({readOnly: true, unit: '/ 10'});
		const html = render(base());
		expect(html).toContain('evx-panel');
		expect(html).toContain('aria-label="Pencapaian Grammatik"');
		expect(html).toContain('Perlu dinilai');
	});

	it('shows a suggested rubric with "Terima semua" while nothing is saved', () => {
		const settings = effectiveSettings(undefined, [{id: 's1', label: 'Anrede', weight: 1, rationale: ''}, {id: 's2', label: 'Inhalt', weight: 1, rationale: ''}]);
		const html = render(base({settings}));
		expect(html).toContain('Saran rubrik (belum disimpan)');
		expect(html).toContain('Terima semua');
		expect(html).toContain('Ubah rubrik…');
		expect(html).toContain('aria-label="Pencapaian Anrede"');
	});

	it('makes the settings lock visible with its reason', () => {
		const html = render(base({locked: true}));
		expect(html).toContain('Cara menilai terkunci');
		expect(html).toContain('membatalkan nilai yang sudah dibuat');
	});

	it('starts from a stored AI draft and lists its findings', () => {
		const settings = effectiveSettings(rubric);
		const html = render(base({aiRecord: aiRecord, draft: draftFromAi(settings, aiRecord)}));
		expect(html).toContain('Siap disetujui');
		expect(html).toContain('Temuan AI (1)');
		expect(html).toContain('aria-label="Skor Inhalt" type="number" min="0" max="100" step="1" value="90"');
		expect(html).toContain('value="8.4"');
		expect(html).toContain('Usulan AI · belum disimpan sebagai penilaian');
	});

	it('offers publishing once the grade is ready, never while unsaved', () => {
		const assessment = {attempt: 'att1', activity: 'essay', points: 9, maxPoints: 10, status: 'reviewed', revision: 2, attemptRevision: 3, settingsRevision: 2};
		expect(render(base({assessment}))).toContain('Terbitkan penilaian');
		expect(render(base({assessment, dirty: true}))).toContain('Simpan perubahan sebelum menerbitkan.');
		expect(render(base({assessment, dirty: true}))).toMatch(/disabled=""><svg[^>]*lucide-send/);
	});

	it('drops the score block for feedback-only grading', () => {
		const mapped = scheduledGradingPanelProps(base({settings: {mode: 'ungraded', maxPoints: 0, criteria: [], revision: 1, provisional: false, source: 'saved'}}), {confirming: false, setConfirming: noop});
		expect(mapped.finalScore).toBeUndefined();
		expect(mapped.primaryAction.disabled).toBe(false);
	});
});

describe('Jalankan AI untuk semua (scheduled)', () => {
	it('requests at most three drafts at a time and reports failures', async () => {
		let active = 0, peak = 0;
		const progress: number[] = [];
		const result = await runScheduledAiForAll(
			['a', 'b', 'c', 'd', 'e'],
			async (id) => {
				active++; peak = Math.max(peak, active);
				await new Promise((resolve) => setTimeout(resolve, 1));
				active--;
				return id !== 'c';
			},
			(p) => progress.push(p.done),
			() => false,
		);
		expect(peak).toBe(3);
		expect(result).toEqual({done: 5, total: 5, failed: 1, stopped: false});
		expect(progress).toEqual([0, 3, 5]);
	});
});
