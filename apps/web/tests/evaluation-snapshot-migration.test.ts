import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
it('adds evidence fields idempotently while enforcing owner-only reads and server-only writes, with reversible schema', () => {
 const fields = new Map<string, any>();
 const collection: any = { fields: { getByName: (name: string) => fields.get(name), add: (field: any) => fields.set(field.name, field), removeByName: (name: string) => fields.delete(name) } };
 let up: any; let down: any;
 const app = { findCollectionByNameOrId: () => collection, save: () => {} };
 runInNewContext(readFileSync(resolve('../pocketbase/pb_migrations/1791320000_ai_evaluation_evidence_snapshots.js'), 'utf8'), { migrate: (u: any, d: any) => { up = u; down = d; }, JSONField: class { constructor(data: any) { Object.assign(this, data); } } });
 up(app); up(app);
 expect([...fields.keys()]).toEqual(['researchSnapshot', 'generationHistory']);
 expect(collection.listRule).toBe("@request.auth.id != '' && owner = @request.auth.id");
 expect(collection.viewRule).toBe(collection.listRule);
 expect(collection.createRule).toBeNull(); expect(collection.updateRule).toBeNull(); expect(collection.deleteRule).toBeNull();
 down(app); expect(fields.size).toBe(0);
});
