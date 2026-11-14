/**
 * Page images for the Tugas evaluator.
 *
 * A scanned PDF (no usable text layer) is rendered to JPEG pages so the model
 * can verify orthography against the actual handwriting instead of trusting an
 * OCR transcription. Photos are sent by URL (see ai-evaluation.server); this
 * module only supplies the PDF pages, within the shared image budget.
 *
 * Rendered pages are cached for the process lifetime (key: record id + file
 * name) because "Baca ulang" and bulk drafts re-run the same files.
 */
import logger from '@/lib/logger.server';
import { renderPdfPageImages } from '@/lib/pdf-ocr.server';

const PDF_EXT = /\.pdf$/i;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Same threshold the OCR extraction uses to decide a PDF is a scan. */
export const MIN_TEXT_LAYER_CHARS = 80;
const CACHE_LIMIT = 24;

const cache = new Map<string, string[]>();

export function pdfFilenames(files: string[] | undefined | null): string[] {
	return (files || []).filter((file) => PDF_EXT.test(file));
}

export type PageImageDeps = {
	fetchFile?: (collection: string, recordId: string, filename: string) => Promise<Buffer | null>;
	hasTextLayer?: (buffer: Buffer) => Promise<boolean>;
	render?: (buffer: Buffer, options: { maxPages: number; longEdge: number }) => Promise<string[]>;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

const defaultFetch: NonNullable<PageImageDeps['fetchFile']> = async (collection, recordId, filename) => {
	const response = await fetch(`${pocketbaseUrl()}/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}`);
	if (!response.ok) return null;
	const buffer = Buffer.from(await response.arrayBuffer());
	return buffer.byteLength > MAX_PDF_BYTES ? null : buffer;
};

const defaultHasTextLayer: NonNullable<PageImageDeps['hasTextLayer']> = async (buffer) => {
	const { PDFParse } = await import('pdf-parse');
	const parser = new PDFParse({ data: new Uint8Array(buffer) });
	try {
		const result = (await parser.getText()) as { text?: string };
		const text = (result?.text || '').replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gm, '').trim();
		return text.length >= MIN_TEXT_LAYER_CHARS;
	} finally {
		await parser.destroy().catch(() => {});
	}
};

/**
 * Page images (data URLs) of scanned PDFs, at most `budget` in total, first
 * pages first. Digital PDFs (with a text layer) contribute nothing.
 * `labels` describe each image for the research snapshot, never the bytes.
 */
export async function scannedPdfPageImages(
	input: { collection: string; recordId: string; files: string[]; budget: number; longEdge?: number },
	deps: PageImageDeps = {},
): Promise<{ images: string[]; labels: string[] }> {
	const fetchFile = deps.fetchFile ?? defaultFetch;
	const hasTextLayer = deps.hasTextLayer ?? defaultHasTextLayer;
	const render = deps.render ?? ((buffer, options) => renderPdfPageImages(buffer, options));
	const images: string[] = [];
	const labels: string[] = [];
	for (const file of pdfFilenames(input.files)) {
		const left = input.budget - images.length;
		if (left <= 0) break;
		const key = `${input.recordId}/${file}`;
		try {
			let pages = cache.get(key);
			if (!pages) {
				const buffer = await fetchFile(input.collection, input.recordId, file);
				if (!buffer) continue;
				// A digital PDF is read from its text layer; an image adds nothing but cost.
				const digital = await hasTextLayer(buffer);
				pages = digital ? [] : await render(buffer, { maxPages: 5, longEdge: input.longEdge ?? 1400 });
				// Never cache a failed render of a scan: the next run should retry it.
				if (digital || pages.length > 0) {
					if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
					cache.set(key, pages);
				}
			}
			pages.slice(0, left).forEach((page, index) => {
				images.push(page);
				labels.push(`pdf:${file}#halaman-${index + 1}`);
			});
		} catch (error) {
			logger.error('evaluation pdf page images failed', error);
		}
	}
	return { images, labels };
}

/** Test helper. */
export function clearPageImageCache() {
	cache.clear();
}
