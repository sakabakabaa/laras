import {ScheduledLessonEditor} from '@/components/app/scheduled-lesson-editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { scheduledRequest, wibLabel, type ScheduledClassState } from '@/lib/scheduled-classes';
import { ScheduledClassEditor } from '@/components/app/scheduled-class-editor';
import { ScheduledClassroom } from '@/components/app/scheduled-classroom';
import { ScheduledClassReport } from '@/components/app/scheduled-class-report';
import '@/styles/scheduled-classes.css';
import {ScheduledStudentPreview} from '@/components/app/scheduled-student-preview';
import {useCourseSections} from '@/hooks/use-course-sections';
import { useT } from '@/lib/i18n';

export function meta() { return [{title: 'Kelas terjadwal | LARAS'}]; }

export default function ScheduledClassPage() {
  const t = useT();
  const {courseId = '', sessionId = ''} = useParams();
  const [searchParams] = useSearchParams();
  const {sections}=useCourseSections(courseId);
  const preview=searchParams.get('preview')==='student';
  const [state, setState] = useState<ScheduledClassState | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [connected, setConnected] = useState(true);
  const [clock, setClock] = useState({server: 0, local: 0}), [elapsed, setElapsed] = useState(0);
  const scope = useRef(sessionId); scope.current = sessionId;
  const lastResponse = useRef(0);
  const accept = useCallback((next: ScheduledClassState) => {
    if (next.session.id !== scope.current) return;
    if (Date.parse(next.serverNow) < lastResponse.current) return;
    lastResponse.current = Date.parse(next.serverNow);
    setState(next); setConnected(true); setError(''); setClock({server: Date.parse(next.serverNow), local: performance.now()}); setElapsed(0);
  }, []);
  const refresh = useCallback(async () => {
    try { accept(await scheduledRequest(sessionId, 'state')); }
    catch (e) {if (scope.current === sessionId) {setConnected(false); setError((e as Error).message);}}
  }, [sessionId, accept]);
  useEffect(() => {lastResponse.current = 0; setState(null); setError(''); void refresh();}, [refresh]);
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {if (active && document.visibilityState === 'visible') void refresh();}, 30000);
    const resume = () => {if (document.visibilityState === 'visible') void refresh();};
    window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume);
    return () => {active = false; clearInterval(timer); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume);};
  }, [refresh]);
  useEffect(() => {const timer = setInterval(() => setElapsed(performance.now() - clock.local), 1000); return () => clearInterval(timer);}, [clock]);
  const now = clock.server + elapsed;
  const boundary = [state?.class?.startsAt, ...(state?.activities.flatMap(a => [a.startsAt, a.endsAt]) || [])].filter((s): s is string => Boolean(s) && Date.parse(s!) > clock.server).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  useEffect(() => {
    if (!boundary) return;
    const delay = Date.parse(boundary) - clock.server;
    if (delay < 0) return;
    const timer = setTimeout(() => void refresh(), Math.min(delay + 100, 2147483647));
    return () => clearTimeout(timer);
  }, [boundary, clock, refresh]);
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setError('');
    try {accept(await scheduledRequest(sessionId, action, body));}
    catch (e) {setError((e as Error).message);}
    finally {setBusy(false);}
  };
  return <div className={`sc-page${state && !state.owner ? ' sc-student-page' : ''}`}>
    <Link className="ld-text-btn" to={`/app/courses/${courseId}/mata-kuliah`}>← {t('studentClass.back')}</Link>
    <header className="sc-heading"><div><small>{t('studentClass.eyebrow')}</small><h1>{state?.class?.title || state?.session.title || t('studentClass.title')}</h1><p>{t('studentClass.subtitle')}</p></div>{state?.class && <span className={`sc-badge sc-${state.class.phase}`}>{t(`studentClass.${state.class.phase}`)}</span>}</header>
    {state?.owner && state.class && state.class.status!=='draft' && <section className="sc-card"><p>{t('scheduledPreview.audience', {section:sections.find(s=>s.id===state.class?.section)?.name || (state.class.section ? '…' : t('scheduledPreview.allSections'))})}</p><Link className="ld-text-btn" to={preview?'?':'?preview=student'}>{t(preview?'scheduledPreview.back':'scheduledPreview.open')}</Link></section>}
    {error && <div className="sc-alert" role="alert">{error} <button onClick={() => void refresh()}>{t('studentClass.reload')}</button></div>}
    {!connected && <p role="status">{t('studentClass.offline')}</p>}
    {!state ? <p role="status">{t('studentClass.loading')}</p> : state.owner && preview && state.class && state.class.status!=='draft' ? <ScheduledStudentPreview state={state}/> : state.owner ? <>
      {(!state.class || state.class.status === 'draft') ? <ScheduledClassEditor state={state} onSaved={accept} focusAi={searchParams.get('create') === 'ai'}/> : <>
        <section className="sc-card"><h2>Pelaksanaan otomatis</h2><p>{wibLabel(state.class.startsAt)} — {wibLabel(state.class.endsAt)}</p><p className="sc-prose">{state.class.instructions}</p><p>Jadwal dan jawaban tersimpan di server. Dosen tidak perlu membuka halaman ini selama kelas berlangsung.</p>
          <div className="sc-actions">{['scheduled', 'open'].includes(state.class.phase) && <button disabled={busy} onClick={() => {if (window.confirm('Batalkan kelas ini? Mahasiswa tidak dapat melanjutkan kegiatan.')) void act('cancel');}}>Batalkan kelas</button>}
          {['closed', 'reviewed'].includes(state.class.phase) && !state.class.releaseResults && <button disabled={busy} onClick={() => {if (window.confirm('Terbitkan nilai kuis, kunci, dan pembahasan kepada peserta?')) void act('release');}}>Terbitkan hasil kuis</button>}
          {state.class.phase === 'closed' && <button disabled={busy} onClick={() => void act('review')}>Tandai sudah ditinjau</button>}</div>
        </section>
        <details className="sc-card"><summary>Pratinjau rundown · {state.activities.length} kegiatan</summary>{state.activities.map(a => <article className="sc-preview" key={a.id}><h3>{a.title}</h3><small>{wibLabel(a.startsAt)} — {wibLabel(a.endsAt)}</small><p className="sc-prose">{a.content}</p>{a.url && <a href={a.url} target="_blank" rel="noreferrer">Buka materi ↗</a>}{a.worksheet&&<section><p>{a.worksheet.sourceLabel} · PDF {a.worksheet.sourcePage}</p><ol>{a.worksheet.items.map(item=><li key={item.id}><p>{item.prompt}</p>{item.options&&<small>{item.options.join(' / ')}</small>}</li>)}</ol></section>}{a.questions?.map(q => <div key={q.id}><p>{q.text}</p><ol type="A">{q.options.map((o, i) => <li key={i}>{o}{i === q.correctIndex ? ' ✓' : ''}</li>)}</ol></div>)}</article>)}</details>
        <ScheduledLessonEditor state={state} onSaved={accept}/><ScheduledClassReport state={state} busy={busy} onAction={act}/>
      </>}
    </> : !state.class ? <section className="sc-card"><h2>Belum ada kelas terjadwal</h2><p>Dosen belum menjadwalkan kegiatan untuk pertemuan ini.</p></section> : <ScheduledClassroom state={state} now={now} onState={accept} connected={connected}/>}
  </div>;
}
