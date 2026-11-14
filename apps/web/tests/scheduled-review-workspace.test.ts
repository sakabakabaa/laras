import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {ScheduledReviewWorkspace} from '../src/components/app/scheduled-review-workspace';

const state:any={owner:true,session:{id:'session'},class:{id:'class',phase:'closed',revision:4},activities:[{id:'a',kind:'assignment',title:'Worksheet',minutes:10,required:true,startsAt:'',endsAt:'',worksheet:{items:[{id:'i',prompt:'Prompt',type:'text'}]}}],attempts:[{id:'attempt',activity:'a',student:'s',answers:{responses:{i:'My response'}},revision:2,status:'submitted',complete:true}],report:[{student:'s',name:'Student',nim:'1',attempts:[]}],gradingSettings:[{id:"settings",activity:"a",revision:1,mode:"points",maxPoints:10,criteria:[]}],assessments:[],events:[],serverNow:''};
it('renders student response and provides manual review actions',()=>{const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state,onAction:async()=>{}}));expect(html).toContain('My response');expect(html).toContain('Simpan draf');expect(html).toContain('Simpan &amp; berikutnya');expect(html).toContain('evx-panel');expect(html).not.toContain('aria-label="Tandai penilaian sudah ditinjau"');});

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
it('shows student feedback separately in lecturer exit-ticket review',()=>{
 const feedbackState={...state,activities:[{...state.activities[0],kind:'exit_ticket'}],attempts:[{...state.attempts[0],answers:{responses:{i:'My reflection'},feedback:'More speaking practice, please.'}}]};
 const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:feedbackState,onAction:async()=>{}}));
 expect(html).toContain('Masukan untuk pembelajaran');expect(html).toContain('More speaking practice, please.');expect(html).toContain('Masukan mahasiswa · tidak dinilai');expect(html).toContain('My reflection');
});
it('puts written work first and folds auto-graded work into one summary line, hiding the donuts by default',()=>{
 const combined={...state,activities:[keyed.activities[0],{...state.activities[0],id:'essay',title:'Email writing'}],attempts:[keyed.attempts[0],{...state.attempts[0],id:'essay-attempt',activity:'essay'}],gradingSettings:[{...state.gradingSettings[0],activity:'essay'}]};
 const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:combined,onAction:async()=>{},initialSelection:{student:'s',activity:'essay'}}));
 expect(html).toContain('class="sr-auto-summary"');
 expect(html).toContain('Dinilai otomatis');
 expect(html).toContain('Lihat rincian');
 expect(html).not.toContain('class="sr-donut-grid"');
 expect(html.indexOf('sr-written-identity')).toBeLessThan(html.indexOf('data-activity-id="a"'));
 expect(html).toContain('id="review-activity-a" data-activity-id="a" hidden=""');
 expect(html).toContain('evx-script sr-written-script');
 expect(html).toContain('NIM 1');
 expect(html).toContain('Simpan draf');
 expect(html).toContain('Draf AI belum dibuat untuk jawaban ini');
 expect(html).toContain('Minta draf AI');
 expect(html).toContain('Jalankan AI untuk semua (1)');
});
it('offers one-click grading presets when a written activity has no grading setup yet',()=>{
 const combined={...state,activities:[{...state.activities[0],id:'essay',title:'Email writing'}],attempts:[{...state.attempts[0],id:'essay-attempt',activity:'essay'}],gradingSettings:[],assessments:[]};
 const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:combined as any,onAction:async()=>{},initialSelection:{student:'s',activity:'essay'}}));
 // Grading is not blocked behind setup: 0–100 is used until a rubric is chosen.
 expect(html).toContain('Nilai 0–100');
 expect(html).toContain('Umpan balik saja');
 expect(html).toContain('Atur rubrik…');
 expect(html).toContain('aria-label="Nilai jawaban"');
 expect(html).not.toContain('Atur cara menilai');
 expect(html).not.toContain('Kejelasan');
});
it('opens exact-answer details for a directly linked activity',()=>{
 const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:keyed,onAction:async()=>{},initialSelection:{student:'s',activity:'a'}}));
 expect(html).toContain('class="sr-exact-toggle" aria-expanded="true"');
 expect(html).toContain('id="review-activity-a" data-activity-id="a" class=');
 expect(html).toContain('Setujui nilai otomatis');
 expect(html).toContain('Tandai benar');
});
it('shows stored AI drafts in the roster and starts the grading panel from them',()=>{
 const withAi={...state,gradingSettings:[{id:'settings',activity:'a',revision:1,mode:'rubric',maxPoints:10,criteria:[{id:'g',label:'Grammatik',maxPoints:10}]}],aiDrafts:[{attempt:'attempt',activity:'a',status:'ready',attemptRevision:2,settingsRevision:1,draft:{suggestedScore:85,criterionScores:{g:85},feedback:'Gut gemacht.'}}]};
 const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:withAi,onAction:async()=>{}}));
 expect(html).toContain('<em>AI 85</em>');
 expect(html).toContain('Siap disetujui');
 expect(html).toContain('Draf AI siap ditinjau');
 expect(html).toContain('Gunakan saran AI');
 expect(html).toContain('Jalankan AI untuk semua (0)');
});
it('puts the "Selesaikan kelas" checklist on the review header',()=>{
 const reviewed={...state,assessments:[{attempt:'attempt',activity:'a',points:8,maxPoints:10,status:'reviewed',revision:1,attemptRevision:2,settingsRevision:1}]};
 const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:reviewed,onAction:async()=>{}}));
 expect(html).toContain('Selesaikan kelas');
 expect(html).toContain('Terbitkan yang siap (1)');
 expect(html).toContain('Siap diterbitkan');
});
it('surfaces auto-scored items that need attention without opening the details',()=>{
 const combined={...state,activities:[keyed.activities[0],{...state.activities[0],id:'essay',title:'Email writing'}],attempts:[keyed.attempts[0],{...state.attempts[0],id:'essay-attempt',activity:'essay'}],gradingSettings:[{...state.gradingSettings[0],activity:'essay'}]};
 const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state:combined,onAction:async()=>{},initialSelection:{student:'s',activity:'essay'}}));
 expect(html).toContain('sr-auto-attention');
 expect(html).toContain('0/100 · 1 salah · nilai rendah');
 expect(html).toContain('1 perlu disetujui');
 expect(html).toContain('Lihat rincian');
});
