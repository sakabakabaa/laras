/**
 * POST /api/bulk-paper-extract — extract student answer entries from one
 * scanned answer-sheet image.
 *
 * Faculty-only and ownership-verified. Accepts multipart form data with
 * `assignmentId` and a single `image` (JPEG/PNG/WebP, ≤20MB). Stages the image,
 * asks the platform model to transcribe NIM/name/answer, and returns reviewable
 * entries. Nothing is submitted — the lecturer reviews and confirms in a
 * separate step. The staged image is kept only so it can be attached later;
 * it is deleted by the submit step (or on extraction failure).
 */
import { apiError, json, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { extractImageEntries } from '@/lib/bulk-paper.server';
import type { Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') {
		return apiError(403, 'Hanya dosen yang dapat melakukan input kertas.');
	}

	const form = await request.formData();
	const assignmentId = String(form.get('assignmentId') || '').trim();
	if (!SAFE_ID.test(assignmentId)) {
		return apiError(422, 'ID tugas wajib dan harus valid.');
	}
	const image = form.get('image');
	if (!(image instanceof File)) {
		return apiError(422, 'Gambar wajib diunggah.');
	}
	if (!ALLOWED_IMAGE_TYPES.includes(image.type)) {
		return apiError(422, 'Hanya gambar JPEG, PNG, atau WebP yang didukung.');
	}
	if (image.size > MAX_IMAGE_BYTES) {
		return apiError(422, 'Ukuran gambar maksimal 20MB.');
	}

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.owner !== auth.user.id) {
		return apiError(403, 'Anda bukan pemilik tugas ini.');
	}

	const entries = await extractImageEntries(image, assignment);
	return json({ entries });
});
