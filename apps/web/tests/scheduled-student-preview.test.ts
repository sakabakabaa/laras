import {describe,expect,it} from 'vitest';
import {studentPreview,previewRequest} from '../src/lib/scheduled-student-preview';
import type {ScheduledClassState} from '../src/lib/scheduled-classes';
const state={owner:true,session:{id:'session',course:'course'},class:{id:'class',startsAt:'2026-10-29T06:00:00Z',endsAt:'2026-10-29T07:00:00Z',status:'scheduled',academicSnapshot:{private:'SECRET'}},activities:[{id:'read',kind:'assignment',startsAt:'2026-10-29T06:00:00Z',endsAt:'2026-10-29T06:30:00Z',content:'Visible instructions',worksheet:{items:[{id:'a',prompt:'Answer',type:'text'}]},sources:[{id:'book',title:'Book',filename:'book.pdf',version:1,access:'student'},{id:'private',title:'SECRET',filename:'keys.pdf',access:'faculty'}],questions:[{id:'q',text:'Question',options:['A','B'],correctIndex:1,explanation:'SECRET KEY'}]},{id:'future',kind:'assignment',startsAt:'2026-10-29T06:30:00Z',endsAt:'2026-10-29T07:00:00Z',content:'HIDDEN FUTURE'}],attempts:[{answers:{text:'PRIVATE STUDENT ANSWER'}}],report:[{name:'PRIVATE NAME'}],events:[{detail:'PRIVATE AUDIT'}]} as unknown as ScheduledClassState;
describe('lecturer student preview',()=>{
 it('uses one session clock without changing the actual schedule',()=>{const p=studentPreview(state,1);expect(p.now).toBe(Date.parse(state.class!.startsAt)+1000);expect(p.state.class?.startsAt).toBe(state.class?.startsAt);expect(p.state.owner).toBe(false);expect(state.class?.status).toBe('scheduled');expect(p.state.activities[1].content).toBe('HIDDEN FUTURE');});
 it('opens every activity but hides keys, faculty materials and real student work',()=>{const p=studentPreview(state,0);expect(p.state.activities[1].content).toBe('HIDDEN FUTURE');expect(p.state.activities[0].sources).toHaveLength(1);expect(p.state.activities[0].worksheet).toEqual(state.activities[0].worksheet);expect(JSON.stringify(p)).not.toMatch(/SECRET|PRIVATE/);expect(p.state.activities[0].sources?.[0].url).toContain('book.pdf');});
 it('requires lecturer ownership and a valid selected activity',()=>{expect(()=>studentPreview({...state,owner:false},0)).toThrow();expect(()=>studentPreview(state,9)).toThrow();});
});

describe('isolated preview transport',()=>{
 it('saves, validates, submits and revisits without modifying real work',()=>{
  const original=JSON.stringify(state);const p=studentPreview(state,0).state;
  expect(()=>previewRequest(p,'submit',{activityId:'read',baseRevision:0,answers:{}})).toThrow();
  const saved=previewRequest(p,'saveAnswer',{activityId:'read',baseRevision:0,answers:{responses:{a:'Test'}}});
  const submitted=previewRequest(saved,'submit',{activityId:'read',baseRevision:1,answers:{responses:{a:'Test'}}});
  expect(submitted.attempts[0].status).toBe('submitted');expect(submitted.attempts[0].complete).toBe(true);
  expect(previewRequest(submitted,'saveAnswer',{activityId:'read',baseRevision:2,answers:{responses:{a:'Changed'}}}).attempts[0].answers).toEqual({responses:{a:'Test'}});
  expect(JSON.stringify(state)).toBe(original);
 });
 it('allows later activities immediately and earlier activities after their estimated end',()=>{
  const p=studentPreview(state,0).state;
  expect(previewRequest(p,'saveAnswer',{activityId:'future',baseRevision:0,answers:{text:'Ahead'}}).attempts[0].activity).toBe('future');
  expect(previewRequest({...p,serverNow:'2026-10-29T06:45:00Z'},'saveAnswer',{activityId:'read',baseRevision:0,answers:{responses:{a:'Still open'}}}).attempts).toHaveLength(1);
  expect(()=>previewRequest({...p,serverNow:state.class!.endsAt},'saveAnswer',{activityId:'read',baseRevision:0,answers:{}})).toThrow();
  expect(()=>previewRequest(state,'saveAnswer',{})).toThrow();
 });
});
