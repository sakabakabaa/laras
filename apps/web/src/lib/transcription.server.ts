/**
 * Speaking-task Phase 2 — server-side transcription of a student's recorded
 * speaking submission through the AssemblyAI transcription service.
 *
 * The transcript is produced entirely on the server: the `ASSEMBLY_API_KEY`
 * secret (also accepted as `ASSEMBLYAI_API_KEY`) never reaches the browser, and the transcript fields on
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
import { CONFIDENCE_LOW_THRESHOLD } from '@/lib/evaluation-scoring';

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

/** Per-word confidence summary stored alongside the transcript (advisory only). */
type ConfidenceSummary = {
	mean: number;
	min: number;
	lowWords: { word: string; confidence: number; start?: number }[];
};

/**
 * Reduces AssemblyAI's per-word `words` array into a compact confidence
 * summary: mean, min, and the list of words below the low-confidence
 * threshold. Advisory only — never used to auto-penalize a grade.
 */
function summarizeConfidence(words: unknown): ConfidenceSummary | null {
	if (!Array.isArray(words) || words.length === 0) return null;
	const valid = words
		.filter(
			(w): w is { text?: string; confidence: number; start?: number } =>
				!!w && typeof w === 'object' && typeof (w as { confidence?: unknown }).confidence === 'number',
		)
		.map((w) => ({
			text: typeof w.text === 'string' ? w.text : '',
			confidence: w.confidence,
			start: typeof w.start === 'number' ? w.start : undefined,
		}));
	if (valid.length === 0) return null;
	const confidences = valid.map((w) => w.confidence);
	const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
	const min = Math.min(...confidences);
	const lowWords = valid
		.filter((w) => w.confidence < CONFIDENCE_LOW_THRESHOLD)
		.slice(0, 50)
		.map((w) => ({
			word: w.text,
			confidence: Math.round(w.confidence * 100) / 100,
			...(w.start != null ? { start: w.start } : {}),
		}));
	return { mean: Math.round(mean * 100) / 100, min: Math.round(min * 100) / 100, lowWords };
}

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
 * Transcribes audio through AssemblyAI. The raw audio bytes are uploaded
 * first (AssemblyAI requires a reachable URL), then a transcript is
 * requested and polled until completion. AssemblyAI accepts webm directly —
 * no audio conversion is performed. The `ASSEMBLYAI_API_KEY` secret stays
 * server-side (never `VITE_`).
 */
async function callAssemblyAI(
	bytes: ArrayBuffer,
	filename: string,
	contentType: string,
): Promise<{ text: string; confidence: ConfidenceSummary | null }> {
	const apiKey = process.env.ASSEMBLY_API_KEY || process.env.ASSEMBLYAI_API_KEY;
	if (!apiKey) throw new Error('ASSEMBLY_API_KEY is not set in apps/web/.env');

	// 1. Upload the raw audio bytes; AssemblyAI returns a reachable upload_url.
	const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
		method: 'POST',
		headers: { authorization: apiKey, 'content-type': contentType || 'application/octet-stream' },
		body: bytes,
	});
	if (!uploadRes.ok) {
		const detail = await uploadRes.text().catch(() => '');
		throw new Error(
			`assemblyai upload failed for ${filename}: ${uploadRes.status} ${uploadRes.statusText} ${detail.slice(0, 200)}`,
		);
	}
	const uploadBody = (await uploadRes.json()) as { upload_url?: string };
	const uploadUrl = uploadBody.upload_url;
	if (!uploadUrl) throw new Error('AssemblyAI upload did not return an upload_url.');

	// 2. Request a transcript (German language code).
	const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
		method: 'POST',
		headers: {
			authorization: apiKey,
			'content-type': 'application/json',
		},
		body: JSON.stringify({ audio_url: uploadUrl, language_code: 'de' }),
	});
	if (!transcriptRes.ok) {
		const detail = await transcriptRes.text().catch(() => '');
		throw new Error(
			`assemblyai transcript request failed: ${transcriptRes.status} ${transcriptRes.statusText} ${detail.slice(0, 200)}`,
		);
	}
	const transcriptBody = (await transcriptRes.json()) as { id?: string };
	const transcriptId = transcriptBody.id;
	if (!transcriptId) throw new Error('AssemblyAI did not return a transcript id.');

	// 3. Poll every 3s until completed or error, capped at 180s.
	const deadline = Date.now() + 180_000;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 3000));
		const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
			headers: { authorization: apiKey },
		});
		if (!pollRes.ok) {
			const detail = await pollRes.text().catch(() => '');
			throw new Error(
				`assemblyai poll failed: ${pollRes.status} ${pollRes.statusText} ${detail.slice(0, 200)}`,
			);
		}
		const pollBody = (await pollRes.json()) as {
			status?: string;
			text?: string;
			error?: string;
			words?: unknown;
		};
		if (pollBody.status === 'completed') {
			return {
				text: (pollBody.text || '').trim(),
				confidence: summarizeConfidence(pollBody.words),
			};
		}
		if (pollBody.status === 'error') {
			throw new Error(`AssemblyAI transcription failed: ${pollBody.error || 'unknown error'}`);
		}
	}
	throw new Error('AssemblyAI transcription timed out after 180s.');
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
		const { text, confidence } = await callAssemblyAI(bytes, filename, contentType);

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
