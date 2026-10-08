/**
 * Client-side HEIC/HEIF → JPEG conversion for uploads.
 *
 * HEIC photos (common from iPhones) are not readable by the platform model or
 * most browsers, so they are converted to JPEG in the browser before upload.
 * The conversion runs only on a user action, so this module never executes
 * during SSR — the dynamic import keeps the WASM payload out of the initial
 * bundle too.
 */
const HEIC_EXTENSIONS = ['.heic', '.heif'];
const HEIC_MIME = ['image/heic', 'image/heif', 'image/heic-sequence'];

/** Whether a file is a HEIC/HEIF image (by MIME type or extension). */
export function isHeic(file: File): boolean {
	const name = file.name.toLowerCase();
	return HEIC_MIME.includes(file.type) || HEIC_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Convert a HEIC/HEIF file to a JPEG file, preserving the base filename. */
export async function convertHeicToJpeg(file: File): Promise<File> {
	const heic2any = (await import('heic2any')).default;
	const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
	const result = Array.isArray(blob) ? blob[0] : blob;
	const baseName = file.name.replace(/\.(heic|heif)$/i, '');
	return new File([result], `${baseName}.jpg`, { type: 'image/jpeg' });
}
