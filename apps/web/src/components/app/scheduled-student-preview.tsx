import {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';
import {StudentPreviewNavigation} from './student-classroom-ui';
import {useT} from '@/lib/i18n';
import type {ScheduledAttempt, ScheduledClassState} from '@/lib/scheduled-classes';
import {wibLabel} from '@/lib/scheduled-classes';
import {studentPreview, previewRequest} from '@/lib/scheduled-student-preview';
import {ScheduledClassroom, type ClassroomRequest} from './scheduled-classroom';

type PreviewPhase = 'open' | 'scheduled' | 'closed';
export function ScheduledStudentPreview({state,exitTo,audience}:{state:ScheduledClassState;exitTo:string;audience:string}){
  const t=useT();
  const [toolbar,setToolbar]=useState(false),[index,setIndex]=useState(0),[phase,setPhase]=useState<PreviewPhase>('open');
  const [attempts,setAttempts]=useState<ScheduledAttempt[]>([]),[checkedIn,setCheckedIn]=useState(true),[elapsed,setElapsed]=useState(0),[reset,setReset]=useState(0);
  const [scope]=useState(()=>crypto.randomUUID());
  const top=useRef<HTMLDivElement>(null);
  const selected=Math.min(index,state.activities.length-1);
  useEffect(()=>{setElapsed(0);const timer=setInterval(()=>setElapsed(value=>value+1000),1000);return ()=>clearInterval(timer);},[phase,reset]);
  const simulation=state.activities.length?studentPreview(state,selected):null;
  let now=(simulation?.now||0)+elapsed;
  if(phase==='scheduled')now=Date.parse(state.class!.startsAt)-60000;
  if(phase==='closed')now=Date.parse(state.class!.endsAt)+1000;
  const simulatedState:ScheduledClassState=simulation?{...simulation.state,serverNow:new Date(now).toISOString(),attempts,participant:checkedIn?simulation.state.participant:null,class:{...simulation.state.class!,phase,resultsReady:false}}:state;
  const latest=useRef(simulatedState);latest.current=simulatedState;
  const request=useCallback<ClassroomRequest>(async (_session,action,body={})=>{
    const next=previewRequest(latest.current,action,body);
    latest.current=next;
    setAttempts(next.attempts);setCheckedIn(Boolean(next.participant));
    return next;
  },[]);
  const go=(next:number)=>{setIndex(Math.max(0,Math.min(next,state.activities.length-1)));setPhase('open');requestAnimationFrame(()=>top.current?.scrollIntoView({block:'start',behavior:'instant'}));};
  const restart=()=>{
    // Only this preview's scratch keys are removed; student drafts are untouched.
    try{for(const key of Object.keys(localStorage))if(key.startsWith(`laras:preview:${scope}:`))localStorage.removeItem(key);}catch{/* Storage is optional. */}
    setAttempts([]);setCheckedIn(true);setIndex(0);setPhase('open');setElapsed(0);setReset(value=>value+1);
  };
  useEffect(()=>()=>{try{for(const key of Object.keys(localStorage))if(key.startsWith(`laras:preview:${scope}:`))localStorage.removeItem(key);}catch{/* Storage is optional. */}},[scope]);
  return <div ref={top} className="sc-preview-container">
    <aside className="sc-preview-banner" aria-label={t('scheduledPreview.title')}>
      <strong>{t('scheduledPreview.title')}</strong>
      <div><button type="button" aria-expanded={toolbar} aria-controls="sc-preview-tools" onClick={()=>setToolbar(value=>!value)}>{t(toolbar?'scheduledPreview.hideTools':'scheduledPreview.showTools')}</button><Link to={exitTo}>{t('scheduledPreview.exit')}</Link></div>
    </aside>
    {toolbar&&<section id="sc-preview-tools" className="sc-card sc-fields sc-preview-tools" aria-label={t('scheduledPreview.tools')}>
      <p>{audience}</p><p>{t('scheduledPreview.localOnly')}</p>
      {state.activities.length>0&&<><StudentPreviewNavigation index={selected} total={state.activities.length} onChange={go}/><label>{t('scheduledPreview.activity')}<select value={selected} onChange={e=>go(Number(e.target.value))}>{state.activities.map((a,i)=><option key={a.id} value={i}>{i+1}. {a.title} · {wibLabel(a.startsAt)}</option>)}</select></label></>}
      <label>{t('scheduledPreview.sessionState')}<select value={phase} onChange={e=>setPhase(e.target.value as PreviewPhase)}><option value="open">{t('scheduledPreview.active')}</option><option value="scheduled">{t('scheduledPreview.waiting')}</option><option value="closed">{t('scheduledPreview.closed')}</option></select></label>
      <label className="sc-check"><input type="checkbox" checked={checkedIn} onChange={e=>setCheckedIn(e.target.checked)}/>{t('studentClass.checkedIn')}</label>
      <button type="button" onClick={restart}>{t('scheduledPreview.reset')}</button>
    </section>}
    <header className="sc-heading"><div><small>{t('studentClass.eyebrow')}</small><h1>{state.class?.title||state.session.title||t('studentClass.title')}</h1></div></header>
    {!simulation?<p>{t('scheduledPreview.empty')}</p>:<ScheduledClassroom key={reset} state={simulatedState} now={now} connected onState={()=>{}} preview request={request} previewScope={scope} initialActivityId={state.activities[selected]?.id} onPreviewNext={id=>{const at=state.activities.findIndex(a=>a.id===id);if(at<state.activities.length-1)go(at+1);else setPhase('closed');}}/>}
  </div>;
}
