/**
 * Phase 3 server helpers — versioning & traceability for the Manajemen
 * berkas library. Shared by the /api/berkas-snapshot and /api/berkas-restore
 * routes. Everything here runs server-side only and writes through the
 * superuser client after verifying the caller owns the file.
 */
import PocketBase from 'pocketbase';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type { FileExtractionRecord, FileLibraryRecord, FileVersionRecord } from '@/lib/learning';

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

export type FacultyUser = { id: string };

export type AuthFailure = { error: { status: number; message: string } };

/**
 * Verifies the request's Bearer token belongs to a verified faculty member.
 * Returns the user id on success, or a ready-to-return API error payload.
 */
export async function authenticateFaculty(
	request: Request,
): Promise<{ user: FacultyUser } | AuthFailure> {
	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return { error: { status: 401, message: 'Masuk sebagai dosen untuk tindakan ini.' } };

	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return { error: { status: 401, message: 'Sesi tidak valid. Masuk kembali.' } };
	}
	const user = pb.authStore.record as
		| { id?: string; role?: string; verified?: boolean }
		| null;
	if (!user?.id || user.role !== 'faculty') {
		return { error: { status: 403, message: 'Tindakan ini hanya untuk dosen.' } };
	}
	if (!user.verified) {
		return { error: { status: 403, message: 'Verifikasi email Anda terlebih dahulu.' } };
	}
	return { user: { id: user.id } };
}

/** Fetch the stored bytes of a file field value via a short-lived file token. */
export async function fetchStoredFile(
	collection: string,
	recordId: string,
	filename: string,
): Promise<Buffer> {
	const fileToken = await pocketbaseAdmin.getFileToken();
	const url = `${pocketbaseUrl()}/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}?token=${fileToken}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`fetch stored file failed: ${response.status} ${response.statusText}`);
	}
	return Buffer.from(await response.arrayBuffer());
}

/** The stored extraction for a library file, if one exists. */
export async function loadExtraction(fileId: string): Promise<FileExtractionRecord | null> {
	const found = await pocketbaseAdmin.listRecords<FileExtractionRecord>('file_extractions', {
		filter: `file = "${fileId}"`,
		perPage: 1,
	});
	return found.items[0] ?? null;
}

/** Coarse file_library status that matches a snapshot's extraction status. */
export function libraryStatusFor(status: string): string {
	if (status === 'ready' || status === 'review') return 'ready';
	if (status === 'failed') return 'failed';
	return 'processing';
}

/**
 * Snapshot the ACTIVE version of a library file into `file_versions` as an
 * immutable prior version — original binary plus its extraction metadata.
 * Idempotent: if a snapshot already exists for this version number with the
 * same source identity, it is reused instead of duplicated, so a retried
 * replace after a partial failure never creates a second copy.
 */
export async function snapshotActiveVersion(
	record: FileLibraryRecord,
	ownerId: string,
): Promise<{ version: number; skipped: boolean }> {
	const version = record.version || 1;
	const sourceKey = `${record.file}:${record.size ?? 0}`;

	const existing = await pocketbaseAdmin.listRecords<FileVersionRecord>('file_versions', {
		filter: `file = "${record.id}" && version = ${version}`,
		perPage: 1,
	});
	const prior = existing.items[0] ?? null;
	if (prior) {
		if (prior.sourceKey === sourceKey) return { version, skipped: true };
		// Version numbering drifted — refuse rather than silently overwrite.
		throw new Error('version snapshot mismatch — active file changed without a version bump');
	}

	if (!record.file) throw new Error('record has no original file');
	const bytes = await fetchStoredFile('file_library', record.id, record.file);
	const extraction = await loadExtraction(record.id);

	const fd = new FormData();
	fd.append('file', record.id);
	fd.append('owner', ownerId);
	fd.append('version', String(version));
	fd.append('filename', record.file);
	fd.append('size', String(record.size ?? bytes.byteLength));
	fd.append(
		'status',
		extraction?.status ?? (record.status === 'ready' ? 'ready' : record.status === 'failed' ? 'failed' : 'pending'),
	);
	fd.append('extractedText', extraction?.extractedText ?? '');
	fd.append('language', extraction?.language ?? '');
	fd.append('pages', String(extraction?.pages ?? 0));
	fd.append('chars', String(extraction?.chars ?? 0));
	if (extraction?.extractedAt) fd.append('extractedAt', extraction.extractedAt);
	fd.append('parserVersion', extraction?.parserVersion ?? '');
	fd.append('failureReason', extraction?.failureReason ?? '');
	fd.append('sourceKey', sourceKey);
	fd.append('fileData', new Blob([new Uint8Array(bytes)]), record.file);

	await pocketbaseAdmin.createRecord('file_versions', fd);
	return { version, skipped: false };
}
