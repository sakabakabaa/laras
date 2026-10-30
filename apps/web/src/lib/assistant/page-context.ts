/**
 * Assistant page context — pure helpers.
 *
 * Shape validation and deictic-reference resolution for the semantic page
 * context. No server-only imports, no JSX, no PocketBase — so this module is
 * safe to import from both client and server, and unit-testable in isolation.
 *
 * Server-side authorization (checking that the lecturer actually owns a given
 * entity id) lives in `page-context.server.ts`.
 */
import { ENTITY_TYPES, FEATURE_BY_NAME } from './features';
import type { AssistantPageContextInput } from './types';

const ROUTE_MAX = 240;
const STATE_MAX_KEYS = 24;
const STATE_VAL_MAX = 4000;
const ACTIONS_MAX = 24;
const ACTION_MAX = 80;
const ENTITY_ID_MAX = 64;

/** True when a value is a plain serializable primitive safe to forward to the model. */
const isPrimitive = (value: unknown): value is string | number | boolean =>
	typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/**
 * Validates and sanitizes a raw client-provided page context payload.
 *
 * Unknown feature keys, unregistered entity types, malformed entity shapes,
 * oversized state, and non-string actions are dropped — never thrown. The
 * returned object is safe to forward to the model once the entity id has been
 * authorized server-side.
 */
export function sanitizePageContextInput(raw: unknown): AssistantPageContextInput {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { route: '', feature: '' };
	const obj = raw as Record<string, unknown>;

	const route = typeof obj.route === 'string' ? obj.route.slice(0, ROUTE_MAX) : '';
	const feature = typeof obj.feature === 'string' && FEATURE_BY_NAME.has(obj.feature) ? obj.feature : '';

	let entity: AssistantPageContextInput['entity'];
	if (obj.entity && typeof obj.entity === 'object' && !Array.isArray(obj.entity)) {
		const e = obj.entity as Record<string, unknown>;
		const type = typeof e.type === 'string' ? e.type : '';
		const id = typeof e.id === 'string' ? e.id.slice(0, ENTITY_ID_MAX) : '';
		if (type && id && ENTITY_TYPES.has(type)) entity = { type, id };
	}

	let state: AssistantPageContextInput['state'];
	if (obj.state && typeof obj.state === 'object' && !Array.isArray(obj.state)) {
		const entries = Object.entries(obj.state as Record<string, unknown>)
			.filter(([key, value]) => key.length <= 48 && isPrimitive(value))
			.slice(0, STATE_MAX_KEYS)
			.map(([key, value]) => [
				key,
				typeof value === 'string' ? value.slice(0, STATE_VAL_MAX) : value,
			] as const);
		if (entries.length) state = Object.fromEntries(entries);
	}

	let availableActions: AssistantPageContextInput['availableActions'];
	if (Array.isArray(obj.availableActions)) {
		const actions = obj.availableActions
			.filter((action): action is string => typeof action === 'string' && action.trim().length > 0)
			.map((action) => action.slice(0, ACTION_MAX))
			.slice(0, ACTIONS_MAX);
		if (actions.length) availableActions = actions;
	}

	const result: AssistantPageContextInput = { route, feature };
	if (entity) result.entity = entity;
	if (state) result.state = state;
	if (availableActions) result.availableActions = availableActions;
	return result;
}

/** True when a sanitized context carries any usable semantic field. */
export function hasPageContextSignal(input: AssistantPageContextInput): boolean {
	return Boolean(input.feature || input.entity || (input.state && Object.keys(input.state).length > 0));
}

type DeicticEntity = { type: string; id: string };

/**
 * Specific noun → required entity type mapping for deictic references.
 * "RPS ini" and "mata kuliah ini" both resolve to a course entity (RPS has no
 * collection of its own — it lives on the course record).
 */
const DEICTIC_SPECIFIC: { noun: RegExp; type: string }[] = [
	{ noun: /(tugas|latihan)\s+ini\b/i, type: 'assignment' },
	{ noun: /mata\s+kuliah\s+ini\b/i, type: 'course' },
	{ noun: /\brps\s+ini\b/i, type: 'course' },
	{ noun: /(pertemuan|sesi)\s+ini\b/i, type: 'session' },
	{ noun: /(berkas|dokumen)\s+ini\b/i, type: 'resource' },
];

const GENERIC_DEICTIC = /\bini\b|\byang\s+ini\b/i;

/**
 * Resolves a deictic reference ("ini", "yang ini", "tugas ini", "mata kuliah
 * ini", "RPS ini", "pertemuan ini") to the page-context entity, when one is
 * present and its type matches the noun used.
 *
 * Returns the entity when the message refers to the open page's entity, or
 * null when there is no page entity, no deictic marker, or the noun does not
 * match the entity type (so the model/runtime must not substitute the page
 * entity for an unrelated reference).
 */
export function resolveDeicticEntity(
	message: string,
	context: { entity?: DeicticEntity } | null | undefined,
): DeicticEntity | null {
	const entity = context?.entity;
	if (!entity) return null;
	const text = message || '';
	if (!GENERIC_DEICTIC.test(text)) return null;
	for (const specific of DEICTIC_SPECIFIC) {
		if (specific.noun.test(text)) {
			return entity.type === specific.type ? entity : null;
		}
	}
	// Generic "ini" / "yang ini" with no specific noun — use the page entity.
	return entity;
}

/**
 * Returns the course id the assistant should assume for a write/read tool when
 * the lecturer uses a deictic reference and the page context holds a course.
 * Used as a fallback before the explicit `courseId` arg and the route segment.
 */
export function deicticCourseId(
	message: string,
	context: { entity?: DeicticEntity } | null | undefined,
): string | null {
	const entity = resolveDeicticEntity(message, context);
	return entity && entity.type === 'course' ? entity.id : null;
}
