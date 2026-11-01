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

export type DashboardCalendarEvent={id:string;title:string;detail:string;date:string;href:string;kind:'class'|'work'};
/** Day keys use the same Jakarta calendar as LARAS class schedules. */
export function jakartaDay(value:number|string){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=(type:string)=>parts.find(p=>p.type===type)?.value||'';
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export function dashboardWeek(now:number,classes:DashboardClass[],work:{id:string;title:string;course:string;deadline:string;href:string}[]){
 const start=jakartaDay(now);const anchor=Date.parse(`${start}T12:00:00Z`);
 const days=Array.from({length:7},(_,i)=>new Date(anchor+i*86400000).toISOString().slice(0,10));
 const events:DashboardCalendarEvent[]=[...classes.map(c=>({id:`${c.source}:${c.id}`,title:c.title,detail:c.courseTitle,date:c.startsAt,href:c.href,kind:'class' as const})),...work.filter(w=>Boolean(w.deadline)).map(w=>({id:`work:${w.id}`,title:w.title,detail:w.course,date:w.deadline,href:w.href,kind:'work' as const}))].filter(e=>days.includes(jakartaDay(e.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 return {days,events};
}
