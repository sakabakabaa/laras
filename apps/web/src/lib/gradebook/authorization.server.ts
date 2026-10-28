import type PocketBase from 'pocketbase';

/** Convenience checks; the transaction endpoint independently repeats all checks. */
export function requireGradebookFaculty(pb: PocketBase): string {
 const auth = pb.authStore.record;
 if (!pb.authStore.isValid || !auth || auth.collectionName !== 'users' || auth.role !== 'faculty') throw new Error('A faculty user session is required.');
 return auth.id;
}
export async function authorizeGradebookCourse(pb: PocketBase, courseId: string): Promise<{ id: string; owner: string }> {
 const owner = requireGradebookFaculty(pb);
 const course = await pb.collection('courses').getOne<{ id: string; owner: string }>(courseId, { requestKey: null });
 if (course.owner !== owner) throw new Error('Course ownership is required.');
 return course;
}
