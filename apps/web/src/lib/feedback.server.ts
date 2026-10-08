/**
 * Staged AI feedback for image/document submissions.
 *
 * Two server-side stages:
 *
 * 1. EXTRACTION — pull readable content out of the student's own submission:
 *    direct text, PDF documents (pdf-parse, page-aware), and handwritten photo
 *    work (model transcription acting as OCR). Anything unreadable is reported
 *    in `unreadable` notes — never guessed or filled in.
 *
 * 2. PROGRESSIVE HINTS — formative guidance in three levels: (1) identify the
 *    area + a reflection question, (2) a general concept hint, (3) a focused
 *    hint. The model may ONLY work from the extracted submission content, the
 *    assignment's own instructions/requirements, and the lecturer-approved
 *    rubric snapshot. It must never reveal answers, rewrite, translate, or
 *    grade the work.
 *
 * Every hint is stored in `ai_feedback` for lecturer review; nothing here is an
 * official evaluation.
 */
import logger from '@/lib/logger.server';
import { collectModel, storedFileUrl } from '@/lib/task-assist.server';
import {
	parseListeningConfig,
	parseReadingConfig,
	parseSpeakingConfig,
	parseWritingConfig,
	taskKindForShape,
	type TaskKind,
} from '@/lib/task-types';
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const PDF_EXT = /\.pdf$/i;
const AUDIO_VIDEO_EXT = /\.(mp3|wav|ogg|m4a|aac|mp4|webm|ogv|mov|mkv)$/i;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_OCR_IMAGES = 5;

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

const clip = (value: string | undefined | null, max: number) => {
	const text = (value || '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
};

// ── Stage 1: content extraction ──────────────────────────────

/**
 * OCR-first image check snapshot kept on a check attempt: the raw OCR
 * reading, the participant-reviewed text, the normalized checked text, and
 * the original image reference (lecturer history only).
 */
export type OcrAttemptSnapshot = {
	rawText: string;
	reviewedText: string;
	normalizedText: string;
	image: { name: string; url: string };
};

export type ExtractedContent = {
	ok: boolean;
	text: string;
	pages: number;
	images: number;
	unreadable: string[];
	/** Present only on OCR-first image checks. */
	ocr?: OcrAttemptSnapshot;
};

/** Tolerant parse of a stored extraction snapshot (PocketBase json column). */
export function parseExtracted(value: unknown): ExtractedContent | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	const text = typeof raw.text === 'string' ? raw.text : '';
	if (!text.trim()) return null;
	const ocrRaw = raw.ocr;
	const ocr =
		ocrRaw && typeof ocrRaw === 'object'
			? (ocrRaw as OcrAttemptSnapshot)
			: undefined;
	return {
		ok: raw.ok !== false,
		text,
		pages: typeof raw.pages === 'number' ? raw.pages : 0,
		images: typeof raw.images === 'number' ? raw.images : 0,
		unreadable: Array.isArray(raw.unreadable)
			? raw.unreadable.filter((n): n is string => typeof n === 'string')
			: [],
		...(ocr && typeof ocr.normalizedText === 'string' ? { ocr } : {}),
	};
}

const IMAGE_READ_PROMPT = [
	'Bacalah gambar jawaban mahasiswa yang terlampir.',
	'Transkripsikan setiap teks yang benar-benar terbaca.',
	'Jika gambar bukan tulisan (diagram, foto, logo, tangkapan layar, atau ilustrasi), jelaskan isi visual yang benar-benar terlihat dalam beberapa kalimat.',
	'Bagian kabur atau tidak terbaca tulis persis sebagai [tidak terbaca]. Jangan menebak huruf, kata, atau isi yang tidak terlihat.',
	'Jika gambar sama sekali tidak dapat dilihat, balas hanya: [tidak terbaca]',
	'Balas HANYA hasil bacaan, tanpa komentar.',
].join(' ');

const imageUnreadable = (name: string) =>
	`Foto “${clip(name, 80)}” tidak dapat dibaca (kabur, gelap, atau gagal dimuat). Unggah ulang foto yang lebih jelas — isi yang tidak terbaca tidak ditebak.`;

/** Pull readable text / visual description from stored files. Does not guess. */
export async function extractStoredFiles(input: {
	collection: 'assignment_submissions' | 'public_submissions';
	recordId: string;
	files: string[];
	/** Task kind the check belongs to — adapts audio/video notes (Phase 6). */
	kind?: string;
}): Promise<ExtractedContent> {
	const unreadable: string[] = [];
	const parts: string[] = [];
	let pages = 0;
	const kind = input.kind || '';
	const files = input.files || [];
	const images = files.filter((f) => IMAGE_EXT.test(f));
	const docs = files.filter((f) => !IMAGE_EXT.test(f));

	for (const doc of docs) {
		if (!PDF_EXT.test(doc)) {
			if (AUDIO_VIDEO_EXT.test(doc)) {
				unreadable.push(
					kind === 'speaking' || kind === 'listening'
						? `Rekaman “${clip(doc, 80)}” tidak dapat didengar oleh pemeriksa formatif — aspek isi hanya dapat diperiksa dari naskah/transkrip. Tulis naskah pada kolom catatan atau lampirkan transkrip (PDF/foto) agar isi dapat diperiksa.`
						: `Rekaman “${clip(doc, 80)}” (audio/video) tidak dapat diperiksa — pemeriksa hanya dapat membaca teks, foto, dan PDF.`,
				);
			} else {
					unreadable.push(
						`Berkas “${clip(doc, 80)}” bukan foto (JPEG/PNG/WebP) atau PDF, jadi isinya tidak dapat diperiksa. Unggah foto atau PDF yang dapat dibaca.`,
					);
			}
			continue;
		}
		try {
			const response = await fetch(
				`${pocketbaseUrl()}/api/files/${input.collection}/${input.recordId}/${encodeURIComponent(doc)}`,
			);
			if (!response.ok) {
				throw new Error(`${response.status} ${response.statusText}`);
			}
			const buffer = Buffer.from(await response.arrayBuffer());
			if (buffer.byteLength > MAX_PDF_BYTES) {
				unreadable.push(`PDF “${clip(doc, 80)}” terlalu besar untuk diekstrak (maks 25 MB).`);
				continue;
			}
			const { PDFParse } = await import('pdf-parse');
			const parser = new PDFParse({ data: new Uint8Array(buffer) });
			try {
				const result = (await parser.getText()) as { text?: string; total?: number };
				const text = result?.text || '';
				pages += result?.total || 0;
				if (text.trim()) {
					parts.push(`[DOKUMEN: ${clip(doc, 80)}]\n${clip(text, 12000)}`);
				} else {
					unreadable.push(
						`PDF “${clip(doc, 80)}” tidak memuat teks yang bisa dibaca (mungkin hasil pindaian). Isi tidak ditebak.`,
					);
				}
			} finally {
				await parser.destroy().catch(() => {});
			}
		} catch (error) {
			logger.error('feedback pdf extraction failed', error);
			unreadable.push(`Dokumen “${clip(doc, 80)}” gagal diekstrak saat ini. Coba unggah ulang.`);
		}
	}

	if (images.length > 0) {
		const batch = images.slice(0, MAX_OCR_IMAGES);
		const urls = batch.map((f) => storedFileUrl(input.collection, input.recordId, f));
		try {
			const transcript = await collectModel(IMAGE_READ_PROMPT, urls);
			const readable =
				transcript.trim() &&
				!/^\[tidak terbaca\]$/i.test(transcript.trim()) &&
				!/tidak ada gambar/i.test(transcript);
			if (readable) {
				parts.push(
					`[LAMPIRAN GAMBAR: ${batch.map((name) => clip(name, 80)).join(', ')}]\n${clip(transcript, 8000)}`,
				);
			} else {
				unreadable.push(imageUnreadable(batch[0] || 'lampiran'));
			}
		} catch (error) {
			logger.error('feedback image ocr failed', error);
			unreadable.push(imageUnreadable(batch[0] || 'lampiran'));
		}
		if (images.length > MAX_OCR_IMAGES) {
			unreadable.push(
				`${images.length - MAX_OCR_IMAGES} foto tambahan tidak ikut dianalisis (maks ${MAX_OCR_IMAGES} foto).`,
			);
		}
	}

	const text = parts.join('\n\n');
	return {
		ok: text.trim().length > 0,
		text,
		pages,
		images: images.length,
		unreadable,
	};
}

/** Extract readable content from one enrolled submission: text, PDFs, photo OCR. */
export async function extractSubmissionContent(
	submission: AssignmentSubmission,
	kind?: string,
): Promise<ExtractedContent> {
	const files = await extractStoredFiles({
		collection: 'assignment_submissions',
		recordId: submission.id,
		files: submission.files || [],
		kind,
	});
	if (!submission.content?.trim()) return files;
	const text = [`[TEKS LANGSUNG]\n${clip(submission.content, 12000)}`, files.text]
		.filter((part) => part.trim())
		.join('\n\n');
	return { ...files, ok: text.trim().length > 0, text };
}

// ── Stage 2: progressive formative hints ─────────────────────

export type HintCriterion = { label: string; weight: number };

export type ProgressiveHint = { area: string; hint: string; evidence: string };

/** The lecturer-approved rubric snapshot for an assignment (never invented). */
export function criteriaForAssignment(assignment: Assignment): HintCriterion[] {
	const kind = taskKindForShape(assignment.shape) as TaskKind | null;
	if (kind === 'writing') {
		return parseWritingConfig(assignment.taskConfig).criteria.map((c) => ({
			label: c.label,
			weight: c.weight,
		}));
	}
	if (kind === 'speaking') {
		return parseSpeakingConfig(assignment.taskConfig).criteria.map((c) => ({
			label: c.label,
			weight: c.weight,
		}));
	}
	return [];
}

// ── Task-kind formative guidance (Phase 6) ──────────────────

/**
 * Per-task-kind formative boundaries appended to the checking/hint system
 * prompts. Each entry adapts the SAME progressive levels to one task type
 * without ever loosening the formative-only rules (no answers, no verdicts,
 * no rewrites, no translations, no grades).
 */
export const TASK_KIND_GUIDANCE: Record<TaskKind, string> = {
	quiz: [
		'Tugas ini KUIS: pandu penalaran konsep per soal — bantu mahasiswa menalar mengapa suatu pilihan layak dipertimbangkan atau tidak.',
		'Tetap DILARANG menyatakan pilihan mana yang benar/salah, mengarahkan ke satu jawaban, atau menyebut/mengarang kunci jawaban.',
	].join(' '),
	reading: [
		'Tugas ini MEMBACA: nilai apakah jawaban mahasiswa menjawab teks bacaan/prompt yang diberikan — rujuk bagian teks bacaan sebagai bukti kesesuaiannya.',
		'Tanpa pernah memberikan jawaban, menyatakan benar/salah, atau mengarang isi teks bacaan yang tidak tersedia.',
	].join(' '),
	listening: [
		'Tugas ini MENYIMAK: gunakan HANYA teks pertanyaan, jawaban tertulis mahasiswa, dan konteks sumber yang benar-benar tersedia.',
		'Anda TIDAK dapat mendengarkan audio dan transkrip materi tidak tersedia — jika pemeriksaan memerlukan isi audio, nyatakan dengan jelas di feedback bahwa bukti tidak cukup dan sarankan mahasiswa menyimak ulang bagian terkait. Jangan menebak isi audio.',
	].join(' '),
	writing: [
		'Tugas ini MENULIS: fokus pada organisasi, kejelasan, tata bahasa, kosakata, TANDA BACA (titik, koma, tanda tanya/seru, titik koma, kapitalisasi awal kalimat), dan kelengkapan poin yang diminta — hanya ketika sinyalnya benar-benar ada pada teks mahasiswa dan ketentuan tugas.',
		'Setiap saran HARUS spesifik dan ringkas: sebutkan persis kata, bentuk, atau tanda baca yang bermasalah dan alasannya (mis. "Baris 4: zu die seharusnya zur — kontraksi preposisi+artikel" atau "Baris 6: kalimat tidak diakhiri titik"). DILARANG menulis saran umum seperti "perbaiki kalimat", "arah bisa lebih runtut", atau "struktur bisa diperbaiki" tanpa menyebut letak dan jenis masalah yang persis.',
		'Periksa tanda baca secara aktif: tunjukkan letak koma yang hilang/salah, titik akhir kalimat yang tidak ada, kapitalisasi awal kalimat yang salah, atau tanda baca lain yang jelas keliru — sebutkan secara spesifik per baris.',
		'Rujuk kalimat/paragraf teks mahasiswa sebagai bukti; jangan mengarang kriteria di luar instruksi/rubrik yang diberikan.',
		'Jika jawaban bernomor baris, setiap poin hanya menyebut satu baris atau rentang pendek (mis. Baris 4 atau Baris 6-7), dalam huruf kalimat, bukan semua baris sekaligus dan bukan huruf kapital.',
	].join(' '),
	speaking: [
		'Tugas ini BERBICARA: Anda TIDAK dapat mendengarkan rekaman.',
		'Periksa HANYA aspek yang teramati dari naskah/catatan/transkrip yang benar-benar tersedia: kejelasan struktur, kosakata, dan kelengkapan terhadap prompt.',
		'DILARANG membuat klaim tentang pelafalan, intonasi, kelancaran, atau kualitas audio yang tidak didukung rekaman yang bisa Anda dengar. Jika tidak ada naskah/transkrip, nyatakan bukti tidak cukup.',
	].join(' '),
};

/**
 * Grounded source-material context for one assignment, per task kind — built
 * ONLY from the assignment's own stored configuration. Missing source
 * material is reported explicitly instead of invented.
 */
export function taskSourceContext(assignment: Assignment): string {
	const kind = taskKindForShape(assignment.shape) as TaskKind | null;
	if (!kind) return '';
	const lines: string[] = [];
	if (kind === 'listening') {
		const media = parseListeningConfig(assignment.taskConfig).media;
		if (media.kind === 'resource' && media.title.trim()) {
			lines.push(`Materi menyimak: sumber daya mata kuliah “${clip(media.title, 120)}”.`);
		} else if (media.kind === 'link' && media.url.trim()) {
			lines.push(
				`Materi menyimak: tautan eksternal “${clip(media.title || media.url, 120)}”.`,
			);
		} else {
			lines.push('Materi menyimak belum diatur pada tugas ini.');
		}
		lines.push(
			'Transkrip materi tidak tersedia dan Anda tidak dapat mendengarkan audio.',
		);
	}
	if (kind === 'reading') {
		const passage = parseReadingConfig(assignment.taskConfig).passage;
		lines.push(
			passage.trim()
				? 'Teks bacaan tersedia dan dilampirkan pada jawaban — nilai kesesuaian jawaban terhadap teks bacaan.'
				: 'Teks bacaan belum tersedia pada tugas ini — jika pemeriksaan memerlukan teks bacaan, nyatakan bukti tidak cukup.',
		);
	}
	if (kind === 'writing') {
		const config = parseWritingConfig(assignment.taskConfig);
		if (config.formatGuidance.trim()) {
			lines.push(`Panduan format dosen: ${clip(config.formatGuidance, 600)}`);
		}
		const bounds: string[] = [];
		if (config.minWords > 0) bounds.push(`minimal ${config.minWords} kata`);
		if (config.maxWords > 0) bounds.push(`maksimal ${config.maxWords} kata`);
		if (bounds.length) lines.push(`Panjang yang diminta: ${bounds.join(', ')}.`);
	}
	if (kind === 'speaking') {
		const config = parseSpeakingConfig(assignment.taskConfig);
		if (config.durationMin > 0) {
			lines.push(`Durasi yang disarankan: ${config.durationMin} menit.`);
		}
		lines.push(
			'Rekaman tidak dapat didengarkan oleh pemeriksa — aspek isi hanya dari naskah/catatan/transkrip yang benar-benar tersedia.',
		);
	}
	return lines.join('\n');
}

const HINT_SYSTEM_PROMPT = [
	'Anda panduan belajar formatif dalam Bahasa Indonesia untuk mahasiswa.',
	'Anda bekerja HANYA dari isi kiriman mahasiswa, instruksi tugas, dan rubrik yang disetujui dosen yang benar-benar diberikan.',
	'DILARANG keras: memberikan jawaban atau bagian jawaban, menuliskan perbaikan, menulis ulang atau menerjemahkan kiriman mahasiswa, memberi angka nilai, atau mengarang kriteria/rubrik/fakta yang tidak ada.',
	'Panduan bersifat bertahap dan mengarahkan saja. Jika data tidak cukup, kosongkan field dan jelaskan di hint.',
	'Balas HANYA JSON valid tanpa markdown: {"area":"","hint":"","evidence":""}',
	'area = nama area yang perlu diperbaiki (maks 200 karakter). hint = panduan formatif (maks 3000 karakter). evidence = rujukan bukti pada kiriman: halaman/paragraf/kalimat/foto (maks 1000 karakter), kosongkan bila tidak bisa dirujuk.',
].join(' ');

const LEVEL_INSTRUCTIONS: Record<number, string> = {
	1: [
		'TINGKAT 1 — identifikasi area: pilih SATU area yang paling perlu diperbaiki menurut rubrik/instruksi yang diberikan.',
		'Sebut bukti pada kiriman (halaman, paragraf, kalimat, atau foto ke berapa) tanpa mengutip ulang seluruhnya.',
		'Akhiri hint dengan SATU pertanyaan refleksi yang membantu mahasiswa menemukan sendiri apa yang perlu diperbaiki.',
		'Jangan memberi koreksi, jawaban, atau contoh perbaikan apa pun.',
	].join(' '),
	2: [
		'TINGKAT 2 — petunjuk konsep: jelaskan konsep atau prinsip umum terkait area tersebut (mis. aturan, struktur, langkah berpikir).',
		'Jangan menuliskan perbaikan langsung pada teks mahasiswa dan jangan memberi jawaban.',
	].join(' '),
	3: [
		'TINGKAT 3 — petunjuk terarah: tunjuk lokasi spesifik pada kiriman dan jelaskan APA yang perlu diperiksa atau diubah secara umum.',
		'Tetap DILARANG menuliskan jawaban, contoh perbaikan yang tinggal disalin, atau menerjemahkan/menulis ulang bagian kiriman.',
	].join(' '),
};

/** Parse the model reply: first {...} to last }, tolerant of markdown fences. */
export function parseModelJson(raw: string): Record<string, unknown> | null {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try {
		const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

export async function buildProgressiveHint(input: {
	level: number;
	taskLabel: string;
	workMode: string;
	instructions: string;
	requirements: string;
	language: string;
	criteria: HintCriterion[];
	extracted: ExtractedContent;
	focus: string;
	previousHints: { level: number; area: string; hint: string }[];
	/** Task kind the hint adapts to (Phase 6). */
	kind?: TaskKind | null;
	/** Grounded source-material context for the task kind (Phase 6). */
	sourceContext?: string;
}): Promise<ProgressiveHint | null> {
	const criteriaLines = input.criteria
		.map((c) => `- ${c.label}${c.weight ? ` (bobot relatif ${c.weight})` : ''}`)
		.join('\n');

	const prompt = [
		`Buat panduan TINGKAT ${input.level} untuk tugas ${input.taskLabel} (format kerja: ${input.workMode}).`,
		LEVEL_INSTRUCTIONS[input.level] || LEVEL_INSTRUCTIONS[3],
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
			: 'Rubrik dosen belum tersedia — jangan mengarang kriteria; gunakan instruksi tugas saja dan sebut itu di hint.',
		input.previousHints.length
			? `Panduan sebelumnya yang sudah diberikan (jangan ulangi, lanjutkan progresnya):\n${input.previousHints
					.map((p) => `Tingkat ${p.level} — ${p.area}: ${clip(p.hint, 400)}`)
					.join('\n')}`
			: '',
		input.focus ? `Fokus yang diminta mahasiswa: ${clip(input.focus, 500)}` : '',
		'Isi kiriman mahasiswa (hasil ekstraksi; bagian [tidak terbaca] memang tidak terbaca — jangan ditebak):',
		`"""\n${clip(input.extracted.text, 12000)}\n"""`,
	].join('\n\n');

	try {
		const system = input.kind
			? [HINT_SYSTEM_PROMPT, TASK_KIND_GUIDANCE[input.kind]].join(' ')
			: HINT_SYSTEM_PROMPT;
		const raw = await collectModel(prompt, [], system);
		const parsed = parseModelJson(raw);
		if (!parsed) return null;
		const hint = clip(typeof parsed.hint === 'string' ? parsed.hint : '', 3000);
		if (!hint) return null;
		return {
			area: clip(typeof parsed.area === 'string' ? parsed.area : '', 200),
			hint,
			evidence: clip(typeof parsed.evidence === 'string' ? parsed.evidence : '', 1000),
		};
	} catch (error) {
		logger.error('progressive hint model failed', error);
		return null;
	}
}
