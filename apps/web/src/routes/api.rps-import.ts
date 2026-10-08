import { apiError, json, readFormData, withApi } from '@/lib/api.server';
import { importRpsPdf, type ImportStages } from '@/lib/rps-pdf-import.server';

/**
 * POST /api/rps-import
 *
 * Thin wrapper over the unified `importRpsPdf` capability — the same pipeline
 * the Asisten Dosen calls when a lecturer asks it to import an RPS PDF. The
 * PDF itself is never stored here; the client keeps the File and uploads it to
 * PocketBase only when the course is saved.
 */

type ImportResponse = {
	ok: boolean;
	error?: string;
	parsed?: import('@/lib/rps-parser.server').ParsedRps;
	source: 'ai' | 'heuristic' | 'table';
	stages: ImportStages;
};

export const action = withApi(async ({ request }) => {
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('multipart/form-data')) {
		return apiError(422, 'Berkas PDF wajib diunggah.');
	}
	const formData = await readFormData(request);
	const file = formData.get('file');

	if (!(file instanceof File)) {
		return apiError(422, 'Berkas PDF wajib diunggah.');
	}
	if (file.type && file.type !== 'application/pdf') {
		return apiError(422, 'Hanya berkas PDF yang didukung.');
	}
	if (file.size === 0) {
		return apiError(422, 'Berkas PDF kosong.');
	}
	if (file.size > 10 * 1024 * 1024) {
		return apiError(413, 'Ukuran PDF melebihi 10MB.');
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const result = await importRpsPdf(buffer);
	return json(result satisfies ImportResponse);
});
