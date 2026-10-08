import pb from '@/lib/pocketbase-client';
import type {
	ExtractionStatus,
	FileAccess,
	FileExtractionRecord,
	FileLibraryRecord,
	FileProcessingStatus,
} from '@/lib/learning';

/** 500 MB — matches the PocketBase `file_library.file` field limit. */
export const FILE_LIBRARY_MAX_SIZE = 500 * 1024 * 1024;

/** Accepted upload types — mirrors the migration's `mimeTypes` list. */
export const FILE_LIBRARY_MIME_TYPES = [
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/msword',
	'application/vnd.ms-excel',
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/svg+xml',
	'audio/mpeg',
	'audio/wav',
	'audio/ogg',
	'audio/aac',
	'audio/x-m4a',
	'video/mp4',
	'video/webm',
	'video/quicktime',
];

export type FileKind = 'document' | 'image' | 'audio' | 'video' | 'other';

const KIND_BY_EXTENSION: Record<string, FileKind> = {
	pdf: 'document',
	doc: 'document',
	docx: 'document',
	ppt: 'document',
	pptx: 'document',
	xls: 'document',
	xlsx: 'document',
	txt: 'document',
	csv: 'document',
	jpg: 'image',
	jpeg: 'image',
	png: 'image',
	webp: 'image',
	gif: 'image',
	svg: 'image',
	mp3: 'audio',
	wav: 'audio',
	ogg: 'audio',
	aac: 'audio',
	m4a: 'audio',
	mp4: 'video',
	webm: 'video',
	mov: 'video',
	quicktime: 'video',
};

export function fileKindFor(filename: string): FileKind {
	const ext = (filename.split('.').pop() || '').toLowerCase();
	return KIND_BY_EXTENSION[ext] ?? 'other';
}

export const FILE_KIND_LABELS: Record<FileKind, string> = {
	document: 'Dokumen',
	image: 'Gambar',
	audio: 'Audio',
	video: 'Video',
	other: 'Lainnya',
};

export const ACCESS_LABELS: Record<FileAccess, string> = {
	faculty: 'Dosen only',
	student: 'Mahasiswa',
	public: 'Publik',
};

export const ACCESS_HINTS: Record<FileAccess, string> = {
	faculty:
		'Berkas pribadi dosen. Mahasiswa tetap dapat membaca berkas yang ditautkan ke mata kuliah (hanya baca, tanpa unduh).',
	student: 'Mahasiswa terdaftar dapat membaca berkas yang ditautkan ke mata kuliah (hanya baca, tanpa unduh).',
	public: 'Siapa pun dengan tautan dapat melihat berkas ini.',
};

export const STATUS_LABELS: Record<FileProcessingStatus, string> = {
	ready: 'Siap',
	processing: 'Diproses',
	failed: 'Gagal',
};

export function formatBytes(size: number | null | undefined) {
	if (size === null || size === undefined || Number.isNaN(size)) return 'Ukuran tidak diketahui';
	if (size < 1024) return `${size} B`;
	const units = ['KB', 'MB', 'GB'];
	let value = size;
	let unit = -1;
	do {
		value /= 1024;
		unit += 1;
	} while (value >= 1024 && unit < units.length - 1);
	return `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/* ── Phase 2: document processing states ─────────────────── */

/** Processing state shown in the UI, including "not yet processed". */
export type ProcessingState = ExtractionStatus | 'waiting';

export const EXTRACTION_STATUS_LABELS: Record<ProcessingState, string> = {
	waiting: 'Menunggu',
	pending: 'Menunggu',
	processing: 'Memproses',
	ready: 'Siap digunakan',
	review: 'Perlu ditinjau',
	failed: 'Gagal diproses',
};

/** Derive the Phase 2 processing state for a library file. */
export function processingStateFor(
	record: Pick<FileLibraryRecord, 'status'>,
	extraction?: FileExtractionRecord | null,
): ProcessingState {
	if (extraction) return extraction.status;
	return record.status === 'processing' ? 'processing' : 'waiting';
}

export type ProcessSummary = {
	ok: boolean;
	reused: boolean;
	status: ExtractionStatus;
	language: string;
	pages: number;
	chars: number;
	failureReason: string;
	extractedAt: string;
	parserVersion: string;
};

/**
 * Trigger server-side document processing for one library file (Phase 2).
 * Lecturer-only: the route verifies the caller owns the file. `force` asks
 * for a re-parse; without it an unchanged file reuses the stored result.
 */
export async function processLibraryFile(fileId: string, force: boolean): Promise<ProcessSummary> {
	const response = await fetch('/api/berkas-process', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${pb.authStore.token}`,
		},
		body: JSON.stringify({ fileId, force }),
	});
	const data = (await response.json().catch(() => null)) as
		| (ProcessSummary & { error?: string; message?: string })
		| null;
	if (!response.ok || !data?.ok) {
		throw new Error(data?.error || data?.message || 'Pemrosesan dokumen gagal.');
	}
	return data;
}

/* ── Phase 3: versioning & traceability ───────────────────── */

/**
 * Step one of a file replacement: snapshots the current active version as
 * an immutable prior version (server-side) and returns the next version
 * number for the replacement upload. Throws on failure — the caller must
 * NOT proceed with the replacement when this fails, or the prior version
 * would be lost.
 */
export async function snapshotLibraryFile(fileId: string): Promise<number> {
	const response = await fetch('/api/berkas-snapshot', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${pb.authStore.token}`,
		},
		body: JSON.stringify({ fileId }),
	});
	const data = (await response.json().catch(() => null)) as
		| { ok?: boolean; newVersion?: number; message?: string; error?: string }
		| null;
	if (!response.ok || !data?.ok) {
		throw new Error(
			data?.message || data?.error || 'Gagal menyimpan versi sebelumnya. Coba lagi.',
		);
	}
	return Number(data.newVersion) || 1;
}

/**
 * Restores a prior version as the new active version. The current active
 * version is preserved to history first — nothing is deleted or rolled back.
 */
export async function restoreFileVersion(fileId: string, versionId: string): Promise<void> {
	const response = await fetch('/api/berkas-restore', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${pb.authStore.token}`,
		},
		body: JSON.stringify({ fileId, versionId }),
	});
	const data = (await response.json().catch(() => null)) as
		| { ok?: boolean; message?: string; error?: string }
		| null;
	if (!response.ok || !data?.ok) {
		throw new Error(data?.message || data?.error || 'Gagal memulihkan versi. Coba lagi.');
	}
}

/** Client-side upload validation with Indonesian messages; '' = valid. */
export function validateLibraryFile(file: File) {
	if (file.size > FILE_LIBRARY_MAX_SIZE) {
		return 'Ukuran berkas maksimal 500 MB.';
	}
	if (file.type && !FILE_LIBRARY_MIME_TYPES.includes(file.type)) {
		return 'Format tidak didukung. Gunakan dokumen (PDF/Office), gambar, audio, atau video.';
	}
	return '';
}
