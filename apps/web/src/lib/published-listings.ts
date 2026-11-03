import {activityTypeOf,type Assignment,type ActivityType} from './assignments';
import type {BuilderRunItem} from './builder-delivery';
import type {Course} from './learning';
import {sessionWorkspacePath,type ScheduledSessionListItem} from './scheduled-session-workspace';
import {isCollectedSubmission,isOfficiallyGraded} from './submission-state';

const timestamp=(value?:string)=>Date.parse(value||'')||0;
export const publicationPath=(run:BuilderRunItem)=>`/app/kegiatan/${encodeURIComponent(run.id)}`;
export const publicationClosed=(run:BuilderRunItem,now=Date.now())=>run.closed||!!timestamp(run.closesAt||run.dueAt)&&timestamp(run.closesAt||run.dueAt)<=now;

export type ClassListing=ScheduledSessionListItem&{key:string;href:string};

export function mergeClassPublications(sessions:ScheduledSessionListItem[],runs:BuilderRunItem[],now=Date.now()):ClassListing[]{
  const regular=sessions.map(session=>({...session,key:`session:${session.id}`,href:sessionWorkspacePath(session.course.id,session.session)}));
  const published=runs.filter(run=>run.kind==='kelas').map((run):ClassListing=>{
    const phase=publicationClosed(run,now)?'closed':timestamp(run.startsAt)>now?'scheduled':'open';
    return {id:run.id,key:`builder:${run.id}`,href:publicationPath(run),session:run.meetingId||'',title:run.title,status:phase==='open'?'scheduled':phase,phase,startsAt:run.startsAt,endsAt:run.dueAt,course:{id:run.courseId||'',title:run.courseTitle,code:run.courseCode||''},section:run.section||'',activityCount:run.activityCount||0,checkedIn:run.checkedIn||0};
  });
  return [...regular,...published].sort((first,second)=>timestamp(second.startsAt)-timestamp(first.startsAt)||first.key.localeCompare(second.key));
}

type TaskMetadata={key:string;title:string;courseId:string;courseTitle:string;courseCode:string;activityType:ActivityType;created:string;href:string};
export type TaskListing=TaskMetadata&({source:'assignment';assignment:Assignment}|{source:'builder';run:BuilderRunItem});

export function mergeTaskPublications(assignments:Assignment[],runs:BuilderRunItem[],courses:Pick<Course,'id'|'title'|'code'>[]):TaskListing[]{
  const regular=assignments.map((assignment):TaskListing=>{
    const course=courses.find(item=>item.id===assignment.course);
    return {source:'assignment',assignment,key:`assignment:${assignment.id}`,title:assignment.title,courseId:assignment.course,courseTitle:course?.title||'',courseCode:course?.code||'',activityType:activityTypeOf(assignment),created:assignment.created,href:`/app/tugas/${assignment.id}`};
  });
  const published=runs.filter(run=>run.kind==='tugas').map((run):TaskListing=>({source:'builder',run,key:`builder:${run.id}`,title:run.title,courseId:run.courseId||'',courseTitle:run.courseTitle,courseCode:run.courseCode||'',activityType:'formal',created:run.created||'',href:publicationPath(run)}));
  return [...regular,...published].sort((first,second)=>timestamp(second.created)-timestamp(first.created)||first.key.localeCompare(second.key));
}

export function filterTaskPublications(items:TaskListing[],{courseId,type,search}:{courseId:string;type:'all'|ActivityType;search:string}){
  const query=search.trim().toLocaleLowerCase('id');
  return items.filter(item=>(courseId==='all'||item.courseId===courseId)&&(type==='all'||item.activityType===type)&&`${item.title} ${item.courseTitle} ${item.courseCode}`.toLocaleLowerCase('id').includes(query));
}

export function taskPublicationTotals(items:TaskListing[],submissions:{assignment:string;status:string}[]){
  let formal=0,formative=0,collected=0,graded=0;
  for(const item of items){
    if(item.activityType==='formative'){formative+=1;continue;}
    formal+=1;
    if(item.source==='builder'){
      collected+=item.run.submittedCount||0;
      graded+=item.run.gradedCount||0;
    }else{
      const rows=submissions.filter(row=>row.assignment===item.assignment.id&&isCollectedSubmission(row));
      collected+=rows.length;
      graded+=rows.filter(isOfficiallyGraded).length;
    }
  }
  return {total:items.length,formal,formative,collected,waiting:Math.max(collected-graded,0)};
}
