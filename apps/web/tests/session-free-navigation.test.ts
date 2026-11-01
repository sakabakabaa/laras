import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
const source=readFileSync(resolve('../pocketbase/pb_hooks/builder-delivery.js'),'utf8');
const sandbox={module:{exports:{} as any},__hooks:'',require:()=>({})};
runInNewContext(source+'\nmodule.exports={openActivity,endTime};',sandbox);
const {openActivity,endTime}=sandbox.module.exports;
const start=Date.parse('2026-11-02T06:00:00Z'),end=start+60*60000;
const response={getString:(key:string)=>key==='startedAt'?new Date(start).toISOString():''};
const context=(progression:string)=>({d:{kind:'kelas',activities:[{plannedMinutes:10},{plannedMinutes:50}],delivery:{progression,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),timeLimitMinutes:5}},run:{getBool:()=>false,getInt:()=>0}});
describe('one deadline for all session activities',()=>{
 for(const mode of ['scheduled','guided','free'])it(`opens every activity throughout ${mode} sessions`,()=>{
  const ctx=context(mode);
  expect(openActivity(ctx,1,start+1000,response)).toBe(true);
  expect(openActivity(ctx,0,end-1,response)).toBe(true);
  expect(endTime(ctx,response)).toBe(end);
  expect(openActivity(ctx,0,start-1,response)).toBe(false);
  expect(openActivity(ctx,1,end,response)).toBe(false);
  expect(openActivity(ctx,0,start+1000,null)).toBe(false);
  expect(openActivity({...ctx,run:{getBool:()=>true}},0,start+1000,response)).toBe(false);
 });
 it('preserves assignment time limits',()=>{
  const ctx=context('free');ctx.d.kind='tugas';Object.assign(ctx.d.delivery,{availableAt:new Date(start).toISOString(),dueAt:new Date(end).toISOString()});
  expect(endTime(ctx,response)).toBe(start+5*60000);
 });
});

it('does not expire scheduled-class drafts at an individual activity deadline',()=>{
 const service=readFileSync(resolve('../pocketbase/pb_hooks/scheduled-classes-service.js'),'utf8');
 const finalized:string[]=[],events:string[]=[];
 const draft={getString:(key:string)=>key==='activity'?'first':''};
 const box={module:{exports:{} as any},__hooks:'',require:()=>({}),finalized,events,draft};
 runInNewContext(service+`
 syncCheckInAttendance=()=>{};
 activities=()=>[{id:'first',endsAt:new Date(${start+10*60000}).toISOString()}];
 rows=()=>[draft];
 finalize=(_app,_attempt,_activity,_now,status)=>finalized.push(status);
 event=()=>events.push('closed');
 module.exports={reconcile};`,box);
 let status='scheduled';
 const c={getString:(key:string)=>key==='status'?status:key==='endsAt'?new Date(end).toISOString():'',set:(_key:string,value:string)=>{status=value;}};
 const app={save:()=>{}};
 box.module.exports.reconcile(app,c,start+20*60000);
 expect(finalized).toEqual([]);expect(status).toBe('scheduled');
 box.module.exports.reconcile(app,c,end);
 expect(finalized).toEqual(['expired']);expect(status).toBe('closed');expect(events).toEqual(['closed']);
});
