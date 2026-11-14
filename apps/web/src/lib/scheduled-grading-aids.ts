/**
 * Browser calls for the scheduled-class grading aids: the stored per-answer
 * AI draft (single and "Jalankan AI untuk semua") and rubric suggestions for
 * a written activity. Mirrors the Tugas bulk helpers in `evaluation-bulk`.
 */
import pb from '@/lib/pocketbase-client';
import type { WaveProgress } from '@/lib/evaluation-bulk';
import { parseSuggestedCriteria, type SuggestedCriteria } from '@/lib/rubric-suggestions';
import type { ScheduledAiDraftRecord, SettingsCriterion } from '@/lib/scheduled-grading';

function headers(): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
	};
}

/** Generates (or regenerates) and stores the AI draft for one written answer. */
export async function requestScheduledAiDraft(
	sessionId: string,
	attemptId: string,
	criteria: SettingsCriterion[] = [],
): Promise<ScheduledAiDraftRecord> {
	const response = await fetch('/api/live-answer-review', {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ sessionId, attemptId, criteria }),
	});
	const data = (await response.json().catch(() => ({}))) as { record?: ScheduledAiDraftRecord; message?: string; error?: string };
	if (!response.ok || !data.record) {
		throw new Error(data.message || data.error || 'Draf AI belum dapat dibuat. Penilaian manual tetap dapat dilakukan.');
	}
	return data.record;
}

/**
 * "Jalankan AI untuk semua": waves of three concurrent requests, so the model
 * service is not flooded. Each request returns once its draft is stored, so
 * a wave settles when its requests return. Same progress shape as Tugas.
 */
export async function runScheduledAiForAll(
	attemptIds: string[],
	request: (attemptId: string) => Promise<boolean>,
	onProgress: (progress: WaveProgress) => void,
	shouldStop: () => boolean,
	size = 3,
): Promise<WaveProgress & { stopped: boolean }> {
	const progress: WaveProgress = { done: 0, total: attemptIds.length, failed: 0 };
	onProgress({ ...progress });
	for (let start = 0; start < attemptIds.length; start += size) {
		if (shouldStop()) return { ...progress, stopped: true };
		const wave = attemptIds.slice(start, start + size);
		const results = await Promise.all(wave.map((id) => request(id).catch(() => false)));
		progress.done += wave.length;
		progress.failed += results.filter((ok) => !ok).length;
		onProgress({ ...progress });
	}
	return { ...progress, stopped: false };
}

const suggestionCache = new Map<string, Promise<SuggestedCriteria>>();

/** Rubric suggestions for one activity, fetched once per page session. */
export function scheduledRubricSuggestions(sessionId: string, activityId: string, refresh = false): Promise<SuggestedCriteria> {
	const key = `${sessionId}:${activityId}`;
	const cached = suggestionCache.get(key);
	if (cached && !refresh) return cached;
	const request = fetch('/api/rubric-suggestions', {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ scheduledActivity: { sessionId, activityId } }),
	}).then(async (response) => {
		const data = (await response.json().catch(() => ({}))) as { suggestions?: unknown; message?: string; error?: string };
		if (!response.ok) throw new Error(data.message || data.error || 'Saran rubrik belum dapat dibuat.');
		return parseSuggestedCriteria(data.suggestions);
	});
	suggestionCache.set(key, request);
	request.catch(() => suggestionCache.delete(key));
	return request;
}
