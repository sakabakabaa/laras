import pb from '@/lib/pocketbase-client';
import type { Course } from '@/lib/learning';

/** PocketBase record ids are 15-char lowercase alphanumeric strings. */
const PB_ID_RE = /^[a-z0-9]{15}$/;

/**
 * Slugify a course code into a URL-safe route segment.
 * "A1 JR241" → "A1-JR241", "EDU 301" → "EDU-301". Case is preserved so the
 * route stays readable; non-alphanumeric runs collapse to a single hyphen.
 */
export function courseCodeSlug(code: string): string {
	return code
		.trim()
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * The route segment to use for a course: its code slug when a code exists,
 * falling back to its record id. Courses without a code keep id-based URLs.
 */
export function courseRouteId(course: { id: string; code?: string }): string {
	const slug = course.code ? courseCodeSlug(course.code) : '';
	return slug || course.id;
}

/** True when a route param looks like a PocketBase record id (legacy links). */
export function isCourseIdParam(param: string): boolean {
	return PB_ID_RE.test(param);
}

/**
 * Resolve a course route param — either a code slug or a legacy record id —
 * to the actual course record. Code slugs are matched case-insensitively
 * against the slugified `code` field of every course the signed-in user can
 * read. Returns null when no course matches (handled by the caller as 404).
 */
export async function fetchCourseByRoute(param: string): Promise<Course | null> {
	if (!param) return null;
	if (isCourseIdParam(param)) {
		try {
			return await pb.collection('courses').getOne<Course>(param);
		} catch {
			return null;
		}
	}
	const lower = param.toLowerCase();
	try {
		const list = await pb.collection('courses').getFullList<Course>({ sort: '-created' });
		return list.find((c) => courseCodeSlug(c.code).toLowerCase() === lower) ?? null;
	} catch {
		return null;
	}
}
