/**
 * OCR for scanned PDFs.
 *
 * A PDF whose text layer is empty is usually a scan: `pdf-parse` returns a few
 * stray characters and the file is useless for retrieval. This renders the
 * first pages to PNG with poppler and asks the platform vision model to read
 * them, returning text that can be stored exactly like a native PDF.
 *
 * Page images are sent inline as `data:` URLs — the provider accepts them, so
 * nothing has to be staged in PocketBase or exposed publicly.
 *
 * Bounded on purpose: OCR is the most expensive path we have, so only the first
 * `maxPages` pages are read (default 10) and each call has its own timeout.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { collectHostingerText } from '@/lib/hostinger-model.server';

const run = promisify(execFile);

export const OCR_PROMPT =
	'Ekstrak seluruh teks yang terlihat pada halaman ini, apa adanya, dalam urutan baca. ' +
	'Pertahankan bahasa aslinya dan pertahankan baris baru antar paragraf. ' +
	'Jangan menambahkan komentar, penjelasan, atau terjemahan. ' +
	'Jika halaman tidak memuat teks yang dapat dibaca, balas tepat: TIDAK ADA TEKS';

const OCR_SYSTEM =
	'Anda mesin OCR untuk dokumen akademik. Keluarkan hanya teks yang benar-benar terlihat. Jangan mengarang isi.';

/**
 * Participant work is often a printed worksheet with the answers written or
 * typed into it, scanned by a phone app. Reading "all visible text" returns the
 * worksheet's own title, instructions, field labels and the scanner watermark as
 * if the participant had written them, so the lecturer reviews (and the AI
 * quotes) text nobody answered. This prompt reads only the participant's part.
 */
export const ANSWER_OCR_PROMPT =
	'Halaman ini adalah pekerjaan mahasiswa. Tulis HANYA jawaban yang ditulis atau diketik mahasiswa sendiri, apa adanya, dalam urutan baca. ' +
	'JANGAN menyalin teks bawaan lembar kerja atau soal: judul, nomor bab, instruksi, perintah soal, label kolom atau isian (mis. "Name:", "Datum:"), ' +
	'dan teks yang jelas dicetak. Jangan menyalin watermark atau cap aplikasi pemindai (mis. "Dipindai dengan CamScanner"), nomor halaman, atau logo. ' +
	'Jika jawaban mengisi sebuah kolom, tulis isinya saja tanpa label kolom. ' +
	'Pertahankan bahasa aslinya, ejaan mahasiswa (jangan dibetulkan), dan baris baru antar paragraf. ' +
	'Bagian yang sama sekali tidak terbaca tulis persis [tidak terbaca]; jangan menebak. ' +
	'Jika sebuah kata dapat Anda baca tetapi Anda ragu (huruf, huruf besar/kecil, umlaut, ß, atau tanda baca), bungkus kata itu dengan ⟦ dan ⟧ (U+27E6 dan U+27E7), dengan bacaan terbaik di dalamnya, mis. ⟦Abends⟧. Jangan mengoreksi ejaan; hanya tandai keraguan Anda. ' +
	'Jangan menambahkan komentar atau terjemahan. ' +
	'Jika halaman tidak memuat jawaban mahasiswa, balas tepat: TIDAK ADA TEKS';

export type PdfOcrResult = {
	/** True when at least one page produced readable text. */
	ok: boolean;
	text: string;
	/** Pages actually rendered and sent to the model. */
	pages: number;
	/** Pages present in the document, when pdfinfo reported it. */
	totalPages: number;
	reason?: string;
};

/** Reads a PDF's page count via pdfinfo; 0 when it cannot be determined. */
const countPages = async (file: string): Promise<number> => {
	try {
		const { stdout } = await run('pdfinfo', [file], { timeout: 20_000 });
		const match = /Pages:\s+(\d+)/i.exec(stdout);
		return match ? Number(match[1]) : 0;
	} catch {
		return 0;
	}
};

export const ocrPdf = async (
	buffer: Buffer,
	options: {
		maxPages?: number;
		scaleTo?: number;
		/** `material` (default) reads the whole page; `answer` reads only the participant's own writing. */
		purpose?: 'material' | 'answer';
	} = {},
): Promise<PdfOcrResult> => {
	const prompt = options.purpose === 'answer' ? ANSWER_OCR_PROMPT : OCR_PROMPT;
	const maxPages = options.maxPages ?? 10;
	// A full page at 150 dpi can be 4000x6500 px (~9 MB PNG, ~12 MB base64) and
	// the vision provider rejects images that large, so OCR silently failed on
	// exactly the scans that needed it most. Bound the long edge instead of the
	// resolution: a page then stays ~1 MB and readable.
	const scaleTo = options.scaleTo ?? 1800;
	const dir = await mkdtemp(path.join(tmpdir(), 'laras-pdf-'));

	try {
		const pdfPath = path.join(dir, 'input.pdf');
		await writeFile(pdfPath, buffer);

		const totalPages = await countPages(pdfPath);
		const limit = Math.max(1, Math.min(maxPages, totalPages || maxPages));

		await run(
			'pdftoppm',
			['-png', '-scale-to', String(scaleTo), '-f', '1', '-l', String(limit), pdfPath, path.join(dir, 'page')],
			{ timeout: 120_000, maxBuffer: 64 * 1024 * 1024 },
		);

		const pages = (await readdir(dir))
			.filter((name) => name.startsWith('page') && name.endsWith('.png'))
			.sort((a, b) => {
				const na = Number(a.replace(/\D+/g, ''));
				const nb = Number(b.replace(/\D+/g, ''));
				return na - nb;
			});

		if (pages.length === 0) {
			return { ok: false, text: '', pages: 0, totalPages, reason: 'Halaman PDF tidak dapat dirender.' };
		}

		const chunks: string[] = [];
		for (const [index, name] of pages.entries()) {
			const png = await readFile(path.join(dir, name));
			const result = await collectHostingerText({
				prompt,
				systemPrompt: OCR_SYSTEM,
				images: [`data:image/png;base64,${png.toString('base64')}`],
				timeoutMs: 120_000,
			});
			const text = (result.content || '').trim();
			if (text && !/^tidak ada teks\.?$/i.test(text)) {
				chunks.push(`[Halaman ${index + 1}]\n${text}`);
			}
		}

		return {
			ok: chunks.length > 0,
			text: chunks.join('\n\n'),
			pages: pages.length,
			totalPages,
			...(chunks.length === 0 ? { reason: 'Tidak ada teks yang terbaca pada halaman yang dipindai.' } : {}),
		};
	} catch (error) {
		return {
			ok: false,
			text: '',
			pages: 0,
			totalPages: 0,
			reason: error instanceof Error ? error.message : 'OCR PDF gagal.',
		};
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
};

/**
 * Renders the first pages of a PDF as JPEG data URLs (long edge `longEdge` px)
 * so an evaluator can LOOK at a scanned worksheet instead of trusting OCR text.
 * Returns [] when rendering fails; never throws.
 */
export const renderPdfPageImages = async (
	buffer: Buffer,
	options: { maxPages?: number; longEdge?: number; timeoutMs?: number } = {},
): Promise<string[]> => {
	const maxPages = Math.max(1, options.maxPages ?? 5);
	const longEdge = options.longEdge ?? 1400;
	const dir = await mkdtemp(path.join(tmpdir(), 'laras-pdfimg-'));
	try {
		const pdfPath = path.join(dir, 'input.pdf');
		await writeFile(pdfPath, buffer);
		const totalPages = await countPages(pdfPath);
		const limit = Math.max(1, Math.min(maxPages, totalPages || maxPages));
		await run(
			'pdftoppm',
			['-jpeg', '-jpegopt', 'quality=78', '-scale-to', String(longEdge), '-f', '1', '-l', String(limit), pdfPath, path.join(dir, 'page')],
			{ timeout: options.timeoutMs ?? 60_000, maxBuffer: 64 * 1024 * 1024 },
		);
		const names = (await readdir(dir))
			.filter((name) => name.startsWith('page') && name.endsWith('.jpg'))
			.sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')))
			.slice(0, maxPages);
		const out: string[] = [];
		for (const name of names) {
			const jpg = await readFile(path.join(dir, name));
			out.push(`data:image/jpeg;base64,${jpg.toString('base64')}`);
		}
		return out;
	} catch {
		return [];
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
};
