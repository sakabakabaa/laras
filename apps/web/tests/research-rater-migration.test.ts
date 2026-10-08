import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
test('P1 schema locks raw research reads and makes round identity and writer locks unique', () => {
 const collections = new Map<string, any>([['users', { id: 'users' }], ['assignments', { id: 'assignments' }], ['ai_feedback_items', { id: 'items', name: 'ai_feedback_items', listRule: 'old', viewRule: 'old', indexes: [] }]]);
 let up: (app: any) => void;
 vm.runInNewContext(readFileSync('../pocketbase/pb_migrations/1791321000_research_rater_access.js', 'utf8'), {
  migrate: (fn: any) => { up = fn; }, Collection: class { constructor(data: any) { Object.assign(this, data); } },
 });
 up!({ findCollectionByNameOrId: (name: string) => { const row = collections.get(name); if (!row) throw new Error('missing'); return row; }, save: (row: any) => collections.set(row.name, row) });
 const raters = collections.get('research_rater_assignments');
 expect(raters).toBeDefined();
 for (const rule of ['listRule','viewRule','createRule','updateRule','deleteRule']) expect(raters[rule]).toBeNull();
 expect(raters.fields.find((field: any) => field.name === 'round').values).toEqual(['1','2','0']);
 expect(raters.indexes.join(' ')).toContain('(assignment, reviewer)');
 expect(raters.indexes.join(' ')).toContain('(assignment, round)');
 expect(collections.get('research_annotation_locks').indexes.join(' ')).toContain('(key)');
 expect(collections.get('ai_feedback_items').listRule).toBeNull();
 expect(collections.get('ai_feedback_items').viewRule).toBeNull();
});
