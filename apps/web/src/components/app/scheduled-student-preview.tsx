import {useRef,useState} from 'react';
import {StudentPreviewNavigation} from './student-classroom-ui';
import {useT} from '@/lib/i18n';
import type {ScheduledClassState} from '@/lib/scheduled-classes';
import {wibLabel} from '@/lib/scheduled-classes';
import {studentPreview} from '@/lib/scheduled-student-preview';
import {ScheduledClassroom} from './scheduled-classroom';

export function ScheduledStudentPreview({state}:{state:ScheduledClassState}){
  const t=useT(),[index,setIndex]=useState(0),heading=useRef<HTMLHeadingElement>(null),top=useRef<HTMLElement>(null);
  if(!state.activities.length)return <p>{t('scheduledPreview.empty')}</p>;
  const simulation=studentPreview(state,Math.min(index,state.activities.length-1));
  const go=(next:number)=>{setIndex(Math.max(0,Math.min(next,state.activities.length-1)));requestAnimationFrame(()=>{top.current?.scrollIntoView({block:'start',behavior:'instant'});heading.current?.focus({preventScroll:true});});};
  const navigation=()=> <StudentPreviewNavigation index={index} total={state.activities.length} onChange={go}/>;
  return <><section ref={top} className="sc-card sc-fields" style={{scrollMarginTop:100}}><h2 ref={heading} tabIndex={-1}>{t('scheduledPreview.title')}</h2><p>{t('scheduledPreview.hint')}</p>{navigation()}<label>{t('scheduledPreview.activity')}<select aria-label={t('scheduledPreview.activity')} value={index} onChange={e=>go(Number(e.target.value))}>{state.activities.map((a,i)=><option key={a.id} value={i}>{i+1}. {a.title} · {wibLabel(a.startsAt)}</option>)}</select></label></section><ScheduledClassroom key={state.activities[index]?.id} state={simulation.state} now={simulation.now} connected onState={()=>{}} preview onPreviewNext={id=>go(state.activities.findIndex(a=>a.id===id)+1)}/><section className="sc-card">{navigation()}</section></>;
}
