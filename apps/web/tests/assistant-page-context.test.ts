/**
 * Phase 11 — assistant semantic page context tests.
 *
 * Verifies the pure helpers (shape sanitization, feature registry, deictic
 * reference resolution, system-prompt injection) and the server-side
 * authorization that drops entity ids the authenticated lecturer does not own.
 *
 * The authorization tests use a minimal in-memory PocketBase-like client
 * (same shape as the assistant-sessions tests) implementing only the methods
 * `validateAndAuthorizePageContext` calls.
 */
import { describe, expect, it } from 'vitest';
import { ASSISTANT_FEATURES, ENTITY_TYPES, FEATURE_BY_NAME, featureDescriptor } from '@/lib/assistant/features';
import {
	deicticCourseId,
	hasPageContextSignal,
	resolveDeicticEntity,
	sanitizePageContextInput,
} from '@/lib/assistant/page-context';
import { validateAndAuthorizePageContext } from '@/lib/assistant/page-context.server';
import { buildSystemPrompt } from '@/lib/assistant/context.server';
import type { AssistantPageContext } from '@/lib/assistant/types';

type Row = Record<string, unknown> & { id: string };

function fakePb(store: Record<string, Row[]>) {
	const evalFilter = (expr: string, row: Row): boolean =>
		expr
			.split('&&')
			.map((c) => c.trim())
			.every((clause) => {
				const m = clause.match(/^(\w+)\s*=\s*(.+)$/);
				if (!m) return true;
				const [, field, raw] = m;
				const val = raw.trim();
				const expected = val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1) : val;
				return row[field] === expected;
			});
	return {
		filter(template: string, params: Record<string, unknown>): string {
			let out = template;
			for (const [key, value] of Object.entries(params)) {
				out = out.replace(`{:${key}}`, JSON.stringify(String(value)));
			}
			return out;
		},
		collection(name: string) {
			const rows = () => store[name] ?? [];
			return {
				async getOne<T>(id: string): Promise<T> {
					const row = rows().find((r) => r.id === id);
					if (!row) throw Object.assign(new Error('not found'), { status: 404 });
					return row as unknown as T;
				},
				async getFullList<T>(opts: { filter?: string } = {}): Promise<T[]> {
					let list = [...rows()];
					if (opts.filter) list = list.filter((r) => evalFilter(opts.filter!, r));
					return list as unknown as T[];
				},
			};
		},
	} as never;
}

const COURSE_A = { id: 'courseA', owner: 'userA', title: 'Schreiben A1', code: 'JR241' };
const COURSE_B = { id: 'courseB', owner: 'userB', title: 'Other', code: 'XX999' };

describe('feature registry', () => {
	it('includes every required LARAS feature', () => {
		const keys = ASSISTANT_FEATURES.map((f) => f.feature);
		for (const required of [
			'courses',
			'rps',
			'sessions',
			'assignments',
			'resources',
			'roster',
			'analytics',
			'calendar',
			'settings',
		]) {
			expect(keys).toContain(required);
		}
	});

	it('featureDescriptor returns the descriptor for known features', () => {
		expect(featureDescriptor('rps')?.label).toBe('RPS');
		expect(featureDescriptor('assignments')?.entityTypes).toContain('assignment');
		expect(featureDescriptor('nonexistent')).toBeUndefined();
	});

	it('ENTITY_TYPES covers course, assignment, session, resource', () => {
		expect(ENTITY_TYPES.has('course')).toBe(true);
		expect(ENTITY_TYPES.has('assignment')).toBe(true);
		expect(ENTITY_TYPES.has('session')).toBe(true);
		expect(ENTITY_TYPES.has('resource')).toBe(true);
		expect(ENTITY_TYPES.has('unknown')).toBe(false);
	});

	it('FEATURE_BY_NAME matches ASSISTANT_FEATURES entries', () => {
		expect(FEATURE_BY_NAME.size).toBe(ASSISTANT_FEATURES.length);
	});
});

describe('sanitizePageContextInput', () => {
	it('keeps a well-formed payload', () => {
		const out = sanitizePageContextInput({
			route: '/app/courses/abc/rps',
			feature: 'rps',
			entity: { type: 'course', id: 'abc' },
			state: { step: 3 },
			availableActions: ['save_rps_draft'],
		});
		expect(out.route).toBe('/app/courses/abc/rps');
		expect(out.feature).toBe('rps');
		expect(out.entity).toEqual({ type: 'course', id: 'abc' });
		expect(out.state).toEqual({ step: 3 });
		expect(out.availableActions).toEqual(['save_rps_draft']);
	});

	it('drops an unknown feature key', () => {
		const out = sanitizePageContextInput({ feature: 'time-travel' });
		expect(out.feature).toBe('');
	});

	it('drops an entity with an unregistered type', () => {
		const out = sanitizePageContextInput({ entity: { type: 'planet', id: 'mars' } });
		expect(out.entity).toBeUndefined();
	});

	it('drops a malformed entity shape', () => {
		expect(sanitizePageContextInput({ entity: { type: 'course' } }).entity).toBeUndefined();
		expect(sanitizePageContextInput({ entity: 'nope' }).entity).toBeUndefined();
	});

	it('filters non-string actions and caps the list', () => {
		const out = sanitizePageContextInput({ availableActions: ['a', 7, 'b', '  ', 'c'] });
		expect(out.availableActions).toEqual(['a', 'b', 'c']);
	});

	it('ignores non-object input', () => {
		expect(sanitizePageContextInput(null)).toEqual({ route: '', feature: '' });
		expect(sanitizePageContextInput('string')).toEqual({ route: '', feature: '' });
		expect(sanitizePageContextInput([])).toEqual({ route: '', feature: '' });
	});

	it('truncates oversized route and keeps only primitive state values', () => {
		const long = 'x'.repeat(500);
		const out = sanitizePageContextInput({ route: long, state: { ok: 1, bad: { nested: true }, str: 's' } });
		expect(out.route.length).toBe(240);
		expect(out.state).toEqual({ ok: 1, str: 's' });
	});

	it('hasPageContextSignal reflects whether anything useful remains', () => {
		expect(hasPageContextSignal(sanitizePageContextInput({ feature: 'rps' }))).toBe(true);
		expect(hasPageContextSignal(sanitizePageContextInput({ route: '/x' }))).toBe(false);
	});
});

describe('resolveDeicticEntity', () => {
	const course = { type: 'course', id: 'courseA' };
	const assignment = { type: 'assignment', id: 'asg1' };
	const session = { type: 'session', id: 'ses1' };

	it('resolves "tugas ini" to an assignment entity', () => {
		expect(resolveDeicticEntity('buat jadi tugas kolaboratif untuk tugas ini', { entity: assignment })).toEqual(assignment);
	});

	it('resolves "mata kuliah ini" to a course entity', () => {
		expect(resolveDeicticEntity('ringkasan mata kuliah ini', { entity: course })).toEqual(course);
	});

	it('resolves "RPS ini" to a course entity (RPS lives on the course)', () => {
		expect(resolveDeicticEntity('lengkapi RPS ini', { entity: course })).toEqual(course);
	});

	it('resolves "pertemuan ini" to a session entity', () => {
		expect(resolveDeicticEntity('topik pertemuan ini', { entity: session })).toEqual(session);
	});

	it('returns null when the noun does not match the entity type', () => {
		expect(resolveDeicticEntity('tugas ini', { entity: course })).toBeNull();
		expect(resolveDeicticEntity('mata kuliah ini', { entity: assignment })).toBeNull();
	});

	it('returns null when there is no deictic marker', () => {
		expect(resolveDeicticEntity('buat tugas baru', { entity: course })).toBeNull();
	});

	it('returns null when there is no page entity', () => {
		expect(resolveDeicticEntity('tugas ini', { entity: undefined })).toBeNull();
		expect(resolveDeicticEntity('tugas ini', null)).toBeNull();
	});

	it('falls back to the page entity for a generic "ini"', () => {
		expect(resolveDeicticEntity('tolong periksa ini', { entity: assignment })).toEqual(assignment);
	});

	it('deicticCourseId returns the course id only for course entities', () => {
		expect(deicticCourseId('ringkasan mata kuliah ini', { entity: course })).toBe('courseA');
		expect(deicticCourseId('tugas ini', { entity: assignment })).toBeNull();
		expect(deicticCourseId('halo', { entity: course })).toBeNull();
	});
});

describe('buildSystemPrompt', () => {
	it('injects feature, course, entity, and deictic guidance', () => {
		const ctx: AssistantPageContext = {
			route: '/app/courses/courseA/rps',
			feature: 'rps',
			entity: { type: 'course', id: 'courseA' },
			state: { step: 3 },
			availableActions: ['import_rps_pdf'],
			courseRoute: 'courseA',
			course: { id: 'courseA', owner: 'u', title: 'Schreiben A1', code: 'JR241', created: '', updated: '' } as never,
		};
		const prompt = buildSystemPrompt(ctx);
		expect(prompt).toContain('KONTEKS HALAMAN SAAT INI');
		expect(prompt).toContain('RPS');
		expect(prompt).toContain('Schreiben A1');
		expect(prompt).toContain('courseA');
		expect(prompt).toContain('tugas ini');
		expect(prompt).toContain('import_rps_pdf');
	});

	it('omits the context block when nothing is published', () => {
		const prompt = buildSystemPrompt({ route: '', feature: '', courseRoute: '', course: null });
		expect(prompt).not.toContain('KONTEKS HALAMAN SAAT INI');
	});
});

describe('validateAndAuthorizePageContext', () => {
	it('keeps an owned course entity and resolves the course', async () => {
		const pb = fakePb({ courses: [COURSE_A as Row] });
		const ctx = await validateAndAuthorizePageContext(pb, 'userA', { feature: 'courses', entity: { type: 'course', id: 'courseA' } }, '');
		expect(ctx.entity).toEqual({ type: 'course', id: 'courseA' });
		expect(ctx.course?.id).toBe('courseA');
		expect(ctx.feature).toBe('courses');
	});

	it('drops a course entity the lecturer does not own', async () => {
		const pb = fakePb({ courses: [COURSE_A as Row, COURSE_B as Row] });
		const ctx = await validateAndAuthorizePageContext(pb, 'userA', { entity: { type: 'course', id: 'courseB' } }, '');
		expect(ctx.entity).toBeUndefined();
		expect(ctx.course).toBeNull();
	});

	it('drops a course entity that does not exist', async () => {
		const pb = fakePb({ courses: [COURSE_A as Row] });
		const ctx = await validateAndAuthorizePageContext(pb, 'userA', { entity: { type: 'course', id: 'missing' } }, '');
		expect(ctx.entity).toBeUndefined();
		expect(ctx.course).toBeNull();
	});

	it('drops an entity with an unknown type', async () => {
		const pb = fakePb({ courses: [COURSE_A as Row] });
		const ctx = await validateAndAuthorizePageContext(pb, 'userA', { entity: { type: 'planet', id: 'mars' } }, '');
		expect(ctx.entity).toBeUndefined();
	});

	it('resolves the course from the route segment when no entity is present', async () => {
		const pb = fakePb({ courses: [COURSE_A as Row] });
		const ctx = await validateAndAuthorizePageContext(pb, 'userA', {}, 'JR241');
		expect(ctx.entity).toBeUndefined();
		expect(ctx.course?.id).toBe('courseA');
	});

	it('drops an assignment entity whose course is foreign', async () => {
		const pb = fakePb({
			courses: [COURSE_A as Row],
			assignments: [{ id: 'asg1', owner: 'userA', course: 'courseB' }],
		});
		const ctx = await validateAndAuthorizePageContext(pb, 'userA', { entity: { type: 'assignment', id: 'asg1' } }, '');
		expect(ctx.entity).toBeUndefined();
		expect(ctx.course).toBeNull();
	});

	it('keeps an assignment entity whose course the lecturer owns', async () => {
		const pb = fakePb({
			courses: [COURSE_A as Row],
			assignments: [{ id: 'asg1', owner: 'userA', course: 'courseA' }],
		});
		const ctx = await validateAndAuthorizePageContext(pb, 'userA', { entity: { type: 'assignment', id: 'asg1' } }, '');
		expect(ctx.entity).toEqual({ type: 'assignment', id: 'asg1' });
		expect(ctx.course?.id).toBe('courseA');
	});

	it('sanitizes an unknown feature before authorizing', async () => {
		const pb = fakePb({ courses: [COURSE_A as Row] });
		const ctx = await validateAndAuthorizePageContext(pb, 'userA', { feature: 'time-travel', entity: { type: 'course', id: 'courseA' } }, '');
		expect(ctx.feature).toBe('');
		expect(ctx.entity).toEqual({ type: 'course', id: 'courseA' });
	});
});
