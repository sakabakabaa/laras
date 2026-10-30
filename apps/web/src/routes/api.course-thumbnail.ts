/**
 * POST /api/course-thumbnail — generate an AI thumbnail for a course and save
 * it onto the course's `thumbnail` file field.
 *
 * Faculty-only and ownership-verified (same pattern as api.rubric-suggestions).
 * The model call spends site credits, so a verified email is required.
 *
 * Never blocks course creation: the RPS editor fires this after a course is
 * saved, and a failure simply leaves the gradient cover in place. The route
 * itself returns a clear ok/error so the UI can show a toast.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { generateCourseThumbnail } from '@/lib/course-thumbnail.server';
import type { Course } from '@/lib/learning';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { courseId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { pb, user } = auth;

	if (user.role !== 'faculty') {
		return apiError(403, 'Hanya dosen yang dapat membuat thumbnail mata kuliah.');
	}
	const record = pb.authStore.record as { verified?: boolean } | null;
	if (!record?.verified) {
		return apiError(403, 'Verifikasi email Anda sebelum memakai asisten AI.');
	}

	const body = await readJsonBody<Body>(request);
	const courseId = (body.courseId || '').trim();
	if (!SAFE_ID.test(courseId)) {
		return apiError(422, 'courseId wajib dan harus valid.');
	}

	let course: Course;
	try {
		course = await pb.collection('courses').getOne<Course>(courseId);
	} catch {
		return apiError(404, 'Mata kuliah tidak ditemukan.');
	}

	if (course.owner !== user.id) {
		return apiError(403, 'Hanya dosen pemilik yang dapat membuat thumbnail.');
	}

	const generated = await generateCourseThumbnail(
		course.title,
		course.code || '',
		course.description || '',
	);

	if (!generated) {
		return json({ ok: false, error: 'Thumbnail tidak dapat dibuat. Gradient default tetap dipakai.' });
	}

	// Save the generated image bytes onto the thumbnail file field through the
	// owner-scoped courses collection rules.
	const fd = new FormData();
	fd.append('thumbnail', new Blob([Uint8Array.from(generated.buffer)], { type: generated.mime }), generated.filename);

	try {
		await pb.collection('courses').update(courseId, fd);
	} catch (error) {
		return json({
			ok: false,
			error: `Gagal menyimpan thumbnail: ${error instanceof Error ? error.message : String(error)}`,
		});
	}

	return json({ ok: true });
});
