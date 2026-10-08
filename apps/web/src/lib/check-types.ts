/**
 * Client-safe shared types for the formative "Cek jawaban" (check answer)
 * workflow. Server-only helpers live in `check-answer.server.ts`; this file
 * must stay importable from components.
 */
import type { AssignmentMode } from '@/lib/assignments';

/** The participant's current response, sent for a formative check. */
export type CheckResponsePayload = {
	/** Task kind the response belongs to (quiz/listening/reading/writing/speaking/generic). */
	kind: string;
	/** Progressive answers for question-based tasks (quiz/listening/reading). */
	answers?: Record<string, number | string | Record<string, string>>;
	/** Direct text response (writing/speaking/generic). */
	content?: string;
	/** Optional external link the student provided. */
	link?: string;
	/** Live word count for writing tasks. */
	wordCount?: number;
	/**
	 * Writing tasks only: a line-numbered copy of the answer matching the
	 * editor's displayed visual lines (including auto-wrapped lines). Used
	 * solely as AI analysis input so the model can reference line numbers in
	 * its feedback. Never stored on the submission — the original `content`
	 * is what gets saved, submitted, and graded.
	 */
	numberedContent?: string;
	/**
	 * Files that are part of this check (name only). The server reads the
	 * stored bytes; names stay on the snapshot so lecturer history shows
	 * which attachment was examined.
	 */
	attachments?: { name: string }[];
};

/** Public-link participant identity (same required fields as public submit). */
export type PublicCheckIdentity = {
	participantName: string;
	nim: string;
	groupName: string;
	members: string;
};

/** Default maximum checks per participant when the lecturer left it unset. */
export const DEFAULT_CHECK_MAX = 5;

/** Progressive hint tiers: each check escalates one level (capped at 3). */
export const CHECK_LEVEL_LABEL: Record<number, string> = {
	1: 'Tingkat 1 · Pertanyaan refleksi',
	2: 'Tingkat 2 · Petunjuk konsep',
	3: 'Tingkat 3 · Petunjuk terarah',
	4: 'Tingkat 4 · Koreksi eksplisit',
};

/**
 * Maximum progressive hint level reached by automatic per-check escalation.
 * Normal checks never auto-escalate beyond this — Level 4 (explicit correction)
 * is shown only when the student explicitly requests it.
 */
export const MAX_PROGRESSIVE_LEVEL = 3;

/** Explicit-correction level — student-requested only, never auto-escalated. */
export const EXPLICIT_CORRECTION_LEVEL = 4;

/**
 * Effective hint level for a normal (non-explicit) check attempt (1→3, capped).
 * Level 4 (explicit correction) is never reached automatically — it is only
 * set when the student explicitly requests it (see EXPLICIT_CORRECTION_LEVEL).
 */
export function checkLevelOf(attempt: number): number {
	return Math.min(Math.max(Math.round(attempt) || 1, 1), MAX_PROGRESSIVE_LEVEL);
}

/**
 * Research-safe interaction metadata for one formative feedback event. Recorded
 * server-side on each check attempt; carries no research judgments, AI
 * confidence, lecturer annotations, or personal data beyond the student's own
 * attempt/submission identifiers and the previous-attempt revision link.
 */
export type FeedbackInteractionMeta = {
	/** True when the student returned for further assistance after a prior check. */
	requestedNextHint: boolean;
	/** True when the student's answer changed since the previous check. */
	revisionSubmitted: boolean;
	/** Previous check_attempt id this one revises ('' for the first check). */
	revisesAttempt: string;
};

/** Stable signature of a response for revision detection (ignores transient AI-analysis aids). */
export function responseSignatureOf(
	response: CheckResponsePayload | null | undefined,
): string {
	if (!response) return '';
	return JSON.stringify({
		content: (response.content || '').trim(),
		answers: response.answers || {},
		link: (response.link || '').trim(),
	});
}

/**
 * Compute interaction metadata for a new check from the previous attempt.
 * - requestedNextHint: the student returned for further assistance after a prior check.
 * - revisionSubmitted: the student's answer changed since the previous check.
 * - revisesAttempt: the previous attempt id, linking the revision chain.
 *
 * Legacy rows without a responseSnapshot are treated as "no prior answer" so
 * the first check after the Phase 8 migration never falsely reports a revision.
 * This never judges whether a revision is correct — that stays with the lecturer.
 */
export function interactionMetaOf(
	previous: { id: string; responseSnapshot: unknown } | null | undefined,
	currentResponse: CheckResponsePayload | null | undefined,
): FeedbackInteractionMeta {
	if (!previous) {
		return { requestedNextHint: false, revisionSubmitted: false, revisesAttempt: '' };
	}
	const prevResponse =
		(previous.responseSnapshot as CheckResponsePayload | undefined) ?? null;
	const prevSig = responseSignatureOf(prevResponse);
	return {
		requestedNextHint: true,
		// Only flag a revision when we actually have a prior answer to compare
		// against — legacy rows without a snapshot cannot be compared.
		revisionSubmitted: prevSig !== '' && prevSig !== responseSignatureOf(currentResponse),
		revisesAttempt: previous.id,
	};
}

/** Effective check maximum for an assignment (unset/0 → default 5). */
export function checkMaxOf(assignment: { checkMax?: number | null }): number {
	return assignment.checkMax && assignment.checkMax > 0
		? Math.round(assignment.checkMax)
		: DEFAULT_CHECK_MAX;
}

/**
 * Stable identity key per assignment participant — the exact same formula as
 * the public submit flow so checks and submissions share one identity.
 */
export function identityOf(mode: AssignmentMode | string, nim: string, groupName: string) {
	if (mode === 'collaborative') return `g:${groupName.trim().toLowerCase()}`;
	return `n:${nim.trim().toLowerCase()}`;
}

/** Enrolled identity key (one per signed-in student account). */
export function enrolledIdentityKey(userId: string) {
	return `u:${userId}`;
}

/** True when the public identity fields satisfy the public-submit rules. */
export function publicIdentityComplete(
	mode: AssignmentMode | string,
	identity: PublicCheckIdentity,
) {
	if (identity.participantName.trim().length < 3) return false;
	if (mode === 'collaborative') {
		return identity.groupName.trim().length >= 2 && identity.members.trim().length >= 3;
	}
	return /^[A-Za-z0-9./-]{4,40}$/.test(identity.nim.trim());
}

/**
 * Task-kind-adapted student note for the Cek jawaban panel (Phase 6).
 * Sets honest expectations per task type — the checking itself stays one
 * unified flow with the same progressive levels and formative boundaries.
 */
export const CHECK_KIND_NOTE: Record<string, string> = {
	quiz: 'Pemeriksaan kuis membantu Anda menalar konsep tiap soal — tidak memberi tahu jawaban yang benar atau salah.',
	reading: 'Pemeriksaan menilai apakah jawaban Anda menjawab teks bacaan — tanpa memberikan jawabannya.',
	listening: 'Pemeriksa tidak dapat mendengarkan audio — jika bukti tidak cukup, pemeriksaan akan mengatakannya. Simak ulang materi bila perlu.',
	writing: 'Pemeriksaan menulis berfokus pada organisasi, kejelasan, tata bahasa, kosakata, dan kelengkapan poin yang diminta.',
	speaking: 'Pemeriksaan hanya menilai aspek yang terbaca dari naskah/transkrip Anda — bukan pelafalan atau kualitas rekaman.',
};
