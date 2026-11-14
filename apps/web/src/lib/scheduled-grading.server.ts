/**
 * Server-side helpers for scheduled-class ("Kelas terjadwal") grading aids:
 * the persisted per-answer AI draft and rubric suggestions for a written
 * activity.
 *
 * Authorization mirrors `context()` in scheduled-classes-service.js: only the
 * faculty owner of the course or of the scheduled class may use them. The
 * student's answers, the model answers and the rubric guidance are always
 * read from the stored records, never from the request body.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { generateLiveDraft, parseLiveDraftInput, type LiveDraft, type LiveDraftFailure } from '@/lib/live-answer-review.server';
import { referenceItemsOf, writtenEntriesOf, writtenItemsOf, type ScheduledAiDraftRecord } from '@/lib/scheduled-grading';
import { anchorDraftFindings } from '@/lib/scheduled-answer-marks';
import type { ScheduledSuggestionInput } from '@/lib/rubric-suggestions.server';
import logger from '@/lib/logger.server';

export const SAFE_RECORD_ID = /^[A-Za-z0-9]{5,40}$/;

type ClassRecord = { id: string; session: string; course: string; owner: string; status: string; endsAt?: string };
type ActivityRecord = { id: string; class: string; kind: string; title?: string; snapshot?: Record<string, unknown> | string };
type AttemptRecord = { id: string; class: string; activity: string; student: string; status: string; revision: number; answers?: Record<string, unknown> | string };
type SettingsRecord = { id: string; mode: string; revision: number; criteria?: unknown };
type DraftRecord = { id: string };

const parse = <T>(value: unknown, fallback: T): T => {
	if (typeof value === 'string') {
		try {
			return JSON.parse(value) as T;
		} catch {
			return fallback;
		}
	}
	return (value as T) ?? fallback;
};

const fail = (status: number, message: string): { error: LiveDraftFailure } => ({ error: { status, message } });

/** The caller must own the course of the session or the scheduled class itself. */
export async function authorizeScheduledClass(
	userId: string,
	sessionId: string,
): Promise<{ cls: ClassRecord; courseCode: string } | { error: LiveDraftFailure }> {
	if (!SAFE_RECORD_ID.test(sessionId)) return fail(422, 'Pertemuan tidak valid.');
	try {
		const session = await pocketbaseAdmin.getRecord<{ course?: string }>('class_sessions', sessionId);
		const course = await pocketbaseAdmin.getRecord<{ owner?: string; code?: string }>('courses', session.course || '');
		const list = await pocketbaseAdmin.listRecords<ClassRecord>('scheduled_classes', { filter: `session="${sessionId}"`, perPage: 1 });
		const cls = list.items[0];
		if (!cls) return fail(404, 'Kelas terjadwal tidak ditemukan.');
		if (course.owner !== userId && cls.owner !== userId) return fail(403, 'Hanya dosen pemilik kelas yang dapat memakai asisten penilaian.');
		return { cls, courseCode: course.code || '' };
	} catch {
		return fail(404, 'Pertemuan tidak ditemukan.');
	}
}

async function activityOf(cls: ClassRecord, activityId: string): Promise<ActivityRecord | { error: LiveDraftFailure }> {
	if (!SAFE_RECORD_ID.test(activityId)) return fail(422, 'Kegiatan tidak valid.');
	try {
		const activity = await pocketbaseAdmin.getRecord<ActivityRecord>('scheduled_class_activities', activityId);
		if (activity.class !== cls.id) return fail(403, 'Kegiatan bukan dari kelas ini.');
		if (activity.kind !== 'assignment' && activity.kind !== 'exit_ticket') return fail(422, 'Kegiatan ini tidak dinilai secara tertulis.');
		return activity;
	} catch {
		return fail(404, 'Kegiatan tidak ditemukan.');
	}
}

const snapshotOf = (activity: ActivityRecord) => {
	const snapshot = parse<Record<string, unknown>>(activity.snapshot, {});
	return { ...snapshot, title: (snapshot.title as string) || activity.title || '' } as Parameters<typeof writtenItemsOf>[0];
};

/** Model answers + guidance of one written activity, for rubric suggestions. */
export async function scheduledSuggestionInput(
	userId: string,
	sessionId: string,
	activityId: string,
): Promise<{ input: ScheduledSuggestionInput } | { error: LiveDraftFailure }> {
	const authorized = await authorizeScheduledClass(userId, sessionId);
	if ('error' in authorized) return authorized;
	const activity = await activityOf(authorized.cls, activityId);
	if ('error' in activity) return activity;
	const snapshot = snapshotOf(activity);
	return { input: { title: snapshot.title || '', content: snapshot.content || '', items: referenceItemsOf(snapshot) } };
}

type Criterion = { id: string; label: string; maxPoints: number };

function cleanCriteria(value: unknown): Criterion[] {
	if (!Array.isArray(value)) return [];
	return value
		.slice(0, 12)
		.map((raw) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}))
		.map((row) => ({
			id: typeof row.id === 'string' ? row.id.slice(0, 100) : '',
			label: typeof row.label === 'string' ? row.label.trim().slice(0, 200) : '',
			maxPoints: typeof row.maxPoints === 'number' && Number.isFinite(row.maxPoints) ? row.maxPoints : 0,
		}))
		.filter((c) => /^[A-Za-z0-9_-]+$/.test(c.id) && c.label && c.maxPoints > 0);
}

async function upsertDraft(existing: DraftRecord | undefined, fields: Record<string, unknown>) {
	if (existing) await pocketbaseAdmin.updateRecord('scheduled_ai_drafts', existing.id, fields);
	else await pocketbaseAdmin.createRecord('scheduled_ai_drafts', fields);
}

/**
 * Generates and stores the AI draft for one submitted written answer. The
 * rubric of the saved grading settings is used; only while no settings exist
 * may the caller pass the provisional (suggested) criteria it shows.
 */
export async function draftScheduledAttempt(
	userId: string,
	body: { sessionId?: unknown; attemptId?: unknown; criteria?: unknown },
): Promise<{ draft: LiveDraft; record: ScheduledAiDraftRecord } | { error: LiveDraftFailure }> {
	const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
	const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
	if (!SAFE_RECORD_ID.test(attemptId)) return fail(422, 'Jawaban tidak valid.');
	const authorized = await authorizeScheduledClass(userId, sessionId);
	if ('error' in authorized) return authorized;
	const { cls, courseCode } = authorized;
	const ended = cls.status === 'closed' || cls.status === 'reviewed' || (cls.status === 'scheduled' && Date.parse(cls.endsAt || '') <= Date.now());
	if (!ended) {
		// Phase is enforced again on save; drafting during the class is not offered.
		return fail(400, 'Draf AI tersedia setelah kelas selesai.');
	}
	let attempt: AttemptRecord;
	try {
		attempt = await pocketbaseAdmin.getRecord<AttemptRecord>('scheduled_activity_attempts', attemptId);
	} catch {
		return fail(404, 'Jawaban tidak ditemukan.');
	}
	if (attempt.class !== cls.id) return fail(403, 'Jawaban bukan dari kelas ini.');
	if (attempt.status === 'draft') return fail(400, 'Jawaban belum dikumpulkan.');
	const activity = await activityOf(cls, attempt.activity);
	if ('error' in activity) return activity;
	const snapshot = snapshotOf(activity);
	const items = writtenEntriesOf(snapshot, parse<Record<string, unknown>>(attempt.answers, {}));
	const settingsList = await pocketbaseAdmin.listRecords<SettingsRecord>('scheduled_grading_settings', {
		filter: `class="${cls.id}" && activity="${activity.id}"`,
		perPage: 1,
	});
	const settings = settingsList.items[0];
	const criteria = settings ? (settings.mode === 'rubric' ? cleanCriteria(parse(settings.criteria, [])) : []) : cleanCriteria(body.criteria);
	const parsed = parseLiveDraftInput({ sessionId, activityTitle: snapshot.title, items, criteria });
	if ('error' in parsed) return parsed;
	const existing = (
		await pocketbaseAdmin.listRecords<DraftRecord>('scheduled_ai_drafts', { filter: `attempt="${attempt.id}"`, perPage: 1 })
	).items[0];
	const base = {
		class: cls.id,
		activity: activity.id,
		attempt: attempt.id,
		student: attempt.student,
		attemptRevision: attempt.revision,
		settingsRevision: settings?.revision || 0,
	};
	const result = await generateLiveDraft(parsed.input, courseCode);
	if ('error' in result) {
		try {
			await upsertDraft(existing, { ...base, status: 'failed', error: result.error.message.slice(0, 500), draft: {} });
		} catch (error) {
			logger.error('scheduled ai draft failure not stored', error);
		}
		return result;
	}
	// Offsets are verified against the answers exactly as the model saw them
	// (trimmed/clipped, same order as `items`); map them back to each answer.
	const anchored = anchorDraftFindings(
		result.draft.findings.slice(0, 8),
		parsed.input.items.map((item, index) => ({ id: items[index]?.id || '', answer: item.answer })),
	);
	const stored = {
		summary: result.draft.summary,
		feedback: result.draft.feedback,
		suggestedScore: result.draft.suggestedScore,
		criterionScores: result.draft.criterionScores,
		findings: anchored.findings,
		answers: anchored.answers,
		truncated: result.draft.truncated,
	};
	try {
		await upsertDraft(existing, { ...base, status: 'ready', error: '', draft: stored });
	} catch (error) {
		logger.error('scheduled ai draft not stored', error);
		return fail(500, 'Draf AI dibuat tetapi belum tersimpan. Coba lagi.');
	}
	return {
		draft: result.draft,
		record: { attempt: attempt.id, activity: activity.id, status: 'ready', attemptRevision: attempt.revision, settingsRevision: base.settingsRevision, draft: stored },
	};
}
