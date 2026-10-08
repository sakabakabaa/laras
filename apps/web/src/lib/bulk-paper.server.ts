/**
 * Server-only bulk paper-answer input: enrolled-roster resolution, scan
 * extraction via the platform model, and final submission creation.
 *
 * Nothing is written during extraction — images are staged only so the model
 * service can fetch them, and are deleted once attached to a submission (or on
 * failure). Submissions are created/updated through the superuser client so the
 * `assignment_submissions` createRule (which requires owner = caller) does not
 * block the lecturer acting on behalf of students. The resulting rows are
 * ordinary `assignment_submissions` records, so the lecturer dashboard and
 * evaluation workspace validate them exactly like any other submission.
 */
import { collectModel } from '@/lib/task-assist.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type { Assignment } from '@/lib/assignments';
import { matchStudent, newRowId, type PaperEntry, type RosterStudent } from '@/lib/bulk-paper';

const IMAGES_COLLECTION = '_integratedAiImages';

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

const requireEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

const filesOrigin = () => `https://${requireEnv('WEBSITE_DOMAIN')}/hcgi/platform`;

/** Enrolled students for a course, with display identity resolved server-side. */
export async function resolveEnrolledRoster(courseId: string): Promise<RosterStudent[]> {
	const enrollments = await pocketbaseAdmin.listRecords<{
		owner: string;
		expand?: { owner?: { name?: string; nim?: string; email?: string } };
	}>('enrollments', {
		filter: `course="${courseId}"`,
		expand: 'owner',
		perPage: 1000,
	});
	const seen = new Set<string>();
	const students: RosterStudent[] = [];
	for (const row of enrollments.items) {
		if (!row.owner || seen.has(row.owner)) continue;
		seen.add(row.owner);
		const owner = row.expand?.owner;
		students.push({
			id: row.owner,
			name: owner?.name || '',
			nim: owner?.nim || '',
			email: owner?.email || '',
		});
	}
	return students;
}

type RawEntry = { nim?: string; name?: string; answer?: string };

/** Tolerantly parse a JSON array of entries from a model reply. */
function parseEntriesJson(output: string): RawEntry[] {
	const trimmed = output.trim();
	const tryParse = (candidate: string): RawEntry[] | null => {
		try {
			const parsed = JSON.parse(candidate);
			return Array.isArray(parsed) ? (parsed as RawEntry[]) : null;
		} catch {
			return null;
		}
	};
	let arr = tryParse(trimmed);
	if (!arr) {
		const start = trimmed.indexOf('[');
		const end = trimmed.lastIndexOf(']');
		if (start !== -1 && end > start) arr = tryParse(trimmed.slice(start, end + 1));
	}
	if (!arr) return [];
	return arr
		.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
		.map((item) => ({
			nim: String(item.nim ?? '').trim(),
			name: String(item.name ?? '').trim(),
			answer: String(item.answer ?? '').trim(),
		}));
}

const EXTRACT_PROMPT = [
	'Anda asisten dosen di LARAS. Lampiran adalah foto lembar jawaban kertas mahasiswa untuk sebuah tugas.',
	'Ekstrak data jawaban mahasiswa dari gambar tersebut dan kembalikan HANYA berupa JSON array (tanpa penjelasan, tanpa markdown) berisi satu objek per mahasiswa yang teridentifikasi:',
	'[{"nim":"...","name":"...","answer":"..."}]',
	'Aturan:',
	'- nim: nomor induk mahasiswa (NIM) jika tercetak/tertulis jelas pada lembar; jika tidak ada, kirim string kosong.',
	'- name: nama mahasiswa jika tercetak/tertulis jelas; jika tidak ada, kirim string kosong.',
	'- answer: transkripsi lengkap jawaban mahasiswa dalam bahasa aslinya. Pertahankan kata-kata asli mahasiswa. Bagian yang tidak terbaca tulis sebagai [tidak terbaca]. Maksimal 6000 karakter.',
	'- Jika satu gambar memuat beberapa lembar jawaban mahasiswa berbeda, kembalikan satu objek per mahasiswa.',
	'- Jika gambar tidak memuat jawaban mahasiswa yang dapat diidentifikasi, kembalikan array kosong [].',
].join('\n');

/**
 * Stage one scan image, ask the model to extract student answer data, and
 * return reviewable entries. The staged image is kept (its id is returned on
 * each entry) so it can be attached to the matching submission later; it is
 * deleted by the submit step once attached, or here if the model call fails.
 */
export async function extractImageEntries(
	image: File,
	_assignment: Assignment,
): Promise<PaperEntry[]> {
	const form = new FormData();
	form.append('file', image, image.name || 'scan.jpg');
	const stored = await pocketbaseAdmin.createRecord<{ id: string; file: string }>(
		IMAGES_COLLECTION,
		form,
	);
	const token = await pocketbaseAdmin.getFileToken();
	const imageUrl = `${filesOrigin()}/api/files/${IMAGES_COLLECTION}/${stored.id}/${stored.file}?token=${token}`;

	let output = '';
	try {
		output = await collectModel(EXTRACT_PROMPT, [imageUrl]);
	} catch (error) {
		await pocketbaseAdmin.deleteRecord(IMAGES_COLLECTION, stored.id).catch(() => {});
		throw error;
	}

	const raw = parseEntriesJson(output);
	if (raw.length === 0) {
		// Nothing identifiable — drop the staged image so it does not linger.
		await pocketbaseAdmin.deleteRecord(IMAGES_COLLECTION, stored.id).catch(() => {});
		return [];
	}
	return raw.map((item) => ({
		id: newRowId('pe'),
		nim: item.nim || '',
		name: item.name || '',
		answer: (item.answer || '').slice(0, 10000),
		imageId: stored.id,
		imageFile: stored.file,
	}));
}

export type SubmitOutcome = {
	id: string;
	ok: boolean;
	reason?: string;
	studentName?: string;
};

/** Fetch the staged scan image bytes so they can be attached to a submission. */
async function fetchImageBytes(imageId: string, imageFile: string): Promise<Blob> {
	const token = await pocketbaseAdmin.getFileToken();
	const url = `${pocketbaseUrl()}/api/files/${IMAGES_COLLECTION}/${imageId}/${imageFile}?token=${token}`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Gagal mengambil gambar (${response.status}).`);
	return response.blob();
}

/**
 * Create or update `assignment_submissions` rows for each matched entry as a
 * final student answer. Unmatched or ambiguous entries are skipped and
 * reported — never guessed. Existing submissions are updated in place
 * (content + scan replaced, status set to submitted/late); grade fields are
 * left untouched for the lecturer to (re-)grade through the normal flow.
 */
export async function createPaperSubmissions(
	assignment: Assignment,
	entries: PaperEntry[],
): Promise<SubmitOutcome[]> {
	const roster = await resolveEnrolledRoster(assignment.course);
	const deadline = assignment.deadline ? new Date(assignment.deadline).getTime() : NaN;
	const pastDeadline = Number.isFinite(deadline) && Date.now() > deadline;
	const status: 'submitted' | 'late' = pastDeadline ? 'late' : 'submitted';

	const imageCache = new Map<string, Blob>();
	const outcomes: SubmitOutcome[] = [];

	for (const entry of entries) {
		const match = matchStudent(entry, roster);
		if (match.status !== 'matched' || !match.student) {
			outcomes.push({
				id: entry.id,
				ok: false,
				reason:
					match.status === 'ambiguous'
						? 'Cocok dengan lebih dari satu mahasiswa — perjelas NIM atau nama.'
						: 'Tidak cocok dengan mahasiswa terdaftar pada mata kuliah ini.',
			});
			continue;
		}
		const student = match.student;
		try {
			const existing = await pocketbaseAdmin.listRecords<{
				id: string;
				files?: string[];
			}>('assignment_submissions', {
				filter: `assignment="${assignment.id}" && owner="${student.id}"`,
				perPage: 1,
			});
			const existingRec = existing.items[0];

			const fd = new FormData();
			fd.append('status', status);
			fd.append('content', (entry.answer || '').slice(0, 10000));

			if (entry.imageId && entry.imageFile) {
				let blob = imageCache.get(entry.imageId);
				if (!blob) {
					blob = await fetchImageBytes(entry.imageId, entry.imageFile);
					imageCache.set(entry.imageId, blob);
				}
				if (existingRec) {
					// Preserve previously uploaded files alongside the new scan.
					for (const filename of existingRec.files || []) fd.append('files', filename);
				}
				fd.append('files', blob, entry.imageFile);
			}

			if (existingRec) {
				await pocketbaseAdmin.updateRecord('assignment_submissions', existingRec.id, fd);
			} else {
				fd.append('assignment', assignment.id);
				fd.append('owner', student.id);
				await pocketbaseAdmin.createRecord('assignment_submissions', fd);
			}

			// The staged scan has been attached — remove the temp image record.
			if (entry.imageId) {
				await pocketbaseAdmin.deleteRecord(IMAGES_COLLECTION, entry.imageId).catch(() => {});
			}

			outcomes.push({
				id: entry.id,
				ok: true,
				studentName: student.name || student.email || student.nim || 'Mahasiswa',
			});
		} catch {
			outcomes.push({ id: entry.id, ok: false, reason: 'Gagal menyimpan kiriman.' });
		}
	}

	return outcomes;
}
