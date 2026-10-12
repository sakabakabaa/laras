import { describe,it,expect } from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validateSection,validateCourse}=require('../../pocketbase/pb_hooks/course-term-guard.js');
class BadRequestError extends Error {}
Object.assign(globalThis,{BadRequestError});
const record=(fields:Record<string,string>)=>({id:'course',getString:(key:string)=>fields[key]||'',set:(key:string,value:string)=>{fields[key]=value;}});
const course=record({academicYear:'2026',semester:'1'});
const app={findRecordById:()=>course,findRecordsByFilter:()=>[{id:'existing'}]};
describe('term isolation safety gate',()=>{
 it('fills the parent term for a parallel class',()=>{const section=record({course:'course'});validateSection(app,section);expect(section.getString('academicYear')).toBe('2026');});
 it('blocks a different academic year',()=>expect(()=>validateSection(app,record({academicYear:'2027'}))).toThrow());
 it('blocks a different semester',()=>expect(()=>validateSection(app,record({semester:'2'}))).toThrow());
 it('blocks repurposing a populated course',()=>expect(()=>validateCourse(app,{...record({academicYear:'2027',semester:'1'}),original:()=>course})).toThrow());
 it('allows correcting an unused course term',()=>expect(()=>validateCourse({...app,findRecordsByFilter:()=>[]},{...record({academicYear:'2027',semester:'1'}),original:()=>course})).not.toThrow());
});
