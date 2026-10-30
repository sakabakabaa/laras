/**
 * POST /api/context/check — formative checking context (feature-scoped).
 *
 * Read-only retrieval of lecturer-approved context for the formative
 * "Cek jawaban" flow. The bundle grounds later formative feedback only — it
 * never contains answer keys, verdicts, or grades, and retrieval never
 * mutates any academic record or context approval state.
 *
 * Contract:
 * - Input:  `{ assignmentId }` (authenticated student/lecturer) or
 *   `{ token }` (public-link participant, no account).
 * - Scope:  the assignment's Mata kuliah, Sesi, Sub-CPMK (+ its CPMK).
 * - Sources: only Phase 4 sections marked suitable for AI context, on files
 *   the requester may read (server-side file-access filter), documents only,
 *   marked against the file's active version.
 * - Limits: max 3 sources / 6 sections per file / 6,000 chars per file /
 *   12,000 chars total (echoed in `limits`).
 * - Output: a context bundle with a `bundleId`, exact citations (file, active
 *   version, section, page reference, extraction timestamp), and an explicit
 *   `insufficient` result with an Indonesian reason when no approved readable
 *   source exists — never a guess.
 * - Audit: recorded in `context_retrievals` under the assignment's lecturer
 *   owner; students and public participants can never read audit rows.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import type { Assignment } from '@/lib/assignments';
import { findPublicAssignment } from '@/lib/public-drafts.server';
import {
	authenticateUser,
	cpmkOfSubCpmk,
	retrieveContextBundle,
	type RetrievalScope,
} from '@/lib/context-retrieval.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { assignmentId?: string; token?: string };

/** Scope of one assignment: its course, session, Sub-CPMK, and the CPMK above it. */
async function scopeOfAssignment(assignment: Assignment): Promise<RetrievalScope> {
	return {
		course: assignment.course,
		session: assignment.session || '',
		subCpmk: assignment.subCpmk || '',
		cpmk: await cpmkOfSubCpmk(assignment.subCpmk || ''),
		assignment: assignment.id,
	};
}

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);

	// ── Public-link participant: identity is the link token, no account ──
	if (body.token) {
		const assignment = await findPublicAssignment(body.token.trim());
		if (!assignment) return apiError(404, 'Tugas tidak ditemukan atau tautan publik dimatikan.');
		if (assignment.status !== 'published') {
			return apiError(422, 'Tugas tidak sedang diterbitkan.');
		}
		const bundle = await retrieveContextBundle({
			feature: 'check',
			scope: await scopeOfAssignment(assignment),
			requester: { id: '', role: 'public', label: 'public-link' },
			ownerLecturerId: assignment.owner,
		});
		return json(bundle);
	}

	// ── Authenticated student / lecturer ────────────────────────────────
	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { pb, user } = auth;

	const assignmentId = (body.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) return apiError(422, 'assignmentId tidak valid.');

	// Loaded with the caller's own token so the collection rule applies.
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.status !== 'published') {
		return apiError(422, 'Cek jawaban hanya tersedia saat tugas diterbitkan.');
	}
	if (assignment.checkEnabled === false && (assignment.checkMax || 0) > 0) {
		return apiError(422, 'Dosen belum mengaktifkan Cek jawaban untuk tugas ini.');
	}

	const role = user.role === 'faculty' ? 'faculty' : 'student';
	const bundle = await retrieveContextBundle({
		feature: 'check',
		scope: await scopeOfAssignment(assignment),
		requester: { id: user.id, role, label: `${role}:${user.id}` },
		ownerLecturerId: assignment.owner,
	});
	return json(bundle);
});
