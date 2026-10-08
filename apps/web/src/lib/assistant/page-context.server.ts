/**
 * Assistant page context — server-side validation & authorization.
 *
 * Takes a raw client-provided page context payload, sanitizes its shape, and
 * authorizes every entity id against the authenticated lecturer before the
 * context reaches the model. An entity id the lecturer does not own (or that
 * does not exist) is silently dropped — it is never substituted, never trusted.
 *
 * The resolved {@link AssistantPageContext} also carries the course the
 * lecturer currently has open (resolved from the authorized entity or the
 * route segment), so the runtime and system prompt can ground tool calls
 * without re-resolving it.
 */
import type PocketBase from 'pocketbase';
import type { Course } from '@/lib/learning';
import { resolveCourseRef } from './context.server';
import { sanitizePageContextInput } from './page-context';
import type { AssistantPageContext, AssistantPageContextInput } from './types';

/** Loads a single owned record, returning null when missing or foreign. */
async function ownedRecord<T extends { owner?: string }>(
	collection: string,
	pb: PocketBase,
	userId: string,
	id: string,
): Promise<T | null> {
	try {
		const record = await pb.collection(collection).getOne<T>(id);
		return record && record.owner === userId ? record : null;
	} catch {
		return null;
	}
}

/** Loads a course the lecturer owns, by id. */
const ownedCourse = (pb: PocketBase, userId: string, id: string) =>
	ownedRecord<Course>('courses', pb, userId, id);

/**
 * Authorizes an entity id against the lecturer. Returns the course it belongs
 * to (and the course record) when the lecturer owns it, or null when the id is
 * missing, foreign, or of an unknown type — in which case the entity is dropped.
 */
async function authorizeEntity(
	pb: PocketBase,
	userId: string,
	entity: { type: string; id: string },
): Promise<{ course: Course | null } | null> {
	switch (entity.type) {
		case 'course': {
			const course = await ownedCourse(pb, userId, entity.id);
			return course ? { course } : null;
		}
		case 'assignment': {
			const assignment = await ownedRecord<{ owner: string; course: string }>(
				'assignments',
				pb,
				userId,
				entity.id,
			);
			if (!assignment?.course) return null;
			const course = await ownedCourse(pb, userId, assignment.course);
			return course ? { course } : null;
		}
		case 'session': {
			const session = await ownedRecord<{ owner: string; course: string }>(
				'class_sessions',
				pb,
				userId,
				entity.id,
			);
			if (!session?.course) return null;
			const course = await ownedCourse(pb, userId, session.course);
			return course ? { course } : null;
		}
		case 'resource': {
			const file = await ownedRecord<{ owner: string; course: string }>(
				'file_library',
				pb,
				userId,
				entity.id,
			);
			if (!file?.course) return null;
			const course = await ownedCourse(pb, userId, file.course);
			return course ? { course } : null;
		}
		default:
			return null;
	}
}

/**
 * Validates, sanitizes, and authorizes a raw client page-context payload.
 *
 * The returned context is safe to inject into the model prompt and to use as a
 * tool-argument fallback: every entity id has been confirmed to belong to the
 * authenticated lecturer, and the open course is resolved from the entity or
 * the route segment.
 */
export const validateAndAuthorizePageContext = async (
	pb: PocketBase,
	userId: string,
	raw: unknown,
	courseRoute = '',
): Promise<AssistantPageContext> => {
	const input: AssistantPageContextInput = sanitizePageContextInput(raw);
	let entity = input.entity;
	let course: Course | null = null;

	if (entity) {
		const authorized = await authorizeEntity(pb, userId, entity);
		if (!authorized) {
			// Unauthorized or missing — drop the entity entirely; never substitute.
			entity = undefined;
		} else if (authorized.course) {
			course = authorized.course;
		}
	}

	// Fall back to the route segment when no authorized entity resolved a course.
	if (!course && courseRoute) {
		const resolved = await resolveCourseRef(pb, userId, '', courseRoute);
		if (resolved.course) course = resolved.course;
	}

	return {
		route: input.route ?? '',
		feature: input.feature ?? '',
		...(entity ? { entity } : {}),
		...(input.state ? { state: input.state } : {}),
		...(input.availableActions ? { availableActions: input.availableActions } : {}),
		courseRoute,
		course,
	};
};
