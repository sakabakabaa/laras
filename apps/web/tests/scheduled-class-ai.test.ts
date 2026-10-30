import {describe,it,expect} from 'vitest';
import {validateScheduledAiDraft} from '@/lib/scheduled-class-ai';
const quote='Das Verb steht im Hauptsatz an zweiter Stelle.';
const input={minutes:47,quiz:true,sources:[{id:'source',text:quote}],cpmkIds:['outcome'],subCpmkIds:[]};
function draft(){return {title:'Kelas mandiri',instructions:'Ikuti kegiatan.',activities:[
 {kind:'material',title:'Baca',minutes:10,content:'Baca materi.',materialIds:['source'],cpmkIds:['outcome']},
 {kind:'quiz',title:'Kuis',minutes:10,materialIds:['source'],questions:[{text:'Posisi verba?',options:['Kedua','Terakhir'],correctIndex:0,explanation:'Pada posisi kedua.',sourceId:'source',sourceQuote:quote}]},
 {kind:'assignment',title:'Latihan',minutes:10,content:'Tulis contoh.'},
 {kind:'exit_ticket',title:'Refleksi',minutes:5,content:'Apa yang dipelajari?'}]};}
describe('scheduled class AI proposals',()=>{
 it('fits durations exactly and keeps verified evidence and outcome links',()=>{const result=validateScheduledAiDraft(draft(),input);expect(result.activities.reduce((n,a)=>n+a.minutes,0)).toBe(47);expect(result.activities.every(a=>a.minutes>=1)).toBe(true);expect(result.activities[1].questions[0].sourceQuote).toBe(quote);expect(result.activities[0].cpmkIds).toEqual(['outcome']);});
 it('rejects foreign material and outcome IDs',()=>{const d=draft();d.activities[0].materialIds=['foreign'];expect(()=>validateScheduledAiDraft(d,input)).toThrow();d.activities[0].materialIds=['source'];d.activities[0].cpmkIds=['foreign'];expect(()=>validateScheduledAiDraft(d,input)).toThrow();});
 it('rejects fabricated evidence, missing source attachment, and invalid keys',()=>{const d=draft(),q=d.activities[1].questions![0];q.sourceQuote='This quotation was never in the source.';expect(()=>validateScheduledAiDraft(d,input)).toThrow();q.sourceQuote=quote;d.activities[1].materialIds=[];expect(()=>validateScheduledAiDraft(d,input)).toThrow();d.activities[1].materialIds=['source'];q.correctIndex=5;expect(()=>validateScheduledAiDraft(d,input)).toThrow();});
 it('allows RPS-only drafts while refusing unsupported quizzes',()=>{const d=draft();d.activities=d.activities.filter(a=>a.kind!=='quiz');d.activities[0].materialIds=[];expect(validateScheduledAiDraft(d,{...input,quiz:false,sources:[]}).activities).toHaveLength(3);expect(()=>validateScheduledAiDraft(draft(),{...input,quiz:false})).toThrow();});
 it('rejects missing mandatory activities and malformed output',()=>{expect(()=>validateScheduledAiDraft(null,input)).toThrow();const d=draft();d.activities.pop();expect(()=>validateScheduledAiDraft(d,input)).toThrow();});
});
