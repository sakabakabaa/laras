import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';
import type {BuilderRunItem} from '../src/lib/builder-delivery';

const backend={exports:{} as {handle:(app:unknown,user:unknown,body:unknown)=>{items:BuilderRunItem[]}}};
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/builder-delivery.js',import.meta.url),'utf8'),{module:backend,__hooks:'',require:()=>({}),ForbiddenError:Error,BadRequestError:Error});

function record(id:string,fields:Record<string,unknown>){
  return {id,getString:(name:string)=>typeof fields[name]==='object'?JSON.stringify(fields[name]):String(fields[name]??''),getBool:(name:string)=>!!fields[name],getInt:(name:string)=>Number(fields[name]||0)};
}
function fixture(role='faculty'){
  const document={kind:'tugas',context:{courseId:'course',meetingId:'meeting',sectionIds:[] as string[]},activities:[{id:'activity'}],delivery:{availableAt:'2030-01-01T09:00:00Z',dueAt:'2030-01-01T10:00:00Z',allowLate:false}};
  const run=record('run',{owner:'faculty',course:'course',version:'version',kind:'tugas',title:'Email writing',created:'2029-12-31T10:00:00Z'});
  const version=record('version',{document:'draft',content:document,revision:2});
  const course=record('course',{owner:'faculty',title:'German A1',code:'DE1'});
  const responses=[record('first',{student:'student',startedAt:'2030-01-01T09:00:00Z',submittedAt:'2030-01-01T09:30:00Z',released:{at:'2030-01-01T09:45:00Z'}}),record('second',{student:'another',startedAt:'2030-01-01T09:00:00Z',submittedAt:'2030-01-01T09:30:00Z'}),record('draft',{student:'third',startedAt:'2030-01-01T09:00:00Z'})];
  const enrollment=record('enrollment',{course:'course'});
  const keys=record('keys',{keys:{answersByQuestionId:{secret:'private-key'}}});
  const user={id:role,getString:(name:string)=>name==='role'?role:''};
  const app={findRecordById:vi.fn((collection:string)=>{if(collection==='builder_runs')return run;if(collection==='builder_versions')return version;if(collection==='courses')return course;throw new Error('Record unavailable');}),findRecordsByFilter:vi.fn((collection:string,_filter:string,_sort:string,_limit:number,_offset:number,params:Record<string,string>)=>collection==='builder_runs'?[run]:collection==='builder_version_keys'?[keys]:collection==='enrollments'?[enrollment]:collection==='builder_responses'?(params.s?responses.filter(response=>response.getString('student')===params.s):responses):[])};
  return {app,user,document};
}

it('supplies course identity, publication metadata, and real owner-only progress counters',()=>{
  const {app,user}=fixture();
  const result=backend.exports.handle(app,user,{action:'list',kind:'tugas'});
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({id:'run',courseId:'course',courseCode:'DE1',courseTitle:'German A1',meetingId:'meeting',created:'2029-12-31T10:00:00Z',activityCount:1,checkedIn:3,submittedCount:2,gradedCount:1});
  expect(JSON.stringify(result)).not.toContain('private-key');
});
it('does not expose other students progress counters on the student listing',()=>{
  const {app,user}=fixture('student');
  const result=backend.exports.handle(app,user,{action:'list',kind:'tugas'});
  expect(result.items).toHaveLength(1);
  expect(result.items[0].submittedAt).toBe('2030-01-01T09:30:00Z');
  for(const field of ['checkedIn','submittedCount','gradedCount'])expect(result.items[0]).not.toHaveProperty(field);
  expect(JSON.stringify(result)).not.toContain('private-key');
});
it('keeps a publication available even if an old section no longer exists',()=>{
  const {app,user,document}=fixture();
  document.context.sectionIds.push('removed-section');
  expect(backend.exports.handle(app,user,{action:'list',kind:'tugas'}).items).toHaveLength(1);
});
