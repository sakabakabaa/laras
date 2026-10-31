import type {ScheduledActivity, ScheduledAssessment, ScheduledAttempt, ScheduledClass} from './scheduled-classes';

export const SESSION_PHASE_LABELS: Record<ScheduledClass['phase'], string> = {draft:'Draf',scheduled:'Akan datang',open:'Berlangsung',closed:'Selesai',reviewed:'Sudah ditinjau',cancelled:'Dibatalkan'};
export type SessionTab = 'overview' | 'work' | 'attendance' | 'materials';
export type ScheduledSessionListItem = {id:string;session:string;title:string;status:ScheduledClass['status'];phase:ScheduledClass['phase'];startsAt:string;endsAt:string;course:{id:string;title:string;code:string};section:string;activityCount:number;checkedIn:number};
export function sessionWorkspacePath(courseId:string,sessionId:string) {return `/app/kelas-terjadwal/${encodeURIComponent(courseId)}/${encodeURIComponent(sessionId)}`;}
export function defaultSessionTab(phase?:ScheduledClass['phase']):SessionTab {return !phase || phase==='draft' ? 'materials' : ['closed','reviewed'].includes(phase) ? 'work' : 'overview';}
export function manualActivities(activities:ScheduledActivity[]) {return activities.filter(a=>a.kind==='assignment'||a.kind==='exit_ticket');}
export function assessmentStatus(assessment?:ScheduledAssessment):'unreviewed'|'draft'|'reviewed'|'published' {
  if (!assessment) return 'unreviewed';
  if (assessment.published && assessment.published.publishedRevision === (assessment.revision || 0)-1) return 'published';
  return assessment.status==='reviewed'?'reviewed':'draft';
}
export const ASSESSMENT_LABELS = {unreviewed:'Belum ditinjau',draft:'Draf tersimpan',reviewed:'Siap diterbitkan',published:'Diterbitkan'};
export type ResponseCard = {id:string;number:number;prompt:string;translation?:string;answer:string;options?:string[];expected?:string;correct?:boolean;modelAnswer?:string;rubric?:string};
function keyMatch(key:any, answer:string):{expected?:string;correct?:boolean;modelAnswer?:string;rubric?:string} {
  if (!key) return {};
  if (key.mode==='exact' && Array.isArray(key.accepted)) {
    const expected=key.accepted.map(String).join(' / ');
    if (!answer) return {expected};
    const correct=key.accepted.map(String).some((a:string)=>a.trim().toLowerCase()===answer.trim().toLowerCase());
    return {expected,correct};
  }
  if (key.mode==='reference') return {modelAnswer:key.modelAnswer?String(key.modelAnswer):undefined,rubric:key.rubric?String(key.rubric):undefined};
  return {};
}
export function responseCards(activity:ScheduledActivity,attempt:ScheduledAttempt):ResponseCard[] {
  if(activity.kind==='quiz') return (activity.questions||[]).map((question:any,index:number)=>{const selected=(attempt.answers as any)[question.id];const answer=typeof selected==='number'&&Number.isInteger(selected)?question.options[selected]||'':'';const key=question.correctIndex!=null&&question.options?.[question.correctIndex]!=null?{mode:'exact',accepted:[question.options[question.correctIndex]]}:null;return {id:question.id,number:index+1,prompt:question.text,translation:undefined,answer,options:question.options,...keyMatch(key,answer)};});
  const responses=((attempt.answers as any).responses || {}) as Record<string,unknown>;
  const keyItems:Record<string,any>=(activity as any).worksheet?.answerKey?.items||{};
  const cards:ResponseCard[]=(activity.worksheet?.items||[]).map((item:any,index:number)=>{const answer=typeof responses[item.id]==='string'?String(responses[item.id]):'';return {id:item.id,number:index+1,prompt:item.prompt,translation:item.translation,answer,options:item.options,...keyMatch(keyItems[item.id],answer)};});
  if (!cards.length) cards.push({id:'text',number:1,prompt:activity.content||activity.title,translation:undefined,answer:typeof (attempt.answers as any).text==='string'?(attempt.answers as any).text:'',options:undefined});
  return cards;
}
