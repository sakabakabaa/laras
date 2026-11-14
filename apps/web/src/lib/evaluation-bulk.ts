/**
 * Lecturer bulk actions for the Tugas evaluation workspace:
 * "Jalankan AI untuk semua" and "Terbitkan yang siap".
 *
 * AI drafts are generated in the background on the server once requested, so
 * firing every request at once would start dozens of model runs in parallel.
 * `runInWaves` therefore requests a small wave, waits until that wave has
 * settled (or a timeout passes), and only then starts the next one.
 */
import pb from '@/lib/pocketbase-client';
import type { BatchPublishItem } from '@/lib/evaluation-readiness';

export type WaveProgress = { done: number; total: number; failed: number };

export async function runInWaves(
	ids: string[],
	deps: {
		size?: number;
		/** Starts work for one id; false/throw counts as failed. */
		request: (id: string) => Promise<boolean>;
		/** Resolves once the given ids are no longer in progress. */
		settle: (ids: string[]) => Promise<void>;
		onProgress?: (progress: WaveProgress) => void;
		shouldStop?: () => boolean;
	},
): Promise<WaveProgress & { stopped: boolean }> {
	const size = Math.max(1, deps.size ?? 3);
	const progress: WaveProgress = { done: 0, total: ids.length, failed: 0 };
	deps.onProgress?.({ ...progress });
	for (let start = 0; start < ids.length; start += size) {
		if (deps.shouldStop?.()) return { ...progress, stopped: true };
		const wave = ids.slice(start, start + size);
		const started: string[] = [];
		for (const id of wave) {
			let ok = false;
			try {
				ok = await deps.request(id);
			} catch {
				ok = false;
			}
			if (ok) started.push(id);
			else progress.failed += 1;
		}
		if (started.length > 0) await deps.settle(started);
		progress.done += wave.length;
		deps.onProgress?.({ ...progress });
	}
	return { ...progress, stopped: false };
}

function authHeaders(): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
	};
}

/** Asks the server for an AI draft for one submission (same route as "Minta draf AI"). */
export async function requestDraft(submissionId: string, force = false): Promise<boolean> {
	const response = await fetch('/api/evaluation-draft', {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify(force ? { submissionId, force: true } : { submissionId }),
	});
	if (!response.ok) return false;
	const body = (await response.json().catch(() => ({}))) as { status?: string };
	return body.status !== 'error' && body.status !== 'skipped';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until none of the submissions has a pending AI draft (max ~3 minutes). */
export async function waitForDrafts(submissionIds: string[], timeoutMs = 180_000, intervalMs = 4000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	const filter = submissionIds.map((id) => pb.filter('submission = {:id}', { id })).join(' || ');
	while (Date.now() < deadline) {
		await sleep(intervalMs);
		try {
			const rows = await pb.collection('ai_evaluations').getFullList<{ status: string }>({
				filter: `(${filter}) && status = "pending"`,
				fields: 'id,status',
				requestKey: null,
			});
			if (rows.length === 0) return;
		} catch {
			/* keep polling until the deadline */
		}
	}
}

/**
 * Requests AI drafts for every given submission, a few at a time. With
 * `force` (regenerate stale drafts) the existing draft is replaced; the
 * lecturer's saved review is kept by the server.
 */
export function runAiForAll(
	submissionIds: string[],
	onProgress: (progress: WaveProgress) => void,
	shouldStop: () => boolean,
	options: { force?: boolean } = {},
) {
	return runInWaves(submissionIds, { size: 3, request: (id) => requestDraft(id, options.force === true), settle: (ids) => waitForDrafts(ids), onProgress, shouldStop });
}

export type BatchPublishResponse = {
	published: number;
	failed: number;
	skipped: number;
	results: BatchPublishItem[];
};

/** Publishes the ready submissions through /api/evaluation-publish-batch. */
export async function publishReadyBatch(assignmentId: string, submissionIds: string[]): Promise<BatchPublishResponse> {
	const response = await fetch('/api/evaluation-publish-batch', {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify({ assignmentId, submissionIds }),
	});
	const body = (await response.json().catch(() => ({}))) as Partial<BatchPublishResponse> & { error?: string; message?: string };
	if (!response.ok) throw new Error(body.message || body.error || 'Penerbitan massal gagal.');
	return { published: body.published ?? 0, failed: body.failed ?? 0, skipped: body.skipped ?? 0, results: body.results ?? [] };
}
