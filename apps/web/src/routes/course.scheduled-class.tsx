import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { scheduledRequest, type ScheduledClassState } from '@/lib/scheduled-classes';
import { ScheduledClassroom } from '@/components/app/scheduled-classroom';
import '@/styles/scheduled-session-workspace.css';
import '@/styles/scheduled-classes.css';
import '@/styles/scheduled-student-workspace.css';
import {ScheduledStudentPreview} from '@/components/app/scheduled-student-preview';
import {useCourseSections} from '@/hooks/use-course-sections';
import { useT } from '@/lib/i18n';
import {ScheduledLecturerSession} from '@/components/app/scheduled-lecturer-session';

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
  const actOrThrow = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true); setError('');
    try {accept(await scheduledRequest(sessionId, action, body));}
    catch (e) {setError((e as Error).message); throw e;}
    finally {setBusy(false);}
  };
  if(state?.owner && !preview) return <>
    {error && <div className="sc-alert" role="alert">{error}<button onClick={()=>void refresh()}>Muat ulang</button></div>}
    {!connected && <p role="status">Koneksi terputus. Menghubungkan kembali...</p>}
    <ScheduledLecturerSession state={state} courseId={courseId} busy={busy} onAction={actOrThrow} onState={accept}/>
  </>;
  return <div className="sc-page sc-student-page">
    <Link className="ld-text-btn" to={state?.owner?'?':`/app/courses/${courseId}/mata-kuliah`}>← {state?.owner?'Kembali ke ruang dosen':t('studentClass.back')}</Link>
    <header className="sc-heading"><div><small>{t('studentClass.eyebrow')}</small><h1>{state?.class?.title || state?.session.title || t('studentClass.title')}</h1></div></header>
    {state?.owner && state.class && <p>{t('scheduledPreview.audience', {section:sections.find(s=>s.id===state.class?.section)?.name || t('scheduledPreview.allSections')})}</p>}
    {error && <div className="sc-alert" role="alert">{error} <button onClick={() => void refresh()}>{t('studentClass.reload')}</button></div>}
    {!connected && <p role="status">{t('studentClass.offline')}</p>}
    {!state ? <p role="status">{t('studentClass.loading')}</p> : state.owner && preview && state.class ? <ScheduledStudentPreview state={state}/> : !state.class ? <section className="sc-card"><h2>Belum ada kelas terjadwal</h2><p>Dosen belum menjadwalkan kegiatan untuk pertemuan ini.</p></section> : <ScheduledClassroom state={state} now={now} onState={accept} connected={connected}/>}
  </div>;
}
