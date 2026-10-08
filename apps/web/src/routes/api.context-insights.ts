/**
 * POST /api/context/insights — lecturer difficulty-insight context (feature-scoped).
 *
 * Read-only retrieval of lecturer-approved context for the "Wawasan
 * kesulitan" formative aggregates. Faculty-only: the caller must own the
 * assignment or Mata kuliah they request context for. The bundle grounds
 * later insight summaries only — it never contains participant names,
 * answers, attachments, or OCR text, and retrieval never mutates any
 * academic record or context approval state.
 *
 * Contract:
 * - Input:  `{ assignmentId }` or `{ courseId }` (one of them, owned by the
 *   caller).
 * - Scope:  the assignment's Mata kuliah, Sesi, Sub-CPMK (+ its CPMK), or
 *   the Mata kuliah alone.
 * - Sources: only Phase 4 sections marked suitable for AI context, on files
 *   the lecturer may read (server-side file-access filter), documents only,
 *   marked against the file's active version.
 * - Limits: max 5 sources / 8 sections per file / 8,000 chars per file /
 *   24,000 chars total (echoed in `limits`).
 * - Output: a context bundle with a `bundleId`, exact citations (file,
 *   active version, section, page reference, extraction timestamp), and an
 *   explicit `insufficient` result with an Indonesian reason when no approved
 *   readable source exists — never a guess.
 * - Audit: recorded in `context_retrievals` under the requesting lecturer.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateFaculty } from '@/lib/berkas-versions.server';
import type { Assignment } from '@/lib/assignments';
import {
	cpmkOfSubCpmk,
	retrieveContextBundle,
	type RetrievalScope,
} from '@/lib/context-retrieval.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { courseId?: string; assignmentId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateFaculty(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const user = auth.user;

	const body = await readJsonBody<Body>(request);
	let scope: RetrievalScope;

	if (body.assignmentId) {
		const id = body.assignmentId.trim();
		if (!SAFE_ID.test(id)) return apiError(422, 'assignmentId tidak valid.');
		let assignment: Assignment;
		try {
			assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', id);
		} catch {
			return apiError(404, 'Tugas tidak ditemukan.');
		}
		if (assignment.owner !== user.id) {
			return apiError(403, 'Hanya pemilik tugas yang dapat mengambil konteks wawasan.');
		}
		scope = {
			course: assignment.course,
			session: assignment.session || '',
			subCpmk: assignment.subCpmk || '',
			cpmk: await cpmkOfSubCpmk(assignment.subCpmk || ''),
			assignment: assignment.id,
		};
	} else if (body.courseId) {
		const id = body.courseId.trim();
		if (!SAFE_ID.test(id)) return apiError(422, 'courseId tidak valid.');
		let course: { id: string; owner: string };
		try {
			course = await pocketbaseAdmin.getRecord<{ id: string; owner: string }>('courses', id);
		} catch {
			return apiError(404, 'Mata kuliah tidak ditemukan.');
		}
		if (course.owner !== user.id) {
			return apiError(403, 'Hanya pemilik mata kuliah yang dapat mengambil konteks wawasan.');
		}
		scope = { course: course.id };
	} else {
		return apiError(422, 'courseId atau assignmentId wajib diisi.');
	}

	const bundle = await retrieveContextBundle({
		feature: 'insights',
		scope,
		requester: { id: user.id, role: 'faculty', label: `faculty:${user.id}` },
		ownerLecturerId: user.id,
	});
	return json(bundle);
});
