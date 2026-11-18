import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import type {ScheduledWorksheet} from '@/lib/scheduled-classes';
vi.mock('@/lib/pocketbase-client',()=>({default:{authStore:{record:{id:'student',language:'en'}}}}));
import {WorksheetAnswers} from '@/components/app/scheduled-worksheet';
const sheet:ScheduledWorksheet={items:[{id:'choice',prompt:'Choose a role.',type:'select',options:['A','P']},{id:'writing',prompt:'Write your reply.',type:'text'}]};
const render=(responses:Record<string,string>)=>renderToStaticMarkup(createElement(WorksheetAnswers,{sheet,responses,onChange:()=>{}}));
describe('scheduled worksheet response feedback',()=>{
 it('counts only valid choices and nonblank writing without exposing completion as grading',()=>{
  expect(render({choice:'invalid',writing:'   '})).toContain('0 of 2 answers filled in');
  const html=render({choice:'P',writing:'Meine Antwort.'});
  expect(html).toContain('2 of 2 answers filled in');
  expect(html).toContain('Meine Antwort.');
  expect(html).not.toContain('correct answer');
 });
 it('preserves the input values and the 2000 character limit',()=>{
  const html=render({writing:'Antwort'});
  expect(html).toContain('maxLength="2000"');
  expect(html).toContain('7 / 2,000 characters');
  expect(html).toContain('>Antwort</textarea>');
 });
 it('prefers explicit source page over legacy 10a/10b/10c fallback and avoids duplicate badge when disabled',async()=>{
  const {activityBookReference}=await import('@/lib/scheduled-book-reference');
  const {WorksheetSource}=await import('@/components/app/scheduled-worksheet');
  const activity={id:'act',title:'10a · Was möchten Herr und Frau Wagner kaufen?',kind:'assignment' as const,required:true,minutes:20,startsAt:'',endsAt:'',lesson:{goal:{de:'x',id:'x'},steps:[],scenes:[],source:{sourceMaterialId:'img1',sourcePage:131,sourceLabel:'Netzwerk neu A1 · Kursbuch S. 131 · Aufgabe 10a'}},sources:[{id:'img1',title:'Kaufhaustafel',version:1,available:true,filename:'tafel.jpg'}],worksheet:{items:[{id:'i1',prompt:'Wählen',type:'select' as const,options:['JA','NEIN']}]}};
  expect(activityBookReference(activity)).toBe('KB (Kursbuch) · 10a · S. 131');
  expect(activityBookReference({...activity,lesson:undefined})).toBe('KB (Kursbuch) · 10a · S. 95');
  const withoutRef=renderToStaticMarkup(createElement(WorksheetAnswers,{activity,sheet:activity.worksheet,responses:{},onChange:()=>{},showBookReference:false}));
  expect(withoutRef).not.toContain('sc-book-reference');
  const pics=renderToStaticMarkup(createElement(WorksheetSource,{activity}));
  expect(pics).toContain('sc-picture-reference');
  expect(pics).toContain('tafel.jpg');
 });
 it('adds a space before inline gap inputs when preceding text segment was trimmed',()=>{
  const gapSheet:ScheduledWorksheet={items:[{id:'g1',prompt:'Gap 1',type:'text'}],blocks:[{id:'b1',type:'gap',segments:[{type:'text',text:{de:'Wo'}},{type:'gap',itemId:'g1'},{type:'text',text:{de:'es Tee?'}}]}]};
  const html=renderToStaticMarkup(createElement(WorksheetAnswers,{sheet:gapSheet,responses:{},onChange:()=>{}}));
  expect(html).toContain('Wo <span class="sc-inline-gap">');
  expect(html).toContain('</span> es Tee?');
 });
});
