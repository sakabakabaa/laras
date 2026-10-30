import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
const sandbox={module:{exports:{} as any}};
runInNewContext(readFileSync(resolve('../pocketbase/pb_hooks/scheduled-classes-domain.js'),'utf8'),sandbox);
const rules=sandbox.module.exports;
const sheet={sourceMaterialId:'qyde12rb792mnwh',sourcePage:6,sourceLabel:'Seite 95',items:[{id:'match1',prompt:'Ich habe Bauchschmerzen.',type:'select',options:['A','B','C']},{id:'sentence1',prompt:'Jonas: Tee trinken',type:'text'}]};
function plan(worksheet:unknown=sheet){return{title:'Beim Arzt',startsAt:'2026-10-29T06:00:00Z',joinUntil:'2026-10-29T06:20:00Z',lateAfterMin:10,activities:[{kind:'assignment',title:'Übung 10',minutes:210,content:'Bearbeiten Sie alle Aufgaben.',materialIds:['qyde12rb792mnwh'],worksheet}]};}
function activity(){return rules.validatePlan(plan(),0,true).activities[0];}
describe('scheduled structured worksheets',()=>{
  it('preserves the selected source page and strips unreviewed keys or hidden fields',()=>{
    const a=rules.validatePlan(plan({...sheet,correctAnswers:{match1:'A'},items:sheet.items.map(i=>({...i,correctIndex:0}))}),0,true).activities[0];
    expect(a.snapshot.worksheet.sourcePage).toBe(6);expect(a.snapshot.worksheet.correctAnswers).toBeUndefined();expect(a.snapshot.worksheet.items[0].correctIndex).toBeUndefined();expect(a.minutes).toBe(210);
  });
  it('rejects foreign references, invalid pages, duplicate IDs and injected selections',()=>{
    for(const worksheet of[{...sheet,sourceMaterialId:'foreignsource01'},{...sheet,sourcePage:0},{...sheet,items:[sheet.items[0],sheet.items[0]]},{...sheet,items:[{...sheet.items[0],options:['A','A']}]}])expect(()=>rules.validatePlan(plan(worksheet),0,true)).toThrow();
    expect(()=>rules.cleanAnswers(activity(),{responses:{match1:'D'}})).toThrow();expect(()=>rules.cleanAnswers(activity(),{responses:[]})).toThrow();
  });
  it('autosaves partial responses, requires every item, and derives readable report text',()=>{
    const a=activity(),partial=rules.cleanAnswers(a,{responses:{match1:'A'},text:'Pretend everything is complete',correctIndex:0});
    expect(rules.result(a,partial).complete).toBe(false);expect(partial.text).not.toContain('Pretend');
    const complete=rules.cleanAnswers(a,{responses:{match1:'A',sentence1:'Du musst Tee trinken.',unknown:'injected'}});
    expect(rules.result(a,complete)).toEqual({complete:true});expect(complete.text).toContain('Jonas: Tee trinken\nDu musst Tee trinken.');expect(complete.responses.unknown).toBeUndefined();
  });
  it('counts completed required worksheets for attendance and excludes breaks',()=>{
    const a={...activity(),id:'worksheet01'},activities=[a,{id:'break01',required:false}];
    expect(rules.attendance({startsAt:'2026-10-29T06:00:00Z',lateAfterMin:10},{checkedInAt:'2026-10-29T06:01:00Z'},activities,[{activity:a.id,status:'submitted',complete:true}])).toMatchObject({suggestion:'present',completed:1,total:1});
  });
});
