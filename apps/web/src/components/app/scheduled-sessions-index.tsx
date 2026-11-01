import { BuilderRunList } from './builder/builder-run';
import {useEffect,useState} from 'react';
import {BuilderDraftList} from './builder/builder-entry';
import '@/styles/builder-workspace.css';
import {Link,useNavigate} from 'react-router';
import {ArrowRight,CalendarDays,Clock3,Plus,Search,Users,BookOpen,RefreshCw} from 'lucide-react';
import {useCachedQuery} from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import {SESSION_PHASE_LABELS,sessionWorkspacePath,type ScheduledSessionListItem} from '@/lib/scheduled-session-workspace';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';

type CourseOption={id:string;title:string;code:string};
type MeetingOption={id:string;title:string;week:number};
const filters=[['all','Semua'],['open','Berlangsung'],['scheduled','Akan datang'],['closed','Selesai'],['draft','Draf']] as const;
export function ScheduledSessionsIndex(){
  const navigate=useNavigate();
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[courseFilter,setCourseFilter]=useState('');
  const [creating,setCreating]=useState(false),[course,setCourse]=useState(''),[meeting,setMeeting]=useState('');
  const query=useCachedQuery<{items:ScheduledSessionListItem[]}>('scheduled-class-list',()=>pb.send('/api/laras/scheduled-class-list',{method:'GET',requestKey:null}));
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')query.reload();};const timer=window.setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[query.reload]);
  const courses=useCachedQuery<CourseOption[]>('scheduled-class-course-options',()=>pb.collection('courses').getFullList<CourseOption>({filter:pb.filter('owner={:u}',{u:pb.authStore.record?.id}),fields:'id,title,code',sort:'title'}));
  const meetings=useCachedQuery<MeetingOption[]>(course?`scheduled-class-meetings:${course}`:null,()=>pb.collection('class_sessions').getFullList<MeetingOption>({filter:pb.filter('course={:c}',{c:course}),fields:'id,title,week',sort:'week,created'}));
  const items=query.data?.items||[];
  const closed=(item:ScheduledSessionListItem)=>['closed','reviewed'].includes(item.phase);
  const visible=items.filter(item=>filter==='all'||(filter==='closed'?closed(item):item.phase===filter)).filter(item=>!courseFilter||item.course.id===courseFilter).filter(item=>`${item.title} ${item.course.title} ${item.course.code} ${item.section}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')));
  const counts={open:items.filter(i=>i.phase==='open').length,scheduled:items.filter(i=>i.phase==='scheduled').length,closed:items.filter(closed).length};
  return <div className="ss-page ss-index">
    <header className="ss-page-heading"><div><p className="ss-eyebrow">RUANG MENGAJAR</p><h1>Kelas terjadwal</h1><p>Jadwal, kehadiran, dan jawaban mahasiswa dalam satu tempat.</p></div><div className="bd-inline-actions"><button className="ss-button" onClick={()=>setCreating(true)}>Jadwalkan langsung</button><Link className="ss-button ss-button-primary" to="/app/builder/new?kind=kelas"><Plus size={18}/>Buat kelas</Link></div></header>
    <BuilderDraftList kind="kelas"/><BuilderRunList kind="kelas"/><div className="ss-index-stats">{([{key:'open',label:'Berlangsung',icon:Users},{key:'scheduled',label:'Akan datang',icon:CalendarDays},{key:'closed',label:'Selesai',icon:BookOpen}] as const).map(({key,label,icon:Icon})=><button key={key} className={`ss-index-stat ss-stat-${key}`} onClick={()=>setFilter(key)}><span className="ss-stat-icon"><Icon size={20}/></span><span><strong>{counts[key]}</strong><span>{label}</span></span><ArrowRight size={16}/></button>)}</div>
    <section className="ss-session-list" aria-label="Daftar kelas terjadwal">
      <div className="ss-list-toolbar"><div className="ss-filters" role="group" aria-label="Status kelas">{filters.map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div><button className="ss-icon-button" aria-label="Muat ulang daftar kelas" title="Muat ulang" disabled={query.loading} onClick={query.reload}><RefreshCw size={17}/></button></div>
      <div className="ss-list-search"><label className="ss-search"><Search size={18}/><input aria-label="Cari kelas atau mata kuliah" placeholder="Cari kelas atau mata kuliah..." value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filter mata kuliah" value={courseFilter} onChange={e=>setCourseFilter(e.target.value)}><option value="">Semua mata kuliah</option>{(courses.data||[]).map(c=><option key={c.id} value={c.id}>{c.code||c.title}</option>)}</select></div>
      {query.loading?<div className="ss-empty" role="status"><CalendarDays size={28}/><h2>Memuat kelas...</h2></div>:query.error?<div className="ss-empty" role="alert"><h2>Daftar kelas belum dapat dimuat</h2><p>{query.error}</p><button className="ss-button" onClick={query.reload}>Coba lagi</button></div>:!visible.length?<div className="ss-empty"><CalendarDays size={32}/><h2>{items.length?'Tidak ada kelas yang sesuai':'Mulai kelas terjadwal pertama Anda'}</h2><p>{items.length?'Coba status atau kata pencarian lain.':'Pilih mata kuliah dan pertemuan, lalu susun kegiatannya.'}</p>{!items.length&&<Link className="ss-button ss-button-primary" to="/app/builder/new?kind=kelas">Buat kelas</Link>}</div>:<div className="ss-session-rows">{visible.map(item=>{
        const start=item.startsAt?new Date(item.startsAt):null;
        return <Link className="ss-session-row" key={item.id} to={sessionWorkspacePath(item.course.id,item.session)}>
          <div className="ss-date-tile"><span>{start?start.toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',month:'short'}):'Jadwal'}</span><strong>{start?start.toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit'}):'—'}</strong></div>
          <div className="ss-row-body"><div className="ss-row-meta"><span className={`ss-status ss-status-${item.phase}`}>{SESSION_PHASE_LABELS[item.phase]}</span><span>{item.course.code||item.course.title}{item.section?` · Rombel ${item.section}`:''}</span></div><h2>{item.title}</h2><div className="ss-row-details"><span><Clock3 size={14}/>{start?`${start.toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}–${new Date(item.endsAt).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB`:'Waktu belum ditentukan'}</span><span><BookOpen size={14}/>{item.activityCount} kegiatan</span>{item.checkedIn>0&&<span><Users size={14}/>{item.checkedIn} check-in</span>}</div></div>
          <span className="ss-row-action">{closed(item)?'Tinjau jawaban':'Buka kelas'}<ArrowRight size={18}/></span>
        </Link>;
      })}</div>}
    </section>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="ss-create-dialog"><DialogHeader><DialogTitle>Jadwalkan kelas</DialogTitle><DialogDescription>Pilih pertemuan untuk menyusun jadwal dan kegiatan mahasiswa.</DialogDescription></DialogHeader><label>Mata kuliah<select value={course} onChange={e=>{setCourse(e.target.value);setMeeting('');}}><option value="">Pilih mata kuliah</option>{(courses.data||[]).map(c=><option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select></label><label>Pertemuan<select disabled={!course||meetings.loading} value={meeting} onChange={e=>setMeeting(e.target.value)}><option value="">{meetings.loading?'Memuat pertemuan...':'Pilih pertemuan'}</option>{(meetings.data||[]).map(m=><option key={m.id} value={m.id}>Pertemuan {m.week} · {m.title}</option>)}</select></label>{(courses.error||meetings.error)&&<p role="alert">{courses.error||meetings.error}</p>}{course&&!meetings.loading&&!meetings.data?.length&&<p>Belum ada pertemuan. <Link to={`/app/courses/${course}/mata-kuliah`}>Tambahkan pertemuan di mata kuliah.</Link></p>}<DialogFooter><button className="ss-button" onClick={()=>setCreating(false)}>Batal</button><button className="ss-button ss-button-primary" disabled={!meeting} onClick={()=>navigate(sessionWorkspacePath(course,meeting))}>Lanjutkan<ArrowRight size={16}/></button></DialogFooter></DialogContent></Dialog>
  </div>;
}
