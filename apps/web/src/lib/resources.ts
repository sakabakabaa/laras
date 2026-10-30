import pb from '@/lib/pocketbase-client';
import type { CourseResource } from '@/lib/learning';

/** Supported file categories for icon + preview decisions. */
export type FileCategory =
	| 'pdf'
	| 'slides'
	| 'document'
	| 'spreadsheet'
	| 'image'
	| 'audio'
	| 'video'
	| 'file';

const EXT_CATEGORY: Record<string, FileCategory> = {
	pdf: 'pdf',
	ppt: 'slides',
	pptx: 'slides',
	key: 'slides',
	doc: 'document',
	docx: 'document',
	pages: 'document',
	odt: 'document',
	rtf: 'document',
	txt: 'document',
	xls: 'spreadsheet',
	xlsx: 'spreadsheet',
	csv: 'spreadsheet',
	numbers: 'spreadsheet',
	ods: 'spreadsheet',
	jpg: 'image',
	jpeg: 'image',
	png: 'image',
	webp: 'image',
	gif: 'image',
	svg: 'image',
	bmp: 'image',
	mp3: 'audio',
	mpeg: 'audio',
	wav: 'audio',
	ogg: 'audio',
	aac: 'audio',
	m4a: 'audio',
	flac: 'audio',
	mp4: 'video',
	webm: 'video',
	mov: 'video',
	avi: 'video',
	mkv: 'video',
	ogv: 'video',
};

const MIME_CATEGORY: Record<string, FileCategory> = {
	'application/pdf': 'pdf',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
	'application/vnd.ms-powerpoint': 'slides',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
	'application/msword': 'document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
	'application/vnd.ms-excel': 'spreadsheet',
};

/** Infer a file category from a filename + optional mime type. */
export function fileCategory(filename?: string, mime?: string): FileCategory {
	if (mime && MIME_CATEGORY[mime]) return MIME_CATEGORY[mime];
	if (mime && mime.startsWith('image/')) return 'image';
	if (mime && mime.startsWith('audio/')) return 'audio';
	if (mime && mime.startsWith('video/')) return 'video';
	if (filename) {
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		if (EXT_CATEGORY[ext]) return EXT_CATEGORY[ext];
	}
	return 'file';
}

export const CATEGORY_LABEL: Record<FileCategory, string> = {
	pdf: 'PDF',
	slides: 'Slide',
	document: 'Dokumen',
	spreadsheet: 'Lembar kerja',
	image: 'Gambar',
	audio: 'Audio',
	video: 'Video',
	file: 'Berkas',
};

/** Human-readable byte size, e.g. "2,4 MB". */
export function formatBytes(bytes?: number) {
	if (!bytes || bytes <= 0) return '—';
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const formatted = unit === 0 ? String(value) : value.toFixed(1).replace('.', ',');
	return `${formatted} ${units[unit]}`;
}

/** Absolute (same-origin) download URL for an uploaded resource file. */
export function resourceFileUrl(resource: CourseResource) {
	return pb.files.getURL(resource, resource.file);
}

/** True when the category can be previewed inline in the browser. */
export function canPreview(category: FileCategory) {
	return category === 'image' || category === 'pdf' || category === 'video' || category === 'audio';
}

/** Accepted mime types for the file input, matching the migration. */
export const ACCEPTED_MIME =
	'.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,image/*,audio/*,video/*';

/** Max upload size in bytes (must match the migration's maxSize). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const SUPPORTED_EXTS = [
	'pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx',
	'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp',
	'mp3', 'wav', 'ogg', 'aac', 'm4a',
	'mp4', 'webm', 'mov', 'avi', 'mkv',
];

/** Validate a chosen file before upload. Returns an Indonesian error or ''. */
export function validateFile(file: File): string {
	if (file.size > MAX_UPLOAD_BYTES) {
		return `Ukuran berkas ${formatBytes(file.size)} melebihi batas ${formatBytes(MAX_UPLOAD_BYTES)}.`;
	}
	const ext = file.name.split('.').pop()?.toLowerCase() || '';
	const mimeOk =
		file.type.startsWith('image/') ||
		file.type.startsWith('audio/') ||
		file.type.startsWith('video/') ||
		Boolean(MIME_CATEGORY[file.type]);
	if (!mimeOk && !SUPPORTED_EXTS.includes(ext)) {
		return 'Tipe berkas tidak didukung. Gunakan PDF, PPTX, DOCX, XLSX, gambar, audio, atau video.';
	}
	return '';
}

export type UploadProgress = {
	loaded: number;
	total: number;
	percent: number;
};

/**
 * Upload a course resource via XMLHttpRequest so we can report real upload
 * progress. The PocketBase SDK uses fetch (no progress events), so we hit the
 * records endpoint directly with the user's JWT. Resolves with the created
 * record JSON.
 */
export function uploadResource(
	formData: FormData,
	onProgress?: (p: UploadProgress) => void,
): Promise<CourseResource> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		const url = `${pb.baseURL}/api/collections/course_resources/records`;
		xhr.open('POST', url, true);
		const token = pb.authStore.token;
		if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
		xhr.responseType = 'json';

		xhr.upload.onprogress = (e) => {
			if (!e.lengthComputable || !onProgress) return;
			onProgress({
				loaded: e.loaded,
				total: e.total,
				percent: Math.round((e.loaded / e.total) * 100),
			});
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve(xhr.response as CourseResource);
			} else {
				const body = xhr.response;
				const msg =
					body && typeof body === 'object' && 'message' in body
						? (body as { message?: string }).message
						: `Gagal mengunggah (${xhr.status}).`;
				reject(new Error(msg));
			}
		};

		xhr.onerror = () => reject(new Error('Koneksi terputus saat mengunggah. Coba lagi.'));
		xhr.onabort = () => reject(new Error('Unggahan dibatalkan.'));

		xhr.send(formData);
	});
}
