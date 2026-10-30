import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('context excerpt schema upgrade', () => {
	it('adds an optional bounded field idempotently without changing existing approval or access rules', () => {
		let upgrade!: (app: unknown) => void;
		let downgrade!: (app: unknown) => void;
		const fields = new Map<string, unknown>();
		const sections = { listRule: 'owner-only', rows: [{ status: 'suitable', version: 1 }], fields: {
			getByName: (name: string) => fields.get(name),
			add: (field: { name: string }) => fields.set(field.name, field),
			removeByName: (name: string) => fields.delete(name),
		} };
		const app = { findCollectionByNameOrId: () => sections, save: () => {} };
		runInNewContext(readFileSync(resolve('../pocketbase/pb_migrations/1791700300_context_section_excerpts.js'), 'utf8'), {
			migrate: (up: typeof upgrade, down: typeof downgrade) => { upgrade = up; downgrade = down; },
			TextField: class { constructor(field: object) { Object.assign(this, field); } },
		});
		upgrade(app); upgrade(app);
		expect(fields.size).toBe(1);
		expect(fields.get('excerpt')).toMatchObject({ name: 'excerpt', max: 8000 });
		expect(fields.get('excerpt')).not.toHaveProperty('required', true);
		expect(sections.rows).toEqual([{ status: 'suitable', version: 1 }]);
		expect(sections.listRule).toBe('owner-only');
		downgrade(app);
		expect(fields.size).toBe(0);
	});
});
