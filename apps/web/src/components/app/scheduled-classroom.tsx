import {scheduledAnswerComplete} from '@/lib/scheduled-answer-complete';
import {ScheduledLessonView} from './scheduled-lesson';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, Clock3, ExternalLink, FileText, ListChecks, LockKeyhole, MessageSquare, ShieldCheck } from 'lucide-react';
import { localeOf, useLanguage, useT } from '@/lib/i18n';
import pb from '@/lib/pocketbase-client';
import { scheduledRequest, type ScheduledActivity, type ScheduledAttempt, type ScheduledClassState } from '@/lib/scheduled-classes';

import {WorksheetAnswers,WorksheetSource} from './scheduled-worksheet';

type Answers = Record<string, unknown>;
type PendingSave = {requestId: string; baseRevision: number; answers: Answers; submit: boolean};
function storageKey(classId: string, activityId: string) {return `laras:scheduled:${pb.authStore.record?.id}:${classId}:${activityId}`;}

function ActivityAnswer({activity, attempt, state, now, onState,onNext}: {activity: ScheduledActivity; attempt?: ScheduledAttempt; state: ScheduledClassState; now: number; onState: (s: ScheduledClassState) => void;onNext:(s:ScheduledClassState)=>void}) {
  const t = useT();
  const initial = attempt?.answers || {};
  const [answers, setAnswers] = useState<Answers>(initial), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(attempt ? t('studentClass.saved') : ''), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const latest = useRef(initial), revision = useRef(attempt?.revision || 0), changed = useRef(false), saving = useRef(false), pending = useRef<PendingSave | null>(null);
  const storage = storageKey(state.class!.id, activity.id);
  const final = Boolean(attempt && attempt.status !== 'draft');
  const open = state.class!.phase === 'open' && now >= Date.parse(activity.startsAt) && now < Date.parse(activity.endsAt);
  const persist = () => {try {localStorage.setItem(storage, JSON.stringify({answers: latest.current, baseRevision: revision.current, pending: pending.current}));} catch {setMessage(t('studentClass.localUnavailable'));}};
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storage);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.answers && typeof saved.answers === 'object' && !Array.isArray(saved.answers)) {
          latest.current = saved.answers; setAnswers(saved.answers); changed.current = true; setDirty(true);
          if (saved.baseRevision === (attempt?.revision || 0) || saved.pending?.requestId) {
            pending.current = saved.pending || null; setMessage(t('studentClass.restored'));
          } else {setConflict(true); setError(t('studentClass.conflict'));}
        }
      }
    } catch {setMessage(t('studentClass.restoreFailed'));}
    // Each activity is mounted with its own key; background refreshes must not
    // overwrite local edits or reset an in-flight request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);
  useEffect(() => {
    if (!changed.current && !saving.current && attempt) {revision.current = attempt.revision; latest.current = attempt.answers; setAnswers(attempt.answers);}
  }, [attempt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {e.preventDefault(); e.returnValue = '';};
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const edit = (patch: Answers) => {
    latest.current = {...latest.current, ...patch}; setAnswers(latest.current); changed.current = true; setDirty(true); setError(''); setMessage(t('studentClass.unsaved')); persist();
  };
  const save = async (submit: boolean) => {
    if (saving.current || conflict || final || (!open && !pending.current)) return;
    if(submit&&!scheduledAnswerComplete(activity,latest.current)){setError(t('studentClass.completeFirst'));return;}
    saving.current = true; setBusy(true); setError('');
    let request = pending.current || {requestId: crypto.randomUUID(), baseRevision: revision.current, answers: {...latest.current}, submit};
    pending.current = request; persist();
    try {
      let next = await scheduledRequest(state.session.id, request.submit ? 'submit' : 'saveAnswer', {activityId: activity.id, ...request});
      let saved = next.attempts.find(a => a.activity === activity.id);
      if (saved) revision.current = saved.revision;
      if (submit && !request.submit && saved?.status === 'draft') {
        request = {requestId: crypto.randomUUID(), baseRevision: revision.current, answers: {...latest.current}, submit: true};
        pending.current = request; persist();
        next = await scheduledRequest(state.session.id, 'submit', {activityId: activity.id, ...request});
        saved = next.attempts.find(a => a.activity === activity.id);
        if (saved) revision.current = saved.revision;
      }
      pending.current = null;
      const same = JSON.stringify(latest.current) === JSON.stringify(request.answers);
      if (same || saved?.status !== 'draft') {
        changed.current = false; setDirty(false);
        try {localStorage.removeItem(storage);} catch { /* Server copy is authoritative. */ }
      } else persist();
      setMessage(saved?.status === 'draft' ? t('studentClass.saved') : t('studentClass.submitted')); onState(next);if(submit&&saved&&saved.status!=='draft')onNext(next);
    } catch (e) {
      const msg = (e as Error).message; setError(msg); setMessage(t('studentClass.unconfirmed'));
      if (/tab lain|Jawaban berubah/.test(msg)) {
        setConflict(true); pending.current = null; persist();
        // Refresh the authoritative revision, while retaining local edits until
        // the student explicitly chooses the server copy.
        try {onState(await scheduledRequest(state.session.id, 'state'));} catch { /* Retry remains available. */ }
      }
    } finally {saving.current = false; setBusy(false);}
  };
  useEffect(() => {
    if (!dirty || !open || conflict || final) return;
    const timer = setTimeout(() => void save(false), 8000);
    return () => clearTimeout(timer);
    // Use the latest answer refs inside save; the debounce restarts on edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, dirty, open, conflict, final, busy]);
  const loadServer = () => {
    if (!window.confirm(t('studentClass.confirmLoad'))) return;
    latest.current = attempt?.answers || {}; revision.current = attempt?.revision || 0; pending.current = null; changed.current = false;
    setAnswers(latest.current); setDirty(false); setConflict(false); setError(''); try {localStorage.removeItem(storage);} catch { /* optional local storage */ }
  };
  return <div className="sc-answer">
    {error && <p role="alert" className="sc-alert">{error}</p>}
    {conflict && <button onClick={loadServer}>{t('studentClass.loadServer')}</button>}
    {!open && dirty && <p className="sc-alert">{t('studentClass.deadline')}</p>}
    {activity.kind === 'quiz' && <p className="sc-answer-count">{t('studentClass.questions', {answered: String(activity.questions?.filter(q => Number.isInteger(answers[q.id])).length || 0), total: String(activity.questions?.length || 0)})}</p>}
    <fieldset className="sc-fields" disabled={!open || final || conflict || busy}>
      {activity.kind === 'quiz' ? <ol className="sc-questions">{activity.questions?.map((q, questionIndex) => <li key={q.id}><fieldset><legend><span className="sc-question-number">{t('studentClass.question', {number: String(questionIndex + 1)})}</span>{q.text}</legend>{q.options.map((option, index) => <label className="sc-option" key={index}><input type="radio" name={`${activity.id}-${q.id}`} checked={answers[q.id] === index} onChange={() => edit({[q.id]: index})}/><span>{option}</span></label>)}</fieldset></li>)}</ol> : activity.kind === 'material' ? <label className="sc-check"><input type="checkbox" checked={answers.acknowledged === true} onChange={e => edit({acknowledged: e.target.checked})}/>{t('studentClass.acknowledge')}</label> : activity.worksheet ? <WorksheetAnswers activity={activity} sheet={activity.worksheet} responses={(answers.responses||{}) as Record<string,string>} onChange={responses=>edit({responses})}/> : <label>{t('studentClass.answer')}<textarea placeholder={t('studentClass.answerHint')} rows={8} maxLength={20000} value={String(answers.text || '')} onChange={e => edit({text: e.target.value})}/><span className="sc-character-count">{t('studentClass.characters', {count: String(String(answers.text || '').length)})}</span></label>}
    </fieldset>
    <div className={`sc-save-status ${dirty ? 'is-pending' : final || attempt ? 'is-saved' : ''}`} role="status"><ShieldCheck size={17} aria-hidden="true"/><span>{busy ? t('studentClass.saving') : final ? attempt?.status === 'expired' ? t('studentClass.expired') : t('studentClass.submitted') : message || t('studentClass.initial')}</span></div>
    {!final && <div className="sc-answer-footer"><p>{t(state.activities.at(-1)?.id === activity.id ? 'studentClass.finishHint' : 'studentClass.nextHint')}</p><div className="sc-actions"><button disabled={busy || conflict || (!open && !pending.current)} onClick={() => void save(false)}>{t('studentClass.saveShort')}</button><button className="sc-primary" disabled={busy || conflict || !open} onClick={() => void save(true)}>{t(state.activities.at(-1)?.id === activity.id ? 'studentClass.finishShort' : 'studentClass.nextShort')}<ArrowRight size={16} aria-hidden="true"/></button></div></div>}
    {attempt?.score !== undefined && final && activity.kind === 'quiz' && <section className="sc-result"><h4>{t('studentClass.score')}: {attempt.score} / 100</h4>{activity.questions?.map(q => <div key={q.id}><p>{q.text}</p><p>{t('studentClass.correct')}: {q.options[q.correctIndex]}</p>{q.explanation && <p>{q.explanation}</p>}</div>)}</section>}
  </div>;
}

const activityIcons = {material: BookOpen, quiz: ListChecks, assignment: FileText, exit_ticket: MessageSquare};

function PreviewAnswer({activity,onNext,canNext}:{activity:ScheduledActivity;onNext?:()=>void;canNext:boolean}){
  const t=useT(),[answers,setAnswers]=useState<Answers>({}),[saved,setSaved]=useState(false);
  const edit=(next:Answers)=>{setAnswers(next);setSaved(false);};
  return <div className="sc-answer"><fieldset className="sc-fields">{activity.worksheet?<WorksheetAnswers activity={activity} sheet={activity.worksheet} responses={(answers.responses||{}) as Record<string,string>} onChange={responses=>edit({responses})}/>:activity.kind==='quiz'?<ol className="sc-questions">{activity.questions?.map(q=><li key={q.id}><fieldset><legend>{q.text}</legend>{q.options.map((option,i)=><label className="sc-option" key={i}><input type="radio" name={'preview-'+q.id} checked={answers[q.id]===i} onChange={()=>edit({...answers,[q.id]:i})}/><span>{option}</span></label>)}</fieldset></li>)}</ol>:activity.kind==='material'?<label className="sc-check"><input type="checkbox" checked={answers.acknowledged===true} onChange={e=>edit({acknowledged:e.target.checked})}/>{t('studentClass.acknowledge')}</label>:<label>{t('studentClass.answer')}<textarea rows={8} maxLength={20000} value={String(answers.text||'')} onChange={e=>edit({text:e.target.value})}/></label>}</fieldset>{saved&&<p className="sc-preview-save" role="status">{t('studentClass.previewSaved')}</p>}<div className="sc-answer-footer"><div className="sc-actions"><button onClick={()=>setSaved(true)}>{t('studentClass.saveShort')}</button><button onClick={canNext?onNext:()=>setSaved(true)} className="sc-primary">{t(canNext?'studentClass.nextShort':'studentClass.finishShort')}<ArrowRight size={16} aria-hidden="true"/></button></div></div></div>;
}

export function ScheduledClassroom({state, now, onState, connected,preview=false,onPreviewNext}: {state: ScheduledClassState; now: number; onState: (s: ScheduledClassState) => void; connected: boolean;preview?:boolean;onPreviewNext?:(activityId:string)=>void}) {
  const t = useT(), language = useLanguage();
  const date = (value: string) => new Date(value).toLocaleString(localeOf(language), {timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short'}) + ' WIB';
  const time = (value: string) => new Date(value).toLocaleTimeString(localeOf(language), {timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit'}) + ' WIB';
  const c = state.class!;
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const plan = useRef<HTMLDetailsElement>(null);
  const agendaList = useRef<HTMLOListElement>(null);
  const revealSelected = useCallback(() => {const row=agendaList.current?.querySelector<HTMLElement>('.is-selected');if(agendaList.current&&row)agendaList.current.scrollTop=Math.max(0,row.offsetTop-8);}, []);
  useEffect(() => {if (plan.current && window.matchMedia('(max-width: 1100px)').matches) plan.current.open = false;}, []);
  const current = c.phase === 'open' ? state.activities.find(a => now >= Date.parse(a.startsAt) && now < Date.parse(a.endsAt)) : undefined;
  const next = state.activities.find(a => now < Date.parse(a.startsAt));
  const checkedInAt = state.participant?.checkedInAt;
  const ended = ['closed', 'reviewed'].includes(c.phase);
  const cancelled = c.phase === 'cancelled';
  const activity = state.activities.find(a => a.id === selected) || (!ended ? current : undefined);
  useEffect(() => {revealSelected();}, [activity?.id,revealSelected]);
  const required = state.activities.filter(a=>a.required);
  const completed = required.filter(a => state.attempts.some(attempt => attempt.activity === a.id && attempt.status !== 'draft' && attempt.complete)).length;
  const percent = required.length ? Math.round(completed / required.length * 100) : 0;
  useEffect(() => {setSelected('');}, [current?.id]);
  useEffect(() => {
    if (preview || !checkedInAt || c.phase !== 'open') return;
    const timer = setInterval(() => {if (document.visibilityState === 'visible') void scheduledRequest(state.session.id, 'heartbeat').then(onState).catch(() => {});}, 60000);
    return () => clearInterval(timer);
  }, [checkedInAt, c.phase, state.session.id, onState,preview]);
  const join = async () => {
    setBusy(true); setError('');
    try {onState(await scheduledRequest(state.session.id, 'join'));} catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  };
  const choose = (id: string) => {setSelected(id); if(plan.current&&window.matchMedia('(max-width: 1100px)').matches)plan.current.open=false; requestAnimationFrame(() => {heading.current?.focus({preventScroll: true}); heading.current?.scrollIntoView({block: 'start', behavior: 'instant'});});};
  const seconds = activity ? Math.max(0, Math.ceil((Date.parse(activity.endsAt) - now) / 1000)) : 0;
  const active = activity?.id === current?.id && Boolean(current);
  const warning = active && seconds > 0 && seconds <= 60;
  const joinClosed = now >= Date.parse(c.joinUntil);
  const ActivityIcon = activity ? activityIcons[activity.kind] : BookOpen;
  return <div className="sc-classroom sc-student">
    <section className="sc-student-overview sc-card" aria-label={t('studentClass.progress')}>
      <div className="sc-overview-top"><div className="sc-session-time"><Clock3 size={18} aria-hidden="true"/><div><span>{t('studentClass.schedule')}</span><strong>{date(c.startsAt)} — {time(c.endsAt)}</strong></div></div><span className={`sc-checkin-badge ${checkedInAt ? 'is-checked' : ''}`}><CheckCircle2 size={16} aria-hidden="true"/>{t(checkedInAt ? 'studentClass.checkedIn' : 'studentClass.notCheckedIn')}{checkedInAt && <small>{time(checkedInAt)}</small>}</span></div>
      <div className="sc-progress-heading"><span>{t('studentClass.progressRequired')}</span><strong>{completed}<span> / {required.length}</span></strong></div>
      <progress className="sc-progress" value={completed} max={required.length || 1} aria-label={t('studentClass.progressRequired')}>{percent}%</progress>
      <p className="sc-progress-hint">{t('studentClass.progressHint', {total: String(state.activities.length), required: String(required.length)})}</p>
      {c.instructions && <details className="sc-student-instructions"><summary>{t('studentClass.instructions')}</summary><p className="sc-prose">{c.instructions}</p></details>}
    </section>
    {error && <p role="alert" className="sc-alert">{error}</p>}
    <div className="sc-student-grid">
      <section className="sc-card sc-workspace">
        {activity && state.participant && !cancelled && activity.content !== undefined ? <>
          <div className="sc-workspace-top"><span className="sc-activity-type"><ActivityIcon size={16} aria-hidden="true"/>{t(`studentClass.${activity.kind}`)}<span>· {t('studentClass.step', {index: String(state.activities.findIndex(a => a.id === activity.id) + 1), total: String(state.activities.length)})}</span><span className={`sc-requirement ${activity.required ? 'is-required' : ''}`}>{t(activity.required ? 'studentClass.required' : 'studentClass.optional')}</span><span>{t('studentClass.minutes', {count: String(activity.minutes)})}</span></span>{ended ? <button className="sc-text-action" onClick={() => choose('')}>{t('studentClass.backSummary')}</button> : !active && current ? <button className="sc-text-action" onClick={() => choose(current.id)}>{t('studentClass.returnCurrent')}</button> : null}</div>
          <div className="sc-activity-heading"><h2 ref={heading} tabIndex={-1}>{activity.title}</h2><div className={`sc-student-clock ${warning ? 'is-urgent' : ''}`}><span>{t(active ? 'studentClass.remaining' : 'studentClass.timeClosed')}</span><strong>{active ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : '—'}</strong></div></div>
          {warning && <p className="sc-deadline-warning" role="status">{t('studentClass.timeWarning')}</p>}
          {!active && <p className="sc-review-note">{t('studentClass.reviewMode')}</p>}
          <div className="sc-activity-content">{activity.lesson?<ScheduledLessonView key={activity.id} lesson={activity.lesson} compact={!activity.worksheet&&!activity.lesson.scenes?.length}/>:activity.content?.trim()?<section className="sc-activity-brief"><h3>{t('lesson.now')}</h3><div className="sc-prose">{activity.content}</div></section>:null}</div>
          <WorksheetSource activity={activity}/>
          {(activity.url || Boolean(activity.sources?.some(s=>!s.url||!/\.(jpe?g|png|webp)$/i.test(s.url)))) && <section className="sc-resources"><h3>{t('studentClass.resources')}</h3>{activity.url && <a href={activity.url} target="_blank" rel="noreferrer"><BookOpen size={18} aria-hidden="true"/><span>{t('studentClass.openMaterial')}</span><ExternalLink size={16} aria-hidden="true"/></a>}{activity.sources?.filter(s=>!s.url||!/\.(jpe?g|png|webp)$/i.test(s.url)).map((source, i) => source.available && source.url && /\.(mp3|wav|ogg|m4a)$/i.test(source.url) ? <div className="sc-audio-source" key={i}><label>{source.title.replace(/.*Audio_(\d+)-0*(\d+)$/i,(_,disc,track)=>`Audio ${disc}.${Number(track)}`)}<audio aria-label={source.title} controls preload="none" src={source.url}/></label></div> : source.available && source.url ? <a key={i} href={source.url} target="_blank" rel="noreferrer"><FileText size={18} aria-hidden="true"/><span>{source.title}<small>{t('studentClass.version', {version: String(source.version)})}</small></span><ExternalLink size={16} aria-hidden="true"/></a> : <p key={i}>{source.title} — {t('studentClass.unavailable')}</p>)}</section>}
          {preview?<PreviewAnswer key={activity.id} activity={activity} onNext={()=>onPreviewNext?.(activity.id)} canNext={state.activities.findIndex(a=>a.id===activity.id)<state.activities.length-1}/>:<ActivityAnswer key={activity.id} activity={activity} attempt={state.attempts.find(t => t.activity === activity.id)} state={state} now={now} onState={onState} onNext={nextState=>{const i=nextState.activities.findIndex(a=>a.id===activity.id);choose(nextState.activities[i+1]?.id||activity.id);}}/>}
          {!ended && next && <div className="sc-up-next"><span>{t('studentClass.next')}</span><strong>{t('studentClass.nextAt', {title: next.title, time: time(next.startsAt)})}</strong></div>}
        </> : <div className="sc-session-empty">
          <div className={`sc-empty-icon ${ended ? 'is-finished' : ''}`}>{cancelled ? <LockKeyhole size={30} aria-hidden="true"/> : ended ? <CheckCircle2 size={30} aria-hidden="true"/> : <Clock3 size={30} aria-hidden="true"/>}</div>
          <h2 ref={heading} tabIndex={-1}>{t(cancelled ? 'studentClass.cancelled' : ended ? 'studentClass.finishedTitle' : c.phase === 'scheduled' ? 'studentClass.waitTitle' : state.participant ? 'studentClass.betweenTitle' : 'studentClass.startTitle')}</h2>
          <p>{t(cancelled ? 'studentClass.cancelBody' : ended ? state.participant ? 'studentClass.finishedBody' : 'studentClass.notJoinedEnd' : c.phase === 'scheduled' ? 'studentClass.waitBody' : state.participant ? 'studentClass.betweenBody' : 'studentClass.startBody')}</p>
          {ended && state.participant && <><div className="sc-completion-count"><strong>{completed}<span> / {required.length}</span></strong><span>{t('studentClass.progress')}</span></div><p className="sc-results-note">{t(c.releaseResults ? 'studentClass.resultsReady' : 'studentClass.resultsPending')}</p></>}
          {!cancelled && !ended && !state.participant && <><button className="sc-primary" disabled={busy || !connected || c.phase !== 'open' || joinClosed} onClick={() => void join()}>{t(busy ? 'studentClass.joining' : 'studentClass.checkIn')}<ArrowRight size={17} aria-hidden="true"/></button><small>{joinClosed ? t('studentClass.checkInLate') : t('studentClass.checkInBy', {time: time(c.joinUntil)})}</small></>}
          {!cancelled && !ended && state.participant && next && <p className="sc-next-wait">{t('studentClass.nextAt', {title: next.title, time: time(next.startsAt)})}</p>}
        </div>}
      </section>
      <aside className="sc-card sc-activity-plan" aria-label={t('studentClass.plan')}>
        <details ref={plan} open onToggle={e=>{if(e.currentTarget.open)revealSelected();}}>
          <summary className="sc-plan-heading"><h2>{t('studentClass.plan')}</h2><span>{state.activities.length}</span><ChevronDown size={18} aria-hidden="true"/></summary>
          <ol ref={agendaList} className="sc-student-timeline">{state.activities.map((a, index) => {
            const released = Boolean(state.participant) && now >= Date.parse(a.startsAt) && !cancelled;
            const attempt = state.attempts.find(t => t.activity === a.id);
            const done = attempt && attempt.status !== 'draft';
            const status = done ? attempt.complete ? 'complete' : 'incomplete' : !released ? 'locked' : a.id === current?.id ? 'active' : 'ended';
            return <li key={a.id} className={`${a.id === activity?.id ? 'is-selected' : ''} is-${status}`}>
              <button disabled={!released} onClick={() => choose(a.id)} aria-current={a.id === activity?.id ? 'step' : undefined}>
                <span className="sc-step-number">{status === 'complete' ? <Check size={16} aria-hidden="true"/> : index + 1}</span>
                <span className="sc-step-copy"><strong>{a.title}</strong>
                  <span className="sc-step-meta">{t(`studentClass.${a.kind}`)} · {t('studentClass.minutes', {count: String(a.minutes)})} · {time(a.startsAt)}</span>
                  <span className="sc-step-tags"><span className={`sc-requirement ${a.required ? 'is-required' : ''}`}>{t(a.required ? 'studentClass.required' : 'studentClass.optional')}</span><span className={`sc-step-status ${status}`}>{!released && <LockKeyhole size={12} aria-hidden="true"/>}{t(`studentClass.${status}`)}</span></span>
                </span>
              </button>
            </li>;
          })}</ol>
        </details>
      </aside>
    </div>
  </div>;
}
