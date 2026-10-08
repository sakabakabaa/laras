import crypto from 'node:crypto';
import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { linkPublicAnswersForCourse } from '@/lib/public-linking.server';
import {
	logRosterAudit,
	logRosterAuditBatch,
	type RosterAuditEntry,
} from '@/lib/roster-audit.server';
import type { Course, CourseRosterEntry } from '@/lib/learning';

/**
 * POST /api/roster-enroll
 *
 * Connects the lecturer-managed Mata Kuliah roster (Phase 1) to real student
 * accounts and course enrollments (Phase 2). For each roster entry the NIM is
 * the student identifier:
 *
 *  - look up an existing student account by NIM (or by the canonical roster
 *    email `<nim>@student.upi.edu`);
 *  - if none exists, create one with a random one-time default password, role
 *    `student`, and the NIM stored on the account;
 *  - enroll the account in the mata kuliah if not already enrolled;
 *  - return the generated default credentials for newly created accounts so the
 *    lecturer can hand them over once. Passwords are never stored retrievably
 *    — this response is the only time they leave the server.
 *
 * Faculty-only and ownership-verified: the caller must be a `faculty` user who
 * owns the mata kuliah. Account creation and enrollment happen through the
 * superuser client because collection rules reserve enrollment creation to the
 * student themselves.
 */

const STUDENT_EMAIL_DOMAIN = '@student.upi.edu';
const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSWORD_LENGTH = 10;
const MAX_ENTRIES = 200;

type Outcome =
	| { nim: string; name: string; outcome: 'created'; password: string; enrolled: boolean }
	| { nim: string; name: string; outcome: 'reused'; enrolled: boolean }
	| { nim: string; name: string; outcome: 'already_enrolled' }
	| { nim: string; name: string; outcome: 'error'; error: string };

type Body = {
	courseId?: string;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/** Authenticate the caller's PocketBase token; returns null on failure. */
async function authFaculty(request: Request) {
	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return { error: apiError(401, 'Masuk untuk mengaktifkan akun mahasiswa.') } as const;
	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return { error: apiError(401, 'Sesi tidak valid. Masuk kembali.') } as const;
	}
	const user = pb.authStore.record as
		| { id: string; role?: string; email?: string; name?: string }
		| null;
	if (!user?.id) return { error: apiError(401, 'Sesi tidak valid. Masuk kembali.') } as const;
	if (user.role !== 'faculty') {
		return { error: apiError(403, 'Hanya dosen yang dapat mengaktifkan akun mahasiswa.') } as const;
	}
	return { user } as const;
}

/** Escape a value for use inside a PocketBase filter `"... = \"<val>\""` clause. */
const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const studentEmailFor = (nim: string) => `${nim}${STUDENT_EMAIL_DOMAIN}`;

function randomPassword() {
	const bytes = crypto.randomBytes(PASSWORD_LENGTH);
	let out = '';
	for (let i = 0; i < PASSWORD_LENGTH; i += 1) {
		out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
	}
	return out;
}

/** Find an existing student account by NIM, then by the canonical roster email. */
async function findStudentByNim(
	nim: string,
): Promise<{ id: string; nim?: string; role?: string } | null> {
	const byNim = await pocketbaseAdmin.listRecords<{ id: string; nim?: string; role?: string }>(
		'users',
		{ perPage: 1, filter: `nim="${esc(nim)}"` },
	);
	if (byNim.items[0]) return byNim.items[0];
	const byEmail = await pocketbaseAdmin.listRecords<{
		id: string;
		nim?: string;
		role?: string;
	}>('users', {
		perPage: 1,
		filter: `email="${esc(studentEmailFor(nim))}"`,
	});
	return byEmail.items[0] ?? null;
}

/** True if the student already has an enrollment row for this mata kuliah. */
async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
	const rows = await pocketbaseAdmin.listRecords('enrollments', {
		perPage: 1,
		filter: `owner="${esc(userId)}" && course="${esc(courseId)}"`,
	});
	return rows.items.length > 0;
}

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authFaculty(request);
	if ('error' in auth) return auth.error;
	const { user } = auth;

	const body = await readJsonBody<Body>(request);
	const courseId = (body.courseId || '').trim();
	if (!courseId) return apiError(422, 'ID mata kuliah wajib diisi.');

	// Ownership check: only the mata kuliah owner may activate accounts for its
	// roster. Fetching via the user's own token would also work, but comparing
	// owner against the caller is the explicit gate.
	let course: Course;
	try {
		course = await pocketbaseAdmin.getRecord<Course>('courses', courseId);
	} catch {
		return apiError(404, 'Mata kuliah tidak ditemukan.');
	}
	if (course.owner !== user.id) {
		return apiError(403, 'Anda bukan pemilik mata kuliah ini.');
	}

	// Pull the roster. course_roster.listRule already scopes to the course
	// owner, so an empty result here for a non-owner is impossible (we passed
	// the owner check above), but a genuinely empty roster is still valid.
	const roster = await pocketbaseAdmin.listRecords<CourseRosterEntry>('course_roster', {
		perPage: MAX_ENTRIES,
		filter: `course="${esc(courseId)}"`,
		sort: 'nim,name',
	});
	if (roster.items.length === 0) {
		return json({
			results: [] as Outcome[],
			summary: { total: 0, created: 0, reused: 0, alreadyEnrolled: 0, errors: 0 },
			linkedPublicAnswers: { total: 0, linked: 0, skipped: 0, conflict: 0, errors: 0 },
		});
	}

	const results: Outcome[] = [];
	let created = 0;
	let reused = 0;
	let alreadyEnrolled = 0;
	let errors = 0;

	for (const entry of roster.items) {
		const nim = entry.nim.trim();
		const name = entry.name.trim();
		try {
			let student = await findStudentByNim(nim);

			if (!student) {
				// Create a new student account. The superuser client bypasses the
				// open createRule, so role/nim cannot be spoofed from the browser.
				const password = randomPassword();
				student = await pocketbaseAdmin.createRecord<{ id: string; nim?: string }>(
					'users',
					{
						email: studentEmailFor(nim),
						password,
						passwordConfirm: password,
						name,
						role: 'student',
						nim,
						// Force a first-login password change: the generated password
						// is a one-time default the student must replace before
						// accessing course content.
						mustChangePassword: true,
					},
				);
				created += 1;
				// Enroll the new account.
				await pocketbaseAdmin.createRecord('enrollments', {
					owner: student.id,
					course: courseId,
				});
				results.push({ nim, name, outcome: 'created', password, enrolled: true });
				continue;
			}

			// Safety guard: never enroll a non-student account (e.g. a faculty
			// account that happens to share the NIM) into a mata kuliah roster.
			const existingRole = (student as { role?: string }).role;
			if (existingRole && existingRole !== 'student') {
				errors += 1;
				results.push({
					nim,
					name,
					outcome: 'error',
					error: 'NIM terhubung ke akun non-mahasiswa dan tidak dapat didaftarkan.',
				});
				continue;
			}

			// Existing account: ensure its NIM is recorded (e.g. a self-signup
			// account found via the canonical email) so future lookups hit the
			// NIM index.
			if (!student.nim) {
				try {
					await pocketbaseAdmin.updateRecord('users', student.id, { nim });
				} catch {
					// non-fatal: enrollment can still proceed
				}
			}

			const enrolled = await isEnrolled(student.id, courseId);
			if (enrolled) {
				alreadyEnrolled += 1;
				results.push({ nim, name, outcome: 'already_enrolled' });
			} else {
				await pocketbaseAdmin.createRecord('enrollments', {
					owner: student.id,
					course: courseId,
				});
				reused += 1;
				results.push({ nim, name, outcome: 'reused', enrolled: true });
			}
		} catch (error) {
			errors += 1;
			const message = error instanceof Error ? error.message : 'Gagal memproses mahasiswa ini.';
			results.push({ nim, name, outcome: 'error', error: message });
		}
	}

	// Phase 6 — audit trail: one row per newly created account (the
	// provisioning events that matter most for traceability) plus a single
	// summary row for the whole activation batch. Passwords are never recorded.
	const auditEntries: RosterAuditEntry[] = [];
	for (const r of results) {
		if (r.outcome === 'created') {
			auditEntries.push({
				course: courseId,
				owner: user.id,
				action: 'account_created',
				nim: r.nim,
				studentName: r.name,
				outcome: 'success',
			});
		} else if (r.outcome === 'error') {
			auditEntries.push({
				course: courseId,
				owner: user.id,
				action: 'account_created',
				nim: r.nim,
				studentName: r.name,
				outcome: 'error',
				detail: r.error,
			});
		}
	}
	auditEntries.push({
		course: courseId,
		owner: user.id,
		action: 'roster_activated',
		outcome: errors > 0 ? 'error' : 'success',
		detail: `Dibuat ${created}, dipakai ulang ${reused}, sudah terdaftar ${alreadyEnrolled}, gagal ${errors} dari ${roster.items.length} mahasiswa.`,
	});
	await logRosterAuditBatch(auditEntries);

	// Phase 4 — now that accounts exist and students are enrolled, link any
	// existing public-link answers whose NIM matches a newly enrolled student.
	// Failures here never break the activation flow; the lecturer can retry
	// linking separately from the evaluation workspace.
	let linkedPublicAnswers = { total: 0, linked: 0, skipped: 0, conflict: 0, errors: 0 };
	try {
		const linked = await linkPublicAnswersForCourse(courseId);
		linkedPublicAnswers = linked.summary;
	} catch {
		/* non-fatal — activation already succeeded */
	}

	return json({
		results,
		summary: { total: roster.items.length, created, reused, alreadyEnrolled, errors },
		linkedPublicAnswers,
	});
});
