import { useMemo } from 'react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';
import type { ClassSession, Enrollment } from '@/lib/learning';

export type CourseAssignments = {
	assignments: Assignment[];
	sessions: ClassSession[];
	loading: boolean;
	error: string;
	reload: () => void;
};

/**
 * Loads every assignment for one course (plus the course's sessions, so
 * assignments can show their linked pertemuan). Drafts are only returned to
 * their faculty owner by the collection's list rule, so students naturally
 * see published/closed/archived assignments only.
 *
 * Everything goes through the local cache, so switching tabs or returning to
 * the Tugas page reuses cached rows instead of re-querying PocketBase.
 */
export function useCourseAssignments(courseId: string | undefined): CourseAssignments {
	const filter = useMemo(
		() => (courseId ? pb.filter('course = {:id}', { id: courseId }) : ''),
		[courseId],
	);

	const assignments = useCachedQuery<Assignment[]>(
		courseId ? `assignments:course=${courseId}` : null,
		() =>
			pb.collection('assignments').getFullList<Assignment>({
				filter,
				sort: 'deadline,created',
				expand: 'session,subCpmk,attachments,parentAssignment',
			}),
	);
	const sessions = useCachedQuery<ClassSession[]>(
		courseId ? `class_sessions:course=${courseId}` : null,
		() =>
			pb.collection('class_sessions').getFullList<ClassSession>({ filter, sort: 'week,created' }),
	);

	return useMemo(
		() => ({
			assignments: assignments.data ?? [],
			sessions: sessions.data ?? [],
			loading: assignments.loading || sessions.loading,
			error: assignments.error || sessions.error,
			reload: () => {
				assignments.reload();
				sessions.reload();
			},
		}),
		[assignments, sessions],
	);
}

/** Every submission for one assignment (lecturer view), with student expand. */
export function useAssignmentSubmissions(assignmentId: string | null) {
	return useCachedQuery<AssignmentSubmission[]>(
		assignmentId ? `assignment_submissions:assignment=${assignmentId}` : null,
		() =>
			pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({
				filter: pb.filter('assignment = {:id}', { id: assignmentId as string }),
				expand: 'owner',
				sort: 'created',
			}),
	);
}

/** The signed-in student's own submissions across a course's assignments. */
export function useMySubmissions(assignments: Assignment[]) {
	const ids = useMemo(
		() => assignments.map((a) => a.id).filter(Boolean),
		[assignments],
	);
	const key = ids.length > 0 ? `assignment_submissions:mine:${ids.slice().sort().join(',')}` : null;
	const me = pb.authStore.record?.id || '';

	// PocketBase record ids are [a-z0-9]{15}, so quoting them inline is safe.
	const filter = useMemo(
		() =>
			ids.length > 0
				? `${ids.map((id) => `assignment = "${id}"`).join(' || ')} && owner = "${me}"`
				: '',
		[ids, me],
	);

	return useCachedQuery<AssignmentSubmission[]>(
		key,
		() =>
			pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({
				filter,
				sort: 'created',
			}),
	);
}

/** Enrolled students for a course (used by the lecturer submissions view). */
export function useCourseEnrollments(courseId: string | undefined) {
	type Enriched = Enrollment & { expand?: { owner?: { name?: string; email?: string } } };
	return useCachedQuery<Enriched[]>(
		courseId ? `enrollments:course=${courseId}` : null,
		() =>
			pb.collection('enrollments').getFullList<Enriched>({
				filter: pb.filter('course = {:id}', { id: courseId as string }),
				expand: 'owner',
				sort: '-created',
			}),
	);
}
