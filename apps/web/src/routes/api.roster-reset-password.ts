import crypto from 'node:crypto';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authFaculty, esc } from '@/lib/student-onboarding.server';
import { logRosterAudit } from '@/lib/roster-audit.server';
import type { Course, CourseRosterEntry } from '@/lib/learning';

/**
 * POST /api/roster-reset-password
 *
 * Lecturer-initiated reissue of a student's default password. Generates a new
 * random one-time password, writes it through the superuser client (the
 * `mustChangePassword` and password fields are locked against self-update),
 * and flips `mustChangePassword` back to true so the student must replace it
 * on next login. The new password is returned exactly once — it is never
 * stored retrievably.
 *
 * Faculty-only and ownership-verified: the NIM must belong to a roster entry
 * of a mata kuliah the caller owns, and a student account must already exist
 * for that NIM.
 */

const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSWORD_LENGTH = 10;

function randomPassword() {
	const bytes = crypto.randomBytes(PASSWORD_LENGTH);
	let out = '';
	for (let i = 0; i < PASSWORD_LENGTH; i += 1) {
		out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
	}
	return out;
}

type Body = { courseId?: string; nim?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const { user } = await authFaculty(request);
	const body = await readJsonBody<Body>(request);
	const courseId = (body.courseId || '').trim();
	const nim = (body.nim || '').trim();
	if (!courseId || !nim) return apiError(422, 'ID mata kuliah dan NIM wajib diisi.');

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

	const users = await pocketbaseAdmin.listRecords<{ id: string; nim?: string }>('users', {
		perPage: 1,
		filter: `nim="${esc(nim)}"`,
	});
	if (users.items.length === 0) {
		return apiError(404, 'Akun mahasiswa belum dibuat. Aktifkan akun terlebih dahulu.');
	}

	const student = users.items[0];
	const password = randomPassword();
	await pocketbaseAdmin.updateRecord('users', student.id, {
		password,
		passwordConfirm: password,
		mustChangePassword: true,
	});

	// Phase 6 — audit the reissue (password itself is never stored).
	await logRosterAudit({
		course: courseId,
		owner: user.id,
		action: 'password_reissued',
		nim,
		studentName: roster.items[0].name,
		outcome: 'success',
		detail: 'Kata sandi default dibuat ulang; mahasiswa wajib mengganti saat login berikutnya.',
	});

	return json({ password, nim, name: roster.items[0].name });
});
