import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { buildAssignmentDraft } from '@/lib/assignment-draft.server';
import { SHAPE_OPTIONS, type AssignmentShape } from '@/lib/assignments';
import type { Assessment, ClassSession, Course, Cpmk, StructuredItem, SubCpmk } from '@/lib/learning';

type Body = {
	courseId?: string;
	sessionId?: string;
	subCpmkId?: string;
	shape?: string;
	instruction?: string;
	sourceText?: string;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/**
 * POST /api/assignment-draft
 * Faculty owner only. Returns a reviewable draft. Does not write records.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const courseId = body.courseId?.trim();
	if (!courseId) return apiError(422, 'courseId wajib diisi.');

	// The gated creator flow requires a complete academic mapping and a
	// selected task shape before AI generation is allowed.
	const sessionId = body.sessionId?.trim() || '';
	const subCpmkId = body.subCpmkId?.trim() || '';
	if (!sessionId || !subCpmkId) {
		return apiError(
			422,
			'Pemetaan akademik belum lengkap — pilih pertemuan dan Sub-CPMK terlebih dahulu sebelum menyusun draf AI.',
		);
	}
	const shape = body.shape?.trim() || '';
	if (!SHAPE_OPTIONS.some((s) => s.value === (shape as AssignmentShape))) {
		return apiError(422, 'Pilih bentuk tugas terlebih dahulu sebelum menyusun draf AI.');
	}

	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return apiError(401, 'Masuk sebagai dosen untuk menyusun draf tugas.');

	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return apiError(401, 'Sesi tidak valid. Masuk kembali.');
	}
	const user = pb.authStore.record as { id?: string; role?: string; verified?: boolean } | null;
	if (!user?.id || user.role !== 'faculty') {
		return apiError(403, 'Draf AI hanya untuk dosen.');
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
		return apiError(403, 'Hanya dosen pemilik yang dapat menyusun draf tugas.');
	}

	const filter = pb.filter('course = {:id}', { id: courseId });
	const [sessions, subCpmks, cpmks, cpls, assessments, resources] = await Promise.all([
		pb.collection('class_sessions').getFullList<ClassSession>({ filter, sort: 'week,created' }),
		pb.collection('sub_cpmk').getFullList<SubCpmk>({ filter, sort: 'order,created' }),
		pb.collection('cpmk').getFullList<Cpmk>({ filter, sort: 'order,created' }),
		pb.collection('cpl').getFullList<StructuredItem>({ filter, sort: 'order,created' }),
		pb.collection('assessments').getFullList<Assessment>({ filter, sort: 'order,created' }),
		pb.collection('course_resources').getFullList<{ id: string; title: string }>({
			filter,
			fields: 'id,title',
			sort: 'created',
		}),
	]);

	// The mapping must reference rows that actually belong to this course.
	if (!sessions.some((s) => s.id === sessionId)) {
		return apiError(422, 'Pertemuan yang dipilih tidak ditemukan pada mata kuliah ini.');
	}
	if (!subCpmks.some((s) => s.id === subCpmkId)) {
		return apiError(422, 'Sub-CPMK yang dipilih tidak ditemukan pada mata kuliah ini.');
	}
	const mapped = sessions.find((s) => s.id === sessionId);
	if (!mapped?.subCpmks?.includes(subCpmkId)) {
		return apiError(
			422,
			'Sub-CPMK itu tidak terhubung ke pertemuan yang dipilih. Pilih ulang dari relasi RPS — pemetaan tidak diubah otomatis.',
		);
	}

	const draft = await buildAssignmentDraft({
		course,
		sessions,
		subCpmks,
		cpmks,
		cpls,
		assessments,
		resources,
		sessionId,
		subCpmkId,
		shape: shape as AssignmentShape,
		instruction: body.instruction?.trim().slice(0, 800) || '',
		sourceText: body.sourceText?.trim().slice(0, 8000) || '',
	});

	return json(draft);
});
