import { useMemo } from 'react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { CourseSection } from '@/lib/learning';

export type CourseSections = {
	sections: CourseSection[];
	loading: boolean;
	error: string;
	reload: () => void;
};

/**
 * Loads the lecturer-defined sections (Kelas A, Kelas B, …) for one mata
 * kuliah. Reads are open to any signed-in user, so this works for both the
 * course owner and enrolled students. Cached so returning to the course
 * reuses the list.
 */
export function useCourseSections(courseId: string | undefined): CourseSections {
	const filter = useMemo(
		() => (courseId ? pb.filter('course = {:id}', { id: courseId }) : ''),
		[courseId],
	);

	const query = useCachedQuery<CourseSection[]>(
		courseId ? `course_sections:course=${courseId}` : null,
		() =>
			pb.collection('course_sections').getFullList<CourseSection>({
				filter,
				sort: 'created',
			}),
	);

	return useMemo(
		() => ({
			sections: query.data ?? [],
			loading: query.loading,
			error: query.error,
			reload: query.reload,
		}),
		[query],
	);
}
