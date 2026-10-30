import { useMemo } from 'react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { CourseRosterEntry } from '@/lib/learning';

export type CourseRoster = {
	entries: CourseRosterEntry[];
	loading: boolean;
	error: string;
	reload: () => void;
};

/**
 * Loads the lecturer-managed student roster for one mata kuliah. Access rules
 * scope reads to the course owner, so this returns [] for students and other
 * lecturers.
 *
 * The list is the roster itself (name, NIM, kelas) — not live enrollments.
 * Enrollment owner records are not readable from the browser, so merging them
 * produced duplicate “Mahasiswa / Tanpa NIM” rows that could not be matched
 * back to the roster. Account linkage stays on the server (roster-status).
 */
export function useCourseRoster(courseId: string | undefined): CourseRoster {
	const filter = useMemo(
		() => (courseId ? pb.filter('course = {:id}', { id: courseId }) : ''),
		[courseId],
	);

	const rosterQuery = useCachedQuery<CourseRosterEntry[]>(
		courseId ? `course_roster:course=${courseId}` : null,
		() =>
			pb.collection('course_roster').getFullList<CourseRosterEntry>({
				filter,
				sort: 'nim,name',
			}),
	);

	const entries = rosterQuery.data ?? [];

	return useMemo(
		() => ({
			entries,
			loading: rosterQuery.loading,
			error: rosterQuery.error,
			reload: rosterQuery.reload,
		}),
		[entries, rosterQuery.loading, rosterQuery.error, rosterQuery.reload],
	);
}
