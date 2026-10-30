import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { isPastDeadline, SHAPE_LABEL, type Assignment, type AssignmentSubmission } from '@/lib/assignments';
import { parseSpeakingConfig, parseTaskAnswers, parseWritingConfig, taskKindForShape, TASK_KIND_LABEL, type TaskKind } from '@/lib/task-types';
import {
	buildProgressiveHint,
	criteriaForAssignment,
	extractSubmissionContent,
	parseExtracted,
	taskSourceContext,
} from '@/lib/feedback.server';

type Body = {
	action?: string;
	submissionId?: string;
	id?: string;
	focus?: string;
	status?: string;
	decision?: string;
	hint?: string;
	lecturerNote?: string;
	release?: boolean;
};

type FeedbackRow = {
	id: string;
	assignment: string;
	submission: string;
	owner: string;
	level: number;
	area: string;
	hint: string;
	evidence: string;
	status: string;
	review: string;
	released: boolean;
	lecturerNote: string;
	extracted: unknown;
	created: string;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/** Authenticate the caller's PocketBase token; returns null on failure. */
async function authUser(request: Request) {
	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return { error: apiError(401, 'Masuk untuk memakai panduan AI.') } as const;
	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return { error: apiError(401, 'Sesi tidak valid. Masuk kembali.') } as const;
	}
	const user = pb.authStore.record as { id?: string; role?: string; verified?: boolean } | null;
	if (!user?.id) return { error: apiError(401, 'Sesi tidak valid. Masuk kembali.') } as const;
	return { pb, user } as const;
}

/**
 * POST /api/feedback
 *
 * Staged AI feedback on a student's own submission:
 * - `hint`   — the student requests the next progressive hint (max 3 levels).
 * - `mark`   — the student marks a hint understood / still unclear.
 * - `review` — the lecturer approves / edits / rejects a hint and controls
 *   whether it stays visible to the student.
 *
 * Hints are grounded in the extracted submission content, the assignment's own
 * instructions, and the lecturer-approved rubric only. They are formative
 * guidance, never an official evaluation; the lecturer's review is the
 * authoritative record.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const act = body.action?.trim();

	if (act === 'hint') return hintAction(request, body);
	if (act === 'mark') return markAction(request, body);
	if (act === 'review') return reviewAction(request, body);
	return apiError(422, 'Aksi tidak dikenal (hint, mark, atau review).');
});

// ── Student: request the next progressive hint ───────────────

async function hintAction(request: Request, body: Body) {
	const auth = await authUser(request);
	if ('error' in auth) return auth.error;
	const { pb, user } = auth;

	const submissionId = body.submissionId?.trim();
	if (!submissionId) return apiError(422, 'submissionId wajib diisi.');

	// Loaded with the caller's own token so the collection rule verifies access.
	let submission: AssignmentSubmission;
	try {
		submission = await pb.collection('assignment_submissions').getOne<AssignmentSubmission>(submissionId);
	} catch {
		return apiError(404, 'Kiriman tidak ditemukan. Simpan draf pekerjaan lebih dulu.');
	}
	if (submission.owner !== user.id) {
		return apiError(403, 'Panduan bertahap hanya untuk mahasiswa pemilik kiriman.');
	}
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(submission.assignment);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.status !== 'published') {
		return apiError(422, 'Panduan hanya tersedia saat tugas diterbitkan.');
	}
	if (isPastDeadline(assignment.deadline) && submission.status !== 'revision') {
		return apiError(422, 'Batas waktu sudah lewat — panduan tidak tersedia lagi.');
	}

	const rows = await pocketbaseAdmin.listRecords<FeedbackRow>('ai_feedback', {
		perPage: 50,
		filter: `submission="${submission.id}" && owner="${user.id}"`,
		sort: 'created',
	});
	const level = rows.items.length + 1;
	if (level > 3) {
		return apiError(422, 'Panduan bertahap sudah mencapai tingkat maksimal (3 tingkat).');
	}

	const kind = taskKindForShape(assignment.shape) as TaskKind | null;

	// Reuse the stored extraction snapshot so OCR/PDF work happens once.
	const extracted =
		parseExtracted(rows.items[rows.items.length - 1]?.extracted) ??
		(await extractSubmissionContent(submission, kind || undefined));
	if (!extracted.ok) {
		return apiError(
			422,
			'Isi kiriman belum bisa dibaca. ' +
				(extracted.unreadable[0] ||
					'Tulis teks langsung atau unggah dokumen/foto yang jelas, lalu coba lagi.'),
		);
	}

	const criteria = criteriaForAssignment(assignment);
	const language =
		kind === 'writing'
			? parseWritingConfig(assignment.taskConfig).language
			: kind === 'speaking'
				? parseSpeakingConfig(assignment.taskConfig).language
				: '';

	const hint = await buildProgressiveHint({
		level,
		taskLabel: kind
			? TASK_KIND_LABEL[kind]
			: assignment.shape
				? SHAPE_LABEL[assignment.shape]
				: 'Tugas',
		workMode: assignment.mode,
		instructions: assignment.instructions || '',
		requirements: assignment.requirements || '',
		language,
		criteria,
		extracted,
		focus: body.focus?.trim().slice(0, 500) || '',
		previousHints: rows.items.map((r) => ({ level: r.level, area: r.area, hint: r.hint })),
		kind,
		sourceContext: taskSourceContext(assignment),
	});
	if (!hint) {
		return apiError(422, 'Panduan belum dapat disusun dari isi kiriman ini. Perbaiki pekerjaan Anda lalu coba lagi.');
	}

	const prevAnswers = parseTaskAnswers(submission.taskAnswers);
	const attempt = prevAnswers?.quiz?.attemptsUsed || 1;

	await pocketbaseAdmin.createRecord('ai_feedback', {
		assignment: assignment.id,
		submission: submission.id,
		owner: user.id,
		attempt,
		level,
		area: hint.area,
		hint: hint.hint,
		evidence: hint.evidence,
		focus: body.focus?.trim().slice(0, 500) || '',
		extracted,
		criteria,
		status: 'open',
		review: 'pending',
		released: true,
	});

	return json({
		ok: true,
		level,
		area: hint.area,
		hint: hint.hint,
		evidence: hint.evidence,
		hasRubric: criteria.length > 0,
		unreadable: extracted.unreadable,
		note: 'Panduan AI bersifat formatif — bukan nilai resmi. Dosen dapat meninjau semua panduan.',
	});
}

// ── Student: mark a hint understood / unclear ────────────────

async function markAction(request: Request, body: Body) {
	const auth = await authUser(request);
	if ('error' in auth) return auth.error;
	const { pb, user } = auth;

	const id = body.id?.trim();
	const status = body.status?.trim();
	if (!id) return apiError(422, 'id wajib diisi.');
	if (status !== 'understood' && status !== 'unclear') {
		return apiError(422, 'status harus understood atau unclear.');
	}

	// Loaded with the caller's token so the rule verifies ownership.
	let row: FeedbackRow;
	try {
		row = await pb.collection('ai_feedback').getOne<FeedbackRow>(id);
	} catch {
		return apiError(404, 'Panduan tidak ditemukan.');
	}
	if (row.owner !== user.id) {
		return apiError(403, 'Hanya mahasiswa pemilik yang dapat menandai panduan ini.');
	}

	// Written via superuser with a strict field whitelist.
	await pocketbaseAdmin.updateRecord('ai_feedback', id, { status });
	return json({ ok: true });
}

// ── Lecturer: approve / edit / reject a hint ─────────────────

async function reviewAction(request: Request, body: Body) {
	const auth = await authUser(request);
	if ('error' in auth) return auth.error;
	const { pb, user } = auth;
	if (user.role !== 'faculty') {
		return apiError(403, 'Peninjauan panduan hanya untuk dosen.');
	}
	if (!user.verified) {
		return apiError(403, 'Verifikasi email Anda sebelum meninjau panduan AI.');
	}

	const id = body.id?.trim();
	const decision = body.decision?.trim();
	if (!id) return apiError(422, 'id wajib diisi.');
	if (decision !== 'approved' && decision !== 'edited' && decision !== 'rejected') {
		return apiError(422, 'Keputusan harus approved, edited, atau rejected.');
	}

	// Loaded with the lecturer's token so the rule verifies they own the assignment.
	let row: FeedbackRow;
	try {
		row = await pb.collection('ai_feedback').getOne<FeedbackRow>(id);
	} catch {
		return apiError(404, 'Panduan tidak ditemukan atau bukan milik kelas Anda.');
	}
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(row.assignment);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.owner !== user.id) {
		return apiError(403, 'Hanya dosen pemilik tugas yang dapat meninjau panduan ini.');
	}

	const patch: Record<string, unknown> = { review: decision };
	if (decision === 'edited') {
		const hint = body.hint?.trim();
		if (!hint) return apiError(422, 'Teks panduan suntingan wajib diisi.');
		patch.hint = hint.slice(0, 3000);
	}
	if (typeof body.lecturerNote === 'string') {
		patch.lecturerNote = body.lecturerNote.trim().slice(0, 2000);
	}
	if (decision === 'rejected') {
		patch.released = false;
	} else if (typeof body.release === 'boolean') {
		patch.released = body.release;
	}

	await pocketbaseAdmin.updateRecord('ai_feedback', id, patch);
	return json({
		ok: true,
		decision,
		note:
			decision === 'rejected'
				? 'Panduan ditolak dan disembunyikan dari mahasiswa.'
				: 'Keputusan tersimpan. Evaluasi resmi tetap milik dosen.',
	});
}
