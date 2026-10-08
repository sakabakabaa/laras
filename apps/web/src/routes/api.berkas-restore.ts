import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	authenticateFaculty,
	fetchStoredFile,
	libraryStatusFor,
	loadExtraction,
	snapshotActiveVersion,
} from '@/lib/berkas-versions.server';
import type { FileExtractionRecord, FileLibraryRecord, FileVersionRecord } from '@/lib/learning';

type Body = { fileId?: string; versionId?: string };

/**
 * POST /api/berkas-restore
 *
 * Phase 3: restores a prior version as the new active version — an explicit,
 * permission-protected lecturer action. Nothing is deleted or rolled back
 * automatically: the current active version is first snapshotted into
 * `file_versions` (idempotently), then the prior version's original binary
 * becomes the active file with a bumped version number and `restoredFrom`
 * set for traceability. The prior version's extraction metadata is restored
 * alongside it, tied to the new version, so unchanged content is never
 * re-parsed. Academic links (mata kuliah, CPMK, Sub-CPMK, sesi) are left
 * untouched. Lecturer-only: the caller must own the file.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const fileId = body.fileId?.trim() || '';
	const versionId = body.versionId?.trim() || '';
	if (!/^[A-Za-z0-9]{5,40}$/.test(fileId)) return apiError(422, 'fileId tidak valid.');
	if (!/^[A-Za-z0-9]{5,40}$/.test(versionId)) return apiError(422, 'versionId tidak valid.');

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

	let versionRecord: FileVersionRecord;
	try {
		versionRecord = await pocketbaseAdmin.getRecord<FileVersionRecord>(
			'file_versions',
			versionId,
		);
	} catch {
		return apiError(404, 'Versi tidak ditemukan.');
	}
	if (versionRecord.file !== fileId || versionRecord.owner !== auth.user.id) {
		return apiError(403, 'Versi ini tidak termasuk dalam berkas Anda.');
	}
	if (!versionRecord.fileData) return apiError(422, 'Versi tidak memiliki berkas asli.');

	try {
		// 1. Preserve the current active version first — never lose it.
		await snapshotActiveVersion(record, auth.user.id);

		// 2. Fetch the prior version's original binary.
		const bytes = await fetchStoredFile('file_versions', versionId, versionRecord.fileData);

		// 3. Make it the active file as a NEW version (nothing is rolled back).
		const newVersion = (record.version || 1) + 1;
		const fd = new FormData();
		fd.append(
			'file',
			new Blob([new Uint8Array(bytes)]),
			versionRecord.filename || 'berkas',
		);
		fd.append('size', String(versionRecord.size ?? bytes.byteLength));
		fd.append('version', String(newVersion));
		fd.append('restoredFrom', String(versionRecord.version));
		fd.append('status', libraryStatusFor(versionRecord.status));
		const updated = await pocketbaseAdmin.updateRecord<FileLibraryRecord>(
			'file_library',
			fileId,
			fd,
		);

		// 4. Restore the prior version's extraction, tied to the new version.
		//    The sourceKey matches the newly stored file, so an unchanged
		//    restore is never re-parsed by a later (non-forced) process call.
		const extractionData = {
			status: versionRecord.status,
			extractedText: versionRecord.extractedText ?? '',
			language: versionRecord.language ?? '',
			pages: versionRecord.pages ?? 0,
			chars: versionRecord.chars ?? 0,
			extractedAt: versionRecord.extractedAt || new Date().toISOString(),
			parserVersion: versionRecord.parserVersion ?? '',
			failureReason: versionRecord.failureReason ?? '',
			sourceKey: `${updated.file}:${updated.size ?? 0}`,
			version: newVersion,
		};
		const existing = await loadExtraction(fileId);
		if (existing) {
			await pocketbaseAdmin.updateRecord<FileExtractionRecord>(
				'file_extractions',
				existing.id,
				extractionData,
			);
		} else {
			await pocketbaseAdmin.createRecord<FileExtractionRecord>('file_extractions', {
				...extractionData,
				file: fileId,
				owner: auth.user.id,
			});
		}

		return json({
			ok: true,
			version: newVersion,
			restoredFrom: versionRecord.version,
			status: extractionData.status,
		});
	} catch (error) {
		logger.error(
			`berkas-restore failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return apiError(500, 'Gagal memulihkan versi. Tidak ada data yang berubah — coba lagi.');
	}
});
