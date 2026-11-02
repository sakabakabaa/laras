import {sessionClock} from '@/lib/session-clock';
import {StudentPreviewDock} from '../student-preview-dock';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ListChecks } from 'lucide-react';
import { BuilderPreview } from './builder-elements';
import { StudentActivityHeading, StudentPreviewAnswerFooter, StudentPreviewNavigation } from '../student-classroom-ui';
import { plain, questionIds, type BuilderDocument } from '@/lib/builder-document';
import { getBuilderPreviewPolicy, type BuilderPreviewScenario } from '@/lib/builder-preview-policy';
export function BuilderJourneyPreview({document,exitTo,tools}:{document:BuilderDocument;exitTo:string;tools?:ReactNode}){
 const [toolbar,setToolbar]=useState(false);
 const [answers,setAnswers]=useState<Record<string,string>>({}),[index,setIndex]=useState(0),[submitted,setSubmitted]=useState<string[]>([]),[started,setStarted]=useState(0),[now,setNow]=useState(Date.now()),[notice,setNotice]=useState(''),[scenario,setScenario]=useState<BuilderPreviewScenario>('automatic');
 const heading=useRef<HTMLHeadingElement>(null),top=useRef<HTMLDivElement>(null);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
 const activity=document.activities[index];if(!activity)return <p>Tambahkan kegiatan untuk mencoba alurnya.</p>;
 const limitMinutes=document.kind==='kelas'?(Date.parse(document.delivery.endsAt)>Date.parse(document.delivery.startsAt)?(Date.parse(document.delivery.endsAt)-Date.parse(document.delivery.startsAt))/60000:document.activities.reduce((sum,a)=>sum+a.plannedMinutes,0)):document.delivery.timeLimitMinutes;
 const classDeadline=Date.parse(document.delivery.endsAt);
 const seconds=Math.max(0,Math.ceil(((document.kind==='kelas'&&scenario==='automatic'&&Number.isFinite(classDeadline)?classDeadline:(started||now)+limitMinutes*60000)-now)/1000));
 const taskSubmitted=document.kind==='tugas'&&submitted.length===document.activities.length;
 const policy=getBuilderPreviewPolicy({kind:document.kind,now,startsAt:document.delivery.startsAt,endsAt:document.delivery.endsAt,checkInClosesAt:document.delivery.checkInClosesAt,lateAfterMinutes:document.delivery.lateAfterMinutes,availableAt:document.delivery.availableAt,dueAt:document.delivery.dueAt,hardCloseAt:document.delivery.hardCloseAt,allowLate:document.delivery.allowLate,scenario,checkedIn:scenario!=='check-in-closed',submitted:submitted.includes(activity.id),timeLimitExpired:Boolean(limitMinutes>0&&started&&seconds===0)});
 const readOnly=submitted.includes(activity.id)||!policy.canWork;
 const hasNext=index<document.activities.length-1;
 const go=(next:number)=>{setIndex(Math.max(0,Math.min(next,document.activities.length-1)));setNotice('');requestAnimationFrame(()=>{top.current?.scrollIntoView({block:'start',behavior:'instant'});heading.current?.focus({preventScroll:true});});};
 const submit=()=>{
  if(taskSubmitted||document.kind==='kelas'&&submitted.includes(activity.id))return true;
  if(!policy.canSubmit){setNotice(policy.state==='before-opening'?'Kegiatan belum dibuka.':policy.state==='check-in-closed'?'Check-in sudah ditutup.':policy.state==='expired'?'Waktu pengumpulan sudah berakhir.':policy.late?'Pengumpulan terlambat tidak diizinkan.':'Pengiriman tidak tersedia pada simulasi ini.');return false;}
  const targets=document.kind==='tugas'?document.activities:[activity];
  if(!(limitMinutes>0&&started&&seconds===0)){
   const missing=targets.flatMap(a=>a.blocks.flatMap(questionIds)).some(id=>document.questionsById[id]?.required&&!answers[id]?.trim());
   if(missing||targets.some(a=>a.required&&a.blocks.some(b=>b.type==='acknowledgement'&&answers[b.id]!=='yes'))){setNotice('Lengkapi semua jawaban wajib terlebih dahulu.');return false;}
  }
  setSubmitted([...new Set([...submitted,...targets.map(a=>a.id)])]);setNotice('Pengiriman percobaan selesai. Tidak ada kiriman mahasiswa yang dibuat.');return true;
 };
 const navigation=()=> <StudentPreviewNavigation index={index} total={document.activities.length} onChange={go}/>;
 const questionCount=activity.blocks.flatMap(questionIds).length;
 return <div className="sc-classroom sc-student bd-classroom-preview">
  <div ref={top}><StudentPreviewDock toolsVisible={toolbar} onToggleTools={()=>setToolbar(value=>!value)} exitTo={exitTo}/></div>
  {toolbar&&<section id="bd-preview-tools" className="sc-card sc-fields bd-classroom-preview-controls">
   {tools}<h2>Alat dosen</h2><p>Simulasi tampilan mahasiswa. Jawaban hanya disimpan selama pratinjau ini dan tidak menjadi kiriman mahasiswa.</p>
   {navigation()}<label>Lihat kegiatan<select aria-label="Lihat kegiatan" value={index} onChange={e=>go(Number(e.target.value))}>{document.activities.map((a,i)=><option key={a.id} value={i}>{i+1}. {a.title}</option>)}</select></label>
   {plain(document.instructions)&&<details className="sc-student-instructions"><summary>Instruksi umum</summary><p className="sc-prose">{plain(document.instructions)}</p></details>}
   <details className="bd-preview-simulation">
    <summary>Pengaturan simulasi waktu</summary>
    <label>Keadaan simulasi<select aria-label="Keadaan simulasi" value={scenario} onChange={e=>{setScenario(e.target.value as BuilderPreviewScenario);setStarted(0);setNotice('');}}>
     <option value="automatic">Otomatis sesuai waktu</option>
     <option value="before-opening">Sebelum dibuka</option>
     <option value="on-time">Check-in / pengumpulan tepat waktu</option>
     {document.kind==='kelas'?<><option value="late-check-in">Check-in terlambat</option><option value="check-in-closed">Check-in ditutup (belum bergabung)</option></>:<option value="late-submission">Pengumpulan terlambat</option>}
     <option value="expired">Kedaluwarsa</option><option value="submitted">Sudah dikumpulkan</option><option value="offline">Offline (simulasi)</option>
    </select></label>
    <p role="status">{policy.offline?'Mode offline hanya simulasi; jawaban dapat diedit tetapi tidak dikirim. Pratinjau ini tidak membuat permintaan jaringan.':policy.state==='late-check-in'?'Simulasi check-in terlambat.':`Keadaan: ${policy.state}.`}</p>
    <div className="bd-inline-actions"><button type="button" className="bd-secondary" onClick={()=>{setStarted(Date.now());setNotice('Simulasi waktu dimulai.');}}>Mulai simulasi waktu</button><span>{limitMinutes>0?`${limitMinutes} menit`:'Tanpa batas waktu'}</span><button type="button" className="bd-secondary" onClick={()=>{setAnswers({});setSubmitted([]);setStarted(0);setScenario('automatic');setNotice('Simulasi direset.');}}>Reset simulasi</button></div>
   </details>
  </section>}
  <div className="sc-student-grid"><section className="sc-card sc-workspace">
   {navigation()}
   <div className="sc-workspace-top"><span className="sc-activity-type">{questionCount?<ListChecks size={16}/>:<BookOpen size={16}/>}<span>{questionCount?'Latihan':'Materi'}</span><span>· Kegiatan {index+1} dari {document.activities.length}</span><span className={`sc-requirement ${activity.required?'is-required':''}`}>{activity.required?'Wajib':'Opsional'}</span><span>{activity.plannedMinutes} menit</span></span></div>
   <StudentActivityHeading headingRef={heading} title={activity.title} clockLabel={(started||document.kind==='kelas')&&limitMinutes>0?'Sisa waktu sesi':limitMinutes>0?'Batas waktu':'Tanpa batas waktu'} clockValue={limitMinutes>0?(started||document.kind==='kelas'?sessionClock(seconds):sessionClock(limitMinutes*60)):'—'} urgent={Boolean((started||document.kind==='kelas')&&limitMinutes>0&&seconds<=60)}/>
   <BuilderPreview document={document} activityId={activity.id} answers={answers} onAnswersChange={next=>{setAnswers(next);setNotice('');}} readOnly={readOnly} live classroom/>
   {notice&&<p className="sc-preview-save" role="status">{notice}</p>}
   <StudentPreviewAnswerFooter canNext={hasNext} onSave={()=>setNotice('Jawaban percobaan tersimpan selama pratinjau ini.')} onNext={()=>{if(document.kind==='tugas'&&hasNext){go(index+1);return;}if(submit()&&hasNext)go(index+1);}} actionLabel={document.kind==='kelas'&&hasNext?'Kumpulkan & berikutnya':undefined}/>
  </section></div>

 </div>;
}
