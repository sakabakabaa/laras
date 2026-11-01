import type {BuilderRunItem} from './builder-delivery';
export type StudentLiveClass={id:string;sessionId:string;courseId:string;courseTitle:string;title:string;startsAt:string;endsAt:string;joinUntil:string;phase:string;checkedIn:boolean};
export type DashboardClass={id:string;title:string;courseTitle:string;startsAt:string;endsAt:string;joinUntil:string;checkedIn:boolean;finished:boolean;href:string;source:'scheduled'|'builder';phase:'live'|'upcoming'};
export function dashboardClasses(scheduled:StudentLiveClass[],runs:BuilderRunItem[],now:number):DashboardClass[]{
 const classes:DashboardClass[]=[
  ...scheduled.map(item=>({id:item.id,title:item.title,courseTitle:item.courseTitle,startsAt:item.startsAt,endsAt:item.endsAt,joinUntil:item.joinUntil,checkedIn:item.checkedIn,finished:false,href:`/app/courses/${item.courseId}/pertemuan/${item.sessionId}/terjadwal`,source:'scheduled' as const})),
  ...runs.filter(item=>item.kind==='kelas'&&!item.closed).map(item=>({id:item.id,title:item.title,courseTitle:item.courseTitle,startsAt:item.startsAt,endsAt:item.dueAt,joinUntil:item.checkInClosesAt||item.dueAt,checkedIn:Boolean(item.startedAt),finished:Boolean(item.submittedAt),href:`/app/kegiatan/${item.id}`,source:'builder' as const})),
 ].filter(item=>Number.isFinite(Date.parse(item.startsAt))&&Number.isFinite(Date.parse(item.endsAt))&&Date.parse(item.endsAt)>now).map(item=>({...item,phase:(Date.parse(item.startsAt)<=now?'live':'upcoming') as 'live'|'upcoming'}));
 return classes.sort((a,b)=>(a.phase==='live'?0:1)-(b.phase==='live'?0:1)||Date.parse(a.startsAt)-Date.parse(b.startsAt));
}
export function orderByDeadline<T extends {deadline:string}>(items:T[]):T[]{
 const time=(item:T)=>{const value=Date.parse(item.deadline);return Number.isFinite(value)?value:Number.POSITIVE_INFINITY;};
 return [...items].sort((a,b)=>time(a)-time(b));
}
