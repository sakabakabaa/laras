import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { scheduledRequest, wibLabel, type ScheduledClassState } from '@/lib/scheduled-classes';
import { ScheduledClassEditor } from '@/components/app/scheduled-class-editor';
import { ScheduledClassroom } from '@/components/app/scheduled-classroom';
import { ScheduledClassReport } from '@/components/app/scheduled-class-report';
import '@/styles/scheduled-classes.css';

export function meta() { return [{title: 'Kelas terjadwal | LARAS'}]; }
const PHASE_LABELS: Record<string, string> = {draft: 'Draf', scheduled: 'Terjadwal', open: 'Sedang berlangsung', closed: 'Selesai', reviewed: 'Sudah ditinjau', cancelled: 'Dibatalkan'};

export default function ScheduledClassPage() {
  const {courseId = '', sessionId = ''} = useParams();
  const [state, setState] = useState<ScheduledClassState | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [connected, setConnected] = useState(true);
  const [clock, setClock] = useState({server: 0, local: 0}), [elapsed, setElapsed] = useState(0);
  const scope = useRef(sessionId); scope.current = sessionId;
  const lastResponse = useRef(0);
  const accept = useCallback((next: ScheduledClassState) => {
    if (next.session.id !== scope.current) return;
    if (Date.parse(next.serverNow) < lastResponse.current) return;
    lastResponse.current = Date.parse(next.serverNow);
    setState(next); setConnected(true); setClock({server: Date.parse(next.serverNow), local: performance.now()}); setElapsed(0);
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
  return <div className="sc-page">
    <Link className="ld-text-btn" to={`/app/courses/${courseId}/mata-kuliah`}>← Pertemuan</Link>
    <header className="sc-heading"><div><small>KELAS TERJADWAL</small><h1>{state?.class?.title || state?.session.title || 'Kelas terjadwal'}</h1><p>Pembelajaran mandiri pada waktu kelas, dengan kegiatan dan kehadiran tercatat.</p></div>{state?.class && <span className={`sc-badge sc-${state.class.phase}`}>{PHASE_LABELS[state.class.phase]}</span>}</header>
    {error && <div className="sc-alert" role="alert">{error} <button onClick={() => void refresh()}>Muat ulang</button></div>}
    {!connected && <p role="status">Koneksi terputus. Periksa status penyimpanan sebelum meninggalkan halaman.</p>}
    {!state ? <p role="status">Memuat kelas…</p> : state.owner ? <>
      {(!state.class || state.class.status === 'draft') ? <ScheduledClassEditor state={state} onSaved={accept}/> : <>
        <section className="sc-card"><h2>Pelaksanaan otomatis</h2><p>{wibLabel(state.class.startsAt)} — {wibLabel(state.class.endsAt)}</p><p className="sc-prose">{state.class.instructions}</p><p>Jadwal dan jawaban tersimpan di server. Dosen tidak perlu membuka halaman ini selama kelas berlangsung.</p>
          <div className="sc-actions">{['scheduled', 'open'].includes(state.class.phase) && <button disabled={busy} onClick={() => {if (window.confirm('Batalkan kelas ini? Mahasiswa tidak dapat melanjutkan kegiatan.')) void act('cancel');}}>Batalkan kelas</button>}
          {['closed', 'reviewed'].includes(state.class.phase) && !state.class.releaseResults && <button disabled={busy} onClick={() => {if (window.confirm('Terbitkan nilai kuis, kunci, dan pembahasan kepada peserta?')) void act('release');}}>Terbitkan hasil kuis</button>}
          {state.class.phase === 'closed' && <button disabled={busy} onClick={() => void act('review')}>Tandai sudah ditinjau</button>}</div>
        </section>
        <details className="sc-card"><summary>Pratinjau rundown · {state.activities.length} kegiatan</summary>{state.activities.map(a => <article className="sc-preview" key={a.id}><h3>{a.title}</h3><small>{wibLabel(a.startsAt)} — {wibLabel(a.endsAt)}</small><p className="sc-prose">{a.content}</p>{a.url && <a href={a.url} target="_blank" rel="noreferrer">Buka materi ↗</a>}{a.questions?.map(q => <div key={q.id}><p>{q.text}</p><ol type="A">{q.options.map((o, i) => <li key={i}>{o}{i === q.correctIndex ? ' ✓' : ''}</li>)}</ol></div>)}</article>)}</details>
        <ScheduledClassReport state={state} busy={busy} onAction={act}/>
      </>}
    </> : !state.class ? <section className="sc-card"><h2>Belum ada kelas terjadwal</h2><p>Dosen belum menjadwalkan kegiatan untuk pertemuan ini.</p></section> : <ScheduledClassroom state={state} now={now} onState={accept} connected={connected}/>}
  </div>;
}
