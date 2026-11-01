import {scheduledAnswerComplete} from './scheduled-answer-complete';
import type {ScheduledActivity,ScheduledClassState,ScheduledAttempt} from './scheduled-classes';

export function studentPreview(state:ScheduledClassState,index:number):{state:ScheduledClassState;now:number}{
  if(!state.owner||!state.class)throw Error('Lecturer preview requires an owned scheduled class.');
  const current=state.activities[index];
  if(!current)throw Error('Choose a preview activity.');
  const now=Date.parse(state.class.startsAt)+1000,c=state.class;
  const activities:ScheduledActivity[]=state.activities.map(a=>{
    const meta={id:a.id,kind:a.kind,title:a.title,minutes:a.minutes,required:a.required,startsAt:a.startsAt,endsAt:a.endsAt};

    return {...meta,content:a.content||'',url:a.url,worksheet:a.worksheet?{...a.worksheet,answerKey:undefined}:undefined,lesson:a.lesson,
      questions:a.questions?.map(q=>({id:q.id,text:q.text,options:q.options,points:q.points,correctIndex:-1,explanation:''})),
      sources:a.sources?.filter(s=>s.access==='student').map(s=>({id:s.id,title:s.title,version:s.version,available:Boolean(s.filename||s.available),url:s.filename&&s.id?'/hcgi/platform/api/files/file_library/'+s.id+'/'+encodeURIComponent(s.filename):s.url}))};
  });
  return {now,state:{serverNow:new Date(now).toISOString(),owner:false,session:state.session,class:{id:c.id,title:c.title,instructions:c.instructions,section:c.section,startsAt:c.startsAt,endsAt:c.endsAt,joinUntil:c.joinUntil,lateAfterMin:c.lateAfterMin,revision:c.revision,releaseResults:false,status:'scheduled',phase:'open'},activities,participant:{checkedInAt:c.startsAt,lastSeenAt:new Date(now).toISOString()},attempts:[],report:[],events:[]}};
}

/** In-memory student transport. Never calls PocketBase or copies real attempts. */
export function previewRequest(state:ScheduledClassState,action:string,body:Record<string,unknown>={}):ScheduledClassState{
  if(state.owner||!state.class)throw new Error('An isolated student preview is required.');
  if(action==='state'||action==='heartbeat')return state;
  if(action==='join')return {...state,participant:{checkedInAt:state.serverNow,lastSeenAt:state.serverNow}};
  if(action!=='saveAnswer'&&action!=='submit')throw new Error('Unsupported preview action.');
  const activity=state.activities.find(a=>a.id===body.activityId);
  if(!activity||!state.participant||state.class.phase!=='open')throw new Error('Preview activity is not open.');
  const now=Date.parse(state.serverNow);
  if(now<Date.parse(state.class.startsAt)||now>=Date.parse(state.class.endsAt))throw new Error('Preview activity is not open.');
  const prior=state.attempts.find(a=>a.activity===activity.id);
  if(prior&&prior.status!=='draft')return state;
  if(Number(body.baseRevision)!==(prior?.revision||0))throw new Error('Jawaban berubah. Muat ulang pratinjau.');
  const answers=structuredClone(body.answers as Record<string,unknown>);
  const submitted=action==='submit';
  if(submitted&&!scheduledAnswerComplete(activity,answers))throw new Error('Lengkapi semua jawaban wajib terlebih dahulu.');
  const attempt:ScheduledAttempt={id:prior?.id||`preview-${activity.id}`,activity:activity.id,student:'preview',answers,revision:(prior?.revision||0)+1,status:submitted?'submitted':'draft',savedAt:state.serverNow,finalizedAt:submitted?state.serverNow:'',complete:submitted};
  return {...state,attempts:[...state.attempts.filter(a=>a.activity!==activity.id),attempt]};
}
