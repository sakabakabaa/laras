import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('grade operation migration static constructor/sequence contract',()=>{
 it('uses typed constructors and staged nullable conversion without an in-place type change',()=>{
  let up:(app:unknown)=>void=()=>{};let down:(app:unknown)=>void=()=>{};let count=0;
  class Field { name:string;id:string;type:string; constructor(data:Record<string,unknown>,type:string){Object.assign(this,data);this.name=String(data.name);this.id=String(data.id||`field${++count}`);this.type=type;} }
  class Fields { values:Field[];constructor(values:Field[]=[]){this.values=values;}getByName(n:string){return this.values.find(x=>x.name===n);}add(f:Field){this.values.push(f);}removeById(id:string){this.values=this.values.filter(x=>x.id!==id);} }
  class Collection { name:string;id:string;fields:Fields; constructor(data:Record<string,unknown>){Object.assign(this,data);this.name=String(data.name);this.id=this.name;this.fields=new Fields(data.fields as Field[]||[]);} }
  const collections:Record<string,Collection>={},saved:Record<string,Array<{id:string;name:string;type:string}>>={};
  for(const name of ['users','courses','grade_components','grade_entries','grade_overrides'])collections[name]=new Collection({name,fields:name==='grade_entries'?[new Field({name:'value'},'number')]:[]});
  const records=[{id:'zero',values:{value:0} as Record<string,unknown>},{id:'score',values:{value:50} as Record<string,unknown>}].map(r=>({...r,get:(key:string)=>r.values[key],getString:(key:string)=>JSON.stringify(r.values[key]??null),set:(key:string,value:unknown)=>{r.values[key]=value;}}));
  for(const name of Object.keys(collections))saved[name]=collections[name].fields.values.map(f=>({...f}));
  const transitions:string[][]=[];
  const app={delete:(c:Collection)=>{delete collections[c.name];delete saved[c.name];},db:()=>({newQuery:(sql:string)=>({execute:()=>{const m=sql.match(/SET "([^"]+)" = CAST\("([^"]+)" AS/)!;for(const r of records)r.values[m[1]]=r.values[m[2]];}})}),findCollectionByNameOrId:(n:string)=>{if(!collections[n])throw Error('no rows');return collections[n];},findRecordsByFilter:(name:string)=>name==='grade_entries'?records:[],save:(c:any)=>{
   if(!c.fields)return;
   for(const f of c.fields.values){const old=(saved[c.name]||[]).find((x:any)=>x.id===f.id);if(old&&old.type!==f.type)throw Error('Cannot change existing field type');}
   if(c.name==='grade_entries'){
    transitions.push(c.fields.values.map((f:Field)=>`${f.name}:${f.type}`));
    for(const old of saved[c.name]||[]){const current=c.fields.values.find((f:Field)=>f.id===old.id);for(const r of records){if(current&&current.name!==old.name)r.values[current.name]=r.values[old.name];if(!current||current.name!==old.name)delete r.values[old.name];}}
   }
   collections[c.name]=c;saved[c.name]=c.fields.values.map((f:Field)=>({...f}));
  }};
  const context:Record<string,unknown>={migrate:(a:typeof up,b:typeof down)=>{up=a;down=b;},Collection};
  for(const name of ['Relation','Autodate','Text','Number','Select','JSON','Date'])context[`${name}Field`]=class extends Field{constructor(data:Record<string,unknown>){super(data,name.toLowerCase());}};
  vm.runInNewContext(readFileSync(new URL('../../pocketbase/pb_migrations/1791900100_gradebook_operations.js',import.meta.url),'utf8'),context);
  expect(()=>up(app)).not.toThrow();
  expect(transitions.some(fields=>fields.includes('value:number')&&fields.some(f=>f!=='value:number'&&f.endsWith(':json')))).toBe(true);
  expect(collections.grade_entries.fields.getByName('value')?.type).toBe('json');expect(records.map(r=>r.values.value)).toEqual([0,50]);
  expect(typeof down).toBe('function');
  expect(()=>down(app)).not.toThrow();expect(collections.grade_entries.fields.getByName('value')?.type).toBe('number');expect(records.map(r=>r.values.value)).toEqual([0,50]);
  up(app);records[0].values.value=null;expect(()=>down(app)).toThrow(/lose cleared-score meaning/i);expect(collections.grade_entries.fields.getByName('value')?.type).toBe('json');
 });
});
