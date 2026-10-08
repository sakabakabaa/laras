import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { assistFix } from '@/lib/rps-assist.server';
import type { FixAssessment, FixContext, FixItem, FixSession } from '@/lib/rps-fix';
import { validateRps, validationFromRecords, type ValidationCategory } from '@/lib/rps-validation';
import type { Assessment, ClassSession, Course } from '@/lib/learning';

type Body = {
	courseId?: string;
	category?: ValidationCategory;
	message?: string;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/**
 * POST /api/rps-assist
 * Faculty owner only. Returns a reviewable fix built from stored RPS rows.
 * Does not write anything — the browser applies the confirmed patch under
 * collection rules so the original PDF and unrelated fields stay untouched.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const courseId = body.courseId?.trim();
	const category = body.category;
	const message = body.message?.trim();
	if (!courseId || !category || !message) {
		return apiError(422, 'courseId, category, dan message wajib diisi.');
	}
	if (!['subcpmk', 'weekly', 'assessment', 'workload'].includes(category)) {
		return apiError(422, 'Kategori catatan tidak dikenal.');
	}

	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return apiError(401, 'Masuk sebagai dosen untuk menggunakan asisten AI.');

	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return apiError(401, 'Sesi tidak valid. Masuk kembali.');
	}
	const user = pb.authStore.record as { id?: string; role?: string; verified?: boolean } | null;
	if (!user?.id || user.role === 'student') {
		return apiError(403, 'Asisten AI tidak tersedia untuk mahasiswa.');
	}
	if (user.role !== 'faculty') {
		return apiError(403, 'Asisten AI hanya untuk dosen pemilik mata kuliah.');
	}
	if (!user.verified) {
		return apiError(403, 'Verifikasi email Anda sebelum memakai asisten AI.');
	}

	let course: Course;
	try {
		course = await pb.collection('courses').getOne<Course>(courseId);
	} catch {
		return apiError(404, 'Mata kuliah tidak ditemukan.');
	}
	if (course.owner !== user.id) {
		return apiError(403, 'Hanya dosen pemilik yang dapat meminta perbaikan AI.');
	}

	const filter = pb.filter('course = {:id}', { id: courseId });
	const [sessions, subCpmk, topics, assessments, cpmk] = await Promise.all([
		pb.collection('class_sessions').getFullList<ClassSession>({ filter, sort: 'week,created' }),
		pb.collection('sub_cpmk').getFullList<FixItem>({ filter, sort: 'order,created' }),
		pb.collection('topics').getFullList<FixItem>({ filter, sort: 'order,created' }),
		pb.collection('assessments').getFullList<Assessment>({ filter, sort: 'order,created' }),
		pb.collection('cpmk').getFullList({ filter, fields: 'id' }),
	]);

	const warning = validateRps(
		validationFromRecords({
			credits: course.credits ?? null,
			workloadLecture: course.workloadLecture ?? null,
			workloadTutorial: course.workloadTutorial ?? null,
			workloadPractice: course.workloadPractice ?? null,
			workloadIndependent: course.workloadIndependent ?? null,
			workloadTotal: course.workloadTotal ?? null,
			sessions,
			assessments,
			cpmkCount: cpmk.length,
			subCpmkCount: subCpmk.length,
		}),
	).warnings.find((item) => item.category === category && item.message === message);

	if (!warning) {
		return apiError(422, 'Catatan ini sudah tidak ada. Muat ulang tinjauan RPS.');
	}

	const ctx: FixContext = {
		courseId,
		workloadLecture: course.workloadLecture ?? null,
		workloadTutorial: course.workloadTutorial ?? null,
		workloadPractice: course.workloadPractice ?? null,
		workloadIndependent: course.workloadIndependent ?? null,
		workloadTotal: course.workloadTotal ?? null,
		sessions: sessions.map(toSession),
		subCpmk,
		topics,
		assessments: assessments.map(toAssessment),
	};

	const result = await assistFix(ctx, warning);
	return json({
		ok: true,
		source: result.source,
		aiNote: result.aiNote,
		proposal: result.proposal,
	});
});

function toSession(row: ClassSession): FixSession {
	return {
		id: row.id,
		week: row.week,
		title: row.title || '',
		topic: row.topic || '',
		notes: row.notes || '',
		specialWeekType: row.specialWeekType || '',
		subCpmks: row.subCpmks || [],
		topics: row.topics || [],
		assessments: row.assessments || [],
		learningIndicator: row.learningIndicator || '',
		learningMaterial: row.learningMaterial || '',
		assessmentMethod: row.assessmentMethod || '',
		synchronousMethod: row.synchronousMethod || '',
		asynchronousMethod: row.asynchronousMethod || '',
	};
}

function toAssessment(row: Assessment): FixAssessment {
	return {
		id: row.id,
		code: row.code || '',
		description: row.description || '',
		weight: row.weight ?? null,
	};
}
