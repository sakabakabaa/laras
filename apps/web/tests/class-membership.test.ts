import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {sessionInClass} from '@/lib/class-scope';
const moduleContext={exports:{} as Record<string, (...args: any[])=>any>};
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/section-membership.js',import.meta.url),'utf8'),{module:moduleContext,BadRequestError:Error});
const {alignEnrollment,syncRoster,studentNim}=moduleContext.exports;
const record=(values:Record<string,string>)=>({id:values.id||'',getString:(key:string)=>values[key]||'',set:(key:string,value:string)=>{values[key]=value;}});
describe('parallel class membership',()=>{
 it('keeps shared sessions visible and excludes another class',()=>{
  expect(sessionInClass({section:''},'A')).toBe(true);expect(sessionInClass({section:'A'},'A')).toBe(true);expect(sessionInClass({section:'B'},'A')).toBe(false);expect(sessionInClass({section:'B'},'')).toBe(true);
 });
 it('uses canonical student email only when NIM is absent and excludes staff',()=>{
  expect(studentNim(record({role:'student',email:'123@student.upi.edu'}))).toBe('123');expect(studentNim(record({role:'faculty',nim:'123'}))).toBe('');expect(studentNim(record({role:'student',email:'123@example.com'}))).toBe('');
 });
 it('derives enrollment membership from the single matching roster row',()=>{
  const values={owner:'u',course:'c',section:''};
  const app={findRecordById:(collection:string)=>collection==='users'?record({role:'student',nim:'123'}):record({course:'c'}),findRecordsByFilter:()=>[record({section:'A'})]};
  alignEnrollment(app,record(values));expect(values.section).toBe('A');
 });
 it('does not guess membership when roster matching is ambiguous',()=>{
  const values={owner:'u',course:'c',section:''};const app={findRecordById:()=>record({role:'student',nim:'123'}),findRecordsByFilter:()=>[record({section:'A'}),record({section:'B'})]};alignEnrollment(app,record(values));expect(values.section).toBe('');
 });
 it('rejects a section belonging to another course',()=>{
  const app={findRecordById:(collection:string)=>collection==='users'?record({role:'student',nim:'123'}):record({course:'other'}),findRecordsByFilter:()=>[record({section:'A'})]};expect(()=>alignEnrollment(app,record({owner:'u',course:'c'}))).toThrow('Kelas tidak termasuk');
 });
 it('updates an existing enrollment when the lecturer moves the roster student',()=>{
  const values={owner:'u',course:'c',section:'A'};let saved=0;
  const app={findRecordById:()=>record({course:'c'}),findRecordsByFilter:(collection:string)=>collection==='users'?[record({id:'u',role:'student',nim:'123'})]:collection==='course_roster'?[record({section:'B'})]:[record(values)],save:()=>{saved++;}};
  syncRoster(app,record({course:'c',nim:'123'}));expect(values.section).toBe('B');expect(saved).toBe(1);
 });
});
