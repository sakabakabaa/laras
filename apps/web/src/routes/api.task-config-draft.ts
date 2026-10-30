import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { buildTaskConfigDraft } from '@/lib/task-config-draft.server';
import { retrieveContextBundle } from '@/lib/context-retrieval.server';
import type { TaskKind } from '@/lib/task-types';
import type { Assessment, ClassSession, Course, CourseResource, Cpmk, StructuredItem, SubCpmk } from '@/lib/learning';

type Body = {
	courseId?: string;
	sessionId?: string;
	subCpmkId?: string;
	shape?: string;
	instruction?: string;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

const KIND_FOR_SHAPE: Record<string, TaskKind> = {
	quiz: 'quiz',
	listening: 'listening',
	writing: 'writing',
	speaking: 'speaking',
};

/**
 * POST /api/task-config-draft
 * Faculty owner only. Returns one reviewable, kind-specific task draft
 * (quiz / listening / writing fields). Does not write records and never
 * returns answer keys.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const courseId = body.courseId?.trim();
	if (!courseId) return apiError(422, 'courseId wajib diisi.');

	const sessionId = body.sessionId?.trim() || '';
	const subCpmkId = body.subCpmkId?.trim() || '';
	if (!sessionId || !subCpmkId) {
		return apiError(
			422,
			'Pemetaan akademik belum lengkap — pilih pertemuan dan Sub-CPMK terlebih dahulu sebelum menyusun draf dengan AI.',
		);
	}
	const kind = KIND_FOR_SHAPE[body.shape?.trim() || ''];
	if (!kind) {
		return apiError(422, 'Susun dengan AI hanya tersedia untuk bentuk Kuis, Menyimak, Menulis, atau Berbicara.');
	}

	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return apiError(401, 'Masuk sebagai dosen untuk memakai isi otomatis AI.');

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
		return apiError(403, 'Susun dengan AI hanya untuk dosen.');
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
		return apiError(403, 'Hanya dosen pemilik yang dapat memakai isi otomatis AI.');
	}

	const filter = pb.filter('course = {:id}', { id: courseId });
	const [sessions, subCpmks, cpmks, cpls, assessments, resources] = await Promise.all([
		pb.collection('class_sessions').getFullList<ClassSession>({ filter, sort: 'week,created' }),
		pb.collection('sub_cpmk').getFullList<SubCpmk>({ filter, sort: 'order,created' }),
		pb.collection('cpmk').getFullList<Cpmk>({ filter, sort: 'order,created' }),
		pb.collection('cpl').getFullList<StructuredItem>({ filter, sort: 'order,created' }),
		pb.collection('assessments').getFullList<Assessment>({ filter, sort: 'order,created' }),
		pb.collection('course_resources').getFullList<CourseResource>({ filter, sort: 'created' }),
	]);

	const session = sessions.find((s) => s.id === sessionId);
	if (!session) return apiError(422, 'Pertemuan yang dipilih tidak ditemukan pada mata kuliah ini.');
	const subCpmk = subCpmks.find((s) => s.id === subCpmkId);
	if (!subCpmk) return apiError(422, 'Sub-CPMK yang dipilih tidak ditemukan pada mata kuliah ini.');
	if (!session.subCpmks?.includes(subCpmkId)) {
		return apiError(
			422,
			'Sub-CPMK itu tidak terhubung ke pertemuan yang dipilih. Pilih ulang dari relasi RPS — pemetaan tidak diubah otomatis.',
		);
	}
	const cpmk = subCpmk.cpmk ? cpmks.find((c) => c.id === subCpmk.cpmk) : undefined;
	const cpl = cpmk?.cpl ? cpls.find((c) => c.id === cpmk.cpl) : undefined;

	// Approved academic context (Phase 5): feed the extracted text of
	// lecturer-approved, version-matched document sections to the model as
	// grounding. Non-fatal — the draft proceeds with RPS facts only if no
	// approved context exists or retrieval fails.
	let contextText = '';
	try {
		const bundle = await retrieveContextBundle({
			feature: 'material',
			scope: {
				course: courseId,
				session: sessionId,
				subCpmk: subCpmkId,
				cpmk: cpmk?.id || '',
			},
			requester: { id: user.id, role: 'faculty', label: `faculty:${user.id}` },
			ownerLecturerId: user.id,
		});
		if (bundle.result === 'sufficient') {
			contextText = bundle.sources.map((s) => s.text).filter(Boolean).join('\n\n');
		}
	} catch {
		/* context retrieval unavailable — proceed without grounding */
	}

	const draft = await buildTaskConfigDraft({
		course,
		session,
		subCpmk,
		cpmk,
		cpl,
		assessments,
		resources,
		kind,
		instruction: body.instruction?.trim().slice(0, 800) || '',
		contextText,
	});

	return json(draft);
});
