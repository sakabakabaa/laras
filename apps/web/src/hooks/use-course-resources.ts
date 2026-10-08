import { useMemo } from 'react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { CourseResource, ClassSession } from '@/lib/learning';

export type CourseResources = {
	resources: CourseResource[];
	sessions: ClassSession[];
	loading: boolean;
	error: string;
	reload: () => void;
};

/**
 * Loads every resource for one course plus the course's sessions (so resources
 * can be grouped by pertemuan). Read access is open to all signed-in users, so
 * this works for both faculty owners and enrolled students.
 *
 * Both reads go through the local cache, so switching tabs or returning to the
 * Materi page reuses cached rows instead of re-querying PocketBase.
 */
export function useCourseResources(courseId: string | undefined): CourseResources {
	const filter = useMemo(
		() => (courseId ? pb.filter('course = {:id}', { id: courseId }) : ''),
		[courseId],
	);

	const resources = useCachedQuery<CourseResource[]>(
		courseId ? `course_resources:course=${courseId}` : null,
		() =>
			pb.collection('course_resources').getFullList<CourseResource>({
				filter,
				sort: '-created',
			}),
	);
	const sessions = useCachedQuery<ClassSession[]>(
		courseId ? `class_sessions:course=${courseId}` : null,
		() => pb.collection('class_sessions').getFullList<ClassSession>({ filter, sort: 'week,created' }),
	);

	return useMemo(
		() => ({
			resources: resources.data ?? [],
			sessions: sessions.data ?? [],
			loading: resources.loading || sessions.loading,
			error: resources.error || sessions.error,
			reload: () => {
				resources.reload();
				sessions.reload();
			},
		}),
		[resources, sessions],
	);
}
