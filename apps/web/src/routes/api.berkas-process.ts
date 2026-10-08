import PocketBase from 'pocketbase';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { detectLanguage } from '@/lib/file-metadata';
import type { FileExtractionRecord, FileLibraryRecord } from '@/lib/learning';

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

/** Sensible processing cap — far below the 500 MB storage limit. */
const PARSE_MAX_BYTES = 20 * 1024 * 1024;
/** Below this many characters a PDF is treated as likely scanned → Perlu ditinjau. */
const MIN_RELIABLE_CHARS = 200;
/** Hard cap on stored extracted text — matches the collection field max. */
const MAX_STORED_CHARS = 400000;
const PARSER_PDF = 'pdf-parse-v2';
const PARSER_TEXT = 'utf8-text-v1';
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'vtt', 'srt']);
const TERMINAL_STATUSES = new Set(['ready', 'review', 'failed']);

const TOO_LARGE_REASON =
	'Ukuran berkas melebihi batas penguraian otomatis (maks. 20 MB). Berkas asli tetap tersimpan dan dapat dipratinjau atau diunduh.';
const UNSUPPORTED_REASON =
	'Format tidak didukung untuk penguraian teks otomatis (didukung: PDF dan teks polos). Berkas asli tetap tersimpan dan dapat dipratinjau atau diunduh.';

type Body = { fileId?: string; force?: boolean };

type Outcome = {
	status: 'ready' | 'review' | 'failed';
	text: string;
	language: string;
	pages: number;
	reason: string;
	parserVersion: string;
};

type Summary = {
	ok: boolean;
	reused: boolean;
	status: FileExtractionRecord['status'];
	language: string;
	pages: number;
	chars: number;
	failureReason: string;
	extractedAt: string;
	parserVersion: string;
};

const summarize = (extraction: FileExtractionRecord, reused: boolean): Summary => ({
	ok: true,
	reused,
	status: extraction.status,
	language: extraction.language || '',
	pages: extraction.pages ?? 0,
	chars: extraction.chars ?? 0,
	failureReason: extraction.failureReason || '',
	extractedAt: extraction.extractedAt || '',
	parserVersion: extraction.parserVersion || '',
});

const fail = (reason: string): Outcome => ({
	status: 'failed',
	text: '',
	language: '',
	pages: 0,
	reason,
	parserVersion: '',
});

/** Fetch the original file bytes from protected storage via a short-lived file token. */
const fetchOriginal = async (record: FileLibraryRecord): Promise<Buffer> => {
	const fileToken = await pocketbaseAdmin.getFileToken();
	const url = `${pocketbaseUrl()}/api/files/file_library/${record.id}/${encodeURIComponent(record.file)}?token=${fileToken}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`fetch original failed: ${response.status} ${response.statusText}`);
	}
	return Buffer.from(await response.arrayBuffer());
};

/** Parse the stored original once. Never throws — every failure is an Outcome. */
const extract = async (record: FileLibraryRecord): Promise<Outcome> => {
	const extension = (record.file.split('.').pop() || '').toLowerCase();

	if ((record.size ?? 0) > PARSE_MAX_BYTES) return fail(TOO_LARGE_REASON);
	if (extension !== 'pdf' && !TEXT_EXTENSIONS.has(extension)) {
		return fail(UNSUPPORTED_REASON);
	}

	let buffer: Buffer;
	try {
		buffer = await fetchOriginal(record);
	} catch (error) {
		logger.error(
			`berkas-process fetch failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return fail('Berkas asli tidak dapat dibaca dari penyimpanan. Coba proses ulang.');
	}
	if (buffer.byteLength === 0) return fail('Berkas asli kosong.');
	if (buffer.byteLength > PARSE_MAX_BYTES) return fail(TOO_LARGE_REASON);

	if (extension === 'pdf') {
		const { PDFParse } = await import('pdf-parse');
		const parser = new PDFParse({ data: new Uint8Array(buffer) });
		try {
			const result = await parser.getText();
			const text = ((result as { text?: string }).text || '').trim();
			const pages = (result as { total?: number }).total || 0;
			if (text.length < MIN_RELIABLE_CHARS) {
				return {
					status: 'review',
					text: text.slice(0, MAX_STORED_CHARS),
					language: detectLanguage(text),
					pages,
					reason:
						'Teks yang terbaca sangat sedikit — kemungkinan PDF hasil pindaian (scanned) atau berbasis gambar. Periksa hasil dan proses ulang bila perlu.',
					parserVersion: PARSER_PDF,
				};
			}
			return {
				status: 'ready',
				text: text.slice(0, MAX_STORED_CHARS),
				language: detectLanguage(text),
				pages,
				reason: '',
				parserVersion: PARSER_PDF,
			};
		} catch (error) {
			logger.error(
				`berkas-process pdf failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return fail(
				'Penguraian PDF gagal — berkas mungkin rusak atau terproteksi. Berkas asli tetap tersimpan.',
			);
		} finally {
			await parser.destroy().catch(() => {});
		}
	}

	const text = buffer.toString('utf8').replace(/\u0000/g, '').trim();
	if (!text) {
		return {
			status: 'review',
			text: '',
			language: '',
			pages: 0,
			reason: 'Berkas teks kosong atau tidak berisi karakter terbaca.',
			parserVersion: PARSER_TEXT,
		};
	}
	return {
		status: 'ready',
		text: text.slice(0, MAX_STORED_CHARS),
		language: detectLanguage(text),
		pages: 0,
		reason: '',
		parserVersion: PARSER_TEXT,
	};
};

/**
 * POST /api/berkas-process
 *
 * Phase 2 document processing for the Manajemen berkas library. Parses a
 * supported document once and stores the extracted text separately (in
 * `file_extractions`) for later reuse — an unchanged file is never re-parsed.
 * The original file is never modified and stays available for preview and
 * download; a parsing failure only marks the processing result with a clear
 * Indonesian reason. Lecturer-only: the caller must own the file.
 */
export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const fileId = body.fileId?.trim() || '';
	if (!/^[A-Za-z0-9]{5,40}$/.test(fileId)) return apiError(422, 'fileId tidak valid.');

	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return apiError(401, 'Masuk sebagai dosen untuk memproses dokumen.');

	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return apiError(401, 'Sesi tidak valid. Masuk kembali.');
	}
	const user = pb.authStore.record as { id?: string; role?: string; verified?: boolean } | null;
	if (!user?.id || user.role !== 'faculty') {
		return apiError(403, 'Pemrosesan dokumen hanya untuk dosen.');
	}
	if (!user.verified) {
		return apiError(403, 'Verifikasi email Anda sebelum memproses dokumen.');
	}

	// Loaded with the lecturer's own token so the collection rule verifies
	// they can see this file; only the owner may process it.
	let record: FileLibraryRecord;
	try {
		record = await pb.collection('file_library').getOne<FileLibraryRecord>(fileId);
	} catch {
		return apiError(404, 'Berkas tidak ditemukan.');
	}
	if (record.owner !== user.id) {
		return apiError(403, 'Hanya pemilik berkas yang dapat memproses dokumen ini.');
	}
	if (!record.file) return apiError(422, 'Rekaman tidak memiliki berkas asli.');

	// Identity of the parsed source: a replaced upload gets a new stored
	// filename, so an unchanged sourceKey means the file itself is unchanged.
	const sourceKey = `${record.file}:${record.size ?? 0}`;

	const found = await pocketbaseAdmin.listRecords<FileExtractionRecord>('file_extractions', {
		filter: `file = "${fileId}"`,
		perPage: 1,
	});
	const existing = found.items[0] ?? null;

	// Idempotent: an unchanged file with a finished result is reused as-is.
	if (
		existing &&
		!body.force &&
		existing.sourceKey === sourceKey &&
		TERMINAL_STATUSES.has(existing.status)
	) {
		return json(summarize(existing, true));
	}

	// Mark "Memproses" first so an interrupted run leaves a recoverable state.
	let extractionId = existing?.id ?? '';
	if (existing) {
		await pocketbaseAdmin.updateRecord('file_extractions', existing.id, {
			status: 'processing',
			sourceKey,
		});
	} else {
		try {
			const created = await pocketbaseAdmin.createRecord<FileExtractionRecord>(
				'file_extractions',
				{
					file: fileId,
					owner: user.id,
					status: 'processing',
					sourceKey,
					// Phase 3: the extraction stays tied to the exact version parsed.
					version: record.version || 1,
				},
			);
			extractionId = created.id;
		} catch {
			// Unique-index race with a concurrent call — reuse that record.
			const raced = await pocketbaseAdmin.listRecords<FileExtractionRecord>('file_extractions', {
				filter: `file = "${fileId}"`,
				perPage: 1,
			});
			extractionId = raced.items[0]?.id ?? '';
			if (!extractionId) throw new Error('failed to create extraction record');
			await pocketbaseAdmin.updateRecord('file_extractions', extractionId, {
				status: 'processing',
				sourceKey,
			});
		}
	}
	await pocketbaseAdmin.updateRecord('file_library', fileId, { status: 'processing' });

	const outcome = await extract(record);

	const finalData = {
		status: outcome.status,
		extractedText: outcome.text,
		language: outcome.language,
		pages: outcome.pages,
		chars: outcome.text.length,
		extractedAt: new Date().toISOString(),
		parserVersion: outcome.parserVersion,
		failureReason: outcome.reason,
		sourceKey,
		version: record.version || 1,
	};
	await pocketbaseAdmin.updateRecord('file_extractions', extractionId, finalData);
	// Coarse Phase 1 status stays in sync: extraction finished (ready/review)
	// or could not produce text (failed). The original file is untouched.
	await pocketbaseAdmin.updateRecord('file_library', fileId, {
		status: outcome.status === 'failed' ? 'failed' : 'ready',
	});

	return json({
		ok: true,
		reused: false,
		status: finalData.status,
		language: finalData.language,
		pages: finalData.pages,
		chars: finalData.chars,
		failureReason: finalData.failureReason,
		extractedAt: finalData.extractedAt,
		parserVersion: finalData.parserVersion,
	} satisfies Summary);
});
