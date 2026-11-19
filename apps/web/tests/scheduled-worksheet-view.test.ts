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
 it('splits dialog speaker turns onto separate lines, highlights filled gaps, and adds 12d placeholder',()=>{
  const sheet2:ScheduledWorksheet={
   items:[
    {id:'g1',prompt:'Dialog A · Lücke 1: ...',type:'text'},
    {id:'g2',prompt:'Dialog A · Lücke 2: ...',type:'text'},
    {id:'w1',prompt:'Schreiben Sie einen Text über Ihre Stadt. (Ich lebe in …)',type:'text'},
   ],
   blocks:[
    {id:'p1',type:'passage',prompt:{de:'Ergänzen Sie die Verben (1–8).'},sections:[{id:'s1',segments:[{type:'text',text:{de:'— Wo '}},{type:'gap',itemId:'g1'},{type:'text',text:{de:' es Tee? — Tee '}},{type:'gap',itemId:'g2'},{type:'text',text:{de:' wir im UG.'}}]}]},
    {id:'wblock',type:'writing',itemId:'w1',responseLength:'extended',rows:10},
   ],
  };
  const html=renderToStaticMarkup(createElement(WorksheetAnswers,{sheet:sheet2,responses:{g1:'gibt'},onChange:()=>{}}));
  expect(html).toContain('class="sc-worksheet-lead"');
  expect(html).toContain('Ergänzen Sie die Verben (1–8).');
  expect(html).toContain('class="sc-gap-section">Dialog A</strong><p lang="de">— Wo ');
  expect(html).toContain('</p><p lang="de">— Tee ');
  expect(html).toContain('class="sc-gap-input is-filled"');
  expect(html).toContain('placeholder="Ich lebe in ..."');
 });
 it('suppresses duplicate Orientierungstafel and Produkte images in Kaufhaus matching while keeping Tipp images',async()=>{
  const {WorksheetSource}=await import('@/components/app/scheduled-worksheet');
  const kaufhausAct={
   id:'kact',title:'10b–10c · Im Kaufhaus',kind:'assignment' as const,required:true,minutes:20,startsAt:'',endsAt:'',
   sources:[
    {id:'t1',title:'Im Kaufhaus · Orientierungstafel (Stockwerke)',version:1,available:true,filename:'im_kaufhaus_tafel_1.jpg'},
    {id:'p1',title:'Im Kaufhaus · Produkte (10a)',version:1,available:true,filename:'im_kaufhaus_produkte_1.jpg'},
    {id:'tip1',title:'Im Kaufhaus · Informationen auf Tafeln verstehen',version:1,available:true,filename:'im_kaufhaus_tipp_1.jpg'},
   ],
   worksheet:{
    items:[{id:'m1',prompt:'1. der Kugelschreiber',type:'select' as const,options:['EG','UG']}],
    blocks:[{id:'mb',type:'match' as const,cardItemIds:['m1'],layout:'destinations-above' as const,destinations:[{id:'EG',label:'EG',title:{de:'Erdgeschoss'}},{id:'UG',label:'UG',title:{de:'Untergeschoss'}}]}],
   },
  };
  const html=renderToStaticMarkup(createElement(WorksheetSource,{activity:kaufhausAct}));
  expect(html).not.toContain('im_kaufhaus_tafel_1.jpg');
  expect(html).not.toContain('im_kaufhaus_produkte_1.jpg');
  expect(html).toContain('im_kaufhaus_tipp_1.jpg');
  const hidden=renderToStaticMarkup(createElement(WorksheetSource,{activity:kaufhausAct,showPictures:false}));
  expect(hidden).toBe('');
 });
});
