/**
 * POST /api/bulk-paper-submit — submit confirmed paper-answer entries as final
 * student answers.
 *
 * Faculty-only and ownership-verified. Re-resolves each entry to an enrolled
 * student server-side (never trusts a client-sent user id), creates or updates
 * `assignment_submissions` via the superuser client so the collection's
 * owner-only createRule does not block the lecturer, and returns per-entry
 * outcomes. Unmatched/ambiguous entries are skipped and reported — never
 * guessed. Existing submissions are updated in place; grade fields are left
 * untouched for the normal grading flow.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { createPaperSubmissions } from '@/lib/bulk-paper.server';
import type { Assignment } from '@/lib/assignments';
import type { PaperEntry } from '@/lib/bulk-paper';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;
const MAX_ENTRIES = 200;

type Body = { assignmentId?: string; entries?: PaperEntry[] };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') {
		return apiError(403, 'Hanya dosen yang dapat melakukan input kertas.');
	}

	const body = await readJsonBody<Body>(request);
	const assignmentId = (body.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) {
		return apiError(422, 'ID tugas wajib dan harus valid.');
	}

	const rawEntries = Array.isArray(body.entries) ? body.entries : [];
	if (rawEntries.length === 0) return apiError(422, 'Tidak ada entri untuk dikumpulkan.');
	if (rawEntries.length > MAX_ENTRIES) {
		return apiError(422, `Maksimal ${MAX_ENTRIES} entri per pengumpulan.`);
	}

	const entries: PaperEntry[] = rawEntries.map((entry) => ({
		id: String(entry.id || '').slice(0, 64),
		nim: String(entry.nim || '').slice(0, 200),
		name: String(entry.name || '').slice(0, 200),
		answer: String(entry.answer || '').slice(0, 10000),
		...(entry.imageId ? { imageId: String(entry.imageId).slice(0, 64) } : {}),
		...(entry.imageFile ? { imageFile: String(entry.imageFile).slice(0, 250) } : {}),
	}));

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.owner !== auth.user.id) {
		return apiError(403, 'Anda bukan pemilik tugas ini.');
	}

	const results = await createPaperSubmissions(assignment, entries);
	return json({ results });
});
