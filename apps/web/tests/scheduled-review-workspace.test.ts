import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {ScheduledReviewWorkspace} from '../src/components/app/scheduled-review-workspace';

const state:any={owner:true,session:{id:'session'},class:{id:'class',phase:'closed',revision:4},activities:[{id:'a',kind:'assignment',title:'Worksheet',minutes:10,required:true,startsAt:'',endsAt:'',worksheet:{items:[{id:'i',prompt:'Prompt',type:'text'}]}}],attempts:[{id:'attempt',activity:'a',student:'s',answers:{responses:{i:'My response'}},revision:2,status:'submitted',complete:true}],report:[{student:'s',name:'Student',nim:'1',attempts:[]}],gradingSettings:[{id:"settings",activity:"a",revision:1,mode:"points",maxPoints:10,criteria:[]}],assessments:[],events:[],serverNow:''};
it('renders student response and provides manual review actions',()=>{const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state,onAction:async()=>{}}));expect(html).toContain('My response');expect(html).toContain('Simpan draf');expect(html).toContain('Ditinjau');});

const keyed:any={...state,activities:[{...state.activities[0],worksheet:{items:[{id:'i',prompt:'Haben Sie Schmerzen?',type:'select',options:['A','P']}],answerKey:{version:1,items:{i:{mode:'exact',accepted:['A'],points:1}}}}}],attempts:[{...state.attempts[0],answers:{responses:{i:'P'}},score:0}]};
it('marks a wrong answer, shows the accepted key and keeps the server score visible',()=>{const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:keyed,onAction:async()=>{}}));expect(html).toContain('Salah');expect(html).toContain('Diterima');expect(html).toContain('Otomatis · kunci');expect(html).toContain('sr-response-list');});
it('expands only the selected activity and keeps other responses collapsed',()=>{
 const multiple={...state,activities:[state.activities[0],{...state.activities[0],id:'b',title:'Second worksheet'}],attempts:[state.attempts[0],{...state.attempts[0],id:'attempt-b',activity:'b',answers:{responses:{i:'Second response'}}}]};
 const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:multiple,onAction:async()=>{},initialSelection:{student:'s',activity:'b'}}));
 expect(html).toContain('aria-expanded="false" aria-controls="review-response-a review-assessment-a"');
 expect(html).toContain('id="review-response-a" class="sr-activity-response" hidden=""');
 expect(html).toContain('aria-expanded="true" aria-controls="review-response-b review-assessment-b"');
 expect(html).toContain('id="review-response-b" class="sr-activity-response"><');
 expect(html).toContain('id="review-assessment-a" hidden=""');expect(html).toContain('Second response');
});
