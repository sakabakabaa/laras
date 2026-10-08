import type { Course } from '@/lib/learning';

/**
 * Client-safe metadata helpers for the Manajemen berkas upload flow.
 * Everything here is best-effort and conservative: language detection and
 * course matching only produce a result when the evidence is clear, and
 * nothing ever invents academic relationships.
 */

/** Files above this size are not sent to the parse route (API body cap is 20 MB). */
export const PARSE_MAX_SIZE = 20 * 1024 * 1024;

/** Plain-text files are read client-side up to this size. */
const TEXT_READ_MAX_SIZE = 2 * 1024 * 1024;

export type DetectedLanguage = 'de' | 'id' | 'en';

export const LANGUAGE_LABELS: Record<DetectedLanguage, string> = {
	de: 'Jerman',
	id: 'Indonesia',
	en: 'Inggris',
};

/** High-frequency function/stop words — enough signal for a coarse detection. */
const LANGUAGE_MARKERS: Record<DetectedLanguage, string[]> = {
	de: [
		'der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'fur', 'fuer', 'ich', 'sie', 'ein',
		'eine', 'auf', 'von', 'dem', 'den', 'man', 'auch', 'sich', 'oder', 'aber', 'dass',
		'wir', 'haben', 'kann', 'werden', 'beim', 'zum', 'zur', 'doch', 'mal',
	],
	id: [
		'yang', 'dan', 'di', 'dengan', 'untuk', 'pada', 'dari', 'ini', 'itu', 'atau', 'tidak',
		'dalam', 'akan', 'adalah', 'sebagai', 'mahasiswa', 'mata', 'kuliah', 'dapat', 'ke',
		'tersebut', 'agar', 'oleh', 'juga', 'sudah', 'belum', 'setelah', 'antara',
	],
	en: [
		'the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'it', 'with', 'as', 'was', 'on',
		'are', 'this', 'be', 'by', 'from', 'have', 'not', 'which', 'you', 'they', 'their',
	],
};

/**
 * Coarse language detection from a text sample. Returns '' when the sample is
 * too short or no marker language reaches a clear threshold — never guesses.
 */
export function detectLanguage(text: string): DetectedLanguage | '' {
	const sample = text.toLowerCase().slice(0, 12000);
	if (sample.trim().length < 120) return '';

	let best: DetectedLanguage | '' = '';
	let bestCount = 0;
	for (const lang of Object.keys(LANGUAGE_MARKERS) as DetectedLanguage[]) {
		let count = 0;
		for (const marker of LANGUAGE_MARKERS[lang]) {
			const matches = sample.match(new RegExp(`\\b${marker}\\b`, 'g'));
			if (matches) count += matches.length;
		}
		if (count > bestCount) {
			bestCount = count;
			best = lang;
		}
	}
	return bestCount >= 6 ? best : '';
}

/** Collapse a name/code to comparable alphanumeric form. */
export function normalizeForMatch(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Match a course from the uploaded filename — only via the course code
 * (e.g. "BG5123" appearing in "BG5123_modul-3.pdf"), and only when exactly one
 * authorized course matches. Returns null otherwise; never invents a link.
 */
export function matchCourseFromFilename(filename: string, courses: Course[]): Course | null {
	const needle = normalizeForMatch(filename);
	if (!needle) return null;

	const matches = courses.filter((course) => {
		const code = normalizeForMatch(course.code || '');
		// Codes shorter than 4 normalized chars match too easily — ignore them.
		return code.length >= 4 && needle.includes(code);
	});

	return matches.length === 1 ? matches[0] : null;
}

/** Whether a plain-text file can be read client-side for detection. */
export function isClientTextFile(file: File): boolean {
	const textLike =
		file.type.startsWith('text/') ||
		/\.(txt|csv|md|vtt|srt)$/i.test(file.name);
	return textLike && file.size > 0 && file.size <= TEXT_READ_MAX_SIZE;
}
