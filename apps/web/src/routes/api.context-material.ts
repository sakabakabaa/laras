/**
 * POST /api/context/material — material assistance context (feature-scoped).
 *
 * Read-only retrieval of lecturer-approved context for material assistance
 * (help with learning material). Permissions are enforced server-side:
 * a lecturer must own the Mata kuliah; a student must be enrolled in it.
 * The bundle grounds later material assistance only — it never mutates
 * academic records, materials, assignments, grades, submissions, or context
 * approval states.
 *
 * Contract:
 * - Input:  `{ courseId, sessionId?, cpmkId?, subCpmkId? }` — every optional
 *   link is verified to belong to that Mata kuliah before it narrows the
 *   scope (no invented relationships).
 * - Scope:  the Mata kuliah plus the verified Sesi / CPMK / Sub-CPMK links.
 * - Sources: only Phase 4 sections marked suitable for AI context, on files
 *   the requester may read (server-side file-access filter). Documents
 *   contribute capped parsed text; media (image/audio/video) may be cited
 *   without text, clearly labeled — a textless document is dropped.
 * - Limits: max 4 sources / 6 sections per file / 8,000 chars per file /
 *   20,000 chars total (echoed in `limits`).
 * - Output: a context bundle with a `bundleId`, exact citations (file, active
 *   version, section, page reference, extraction timestamp), and an explicit
 *   `insufficient` result with an Indonesian reason when no approved readable
 *   source exists — never a guess.
 * - Audit: recorded in `context_retrievals` under the Mata kuliah's lecturer
 *   owner; students can never read audit rows.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	authenticateUser,
	cpmkOfSubCpmk,
	retrieveContextBundle,
	type RetrievalScope,
} from '@/lib/context-retrieval.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { courseId?: string; sessionId?: string; cpmkId?: string; subCpmkId?: string };

/** Verifies an optional link id belongs to the course; returns '' when absent. */
async function verifiedLink(
	collection: string,
	id: string | undefined,
	courseId: string,
	label: string,
): Promise<string> {
	const value = (id || '').trim();
	if (!value) return '';
	if (!SAFE_ID.test(value)) throw apiError(422, `${label} tidak valid.`);
	try {
		const row = await pocketbaseAdmin.getRecord<{ course?: string }>(collection, value);
		if (row.course !== courseId) throw apiError(422, `${label} tidak termasuk dalam mata kuliah ini.`);
		return value;
	} catch (error) {
		if (error instanceof Response) throw error;
		throw apiError(404, `${label} tidak ditemukan.`);
	}
}

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { user } = auth;

	const body = await readJsonBody<Body>(request);
	const courseId = (body.courseId || '').trim();
	if (!SAFE_ID.test(courseId)) return apiError(422, 'courseId wajib dan harus valid.');

	let course: { id: string; owner: string };
	try {
		course = await pocketbaseAdmin.getRecord<{ id: string; owner: string }>('courses', courseId);
	} catch {
		return apiError(404, 'Mata kuliah tidak ditemukan.');
	}

	// Server-side permission check: faculty must own the course, students
	// must be enrolled in it.
	if (user.role === 'faculty') {
		if (course.owner !== user.id) {
			return apiError(403, 'Hanya pemilik mata kuliah yang dapat mengambil konteks materi.');
		}
	} else {
		const enrollments = await pocketbaseAdmin.listRecords<{ id: string }>('enrollments', {
			filter: `owner = "${user.id}" && course = "${courseId}"`,
			perPage: 1,
		});
		if (enrollments.items.length === 0) {
			return apiError(403, 'Anda belum terdaftar pada mata kuliah ini.');
		}
	}

	// Optional scope narrowing — every link is verified to belong to the course.
	const sessionId = await verifiedLink('class_sessions', body.sessionId, courseId, 'sessionId');
	const cpmkId = await verifiedLink('cpmk', body.cpmkId, courseId, 'cpmkId');
	const subCpmkId = await verifiedLink('sub_cpmk', body.subCpmkId, courseId, 'subCpmkId');

	const role = user.role === 'faculty' ? 'faculty' : 'student';
	const bundle = await retrieveContextBundle({
		feature: 'material',
		scope: {
			course: courseId,
			session: sessionId,
			cpmk: cpmkId || (subCpmkId ? await cpmkOfSubCpmk(subCpmkId) : ''),
			subCpmk: subCpmkId,
		},
		requester: { id: user.id, role, label: `${role}:${user.id}` },
		ownerLecturerId: course.owner,
	});
	return json(bundle);
});
