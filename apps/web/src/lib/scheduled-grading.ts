/**
 * Scheduled-class ("Kelas terjadwal") grading model shared by the review
 * workspace, the session overview and the tests.
 *
 * Client-safe and pure. It adapts the scheduled assessment data (grading
 * settings in points, criterion points, stored AI drafts, assessment status)
 * onto the 0–100 model of the shared `GradingPanel` used by Tugas, and
 * derives the "Selesaikan kelas" checklist from the class state.
 */
import type {GradingAiDraft, GradingCriterion} from '@/components/app/grading/grading-panel';
import type {SuggestedCriterion} from './rubric-suggestions';
import type {GradeDraftState} from './scheduled-review';
import type {GradingSetting, ScheduledActivity, ScheduledAssessment, ScheduledAttempt, ScheduledClassState} from './scheduled-classes';
import {assessmentStatus} from './scheduled-session-workspace';
import {requiresManual} from './session-review-verdict';

/** Stored AI draft (collection `scheduled_ai_drafts`) as returned in lecturer state. */
export type ScheduledAiDraftRecord = {
	attempt: string;
	activity: string;
	status: 'ready' | 'failed';
	attemptRevision: number;
	settingsRevision: number;
	draft: {
		summary?: string;
		feedback?: string;
		suggestedScore?: number | null;
		criterionScores?: Record<string, number>;
		findings?: {quote?: string; note?: string; correction?: string}[];
		truncated?: boolean;
	};
	error?: string;
	updated?: string;
};

export type SettingsCriterion = {id: string; label: string; maxPoints: number};

/** The grading settings the panel works with; `provisional` until saved. */
export type EffectiveSettings = {
	mode: 'ungraded' | 'points' | 'rubric';
	maxPoints: number;
	criteria: SettingsCriterion[];
	revision: number;
	provisional: boolean;
	source: 'saved' | 'suggested' | 'default';
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Spreads 100 points over suggested criteria by relative weight (integers, exact sum). */
export function suggestionToCriteria(pending: SuggestedCriterion[], total = 100): SettingsCriterion[] {
	const usable = pending.filter((c) => c.label.trim()).slice(0, 30);
	if (!usable.length) return [];
	const weights = usable.reduce((sum, c) => sum + Math.max(1, c.weight || 1), 0);
	let used = 0;
	return usable.map((c, index) => {
		const last = index === usable.length - 1;
		const points = last ? total - used : Math.max(1, Math.round((Math.max(1, c.weight || 1) / weights) * total));
		used += points;
		const id = /^[A-Za-z0-9_-]{1,100}$/.test(c.id) ? c.id : `c${index + 1}`;
		return {id, label: c.label.trim().slice(0, 200), maxPoints: points};
	});
}

/**
 * Saved settings win. Without them grading is not blocked: a suggested rubric
 * (from the activity's model answer + guidance) or, failing that, a 0–100
 * score is used provisionally and saved together with the first grade.
 */
export function effectiveSettings(saved: GradingSetting | undefined, suggestion?: SuggestedCriterion[] | null): EffectiveSettings {
	if (saved) return {mode: saved.mode, maxPoints: saved.maxPoints, criteria: saved.criteria || [], revision: saved.revision, provisional: false, source: 'saved'};
	const criteria = suggestionToCriteria(suggestion || []);
	if (criteria.length) return {mode: 'rubric', maxPoints: 100, criteria, revision: 0, provisional: true, source: 'suggested'};
	return {mode: 'points', maxPoints: 100, criteria: [], revision: 0, provisional: true, source: 'default'};
}

export function panelCriteria(settings: EffectiveSettings): GradingCriterion[] {
	if (settings.mode !== 'rubric') return [];
	const total = settings.criteria.reduce((sum, c) => sum + c.maxPoints, 0) || 1;
	return settings.criteria.map((c) => ({
		id: c.id,
		label: c.label,
		weight: c.maxPoints,
		weightPercent: Math.round((100 * c.maxPoints) / total),
		evidence: `Maksimal ${c.maxPoints} poin.`,
	}));
}

/** Criterion points in the draft → 0–100 achievement per criterion. */
export function panelScores(settings: EffectiveSettings, draft: GradeDraftState): Record<string, number> {
	const scores: Record<string, number> = {};
	if (settings.mode !== 'rubric') return scores;
	for (const c of settings.criteria) {
		const raw = draft.criterionScores[c.id];
		if (raw === undefined || raw === '') continue;
		const points = Number(raw);
		if (finite(points) && c.maxPoints > 0) scores[c.id] = Math.round((points / c.maxPoints) * 100);
	}
	return scores;
}

/** A 0–100 achievement chosen in the panel → criterion points in the draft. */
export function setCriterionPercent(settings: EffectiveSettings, draft: GradeDraftState, id: string, value: string): GradeDraftState {
	const criterion = settings.criteria.find((c) => c.id === id);
	if (!criterion) return draft;
	const next = {...draft.criterionScores};
	if (value.trim() === '') delete next[id];
	else {
		const percent = Math.min(100, Math.max(0, Number(value)));
		if (!finite(percent)) return draft;
		next[id] = String(round2((percent / 100) * criterion.maxPoints));
	}
	return {...draft, criterionScores: next};
}

/** Total in points, or null until every criterion (rubric) / the score (points) is filled. */
export function draftPoints(settings: EffectiveSettings, draft: GradeDraftState): number | null {
	if (settings.mode === 'ungraded') return null;
	if (settings.mode === 'points') {
		if (draft.points.trim() === '') return null;
		const value = Number(draft.points);
		return finite(value) ? value : null;
	}
	if (!settings.criteria.length) return null;
	let total = 0;
	for (const c of settings.criteria) {
		const raw = draft.criterionScores[c.id];
		if (raw === undefined || raw === '') return null;
		const value = Number(raw);
		if (!finite(value)) return null;
		total += value;
	}
	return round2(total);
}

/** The panel's "x / 100" headline: the draft total as a percentage of the maximum. */
export function draftPercent(settings: EffectiveSettings, draft: GradeDraftState): number | null {
	const points = draftPoints(settings, draft);
	if (points == null || settings.maxPoints <= 0) return null;
	return Math.round((points / settings.maxPoints) * 100);
}

/** Validated save payload, or the Indonesian reason it cannot be saved yet. */
export function gradeFromDraft(settings: EffectiveSettings, draft: GradeDraftState): {points: number | null; criterionScores: Record<string, number>} | {error: string} {
	if (settings.mode === 'ungraded') return {points: null, criterionScores: {}};
	if (settings.mode === 'points') {
		const points = draftPoints(settings, draft);
		if (points == null) return {error: 'Isi nilai sebelum menyimpan penilaian.'};
		if (points < 0 || points > settings.maxPoints) return {error: `Nilai harus antara 0 dan ${settings.maxPoints}.`};
		return {points, criterionScores: {}};
	}
	const criterionScores: Record<string, number> = {};
	const missing: string[] = [];
	for (const c of settings.criteria) {
		const raw = draft.criterionScores[c.id];
		const value = raw === undefined || raw === '' ? NaN : Number(raw);
		if (!finite(value)) {missing.push(c.label); continue;}
		if (value < 0 || value > c.maxPoints) return {error: `Nilai ${c.label} harus antara 0 dan ${c.maxPoints}.`};
		criterionScores[c.id] = value;
	}
	if (missing.length) return {error: `Nilai semua kriteria (${settings.criteria.length - missing.length}/${settings.criteria.length} terisi).`};
	return {points: round2(Object.values(criterionScores).reduce((sum, v) => sum + v, 0)), criterionScores};
}

/** Why the primary action is disabled (empty when it can run). */
export function gradeBlockers(settings: EffectiveSettings, draft: GradeDraftState, context: {canGrade: boolean; submitted: boolean}): string[] {
	if (!context.canGrade) return ['Penilaian tersedia setelah kelas selesai.'];
	if (!context.submitted) return ['Mahasiswa belum mengirim jawaban untuk kegiatan ini.'];
	const grade = gradeFromDraft(settings, draft);
	return 'error' in grade ? [grade.error] : [];
}

const usableAi = (record: ScheduledAiDraftRecord | undefined, attempt: ScheduledAttempt | undefined) =>
	record && attempt && record.attempt === attempt.id && record.attemptRevision === attempt.revision ? record : undefined;

/** The stored AI draft for this attempt revision, if any. */
export function aiDraftFor(records: ScheduledAiDraftRecord[] | undefined, attempt: ScheduledAttempt | undefined) {
	return usableAi(records?.find((r) => r.attempt === attempt?.id), attempt);
}

/** AI proposal mapped onto the draft fields (points per criterion / overall points + feedback). */
export function draftFromAi(settings: EffectiveSettings, record: ScheduledAiDraftRecord): GradeDraftState {
	const ai = record.draft || {};
	const feedback = (ai.feedback || ai.summary || '').slice(0, 10000);
	if (settings.mode === 'ungraded') return {feedback, points: '', criterionScores: {}};
	if (settings.mode === 'points') {
		const score = finite(ai.suggestedScore) ? ai.suggestedScore : null;
		return {feedback, points: score == null ? '' : String(round2((score / 100) * settings.maxPoints)), criterionScores: {}};
	}
	const criterionScores: Record<string, string> = {};
	for (const c of settings.criteria) {
		const percent = ai.criterionScores?.[c.id];
		if (finite(percent)) criterionScores[c.id] = String(round2((Math.min(100, Math.max(0, percent)) / 100) * c.maxPoints));
	}
	return {feedback, points: '', criterionScores};
}

/** GradingPanel AI status for one attempt. */
export function panelAiDraft(
	record: ScheduledAiDraftRecord | undefined,
	settings: EffectiveSettings,
	context: {requesting: boolean; error: string; hasWritten: boolean},
): GradingAiDraft | null {
	if (!context.hasWritten) return null;
	if (context.requesting) return {status: 'requesting', score: null, message: 'Menyusun draf AI dari jawaban mahasiswa…'};
	if (context.error) return {status: 'failed', score: null, message: context.error};
	if (!record) return {status: 'none', score: null, message: 'Draf AI belum dibuat untuk jawaban ini. Nilai resmi tetap keputusan dosen.'};
	if (record.status === 'failed') return {status: 'failed', score: null, message: record.error || 'Draf AI gagal.'};
	const ai = record.draft || {};
	const criterionScores: Record<string, number> = {};
	for (const c of settings.criteria) if (finite(ai.criterionScores?.[c.id])) criterionScores[c.id] = ai.criterionScores![c.id];
	return {status: 'ready', score: finite(ai.suggestedScore) ? ai.suggestedScore : null, criterionScores, summary: ai.feedback || ai.summary || ''};
}

/** Unified status words, the same set as Tugas. */
export type WrittenStatus = 'missing' | 'needs' | 'ai' | 'draft' | 'ready' | 'published';
export const WRITTEN_STATUS_LABELS: Record<WrittenStatus, string> = {
	missing: 'Belum mengirim',
	needs: 'Perlu dinilai',
	ai: 'Siap disetujui',
	draft: 'Draf dosen',
	ready: 'Siap diterbitkan',
	published: 'Diterbitkan',
};

export function writtenStatus(attempt: ScheduledAttempt | undefined, assessment: ScheduledAssessment | undefined, ai: ScheduledAiDraftRecord | undefined): WrittenStatus {
	if (!attempt) return 'missing';
	const status = assessmentStatus(assessment);
	if (status === 'published') return 'published';
	if (status === 'reviewed') return 'ready';
	if (status === 'draft') return 'draft';
	return usableAi(ai, attempt)?.status === 'ready' ? 'ai' : 'needs';
}

/** Compact AI marker for a roster row ("AI 85", "AI gagal", "Draf AI"); '' when none. */
export function aiRowLabel(record: ScheduledAiDraftRecord | undefined): string {
	if (!record) return '';
	if (record.status === 'failed') return 'AI gagal';
	const score = record.draft?.suggestedScore;
	return finite(score) ? `AI ${Math.round(score)}` : 'Draf AI';
}

/** Mirrors `isAutoScoredActivity` in scheduled-classes-service.js. */
export function isAutoScoredActivity(activity: ScheduledActivity): boolean {
	const items = activity.worksheet?.items || [];
	const keys = activity.worksheet?.answerKey?.items || {};
	return activity.kind === 'quiz' || ((activity.kind === 'assignment' || activity.kind === 'exit_ticket') && items.length > 0 && items.every((item) => keys[item.id]?.mode === 'exact'));
}

export const AUTO_STATUS_LABELS = {pending: 'Perlu disetujui', approved: 'Disetujui'} as const;

/** The auto score was approved for the attempt's current revision. */
export function autoApproved(attempt: ScheduledAttempt | undefined, assessment: ScheduledAssessment | undefined): boolean {
	return !!attempt && assessment?.settingsRevision === 0 && assessment.status === 'reviewed' && (assessment.attemptRevision === undefined || assessment.attemptRevision === attempt.revision);
}

export type AutoApprovalItem = {attemptId: string; attemptRevision: number; assessmentRevision: number; activity: string; student: string};
export type PublishItem = {attemptId: string; baseRevision: number; attemptRevision: number; settingsRevision: number; activity: string; student: string};

export type FinalizeChecklist = {
	autoToApprove: AutoApprovalItem[];
	writtenToGrade: number;
	writtenDrafts: number;
	readyToPublish: PublishItem[];
	hasAutoActivities: boolean;
	quizReleased: boolean;
	classReviewed: boolean;
	/** Lecturer-facing lines for everything still open ('' items omitted). */
	pending: string[];
};

/** What is still open before the class can be marked reviewed. */
export function finalizeChecklist(state: ScheduledClassState): FinalizeChecklist {
	const submitted = state.attempts.filter((a) => a.status !== 'draft');
	const activityOf = (attempt: ScheduledAttempt) => state.activities.find((a) => a.id === attempt.activity);
	const assessmentOf = (attempt: ScheduledAttempt) => state.assessments?.find((g) => g.attempt === attempt.id);
	const autoActivities = state.activities.filter((a) => isAutoScoredActivity(a));
	const autoToApprove: AutoApprovalItem[] = [];
	let writtenToGrade = 0, writtenDrafts = 0;
	const readyToPublish: PublishItem[] = [];
	for (const attempt of submitted) {
		const activity = activityOf(attempt);
		if (!activity) continue;
		const assessment = assessmentOf(attempt);
		if (isAutoScoredActivity(activity)) {
			if (typeof attempt.score !== 'number' || autoApproved(attempt, assessment)) continue;
			if (assessment && assessment.settingsRevision !== 0) continue;
			autoToApprove.push({attemptId: attempt.id, attemptRevision: attempt.revision, assessmentRevision: assessment?.revision || 0, activity: activity.id, student: attempt.student});
			continue;
		}
		if (!requiresManual(activity)) continue;
		const status = assessmentStatus(assessment);
		if (status === 'unreviewed' || status === 'draft') {
			writtenToGrade += 1;
			if (status === 'draft') writtenDrafts += 1;
			continue;
		}
		if (status !== 'reviewed' || !assessment) continue;
		const settings = state.gradingSettings?.find((s) => s.activity === activity.id);
		if (!settings || assessment.settingsRevision !== settings.revision) continue;
		if (assessment.attemptRevision !== undefined && assessment.attemptRevision !== attempt.revision) continue;
		readyToPublish.push({attemptId: attempt.id, baseRevision: assessment.revision || 0, attemptRevision: attempt.revision, settingsRevision: settings.revision, activity: activity.id, student: attempt.student});
	}
	const quizReleased = !!state.class?.releaseResults;
	const hasAutoActivities = autoActivities.length > 0;
	const pending = [
		autoToApprove.length ? `${autoToApprove.length} nilai otomatis perlu disetujui` : '',
		writtenToGrade ? `${writtenToGrade} jawaban tertulis perlu dinilai` : '',
		readyToPublish.length ? `${readyToPublish.length} penilaian siap diterbitkan` : '',
		hasAutoActivities && !quizReleased ? 'Hasil kuis belum diterbitkan' : '',
	].filter(Boolean);
	return {autoToApprove, writtenToGrade, writtenDrafts, readyToPublish, hasAutoActivities, quizReleased, classReviewed: state.class?.phase === 'reviewed', pending};
}

/** Students who finished every required activity (they see objective results early). */
export function studentsWithAllRequired(state: ScheduledClassState): number {
	const required = state.activities.filter((a) => a.required);
	if (!required.length) return 0;
	const students = new Set(state.attempts.map((a) => a.student));
	let count = 0;
	for (const student of students) {
		if (required.every((activity) => state.attempts.some((t) => t.student === student && t.activity === activity.id && t.status !== 'draft' && t.complete))) count += 1;
	}
	return count;
}

/**
 * What students currently see of automatic results, following the server's
 * `released = resultsReady || (releaseResults && closed/reviewed)` rule.
 */
export function studentVisibilityHints(state: ScheduledClassState): {release: string; approval: string} {
	const finished = studentsWithAllRequired(state);
	const total = state.report.length;
	const hasRequired = state.activities.some((a) => a.required);
	const release = state.class?.releaseResults
		? 'Hasil kuis sudah diterbitkan: semua peserta melihat nilai otomatis, kunci jawaban, dan pembahasan kuis.'
		: hasRequired
			? `Belum diterbitkan. Peserta yang sudah menyelesaikan semua kegiatan wajib (${finished} dari ${total}) sudah melihat nilai otomatis dan kunci jawaban; peserta lain baru melihatnya setelah Anda menerbitkan hasil kuis.`
			: 'Belum diterbitkan. Peserta belum melihat nilai otomatis maupun kunci jawaban sampai Anda menerbitkan hasil kuis.';
	const approval = 'Persetujuan tidak mengatur kapan nilai terlihat. Sebelum disetujui, peserta yang sudah dapat melihat hasil melihat nilai mentah dari kunci jawaban; perubahan "Tandai benar/salah" baru terlihat setelah nilai disetujui.';
	return {release, approval};
}

/** Auto-scored activities of one student that deserve a look without opening the details. */
export type AutoAttention = {activity: string; title: string; score: number | null; overrides: number; wrong: number; low: boolean; approved: boolean};
export const LOW_AUTO_SCORE = 60;

export function autoAttention(entries: {activity: ScheduledActivity; attempt?: ScheduledAttempt; assessment?: ScheduledAssessment; score?: number; wrong: number}[]): AutoAttention[] {
	return entries
		.filter((entry) => entry.attempt)
		.map((entry) => {
			const overrides = Object.keys(entry.assessment?.settingsRevision === 0 ? entry.assessment.answerOverrides || {} : {}).length;
			const score = typeof entry.score === 'number' ? entry.score : null;
			return {activity: entry.activity.id, title: entry.activity.title, score, overrides, wrong: entry.wrong, low: score != null && score < LOW_AUTO_SCORE, approved: autoApproved(entry.attempt, entry.assessment)};
		})
		.filter((item) => item.overrides > 0 || item.low);
}

/** Written answers of one attempt that an AI draft can review (server mirrors this). */
export function writtenItemsOf(
	snapshot: {title?: string; content?: string; worksheet?: {items?: {id: string; prompt?: string}[]; answerKey?: {items?: Record<string, {mode?: string; modelAnswer?: string; rubric?: string}>}}},
	answers: Record<string, unknown> | null | undefined,
): {prompt: string; answer: string; modelAnswer: string; rubric: string}[] {
	const items = snapshot.worksheet?.items || [];
	const keys = snapshot.worksheet?.answerKey?.items || {};
	const values = (answers || {}) as {responses?: Record<string, unknown>; text?: unknown};
	if (!items.length) {
		const text = typeof values.text === 'string' ? values.text.trim() : '';
		return text ? [{prompt: snapshot.content || snapshot.title || '', answer: text, modelAnswer: '', rubric: ''}] : [];
	}
	return items
		.filter((item) => keys[item.id]?.mode !== 'exact')
		.map((item) => {
			const key = keys[item.id];
			const raw = values.responses?.[item.id];
			return {
				prompt: item.prompt || '',
				answer: typeof raw === 'string' ? raw : raw == null ? '' : String(raw),
				modelAnswer: key?.mode === 'reference' ? key.modelAnswer || '' : '',
				rubric: key?.mode === 'reference' ? key.rubric || '' : '',
			};
		})
		.filter((item) => item.answer.trim());
}

/** Model answers + guidance of a written activity, for rubric suggestions. */
export function referenceItemsOf(snapshot: Parameters<typeof writtenItemsOf>[0]): {prompt: string; modelAnswer: string; rubric: string}[] {
	const keys = snapshot.worksheet?.answerKey?.items || {};
	return (snapshot.worksheet?.items || [])
		.filter((item) => keys[item.id]?.mode !== 'exact')
		.map((item) => {
			const key = keys[item.id];
			return {prompt: item.prompt || '', modelAnswer: key?.mode === 'reference' ? key.modelAnswer || '' : '', rubric: key?.mode === 'reference' ? key.rubric || '' : ''};
		});
}
