import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, Check, Circle, FileText, LoaderCircle, Sparkles, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { AGENT_STATUS, type AgentTask, type LessonPlan } from '@/lib/agent-tasks';
import { useStudentHomeText } from '@/lib/student-home-copy';
import { lessonPlanLink, type SessionLessonPlan } from '@/lib/lesson-plans';
import type { ClassSession, Course } from '@/lib/learning';

export function AgentTaskPanel({ courses: supplied, student = false, compact = false, coachId = '', preview = false, activeRoundId = '', onRoundReady, sessionId: fixedSessionId = '' }: { sessionId?: string; courses?: Course[]; student?: boolean; compact?: boolean; coachId?: string; preview?: boolean; activeRoundId?: string; onRoundReady?: (id: string) => void }) {
 const label = useStudentHomeText();
 const [params] = useSearchParams();
 const [courses, setCourses] = useState<Course[]>(supplied || []);
 const [courseId, setCourseId] = useState(supplied?.[0]?.id || '');
 const [sessions,setSessions]=useState<ClassSession[]>([]);
 const [sessionId,setSessionId]=useState(fixedSessionId);
 const [plans,setPlans]=useState<SessionLessonPlan[]>([]);
 const [tasks, setTasks] = useState<AgentTask[]>([]);
 const [goal, setGoal] = useState('');
 const [busy, setBusy] = useState('');
 const [error, setError] = useState('');
 const [loaded, setLoaded] = useState(false);
 const [showHistory, setShowHistory] = useState(false);
 const request = useCallback(async (body: Record<string, unknown>) => {
  const response = await fetch('/api/agent-tasks', { method: 'POST', headers: { Authorization: `Bearer ${pb.authStore.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Tugas asisten belum tersedia.');
  return result as { tasks?: AgentTask[]; task?: AgentTask };
 }, []);
 const readTasks = useCallback(async () => (await pb.collection('agent_tasks').getList<AgentTask>(1, 15, {
  filter: pb.filter('owner={:u}', { u: pb.authStore.record?.id }), sort: '-created',
  fields: 'id,owner,course,kind,status,goal,steps,revision,approvedRevision,attempts,payload,result,error,created,updated',
 })).items, []);
 const reload = useCallback(async () => { setTasks(await readTasks()); setLoaded(true); }, [readTasks]);
 useEffect(() => {
  if (preview) return;
  let alive = true;
  const load = async () => { try { const rows = await readTasks(); if (alive) { setTasks(rows); setLoaded(true); } } catch (e) { if (alive) setError((e as Error).message); } };
  void load();
  if (!supplied && !student) void pb.collection('courses').getFullList<Course>({ filter: pb.filter('owner={:u}', { u: pb.authStore.record?.id }), fields: 'id,title,code' }).then(rows => { if (alive) { setCourses(rows); setCourseId(rows[0]?.id || ''); } }).catch(e => { if (alive) setError(e.message); });
  const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000);
  const refresh = () => void load(); window.addEventListener('focus', refresh);
  return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
 }, [readTasks, supplied, preview, student]);
 useEffect(()=>{if(student||!courseId)return;let alive=true;void pb.collection('class_sessions').getFullList<ClassSession>({filter:pb.filter('course={:c} && owner={:u}',{c:courseId,u:pb.authStore.record?.id}),sort:'week'}).then(rows=>{if(alive){setSessions(rows);if(!fixedSessionId)setSessionId('');}}).catch(e=>alive&&setError(e.message));return()=>{alive=false;};},[courseId,student,fixedSessionId]);
 useEffect(()=>{if(student)return;let alive=true;const load=async()=>{const rows=await pb.collection('assistant_lesson_plans').getFullList<SessionLessonPlan>({sort:'-updated'});if(alive)setPlans(rows);};void load().catch(()=>{});const timer=setInterval(()=>void load().catch(()=>{}),5000);return()=>{alive=false;clearInterval(timer);};},[student]);
 const run = async (action: string, task?: AgentTask) => {
  if (busy || preview) return;
  setBusy(action); setError('');
  try {
   await request(action === 'create' ? { action, courseId, kind: student ? 'practice' : 'lesson', goal,sessionId } : { action, taskId: task?.id, revision: task?.revision });
   await reload();
  } catch (e) { setError((e as Error).message); }
  finally { setBusy(''); }
 };
 const scopeTasks = tasks.filter(t => t.kind === (student ? 'practice' : 'lesson') && (student || (t.course===courseId && (!sessionId || t.payload.sessionId===sessionId))));
 const selectedId = coachId || params.get('task');
 const current = scopeTasks.find(t => t.id === selectedId) || scopeTasks.find(t => !['completed', 'cancelled'].includes(t.status)) || scopeTasks[0];
 const active = current && !['completed', 'cancelled'].includes(current.status);
 if (preview) return null;
 if (coachId && !current) return null;
 return <section className={`agent-panel${student ? ' agent-coach' : ''}${compact ? ' agent-compact' : ''}`} aria-label={student ? label('Pelatih belajarmu') : 'Tugas asisten'}>
  <header className="agent-heading"><span className="agent-icon"><Sparkles size={20} /></span><div><h2>{student ? label('Pelatih belajarmu') : 'Rencana pembelajaran'}</h2><p>{student ? label('Dua putaran pendek. Fokus menyesuaikan jawabanmu.') : 'Baca bukti kelas, susun kegiatan, lalu tinjau dan simpan draf.'}</p></div></header>
  {!coachId && <div className="agent-create"><label><span>{student ? label('Dunia kelasmu') : 'Mata kuliah'}</span><select value={courseId} onChange={e => setCourseId(e.target.value)} disabled={Boolean(busy)}>{!courses.length && <option value="">{label('Belum ada mata kuliah')}</option>}{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>{!student && !fixedSessionId && <label><span>Pertemuan</span><select value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Pilih pertemuan…</option>{sessions.map(s=><option key={s.id} value={s.id}>Minggu {s.week} · {s.title}</option>)}</select></label>}{!student && <label className="agent-goal"><span>Tujuan pelajaran (opsional)</span><input value={goal} onChange={e => setGoal(e.target.value)} maxLength={1000} placeholder="Contoh: latihan artikel untuk pertemuan berikutnya" disabled={Boolean(busy)} /></label>}<button className="ld-btn-primary" disabled={!courseId || (!student && !sessionId) || Boolean(busy) || !loaded} onClick={() => void run('create')}>{busy === 'create' ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{student ? label('Latihan bersama AI · ±10 menit') : 'Siapkan draf'}</button></div>}
  {error && <p className="agent-error" role="alert">{error} <button onClick={() => void reload().catch(e => setError(e.message))}>{label('Coba lagi')}</button></p>}
  {!loaded && !error && <p className="agent-note"><LoaderCircle className="spin" size={14} />{label('Memuat…')}</p>}
  {current && <article className="agent-task" aria-busy={current.status === 'running'}>
   <div className="agent-task-top"><strong>{current.payload.courseTitle || current.goal}</strong><span className={`agent-state agent-state-${current.status}`}>{label(AGENT_STATUS[current.status])}</span></div>
   <ol className={`agent-steps${coachId ? ' agent-steps-inline' : ''}`}>{current.steps.map((s, i) => <li key={i} className={`agent-step-${s.status}`}>{s.status === 'done' ? <Check size={15} /> : s.status === 'running' ? <LoaderCircle size={15} className={current.status === 'running' ? 'spin' : ''} /> : <Circle size={13} />}<span>{label(s.label)}{s.detail && <small>{student ? learnerDetail(s.detail, label) : s.detail}</small>}</span></li>)}</ol>
   <div className="agent-progress" role="progressbar" aria-label={label('Progres tugas')} aria-valuemin={0} aria-valuemax={current.steps.length} aria-valuenow={current.steps.filter(s => s.status === 'done').length}><span style={{ width: `${current.steps.filter(s => s.status === 'done').length / current.steps.length * 100}%` }} /></div>
   {student && current.payload.focus && <div className="agent-focus"><strong>{label(current.payload.focus.label)}</strong><p>{learnerDetail(current.payload.focus.reason, label)}</p></div>}
   {current.payload.plan && (!compact || student) && <LessonPreview plan={current.payload.plan} />}
   {current.error && <p role="alert" className="agent-error">{current.error}</p>}
   <div className="agent-actions">
 {!student && current.payload.sessionId && <Link className="ld-text-btn" to={lessonPlanLink(current.course,current.payload.sessionId)}>Buka rencana pertemuan <ArrowRight size={13}/></Link>}
    {coachId && current.status === 'awaiting_practice' && current.result.recordId && current.result.recordId !== activeRoundId && onRoundReady && <button className="ld-btn-primary" onClick={() => onRoundReady(current.result.recordId!)}>{label('Buka putaran yang siap')} <ArrowRight size={16} /></button>}
    {current.status === 'awaiting_approval' && (!compact || fixedSessionId) && <button className="ld-btn-primary" disabled={Boolean(busy)} onClick={() => void run('approve', current)}><Check size={16} /> Setujui & simpan ke pertemuan</button>}
    {['failed', 'needs_auth'].includes(current.status) && <button className="ld-btn-primary" disabled={Boolean(busy)} onClick={() => void run('resume', current)}>{label('Lanjutkan tugas')}</button>}
    {current.status === 'awaiting_practice' && current.result.link && !coachId && <Link className="ld-btn-primary" to={current.result.link}>{label('Mulai putaran')} <ArrowRight size={16} /></Link>}
    {current.status === 'completed' && <span className="agent-verified"><Check size={16} />{label('Hasil tersimpan dan diperiksa')}{current.result.verifiedAt && <time>{new Date(current.result.verifiedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })}</time>}</span>}
    {active && <button className="agent-cancel" disabled={Boolean(busy)} onClick={() => void run('cancel', current)}><X size={14} />{label('Batalkan')}</button>}
   </div>
   {current.status === 'awaiting_approval' && <p className="agent-note">Usulan ini mengganti rencana pada revisi saat tugas dimulai. Tinjau rundown dan rujukannya; perubahan manual yang lebih baru tidak akan ditimpa.</p>}
   {['queued', 'running'].includes(current.status) && <p className="agent-note" role="status">{label('Kamu boleh menutup halaman ini. Progres tetap tersimpan.')}</p>}
  </article>}
  {!student && compact && <div className="agent-saved-plans"><h3>Rencana tersimpan</h3>{plans.length===0&&<p>Belum ada rencana.</p>}{plans.map(p=><div key={p.id}>{p.session?<Link to={lessonPlanLink(p.course,p.session)}>{p.title}<small>{p.status==='ready'?'Siap':'Draf'} · revisi {p.revision||0}</small></Link>:<div><strong>{p.title}</strong><small>Draf terpisah</small>{sessionId && p.course===courseId?<Link to={lessonPlanLink(p.course,sessionId)+`?attach=${p.id}`}>Tautkan ke pertemuan →</Link>:<small>Pilih pertemuan dari mata kuliah ini untuk menautkan.</small>}</div>}</div>)}</div>}
  {scopeTasks.length > 1 && !coachId && <details open={showHistory} onToggle={e => setShowHistory(e.currentTarget.open)} className="agent-history"><summary>{label('Tugas sebelumnya')} ({scopeTasks.length - 1})</summary>{scopeTasks.filter(t => t.id !== current?.id).map(t => <div key={t.id}><span>{t.payload.courseTitle} · {label(AGENT_STATUS[t.status])}</span>{t.kind === 'lesson' ? <Link to={t.payload.sessionId?lessonPlanLink(t.course,t.payload.sessionId):`/app/asisten?task=${t.id}`} >Lihat draf <ArrowRight size={13} /></Link> : t.result.link && <Link to={t.result.link}>{label('Lihat')} <ArrowRight size={13} /></Link>}</div>)}</details>}
 </section>;
}
function LessonPreview({ plan }: { plan: LessonPlan }) {
 return <div className="agent-lesson"><h3>{plain(plan.title)}</h3><p>{plain(plan.objective)}</p><p className="agent-evidence">{plan.evidenceNote}</p>{plan.preparation&&<div className="agent-check"><strong>Persiapan dosen</strong><p>{plain(plan.preparation)}</p></div>}<ol>{plan.activities.map((a, i) => <li key={i}><div><strong>{plain(a.title)}</strong><span>{a.minutes} menit</span></div><p>{plain(a.instructions)}</p>{a.studentActivity&&<p><strong>Aktivitas mahasiswa: </strong>{plain(a.studentActivity)}</p>}<div className="agent-source-links">{plan.sources.filter(s => a.sourceIds.includes(s.id)).map(s => <Link key={s.id} to={s.href}><FileText size={13} />{s.title}</Link>)}</div></li>)}</ol><div className="agent-check"><strong>Cek pemahaman</strong><p>{plain(plan.check)}</p></div></div>;
}

function plain(text: string) { return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1'); }
function learnerDetail(text: string, label: ReturnType<typeof useStudentHomeText>) {
 const count = text.match(/^Dipilih dari (\d+) jawaban latihan/);
 if (count) return label('Dipilih dari {count} jawaban latihan. Fokus sementara, bukan penilaian resmi.', { count: count[1] });
 const prepare = text.match(/^Menyiapkan putaran (\d+)\/2/);
 if (prepare) return label('Menyiapkan putaran {round}/2 dari materi yang tersedia.', { round: prepare[1] });
 const waiting = text.match(/^Putaran (\d+)\/2/);
 if (waiting) return label('Putaran {round}/2. Jawabanmu diperlukan untuk melanjutkan.', { round: waiting[1] });
 return label(text);
}
