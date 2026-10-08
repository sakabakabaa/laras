/**
 * Phase 4 — safely link existing public-link answers to enrolled student
 * accounts when the submitted NIM unambiguously matches a student enrolled in
 * the mata kuliah the task belongs to.
 *
 * Linking reuses the existing public_submissions, users, enrollments, and
 * assignment_submissions systems — it never creates accounts, never
 * overwrites an existing enrolled submission, and never lets a public
 * participant claim another student's answers (the match is resolved
 * server-side from the lecturer's own roster/account data, not from the
 * public participant's input).
 *
 * Outcomes per public answer:
 *  - linked   — a student account was found, enrolled, had no existing
 *               submission; a new enrolled submission was created and the
 *               public row marked linked.
 *  - skipped  — no NIM, still a draft, already linked, no matching account,
 *               or the student is not enrolled in this mata kuliah.
 *  - conflict — NIM matched more than one account, or the student already
 *               has an enrolled submission for this task (never overwritten).
 *  - error    — an unexpected failure (e.g. a file could not be copied).
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type { Assignment } from '@/lib/assignments';
import type { PublicSubmissionRow } from '@/lib/public-drafts.server';

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/** Escape a value for use inside a PocketBase filter clause. */
const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export type LinkOutcome =
	| { nim: string; name: string; title: string; assignmentId: string; outcome: 'linked'; submissionId: string }
	| { nim: string; name: string; title: string; assignmentId: string; outcome: 'skipped'; reason: string }
	| { nim: string; name: string; title: string; assignmentId: string; outcome: 'conflict'; reason: string }
	| { nim: string; name: string; title: string; assignmentId: string; outcome: 'error'; error: string };

export type LinkSummary = {
	total: number;
	linked: number;
	skipped: number;
	conflict: number;
	errors: number;
};

export type LinkResult = { outcomes: LinkOutcome[]; summary: LinkSummary };

function summarize(outcomes: LinkOutcome[]): LinkResult {
	const summary: LinkSummary = {
		total: outcomes.length,
		linked: 0,
		skipped: 0,
		conflict: 0,
		errors: 0,
	};
	for (const o of outcomes) {
		if (o.outcome === 'linked') summary.linked += 1;
		else if (o.outcome === 'skipped') summary.skipped += 1;
		else if (o.outcome === 'conflict') summary.conflict += 1;
		else summary.errors += 1;
	}
	return { outcomes, summary };
}

/**
 * Build the create payload for the new enrolled submission. Text fields,
 * answers, and auto-score are always copied; files are fetched from the
 * public submission and re-uploaded so the enrolled row is self-contained and
 * the lecturer can grade it through the normal flow.
 */
async function buildSubmissionData(
	pubRow: PublicSubmissionRow,
	assignment: Assignment,
	studentId: string,
	files: string[],
): Promise<FormData | Record<string, unknown>> {
	const status =
		pubRow.status === 'graded' ? 'graded' : pubRow.status === 'late' ? 'late' : 'submitted';
	const base: Record<string, unknown> = {
		assignment: assignment.id,
		owner: studentId,
		content: pubRow.content || '',
		link: pubRow.link || '',
		group: pubRow.groupName || '',
		status,
		linkedFromPublic: true,
	};
	if (pubRow.taskAnswers) base.taskAnswers = pubRow.taskAnswers;
	if (pubRow.autoScore != null) base.autoScore = pubRow.autoScore;

	if (files.length === 0) return base;

	const fd = new FormData();
	for (const [key, value] of Object.entries(base)) {
		fd.set(key, typeof value === 'string' ? value : String(value));
	}
	// JSON field — send as a JSON string under multipart.
	if (pubRow.taskAnswers) fd.set('taskAnswers', JSON.stringify(pubRow.taskAnswers));
	const baseUrl = pocketbaseUrl();
	for (const filename of files) {
		const url = `${baseUrl}/api/files/public_submissions/${pubRow.id}/${encodeURIComponent(filename)}`;
		const resp = await fetch(url);
		if (!resp.ok) throw new Error(`Gagal menyalin berkas ${filename}.`);
		const blob = await resp.blob();
		fd.append('files', blob, filename);
	}
	return fd;
}

/** Link a single public submission row to its enrolled student, if safe. */
async function linkOne(
	pubRow: PublicSubmissionRow,
	assignment: Assignment,
): Promise<LinkOutcome> {
	const nim = (pubRow.nim || '').trim();
	const name = pubRow.participantName || '';
	const title = assignment.title;
	const base = { nim, name, title, assignmentId: assignment.id };

	// Collaborative (group) public submissions have no NIM — cannot match.
	if (!nim) return { ...base, outcome: 'skipped', reason: 'Tanpa NIM (kemungkinan kelompok).' };
	// Only final submissions are linked — drafts are still in progress.
	if (pubRow.status === 'draft')
		return { ...base, outcome: 'skipped', reason: 'Masih draf, belum dikumpulkan.' };
	// Already linked — never re-link or overwrite.
	if (pubRow.linkedSubmission)
		return { ...base, outcome: 'skipped', reason: 'Sudah ditautkan sebelumnya.' };

	// Match exactly one student account by NIM. The unique partial index on
	// users.nim makes >1 effectively impossible, but we guard anyway.
	const userRows = await pocketbaseAdmin.listRecords<{ id: string; nim?: string }>('users', {
		perPage: 5,
		filter: `nim="${esc(nim)}"`,
	});
	if (userRows.items.length === 0) {
		return { ...base, outcome: 'skipped', reason: 'Belum ada akun mahasiswa dengan NIM ini.' };
	}
	if (userRows.items.length > 1) {
		return { ...base, outcome: 'conflict', reason: 'NIM cocok dengan lebih dari satu akun.' };
	}
	const student = userRows.items[0];

	// The student must be enrolled in the mata kuliah the task belongs to —
	// this is the "correct course/task context" gate.
	const enrollment = await pocketbaseAdmin.listRecords('enrollments', {
		perPage: 1,
		filter: `owner="${esc(student.id)}" && course="${esc(assignment.course)}"`,
	});
	if (enrollment.items.length === 0) {
		return { ...base, outcome: 'skipped', reason: 'Mahasiswa belum terdaftar di mata kuliah ini.' };
	}

	// Do not silently overwrite an existing enrolled submission — a public
	// participant must not replace a student's own work by entering their NIM.
	const existing = await pocketbaseAdmin.listRecords<{ id: string }>('assignment_submissions', {
		perPage: 1,
		filter: `assignment="${esc(assignment.id)}" && owner="${esc(student.id)}"`,
	});
	if (existing.items.length > 0) {
		return {
			...base,
			outcome: 'conflict',
			reason: 'Mahasiswa sudah memiliki pengumpulan terdaftar untuk tugas ini.',
		};
	}

	const files = pubRow.files || [];
	const created = await pocketbaseAdmin.createRecord<{ id: string }>(
		'assignment_submissions',
		await buildSubmissionData(pubRow, assignment, student.id, files),
	);

	// Mark the public answer as linked (server-side superuser write only).
	await pocketbaseAdmin.updateRecord('public_submissions', pubRow.id, {
		linkedUser: student.id,
		linkedSubmission: created.id,
	});

	return { ...base, outcome: 'linked', submissionId: created.id };
}

async function runLinks(
	rows: PublicSubmissionRow[],
	assignment: Assignment,
): Promise<LinkResult> {
	const outcomes: LinkOutcome[] = [];
	for (const row of rows) {
		try {
			outcomes.push(await linkOne(row, assignment));
		} catch (error) {
			outcomes.push({
				nim: row.nim || '',
				name: row.participantName || '',
				title: assignment.title,
				assignmentId: assignment.id,
				outcome: 'error',
				error: error instanceof Error ? error.message : 'Gagal memproses jawaban publik ini.',
			});
		}
	}
	return summarize(outcomes);
}

/** Link all public answers for one assignment to their enrolled students. */
export async function linkPublicAnswersForAssignment(assignmentId: string): Promise<LinkResult> {
	const assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	const pubs = await pocketbaseAdmin.listRecords<PublicSubmissionRow>('public_submissions', {
		perPage: 500,
		filter: `assignment="${esc(assignmentId)}"`,
		sort: 'created',
	});
	return runLinks(pubs.items, assignment);
}

/** Link all public answers across every assignment in a mata kuliah. */
export async function linkPublicAnswersForCourse(courseId: string): Promise<LinkResult> {
	const assignments = await pocketbaseAdmin.listRecords<Assignment>('assignments', {
		perPage: 200,
		filter: `course="${esc(courseId)}"`,
	});
	const outcomes: LinkOutcome[] = [];
	for (const assignment of assignments.items) {
		const pubs = await pocketbaseAdmin.listRecords<PublicSubmissionRow>('public_submissions', {
			perPage: 500,
			filter: `assignment="${esc(assignment.id)}"`,
			sort: 'created',
		});
		const result = await runLinks(pubs.items, assignment);
		outcomes.push(...result.outcomes);
	}
	return summarize(outcomes);
}
