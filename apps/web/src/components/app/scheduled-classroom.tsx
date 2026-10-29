import {scheduledAnswerComplete} from '@/lib/scheduled-answer-complete';
import {ScheduledLessonView} from './scheduled-lesson';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, CheckCircle2, Clock3, ExternalLink, FileText, ListChecks, LockKeyhole, MessageSquare, ShieldCheck } from 'lucide-react';
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

  </div>;
}

const activityIcons = {material: BookOpen, quiz: ListChecks, assignment: FileText, exit_ticket: MessageSquare};

function PreviewAnswer({activity,onNext,canNext}:{activity:ScheduledActivity;onNext?:()=>void;canNext:boolean}){
  const t=useT(),[answers,setAnswers]=useState<Answers>({}),[saved,setSaved]=useState(false);
  const edit=(next:Answers)=>{setAnswers(next);setSaved(false);};
  return <div className="sc-answer"><fieldset className="sc-fields">{activity.worksheet?<WorksheetAnswers activity={activity} sheet={activity.worksheet} responses={(answers.responses||{}) as Record<string,string>} onChange={responses=>edit({responses})}/>:activity.kind==='quiz'?<ol className="sc-questions">{activity.questions?.map(q=><li key={q.id}><fieldset><legend>{q.text}</legend>{q.options.map((option,i)=><label className="sc-option" key={i}><input type="radio" name={'preview-'+q.id} checked={answers[q.id]===i} onChange={()=>edit({...answers,[q.id]:i})}/><span>{option}</span></label>)}</fieldset></li>)}</ol>:activity.kind==='material'?<label className="sc-check"><input type="checkbox" checked={answers.acknowledged===true} onChange={e=>edit({acknowledged:e.target.checked})}/>{t('studentClass.acknowledge')}</label>:<label>{t('studentClass.answer')}<textarea rows={8} maxLength={20000} value={String(answers.text||'')} onChange={e=>edit({text:e.target.value})}/></label>}</fieldset>{saved&&<p className="sc-preview-save" role="status">{t('studentClass.previewSaved')}</p>}<div className="sc-answer-footer"><div className="sc-actions"><button onClick={()=>setSaved(true)}>{t('studentClass.saveShort')}</button><button onClick={canNext?onNext:()=>setSaved(true)} className="sc-primary">{t(canNext?'studentClass.nextShort':'studentClass.finishShort')}<ArrowRight size={16} aria-hidden="true"/></button></div></div></div>;
}

function StudentResults({activities,attempts}:{activities:ScheduledActivity[];attempts:ScheduledAttempt[]}){
  const language=useLanguage(),[reviewId,setReviewId]=useState(''),root=useRef<HTMLElement>(null);
  const l=language==='id'?{title:'Hasil belajarmu',done:'Sesi selesai',intro:'Lihat hasil latihanmu. Tulisan akan dinilai setelah ditinjau dosen.',required:'kegiatan wajib selesai',automatic:'Latihan otomatis',writing:'Tulisanmu',pending:'Menunggu ulasan dosen',score:'Nilai',activity:'Kegiatan',review:'Lihat koreksi',viewWriting:'Lihat tulisan',back:'Kembali ke hasil',answer:'Jawabanmu',correct:'Jawaban benar',none:'Belum ada jawaban',good:'Baik',practice:'Terus berlatih',retry:'Perlu latihan',submitted:'Terkumpul',materials:'Materi pembelajaran',complete:'Selesai',missing:'Belum selesai',optional:'opsional',matching:'Mencocokkan',sentence:'Menulis kalimat',gap:'Melengkapi kalimat',legend:'Skala nilai',writingNote:'Tulisan ini tersimpan persis seperti saat dikumpulkan. Penilaian dosen belum tersedia.'}:language==='de'?{title:'Dein Lernrückblick',done:'Unterricht abgeschlossen',intro:'Hier findest du deine Übungsergebnisse. Deine Texte werden von der Lehrkraft geprüft.',required:'Pflichtaktivitäten abgeschlossen',automatic:'Automatisch bewertete Übungen',writing:'Deine Texte',pending:'Bewertung durch die Lehrkraft ausstehend',score:'Punkte',activity:'Aktivität',review:'Antworten ansehen',viewWriting:'Text ansehen',back:'Zurück zu den Ergebnissen',answer:'Deine Antwort',correct:'Richtige Antwort',none:'Keine Antwort',good:'Gut gemacht',practice:'Weiter üben',retry:'Noch einmal üben',submitted:'Abgegeben',materials:'Lernmaterialien',complete:'Abgeschlossen',missing:'Nicht abgeschlossen',optional:'optional',matching:'Zuordnen',sentence:'Sätze schreiben',gap:'Lücken ergänzen',legend:'Punkteskala',writingNote:'Dein Text wurde unverändert gespeichert. Die Bewertung der Lehrkraft steht noch aus.'}:{title:'Your learning recap',done:'Session complete',intro:'Explore your practice results. Your lecturer will review your writing separately.',required:'required activities completed',automatic:'Automatically graded practice',writing:'Your writing',pending:'Awaiting lecturer review',score:'Score',activity:'Activity',review:'Review answers',viewWriting:'View submission',back:'Back to results',answer:'Your answer',correct:'Correct answer',none:'No answer yet',good:'Well done',practice:'Keep practicing',retry:'More practice needed',submitted:'Submitted',materials:'Learning materials',complete:'Complete',missing:'Not completed',optional:'optional',matching:'Matching',sentence:'Sentence writing',gap:'Fill in the gaps',legend:'Score scale',writingNote:'Your writing is saved exactly as submitted. Your lecturer has not graded it yet.'};
  const entries=activities.map((activity,index)=>{
    const attempt=attempts.find(row=>row.activity===activity.id&&row.status!=='draft');
    const graded=activity.kind==='quiz'||Object.values(activity.worksheet?.answerKey?.items||{}).some(entry=>entry.mode==='exact'&&entry.points>0);
    const score=graded&&typeof attempt?.score==='number'?attempt.score:undefined;
    const tone=score===undefined?'neutral':score>=80?'green':score>=60?'yellow':'red';
    const name=activity.title.replace(/^Zusatz\s*·\s*/,'').replace(/\s*\(10a, S\. 103\)$/,'');
    const format=activity.worksheet?.items.every(item=>item.type==='select')||activity.kind==='quiz'?l.matching:activity.worksheet?.items.some(item=>/_{3,}/.test(item.prompt))?l.gap:l.sentence;
    return {activity,index,attempt,graded,score,tone,name,format};
  });
  const required=entries.filter(e=>e.activity.required),completed=required.filter(e=>e.attempt?.complete).length;
  const graded=entries.filter(e=>e.graded),writing=entries.filter(e=>!e.graded&&e.activity.kind!=='material'),materials=entries.filter(e=>e.activity.kind==='material');
  const open=(id:string)=>{setReviewId(id);requestAnimationFrame(()=>root.current?.scrollIntoView({block:'start',behavior:'smooth'}));};
  const selected=entries.find(e=>e.activity.id===reviewId);
  if(selected){
    const {activity,attempt,score,tone,name}=selected,responses=(attempt?.answers.responses||{}) as Record<string,string>;
    return <section className="sc-results-review sc-result-detail" ref={root}>
      <button type="button" className="sc-results-back" onClick={()=>open('')}><ArrowRight size={16} aria-hidden="true"/>{l.back}</button>
      <header className="sc-result-detail-heading"><div><span className="sc-results-eyebrow">{l.activity} {selected.index+1} · {selected.format}</span><h3>{name}</h3></div>{score!==undefined&&<div className={`sc-result-detail-score tone-${tone}`}><span>{l.score}</span><strong>{score}<small> / 100</small></strong></div>}</header>
      {!selected.graded&&<p className="sc-writing-notice"><Clock3 size={18} aria-hidden="true"/>{l.writingNote}</p>}
      <ol className="sc-review-questions">{activity.kind==='quiz'?activity.questions?.map((q,i)=><li key={q.id}><span className="sc-review-question-number">{i+1}</span><div><p className="sc-review-prompt">{q.text}</p><div className="sc-review-answer-pair"><div><span>{l.answer}</span><p>{q.options[Number(attempt?.answers[q.id])]||l.none}</p></div><div className="sc-review-correct"><span>{l.correct}</span><p>{q.options[q.correctIndex]}</p></div></div></div></li>):activity.worksheet?activity.worksheet.items.map((item,i)=>{const key=activity.worksheet?.answerKey?.items[item.id];return <li key={item.id}><span className="sc-review-question-number">{i+1}</span><div><p className="sc-review-prompt" lang="de">{item.prompt}</p><div className={`sc-review-answer-pair ${key?.mode==='exact'?'':'is-writing'}`}><div><span>{l.answer}</span><p className="sc-submitted-text">{responses[item.id]||l.none}</p></div>{key?.mode==='exact'&&<div className="sc-review-correct"><span>{l.correct}</span><p>{key.accepted.join(' / ')}</p></div>}</div></div></li>;}):<li><div className="sc-submitted-text">{String(attempt?.answers.text||l.none)}</div></li>}</ol>
    </section>;
  }
  return <section className="sc-results-review" ref={root} aria-label={l.title}>
    <header className="sc-results-hero"><div><span className="sc-results-eyebrow"><CheckCircle2 size={18} aria-hidden="true"/>{l.done}</span><h3>{l.title}</h3><p>{l.intro}</p></div><div className="sc-results-completed"><strong>{completed}<span> / {required.length}</span></strong><span>{l.required}</span></div></header>
    <div className="sc-results-section-heading"><h4>{l.automatic}</h4><span>{graded.length}</span></div>
    <div className="sc-score-cards">{graded.map(e=><article className={`sc-score-card tone-${e.tone}`} key={e.activity.id}>
      <div className="sc-score-card-meta"><span>{l.activity} {e.index+1}</span><span>{e.format}</span></div>
      <div className="sc-score-card-main"><h5>{e.name}</h5><div className="sc-score-card-number">{e.score!==undefined?<><strong>{e.score}</strong><span>/ 100</span></>:<span>—</span>}</div></div>
      <div className="sc-score-meter" aria-hidden="true"><span style={{width:`${e.score||0}%`}}/></div>
      <footer><span>{e.score===undefined?l.missing:e.tone==='green'?l.good:e.tone==='yellow'?l.practice:l.retry}</span><button type="button" onClick={()=>open(e.activity.id)}>{l.review}<ArrowRight size={15} aria-hidden="true"/></button></footer>
    </article>)}</div>
    {writing.length>0&&<><div className="sc-results-section-heading"><h4>{l.writing}</h4><span>{writing.length}</span></div><div className="sc-writing-cards">{writing.map(e=><article key={e.activity.id}><span className="sc-writing-icon"><FileText size={22} aria-hidden="true"/></span><div><span className="sc-results-eyebrow">{l.activity} {e.index+1}</span><h5>{e.name}</h5><p><Clock3 size={13} aria-hidden="true"/>{e.attempt?l.pending:l.missing}</p></div><button type="button" onClick={()=>open(e.activity.id)} aria-label={`${l.viewWriting}: ${e.name}`}><ArrowRight size={18} aria-hidden="true"/></button></article>)}</div></>}
    {materials.length>0&&<section className="sc-result-materials"><h4>{l.materials}</h4><div>{materials.map(e=><span key={e.activity.id}><CheckCircle2 size={14} aria-hidden="true"/><strong>{e.name.split(' · ')[0]}</strong><span>{e.attempt?.complete?l.complete:`${l.missing}${!e.activity.required?' · '+l.optional:''}`}</span></span>)}</div></section>}
    <p className="sc-result-scale">{l.legend}: <span className="tone-green">≥80</span><span className="tone-yellow">60–&lt;80</span><span className="tone-red">&lt;60</span></p>
  </section>;
}

function ActivityBrief({content}:{content:string}){
  const t=useT(),parts=content.split(/\n\s*\n/).map(part=>part.trim()).filter(Boolean);
  return <section className="sc-activity-brief"><h3>{t('lesson.now')}</h3><ul className="sc-brief-steps">{parts.map((part,index)=><li key={index}><Check size={18} aria-hidden="true"/><span>{part}</span></li>)}</ul></section>;
}

export function ScheduledClassroom({state, now, onState, connected,preview=false,onPreviewNext}: {state: ScheduledClassState; now: number; onState: (s: ScheduledClassState) => void; connected: boolean;preview?:boolean;onPreviewNext?:(activityId:string)=>void}) {
  const t = useT(), language = useLanguage();
  const date = (value: string) => new Date(value).toLocaleString(localeOf(language), {timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short'}) + ' WIB';
  const time = (value: string) => new Date(value).toLocaleTimeString(localeOf(language), {timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit'}) + ' WIB';
  const c = state.class!;
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const current = c.phase === 'open' ? state.activities.find(a => now >= Date.parse(a.startsAt) && now < Date.parse(a.endsAt)) : undefined;
  const next = state.activities.find(a => now < Date.parse(a.startsAt));
  const checkedInAt = state.participant?.checkedInAt;
  const ended = ['closed', 'reviewed'].includes(c.phase);
  const cancelled = c.phase === 'cancelled';
  const activity = state.activities.find(a => a.id === selected) || (!ended ? current : undefined);
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
  const choose = (id: string) => {setSelected(id); requestAnimationFrame(() => {heading.current?.focus({preventScroll: true}); heading.current?.scrollIntoView({block: 'start', behavior: 'instant'});});};
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
    </section>
    {error && <p role="alert" className="sc-alert">{error}</p>}
    <div className="sc-student-grid">
      <section className="sc-card sc-workspace">
        {activity && state.participant && !cancelled && activity.content !== undefined ? <>
          <div className="sc-workspace-top"><span className="sc-activity-type"><ActivityIcon size={16} aria-hidden="true"/>{t(`studentClass.${activity.kind}`)}<span>· {t('studentClass.step', {index: String(state.activities.findIndex(a => a.id === activity.id) + 1), total: String(state.activities.length)})}</span><span className={`sc-requirement ${activity.required ? 'is-required' : ''}`}>{t(activity.required ? 'studentClass.required' : 'studentClass.optional')}</span><span>{t('studentClass.minutes', {count: String(activity.minutes)})}</span></span>{ended ? <button className="sc-text-action" onClick={() => choose('')}>{t('studentClass.backSummary')}</button> : !active && current ? <button className="sc-text-action" onClick={() => choose(current.id)}>{t('studentClass.returnCurrent')}</button> : null}</div>
          <div className="sc-activity-heading"><h2 ref={heading} tabIndex={-1}>{activity.title}</h2><div className={`sc-student-clock ${warning ? 'is-urgent' : ''}`}><span>{t(active ? 'studentClass.remaining' : 'studentClass.timeClosed')}</span><strong>{active ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : '—'}</strong></div></div>
          {warning && <p className="sc-deadline-warning" role="status">{t('studentClass.timeWarning')}</p>}
          {!active && <p className="sc-review-note">{t('studentClass.reviewMode')}</p>}
          <div className="sc-activity-content">{activity.lesson?<ScheduledLessonView key={activity.id} lesson={activity.lesson} compact={!activity.worksheet&&!activity.lesson.scenes?.length} showScenes={!activity.lesson.videos?.length}/>:activity.content?.trim()?<ActivityBrief content={activity.content}/>:null}</div>
          <WorksheetSource activity={activity} showPictures={false}/>
          {(activity.url || Boolean(activity.sources?.some(s=>!s.url||!/\.(jpe?g|png|webp)$/i.test(s.url)))) && <section className="sc-resources"><h3>{t('studentClass.resources')}</h3>{activity.url && <a href={activity.url} target="_blank" rel="noreferrer"><BookOpen size={18} aria-hidden="true"/><span>{t('studentClass.openMaterial')}</span><ExternalLink size={16} aria-hidden="true"/></a>}{activity.sources?.filter(s=>!s.url||!/\.(jpe?g|png|webp)$/i.test(s.url)).map((source, i) => source.available && source.url && /\.(mp3|wav|ogg|m4a)$/i.test(source.url) ? <div className="sc-audio-source" key={i}><label>{source.title.replace(/.*Audio_(\d+)-0*(\d+)$/i,(_,disc,track)=>`Audio ${disc}.${Number(track)}`)}<audio aria-label={source.title} controls preload="none" src={source.url}/></label></div> : source.available && source.url ? <a key={i} href={source.url} target="_blank" rel="noreferrer"><FileText size={18} aria-hidden="true"/><span>{source.title}<small>{t('studentClass.version', {version: String(source.version)})}</small></span><ExternalLink size={16} aria-hidden="true"/></a> : <p key={i}>{source.title} — {t('studentClass.unavailable')}</p>)}</section>}
          {preview?<PreviewAnswer key={activity.id} activity={activity} onNext={()=>onPreviewNext?.(activity.id)} canNext={state.activities.findIndex(a=>a.id===activity.id)<state.activities.length-1}/>:<ActivityAnswer key={activity.id} activity={activity} attempt={state.attempts.find(t => t.activity === activity.id)} state={state} now={now} onState={onState} onNext={nextState=>{const i=nextState.activities.findIndex(a=>a.id===activity.id);choose(nextState.activities[i+1]?.id||activity.id);}}/>}
          {!preview&&state.class?.resultsReady&&<StudentResults activities={state.activities} attempts={state.attempts}/>}
        </> : <div className={`sc-session-empty ${ended&&state.participant&&(c.resultsReady||c.releaseResults)?'sc-session-results':''}`}>
          <div className={`sc-empty-icon ${ended ? 'is-finished' : ''}`}>{cancelled ? <LockKeyhole size={30} aria-hidden="true"/> : ended ? <CheckCircle2 size={30} aria-hidden="true"/> : <Clock3 size={30} aria-hidden="true"/>}</div>
          <h2 ref={heading} tabIndex={-1}>{t(cancelled ? 'studentClass.cancelled' : ended ? 'studentClass.finishedTitle' : c.phase === 'scheduled' ? 'studentClass.waitTitle' : state.participant ? 'studentClass.betweenTitle' : 'studentClass.startTitle')}</h2>
          <p>{t(cancelled ? 'studentClass.cancelBody' : ended ? state.participant ? 'studentClass.finishedBody' : 'studentClass.notJoinedEnd' : c.phase === 'scheduled' ? 'studentClass.waitBody' : state.participant ? 'studentClass.betweenBody' : 'studentClass.startBody')}</p>
          {ended && state.participant && <><div className="sc-completion-count"><strong>{completed}<span> / {required.length}</span></strong><span>{t('studentClass.progress')}</span></div><p className="sc-results-note">{t(state.class?.resultsReady || c.releaseResults ? 'studentClass.resultsReady' : 'studentClass.resultsPending')}</p>{(state.class?.resultsReady||c.releaseResults)&&<StudentResults activities={state.activities} attempts={state.attempts}/>}</>}
          {!cancelled && !ended && !state.participant && <><button className="sc-primary" disabled={busy || !connected || c.phase !== 'open' || joinClosed} onClick={() => void join()}>{t(busy ? 'studentClass.joining' : 'studentClass.checkIn')}<ArrowRight size={17} aria-hidden="true"/></button><small>{joinClosed ? t('studentClass.checkInLate') : t('studentClass.checkInBy', {time: time(c.joinUntil)})}</small></>}
          {!cancelled && !ended && state.participant && next && <p className="sc-next-wait">{t('studentClass.nextAt', {title: next.title, time: time(next.startsAt)})}</p>}
        </div>}
      </section>
    </div>
  </div>;
}

