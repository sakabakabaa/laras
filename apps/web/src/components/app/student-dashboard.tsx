import {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router';
import {ArrowRight,BookOpen,CalendarDays,ChevronLeft,ChevronRight,Clock3,MessageCircle,Radio} from 'lucide-react';
import {AppShell} from '@/components/app/app-shell';
import {CourseThumb} from '@/components/app/course-thumb';
import {useCachedQuery} from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import {courseRouteId} from '@/lib/course-route';
import {useLanguage} from '@/lib/i18n';
import {activityTypeOf,studentWorkPath,type Assignment,type AssignmentSubmission} from '@/lib/assignments';
import {deliveryRequest,type BuilderRunItem} from '@/lib/builder-delivery';
import {sessionClock} from '@/lib/session-clock';
import {dashboardClasses,jakartaDay,orderByDeadline,type DashboardClass,type StudentLiveClass} from '@/lib/student-dashboard-data';
import type {Course,Enrollment} from '@/lib/learning';
import '@/styles/student-dashboard-v2.css';

type Work={id:string;title:string;course:string;deadline:string;href:string;status:'assigned'|'draft'|'revision'|'feedback'};
const copy={
 id:{eyebrow:'RUANG BELAJAR',hello:'Halo',intro:'Semua yang kamu perlukan untuk belajar, di satu tempat.',live:'Kelas berlangsung',next:'Kelas berikutnya',noClass:'Belum ada kelas terjadwal',noClassHint:'Kelas yang sedang berlangsung dan jadwal berikutnya akan muncul di sini.',join:'Masuk kelas',resume:'Lanjutkan kelas',viewClass:'Lihat kelas',joinClosed:'Batas check-in sudah lewat',starts:'Mulai',ends:'Berakhir',work:'Perlu dikerjakan',workHint:'Tugas dan revisi, diurutkan berdasarkan tenggat.',allDone:'Semua tugas sudah selesai',allDoneHint:'Tugas atau revisi baru akan muncul di sini.',due:'Tenggat',noDue:'Tanpa tenggat',assigned:'Belum dimulai',draft:'Draf tersimpan',revision:'Perlu revisi',feedback:'Lihat umpan balik',start:'Mulai',continue:'Lanjutkan',revise:'Perbaiki',courses:'Mata kuliah saya',coursesHint:'Buka materi, kegiatan, dan hasil belajar.',allCourses:'Semua mata kuliah',emptyCourses:'Belum ada mata kuliah',emptyCoursesHint:'Mata kuliah yang kamu ikuti akan muncul di sini.',openCourse:'Buka mata kuliah',feedbackTitle:'Umpan balik',feedbackHint:'Hasil yang sudah dibagikan dosen.',more:'Lihat semua',loading:'Memuat…',error:'Bagian ini belum dapat dimuat.',retry:'Coba lagi',preview:'Pratinjau dosen: data pribadi mahasiswa tidak ditampilkan.',back:'Kembali ke dashboard dosen',person:'selamat datang',open:'Buka',moreClasses:'Kelas lainnya',calendar:'Kalender',calendarHint:'Kelas dan tenggat tujuh hari ke depan.',noEvents:'Tidak ada kelas atau tenggat pada hari ini.',classEvent:'Kelas',workEvent:'Tugas',overdue:'Tenggat lewat',upcoming:'Akan datang'},
 en:{eyebrow:'YOUR LEARNING SPACE',hello:'Hello',intro:'Everything you need for learning, in one place.',live:'Class in progress',next:'Next class',noClass:'No class scheduled',noClassHint:'Live and upcoming classes will appear here.',join:'Join class',resume:'Continue class',viewClass:'View class',joinClosed:'Check-in has closed',starts:'Starts',ends:'Ends',work:'Things to do',workHint:'Assignments and revisions, ordered by deadline.',allDone:'You are all caught up',allDoneHint:'New assignments and revisions will appear here.',due:'Due',noDue:'No deadline',assigned:'Not started',draft:'Draft saved',revision:'Revision requested',feedback:'View feedback',start:'Start',continue:'Continue',revise:'Revise',courses:'My courses',coursesHint:'Open materials, activities, and results.',allCourses:'All courses',emptyCourses:'No courses yet',emptyCoursesHint:'Your enrolled courses will appear here.',openCourse:'Open course',feedbackTitle:'Feedback',feedbackHint:'Results shared by your lecturer.',more:'View all',loading:'Loading…',error:'This section could not be loaded.',retry:'Try again',preview:'Lecturer preview: personal student data is not shown.',back:'Back to lecturer dashboard',person:'welcome',open:'Open',moreClasses:'Other classes',calendar:'Calendar',calendarHint:'Classes and deadlines for the next seven days.',noEvents:'No classes or deadlines on this day.',classEvent:'Class',workEvent:'Assignment',overdue:'Past deadline',upcoming:'Upcoming'},
 de:{eyebrow:'DEIN LERNBEREICH',hello:'Hallo',intro:'Alles für dein Lernen an einem Ort.',live:'Unterricht läuft',next:'Nächster Unterricht',noClass:'Kein Unterricht geplant',noClassHint:'Laufender und anstehender Unterricht erscheint hier.',join:'Unterricht beitreten',resume:'Unterricht fortsetzen',viewClass:'Unterricht ansehen',joinClosed:'Die Check-in-Frist ist abgelaufen',starts:'Beginn',ends:'Ende',work:'Zu erledigen',workHint:'Aufgaben und Überarbeitungen nach Frist sortiert.',allDone:'Alles erledigt',allDoneHint:'Neue Aufgaben und Überarbeitungen erscheinen hier.',due:'Abgabe',noDue:'Keine Frist',assigned:'Noch nicht begonnen',draft:'Entwurf gespeichert',revision:'Überarbeitung nötig',feedback:'Feedback ansehen',start:'Starten',continue:'Fortsetzen',revise:'Überarbeiten',courses:'Meine Kurse',coursesHint:'Materialien, Aktivitäten und Ergebnisse öffnen.',allCourses:'Alle Kurse',emptyCourses:'Noch keine Kurse',emptyCoursesHint:'Deine Kurse erscheinen hier.',openCourse:'Kurs öffnen',feedbackTitle:'Feedback',feedbackHint:'Von deiner Lehrkraft freigegebene Ergebnisse.',more:'Alle ansehen',loading:'Wird geladen…',error:'Dieser Bereich konnte nicht geladen werden.',retry:'Erneut versuchen',preview:'Lehrkraftvorschau: Persönliche Daten werden nicht angezeigt.',back:'Zurück zum Dashboard',person:'willkommen',open:'Öffnen',moreClasses:'Weitere Kurse',calendar:'Kalender',calendarHint:'Unterricht und Fristen für die nächsten sieben Tage.',noEvents:'An diesem Tag gibt es keinen Unterricht und keine Fristen.',classEvent:'Unterricht',workEvent:'Aufgabe',overdue:'Frist überschritten',upcoming:'Demnächst'},
} as const;
type Labels=typeof copy.id|typeof copy.en|typeof copy.de;
const timingCopy={
 id:{soon:(n:number)=>`Dalam ${n} menit`,late:(n:number)=>`Telat ${n} menit`,started:(n:number)=>`Berlangsung ${n} menit`,now:'Baru dimulai',finished:'Selesai',remaining:'Sisa waktu'},
 en:{soon:(n:number)=>`In ${n} ${n===1?'minute':'minutes'}`,late:(n:number)=>`${n} ${n===1?'minute':'minutes'} late`,started:(n:number)=>`Started ${n} ${n===1?'minute':'minutes'} ago`,now:'Just started',finished:'Completed',remaining:'Time remaining'},
 de:{soon:(n:number)=>`In ${n} ${n===1?'Minute':'Minuten'}`,late:(n:number)=>`${n} ${n===1?'Minute':'Minuten'} zu spät`,started:(n:number)=>`Seit ${n} ${n===1?'Minute':'Minuten'}`,now:'Gerade begonnen',finished:'Abgeschlossen',remaining:'Verbleibende Zeit'},
};
function classTimeLabel(item:DashboardClass,now:number,language:'id'|'en'|'de'){
 const labels=timingCopy[language],elapsed=now-Date.parse(item.startsAt);
 if(elapsed<0)return labels.soon(Math.ceil(-elapsed/60000));
 if(item.finished)return labels.finished;
 const minutes=Math.floor(elapsed/60000);
 if(minutes===0)return labels.now;
 return item.checkedIn?labels.started(minutes):labels.late(minutes);
}

type EnrollmentWithCourse=Enrollment & {expand?:{course?:Course}};
function dateLabel(value:string,language:'id'|'en'|'de'){
 const date=new Date(value);if(!value||Number.isNaN(date.getTime()))return '';
 return new Intl.DateTimeFormat(language==='id'?'id-ID':language==='de'?'de-DE':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(date)+' WIB';
}
function SectionError({onRetry,labels}:{onRetry:()=>void;labels:Labels}){return <div className="sd2-error" role="alert"><span>{labels.error}</span><button type="button" onClick={onRetry}>{labels.retry}</button></div>;}
export function StudentDashboard({preview=false}:{preview?:boolean}){
 const language=useLanguage(),l=copy[language],user=pb.authStore.record,me=user?.id||'';
 const [localNow,setLocalNow]=useState(Date.now()),[clockOffset,setClockOffset]=useState(0),[calendarDay,setCalendarDay]=useState(''),[monthOffset,setMonthOffset]=useState(0);
 const now=localNow+clockOffset;
 useEffect(()=>{const timer=window.setInterval(()=>setLocalNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
 const coursesQuery=useCachedQuery<Course[]>(`student-dashboard:courses:${me}`,()=>pb.collection('courses').getFullList<Course>({sort:'title'}));
 const enrollmentsQuery=useCachedQuery<EnrollmentWithCourse[]>(preview?null:`student-dashboard:enrollments:${me}`,()=>pb.collection('enrollments').getFullList<EnrollmentWithCourse>({filter:pb.filter('owner = {:me}',{me}),expand:'course'}));
 const assignmentsQuery=useCachedQuery<Assignment[]>(preview?null:`student-dashboard:assignments:${me}`,()=>pb.collection('assignments').getFullList<Assignment>({sort:'-updated',expand:'session,subCpmk,parentAssignment'}));
 const submissionsQuery=useCachedQuery<AssignmentSubmission[]>(preview?null:`student-dashboard:submissions:${me}`,()=>pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({filter:pb.filter('owner = {:me}',{me}),sort:'-updated'}));
 const liveQuery=useCachedQuery<{items:StudentLiveClass[];serverNow?:string}>(preview?null:`student-dashboard:live:${me}`,()=>pb.send('/api/laras/student-scheduled-classes?includePast=1',{method:'GET',requestKey:null}));
 const runsQuery=useCachedQuery<{items:BuilderRunItem[]}>(preview?null:`student-dashboard:runs:${me}`,()=>deliveryRequest('list'));
 useEffect(()=>{const server=Date.parse(liveQuery.data?.serverNow||'');if(Number.isFinite(server)){const local=Date.now();setClockOffset(server-local);setLocalNow(local);}},[liveQuery.data]);
 const reloadLive=liveQuery.reload,reloadRuns=runsQuery.reload;
 useEffect(()=>{if(preview)return;const refresh=()=>{if(document.visibilityState==='visible'){reloadLive();reloadRuns();}};const timer=window.setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[preview,reloadLive,reloadRuns]);
 const courses=useMemo(()=>{const ids=new Set((enrollmentsQuery.data||[]).map(e=>e.course));return (coursesQuery.data||[]).filter(c=>preview?c.owner===me:ids.has(c.id));},[coursesQuery.data,enrollmentsQuery.data,me,preview]);
 const courseMap=useMemo(()=>new Map(courses.map(c=>[c.id,c])),[courses]);
 const classes=useMemo(()=>dashboardClasses(liveQuery.data?.items||[],runsQuery.data?.items||[],now),[liveQuery.data,runsQuery.data,now]);
 const work=useMemo(()=>{
  const submissions=new Map<string,AssignmentSubmission>();for(const s of submissionsQuery.data||[])if(!submissions.has(s.assignment))submissions.set(s.assignment,s);
  const rows:Work[]=[];
  for(const a of assignmentsQuery.data||[]){const course=courseMap.get(a.course);if(!course||a.status==='draft'||activityTypeOf(a)!=='formal')continue;const s=submissions.get(a.id);const status=s?.status==='draft'?'draft':s?.status==='revision'?'revision':s?.status==='graded'?'feedback':!s?'assigned':null;if(status)rows.push({id:a.id,title:a.title,course:course.title,deadline:a.deadline,href:studentWorkPath(a.id),status});}
  for(const run of runsQuery.data?.items||[]){if(run.kind!=='tugas')continue;if(run.startsAt&&Date.parse(run.startsAt)>now)continue;const status=run.submittedAt?(run.feedbackReady?'feedback':null):run.startedAt?'draft':'assigned';if(status!=='feedback'&&(run.closed||Boolean(run.closesAt&&Date.parse(run.closesAt)<=now)))continue;if(status)rows.push({id:run.id,title:run.title,course:run.courseTitle,deadline:run.dueAt,href:`/app/kegiatan/${run.id}`,status});}
  return orderByDeadline(rows);
 },[assignmentsQuery.data,submissionsQuery.data,courseMap,runsQuery.data,now]);
 const feedback=work.filter(item=>item.status==='feedback');
 const today=jakartaDay(now), [year,month]=today.split('-').map(Number);
 const monthStart=new Date(Date.UTC(year,month-1+monthOffset,1));
 const monthKey=monthStart.toISOString().slice(0,7);
 const firstOffset=(monthStart.getUTCDay()+6)%7;
 const daysInMonth=new Date(Date.UTC(monthStart.getUTCFullYear(),monthStart.getUTCMonth()+1,0)).getUTCDate();
 const days=Array.from({length:Math.ceil((firstOffset+daysInMonth)/7)*7},(_,i)=>i<firstOffset||i>=firstOffset+daysInMonth?'':`${monthKey}-${String(i-firstOffset+1).padStart(2,'0')}`);
 const selectedDay=calendarDay.startsWith(monthKey)?calendarDay:(monthKey===today.slice(0,7)?today:`${monthKey}-01`);
 const calendarClasses=useMemo(()=>[...(liveQuery.data?.items||[]).map(item=>({id:item.id,source:'scheduled',title:item.title,courseTitle:item.courseTitle,startsAt:item.startsAt,href:`/app/courses/${item.courseId}/pertemuan/${item.sessionId}/terjadwal`})),...classes.filter(item=>item.source==='builder')],[liveQuery.data,classes]);
 const dayEvents=calendarClasses.filter(item=>jakartaDay(item.startsAt)===selectedDay);
 const coursesLoading=coursesQuery.loading||enrollmentsQuery.loading,workLoading=coursesLoading||assignmentsQuery.loading||submissionsQuery.loading||runsQuery.loading;
 const courseError=coursesQuery.error||enrollmentsQuery.error;
 const retryCourses=()=>{coursesQuery.reload();enrollmentsQuery.reload();};
 const liveError=liveQuery.error||runsQuery.error;
 const liveItems=classes.filter(item=>item.phase==='live');const upcoming=classes.filter(item=>item.phase==='upcoming'&&Date.parse(item.startsAt)<=now+30*60*1000);const shown=liveItems.length?liveItems:upcoming.slice(0,3);
 const showClassSection=shown.length>0||Boolean(liveError)||(!preview&&(liveQuery.loading||runsQuery.loading)&&!classes.length);
 const name=String(user?.name||'').trim().split(/\s+/)[0];
 return <AppShell title={l.eyebrow} eyebrow={l.eyebrow} variant="saas" hideHeading><div className="sd2-dashboard">
  {preview&&<div className="sd2-preview">{l.preview} <Link to="/app">{l.back}</Link></div>}
  <header className="sd2-header"><div><span>{l.eyebrow}</span><h1>{name?`${l.hello}, ${name}`:l.person}</h1><p>{l.intro}</p></div><div className="sd2-date"><CalendarDays size={17} aria-hidden="true"/>{new Intl.DateTimeFormat(language==='id'?'id-ID':language==='de'?'de-DE':'en-GB',{dateStyle:'full',timeZone:'Asia/Jakarta'}).format(new Date(now))}</div></header>
  {showClassSection&&<section className="sd2-live-section" aria-labelledby="sd2-live-heading"><h2 id="sd2-live-heading" className={liveItems.length?'sd2-sr':'sd2-live-heading'}>{liveItems.length?l.live:l.next}</h2>
   {liveError&&<SectionError onRetry={()=>{reloadLive();reloadRuns();}} labels={l}/>}
   {!preview&&(liveQuery.loading||runsQuery.loading)&&!classes.length?<div className="sd2-empty" role="status">{l.loading}</div>:shown.length?<div className="sd2-live-list">{shown.map(item=>{const locked=!item.checkedIn&&Boolean(item.joinUntil)&&Date.parse(item.joinUntil)<=now;return <article className={`sd2-live-card ${item.phase==='live'?'is-live':'is-upcoming'}`} key={`${item.source}:${item.id}`}><div className="sd2-live-symbol"><Radio size={23} aria-hidden="true"/></div><div className="sd2-live-body"><span className="sd2-live-label"><i aria-hidden="true"/>{item.phase==='live'?l.live:l.upcoming}</span><h3>{item.title}</h3><p>{item.courseTitle}</p><strong className="sd2-arrival">{classTimeLabel(item,now,language)}</strong><div className="sd2-time"><Clock3 size={15} aria-hidden="true"/><span>{item.phase==='live'?`${timingCopy[language].remaining}: ${sessionClock(Math.max(0,Math.ceil((Date.parse(item.endsAt)-now)/1000)))}`:`${l.starts}: ${dateLabel(item.startsAt,language)}`}</span></div>{locked&&item.phase==='live'&&<small className="sd2-live-note">{l.joinClosed}</small>}</div><Link className="sd2-primary" to={item.href}>{item.phase==='upcoming'||locked||item.finished?l.viewClass:item.checkedIn?l.resume:l.join}<ArrowRight size={17} aria-hidden="true"/></Link></article>;})}</div>:!liveError&&<div className="sd2-empty sd2-empty-live"><CalendarDays size={21} aria-hidden="true"/><div><strong>{l.noClass}</strong><p>{l.noClassHint}</p></div></div>}
   {liveItems.length>0&&upcoming.length>0&&<p className="sd2-next-line">{l.next}: {upcoming[0].title} · {dateLabel(upcoming[0].startsAt,language)}</p>}
  </section>}
  <div className="sd2-columns">
  <section className="sd2-panel" aria-labelledby="sd2-courses-heading"><div className="sd2-panel-head"><div><h2 id="sd2-courses-heading">{l.courses}</h2><p>{l.coursesHint}</p></div><Link className="sd2-text-link" to="/app/courses">{l.allCourses}<ArrowRight size={15}/></Link></div>
   {courseError&&<SectionError onRetry={retryCourses} labels={l}/>}
   {coursesLoading?<div className="sd2-empty" role="status">{l.loading}</div>:courses.length?<ul className="sd2-course-list">{courses.map(course=><li key={course.id}><Link to={`/app/courses/${courseRouteId(course)}`} className="sd2-course"><CourseThumb course={course}/><span><strong>{course.title}</strong><small>{[course.code,course.semester].filter(Boolean).join(' · ')}</small></span><ArrowRight size={17} aria-hidden="true"/></Link></li>)}</ul>:!courseError&&<div className="sd2-empty"><BookOpen size={22} aria-hidden="true"/><div><strong>{l.emptyCourses}</strong><p>{l.emptyCoursesHint}</p><Link to="/app/courses">{l.allCourses} <ArrowRight size={14}/></Link></div></div>}
  </section></div>
  <section className="sd2-panel sd2-calendar" aria-labelledby="sd2-calendar-heading"><div className="sd2-panel-head"><h2 id="sd2-calendar-heading">{l.calendar}</h2><div className="sd2-month-nav"><button type="button" aria-label={language==='de'?'Vorheriger Monat':language==='id'?'Bulan sebelumnya':'Previous month'} onClick={()=>setMonthOffset(v=>v-1)}><ChevronLeft size={20}/></button><strong>{new Intl.DateTimeFormat(language==='id'?'id-ID':language==='de'?'de-DE':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(monthStart)}</strong><button type="button" aria-label={language==='de'?'Nächster Monat':language==='id'?'Bulan berikutnya':'Next month'} onClick={()=>setMonthOffset(v=>v+1)}><ChevronRight size={20}/></button></div></div>
   <div className="sd2-calendar-weekdays">{Array.from({length:7},(_,i)=><span key={i}>{new Intl.DateTimeFormat(language==='id'?'id-ID':language==='de'?'de-DE':'en-GB',{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,10,2+i)))}</span>)}</div>
   <div className="sd2-calendar-days">{days.map((day,i)=>day?<button type="button" key={day} aria-pressed={selectedDay===day} aria-label={new Intl.DateTimeFormat(language==='id'?'id-ID':language==='de'?'de-DE':'en-GB',{dateStyle:'full',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`))} onClick={()=>setCalendarDay(day)}><strong className={day===today?'is-today':''}>{Number(day.slice(-2))}</strong><i className={calendarClasses.some(item=>jakartaDay(item.startsAt)===day)?'has-events':''} aria-hidden="true"/></button>:<span key={`empty-${i}`}/>)}</div>
   {liveError?<div className="sd2-calendar-note">{l.error}</div>:liveQuery.loading||runsQuery.loading?<div className="sd2-calendar-note" role="status">{l.loading}</div>:dayEvents.length?<ul className="sd2-calendar-events">{dayEvents.map(event=><li key={`${event.source}:${event.id}`}><Link to={event.href}><span className="sd2-event-icon is-class"><Radio size={15}/></span><span><strong>{event.title}</strong><small>{event.courseTitle}</small></span><time>{new Intl.DateTimeFormat(language==='id'?'id-ID':language==='de'?'de-DE':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(event.startsAt))} WIB</time><ArrowRight size={15} aria-hidden="true"/></Link></li>)}</ul>:<p className="sd2-calendar-note">{language==='de'?'Kein Unterricht an diesem Tag.':language==='id'?'Tidak ada kelas pada hari ini.':'No classes on this day.'}</p>}
  </section>
  {!workLoading&&feedback.length>0&&<section className="sd2-panel sd2-feedback" aria-labelledby="sd2-feedback-heading"><div className="sd2-panel-head"><div><h2 id="sd2-feedback-heading">{l.feedbackTitle}</h2><p>{l.feedbackHint}</p></div></div><ul>{feedback.slice(0,3).map(item=><li key={`${item.href}:${item.id}`}><Link to={item.href}><MessageCircle size={18} aria-hidden="true"/><span><strong>{item.title}</strong><small>{item.course}</small></span><b>{l.feedback} <ArrowRight size={15}/></b></Link></li>)}</ul></section>}
 </div></AppShell>;
}
