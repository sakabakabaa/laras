import type { QuizQuestionEditable } from './task-types';
import type { ActivityKind } from './scheduled-classes';

export type ScheduledSource = {id:string;title:string;version:number;access:string;aiReady:boolean;sessionIds:string[];url?:string};
export type ScheduledOutcome = {id:string;code:string;description:string};
export type ScheduledAcademicContext = {
  course:{id:string;title:string};
  session:{id:string;title:string;topic:string;learningIndicator:string;learningMaterial:string;assessmentMethod:string;duration:string;references:string;cpmkIds:string[];subCpmkIds:string[]};
  cpmks:ScheduledOutcome[];subCpmks:ScheduledOutcome[];materials:ScheduledSource[];
  lessonPlan?:{title:string;objective:string;activities:{title:string;minutes:number;instructions:string;studentActivity?:string}[]}|null;
};
export type AiScheduledActivity = {kind:ActivityKind;title:string;minutes:number;required:boolean;content:string;url:string;questions:(QuizQuestionEditable&{sourceId?:string;sourceQuote?:string})[];materialIds:string[];cpmkIds:string[];subCpmkIds:string[]};
export type ScheduledAiDraft = {title:string;instructions:string;activities:AiScheduledActivity[];notes:string[]};
export type ScheduledAiProposal = {draft:ScheduledAiDraft;sources:{id:string;title:string;version:number}[];model:string;generatedAt:string;bundleId:string};
type Evidence={id:string;text:string};
const fail=(message:string):never=>{throw new Error(message);};
const text=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
const allowedIds=(value:unknown,allowed:Set<string>,label:string):string[]=>{
 if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!allowed.has(id)))return fail(`${label} pada draf AI tidak cocok dengan pilihan dosen.`);
 return [...new Set(value as string[])];
};
/** Validate model output before it can reach the lecturer's editable proposal. */
export function validateScheduledAiDraft(raw:unknown,input:{minutes:number;quiz:boolean;sources:Evidence[];cpmkIds:string[];subCpmkIds:string[]}):ScheduledAiDraft {
 const r=raw as Record<string,unknown>;
 if(!r||!text(r.title,200)||!text(r.instructions,10000)||!Array.isArray(r.activities)||r.activities.length<3||r.activities.length>8||r.activities.length>input.minutes)fail('Draf AI belum lengkap. Coba kembali.');
 const sourceIds=new Set(input.sources.map(s=>s.id)),cpmkIds=new Set(input.cpmkIds),subIds=new Set(input.subCpmkIds);
 const activities=(r.activities as unknown[]).map((value:unknown,index:number):AiScheduledActivity=>{
  const a=value as Record<string,unknown>;
  if(!a||!['material','quiz','assignment','exit_ticket'].includes(String(a.kind))||!text(a.title,200)||!Number.isInteger(a.minutes)||Number(a.minutes)<1||Number(a.minutes)>600)fail('Kegiatan AI tidak valid. Coba kembali.');
  const materialIds=allowedIds(a.materialIds||[],sourceIds,'Materi'),mappedCpmks=allowedIds(a.cpmkIds||[],cpmkIds,'CPMK'),mappedSubs=allowedIds(a.subCpmkIds||[],subIds,'Sub-CPMK');
  let questions:AiScheduledActivity['questions']=[];
  if(a.kind==='quiz'){
   if(!input.quiz||!Array.isArray(a.questions)||!a.questions.length||a.questions.length>10)fail('Kuis AI memerlukan sumber yang disetujui dan 1–10 soal.');
   questions=(a.questions as unknown[]).map((value:unknown,i:number)=>{
    const q=value as Record<string,unknown>,options=Array.isArray(q?.options)?q.options.map(o=>text(o,500)):[];
    if(!q||!text(q.text,2000)||options.length<2||options.length>6||options.some(o=>!o)||!Number.isInteger(q.correctIndex)||Number(q.correctIndex)<0||Number(q.correctIndex)>=options.length||!text(q.explanation,2000))fail('Tinjau soal, pilihan, kunci, dan pembahasan AI.');
    const sourceId=String(q.sourceId||''),sourceQuote=text(q.sourceQuote,2000),source=input.sources.find(s=>s.id===sourceId);
    if(!source||!materialIds.includes(sourceId)||sourceQuote.length<15||!source.text.includes(sourceQuote))fail('Rujukan soal AI tidak dapat diverifikasi pada materi terpilih. Coba kembali.');
    return {id:`ai-${index}-${i}`,text:text(q.text,2000),options,correctIndex:Number(q.correctIndex),points:1,explanation:text(q.explanation,2000),sourceId,sourceQuote};
   });
  }else if(!text(a.content,20000))fail('Instruksi kegiatan AI belum lengkap.');
  return {kind:a.kind as ActivityKind,title:text(a.title,200),minutes:Number(a.minutes),required:true,content:text(a.content,20000),url:'',questions,materialIds,cpmkIds:mappedCpmks,subCpmkIds:mappedSubs};
 });
 for(const kind of ['material','assignment','exit_ticket'])if(!activities.some(a=>a.kind===kind))fail('Draf harus berisi materi, tugas, dan refleksi akhir.');
 if(input.quiz&&!activities.some(a=>a.kind==='quiz'))fail('Draf belum memuat kuis yang diminta.');
 // Fit the requested duration exactly, retaining at least one minute per step.
 const weight=activities.reduce((sum,a)=>sum+a.minutes,0),remaining=input.minutes-activities.length;
 const fractions=activities.map((a,index)=>{const share=remaining*a.minutes/weight;return {index,fraction:share-Math.floor(share),minutes:1+Math.floor(share)};});
 let extra=input.minutes-fractions.reduce((sum,a)=>sum+a.minutes,0);
 for(const a of [...fractions].sort((a,b)=>b.fraction-a.fraction||a.index-b.index)){if(extra--<=0)break;a.minutes++;}
 for(const a of fractions)activities[a.index].minutes=a.minutes;
 return {title:text(r.title,200),instructions:text(r.instructions,10000),activities,notes:Array.isArray(r.notes)?r.notes.map(n=>text(n,500)).filter(Boolean).slice(0,8):[]};
}
