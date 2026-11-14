import pb from '@/lib/pocketbase-client';
import type { LiveDraft } from '@/lib/live-answer-review.server';

export type { LiveDraft };

export type LiveDraftRequest = {
	sessionId: string;
	activityTitle: string;
	items: { prompt: string; answer: string; modelAnswer?: string; rubric?: string }[];
	criteria: { id: string; label: string; maxPoints: number }[];
};

/** Asks for an AI recommendation for one written live-class activity. Nothing is saved. */
export async function requestLiveDraft(body: LiveDraftRequest): Promise<LiveDraft> {
	const response = await fetch('/api/live-answer-review', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
		},
		body: JSON.stringify(body),
	});
	const data = (await response.json().catch(() => ({}))) as { draft?: LiveDraft; message?: string; error?: string };
	if (!response.ok || !data.draft) {
		throw new Error(data.message || data.error || 'Draf AI belum dapat dibuat. Penilaian manual tetap dapat dilakukan.');
	}
	return data.draft;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Converts a 0–100 suggestion to points out of `max`, never above `max`. */
export function pointsFromPercent(percent: number, max: number): number {
	return Math.min(max, Math.max(0, round2((percent / 100) * max)));
}
