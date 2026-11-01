import {sessionClock} from '@/lib/session-clock';
import {StudentPreviewDock} from '../student-preview-dock';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ListChecks } from 'lucide-react';
import { BuilderPreview } from './builder-elements';
import { StudentActivityHeading, StudentPreviewAnswerFooter, StudentPreviewNavigation } from '../student-classroom-ui';
import { plain, questionIds, type BuilderDocument } from '@/lib/builder-document';
export function BuilderJourneyPreview({document,exitTo,tools}:{document:BuilderDocument;exitTo:string;tools?:ReactNode}){
 const [toolbar,setToolbar]=useState(false);
 const [answers,setAnswers]=useState<Record<string,string>>({}),[index,setIndex]=useState(0),[submitted,setSubmitted]=useState<string[]>([]),[started,setStarted]=useState(0),[now,setNow]=useState(Date.now()),[notice,setNotice]=useState('');
 const heading=useRef<HTMLHeadingElement>(null),top=useRef<HTMLDivElement>(null);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
 const activity=document.activities[index];if(!activity)return <p>Tambahkan kegiatan untuk mencoba alurnya.</p>;
 const limitMinutes=document.kind==='kelas'?(Date.parse(document.delivery.endsAt)>Date.parse(document.delivery.startsAt)?(Date.parse(document.delivery.endsAt)-Date.parse(document.delivery.startsAt))/60000:document.activities.reduce((sum,a)=>sum+a.plannedMinutes,0)):document.delivery.timeLimitMinutes;
 const seconds=Math.max(0,Math.ceil(((started||now)+limitMinutes*60000-now)/1000));
 const taskSubmitted=document.kind==='tugas'&&submitted.length===document.activities.length;
 const readOnly=submitted.includes(activity.id)||Boolean(limitMinutes>0&&started&&seconds===0);
 const hasNext=index<document.activities.length-1;
 const go=(next:number)=>{setIndex(Math.max(0,Math.min(next,document.activities.length-1)));setNotice('');requestAnimationFrame(()=>{top.current?.scrollIntoView({block:'start',behavior:'instant'});heading.current?.focus({preventScroll:true});});};
 const submit=()=>{
  if(taskSubmitted||document.kind==='kelas'&&submitted.includes(activity.id))return true;
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
   <details className="bd-preview-simulation"><summary>Pengaturan simulasi waktu</summary><div className="bd-inline-actions"><button className="bd-secondary" onClick={()=>{setStarted(Date.now());setNotice('Simulasi waktu dimulai.');}}>Mulai simulasi waktu</button><span>{limitMinutes>0?`${limitMinutes} menit`:'Tanpa batas waktu'}</span><button className="bd-secondary" onClick={()=>{setAnswers({});setSubmitted([]);setStarted(0);setNotice('Simulasi direset.');}}>Reset simulasi</button></div></details>
  </section>}
  <div className="sc-student-grid"><section className="sc-card sc-workspace">
   {navigation()}
   <div className="sc-workspace-top"><span className="sc-activity-type">{questionCount?<ListChecks size={16}/>:<BookOpen size={16}/>}<span>{questionCount?'Latihan':'Materi'}</span><span>· Kegiatan {index+1} dari {document.activities.length}</span><span className={`sc-requirement ${activity.required?'is-required':''}`}>{activity.required?'Wajib':'Opsional'}</span><span>{activity.plannedMinutes} menit</span></span></div>
   <StudentActivityHeading headingRef={heading} title={activity.title} clockLabel={started&&limitMinutes>0?'Sisa waktu sesi':limitMinutes>0?'Batas waktu':'Tanpa batas waktu'} clockValue={limitMinutes>0?(started?sessionClock(seconds):sessionClock(limitMinutes*60)):'—'} urgent={Boolean(started&&limitMinutes>0&&seconds<=60)}/>
   <BuilderPreview document={document} activityId={activity.id} answers={answers} onAnswersChange={next=>{setAnswers(next);setNotice('');}} readOnly={readOnly} live classroom/>
   {notice&&<p className="sc-preview-save" role="status">{notice}</p>}
   <StudentPreviewAnswerFooter canNext={hasNext} onSave={()=>setNotice('Jawaban percobaan tersimpan selama pratinjau ini.')} onNext={()=>{if(document.kind==='tugas'&&hasNext){go(index+1);return;}if(submit()&&hasNext)go(index+1);}} actionLabel={document.kind==='kelas'&&hasNext?'Kumpulkan & berikutnya':undefined}/>
  </section></div>

 </div>;
}
