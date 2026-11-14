/**
 * Staleness of a Tugas AI draft: was it generated from the text the lecturer
 * sees now? Server-only (uses node crypto) and pure otherwise, so the
 * participants list, the draft loader and bulk publish all share one rule.
 *
 * Rule (documented, conservative):
 *  1. The draft stores `inputTextHash = sha256(evidenceText)`. The student part
 *     of the evidence text is `submission.content` (or the transcript for
 *     speaking), clipped to MAX_TEXT_CHARS - see `studentTextOf`.
 *  2. If sha256(current student text) equals the stored hash: current.
 *  3. If it differs and the evidence could NOT have included attachment OCR
 *     (the text is long enough that generation never re-read the files), the
 *     draft was made from other text: stale.
 *  4. If it differs but generation may have appended attachment OCR
 *     ("[ISI LAMPIRAN]": files present and text short/pointer), the stored
 *     hash is not comparable without re-running OCR. Fall to the fallback.
 *     Since OCR text is now saved into `submission.content` when generation reads
 *     the attachments, the hash normally matches rule 2 afterwards; rule 4 only
 *     covers drafts made before that or when saving the OCR text failed.
 *  5. Fallback (no hash, or not comparable): stale ONLY when the submission was
 *     updated after the draft was generated AND the draft has findings with
 *     quotes and none of those quotes occurs in the current text. Anything
 *     else is "unknown" and treated as not stale, so we never invalidate
 *     drafts on weak evidence.
 */
import { createHash } from 'crypto';
import { isPointerOnlyContent } from '@/lib/submission-content.server';
import { taskKindForShape } from '@/lib/task-types';

export const MAX_TEXT_CHARS = 12000;

/** Columns of assignment_submissions needed to judge staleness. */
export const STALE_SUBMISSION_FIELDS = 'id,status,transcriptStatus,content,files,transcript,updated';

export type StaleSubmission = {
	content?: string;
	files?: string[];
	transcript?: string;
	updated?: string;
};

export type StaleRow = {
	status?: string;
	inputTextHash?: string;
	generatedAt?: string | null;
	findings?: unknown;
};

export const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The student's own text exactly as generation takes it (before attachment OCR). */
export function studentTextOf(submission: StaleSubmission, isSpeaking: boolean): string {
	return (isSpeaking ? submission.transcript || '' : submission.content || '').slice(0, MAX_TEXT_CHARS);
}

/** True when generation re-reads the attachments and appends their text to the evidence. */
export function generationExtractsAttachments(studentText: string, hasFiles: boolean, isSpeaking: boolean): boolean {
	return !isSpeaking && hasFiles && (isPointerOnlyContent(studentText) || studentText.trim().length < 200);
}

export type DraftCurrency = 'current' | 'stale' | 'unknown';

function quotesOf(findings: unknown): string[] {
	if (!Array.isArray(findings)) return [];
	return findings
		.map((f) => (f && typeof f === 'object' && typeof (f as { quote?: unknown }).quote === 'string' ? (f as { quote: string }).quote.trim() : ''))
		.filter(Boolean);
}

/** Compares a stored draft with the submission as it is now. Only `ready` drafts can be stale. */
export function draftCurrency(input: { row: StaleRow; submission: StaleSubmission; isSpeaking: boolean }): DraftCurrency {
	const { row, submission, isSpeaking } = input;
	if (row.status !== 'ready') return 'current';
	const text = studentTextOf(submission, isSpeaking);
	const hasFiles = (submission.files || []).length > 0;
	if (row.inputTextHash) {
		if (sha256Hex(text) === row.inputTextHash) return 'current';
		if (!generationExtractsAttachments(text, hasFiles, isSpeaking)) return 'stale';
	}
	const generated = Date.parse(row.generatedAt || '');
	const updated = Date.parse(submission.updated || '');
	if (Number.isFinite(generated) && Number.isFinite(updated) && updated > generated) {
		const quotes = quotesOf(row.findings);
		if (quotes.length > 0 && quotes.every((quote) => !text.includes(quote))) return 'stale';
	}
	return 'unknown';
}

export function isDraftStale(input: { row: StaleRow; submission: StaleSubmission; isSpeaking: boolean }): boolean {
	return draftCurrency(input) === 'stale';
}

/** Staleness flag for one submission of an assignment (false when there is no draft). */
export function staleFlagFor(input: {
	assignment: { shape?: string | null };
	submission: StaleSubmission;
	row: StaleRow | null | undefined;
}): boolean {
	if (!input.row) return false;
	const isSpeaking = taskKindForShape((input.assignment.shape || '') as Parameters<typeof taskKindForShape>[0]) === 'speaking';
	return isDraftStale({ row: input.row, submission: input.submission, isSpeaking });
}
