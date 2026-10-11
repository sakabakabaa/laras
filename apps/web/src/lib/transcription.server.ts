/**
 * Speaking-task Phase 2 — server-side transcription of a student's recorded
 * speaking submission through Hostinger AI Router's Whisper endpoint.
 *
 * The transcript is produced entirely on the server: the `HROUTER_API_KEY`
 * secret never reaches the browser, and the transcript fields on
 * `assignment_submissions` are locked against student writes (see migration
 * `1790845100_speaking_transcript_phase2.js`). Students and lecturers only
 * read the resulting `transcriptStatus` / `transcript` / `transcriptError`.
 *
 * Safety contract (mirrors `ai-evaluation.server.ts`):
 * - Transcription NEVER blocks or breaks the submission flow. `queueTranscription`
 *   only writes a fast `pending` row and kicks off the analysis in the
 *   background; every failure is caught and recorded as a `failed` row.
 * - No grade, feedback, or submission status is ever written — only the
 *   transcript fields. The audio itself is never modified.
 * - Only enrolled speaking submissions are transcribed (the recorder is
 *   enrolled-student-only). Public submissions keep their existing flow.
 */
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

const AUDIO_RE = /\.(webm|mp4|m4a|mp3|wav|ogg|aac|flac)$/i;

/** True for audio filenames (browser recordings + uploaded audio). */
export const isAudioName = (name: string) => AUDIO_RE.test(name);

/** Same origin the admin client uses. File bytes are read here first. */
const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/** Public proxy fallback when the process cannot reach PocketBase directly. */
const publicFilesOrigin = () => {
	const domain = process.env.WEBSITE_DOMAIN;
	return domain ? `https://${domain}/hcgi/platform` : '';
};

type SubmissionRow = {
	id: string;
	assignment: string;
	owner: string;
	files: string[];
	transcript?: string;
	transcriptStatus?: string;
	transcriptError?: string;
	transcriptFile?: string;
	transcriptConfidence?: unknown;
	updated: string;
};

const contentTypeFor = (filename: string, header: string | null) => {
	const headerType = (header || '').split(';')[0].trim().toLowerCase();
	if (headerType.startsWith('audio/') || headerType.startsWith('video/')) return headerType;
	if (/\.wav$/i.test(filename)) return 'audio/wav';
	if (/\.mp3$/i.test(filename)) return 'audio/mpeg';
	if (/\.(m4a|mp4|aac)$/i.test(filename)) return 'audio/mp4';
	if (/\.ogg$/i.test(filename)) return 'audio/ogg';
	if (/\.flac$/i.test(filename)) return 'audio/flac';
	return 'audio/webm';
};

const looksLikeAudio = (bytes: ArrayBuffer) => {
	if (bytes.byteLength < 64) return false;
	const head = new Uint8Array(bytes.slice(0, 12));
	const ascii = String.fromCharCode(...head);
	if (ascii.startsWith('<') || ascii.startsWith('{')) return false;
	return true;
};

/**
 * Fetch the raw bytes of one stored audio file using a short-lived superuser
 * file token, so the audio never has to be publicly readable to be transcribed.
 * Tries the local PocketBase URL first (the path that already writes transcript
 * fields), then the public site proxy.
 */
async function fetchAudioBytes(
	submissionId: string,
	filename: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
	const token = await pocketbaseAdmin.getFileToken();
	const path = `/api/files/assignment_submissions/${submissionId}/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`;
	const origins = [pocketbaseUrl(), publicFilesOrigin()].filter(Boolean);
	let lastError = 'audio fetch failed';
	for (const origin of origins) {
		try {
			const response = await fetch(`${origin}${path}`);
			if (!response.ok) {
				lastError = `audio fetch failed: ${response.status} ${response.statusText}`;
				continue;
			}
			const bytes = await response.arrayBuffer();
			if (!looksLikeAudio(bytes)) {
				lastError = 'audio fetch returned a page, not audio';
				continue;
			}
			return {
				bytes,
				contentType: contentTypeFor(filename, response.headers.get('content-type')),
			};
		} catch (error) {
			lastError = error instanceof Error ? error.message : 'audio fetch failed';
		}
	}
	throw new Error(lastError);
}

/**
 * Transcribes the audio directly through Hostinger AI Router's OpenAI-compatible
 * Whisper endpoint. No public upload URL or audio conversion is needed. Whisper
 * does not return per-word confidence values, so confidence stays null rather
 * than being inferred.
 */
async function callHostingerWhisper(
	bytes: ArrayBuffer,
	filename: string,
	contentType: string,
): Promise<{ text: string; confidence: null }> {
	const apiKey = process.env.HROUTER_API_KEY;
	if (!apiKey) throw new Error('HROUTER_API_KEY is not set');
	const baseUrl = (process.env.HROUTER_BASE_URL || 'https://router.hostinger.com/v1').replace(/\/+$/, '');
	const form = new FormData();
	form.set('model', process.env.HROUTER_STT_MODEL || 'whisper-1');
	form.set('language', 'de');
	form.set('response_format', 'json');
	form.set('file', new Blob([new Uint8Array(bytes)], { type: contentType || 'application/octet-stream' }), filename);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 90_000);
	try {
		const response = await fetch(`${baseUrl}/audio/transcriptions`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}` },
			body: form,
			signal: controller.signal,
		});
		if (!response.ok) {
			const detail = await response.text().catch(() => '');
			throw new Error(`Hostinger Whisper request failed for ${filename} (HTTP ${response.status}) ${detail.slice(0, 200)}`);
		}
		const result = await response.json() as { text?: unknown };
		return { text: typeof result.text === 'string' ? result.text.trim() : '', confidence: null };
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw new Error('Hostinger Whisper transcription timed out after 90s.');
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * The background transcription itself. Every failure becomes a recorded
 * `failed` row — the submission and its audio are never affected.
 */
const studentTranscriptError = (error: unknown) => {
	const message = error instanceof Error ? error.message : '';
	if (/API_KEY is not set/i.test(message)) {
		return 'Layanan transkripsi belum siap. Coba lagi nanti.';
	}
	if (/audio fetch/i.test(message)) {
		return 'Berkas audio tidak dapat dibaca untuk transkripsi. Coba unggah ulang, atau dosen dapat meninjau audio secara langsung.';
	}
	if (/timed out/i.test(message)) {
		return 'Transkripsi memakan waktu terlalu lama. Coba lagi, atau dosen dapat meninjau audio secara langsung.';
	}
	return 'Transkripsi gagal. Coba lagi, atau dosen dapat meninjau audio secara langsung.';
};

export async function runTranscription(submissionId: string): Promise<void> {
	try {
		const submission = await pocketbaseAdmin.getRecord<SubmissionRow>(
			'assignment_submissions',
			submissionId,
		);
		const audio = (submission.files || []).filter(isAudioName);
		if (audio.length === 0) {
			await pocketbaseAdmin.updateRecord('assignment_submissions', submissionId, {
				transcriptStatus: 'failed',
				transcriptError: 'Tidak ada berkas audio pada pengumpulan ini.',
				transcript: '',
				transcriptFile: '',
			});
			return;
		}

		// Transcribe the first audio file. Multiple clips are uncommon for a
		// single speaking attempt; the transcribed filename is stored so a
		// later re-run can detect a replaced recording.
		const filename = audio[0];
		await pocketbaseAdmin.updateRecord('assignment_submissions', submissionId, {
			transcriptStatus: 'processing',
			transcriptError: '',
			transcriptFile: filename,
		});

		const { bytes, contentType } = await fetchAudioBytes(submissionId, filename);
		const { text, confidence } = await callHostingerWhisper(bytes, filename, contentType);

		if (!text) {
			await pocketbaseAdmin.updateRecord('assignment_submissions', submissionId, {
				transcriptStatus: 'failed',
				transcriptError: 'Layanan transkripsi tidak menghasilkan teks. Coba lagi.',
				transcript: '',
			});
			return;
		}

		await pocketbaseAdmin.updateRecord('assignment_submissions', submissionId, {
			transcriptStatus: 'ready',
			transcript: text.slice(0, 20000),
			transcriptError: '',
			transcriptConfidence: confidence,
		});
	} catch (error) {
		logger.error('speaking transcription failed', error instanceof Error ? error.message : error);
		try {
			await pocketbaseAdmin.updateRecord('assignment_submissions', submissionId, {
				transcriptStatus: 'failed',
				transcriptError: studentTranscriptError(error),
			});
		} catch {
			/* the row is already in its safest state — nothing more to do */
		}
	}
}

/**
 * Prepares (idempotently) and kicks off a background transcription. Fast and
 * never throws: the analysis itself runs in the background, so the calling
 * submission flow is never blocked or broken.
 *
 * Re-runs when the previous attempt failed, when no attempt exists yet, or
 * when the transcribed audio file is no longer present (the recording was
 * replaced). A `processing` or still-valid `ready` row is left untouched.
 */
export async function queueTranscription(
	submissionId: string,
): Promise<{ queued: boolean; status: string }> {
	try {
		const submission = await pocketbaseAdmin.getRecord<SubmissionRow>(
			'assignment_submissions',
			submissionId,
		);
		const audio = (submission.files || []).filter(isAudioName);
		if (audio.length === 0) {
			return { queued: false, status: 'no_audio' };
		}
		const updatedAt = Date.parse(submission.updated || '');
		const inFlight =
			submission.transcriptStatus === 'processing' || submission.transcriptStatus === 'pending';
		const stale = Number.isNaN(updatedAt) || Date.now() - updatedAt > 3 * 60 * 1000;
		if (inFlight && !stale) {
			return { queued: false, status: submission.transcriptStatus || 'pending' };
		}
		if (
			submission.transcriptStatus === 'ready' &&
			submission.transcript &&
			audio.includes(submission.transcriptFile || '')
		) {
			return { queued: false, status: 'ready' };
		}

		await pocketbaseAdmin.updateRecord('assignment_submissions', submissionId, {
			transcriptStatus: 'pending',
			transcriptError: '',
		});
		void runTranscription(submissionId);
		return { queued: true, status: 'pending' };
	} catch (error) {
		logger.error('speaking transcription queue failed', error instanceof Error ? error.message : error);
		return { queued: false, status: 'error' };
	}
}
