/**
 * Shared server helpers for the public-link participant workspace (Phase 3):
 * draft rows, continuation codes, and submitted-row counting.
 *
 * `/api/public-submit` and `/api/check-answer` both use these — the
 * continuation code is a public participant's ONLY credential, so every path
 * (draft save, check, history, submit, restore) must verify it the same way.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type { Assignment } from '@/lib/assignments';

export type PublicSubmissionRow = {
	id: string;
	assignment: string;
	participantName: string;
	nim: string;
	groupName: string;
	members: string;
	identityKey: string;
	content: string;
	link: string;
	files: string[];
	taskAnswers: unknown;
	status: string;
	continuationToken: string;
	autoScore: number | null;
	grade: number | null;
	feedback: string;
	/** Phase 4 — student account this public answer was linked to (server-set). */
	linkedUser?: string;
	/** Phase 4 — enrolled submission created from this public answer (server-set). */
	linkedSubmission?: string;
	created: string;
	updated: string;
};

/** Random 36-hex continuation code — the participant's return credential. */
export function randomContinuationCode() {
	const bytes = new Uint8Array(18);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resolve a public assignment by its unguessable link token. */
export async function findPublicAssignment(token: string): Promise<Assignment | null> {
	const clean = token.trim();
	if (!/^[a-z0-9]{24,64}$/i.test(clean)) return null;
	const rows = await pocketbaseAdmin.listRecords<Assignment>('assignments', {
		perPage: 1,
		filter: `publicToken="${clean}"`,
	});
	const assignment = rows.items[0];
	if (!assignment || !assignment.publicEnabled || assignment.status !== 'published') return null;
	return assignment;
}

/** The public row for one participant identity (draft or final submission). */
export async function findPublicRow(assignmentId: string, identityKey: string) {
	const rows = await pocketbaseAdmin.listRecords<PublicSubmissionRow>('public_submissions', {
		perPage: 1,
		filter: `assignment="${assignmentId}" && identityKey="${identityKey}"`,
	});
	return rows.items[0] || null;
}

/** Final (non-draft) public submissions — drafts never consume the quota. */
export async function countSubmittedPublic(assignmentId: string) {
	const rows = await pocketbaseAdmin.listRecords('public_submissions', {
		perPage: 1,
		filter: `assignment="${assignmentId}" && status != 'draft'`,
	});
	return rows.totalItems;
}

/** True when the provided code matches the row's continuation code. */
export function continuationMatches(row: PublicSubmissionRow, code: string | undefined) {
	const provided = (code || '').trim().toLowerCase();
	return Boolean(row.continuationToken) && provided === row.continuationToken;
}

/** Public file URL for one stored upload (same-site proxy path). */
export function publicFileUrl(rowId: string, filename: string) {
	return `/hcgi/platform/api/files/public_submissions/${rowId}/${encodeURIComponent(filename)}`;
}
