import { apiError, json, readFormData, withApi } from '@/lib/api.server';
import logger from '@/lib/logger.server';

/**
 * POST /api/berkas-parse
 *
 * Best-effort server-side PDF text extraction for the Manajemen berkas upload
 * flow. The uploaded file itself is NOT stored here — the client keeps the
 * File and sends it to PocketBase only when the record is saved. This route
 * only returns a text sample (plus page count) so the dialog can autofill
 * metadata (language, page count) that is reliably derivable from the file.
 *
 * Non-PDF files are parsed client-side (plain text) or not at all — this route
 * never guesses and never invents content.
 */

type ParseResponse = {
	ok: boolean;
	pages: number;
	chars: number;
	/** First ~6000 characters of extracted text — enough for language detection. */
	text: string;
	error?: string;
};

export const action = withApi(async ({ request }) => {
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('multipart/form-data')) {
		return apiError(422, 'Berkas wajib dikirim.');
	}
	const formData = await readFormData(request);
	const file = formData.get('file');

	if (!(file instanceof File)) {
		return apiError(422, 'Berkas wajib dikirim.');
	}
	if (file.type && file.type !== 'application/pdf') {
		return apiError(422, 'Hanya berkas PDF yang dapat diurai di server.');
	}
	if (file.size === 0) {
		return apiError(422, 'Berkas kosong.');
	}

	const buffer = Buffer.from(await file.arrayBuffer());

	// Dynamic import keeps the Node-only parser out of module scope. v2 exports
	// the `PDFParse` class (no default function export).
	const { PDFParse } = await import('pdf-parse');
	const parser = new PDFParse({ data: new Uint8Array(buffer) });

	try {
		let text = '';
		let pages = 0;

		try {
			const result = await parser.getText();
			text = (result && (result as { text?: string }).text) || '';
			pages = (result && (result as { total?: number }).total) || 0;
		} catch (error) {
			logger.error(
				`berkas-parse getText() failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		if (!text.trim()) {
			return json({
				ok: false,
				pages,
				chars: 0,
				text: '',
				error: 'Tidak ada teks yang bisa diekstrak dari PDF ini.',
			} satisfies ParseResponse);
		}

		return json({
			ok: true,
			pages,
			chars: text.length,
			text: text.slice(0, 6000),
		} satisfies ParseResponse);
	} finally {
		await parser.destroy().catch(() => {});
	}
});
