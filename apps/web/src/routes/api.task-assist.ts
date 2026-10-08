import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import {
	ASSIST_KIND_LABEL,
	buildTaskAssist,
	imageFilenames,
	submissionImageUrl,
	type AssistKind,
} from '@/lib/task-assist.server';
import { parseWritingConfig } from '@/lib/task-types';
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';

type Body = {
	submissionId?: string;
	kind?: string;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/**
 * POST /api/task-assist
 *
 * Faculty-only AI assistance over a student's actual submission (Menulis and
 * other specialized tasks): feedback drafts, summaries, or transcriptions of
 * handwritten photo work. Grounded strictly in the submission's own text /
 * images and the lecturer's stored rubric. Returns a suggestion only — nothing
 * is written until the lecturer confirms and saves it themselves.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const submissionId = body.submissionId?.trim();
	const kind = body.kind?.trim() as AssistKind | '';
	if (!submissionId) return apiError(422, 'submissionId wajib diisi.');
	if (kind !== 'feedback' && kind !== 'summary' && kind !== 'transcription') {
		return apiError(422, 'Jenis bantuan tidak dikenal.');
	}

	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return apiError(401, 'Masuk sebagai dosen untuk memakai asisten penilaian.');

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
		return apiError(403, 'Asisten penilaian hanya untuk dosen.');
	}
	if (!user.verified) {
		return apiError(403, 'Verifikasi email Anda sebelum memakai asisten AI.');
	}

	// Loaded with the lecturer's own token so the collection rule itself
	// verifies they own this assignment before anything is read.
	let submission: AssignmentSubmission;
	try {
		submission = await pb.collection('assignment_submissions').getOne<AssignmentSubmission>(
			submissionId,
		);
	} catch {
		return apiError(404, 'Kiriman tidak ditemukan atau bukan milik kelas Anda.');
	}
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(submission.assignment);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}

	const writing = parseWritingConfig(assignment.taskConfig);
	const images = imageFilenames(submission.files).map((f) => submissionImageUrl(submission.id, f));

	const { suggestion } = await buildTaskAssist({
		kind,
		studentText: submission.content || '',
		imageUrls: images,
		criteria: writing.criteria.map((c) => ({ label: c.label, weight: c.weight })),
		assignmentPrompt: writing.prompt || assignment.instructions || '',
		requirements: assignment.requirements || writing.formatGuidance || '',
	});

	return json({
		kind,
		kindLabel: ASSIST_KIND_LABEL[kind],
		suggestion,
		imageCount: images.length,
		note: 'Saran hanya draf — periksa dan sunting sebelum disimpan. Tidak ada yang ditulis otomatis.',
	});
});
