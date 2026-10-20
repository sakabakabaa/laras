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

const OCR_PROMPT =
	'Ekstrak seluruh teks yang terlihat pada halaman ini, apa adanya, dalam urutan baca. ' +
	'Pertahankan bahasa aslinya dan pertahankan baris baru antar paragraf. ' +
	'Jangan menambahkan komentar, penjelasan, atau terjemahan. ' +
	'Jika halaman tidak memuat teks yang dapat dibaca, balas tepat: TIDAK ADA TEKS';

const OCR_SYSTEM =
	'Anda mesin OCR untuk dokumen akademik. Keluarkan hanya teks yang benar-benar terlihat. Jangan mengarang isi.';

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
	options: { maxPages?: number; dpi?: number } = {},
): Promise<PdfOcrResult> => {
	const maxPages = options.maxPages ?? 10;
	const dpi = options.dpi ?? 150;
	const dir = await mkdtemp(path.join(tmpdir(), 'laras-pdf-'));

	try {
		const pdfPath = path.join(dir, 'input.pdf');
		await writeFile(pdfPath, buffer);

		const totalPages = await countPages(pdfPath);
		const limit = Math.max(1, Math.min(maxPages, totalPages || maxPages));

		await run(
			'pdftoppm',
			['-png', '-r', String(dpi), '-f', '1', '-l', String(limit), pdfPath, path.join(dir, 'page')],
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
				prompt: OCR_PROMPT,
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
