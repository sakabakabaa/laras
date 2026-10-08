/**
 * Assistant runtime — centralized tool authorization.
 *
 * The model is treated as an untrusted planner: every entity id it passes in
 * tool arguments is re-verified server-side against the authenticated
 * lecturer before any data is read or written. These helpers are the single
 * source of truth for "does this lecturer own/access this entity, and do the
 * referenced entities actually belong to each other?".
 *
 * All checks use the lecturer's own PocketBase token, so collection access
 * rules remain the authoritative layer — these helpers make that enforcement
 * explicit and return a structured denial instead of relying on the model.
 */
import type PocketBase from 'pocketbase';
import type { Course } from '@/lib/learning';

/** A structured authorization denial the runtime can surface to the model. */
export type AuthorizationDenial = {
	ok: false;
	code: 'unauthorized' | 'not_found' | 'invalid_relationship';
	message: string;
};

/** A successful authorization carrying the verified entity. */
export type AuthorizationOk<T> = { ok: true; value: T };

export type AuthorizationResult<T> = AuthorizationOk<T> | AuthorizationDenial;

/** Loads a single record, returning null when missing or foreign to the user. */
async function ownedRecord<T extends { owner?: string }>(
	collection: string,
	pb: PocketBase,
	userId: string,
	id: string,
): Promise<T | null> {
	if (!id) return null;
	try {
		const record = await pb.collection(collection).getOne<T>(id);
		return record && record.owner === userId ? record : null;
	} catch {
		return null;
	}
}

/** Verifies the lecturer owns a course by record id. */
export const verifyOwnedCourse = (
	pb: PocketBase,
	userId: string,
	courseId: string,
): Promise<Course | null> => ownedRecord<Course>('courses', pb, userId, courseId);

/** Verifies the lecturer owns an assignment by record id. */
export const verifyOwnedAssignment = (
	pb: PocketBase,
	userId: string,
	assignmentId: string,
) => ownedRecord<{ id: string; owner: string; course: string }>('assignments', pb, userId, assignmentId);

/** Verifies the lecturer owns a class session by record id. */
export const verifyOwnedSession = (
	pb: PocketBase,
	userId: string,
	sessionId: string,
) => ownedRecord<{ id: string; owner: string; course: string }>('class_sessions', pb, userId, sessionId);

/** Verifies the lecturer owns a file-library resource by record id. */
export const verifyOwnedResource = (
	pb: PocketBase,
	userId: string,
	resourceId: string,
) => ownedRecord<{ id: string; owner: string; course: string }>('file_library', pb, userId, resourceId);

/**
 * Verifies a referenced course belongs to the lecturer and returns a
 * structured result. Use this for tool arguments that carry a raw course id
 * (not a code/slug — those go through {@link resolveCourseRef}).
 */
export const authorizeCourseId = async (
	pb: PocketBase,
	userId: string,
	courseId: string,
): Promise<AuthorizationResult<Course>> => {
	const course = await verifyOwnedCourse(pb, userId, courseId);
	if (!course) {
		return {
			ok: false,
			code: 'not_found',
			message: 'Mata kuliah tidak ditemukan atau bukan milik Anda.',
		};
	}
	return { ok: true, value: course };
};

/**
 * Verifies that a session belongs to a course the lecturer owns, and that the
 * session's `course` field matches the supplied courseId. This is the
 * cross-entity relationship check: a planner cannot reference a session from
 * another course to smuggle data into a write.
 */
export const verifySessionBelongsToCourse = async (
	pb: PocketBase,
	userId: string,
	sessionId: string,
	courseId: string,
): Promise<AuthorizationResult<{ id: string; course: string }>> => {
	const session = await verifyOwnedSession(pb, userId, sessionId);
	if (!session) {
		return { ok: false, code: 'not_found', message: 'Pertemuan tidak ditemukan atau bukan milik Anda.' };
	}
	if (session.course !== courseId) {
		return {
			ok: false,
			code: 'invalid_relationship',
			message: 'Pertemuan tersebut tidak termasuk mata kuliah yang dimaksud.',
		};
	}
	return { ok: true, value: session };
};

/**
 * Verifies that a Sub-CPMK belongs to a course the lecturer owns and matches
 * the supplied courseId. Prevents a planner from linking a task to a
 * Sub-CPMK from a different course.
 */
export const verifySubCpmkBelongsToCourse = async (
	pb: PocketBase,
	userId: string,
	subCpmkId: string,
	courseId: string,
): Promise<AuthorizationResult<{ id: string; course: string; cpmk: string }>> => {
	const subCpmk = await ownedRecord<{ id: string; owner: string; course: string; cpmk: string }>(
		'sub_cpmk',
		pb,
		userId,
		subCpmkId,
	);
	if (!subCpmk) {
		return { ok: false, code: 'not_found', message: 'Sub-CPMK tidak ditemukan atau bukan milik Anda.' };
	}
	if (subCpmk.course !== courseId) {
		return {
			ok: false,
			code: 'invalid_relationship',
			message: 'Sub-CPMK tersebut tidak termasuk mata kuliah yang dimaksud.',
		};
	}
	return { ok: true, value: subCpmk };
};

/** True when an authorization result is a denial. */
export const isDenied = <T>(result: AuthorizationResult<T>): result is AuthorizationDenial =>
	!result.ok;
