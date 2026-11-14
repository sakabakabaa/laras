/**
 * Rebuilds a submission's `content` from the file the participant actually
 * uploaded.
 *
 * A submission's `content` is meant to be the answer text — that is what the
 * evaluation prompt, the finding anchors, and the lecturer's "Teks asli" panel
 * all read. Imports that only carried a Drive pointer wrote a metadata note
 * into `content` instead ("Tugas … — file terverifikasi di Drive …"), so the
 * panel and the AI review showed a pointer where the participant's work should
 * be.
 *
 * This rewrites `content` from the stored attachment using the same extraction
 * the student's own `Cek jawaban` flow uses (PDF text layer, otherwise poppler
 * + vision OCR; photos via vision OCR). Nothing is guessed: a file whose text
 * cannot be read keeps the previous content and is reported as unreadable.
 */
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { extractStoredFiles } from '@/lib/feedback.server';

/** Below this, the extraction is a page marker or a stray line, not an answer. */
const MIN_ANSWER_CHARS = 120;
/** Stored answers are prompt context, not an archive: keep them bounded. */
const MAX_ANSWER_CHARS = 8000;

/** The import note that must never be mistaken for someone's work. */
const POINTER_NOTE = /file terverifikasi di Drive|transkrip penuh dapat dilihat via link/i;

export type ContentRefreshOutcome = {
	submissionId: string;
	status: 'refreshed' | 'unreadable' | 'no-file' | 'already-answer' | 'failed';
	chars?: number;
	note?: string;
};

/** True when stored content is only the import/Drive note, not an answer. */
export const isPointerOnlyContent = (content: string): boolean => {
	const text = (content || '').trim();
	if (!text) return true;
	if (POINTER_NOTE.test(text)) return true;
	// A note always names a path or a link; an answer does not.
	return /^\s*\[Kelas .*?\]/i.test(text) && /https?:\/\//.test(text);
};

/**
 * Rewrites one submission's content from its attachment.
 *
 * Safe to re-run: a submission that already holds a real answer is left alone,
 * so this never overwrites text a participant typed with an OCR reading.
 * Pass `force` to rebuild even then (used after a file is re-uploaded).
 */
export async function refreshSubmissionContent(input: {
	submissionId: string;
	collection?: 'assignment_submissions';
	kind?: string;
	force?: boolean;
}): Promise<ContentRefreshOutcome> {
	const collection = input.collection || 'assignment_submissions';
	try {
		const row = await pocketbaseAdmin.getRecord<{ content?: string; files?: string[] }>(
			collection,
			input.submissionId,
		);
		const files = row.files || [];
		if (files.length === 0) return { submissionId: input.submissionId, status: 'no-file' };
		if (!input.force && !isPointerOnlyContent(row.content || '')) {
			return { submissionId: input.submissionId, status: 'already-answer' };
		}

		const extracted = await extractStoredFiles({
			collection,
			recordId: input.submissionId,
			files,
			...(input.kind ? { kind: input.kind } : {}),
		});
		const text = extracted.text.replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_ANSWER_CHARS);
		if (text.length < MIN_ANSWER_CHARS) {
			return {
				submissionId: input.submissionId,
				status: 'unreadable',
				note: extracted.unreadable[0] || 'Lampiran tidak memuat teks yang bisa dibaca.',
			};
		}

		await pocketbaseAdmin.updateRecord(collection, input.submissionId, { content: text });
		return { submissionId: input.submissionId, status: 'refreshed', chars: text.length };
	} catch (error) {
		logger.error('submission content refresh failed', error);
		return { submissionId: input.submissionId, status: 'failed', note: 'Gagal menyiapkan ulang teks kiriman.' };
	}
}
