import {useEffect,useState} from 'react';
import {Link,useBlocker,useSearchParams} from 'react-router';
import {ArrowLeft,ArrowRight,BookOpen,CalendarDays,CheckCheck,Clock3,Eye,FileCheck2,LayoutDashboard,Users} from 'lucide-react';
import {activityBookReference} from '@/lib/scheduled-book-reference';
import {useCourseByRoute} from '@/hooks/use-course-route';
import {useCourseSections} from '@/hooks/use-course-sections';
import {ACTIVITY_LABELS,wibLabel,type ScheduledClassState} from '@/lib/scheduled-classes';
import {defaultSessionTab,SESSION_PHASE_LABELS,type SessionTab} from '@/lib/scheduled-session-workspace';
import {reviewTally} from '@/lib/session-review-verdict';
import {ScheduledClassEditor} from './scheduled-class-editor';
import {ScheduledLessonEditor} from './scheduled-lesson-editor';
import {ScheduledReviewWorkspace} from './scheduled-review-workspace';
import {ScheduledClassReport} from './scheduled-class-report';

type Props={state:ScheduledClassState;courseId:string;busy:boolean;onAction:(action:string,body?:Record<string,unknown>)=>Promise<void>;onState:(state:ScheduledClassState)=>void};
const tabs=[{id:'overview',label:'Ringkasan',icon:LayoutDashboard},{id:'work',label:'Jawaban & nilai',icon:FileCheck2},{id:'attendance',label:'Kehadiran',icon:Users},{id:'materials',label:'Materi',icon:BookOpen}] as const;
export function ScheduledLecturerSession({state,courseId,busy,onAction,onState}:Props){
  const course=useCourseByRoute(courseId),{sections}=useCourseSections(courseId);
  const [params,setParams]=useSearchParams(),[reviewDirty,setReviewDirty]=useState(false);
  const selected=params.get('tab');
  const tab:SessionTab=tabs.some(t=>t.id===selected)?selected as SessionTab:defaultSessionTab(state.class?.phase);
  const blocker=useBlocker(({currentLocation,nextLocation})=>reviewDirty&&(currentLocation.pathname!==nextLocation.pathname||new URLSearchParams(nextLocation.search).get('preview')==='student'));
  useEffect(()=>{if(blocker.state==='blocked'){if(window.confirm('Perubahan penilaian belum disimpan. Tinggalkan halaman ini?'))blocker.proceed();else blocker.reset();}},[blocker]);
  const chooseTab=(id:SessionTab)=>setParams(prev=>{const next=new URLSearchParams(prev);next.set('tab',id);next.delete('create');return next;},{replace:true});
  const c=state.class,phase=c?.phase||'draft';
  const isClosed=['closed','reviewed'].includes(phase);
  const section=sections.find(s=>s.id===c?.section)?.name;
  const checkins=state.report.filter(r=>r.checkedInAt).length;
  const tally=reviewTally(state);
  const reviewed=tally.reviewed,submitted=tally.manual,pending=tally.pending;
  const run=(action:string)=>void onAction(action).catch(()=>{});
  const previewParams=new URLSearchParams(params);previewParams.set('preview','student');const previewPath='?'+previewParams.toString();
  return <div className="ss-page ss-workspace">
    <div className="ss-breadcrumbs"><Link to="/app/kelas-terjadwal"><ArrowLeft size={15}/>Kelas terjadwal</Link><span>/</span><Link to={`/app/courses/${courseId}/mata-kuliah`}>{course.data?.code||'Mata kuliah'}</Link></div>
    <header className="ss-session-heading"><div><div className="ss-row-meta"><span className={`ss-status ss-status-${phase}`}>{SESSION_PHASE_LABELS[phase]}</span><span>{course.data?.title||'Kelas terjadwal'}{section?` · Rombel ${section}`:''}</span></div><h1>{c?.title||state.session.title}</h1><div className="ss-heading-details"><span><CalendarDays size={16}/>{c?.startsAt?wibLabel(c.startsAt):'Jadwal belum ditentukan'}</span>{c?.endsAt&&<span><Clock3 size={16}/>Sampai {new Date(c.endsAt).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB</span>}<span><BookOpen size={16}/>{state.activities.length} kegiatan</span></div></div>{c&&c.status!=='draft'&&<Link className="ss-button" to={previewPath}><Eye size={17}/>Pratinjau mahasiswa</Link>}</header>
    <nav className="ss-tabs" aria-label="Bagian kelas">{tabs.map(({id,label,icon:Icon})=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>chooseTab(id)}><Icon size={17}/><span>{label}</span>{id==='work'&&pending>0&&<span className="ss-tab-count">{pending}</span>}</button>)}</nav>
    {tab==='overview'&&<section className="ss-overview">
      <div className="ss-overview-stats"><article><span className="ss-stat-icon"><Users size={20}/></span><div><p>Check-in</p><strong>{checkins}<small> / {state.report.length}</small></strong><span>mahasiswa tercatat hadir</span></div></article><article><span className="ss-stat-icon"><FileCheck2 size={20}/></span><div><p>Belum ditinjau</p><strong>{pending}</strong><span>kiriman perlu dinilai manual{tally.auto>0?` · ${tally.auto} otomatis`:''}</span></div></article><article><span className="ss-stat-icon"><CheckCheck size={20}/></span><div><p>Sudah ditinjau</p><strong>{reviewed}<small> / {submitted}</small></strong><span>kiriman manual selesai</span></div></article></div>
      {pending>0&&<div className="ss-review-callout"><div><h2>{pending} kiriman menunggu tinjauan</h2><p>Baca jawaban, beri nilai, lalu terbitkan umpan balik.</p></div><button className="ss-button ss-button-primary" onClick={()=>chooseTab('work')}>Tinjau jawaban<ArrowRight size={17}/></button></div>}
      <section className="ss-panel"><div className="ss-panel-heading"><div><h2>Jadwal kegiatan</h2><p>{c?.joinUntil?`Batas check-in: ${wibLabel(c.joinUntil)}`:'Susun jadwal untuk memulai kelas.'}</p></div><button className="ss-button ss-button-small" onClick={()=>chooseTab('materials')}>Lihat materi<ArrowRight size={15}/></button></div><ol className="ss-timeline">{state.activities.map((a,i)=><li key={a.id}><span className="ss-timeline-number">{i+1}</span><div><h3>{a.title}</h3><p>{ACTIVITY_LABELS[a.kind]} · {a.minutes} menit{a.required?' · Wajib':''}</p></div><time>{new Date(a.startsAt).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}</time></li>)}</ol>{!state.activities.length&&<div className="ss-empty"><BookOpen size={28}/><h3>Belum ada kegiatan</h3><button className="ss-button ss-button-primary" onClick={()=>chooseTab('materials')}>Susun kelas</button></div>}</section>
      {c&&<section className="ss-panel ss-session-actions"><div><h2>Pengelolaan kelas</h2><p>{isClosed?'Hasil penilaian manual diterbitkan dari tab Jawaban & nilai.':'Kegiatan berjalan otomatis mengikuti jadwal yang sudah disimpan.'}</p></div><div>{isClosed&&!c.releaseResults&&<button className="ss-button" disabled={busy} onClick={()=>{if(window.confirm('Terbitkan nilai kuis, kunci, dan pembahasan kepada peserta?'))run('release');}}>Terbitkan hasil kuis</button>}{phase==='closed'&&<button className="ss-button" disabled={busy} onClick={()=>run('review')}>Tandai kelas ditinjau</button>}{['scheduled','open'].includes(phase)&&<button className="ss-button ss-button-danger" disabled={busy} onClick={()=>{if(window.confirm('Batalkan kelas ini? Mahasiswa tidak dapat melanjutkan kegiatan.'))run('cancel');}}>Batalkan kelas</button>}</div></section>}
    </section>}
    <div hidden={tab!=='work'}>{c&&c.status!=='draft'?<ScheduledReviewWorkspace state={state} onAction={onAction} onDirtyChange={setReviewDirty} initialSelection={{student:params.get('student')||undefined,activity:params.get('activity')||undefined}} onSelectionChange={selection=>setParams(prev=>{const next=new URLSearchParams(prev);if(selection.student)next.set('student',selection.student);if(selection.activity)next.set('activity',selection.activity);return next;},{replace:true})}/>:tab==='work'&&<div className="ss-empty"><FileCheck2 size={30}/><h2>Jawaban akan tampil setelah kelas dijadwalkan</h2><button className="ss-button" onClick={()=>chooseTab('materials')}>Susun kelas</button></div>}</div>
    {tab==='attendance'&&<ScheduledClassReport state={state}/>}
    {tab==='materials'&&<div className="ss-materials">{!c||c.status==='draft'?<ScheduledClassEditor state={state} onSaved={onState} focusAi={params.get('create')==='ai'}/>:<>
      <div className="ss-section-intro"><div><h2>Materi & kegiatan</h2><p>{state.activities.length} kegiatan dalam kelas ini.</p></div><Link className="ss-button" to={previewPath}><Eye size={17}/>Lihat sebagai mahasiswa</Link></div>
      {state.activities.map((a,i)=><article className="ss-panel ss-material-card" key={a.id}><div className="ss-material-title"><span className="ss-timeline-number">{i+1}</span><div><p className="ss-eyebrow">{ACTIVITY_LABELS[a.kind]} · {a.minutes} menit</p><h3>{a.title}</h3></div></div>{(activityBookReference(a)||a.worksheet?.sourceLabel)&&<p className="ss-source-label"><BookOpen size={15}/>{activityBookReference(a)||a.worksheet?.sourceLabel}</p>}{a.content&&<p className="ss-prose">{a.content}</p>}{a.url&&<a href={a.url} target="_blank" rel="noreferrer">Buka materi ↗</a>}{a.sources?.filter(s=>s.available&&s.url).map(s=><a className="ss-source-label" key={s.id||s.title} href={s.url} target="_blank" rel="noreferrer"><BookOpen size={15}/>{s.title} ↗</a>)}{a.worksheet&&<details className="ss-material-questions"><summary>Lihat {a.worksheet.items.length} soal</summary><ol>{a.worksheet.items.map(item=><li key={item.id}><p>{item.prompt}</p>{item.translation&&<small>{item.translation}</small>}{item.options&&<p className="ss-muted">{item.options.join(' · ')}</p>}</li>)}</ol></details>}</article>)}
      {phase==='scheduled'&&<ScheduledLessonEditor state={state} onSaved={onState}/>}
      </>}</div>}
  </div>;
}
