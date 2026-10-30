/**
 * Server-side helpers for the formative "Cek jawaban" (check answer) workflow.
 *
 * Renders the participant's current response (question picks, written text,
 * links) into readable text for the model, then asks the platform model for a
 * formative recommendation. The model works ONLY from the actual response,
 * the assignment's own instructions/requirements, and the lecturer-approved
 * rubric — it never sees answer keys and must never reveal answers, state
 * which items are right/wrong, rewrite, translate, or grade.
 */
import { collectModel } from '@/lib/task-assist.server';
import {
	parseModelJson,
	TASK_KIND_GUIDANCE,
	taskSourceContext,
} from '@/lib/feedback.server';
import {
	parseListeningConfig,
	parseQuizConfig,
	parseReadingConfig,
	parseSpeakingConfig,
	parseWritingConfig,
	type TaskKind,
} from '@/lib/task-types';
import type { Assignment } from '@/lib/assignments';
import {
	CHECK_LEVEL_LABEL,
	checkLevelOf,
	EXPLICIT_CORRECTION_LEVEL,
	type CheckResponsePayload,
} from '@/lib/check-types';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const clip = (value: string | undefined | null, max: number) => {
	const text = (value || '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
};

/** Like clip, but keeps line breaks so each feedback point stays its own line. */
const clipBlock = (value: string | undefined | null, max: number) => {
	const text = (value || '')
		.replace(/\r\n/g, '\n')
		.replace(/[^\S\n]+/g, ' ')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
};

type AnswerMap = Record<string, number | string | Record<string, string>>;

const asAnswerMap = (value: unknown): AnswerMap =>
	value && typeof value === 'object' && !(value instanceof Array) ? (value as AnswerMap) : {};

/** Render the participant's current response as readable text for the model. */
export function renderResponseText(
	assignment: Assignment,
	response: CheckResponsePayload,
): string {
	const kind = response.kind;
	const answers = asAnswerMap(response.answers);
	const parts: string[] = [];

	if (kind === 'quiz') {
		const config = parseQuizConfig(assignment.taskConfig);
		config.questions.forEach((q, i) => {
			const picked = answers[q.id];
			const block = [
				`Soal ${i + 1} (${q.points} poin): ${q.text}`,
				...q.options.map((o, oi) => `   ${LETTERS[oi] || '?'} ) ${o}`),
				`   Jawaban mahasiswa: ${
					typeof picked === 'number'
						? `${LETTERS[picked] || '?'} — ${q.options[picked] || ''}`
						: 'belum dijawab'
				}`,
			];
			parts.push(block.join('\n'));
		});
		if (config.questions.length === 0) parts.push('(Belum ada soal tersimpan.)');
		return parts.join('\n\n');
	}

	if (kind === 'listening') {
		const config = parseListeningConfig(assignment.taskConfig);
		config.questions.forEach((q, i) => {
			const answer = answers[q.id];
			const block = [`Pertanyaan ${i + 1} (${q.points} poin): ${q.text}`];
			if (q.type === 'mc') {
				q.options.forEach((o, oi) => block.push(`   ${LETTERS[oi] || '?'} ) ${o}`));
				block.push(
					`   Jawaban mahasiswa: ${
						typeof answer === 'number'
							? `${LETTERS[answer] || '?'} — ${q.options[answer] || ''}`
							: 'belum dijawab'
					}`,
				);
			} else if (q.type === 'matching') {
				q.pairs.forEach((p) => block.push(`   Pasangan: ${p.left} → ${p.right}`));
				const mapping =
					answer && typeof answer === 'object' && !(answer instanceof Array)
						? Object.entries(answer as Record<string, string>)
								.map(([l, r]) => `${l} → ${r}`)
								.join('; ')
						: '';
				block.push(`   Jawaban mahasiswa: ${mapping || 'belum dijawab'}`);
			} else {
				block.push(`   Jawaban mahasiswa: ${typeof answer === 'string' && answer.trim() ? answer : 'belum dijawab'}`);
			}
			parts.push(block.join('\n'));
		});
		if (config.questions.length === 0) parts.push('(Belum ada pertanyaan tersimpan.)');
		return parts.join('\n\n');
	}

	if (kind === 'reading') {
		const config = parseReadingConfig(assignment.taskConfig);
		if (config.passage) parts.push(`[TEKS BACAAN]\n${clip(config.passage, 8000)}`);
		config.questions.forEach((q, i) => {
			const picked = answers[q.id];
			const block = [
				`Soal ${i + 1} (${q.points} poin): ${q.text}`,
				...q.options.map((o, oi) => `   ${LETTERS[oi] || '?'} ) ${o}`),
				`   Jawaban mahasiswa: ${
					typeof picked === 'number'
						? `${LETTERS[picked] || '?'} — ${q.options[picked] || ''}`
						: 'belum dijawab'
				}`,
			];
			parts.push(block.join('\n'));
		});
		return parts.join('\n\n');
	}

	if (kind === 'writing') {
		const config = parseWritingConfig(assignment.taskConfig);
		if (config.prompt) parts.push(`[PROMPT TUGAS]\n${clip(config.prompt, 2000)}`);
		const numbered = response.numberedContent?.trim();
		parts.push(
			numbered
				? `[TEKS KIRIMAN MAHASISWA — bernomor per baris terlihat di editor]\n${clip(numbered, 12000)}`
				: response.content?.trim()
					? `[TEKS KIRIMAN MAHASISWA]\n${clip(response.content, 12000)}`
					: '[TEKS KIRIMAN MAHASISWA]\n(kosong — belum ditulis)',
		);
		if (typeof response.wordCount === 'number' && response.wordCount >= 0) {
			parts.push(`Jumlah kata saat ini: ${response.wordCount}`);
		}
		if (response.link?.trim()) parts.push(`Tautan lampiran: ${clip(response.link, 300)}`);
		return parts.join('\n\n');
	}

	if (kind === 'speaking') {
		const config = parseSpeakingConfig(assignment.taskConfig);
		if (config.prompt) parts.push(`[PROMPT TUGAS]\n${clip(config.prompt, 2000)}`);
		parts.push(
			response.content?.trim()
				? `[CATATAN / NASKAH MAHASISWA]\n${clip(response.content, 8000)}`
				: '[CATATAN / NASKAH MAHASISWA]\n(kosong)',
		);
		if (response.link?.trim()) parts.push(`Tautan rekaman: ${clip(response.link, 300)}`);
		return parts.join('\n\n');
	}

	// Generic assignment: notes + link only. File bytes are extracted separately
	// and appended by the caller — a filename alone is not an answer.
	if (response.content?.trim()) parts.push(`[CATATAN MAHASISWA]\n${clip(response.content, 12000)}`);
	if (response.link?.trim()) parts.push(`Tautan: ${clip(response.link, 300)}`);
	return parts.join('\n\n');
}

/** True when the payload itself has an answer, ignoring attachment names. */
export function responseHasDirectAnswer(response: CheckResponsePayload) {
	if (response.content?.trim()) return true;
	if (response.link?.trim()) return true;
	return Boolean(response.answers && Object.keys(response.answers).length > 0);
}

// ── Formative check feedback ─────────────────────────────────

export type CheckFeedback = { level: number; area: string; feedback: string; evidence: string };

export type CheckHintCriterion = { label: string; weight: number };

const CHECK_SYSTEM_PROMPT = [
	'Anda pemeriksa formatif "Cek jawaban" dalam Bahasa Indonesia untuk mahasiswa.',
	'Anda bekerja HANYA dari jawaban mahasiswa yang benar-benar dikirim, instruksi tugas, dan rubrik yang disetujui dosen yang benar-benar diberikan. Anda tidak pernah diberi kunci jawaban.',
	'Pemeriksaan bersifat BERTAHAP — ikuti tingkat yang ditentukan permintaan:',
	'Tingkat 1 (pertanyaan refleksi): tunjukkan area yang paling perlu ditinjau lalu ajukan pertanyaan refleksi yang membantu mahasiswa menemukan sendiri letak kekurangannya — jangan menjelaskan konsep dan jangan memberi langkah perbaikan spesifik.',
	'Tingkat 2 (petunjuk konsep): jelaskan konsep atau prinsip umum yang relevan dengan area tersebut — tanpa menyebut jawaban benar dan tanpa contoh yang tinggal disalin.',
	'Tingkat 3 (petunjuk terarah): berikan arahan perbaikan yang lebih terarah dan konkret pada area tersebut — tetap tanpa jawaban, tanpa menuliskan perbaikan langsung, tanpa menulis ulang jawaban mahasiswa.',
	'Tingkat 4 (koreksi eksplisit — HANYA ketika tingkat 4 diminta secara eksplisit): berikan bentuk yang benar untuk kesalahan paling penting pada area tersebut disertai penjelasan singkat mengapa — hanya pada tingkat ini boleh menuliskan koreksi langsung; tetap ringkas, jangan menulis ulang seluruh jawaban mahasiswa.',
	'Untuk Tingkat 1–3 DILARANG keras: memberikan jawaban atau bagian jawaban, menyatakan jawaban mana yang benar atau salah (termasuk memberi tanda benar/salah per soal), menuliskan perbaikan langsung, menulis ulang atau menerjemahkan jawaban mahasiswa, memberi angka nilai, atau mengarang kriteria/rubrik/fakta yang tidak ada. Tingkat 4 hanya boleh menuliskan koreksi bentuk yang benar disertai penjelasan singkat — bukan nilai dan bukan penilaian menyeluruh.',
	'Jangan pernah memberi angka nilai pada tingkat mana pun.',
	'Jika data tidak cukup, kosongkan field dan jelaskan di feedback.',
	'feedback HARUS berupa poin singkat dalam huruf kalimat biasa — JANGAN huruf kapital semua, JANGAN paragraf.',
	'Setiap poin satu baris, dipisah newline, diawali tepat satu tag: [sesuai], [perbaiki], [perlu], atau [tips].',
	'Format: [tag] Baris N: satu saran singkat dan SPESIFIK (maksimal 24 kata). Sebutkan persis kata, bentuk, atau tanda baca yang bermasalah dan mengapa — jangan sekadar "perbaiki kalimat ini" atau "arah bisa lebih runtut". Satu isu per baris. Maksimal 6 baris. Jangan menempelkan kutipan panjang dan jangan mengulang.',
	'Jangan mengklaim pelafalan, kelancaran, atau kualitas audio — Anda hanya membaca teks yang diberikan.',
	'Balas HANYA JSON valid tanpa markdown: {"area":"","feedback":"","evidence":""}',
	'area = nama area singkat dalam huruf kalimat (maks 80 karakter). feedback = poin ber-tag, satu poin per baris (maks 3000 karakter). evidence = satu baris per rujukan, format "Baris N: kutipan pendek", maks 1000 karakter, kosongkan bila tidak bisa dirujuk.',
].join(' ');

// ── OCR-first image checks ─────────────────────────────────

const OCR_NORMALIZE_SYSTEM = [
	'Anda perapi teks hasil bacaan OCR dalam bahasa asli teks tersebut.',
	'Rapikan HANYA kesalahan baca OCR yang jelas: spasi yang hilang atau berlebih, huruf yang salah dikenali (mis. rn→m, l/I/1 tertukar), tanda baca yang jelas salah tempat, dan typo kecil yang nyata.',
	'DILARANG: menulis ulang atau merapikan gaya kalimat, mengganti kata dengan sinonim, menerjemahkan, menambah atau menghapus isi, melengkapi bagian yang tidak terbaca, atau mengarang apa pun.',
	'Pertahankan bahasa, urutan, dan isi persis seperti aslinya. Bagian [tidak terbaca] biarkan apa adanya.',
	'Balas HANYA teks hasil rapian, tanpa komentar pembuka atau penutup.',
].join(' ');

/**
 * Normalize a student-reviewed OCR reading: fix ONLY obvious OCR errors
 * (spacing, misrecognized characters, clear typos). Never rewrites,
 * translates, or invents content. Falls back to the reviewed text when the
 * model is unavailable or its reply looks like a destructive rewrite.
 */
export async function normalizeOcrText(text: string): Promise<string> {
	const clean = text.replace(/\r\n/g, '\n').trim();
	if (!clean) return '';
	try {
		const raw = await collectModel(
			[
				'Rapikan teks hasil bacaan OCR berikut — hanya kesalahan baca yang jelas (spasi, huruf salah dikenali, tanda baca jelas salah, typo kecil). Jangan mengubah kata, urutan, isi, atau bahasa. Bagian [tidak terbaca] biarkan apa adanya. Balas HANYA teks hasil rapian.',
				`"""\n${clean.slice(0, 12000)}\n"""`,
			].join('\n\n'),
			[],
			OCR_NORMALIZE_SYSTEM,
		);
		const result = raw.replace(/^"+|"+$/g, '').trim();
		// Guard against a destructive rewrite: keep the reviewed text when the
		// reply is empty or shrank to less than half of it.
		if (!result || result.length < Math.max(20, clean.length * 0.5)) return clean;
		return result.slice(0, 12000);
	} catch {
		return clean;
	}
}

/** Ask the model for one formative check recommendation at a progressive level. */
export async function buildCheckFeedback(input: {
	taskLabel: string;
	workMode: string;
	instructions: string;
	requirements: string;
	language: string;
	criteria: CheckHintCriterion[];
	responseText: string;
	focus: string;
	/** 1-based check-attempt number driving the hint level (1→3, capped). */
	attempt: number;
	previous: { attempt: number; area: string }[];
	/** Task kind the check adapts to (Phase 6). */
	kind?: TaskKind | null;
	/** Grounded source-material context for the task kind (Phase 6). */
	sourceContext?: string;
	/** True when the student's answer was sent as a line-numbered copy (writing). */
	numbered?: boolean;
	/** CEFR level calibration guide for language-skills tasks ('' otherwise). */
	levelGuide?: string;
	/**
	 * True when the student explicitly requested explicit correction (Level 4).
	 * Never auto-escalated — only set when the student opts in after Level 3.
	 */
	explicit?: boolean;
	/**
	 * Phase 10 — validated learner-history context for personalized feedback.
	 * Empty/generic when personalization is off or no validated pattern exists.
	 * The model adapts its pedagogical strategy from this; it must never
	 * mention counts, internal confidence, or "your profile says…" to the
	 * student.
	 */
	personalizationContext?: string;
}): Promise<CheckFeedback | null> {
	const level = input.explicit ? EXPLICIT_CORRECTION_LEVEL : checkLevelOf(input.attempt);
	const criteriaLines = input.criteria
		.map((c) => `- ${c.label}${c.weight ? ` (bobot relatif ${c.weight})` : ''}`)
		.join('\n');

	const prompt = [
		`Periksa jawaban tugas ${input.taskLabel} (format kerja: ${input.workMode}) secara formatif.`,
		`Tingkat pemeriksaan ini: ${level} — ${CHECK_LEVEL_LABEL[level] || `Tingkat ${level}`}. Jawab HANYA sesuai tingkat ini.`,
		input.language ? `Bahasa/konteks tugas: ${clip(input.language, 80)}.` : '',
		input.instructions
			? `Instruksi tugas dosen:\n"""\n${clip(input.instructions, 4000)}\n"""`
			: 'Instruksi tugas dosen: (tidak ada)',
		input.requirements
			? `Ketentuan/rubrik tertulis dosen:\n"""\n${clip(input.requirements, 3000)}\n"""`
			: '',
		input.sourceContext
			? `Konteks materi tugas (satu-satunya konteks sumber yang tersedia — di luar ini tidak ada transkrip/rekaman yang bisa Anda akses):\n${clip(input.sourceContext, 1500)}`
			: '',
		input.criteria.length
			? `Rubrik yang disetujui dosen (satu-satunya acuan penilaian):\n${criteriaLines}`
			: 'Rubrik dosen belum tersedia — jangan mengarang kriteria; gunakan instruksi tugas saja dan sebut itu di feedback.',
		input.previous.length
			? `Hasil pemeriksaan sebelumnya (jangan ulangi, tunjukkan progres atau area baru):\n${input.previous
					.map((p) => `Pemeriksaan ${p.attempt} — ${p.area || '(area tidak disebut)'}`)
					.join('\n')}`
			: '',
		input.focus ? `Fokus yang diminta mahasiswa: ${clip(input.focus, 500)}` : '',
		input.numbered
			? 'Jawaban mahasiswa di bawah sudah diberi nomor baris sesuai tampilan editor mahasiswa. Jika merujuk lokasi pada jawaban, sebut nomor baris (mis. "baris 4") pada evidence atau feedback.'
			: '',
		input.levelGuide || '',
		input.personalizationContext
			? `${input.personalizationContext}`
			: '',
		'Jawaban mahasiswa saat ini (hasil pemeriksaan hanya dari isi ini):',
		`"""\n${clip(input.responseText, 12000)}\n"""`,
	].join('\n\n');

	try {
		const personalizationGuard = input.personalizationContext
			? ' Personalisasi: Anda boleh menyesuaikan strategi pedagogis dari riwayat pembelajaran tervalidasi yang diberikan, tetapi DILARANG menyebutkan jumlah kesalahan, statistik, skor, atau "profil Anda lemah pada…" kepada mahasiswa. Gunakan bahasa suportif dan natural (mis. "Mari kita latih pola ini sekali lagi").'
			: '';
		const system = input.kind
			? [CHECK_SYSTEM_PROMPT, TASK_KIND_GUIDANCE[input.kind], personalizationGuard]
					.filter(Boolean)
					.join(' ')
			: [CHECK_SYSTEM_PROMPT, personalizationGuard].filter(Boolean).join(' ');
		const raw = await collectModel(prompt, [], system);
		const parsed = parseModelJson(raw);
		if (!parsed) return null;
		const feedback = clipBlock(typeof parsed.feedback === 'string' ? parsed.feedback : '', 3000);
		if (!feedback) return null;
		return {
			level,
			area: clip(typeof parsed.area === 'string' ? parsed.area : '', 200),
			feedback,
			evidence: clipBlock(typeof parsed.evidence === 'string' ? parsed.evidence : '', 1000),
		};
	} catch {
		return null;
	}
}
