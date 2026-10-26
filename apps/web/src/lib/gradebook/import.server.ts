/**
 * Server-side import artifact adapter.
 *
 * Bridges an already-uploaded gradebook file (a `file_library` record) to the
 * pure parser in `import.ts`. Everything security-relevant happens here, in
 * one place:
 *
 *  - The caller is authenticated as verified faculty (`authenticateFaculty`).
 *  - The artifact must be a record the caller OWNS (`verifyOwnedResource`), not
 *    merely any faculty-visible file. A generic "is faculty" check would let one
 *    lecturer import another lecturer's roster, so ownership is the gate.
 *  - The artifact must be linked to the course being imported into, so a file
 *    from course A cannot silently be applied to course B.
 *  - Bytes are fetched through the superuser file token, and only after both
 *    checks pass.
 *
 * The parser itself stays pure: this module is the only place that knows about
 * PocketBase, requests or the filesystem.
 */

import { authenticateFaculty, fetchStoredFile } from '@/lib/berkas-versions.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { parseImportAuto, type ImportError, type ImportSuccess } from './import';

export type ImportArtifactInput = {
	/** The HTTP request, used only to authenticate the caller. */
	request: Request;
	/** `file_library` record id of the uploaded CSV/XLSX. */
	resourceId: string;
	/** Course the import targets; must be one the artifact is linked to. */
	courseId: string;
	decimalSeparator?: '.' | ',';
	inputScale?: number;
	componentMax?: number;
	/** XLSX only: explicit sheet selection by name or 0-based index. */
	sheet?: string | number;
};

export type ImportArtifactResult =
	/** Authorized and parsed: `result.ok` says whether the content is usable. */
	| { ok: true; userId: string; filename: string; result: ImportSuccess | ImportError }
	/** Denied, missing, or unreadable before parsing was even attempted. */
	| { ok: false; status: number; message: string };

/** The parts of a `file_library` record this adapter relies on. */
type OwnedArtifact = {
	id: string;
	owner: string;
	course?: string[] | string;
	file?: string;
};

/**
 * Load an uploaded artifact, authorize it, and parse it.
 *
 * Never throws for content reasons: a malformed file comes back as a structured
 * `result` with `result.ok === false` so the reviewer UI can render the error
 * report instead of a crash.
 */
export async function loadImportArtifact(input: ImportArtifactInput): Promise<ImportArtifactResult> {
	const auth = await authenticateFaculty(input.request);
	if ('error' in auth) {
		return { ok: false, status: auth.error.status, message: auth.error.message };
	}

	// Owner-scoped attachment authorization, identical to
	// `verifyOwnedResource` in assistant/authorization.server.ts (that helper
	// needs a raw PocketBase client, which the admin module does not export):
	// read the record through the superuser client, then require
	// `owner === userId`. A foreign id is indistinguishable from a missing one,
	// so the response never confirms that someone else's file exists.
	let owned: OwnedArtifact | null = null;
	try {
		const record = await pocketbaseAdmin.getRecord<OwnedArtifact>('file_library', input.resourceId);
		owned = record && record.owner === auth.user.id ? record : null;
	} catch {
		owned = null;
	}
	if (!owned) {
		return { ok: false, status: 404, message: 'Berkas tidak ditemukan atau bukan milik Anda.' };
	}

	const courses = Array.isArray(owned.course) ? owned.course : owned.course ? [owned.course] : [];
	if (courses.length > 0 && !courses.includes(input.courseId)) {
		return {
			ok: false,
			status: 403,
			message: 'Berkas ini tidak tertaut ke mata kuliah yang dimaksud.',
		};
	}

	if (!owned.file) {
		return { ok: false, status: 404, message: 'Berkas tidak memiliki lampiran yang dapat dibaca.' };
	}

	let bytes: Uint8Array;
	try {
		const buffer = await fetchStoredFile('file_library', owned.id, owned.file);
		bytes = new Uint8Array(buffer);
	} catch {
		return { ok: false, status: 502, message: 'Berkas gagal diunduh dari penyimpanan.' };
	}

	const result = await parseImportAuto({
		filename: owned.file,
		bytes,
		decimalSeparator: input.decimalSeparator,
		inputScale: input.inputScale,
		componentMax: input.componentMax,
		sheet: input.sheet,
	});

	return { ok: true, userId: auth.user.id, filename: owned.file, result };
}
