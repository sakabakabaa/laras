import { useCachedQuery } from '@/hooks/use-cached-query';
import { fetchCourseByRoute } from '@/lib/course-route';
import type { Course } from '@/lib/learning';

/**
 * Load a course from a route param that may be either a code slug
 * (e.g. "A1-JR241") or a legacy record id. Shares one cached request across
 * the course layout, rail, and detail panel via the `courses:route=<param>`
 * cache key, and is invalidated together with the rest of the `courses:*`
 * reads after any course save.
 */
export function useCourseByRoute(param: string | undefined) {
	return useCachedQuery<Course | null>(
		param ? `courses:route=${param}` : null,
		() => fetchCourseByRoute(param!),
	);
}
