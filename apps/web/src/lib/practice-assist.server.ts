/**
 * Batch 3 — server-side AI assistance for Latihan formatif practices.
 *
 * The model may ONLY work from the practice's own instructions/criteria, the
 * lecturer-approved course materials passed in by the caller (Phase 4/5
 * context bundle), the selected rubric criteria, and the student's current
 * practice work. Output is guidance only — clearly labeled as such, never an
 * official assessment: no answers, no right/wrong verdicts, no rewrites, no
 * grades, and nothing is persisted or fed into evaluation/grading/publishing.
 */
import { collectModel } from '@/lib/task-assist.server';
import { parseModelJson, TASK_KIND_GUIDANCE, type HintCriterion } from '@/lib/feedback.server';
import type { TaskKind } from '@/lib/task-types';
import type { Assignment } from '@/lib/assignments';

const clip = (value: string | undefined | null, max: number) => {
	const text = (value || '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
};

export type PracticeCitation = {
	file: string;
	title: string;
	section: string;
	pageRef: string;
};

export type PracticeAssist = {
	area: string;
	guidance: string;
	evidence: string;
};

const PRACTICE_ASSIST_SYSTEM = [
	'Anda asisten latihan formatif "Panduan AI" dalam Bahasa Indonesia untuk mahasiswa.',
	'Anda bekerja HANYA dari instruksi latihan, kriteria latihan/rubrik yang dipilih dosen, materi mata kuliah yang disetujui dosen dan benar-benar diberikan, serta pekerjaan latihan mahasiswa yang benar-benar dikirim. Anda tidak pernah diberi kunci jawaban.',
	'Tugas Anda memberikan PETUNJUK, SARAN, dan draf UMPAN BALIK FORMATIF yang membantu mahasiswa memperbaiki pekerjaannya sendiri.',
	'DILARANG keras: memberikan jawaban atau bagian jawaban, menyatakan jawaban mana yang benar atau salah, menuliskan perbaikan langsung, menulis ulang atau menerjemahkan pekerjaan mahasiswa, memberi angka nilai atau penilaian resmi, atau mengarang kriteria/materi/fakta yang tidak ada.',
	'Panduan ini BUKAN penilaian resmi — nilai resmi hanya ditetapkan dosen pada tugas formal, dan latihan ini tidak berdampak pada nilai.',
	'Jika data tidak cukup (mis. pekerjaan masih kosong atau materi tidak tersedia), kosongkan field dan jelaskan di guidance.',
	'Balas HANYA JSON valid tanpa markdown: {"area":"","guidance":"","evidence":""}',
	'guidance HARUS berupa poin singkat, satu poin per baris, bukan paragraf. Setiap baris diawali tepat satu tag: [sesuai], [perbaiki], [perlu], atau [tips]. Format: [tag] temuan singkat — saran yang bisa dilakukan. Maksimal 8 baris. Jangan mengklaim pelafalan, kelancaran, atau kualitas audio.',
	'area = area latihan yang paling perlu diperbaiki (maks 200 karakter). guidance = poin ber-tag (maks 3000 karakter). evidence = rujukan lokasi pada pekerjaan mahasiswa atau materi (nomor soal/paragraf/bagian materi), maks 1000 karakter, kosongkan bila tidak bisa dirujuk.',
].join(' ');

/**
 * Build one grounded practice-assistance response. `materialContext` is the
 * only source material the model may use — already filtered to
 * lecturer-approved sections by the caller. Returns null when the model
 * cannot produce usable guidance (the caller surfaces an honest message
 * instead of guessing).
 */
export async function buildPracticeAssist(input: {
	assignment: Assignment;
	/** Readable text of the student's current practice work. */
	responseText: string;
	/** Selected rubric criteria (never invented). */
	criteria: HintCriterion[];
	/** Lecturer-approved course material context ('' when none is approved). */
	materialContext: string;
	/** Student-requested focus ('' when none). */
	focus: string;
	/** Task-kind source-material context from the assignment's own config. */
	sourceContext?: string;
	kind?: TaskKind | null;
}): Promise<PracticeAssist | null> {
	const { assignment } = input;
	const criteriaLines = input.criteria
		.map((c) => `- ${c.label}${c.weight ? ` (bobot relatif ${c.weight})` : ''}`)
		.join('\n');

	const prompt = [
		`Bantu mahasiswa pada latihan formatif "${clip(assignment.title, 200)}" (format kerja: ${assignment.mode}).`,
		'Hasil Anda adalah PANDUAN — bukan penilaian resmi dan bukan jawaban.',
		assignment.instructions
			? `Instruksi latihan dosen:\n"""\n${clip(assignment.instructions, 4000)}\n"""`
			: 'Instruksi latihan dosen: (tidak ada)',
		assignment.requirements
			? `Kriteria latihan tertulis dosen:\n"""\n${clip(assignment.requirements, 3000)}\n"""`
			: '',
		input.materialContext
			? `Materi mata kuliah yang disetujui dosen (satu-satunya materi sumber yang tersedia):\n"""\n${clip(input.materialContext, 9000)}\n"""`
			: 'Materi mata kuliah yang disetujui dosen: (belum ada — jangan mengarang materi; gunakan instruksi dan kriteria latihan saja dan sebut itu di guidance).',
		input.criteria.length
			? `Kriteria rubrik yang dipilih dosen:\n${criteriaLines}`
			: '',
		input.sourceContext
			? `Konteks materi tugas (satu-satunya konteks sumber tugas yang tersedia):\n${clip(input.sourceContext, 1500)}`
			: '',
		input.focus ? `Fokus yang diminta mahasiswa: ${clip(input.focus, 500)}` : '',
		'Pekerjaan latihan mahasiswa saat ini (panduan hanya dari isi ini):',
		`"""\n${clip(input.responseText, 12000) || '(kosong — mahasiswa belum menulis apa pun)'}\n"""`,
	].join('\n\n');

	try {
		const system = input.kind
			? [PRACTICE_ASSIST_SYSTEM, TASK_KIND_GUIDANCE[input.kind]].join(' ')
			: PRACTICE_ASSIST_SYSTEM;
		const raw = await collectModel(prompt, [], system);
		const parsed = parseModelJson(raw);
		if (!parsed) return null;
		const guidance = clip(typeof parsed.guidance === 'string' ? parsed.guidance : '', 3000);
		if (!guidance) return null;
		return {
			area: clip(typeof parsed.area === 'string' ? parsed.area : '', 200),
			guidance,
			evidence: clip(typeof parsed.evidence === 'string' ? parsed.evidence : '', 1000),
		};
	} catch {
		return null;
	}
}
