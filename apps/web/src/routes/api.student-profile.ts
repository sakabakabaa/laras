import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin as db } from '@/lib/pocketbase-client.server';
import { authFaculty, authUser, esc } from '@/lib/student-onboarding.server';
import { studentProgress } from '@/lib/student-progress.server';
import type { Course, CourseRosterEntry } from '@/lib/learning';

type Profile = {
	id: string;
	student: string;
	goals?: string;
	priorExperience?: string;
	confidence?: string;
	explanationLanguage?: string;
	supportPreference?: string;
	shareWithLecturer?: boolean;
	aiPersonalization?: boolean;
	updated?: string;
};

type Body = {
	mode?: 'load' | 'save' | 'lecturer';
	courseId?: string;
	rosterId?: string;
	goals?: string;
	priorExperience?: string;
	confidence?: string;
	explanationLanguage?: string;
	supportPreference?: string;
	shareWithLecturer?: boolean;
	aiPersonalization?: boolean;
};

const first = async <T,>(collection: string, filter: string) => {
	const rows = await db.listRecords<T>(collection, { perPage: 1, filter });
	return rows.items[0] ?? null;
};

const cleanText = (value: unknown, max: number) =>
	typeof value === 'string' ? value.trim().slice(0, max) : '';

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');
	const body = await readJsonBody<Body>(request);

	if (body.mode === 'lecturer') {
		const { user } = await authFaculty(request);
		const courseId = cleanText(body.courseId, 64);
		const rosterId = cleanText(body.rosterId, 64);
		if (!courseId || !rosterId) return apiError(422, 'Mata kuliah dan mahasiswa wajib dipilih.');
		const course = await db.getRecord<Course>('courses', courseId).catch(() => null);
		if (!course) return apiError(404, 'Mata kuliah tidak ditemukan.');
		if (course.owner !== user.id) return apiError(403, 'Anda bukan pemilik mata kuliah ini.');
		const roster = await db.getRecord<CourseRosterEntry>('course_roster', rosterId).catch(() => null);
		if (!roster || roster.course !== course.id) return apiError(404, 'Mahasiswa tidak ditemukan di mata kuliah ini.');

		const [student, attendanceRows, assignments] = await Promise.all([
			first<{ id: string; name?: string; nim?: string }>('users', `nim="${esc(roster.nim.trim())}" && role="student"`),
			db.listRecords<{ status: string; session: string }>('attendance', { perPage: 500, filter: `roster="${esc(roster.id)}"` }),
			db.listRecords<{ id: string; title: string; activityType?: string }>('assignments', { perPage: 500, filter: `course="${esc(course.id)}"`, sort: '-created' }),
		]);
		if (!student) return json({ profile: { name: roster.name, nim: roster.nim, linked: false }, academic: null, attendance: null, learning: null });

		const enrollment = await first<{ id: string }>('enrollments', `course="${esc(course.id)}" && owner="${esc(student.id)}"`);
		if (!enrollment) return apiError(403, 'Akun mahasiswa belum terdaftar pada mata kuliah ini.');
		const [submissionRows, attendance, learning, profile] = await Promise.all([
			db.listRecords<{ assignment: string; status: string; grade: number | null; feedback?: string; updated: string }>('assignment_submissions', {
				perPage: 500,
				filter: `owner="${esc(student.id)}" && assignment.course="${esc(course.id)}"`,
				sort: '-updated',
			}),
			Promise.resolve(attendanceRows.items),
			studentProgress(student.id, course.id),
			first<Profile>('student_learning_profiles', `student="${esc(student.id)}"`),
		]);
		const attendanceCounts = { present: 0, late: 0, absent: 0, excused: 0 };
		for (const row of attendance) if (row.status in attendanceCounts) attendanceCounts[row.status as keyof typeof attendanceCounts]++;
		const formalAssignments = assignments.items.filter((item) => item.activityType !== 'formative');
		const formalIds = new Set(formalAssignments.map((item) => item.id));
		const submissions = submissionRows.items.filter((item) => formalIds.has(item.assignment));
		const graded = submissions.filter((item) => item.status === 'graded' && typeof item.grade === 'number');
		const sharedProfile = profile?.shareWithLecturer ? {
			goals: profile.goals || '', priorExperience: profile.priorExperience || '',
			confidence: profile.confidence || '', explanationLanguage: profile.explanationLanguage || '',
			supportPreference: profile.supportPreference || '', updated: profile.updated || '',
		} : null;
		return json({
			profile: { name: roster.name, nim: roster.nim, linked: true, studentId: student.id, learner: sharedProfile },
			attendance: { ...attendanceCounts, total: attendance.length, presentRate: attendance.length ? Math.round(((attendanceCounts.present + attendanceCounts.late) / attendance.length) * 100) : null },
			academic: {
				assignmentCount: formalAssignments.length,
				submittedCount: new Set(submissions.map((item) => item.assignment)).size,
				gradedCount: graded.length,
				averageGrade: graded.length ? Math.round(graded.reduce((sum, item) => sum + (item.grade || 0), 0) / graded.length) : null,
				recent: submissions.slice(0, 6).map((item) => ({ title: formalAssignments.find((a) => a.id === item.assignment)?.title || 'Tugas', status: item.status, grade: item.grade, feedback: item.status === 'graded' ? item.feedback || '' : '', updated: item.updated })),
			},
			learning,
		});
	}

	const { user } = await authUser(request);
	if (user.role !== 'student') return apiError(403, 'Preferensi ini hanya tersedia untuk mahasiswa.');
	const current = await first<Profile>('student_learning_profiles', `student="${esc(user.id)}"`);
	if (body.mode === 'load') {
		return json({ profile: current ? {
			goals: current.goals || '', priorExperience: current.priorExperience || '', confidence: current.confidence || '',
			explanationLanguage: current.explanationLanguage || '', supportPreference: current.supportPreference || '',
			shareWithLecturer: Boolean(current.shareWithLecturer), aiPersonalization: Boolean(current.aiPersonalization), updated: current.updated || '',
		} : { goals: '', priorExperience: '', confidence: '', explanationLanguage: '', supportPreference: '', shareWithLecturer: false, aiPersonalization: false } });
	}
	if (body.mode !== 'save') return apiError(422, 'Aksi profil tidak dikenal.');
	const allowed = <T extends string>(value: unknown, values: readonly T[]) => values.includes(value as T) ? value as T : '';
	const data = {
		student: user.id,
		goals: cleanText(body.goals, 2000),
		priorExperience: cleanText(body.priorExperience, 2000),
		confidence: allowed(body.confidence, ['low', 'medium', 'high'] as const),
		explanationLanguage: allowed(body.explanationLanguage, ['id', 'en', 'de'] as const),
		supportPreference: allowed(body.supportPreference, ['examples', 'steps', 'concise'] as const),
		shareWithLecturer: Boolean(body.shareWithLecturer),
		aiPersonalization: Boolean(body.aiPersonalization),
	};
	const saved = current
		? await db.updateRecord<Profile>('student_learning_profiles', current.id, data)
		: await db.createRecord<Profile>('student_learning_profiles', data);
	return json({ saved: true, updated: saved.updated || '' });
});
