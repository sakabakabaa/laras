import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	gradeListening,
	gradeQuiz,
	gradeReading,
	parseListeningConfig,
	parseQuizConfig,
	parseReadingConfig,
	parseTaskAnswers,
	type GradedQuestion,
	type ListeningStudentAnswers,
	type QuizStudentAnswers,
	type TaskAnswers,
} from '@/lib/task-types';
import type { Assignment } from '@/lib/assignments';
import { queueEvaluationDraft } from '@/lib/ai-evaluation.server';

type Body = {
	assignmentId?: string;
	kind?: string;
	answers?: Record<string, unknown>;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

type SubmitResponse = {
	status: 'submitted' | 'late';
	autoScore: number;
	earned: number;
	total: number;
	attemptsUsed: number;
	attemptsLimit: number;
	release: 'released' | 'pending';
	message: string;
	perQuestion?: GradedQuestion[];
};

/**
 * Save the caller's submission row and queue a background AI evaluation draft
 * (Tugas formal only — `queueEvaluationDraft` skips Latihan formatif). The
 * draft never blocks or breaks this submission flow.
 */
const saveSubmission = async (
	existing: { id: string } | undefined,
	payload: Record<string, unknown>,
	assignmentId: string,
	userId: string,
): Promise<string> => {
	if (existing) {
		const saved = await pocketbaseAdmin.updateRecord<{ id: string }>(
			'assignment_submissions',
			existing.id,
			payload,
		);
		return saved.id;
	}
	const saved = await pocketbaseAdmin.createRecord<{ id: string }>('assignment_submissions', {
		...payload,
		assignment: assignmentId,
		owner: userId,
	});
	return saved.id;
};

/**
 * POST /api/task-submit
 *
 * Final submission for auto-gradable specialized tasks (Kuis, Menyimak).
 * Runs server-side with the owner-only answer key so students never see it:
 * enforces the configured attempt count, grades the attempt, stores the
 * server-computed `autoScore` (a field students cannot write), and returns
 * per-question details only when the assignment's result-release policy allows.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const assignmentId = body.assignmentId?.trim();
	const kind = body.kind?.trim();
	if (!assignmentId) return apiError(422, 'assignmentId wajib diisi.');
	if (kind !== 'quiz' && kind !== 'listening' && kind !== 'reading') {
		return apiError(422, 'Jenis tugas tidak dikenal.');
	}

	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return apiError(401, 'Masuk untuk mengumpulkan tugas.');

	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return apiError(401, 'Sesi tidak valid. Masuk kembali.');
	}
	const user = pb.authStore.record as { id?: string } | null;
	if (!user?.id) return apiError(401, 'Sesi tidak valid. Masuk kembali.');

	// Assignment + key + the caller's own submission, all via superuser so the
	// answer key never travels through a student-readable request.
	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.status !== 'published') {
		return apiError(422, 'Pengumpulan tugas ini sudah ditutup dosen.');
	}

	const keyRows = await pocketbaseAdmin.listRecords<{ key: unknown }>('task_answer_keys', {
		perPage: 1,
		filter: `assignment="${assignmentId}"`,
	});
	const answerKey = keyRows.items[0]?.key ?? {};

	const existingRows = await pocketbaseAdmin.listRecords<{
		id: string;
		status: string;
		taskAnswers: unknown;
	}>('assignment_submissions', {
		perPage: 1,
		filter: `assignment="${assignmentId}" && owner="${user.id}"`,
	});
	const existing = existingRows.items[0];

	const prevAnswers = parseTaskAnswers(existing?.taskAnswers);
	const deadline = assignment.deadline ? new Date(assignment.deadline).getTime() : NaN;
	const pastDeadline = Number.isFinite(deadline) && Date.now() > deadline;

	// ── Quiz ───────────────────────────────────────────────────
	if (kind === 'quiz') {
		const config = parseQuizConfig(assignment.taskConfig);
		const answers = (body.answers ?? {}) as QuizStudentAnswers;
		const prevQuiz = prevAnswers?.quiz;
		const attemptsUsed = prevQuiz?.attemptsUsed ?? 0;
		const revision = existing?.status === 'revision';
		if (config.attempts > 0 && attemptsUsed >= config.attempts && !revision) {
			return apiError(
				422,
				`Kesempatan pengerjaan sudah habis (${attemptsUsed}/${config.attempts}).`,
			);
		}
		const graded = gradeQuiz(config, answerKey, answers);
		const taskAnswers: TaskAnswers = {
			...prevAnswers,
			quiz: {
				answers,
				attemptsUsed: attemptsUsed + 1,
				startedAt: prevQuiz?.startedAt || new Date().toISOString(),
				savedAt: new Date().toISOString(),
				lastAttempt: {
					answers,
					submittedAt: new Date().toISOString(),
					scorePct: graded.scorePct,
					earned: graded.earned,
					total: graded.total,
				},
			},
		};
		const status: 'submitted' | 'late' = pastDeadline ? 'late' : 'submitted';
		const payload = { status, taskAnswers, autoScore: graded.scorePct };
		const savedId = await saveSubmission(existing, payload, assignmentId, user.id);
		void queueEvaluationDraft({ assignment, submissionId: savedId });

		const release =
			config.releaseResults === 'after_submit' ||
			(config.releaseResults === 'after_deadline' && pastDeadline)
				? 'released'
				: 'pending';
		const message =
			release === 'released'
				? pastDeadline
					? 'Jawaban terkumpul (terlambat). Hasil dan pembahasan tersedia di bawah.'
					: 'Jawaban terkumpul. Hasil dan pembahasan tersedia di bawah.'
				: config.releaseResults === 'after_deadline'
					? 'Jawaban terkumpul. Hasil akan tersedia setelah batas waktu lewat.'
					: 'Jawaban terkumpul. Hasil akan diterbitkan dosen.';
		const response: SubmitResponse = {
			status,
			autoScore: graded.scorePct,
			earned: graded.earned,
			total: graded.total,
			attemptsUsed: attemptsUsed + 1,
			attemptsLimit: config.attempts,
			release,
			message,
			...(release === 'released' ? { perQuestion: graded.perQuestion } : {}),
		};
		return json(response);
	}

	if (kind === 'reading') {
		const config = parseReadingConfig(assignment.taskConfig);
		const answers = (body.answers ?? {}) as QuizStudentAnswers;
		const graded = gradeReading(config, answerKey, answers);
		const status: 'submitted' | 'late' = pastDeadline ? 'late' : 'submitted';
		const payload = {
			status,
			taskAnswers: { ...prevAnswers, quiz: { answers, attemptsUsed: 1, startedAt: new Date().toISOString(), savedAt: new Date().toISOString() } },
			autoScore: graded.scorePct,
		};
		const savedId = await saveSubmission(existing, payload, assignmentId, user.id);
		void queueEvaluationDraft({ assignment, submissionId: savedId });
		const release =
			config.releaseResults === 'after_submit' ||
			(config.releaseResults === 'after_deadline' && pastDeadline)
				? 'released'
				: 'pending';
		return json({
			status,
			autoScore: graded.scorePct,
			earned: graded.earned,
			total: graded.total,
			attemptsUsed: 1,
			attemptsLimit: 1,
			release,
			message: release === 'released' ? 'Jawaban membaca terkumpul.' : 'Jawaban terkumpul. Hasil menyusul sesuai pengaturan dosen.',
			...(release === 'released' ? { perQuestion: graded.perQuestion } : {}),
		} satisfies SubmitResponse);
	}

	// ── Listening ──────────────────────────────────────────────
	const config = parseListeningConfig(assignment.taskConfig);
	const answers = (body.answers ?? {}) as ListeningStudentAnswers;
	const prevListening = prevAnswers?.listening;
	const graded = gradeListening(config, answerKey, answers);
	const taskAnswers: TaskAnswers = {
		...prevAnswers,
		listening: {
			answers,
			savedAt: new Date().toISOString(),
			lastAttempt: {
				answers,
				submittedAt: new Date().toISOString(),
				scorePct: graded.scorePct,
				earned: graded.earned,
				total: graded.total,
			},
		},
	};
	const status: 'submitted' | 'late' = pastDeadline ? 'late' : 'submitted';
	const payload = { status, taskAnswers, autoScore: graded.scorePct };
	const savedId = await saveSubmission(existing, payload, assignmentId, user.id);
	void queueEvaluationDraft({ assignment, submissionId: savedId });

	const release: 'released' | 'pending' = pastDeadline ? 'released' : 'pending';
	const message = pastDeadline
		? 'Jawaban terkumpul (terlambat). Bagian pilihan ganda ternilai otomatis; jawaban lain menunggu penilaian dosen.'
		: 'Jawaban terkumpul. Bagian pilihan ganda ternilai otomatis; jawaban lain menunggu penilaian dosen.';
	const response: SubmitResponse = {
		status,
		autoScore: graded.scorePct,
		earned: graded.earned,
		total: graded.total,
		attemptsUsed: 1,
		attemptsLimit: 1,
		release,
		message,
		...(release === 'released' ? { perQuestion: graded.perQuestion } : {}),
	};
	return json(response);
});
