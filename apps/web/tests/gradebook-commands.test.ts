import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const hookPath = new URL('../../pocketbase/pb_hooks/gradebook-commands.pb.js', import.meta.url);
function load() {
 const routes: Record<string, (e: unknown) => unknown> = {};
 const hooks: Record<string, Array<{ fn: (e: unknown) => unknown; names: string[] }>> = {};
 const sandbox: Record<string, unknown> = { routerAdd: (_method: string, path: string, fn: (e: unknown) => unknown) => { routes[path] = fn; }, ForbiddenError: Error, BadRequestError: Error, Record: FakeRecord, $security: { sha256: (s: string) => s }, Date, console };
 for (const type of ['onRecordCreate', 'onRecordUpdate', 'onRecordDelete', 'onRecordCreateRequest', 'onRecordUpdateRequest', 'onRecordDeleteRequest']) sandbox[type] = (fn: (e: unknown) => unknown, ...names: string[]) => { (hooks[type] ??= []).push({ fn, names }); };
 vm.runInNewContext(readFileSync(hookPath, 'utf8'), sandbox);
 return { routes, hooks };
}
class FakeRecord {
 id = ''; values: Record<string, unknown> = {}; prior: Record<string, unknown> = {}; name: string;
 constructor(c: { name: string }) { this.name = c.name; }
 get(k: string) { return this.values[k] ?? null; }
 getString(k: string) { const v = this.get(k); return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''); }
 getInt(k: string) { return Number(this.get(k) ?? 0); }
 getFloat(k: string) { return this.getInt(k); }
 set(k: string, v: unknown) { this.values[k] = v; }
 original() { const r = new FakeRecord({ name: this.name }); r.id = this.id; r.values = this.prior; return r; }
 collection() { return { name: this.name }; }
}
function fixture() {
 const loaded = load();
 let rows: FakeRecord[] = []; let sequence = 0;
 const app = {
 findCollectionByNameOrId: (name: string) => ({ name }),
 findRecordById: (name: string, id: string) => { const r = rows.find(r => r.name === name && r.id === id); if (!r) throw Error('not found'); return r; },
 findRecordsByFilter: (name: string, filter: string, _sort = '', limit = 0, _offset = 0, params: Record<string, unknown> = {}) => rows.filter(r => r.name === name && filter.split(' && ').every(clause => { const m = clause.match(/^(\w+)=\{:(\w+)\}$/); return !m || r.getString(m[1]) === String(params[m[2]]); })).slice(0, limit || undefined),
 save: (r: FakeRecord) => { const kind = r.id ? 'onRecordUpdate' : 'onRecordCreate'; for (const h of loaded.hooks[kind] ?? []) if (h.names.includes(r.name)) h.fn({ app, record: r, next() {} }); if (!r.id) { r.id = `record${++sequence}`; rows.push(r); } r.prior = structuredClone(r.values); },
 delete: (r: FakeRecord) => { for (const h of loaded.hooks.onRecordDelete ?? []) if (h.names.includes(r.name)) h.fn({ app, record: r, next() {} }); rows = rows.filter(x => x.id !== r.id); },
 runInTransaction: (fn: (a: typeof app) => void) => { const backup = rows.map(r => { const c = new FakeRecord({name:r.name}); c.id=r.id;c.values=structuredClone(r.values);c.prior=structuredClone(r.prior);return c; }); try { fn(app); } catch (error) { rows = backup; throw error; } },
 };
 function seed(name: string, id: string, values: Record<string, unknown>) { const r=new FakeRecord({name});r.id=id;r.values=values;r.prior=structuredClone(values);rows.push(r);return r; }
 const faculty=seed('users','faculty',{role:'faculty'}); seed('users','student',{role:'student',nim:'123'});
 seed('courses','course',{owner:'faculty'});seed('grade_components','component',{owner:'faculty',course:'course',kind:'manual',status:'active',maxScore:100,revision:1});
 seed('enrollments','enrollment',{owner:'student',course:'course',revision:1});
 const user={id:faculty.id,getString:(k:string)=>faculty.getString(k),isSuperuser:()=>false}; const admin={id:'admin',isSuperuser:()=>true};
 function command(body: Record<string, unknown>, auth: unknown = user) { let output: any; loaded.routes['/api/gradebook/commands']({app,auth,requestInfo:()=>({body}),json:(_status:number,value:unknown)=>{output=value;return value;}});return output; }
 return {app,seed,command,rows:()=>rows,user,admin,loaded};
}
const input={action:'prepare',courseId:'course',operationKey:'unique-operation-1',items:[{componentId:'component',studentId:'student',operation:{op:'set_score',score:0}}]};
describe('transactional PocketBase command handler (JSVM unit harness)',()=>{
 it('registers the actual custom endpoint',()=>{ expect(load().routes['/api/gradebook/commands']).toBeTypeOf('function'); });
 it('persists a preview with exact zero and permits only server approval before atomic apply',()=>{
  const f=fixture();const p=f.command(input);expect(p.status).toBe('awaiting_approval');expect(p.items[0].after.value).toBe(0);
  const ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};
  expect(()=>f.command({action:'apply',...ref})).toThrow(/approv/i);
  expect(()=>f.command({action:'approve',...ref,ownerId:'faculty'})).toThrow(/server/i);
  f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);
  const result=f.command({action:'apply',...ref});expect(result.status).toBe('verified');
  expect(f.rows().filter(r=>r.name==='grade_entries')).toHaveLength(1);expect(f.rows().find(r=>r.name==='grade_entries')?.get('value')).toBe(0);
  expect(f.command({action:'apply',...ref}).result).toEqual(result.result);
 });
 it('commits before independent verification and survives a verification failure',()=>{
  const f=fixture(),p=f.command(input),ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);
  const transaction=f.app.runInTransaction;let count=0;f.app.runInTransaction=(fn)=>{count++;if(count===2)throw Error('verification unavailable');transaction(fn);};
  expect(f.command({action:'apply',...ref}).status).toBe('committed_unverified');expect(f.rows().filter(r=>r.name==='grade_entries')).toHaveLength(1);
  f.app.runInTransaction=transaction;expect(f.command({action:'reconcile',proposalId:p.id}).status).toBe('verified');
 });
 it('never accepts a different reviewed hash even for a committed retry',()=>{
  const f=fixture(),p=f.command(input),ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};
  f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);f.command({action:'apply',...ref});
  expect(()=>f.command({action:'apply',...ref,payloadHash:'forged'})).toThrow(/revision\/hash/i);
 });
 it('rejects stale target and component revisions without partial writes',()=>{
  for(const mutation of ['component','roster','entry']){
   const f=fixture();const p=f.command(input),ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);
   if(mutation==='component'){const c=f.app.findRecordById('grade_components','component');c.set('weight',50);f.app.save(c);}
   if(mutation==='roster')f.app.delete(f.app.findRecordById('enrollments','enrollment'));
   if(mutation==='entry')f.seed('grade_entries','concurrent',{owner:'faculty',component:'component',student:'student',value:10,source:'manual',note:'',chapters:{},revision:1});
   const count=f.rows().filter(r=>r.name==='grade_entries').length;expect(f.command({action:'apply',...ref}).status).toBe('conflicted');expect(f.rows().filter(r=>r.name==='grade_entries')).toHaveLength(count);expect(f.rows().filter(r=>r.name==='grade_change_events'&&r.getString('action')==='committed')).toHaveLength(0);
  }
 });
 it('rolls back grades, events and operation completion on a mid-batch save fault',()=>{
  const f=fixture();f.seed('users','student2',{role:'student',nim:'456'});f.seed('enrollments','enrollment2',{owner:'student2',course:'course'});
  const p=f.command({...input,items:[...input.items,{componentId:'component',studentId:'student2',operation:{op:'set_score',score:80}}]}),ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);
  const save=f.app.save;let writes=0;f.app.save=r=>{if(r.name==='grade_entries'&&++writes===2)throw Error('injected save failure');save(r);};
  expect(()=>f.command({action:'apply',...ref})).toThrow(/injected/);expect(f.rows().filter(r=>r.name==='grade_entries')).toHaveLength(0);expect(f.rows().filter(r=>r.name==='grade_change_events'&&r.getString('action')==='committed')).toHaveLength(0);expect(f.app.findRecordById('grade_change_sets',p.id).getString('status')).toBe('approved');
 });
 it('keeps null clears distinct from zero while preserving notes',()=>{
  const f=fixture();f.seed('grade_entries','existing',{owner:'faculty',component:'component',student:'student',value:0,note:'retain',source:'manual',chapters:{},revision:3});
  const p=f.command({...input,items:[{componentId:'component',studentId:'student',operation:{op:'clear_score'}}]}),ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};expect(p.items[0].before.value).toBe(0);expect(p.items[0].after.value).toBeNull();f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);f.command({action:'apply',...ref});expect(f.app.findRecordById('grade_entries','existing').get('value')).toBeNull();expect(f.app.findRecordById('grade_entries','existing').getString('note')).toBe('retain');
 });
 it.each(['attendance','tasks','uts','uas'])('rejects computed %s targets',source=>{const f=fixture();f.app.findRecordById('grade_components','component').set('sourceType',source);expect(()=>f.command(input)).toThrow(/read only/i);expect(f.rows().filter(r=>r.name==='grade_change_sets')).toHaveLength(0);});
 it.each([-1,101,1.001,0.000000001,Infinity,NaN])('rejects invalid bounded numeric input %s',score=>{const f=fixture();expect(()=>f.command({...input,items:[{...input.items[0],operation:{op:'set_score',score}}]})).toThrow();expect(f.rows().filter(r=>r.name==='grade_change_sets')).toHaveLength(0);});
 it('pins durable operation keys to the original input',()=>{const f=fixture(),p=f.command(input);expect(f.command(input).id).toBe(p.id);expect(()=>f.command({...input,items:[{...input.items[0],operation:{op:'set_score',score:10}}]})).toThrow(/different input/i);});
 it('permits note-only updates on an ungraded chapter without inventing an earned zero',()=>{
  const f=fixture();f.app.findRecordById('grade_components','component').set('chapters',[{id:'one'}]);
  const p=f.command({...input,items:[{componentId:'component',studentId:'student',operation:{op:'set_note',note:'needs review'}}]}),ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);
  expect(f.command({action:'apply',...ref}).status).toBe('verified');const entry=f.rows().find(r=>r.name==='grade_entries')!;expect(entry.get('value')).toBeNull();expect(entry.getString('note')).toBe('needs review');
 });
 it('consolidates chapter changes but rejects conflicting duplicate input',()=>{
  const f=fixture(),c=f.app.findRecordById('grade_components','component');c.set('chapters',[{id:'one'},{id:'two'}]);
  const item={componentId:'component',studentId:'student'};const p=f.command({...input,items:[{...item,operation:{op:'set_chapter',chapterId:'one',status:'done'}},{...item,operation:{op:'set_chapter',chapterId:'two',status:'partial'}}]});expect(p.items).toHaveLength(1);expect(p.items[0].after.value).toBe(75);
  expect(()=>f.command({...input,operationKey:'conflicting-operation',items:[{...item,operation:{op:'set_chapter',chapterId:'one',status:'done'}},{...item,operation:{op:'set_chapter',chapterId:'one',status:'partial'}}]})).toThrow(/conflicting/i);
 });
 it('restores exact chapter map and original entry absence with guarded inverse approval',()=>{
  const f=fixture(),c=f.app.findRecordById('grade_components','component');c.set('chapters',[{id:'one'},{id:'two'}]);
  const p=f.command({...input,items:[{componentId:'component',studentId:'student',operation:{op:'set_chapter',chapterId:'one',status:'done'}}]}),ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);f.command({action:'apply',...ref});
  const inverse=f.command({action:'revert',proposalId:p.id,operationKey:'revert-chapter-absence'});expect(inverse.items[0].after).toEqual({value:null,note:'',chapters:{}});
  const invRef={proposalId:inverse.id,revision:inverse.revision,payloadHash:inverse.payloadHash};f.command({action:'approve',...invRef,ownerId:'faculty'},f.admin);expect(f.command({action:'apply',...invRef}).status).toBe('verified');expect(f.rows().filter(r=>r.name==='grade_entries')).toHaveLength(0);
  const redo=f.command({action:'revert',proposalId:inverse.id,operationKey:'redo-chapter-operation'});const redoRef={proposalId:redo.id,revision:redo.revision,payloadHash:redo.payloadHash};f.command({action:'approve',...redoRef,ownerId:'faculty'},f.admin);expect(f.command({action:'apply',...redoRef}).status).toBe('verified');expect(f.rows().find(r=>r.name==='grade_entries')?.get('value')).toBe(50);
 });
 it('creates an approval-required guarded inverse and refuses intervening edits',()=>{
  const f=fixture(),p=f.command(input),ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};f.command({action:'approve',...ref,ownerId:'faculty'},f.admin);f.command({action:'apply',...ref});
  const inverse=f.command({action:'revert',proposalId:p.id,operationKey:'inverse-operation'});expect(inverse.status).toBe('awaiting_approval');expect(inverse.items[0].after.value).toBeNull();
  const r=f.rows().find(r=>r.name==='grade_entries')!;r.set('value',30);f.app.save(r);expect(()=>f.command({action:'revert',proposalId:p.id,operationKey:'another-inverse'})).toThrow(/intervening/i);
 });
 it('validates assignment-course links and override enrollment at the model boundary',()=>{
  const f=fixture();f.seed('assignments','foreign-assignment',{owner:'faculty',course:'other-course'});
  const c=new FakeRecord({name:'grade_components'});c.values={owner:'faculty',course:'course',kind:'assignment',assignment:'foreign-assignment'};expect(()=>f.app.save(c)).toThrow(/assignment/i);
  f.seed('users','outsider',{role:'student'});const o=new FakeRecord({name:'grade_overrides'});o.values={owner:'faculty',course:'course',student:'outsider',value:70};expect(()=>f.app.save(o)).toThrow(/enrolled/i);
 });
 it('prevents parent cascades from silently deleting graded entries outside a guarded revert',()=>{
  const f=fixture(),r=f.seed('grade_entries','existing',{owner:'faculty',component:'component',student:'student',source:'manual',value:0,note:'',chapters:{},revision:1});
  expect(()=>f.app.delete(r)).toThrow(/guarded revert/i);
 });
 it('blocks SDK write bypass and immutable audit mutation even for superuser requests',()=>{
  const f=fixture();for(const kind of ['onRecordCreateRequest','onRecordUpdateRequest','onRecordDeleteRequest'])for(const h of f.loaded.hooks[kind]??[])if(h.names.includes('grade_entries'))expect(()=>h.fn({auth:f.admin,next(){}})).toThrow();
  const p=f.command(input),audit=f.rows().find(r=>r.name==='grade_change_events')!;expect(()=>f.app.save(audit)).toThrow(/immutable/i);expect(()=>f.app.delete(audit)).toThrow(/immutable/i);expect(f.app.findRecordById('grade_change_sets',p.id)).toBeTruthy();
 });
 it('expires uncommitted proposals during status reconciliation',()=>{
  const f=fixture(),p=f.command(input);f.app.findRecordById('grade_change_sets',p.id).set('expiresAt','2000-01-01T00:00:00Z');
  expect(f.command({action:'reconcile',proposalId:p.id}).status).toBe('expired');expect(f.rows().filter(r=>r.name==='grade_entries')).toHaveLength(0);
 });
 it('rejects a reviewed proposal durably without writing grades',()=>{
  const f=fixture(), p=f.command(input); const ref={proposalId:p.id,revision:p.revision,payloadHash:p.payloadHash};
  expect(f.command({action:'reject',...ref}).status).toBe('rejected');
  expect(()=>f.command({action:'approve',...ref,ownerId:'faculty'},f.admin)).toThrow(/cannot/i);
  expect(f.rows().filter(r=>r.name==='grade_entries')).toHaveLength(0);
 });
});
