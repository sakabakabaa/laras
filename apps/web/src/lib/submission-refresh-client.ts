import pb from '@/lib/pocketbase-client';

const BATCH = 4;
export type RefreshOutcome = { refreshed: number; unreadable: number; failed: number; skipped: number };

/**
 * Re-reads the given submissions' attachments with the answer-only OCR, a few at
 * a time (each one runs OCR). Each id is sent exactly once, so submissions that
 * cannot be read are reported and left as they were instead of being retried.
 */
export async function refreshSubmissionText(
	assignmentId: string,
	ids: string[],
	onProgress?: (done: number, total: number) => void,
): Promise<RefreshOutcome> {
	const total: RefreshOutcome = { refreshed: 0, unreadable: 0, failed: 0, skipped: 0 };
	for (let index = 0; index < ids.length; index += BATCH) {
		const batch = ids.slice(index, index + BATCH);
		const response = await fetch('/api/submission-content-refresh', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
			},
			body: JSON.stringify({ assignmentId, ids: batch, force: true }),
		});
		const data = (await response.json().catch(() => ({}))) as {
			outcomes?: { status: string }[];
			message?: string;
			error?: string;
		};
		if (!response.ok) throw new Error(data.message || data.error || 'Teks kiriman gagal diperbarui.');
		for (const outcome of data.outcomes || []) {
			if (outcome.status === 'refreshed') total.refreshed += 1;
			else if (outcome.status === 'unreadable') total.unreadable += 1;
			else if (outcome.status === 'failed') total.failed += 1;
			else total.skipped += 1;
		}
		onProgress?.(Math.min(ids.length, index + batch.length), ids.length);
	}
	return total;
}
