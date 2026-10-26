import { useEffect, useState } from 'react';
import { ACTIVITY_LABELS, fromWibInput, scheduledRequest, toWibInput, wibLabel, type ActivityKind, type ScheduledClassState } from '@/lib/scheduled-classes';
import { DEFAULT_QUIZ_CONFIG, type QuizQuestionEditable } from '@/lib/task-types';
import { QuizBuilder } from '@/components/app/task-builders/quiz-builder';
import { useCourseSections } from '@/hooks/use-course-sections';
import {AcademicChoices,ScheduledClassAiPanel} from './scheduled-class-ai-panel';
import type {ScheduledAcademicContext} from '@/lib/scheduled-class-ai';

type DraftActivity = {key: string; kind: ActivityKind; title: string; minutes: number; required: boolean; content: string; url: string; questions: QuizQuestionEditable[];materialIds:string[];cpmkIds:string[];subCpmkIds:string[]};
function blankActivity(kind: ActivityKind): DraftActivity {return {key: crypto.randomUUID(), kind, title: ACTIVITY_LABELS[kind], minutes: kind === 'exit_ticket' ? 5 : 15, required: true, content: '', url: '', questions: [],materialIds:[],cpmkIds:[],subCpmkIds:[]};}

export function ScheduledClassEditor({state, onSaved}: {state: ScheduledClassState; onSaved: (s: ScheduledClassState) => void}) {
  const c = state.class;
  const [academic,setAcademic]=useState<ScheduledAcademicContext|null>(null);
  const [title, setTitle] = useState(c?.title || state.session.title);
  const [instructions, setInstructions] = useState(c?.instructions || 'Ikuti kegiatan sesuai jadwal. Jawaban harus tersimpan sebelum waktu kegiatan berakhir. Jika mengalami kendala, catat masalahnya dan hubungi dosen.');
  const [start, setStart] = useState(toWibInput(c?.startsAt || new Date(Date.parse(state.serverNow) + 86400000).toISOString()));
  const [joinUntil, setJoinUntil] = useState(toWibInput(c?.joinUntil || new Date(Date.parse(state.serverNow) + 86400000 + 15 * 60000).toISOString()));
  const [lateAfterMin, setLateAfterMin] = useState(c?.lateAfterMin ?? 10);
  const [section, setSection] = useState(c?.section || state.session.section || '');
  const [revision, setRevision] = useState(c?.revision || 0);
  const [activities, setActivities] = useState<DraftActivity[]>(() => state.activities.length ? state.activities.map(a => ({key: a.id, kind: a.kind, title: a.title, minutes: a.minutes, required: a.required, content: a.content || '', url: a.url || '', questions: a.questions || [],materialIds:a.materialIds||[],cpmkIds:a.cpmkIds||[],subCpmkIds:a.subCpmkIds||[]})) : [blankActivity('material'), blankActivity('quiz'), blankActivity('exit_ticket')]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [dirty, setDirty] = useState(false), [preview, setPreview] = useState(false);
  const {sections} = useCourseSections(state.session.course);
  const minutes = activities.reduce((sum, a) => sum + (Number(a.minutes) || 0), 0);
  const remoteChanged = (state.class?.revision || 0) !== revision;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {e.preventDefault(); e.returnValue = '';};
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const changeActivity = (index: number, patch: Partial<DraftActivity>) => {setActivities(rows => rows.map((a, i) => i === index ? {...a, ...patch} : a)); setDirty(true); setNotice('');};
  const move = (index: number, delta: number) => {setActivities(rows => {const next = [...rows]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next;}); setDirty(true);};
  const save = async (publish: boolean) => {
    if (publish && !window.confirm('Jadwalkan kelas? Isi kegiatan akan dikunci dan kelas berjalan otomatis sesuai waktu WIB.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await scheduledRequest(state.session.id, publish ? 'schedule' : 'savePlan', {baseRevision: revision, title, instructions, section, startsAt: fromWibInput(start), joinUntil: fromWibInput(joinUntil), lateAfterMin, activities});
      setRevision(next.class!.revision); setDirty(false); onSaved(next); setNotice('Draf tersimpan.');
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  };
  return <div className="sc-builder">
    {remoteChanged && <p role="alert" className="sc-alert">Draf berubah di tempat lain. Salin perubahan Anda dan muat ulang halaman sebelum menyimpan.</p>}
    {error && <p role="alert" className="sc-alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <fieldset disabled={busy || remoteChanged} className="sc-fields">
      <ScheduledClassAiPanel sessionId={state.session.id} onContext={setAcademic} onApply={draft=>{if(!window.confirm('Ganti judul, instruksi, dan seluruh kegiatan editor dengan usulan AI? Perubahan yang belum tersimpan akan diganti.'))return;setTitle(draft.title);setInstructions(draft.instructions);setActivities(draft.activities.map(a=>({...a,key:crypto.randomUUID()})));setDirty(true);setNotice('Usulan AI diterapkan. Tinjau lalu simpan draf atau jadwalkan kelas.');}}/>
      <section className="sc-card"><h2>Jadwal kelas</h2><p>Waktu menggunakan WIB. Kelas berjalan otomatis meskipun dosen sedang offline.</p>
        <label>Judul kelas<input value={title} maxLength={200} onChange={e => {setTitle(e.target.value); setDirty(true);}}/></label>
        <label>Instruksi umum<textarea rows={4} maxLength={10000} value={instructions} onChange={e => {setInstructions(e.target.value); setDirty(true);}}/></label>
        <div className="sc-grid"><label>Mulai (WIB)<input type="datetime-local" value={start} onChange={e => {setStart(e.target.value); setDirty(true);}}/></label><label>Batas check-in (WIB)<input type="datetime-local" value={joinUntil} onChange={e => {setJoinUntil(e.target.value); setDirty(true);}}/></label>
        <label>Terlambat setelah (menit)<input type="number" min={0} max={1440} value={lateAfterMin} onChange={e => {setLateAfterMin(Number(e.target.value)); setDirty(true);}}/></label>
        <label>Rombel<select value={section} disabled={Boolean(state.session.section)} onChange={e => {setSection(e.target.value); setDirty(true);}}><option value="">Semua rombel mata kuliah</option>{sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
        <p><strong>Total {minutes} menit</strong>{start && Number.isFinite(Date.parse(start)) && ` · Selesai ${wibLabel(new Date(Date.parse(fromWibInput(start)) + minutes * 60000).toISOString())}`}</p>
      </section>
      <section className="sc-card"><h2>Rundown kegiatan</h2><p>Setiap kegiatan memiliki waktu yang sama untuk seluruh peserta. Kegiatan wajib menentukan saran kehadiran; jawaban salah tetap dihitung sebagai partisipasi.</p>
        {activities.map((a, i) => <article className="sc-editor-activity" key={a.key}><header><h3>Kegiatan {i + 1} · {ACTIVITY_LABELS[a.kind]}</h3><div className="sc-actions"><button aria-label={`Naikkan kegiatan ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button aria-label={`Turunkan kegiatan ${i + 1}`} disabled={i === activities.length - 1} onClick={() => move(i, 1)}>↓</button><button onClick={() => {setActivities(rows => rows.filter((_, j) => j !== i)); setDirty(true);}}>Hapus</button></div></header>
          <div className="sc-grid"><label>Nama kegiatan<input maxLength={200} value={a.title} onChange={e => changeActivity(i, {title: e.target.value})}/></label><label>Durasi (menit)<input type="number" min={1} max={600} value={a.minutes} onChange={e => changeActivity(i, {minutes: Number(e.target.value)})}/></label></div>
          <label>Materi / instruksi<textarea rows={4} maxLength={20000} value={a.content} onChange={e => changeActivity(i, {content: e.target.value})}/></label>
          <label>Tautan materi (HTTPS, opsional)<input type="url" value={a.url} maxLength={2000} placeholder="https://…" onChange={e => changeActivity(i, {url: e.target.value})}/></label>
          {academic&&<div className="sc-grid"><AcademicChoices label="Berkas terkait (maksimal 8)" options={academic.materials.map(m=>({id:m.id,title:`${m.title} · v${m.version}${m.access==='student'?'':' · hanya dosen, tidak dibagikan'}`}))} value={a.materialIds} onChange={ids=>changeActivity(i,{materialIds:ids})}/><AcademicChoices label="CPMK" options={academic.cpmks.map(c=>({id:c.id,title:`${c.code} — ${c.description}`}))} value={a.cpmkIds} onChange={ids=>changeActivity(i,{cpmkIds:ids})}/><AcademicChoices label="Sub-CPMK" options={academic.subCpmks.map(c=>({id:c.id,title:`${c.code} — ${c.description}`}))} value={a.subCpmkIds} onChange={ids=>changeActivity(i,{subCpmkIds:ids})}/></div>}
          <label className="sc-check"><input type="checkbox" checked={a.required} onChange={e => changeActivity(i, {required: e.target.checked})}/>Wajib untuk saran kehadiran</label>
          {a.kind === 'quiz' && <QuizBuilder questionsOnly value={{...DEFAULT_QUIZ_CONFIG, questions: a.questions}} onChange={q => changeActivity(i, {questions: q.questions})}/>}
          {a.kind === 'material' && <small>Peserta menandai sudah membaca. Gunakan kuis berikutnya untuk memeriksa pemahaman.</small>}
          {(a.kind === 'assignment' || a.kind === 'exit_ticket') && <small>Peserta mengirim jawaban teks. Tugas sesi tersimpan terpisah dari nilai resmi.</small>}
        </article>)}
        <div className="sc-actions">{(Object.keys(ACTIVITY_LABELS) as ActivityKind[]).map(kind => <button key={kind} disabled={activities.length >= 30} onClick={() => {setActivities(rows => [...rows, blankActivity(kind)]); setDirty(true);}}>+ {ACTIVITY_LABELS[kind]}</button>)}</div>
      </section>
      <section className="sc-card"><div className="sc-actions"><button onClick={() => setPreview(p => !p)}>{preview ? 'Tutup pratinjau' : 'Pratinjau jadwal'}</button><button onClick={() => void save(false)}>Simpan draf</button><button className="sc-primary" onClick={() => void save(true)}>Jadwalkan kelas</button></div><p role="status">{busy ? 'Menyimpan…' : dirty ? 'Ada perubahan belum tersimpan.' : `Revisi ${revision} · Hasil kuis diterbitkan dosen setelah kelas.`}</p>
        {preview && <ol className="sc-timeline">{activities.map((a, i) => {const offset = activities.slice(0, i).reduce((sum, row) => sum + row.minutes, 0); return <li key={a.key}><strong>{a.title}</strong><span>Menit {offset}–{offset + a.minutes} · {a.required ? 'Wajib' : 'Opsional'}</span><p className="sc-prose">{a.content}</p><small>{a.questions.length ? `${a.questions.length} soal · kunci disimpan privat` : ACTIVITY_LABELS[a.kind]}</small></li>;})}</ol>}
      </section>
    </fieldset>
  </div>;
}
