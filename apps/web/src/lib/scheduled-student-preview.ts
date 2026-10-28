import type {ScheduledActivity,ScheduledClassState} from './scheduled-classes';

export function studentPreview(state:ScheduledClassState,index:number):{state:ScheduledClassState;now:number}{
  if(!state.owner||!state.class)throw Error('Lecturer preview requires an owned scheduled class.');
  const current=state.activities[index];
  if(!current)throw Error('Choose a preview activity.');
  const now=Date.parse(current.startsAt)+1000,c=state.class;
  const activities:ScheduledActivity[]=state.activities.map(a=>{
    const meta={id:a.id,kind:a.kind,title:a.title,minutes:a.minutes,required:a.required,startsAt:a.startsAt,endsAt:a.endsAt};
    if(Date.parse(a.startsAt)>now)return meta;
    return {...meta,content:a.content||'',url:a.url,worksheet:a.worksheet,lesson:a.lesson,
      questions:a.questions?.map(q=>({id:q.id,text:q.text,options:q.options,points:q.points,correctIndex:-1,explanation:''})),
      sources:a.sources?.filter(s=>s.access==='student').map(s=>({id:s.id,title:s.title,version:s.version,available:Boolean(s.filename||s.available),url:s.filename&&s.id?'/hcgi/platform/api/files/file_library/'+s.id+'/'+encodeURIComponent(s.filename):s.url}))};
  });
  return {now,state:{serverNow:new Date(now).toISOString(),owner:false,session:state.session,class:{id:c.id,title:c.title,instructions:c.instructions,section:c.section,startsAt:c.startsAt,endsAt:c.endsAt,joinUntil:c.joinUntil,lateAfterMin:c.lateAfterMin,revision:c.revision,releaseResults:false,status:'scheduled',phase:'open'},activities,participant:{checkedInAt:c.startsAt,lastSeenAt:new Date(now).toISOString()},attempts:[],report:[],events:[]}};
}
