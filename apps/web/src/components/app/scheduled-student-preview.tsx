import {useState} from 'react';
import {useT} from '@/lib/i18n';
import type {ScheduledClassState} from '@/lib/scheduled-classes';
import {wibLabel} from '@/lib/scheduled-classes';
import {studentPreview} from '@/lib/scheduled-student-preview';
import {ScheduledClassroom} from './scheduled-classroom';

export function ScheduledStudentPreview({state}:{state:ScheduledClassState}){
  const t=useT(),[index,setIndex]=useState(0);
  if(!state.activities.length)return <p>{t('scheduledPreview.empty')}</p>;
  const simulation=studentPreview(state,Math.min(index,state.activities.length-1));
  return <><section className="sc-card sc-fields"><h2>{t('scheduledPreview.title')}</h2><p>{t('scheduledPreview.hint')}</p><label>{t('scheduledPreview.activity')}<select aria-label={t('scheduledPreview.activity')} value={index} onChange={e=>setIndex(Number(e.target.value))}>{state.activities.map((a,i)=><option key={a.id} value={i}>{i+1}. {a.title} · {wibLabel(a.startsAt)}</option>)}</select></label></section><ScheduledClassroom key={state.activities[index]?.id} state={simulation.state} now={simulation.now} connected onState={()=>{}} preview/></>;
}
