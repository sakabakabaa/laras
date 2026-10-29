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
export function responseCards(activity:ScheduledActivity,attempt:ScheduledAttempt) {
  const responses=(attempt.answers.responses || {}) as Record<string,unknown>;
  const cards=(activity.worksheet?.items||[]).map((item,index)=>({id:item.id,number:index+1,prompt:item.prompt,translation:item.translation,answer:typeof responses[item.id]==='string'?String(responses[item.id]):'',options:item.options}));
  if (!cards.length) cards.push({id:'text',number:1,prompt:activity.content||activity.title,translation:undefined,answer:typeof attempt.answers.text==='string'?attempt.answers.text:'',options:undefined});
  return cards;
}
