/**
 * Client-safe transcription helpers (Speaking-task Phase 2).
 *
 * The transcript itself is produced server-side (`@/lib/transcription.server`)
 * using the `WHISPER_API_KEY` secret; this module only fires the trigger
 * request and exposes the status type shared by the student and lecturer UI.
 */
import pb from '@/lib/pocketbase-client';

/** Lifecycle of a speaking-submission transcript (mirrors the DB select). */
export type TranscriptStatus = 'pending' | 'processing' | 'ready' | 'failed' | '';

/**
 * Fire-and-forget request to start (or retry) transcription of a speaking
 * submission's audio. The submission is already stored — a failed or
 * unavailable transcription never affects the submission itself. The route
 * is idempotent, so this is safe to call after every draft/final save.
 */
export async function requestTranscription(submissionId: string): Promise<void> {
	const token = pb.authStore.token;
	if (!token || !submissionId) return;
	try {
		await fetch('/api/transcribe', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ submissionId }),
		});
	} catch {
		/* background convenience only — the panel also polls the record */
	}
}
