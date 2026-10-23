/**
 * Media transcription for the Manajemen berkas parser.
 *
 * Audio uploads (mp3/wav/m4a/aac/ogg/flac) previously fell into the parser's
 * "unsupported format" bucket even though the platform already runs a Whisper
 * speech-to-text service for speaking assignments. This helper exposes that
 * service for arbitrary library audio.
 *
 * It deliberately shares the same OpenAI-compatible endpoint and environment
 * variables as `lib/transcription.server.ts` (HROUTER_API_KEY / HROUTER_BASE_URL
 * / HROUTER_STT_MODEL) so there is a single place the STT provider is configured
 * — but it is parameterised by language rather than hard-coding the German used
 * by the language-course speaking tasks.
 *
 * Like the submission flow, transcription NEVER throws for a missing key or a
 * provider error: callers get a typed failure they can turn into a clear
 * Indonesian status message. The stored original is never touched.
 */

/** Whisper's per-request ceiling is ~25 MB; refuse bigger uploads up front. */
export const STT_MAX_BYTES = 24 * 1024 * 1024;

/** Audio containers we hand to the STT provider. */
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "flac",
  "webm",
]);

/** Video containers are preview-only: no audio extraction is available offline. */
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm"]);

/** MIME type for a given audio extension, so the provider sniffs it correctly. */
const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
};

export const isAudioExtension = (extension: string): boolean =>
  AUDIO_EXTENSIONS.has(extension.toLowerCase());

export const isVideoExtension = (extension: string): boolean =>
  VIDEO_EXTENSIONS.has(extension.toLowerCase());

export type TranscriptionOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string; retryable: boolean };

/** Self-hosted Whisper sidecar (speaches / [OI] audio API). */
export const whisperUrl = (): string =>
  (process.env.WHISPER_URL || "").replace(/\/+$/, "");

/** True when any STT provider is configured in this environment. */
export const isTranscriptionConfigured = (): boolean =>
  Boolean(whisperUrl() || process.env.HROUTER_API_KEY);

const NOT_CONFIGURED_REASON =
  "Layanan transkripsi belum dikonfigurasi pada server ini. Berkas audio tetap tersimpan dan dapat diputar.";

/**
 * Transcribes an audio buffer through the platform's Whisper endpoint.
 *
 * `language` is an ISO-639-1 hint ('id', 'de', 'en', …). Passing '' lets the
 * provider auto-detect, which is the sensible default for a general library.
 */
export async function transcribeAudio(
  bytes: Buffer,
  filename: string,
  extension: string,
  language = "",
): Promise<TranscriptionOutcome> {
  // The local sidecar needs no credentials; the hosted router needs its key.
  const local = whisperUrl();
  const apiKey = process.env.HROUTER_API_KEY;
  if (!local && !apiKey)
    return { ok: false, reason: NOT_CONFIGURED_REASON, retryable: false };

  if (bytes.byteLength > STT_MAX_BYTES) {
    return {
      ok: false,
      reason:
        "Rekaman melebihi batas transkripsi otomatis (maks. 24 MB). Berkas asli tetap tersimpan dan dapat diputar.",
      retryable: false,
    };
  }

  const baseUrl = (
    process.env.HROUTER_BASE_URL || "https://router.hostinger.com/v1"
  ).replace(/\/+$/, "");
  const endpoint = local
    ? `${local}/v1/audio/transcriptions`
    : `${baseUrl}/audio/transcriptions`;
  const form = new FormData();
  form.set(
    "model",
    local
      ? process.env.WHISPER_MODEL || "Systran/faster-whisper-small"
      : process.env.HROUTER_STT_MODEL || "whisper-1",
  );
  form.set("response_format", "json");
  if (language) form.set("language", language);
  form.set(
    "file",
    new Blob([new Uint8Array(bytes)], {
      type: AUDIO_MIME[extension.toLowerCase()] || "application/octet-stream",
    }),
    filename || `audio.${extension || "bin"}`,
  );

  // Generous but bounded: a lecture clip can take a while on a cold provider.
  const controller = new AbortController();
  // CPU inference is slower than a hosted API; allow long clips locally.
  const timeout = setTimeout(() => controller.abort(), local ? 600_000 : 120_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: local ? {} : { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // Hostinger's edge currently challenges multipart uploads on this path
      // (Cloudflare "Just a moment"), even though the API requires multipart.
      // That is a provider-side block: retrying cannot help the lecturer.
      if (/just a moment|cf-chl|cloudflare/i.test(detail)) {
        return {
          ok: false,
          reason:
            "Layanan transkripsi Hostinger memblokir permintaan otomatis (Cloudflare). Hubungi administrator untuk membuka endpoint audio.",
          retryable: false,
        };
      }
      // 401/403 mean the key is wrong — retrying will not help the lecturer.
      const authIssue = response.status === 401 || response.status === 403;
      return {
        ok: false,
        reason: authIssue
          ? "Layanan transkripsi menolak kredensial server. Hubungi administrator."
          : `Transkripsi gagal (HTTP ${response.status}). ${detail.slice(0, 120)}`.trim(),
        retryable: !authIssue,
      };
    }
    const result = (await response.json()) as { text?: unknown };
    const text = typeof result.text === "string" ? result.text.trim() : "";
    if (!text) {
      return {
        ok: false,
        reason:
          "Transkripsi tidak menghasilkan teks — rekaman mungkin tanpa suara yang jelas. Periksa rekaman secara langsung.",
        retryable: true,
      };
    }
    return { ok: true, text };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        reason: "Transkripsi memakan waktu terlalu lama. Coba lagi nanti.",
        retryable: true,
      };
    }
    return {
      ok: false,
      reason: "Transkripsi gagal karena gangguan jaringan. Coba lagi nanti.",
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
