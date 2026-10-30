import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authFaculty, esc } from '@/lib/student-onboarding.server';
import type { Course, CourseRosterEntry } from '@/lib/learning';
import { isLanguage } from '@/lib/i18n';

/**
 * POST /api/roster-language
 *
 * Lets a lecturer set the dashboard interface language (id/en/de) for a student
 * enrolled in a mata kuliah the lecturer owns. The NIM must belong to a roster
 * entry of that course, and a student account must already exist for the NIM.
 *
 * Faculty-only and ownership-verified. The write goes through the superuser
 * client because `users.language` is locked against student self-update — only
 * the lecturer (server-side) may change a student's dashboard language.
 *
 * POST (not GET) because the response is per-user and must not be edge-cached.
 */

type Body = { courseId?: string; nim?: string; language?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const { user } = await authFaculty(request);
	const body = await readJsonBody<Body>(request);
	const courseId = (body.courseId || '').trim();
	const nim = (body.nim || '').trim();
	const language = (body.language || '').trim();
	if (!courseId || !nim) return apiError(422, 'ID mata kuliah dan NIM wajib diisi.');
	if (!isLanguage(language)) return apiError(422, 'Bahasa tidak valid. Pilih id, en, atau de.');

	let course: Course;
	try {
		course = await pocketbaseAdmin.getRecord<Course>('courses', courseId);
	} catch {
		return apiError(404, 'Mata kuliah tidak ditemukan.');
	}
	if (course.owner !== user.id) {
		return apiError(403, 'Anda bukan pemilik mata kuliah ini.');
	}

	const roster = await pocketbaseAdmin.listRecords<CourseRosterEntry>('course_roster', {
		perPage: 1,
		filter: `course="${esc(courseId)}" && nim="${esc(nim)}"`,
	});
	if (roster.items.length === 0) {
		return apiError(404, 'Mahasiswa tidak ditemukan dalam roster mata kuliah ini.');
	}

	const users = await pocketbaseAdmin.listRecords<{ id: string; nim?: string; language?: string; role?: string }>(
		'users',
		{ perPage: 1, filter: `nim="${esc(nim)}"` },
	);
	if (users.items.length === 0) {
		return apiError(404, 'Akun mahasiswa belum dibuat. Aktifkan akun terlebih dahulu.');
	}

	const student = users.items[0];
	if (student.role && student.role !== 'student') {
		return apiError(403, 'NIM terhubung ke akun non-mahasiswa.');
	}

	await pocketbaseAdmin.updateRecord('users', student.id, { language });

	return json({ nim, language, name: roster.items[0].name });
});
