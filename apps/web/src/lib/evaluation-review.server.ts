/**
 * Phase 2/3 (evaluasi dosen) — shared server helpers for the lecturer review
 * and publish routes: target loading (authentication, ownership,
 * formality) and findings validation against the student's own submitted
 * text. Both routes enforce the exact same rules, so what the lecturer
 * reviews is exactly what can be published.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { taskKindForShape } from '@/lib/task-types';
import { speakingTranscriptUnavailable } from '@/lib/evaluation-scoring';
import { sanitizeTaxonomy, type EvalSeverity, type ReviewFinding, type ReviewSource, type ReviewStatus } from '@/lib/ai-evaluation';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;
const MAX_REVIEW_FINDINGS = 40;

const SEVERITIES: EvalSeverity[] = ['minor', 'major'];
const SOURCES: ReviewSource[] = ['ai', 'lecturer'];
const STATUSES: ReviewStatus[] = ['pending', 'approved', 'edited', 'rejected', 'manual'];

export type EvaluationTarget = {
	user: { id: string; role?: string };
	assignment: Assignment;
	recordId: string;
	content: string;
	submissionStatus: string;
	/** Speaking submissions only: transcript readiness. '' for non-speaking. */
	transcriptStatus: string;
	/** Speaking submissions only: last transcription error message. */
	transcriptError: string;
	/** True when a speaking submission's transcript is not ready — the work
	 *  cannot be graded yet and must not be silently scored at the completion cap. */
	ungradable: boolean;
};

export type TargetError = { status: number; message: string };

/**
 * Authenticates the caller and loads the submission + its assignment for a
 * review/publish request. Only the lecturer who owns the assignment may
 * proceed, and only for Tugas formal — Latihan formatif is never evaluated.
 */
export async function loadEvaluationTarget(
	request: Request,
	body: { submissionId?: unknown },
): Promise<{ error: TargetError } | { target: EvaluationTarget }> {
	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };
	return loadEvaluationTargetForUser({ id: auth.user.id, role: auth.user.role }, body.submissionId);
}

/**
 * Loads one submission + its assignment for an already-authenticated caller,
 * enforcing the same ownership and formality rules as `loadEvaluationTarget`.
 * The batch publish route authenticates once and calls this per submission.
 */
export async function loadEvaluationTargetForUser(
	user: { id: string; role?: string },
	rawSubmissionId: unknown,
): Promise<{ error: TargetError } | { target: EvaluationTarget }> {
	const submissionId = typeof rawSubmissionId === 'string' ? rawSubmissionId.trim() : '';
	if (!SAFE_ID.test(submissionId)) {
		return { error: { status: 422, message: 'submissionId wajib dan harus valid.' } };
	}

	const recordId = submissionId;
	const collection = 'assignment_submissions';

	let assignmentId = '';
	let content = '';
	let submissionStatus = '';
	let transcript = '';
	let transcriptStatus = '';
	let transcriptError = '';
	try {
		const row = await pocketbaseAdmin.getRecord<{
			assignment: string;
			content: string;
			status: string;
			transcript?: string;
			transcriptStatus?: string;
			transcriptError?: string;
		}>(collection, recordId);
		assignmentId = row.assignment;
		content = row.content || '';
		submissionStatus = row.status || '';
		transcript = row.transcript || '';
		transcriptStatus = row.transcriptStatus || '';
		transcriptError = row.transcriptError || '';
	} catch {
		return { error: { status: 404, message: 'Kiriman tidak ditemukan.' } };
	}

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return { error: { status: 404, message: 'Tugas tidak ditemukan.' } };
	}

	// Only the owning lecturer may review or publish findings for this task.
	if (user.id !== assignment.owner) {
		return {
			error: {
				status: 403,
				message: 'Hanya dosen pemilik tugas yang dapat mengakses evaluasi ini.',
			},
		};
	}
	// Latihan formatif has no findings review or publishing — formal tasks only.
	if (activityTypeOf(assignment) === 'formative') {
		return {
			error: { status: 422, message: 'Evaluasi hanya berlaku untuk Tugas formal.' },
		};
	}

	// Phase 4 — for speaking tasks the approved transcript is the evidence
	// text the lecturer annotates and the server validates quotes against.
	if (taskKindForShape(assignment.shape) === 'speaking') {
		content = transcriptStatus === 'ready' ? transcript : '';
	}
	const ungradable = speakingTranscriptUnavailable(assignment.shape || '', transcriptStatus);

	return {
		target: {
			user: { id: user.id, role: user.role },
			assignment,
			recordId,
			content,
			submissionStatus,
			transcriptStatus,
			transcriptError,
			ungradable,
		},
	};
}

/**
 * Validates the lecturer's findings against the only ground truth there is:
 * the student's own submitted text. A quote that is not an exact substring
 * is dropped — nothing is paraphrased or guessed into storage. Phase 3 adds
 * the optional rubric-criterion assignment per finding.
 *
 * A single invalid finding never breaks the whole evaluation: invalid items
 * (malformed structure, empty note, or a quote that no longer matches the
 * submitted text — e.g. after the student revised their answer) are omitted
 * and counted in `omitted`, while every valid finding is kept. The caller
 * surfaces the omitted count so the lecturer knows something was dropped.
 * Returns `null` only when the request itself is malformed (not an array,
 * or far too many entries) — never because of one bad finding.
 */
export function validateReviewFindings(
	raw: unknown,
	content: string,
): { findings: ReviewFinding[]; omitted: number } | null {
	if (!Array.isArray(raw) || raw.length > MAX_REVIEW_FINDINGS) return null;
	const out: ReviewFinding[] = [];
	const seen = new Set<string>();
	let omitted = 0;
	for (const item of raw) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			omitted++;
			continue;
		}
		const f = item as Record<string, unknown>;
		const id = typeof f.id === 'string' ? f.id.trim() : '';
		if (!id || id.length > 64 || !/^[a-z0-9-]+$/i.test(id) || seen.has(id)) {
			omitted++;
			continue;
		}
		if (!SOURCES.includes(f.source as ReviewSource)) {
			omitted++;
			continue;
		}
		if (!SEVERITIES.includes(f.severity as EvalSeverity)) {
			omitted++;
			continue;
		}
		if (!STATUSES.includes(f.status as ReviewStatus)) {
			omitted++;
			continue;
		}
		if (f.source === 'lecturer' && f.status !== 'manual') {
			omitted++;
			continue;
		}
		if (f.source === 'ai' && f.status === 'manual') {
			omitted++;
			continue;
		}
		const note = typeof f.note === 'string' ? f.note.trim() : '';
		if (!note || note.length > 600) {
			omitted++;
			continue;
		}
		const quote = typeof f.quote === 'string' ? f.quote.trim() : '';
		const declaresInvalidAnchor = f.anchorValid === false;
		// A finding may keep a quote that no longer matches the student text ONLY
		// when it explicitly declares an invalid anchor (Phase 2 — the AI
		// misquoted but the observation is preserved for lecturer review). Any
		// other non-matching quote is omitted (defence in depth against injected
		// or paraphrased quotes); this never changes the scoring rule.
		if (quote && !declaresInvalidAnchor && (quote.length > 300 || !content.includes(quote))) {
			omitted++;
			continue;
		}
		const evidence = typeof f.evidence === 'string' ? f.evidence.trim().slice(0, 600) : '';
		const criterion = typeof f.criterion === 'string' ? f.criterion.trim().slice(0, 200) : '';
		const tax = sanitizeTaxonomy(f.category, f.subcategory);
		const confidence =
			typeof f.confidence === 'number' && Number.isFinite(f.confidence)
				? Math.max(0, Math.min(1, f.confidence))
				: undefined;
		seen.add(id);
		out.push({
			id,
			source: f.source as ReviewSource,
			severity: f.severity as EvalSeverity,
			quote,
			note: note.slice(0, 600),
			evidence,
			status: f.status as ReviewStatus,
			criterion,
			// Phase 2 — structured German L2 feedback preserved through review.
			category: tax.category,
			subcategory: tax.subcategory,
			errorDescription:
				typeof f.errorDescription === 'string' ? f.errorDescription.trim().slice(0, 600) : '',
			correction: typeof f.correction === 'string' ? f.correction.trim().slice(0, 600) : '',
			explanation: typeof f.explanation === 'string' ? f.explanation.trim().slice(0, 1000) : '',
			...(confidence != null ? { confidence } : {}),
			anchorValid: typeof f.anchorValid === 'boolean' ? f.anchorValid : undefined,
			quoteStart: typeof f.quoteStart === 'number' ? f.quoteStart : null,
			quoteEnd: typeof f.quoteEnd === 'number' ? f.quoteEnd : null,
			anchorAmbiguous: typeof f.anchorAmbiguous === 'boolean' ? f.anchorAmbiguous : undefined,
			rejectReason:
				f.status === 'rejected' && typeof f.rejectReason === 'string'
					? f.rejectReason.trim().slice(0, 600)
					: '',
		});
	}
	return { findings: out, omitted };
}
