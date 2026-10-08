import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateFaculty, snapshotActiveVersion } from '@/lib/berkas-versions.server';
import type { FileLibraryRecord } from '@/lib/learning';

type Body = { fileId?: string };

/**
 * POST /api/berkas-snapshot
 *
 * Phase 3 versioning, step one of a file replacement: copies the current
 * active original (plus its extraction metadata) into `file_versions` as an
 * immutable prior version, and returns the next version number for the
 * caller to set on the replacement upload. The client only proceeds with
 * the PocketBase update after this succeeds, so a failed snapshot never
 * loses the previous version. Lecturer-only: the caller must own the file.
 * Idempotent — a retry after a partial failure reuses the existing snapshot.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const fileId = body.fileId?.trim() || '';
	if (!/^[A-Za-z0-9]{5,40}$/.test(fileId)) return apiError(422, 'fileId tidak valid.');

	const auth = await authenticateFaculty(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);

	let record: FileLibraryRecord;
	try {
		record = await pocketbaseAdmin.getRecord<FileLibraryRecord>('file_library', fileId);
	} catch {
		return apiError(404, 'Berkas tidak ditemukan.');
	}
	if (record.owner !== auth.user.id) {
		return apiError(403, 'Hanya pemilik berkas yang dapat melakukan tindakan ini.');
	}
	if (!record.file) return apiError(422, 'Rekaman tidak memiliki berkas asli.');

	try {
		const result = await snapshotActiveVersion(record, auth.user.id);
		return json({
			ok: true,
			version: result.version,
			newVersion: result.version + 1,
			skipped: result.skipped,
		});
	} catch (error) {
		logger.error(
			`berkas-snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return apiError(
			500,
			'Gagal menyimpan versi sebelumnya. Penggantian berkas dibatalkan — coba lagi.',
		);
	}
});
