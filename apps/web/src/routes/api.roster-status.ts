import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authFaculty, esc } from '@/lib/student-onboarding.server';
import type { Course, CourseRosterEntry } from '@/lib/learning';

/**
 * POST /api/roster-status
 *
 * Returns per-roster-entry account & enrollment status for a mata kuliah the
 * signed-in lecturer owns: whether a student account exists for the NIM,
 * whether it is enrolled, the first-login password-change flag, the recovery
 * email + verification state, and how many public-link answers are linked.
 *
 * Faculty-only and ownership-verified. POST (not GET) because the response is
 * per-user (the lecturer's own roster) and must not be edge-cached.
 */

type Body = { courseId?: string };

type StatusEntry = {
	rosterId: string;
	nim: string;
	name: string;
	userId: string;
	accountExists: boolean;
	accountName: string;
	nameMismatch: boolean;
	enrolled: boolean;
	mustChangePassword: boolean;
	recoveryEmail: string;
	recoveryEmailVerified: boolean;
	linkedPublicCount: number;
	language: string;
};

type StudentUser = {
	id: string;
	nim?: string;
	name?: string;
	role?: string;
	language?: string;
	mustChangePassword?: boolean;
	recoveryEmail?: string;
	recoveryEmailVerified?: boolean;
};

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const { user } = await authFaculty(request);
	const body = await readJsonBody<Body>(request);
	const courseId = (body.courseId || '').trim();
	if (!courseId) return apiError(422, 'ID mata kuliah wajib diisi.');

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
		perPage: 500,
		filter: `course="${esc(courseId)}"`,
		sort: 'nim,name',
	});

	if (roster.items.length === 0) return json({ entries: [] as StatusEntry[] });

	const nims = Array.from(new Set(roster.items.map((r) => r.nim.trim()).filter(Boolean)));

	const userByNim = new Map<string, StudentUser>();
	if (nims.length > 0) {
		const nimFilter = nims.map((n) => `nim="${esc(n)}"`).join(' || ');
		const users = await pocketbaseAdmin.listRecords<StudentUser>('users', {
			perPage: 500,
			filter: nimFilter,
		});
		for (const u of users.items) {
			if (u.nim) userByNim.set(u.nim, u);
		}
	}

	const enrollments = await pocketbaseAdmin.listRecords<{ owner: string }>('enrollments', {
		perPage: 500,
		filter: `course="${esc(courseId)}"`,
	});
	const enrolledIds = new Set(enrollments.items.map((e) => e.owner));

	const linkedCount = new Map<string, number>();
	const assignments = await pocketbaseAdmin.listRecords<{ id: string }>('assignments', {
		perPage: 500,
		filter: `course="${esc(courseId)}"`,
	});
	if (assignments.items.length > 0) {
		const assignFilter = assignments.items
			.map((a) => `assignment="${esc(a.id)}"`)
			.join(' || ');
		const pubs = await pocketbaseAdmin.listRecords<{ linkedUser?: string }>(
			'public_submissions',
			{ perPage: 500, filter: `(${assignFilter})` },
		);
		for (const p of pubs.items) {
			const lu = p.linkedUser as string | undefined;
			if (lu) linkedCount.set(lu, (linkedCount.get(lu) ?? 0) + 1);
		}
	}

	const entries: StatusEntry[] = roster.items.map((r) => {
		const nim = r.nim.trim();
		const acct = userByNim.get(nim);
		const accountName = acct?.name ?? '';
		const rosterName = r.name.trim();
		return {
			rosterId: r.id,
			nim,
			name: r.name,
			userId: acct?.id ?? '',
			accountExists: !!acct,
			accountName,
			nameMismatch:
				!!acct && accountName.trim().length > 0 && accountName.trim() !== rosterName,
			enrolled: acct ? enrolledIds.has(acct.id) : false,
			mustChangePassword: acct?.mustChangePassword ?? false,
			recoveryEmail: acct?.recoveryEmail ?? '',
			recoveryEmailVerified: acct?.recoveryEmailVerified ?? false,
			linkedPublicCount: acct ? (linkedCount.get(acct.id) ?? 0) : 0,
			language: acct?.language ?? '',
		};
	});

	return json({ entries });
});
