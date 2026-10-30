/**
 * POST /api/practice-assist — Batch 3 AI assistance for Latihan formatif.
 *
 * Optional, lecturer-enabled (`assignments.aiAssistEnabled`) AI guidance for
 * an enrolled student's CURRENT practice work: hints, suggestions, and a
 * formative draft feedback — grounded ONLY in the practice instructions, the
 * lecturer-approved course materials (Phase 4/5 context bundle, documents
 * only, student-readable), and the selected rubric criteria.
 *
 * Guidance-only by contract: no answers, no right/wrong verdicts, no grades,
 * and nothing is written to submissions, evaluations, grades, or publishing —
 * practice stays fully separate from official grading. The response is
 * explicitly labeled as guidance, not official assessment.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { createRateLimiter } from '@/lib/rate-limit.server';
import {
	authenticateUser,
	cpmkOfSubCpmk,
	retrieveContextBundle,
} from '@/lib/context-retrieval.server';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { taskKindForShape } from '@/lib/task-types';
import { criteriaForAssignment, taskSourceContext } from '@/lib/feedback.server';
import { resolveAssignmentPolicy } from '@/lib/ai-policy';
import { authorizeCapabilities, PRACTICE_ASSIST_CAPABILITIES } from '@/lib/ai-policy.server';
import { renderResponseText, responseHasDirectAnswer } from '@/lib/check-answer.server';
import { buildPracticeAssist } from '@/lib/practice-assist.server';
import type { CheckResponsePayload } from '@/lib/check-types';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { assignmentId?: string; response?: CheckResponsePayload; focus?: string };

/** Model calls cost more than a plain read — a tighter per-user budget on top of `/api/*`. */
const consumeAssistBudget = createRateLimiter({ maxRequests: 8, windowSeconds: 60 });

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { pb, user } = auth;

	if (!(await consumeAssistBudget(`practice-assist:${user.id}`))) {
		return apiError(429, 'Terlalu banyak permintaan panduan AI. Coba lagi beberapa saat.');
	}

	const body = await readJsonBody<Body>(request);
	const assignmentId = (body.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) return apiError(422, 'assignmentId wajib dan harus valid.');

	// Loaded with the caller's own token so the collection rule applies.
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(assignmentId);
	} catch {
		return apiError(404, 'Latihan tidak ditemukan.');
	}
	if (assignment.status !== 'published') {
		return apiError(422, 'Asisten AI hanya tersedia saat latihan diterbitkan.');
	}
	if (activityTypeOf(assignment) !== 'formative') {
		return apiError(422, 'Asisten AI hanya tersedia untuk Latihan formatif.');
	}
	if (assignment.aiAssistEnabled !== true) {
		return apiError(422, 'Dosen belum mengaktifkan asisten AI untuk latihan ini.');
	}
	// Phase 1 — enforce the student AI assistance policy server-side before
	// any model call. The capability set Panduan AI provides must be fully
	// permitted by the assignment's AI policy.
	const practicePolicy = resolveAssignmentPolicy(assignment);
	const practiceCapDecision = authorizeCapabilities(practicePolicy, PRACTICE_ASSIST_CAPABILITIES);
	if (!practiceCapDecision.ok) return apiError(practiceCapDecision.status, practiceCapDecision.message);

	const response = body.response;
	if (!response || typeof response !== 'object' || !responseHasDirectAnswer(response)) {
		return apiError(422, 'Belum ada pekerjaan latihan untuk dibantu. Isi jawaban Anda lebih dulu.');
	}

	// ── Grounding: lecturer-approved course materials (Phase 4/5 bundle) ──
	const bundle = await retrieveContextBundle({
		feature: 'check',
		scope: {
			course: assignment.course,
			session: assignment.session || '',
			subCpmk: assignment.subCpmk || '',
			cpmk: await cpmkOfSubCpmk(assignment.subCpmk || ''),
			assignment: assignment.id,
		},
		requester: {
			id: user.id,
			role: user.role === 'faculty' ? 'faculty' : 'student',
			label: `${user.role === 'faculty' ? 'faculty' : 'student'}:${user.id}`,
		},
		ownerLecturerId: assignment.owner,
	});
	const materialContext = bundle.sources
		.map((source) => {
			const sections = source.sections.map((s) => s.label).join(', ');
			return [
				`Materi: "${source.title}"${sections ? ` — bagian: ${sections}` : ''}`,
				source.text,
			]
				.filter(Boolean)
				.join('\n');
		})
		.join('\n\n');

	const kind = taskKindForShape(assignment.shape);
	const assist = await buildPracticeAssist({
		assignment,
		responseText: renderResponseText(assignment, response),
		criteria: criteriaForAssignment(assignment),
		materialContext,
		focus: (body.focus || '').trim().slice(0, 500),
		sourceContext: taskSourceContext(assignment),
		kind,
	});
	if (!assist) {
		return apiError(
			422,
			'Panduan belum dapat disusun dari pekerjaan ini. Perbaiki pekerjaan latihan Anda lalu coba lagi.',
		);
	}

	return json({
		ok: true,
		...assist,
		// Exact citations of the approved materials that grounded the guidance.
		citations: bundle.citations.map((c) => ({
			file: c.file,
			title: c.title,
			section: c.section,
			pageRef: c.pageRef,
		})),
		materialsResult: bundle.result,
		materialsReason: bundle.result === 'insufficient' ? bundle.reason : '',
		note: 'Panduan AI — bukan penilaian resmi. Nilai resmi hanya ditetapkan dosen pada tugas formal; latihan ini tidak berdampak pada nilai.',
	});
});
