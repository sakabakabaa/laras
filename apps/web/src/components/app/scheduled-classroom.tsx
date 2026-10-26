import { useEffect, useRef, useState } from 'react';
import pb from '@/lib/pocketbase-client';
import { ACTIVITY_LABELS, scheduledRequest, wibLabel, type ScheduledActivity, type ScheduledAttempt, type ScheduledClassState } from '@/lib/scheduled-classes';

type Answers = Record<string, unknown>;
type PendingSave = {requestId: string; baseRevision: number; answers: Answers; submit: boolean};
function storageKey(classId: string, activityId: string) {return `laras:scheduled:${pb.authStore.record?.id}:${classId}:${activityId}`;}

function ActivityAnswer({activity, attempt, state, now, onState}: {activity: ScheduledActivity; attempt?: ScheduledAttempt; state: ScheduledClassState; now: number; onState: (s: ScheduledClassState) => void}) {
  const initial = attempt?.answers || {};
  const [answers, setAnswers] = useState<Answers>(initial), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(attempt ? 'Jawaban tersimpan di server.' : ''), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const latest = useRef(initial), revision = useRef(attempt?.revision || 0), changed = useRef(false), saving = useRef(false), pending = useRef<PendingSave | null>(null);
  const storage = storageKey(state.class!.id, activity.id);
  const final = Boolean(attempt && attempt.status !== 'draft');
  const open = state.class!.phase === 'open' && now >= Date.parse(activity.startsAt) && now < Date.parse(activity.endsAt);
  const persist = () => {try {localStorage.setItem(storage, JSON.stringify({answers: latest.current, baseRevision: revision.current, pending: pending.current}));} catch {setMessage('Penyimpanan perangkat tidak tersedia. Pastikan jawaban tersimpan di server.');}};
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storage);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.answers && typeof saved.answers === 'object' && !Array.isArray(saved.answers)) {
          latest.current = saved.answers; setAnswers(saved.answers); changed.current = true; setDirty(true);
          if (saved.baseRevision === (attempt?.revision || 0) || saved.pending?.requestId) {
            pending.current = saved.pending || null; setMessage('Jawaban perangkat dipulihkan; menunggu penyimpanan server.');
          } else {setConflict(true); setError('Jawaban server telah berubah. Salin jawaban perangkat bila perlu, lalu muat jawaban server.');}
        }
      }
    } catch {setMessage('Jawaban perangkat tidak dapat dipulihkan.');}
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
    latest.current = {...latest.current, ...patch}; setAnswers(latest.current); changed.current = true; setDirty(true); setError(''); setMessage('Perubahan belum tersimpan di server.'); persist();
  };
  const save = async (submit: boolean) => {
    if (saving.current || conflict || final || (!open && !pending.current)) return;
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
      setMessage(saved?.status === 'draft' ? 'Tersimpan di server.' : 'Jawaban sudah difinalisasi.'); onState(next);
    } catch (e) {
      const msg = (e as Error).message; setError(msg); setMessage('Belum mendapat konfirmasi penyimpanan. Jawaban perangkat tetap disimpan.');
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
    if (!window.confirm('Muat jawaban server? Salin dahulu jawaban perangkat yang ingin dipertahankan.')) return;
    latest.current = attempt?.answers || {}; revision.current = attempt?.revision || 0; pending.current = null; changed.current = false;
    setAnswers(latest.current); setDirty(false); setConflict(false); setError(''); try {localStorage.removeItem(storage);} catch { /* optional local storage */ }
  };
  return <div className="sc-answer">
    {error && <p role="alert" className="sc-alert">{error}</p>}
    {conflict && <button onClick={loadServer}>Muat jawaban server</button>}
    {!open && dirty && <p className="sc-alert">Waktu kegiatan selesai. Hanya jawaban yang sudah diterima server sebelum batas waktu yang dihitung. Salin jawaban perangkat jika perlu disampaikan kepada dosen.</p>}
    <fieldset className="sc-fields" disabled={!open || final || conflict || busy}>
      {activity.kind === 'quiz' ? <ol className="sc-questions">{activity.questions?.map(q => <li key={q.id}><fieldset><legend>{q.text}</legend>{q.options.map((option, index) => <label className="sc-option" key={index}><input type="radio" name={`${activity.id}-${q.id}`} checked={answers[q.id] === index} onChange={() => edit({[q.id]: index})}/><span>{option}</span></label>)}</fieldset></li>)}</ol> : activity.kind === 'material' ? <label className="sc-check"><input type="checkbox" checked={answers.acknowledged === true} onChange={e => edit({acknowledged: e.target.checked})}/>Saya sudah membaca / mempelajari materi ini.</label> : <label>Jawaban Anda<textarea rows={8} maxLength={20000} value={String(answers.text || '')} onChange={e => edit({text: e.target.value})}/></label>}
    </fieldset>
    <p role="status">{busy ? 'Menyimpan…' : final ? attempt?.status === 'expired' ? 'Waktu habis; jawaban terakhir di server difinalisasi.' : 'Jawaban sudah dikumpulkan.' : message}</p>
    {!final && <div className="sc-actions"><button disabled={busy || conflict || (!open && !pending.current)} onClick={() => void save(false)}>Simpan / coba kembali</button><button className="sc-primary" disabled={busy || conflict || !open} onClick={() => {if (window.confirm('Kumpulkan jawaban? Setelah dikumpulkan, jawaban tidak dapat diubah.')) void save(true);}}>Kumpulkan jawaban</button></div>}
    {attempt?.score !== undefined && final && activity.kind === 'quiz' && <section className="sc-result"><h4>Skor kuis: {attempt.score} / 100</h4>{activity.questions?.map(q => <div key={q.id}><p>{q.text}</p><p>Jawaban benar: {q.options[q.correctIndex]}</p>{q.explanation && <p>{q.explanation}</p>}</div>)}</section>}
  </div>;
}

export function ScheduledClassroom({state, now, onState, connected}: {state: ScheduledClassState; now: number; onState: (s: ScheduledClassState) => void; connected: boolean}) {
  const c = state.class!;
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState('');
  const current = state.activities.find(a => now >= Date.parse(a.startsAt) && now < Date.parse(a.endsAt));
  const checkedInAt = state.participant?.checkedInAt;
  const activity = state.activities.find(a => a.id === selected) || current || state.activities.filter(a => now >= Date.parse(a.startsAt)).at(-1);
  useEffect(() => {setSelected('');}, [current?.id]);
  useEffect(() => {
    if (!checkedInAt || c.phase !== 'open') return;
    const timer = setInterval(() => {if (document.visibilityState === 'visible') void scheduledRequest(state.session.id, 'heartbeat').then(onState).catch(() => {});}, 60000);
    return () => clearInterval(timer);
  }, [checkedInAt, c.phase, state.session.id, onState]);
  const join = async () => {
    setBusy(true); setError('');
    try {onState(await scheduledRequest(state.session.id, 'join'));} catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  };
  const seconds = activity ? Math.max(0, Math.ceil((Date.parse(activity.endsAt) - now) / 1000)) : 0;
  const cancelled = c.phase === 'cancelled';
  return <div className="sc-classroom">
    <section className="sc-card"><h2>Petunjuk kelas</h2><p>{wibLabel(c.startsAt)} — {wibLabel(c.endsAt)}</p><p className="sc-prose">{c.instructions}</p>
      {cancelled ? <p role="alert">Kelas dibatalkan oleh dosen. Hubungi dosen untuk kegiatan pengganti.</p> : !state.participant ? <><p>Check-in paling lambat {wibLabel(c.joinUntil)}. Peserta yang masuk terlambat mengikuti sisa waktu kegiatan.</p><button className="sc-primary" disabled={busy || !connected || c.phase !== 'open' || now >= Date.parse(c.joinUntil)} onClick={() => void join()}>{busy ? 'Memproses…' : 'Check-in dan mulai'}</button>{c.phase === 'scheduled' && <p>Kelas akan dibuka otomatis pada waktu mulai.</p>}{c.phase === 'open' && now >= Date.parse(c.joinUntil) && <p>Batas check-in sudah lewat. Hubungi dosen.</p>}</> : <p>Check-in tercatat {wibLabel(state.participant.checkedInAt)}. Kerjakan setiap kegiatan wajib dan periksa konfirmasi penyimpanan.</p>}
      {error && <p role="alert" className="sc-alert">{error}</p>}
    </section>
    <div className="sc-classroom-grid"><aside className="sc-card"><h2>Rundown</h2><ol className="sc-timeline">{state.activities.map(a => {const released = Boolean(state.participant) && now >= Date.parse(a.startsAt) && !cancelled; const attempt = state.attempts.find(t => t.activity === a.id); return <li key={a.id} className={a.id === current?.id ? 'sc-current' : ''}><button disabled={!released} onClick={() => setSelected(a.id)} aria-current={a.id === activity?.id ? 'step' : undefined}>{a.title}</button><span>{ACTIVITY_LABELS[a.kind]} · {a.minutes} menit · {a.required ? 'Wajib' : 'Opsional'}</span><small>{wibLabel(a.startsAt)}</small><small>{attempt && attempt.status !== 'draft' ? attempt.complete ? 'Selesai' : 'Difinalisasi · belum lengkap' : !released ? 'Belum dibuka' : a.id === current?.id ? 'Sedang berlangsung' : 'Waktu pengerjaan selesai'}</small></li>;})}</ol></aside>
      <section className="sc-card">{activity && state.participant && !cancelled && activity.content !== undefined ? <><div className="sc-activity-heading"><div><small>{ACTIVITY_LABELS[activity.kind]}</small><h2>{activity.title}</h2></div><span className="sc-clock" aria-label="Sisa waktu">{seconds ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : 'Ditutup'}</span></div><p className="sc-prose">{activity.content}</p>{activity.url && <a className="sc-material-link" href={activity.url} target="_blank" rel="noreferrer">Buka materi ↗</a>}{activity.sources?.map((source,i)=><p key={i}>{source.available&&source.url?<a href={source.url} target="_blank" rel="noreferrer">{source.title} · v{source.version} ↗</a>:<span>{source.title} · v{source.version} — berkas tidak tersedia; hubungi dosen.</span>}</p>)}{activity.academic&&<p>{[...activity.academic.cpmks,...activity.academic.subCpmks].map(c=>c.code+': '+c.description).join(' · ')}</p>}<ActivityAnswer key={activity.id} activity={activity} attempt={state.attempts.find(t => t.activity === activity.id)} state={state} now={now} onState={onState}/></> : <><h2>{cancelled ? 'Kelas dibatalkan' : ['closed', 'reviewed'].includes(c.phase) ? 'Kelas selesai' : 'Menunggu kegiatan'}</h2><p>{state.participant ? 'Kegiatan muncul otomatis sesuai jadwal.' : 'Lakukan check-in saat kelas dibuka untuk melihat materi dan mengirim jawaban.'}</p></>}</section>
    </div>
  </div>;
}
