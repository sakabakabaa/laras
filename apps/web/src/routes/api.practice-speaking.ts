/**
 * POST /api/practice-speaking — Phase 5 live formative feedback for a
 * student's Latihan persiapan (formative) speaking practice.
 *
 * After the student records or uploads practice audio, the existing Whisper
 * transcription flow produces a transcript on their draft submission. This
 * endpoint turns that transcript into immediate, grounded formative feedback
 * by reusing the same practice-assist server logic (`buildPracticeAssist`)
 * and the lecturer-approved Phase 4/5 context bundle — documents only,
 * student-readable, never unapproved or outdated material.
 *
 * Guidance-only by contract (mirrors `/api/practice-assist`): no answers, no
 * right/wrong verdicts, no grades, no rewrites. The result is session-only —
 * nothing is written to submissions, evaluations, grades, check_attempts, or
 * publishing. Official grading stays entirely with the lecturer on the formal
 * task; this feedback is explicitly labeled as formative practice feedback.
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
import { authorizeCapabilities, PRACTICE_SPEAKING_CAPABILITIES } from '@/lib/ai-policy.server';
import { buildPracticeAssist } from '@/lib/practice-assist.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { assignmentId?: string; submissionId?: string; focus?: string };

/** Model calls cost more than a plain read — a tighter per-user budget on top of `/api/*`. */
const consumeFeedbackBudget = createRateLimiter({ maxRequests: 8, windowSeconds: 60 });

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const { pb, user } = auth;

	if (!(await consumeFeedbackBudget(`practice-speaking:${user.id}`))) {
		return apiError(429, 'Terlalu banyak permintaan umpan balik. Coba lagi beberapa saat.');
	}

	const body = await readJsonBody<Body>(request);
	const assignmentId = (body.assignmentId || '').trim();
	const submissionId = (body.submissionId || '').trim();
	if (!SAFE_ID.test(assignmentId) || !SAFE_ID.test(submissionId)) {
		return apiError(422, 'assignmentId dan submissionId wajib dan harus valid.');
	}

	// Loaded with the caller's own token so the collection rule applies.
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(assignmentId);
	} catch {
		return apiError(404, 'Latihan tidak ditemukan.');
	}
	if (assignment.status !== 'published') {
		return apiError(422, 'Umpan balik hanya tersedia saat latihan diterbitkan.');
	}
	if (activityTypeOf(assignment) !== 'formative') {
		return apiError(422, 'Umpan balik transkrip hanya untuk Latihan formatif berbicara.');
	}
	if (taskKindForShape(assignment.shape) !== 'speaking') {
		return apiError(422, 'Umpan balik transkrip hanya untuk latihan berbicara.');
	}
	// Phase 1 — enforce the student AI assistance policy server-side before
	// any model call. The capability set speaking feedback provides must be
	// fully permitted by the assignment's AI policy.
	const speakingPolicy = resolveAssignmentPolicy(assignment);
	const speakingCapDecision = authorizeCapabilities(speakingPolicy, PRACTICE_SPEAKING_CAPABILITIES);
	if (!speakingCapDecision.ok) return apiError(speakingCapDecision.status, speakingCapDecision.message);

	// The caller's own draft submission holds the practice audio + transcript.
	let submission: {
		id: string;
		owner: string;
		transcript?: string;
		transcriptStatus?: string;
	};
	try {
		submission = await pb
			.collection('assignment_submissions')
			.getOne<{ id: string; owner: string; transcript?: string; transcriptStatus?: string }>(
				submissionId,
			);
	} catch {
		return apiError(404, 'Pengumpulan latihan tidak ditemukan.');
	}
	if (submission.owner !== user.id) {
		return apiError(403, 'Anda tidak dapat meminta umpan balik untuk pengumpulan ini.');
	}
	if (submission.transcriptStatus !== 'ready' || !submission.transcript) {
		return apiError(422, 'Transkrip belum siap. Tunggu hingga transkripsi selesai, lalu coba lagi.');
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

	const assist = await buildPracticeAssist({
		assignment,
		responseText: submission.transcript,
		criteria: criteriaForAssignment(assignment),
		materialContext,
		focus: (body.focus || '').trim().slice(0, 500),
		sourceContext: taskSourceContext(assignment),
		kind: 'speaking',
	});
	if (!assist) {
		return apiError(
			422,
			'Umpan balik belum dapat disusun dari transkrip ini. Coba rekam ulang dengan audio yang lebih jelas.',
		);
	}

	return json({
		ok: true,
		...assist,
		// Exact citations of the approved materials that grounded the feedback.
		citations: bundle.citations.map((c) => ({
			file: c.file,
			title: c.title,
			section: c.section,
			pageRef: c.pageRef,
		})),
		materialsResult: bundle.result,
		materialsReason: bundle.result === 'insufficient' ? bundle.reason : '',
		note: 'Umpan balik latihan berbicara — berdasarkan transkrip audio. Bukan penilaian resmi; tidak berdampak pada nilai mata kuliah.',
	});
});
