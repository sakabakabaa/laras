import {useEffect,useState} from 'react';
import {scheduledAiRequest} from '@/lib/scheduled-class-ai-client';
import type {ScheduledAcademicContext,ScheduledAiDraft,ScheduledAiProposal} from '@/lib/scheduled-class-ai';

export function AcademicChoices({label,options,value,onChange}:{label:string;options:{id:string;title:string}[];value:string[];onChange:(ids:string[])=>void}){
 return <label>{label}<select aria-label={label} multiple size={Math.min(4,Math.max(2,options.length))} value={value} onChange={e=>onChange(Array.from(e.target.selectedOptions,o=>o.value))}>{options.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</select><small>Ctrl / ⌘ untuk memilih beberapa.</small></label>;
}
export function ScheduledClassAiPanel({sessionId,onContext,onApply}:{sessionId:string;onContext:(c:ScheduledAcademicContext)=>void;onApply:(draft:ScheduledAiDraft)=>void}){
 const [context,setContext]=useState<ScheduledAcademicContext|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [materialIds,setMaterials]=useState<string[]>([]),[cpmkIds,setCpmks]=useState<string[]>([]),[subCpmkIds,setSubs]=useState<string[]>([]),[minutes,setMinutes]=useState(90),[instruction,setInstruction]=useState(''),[quiz,setQuiz]=useState(true),[proposal,setProposal]=useState<ScheduledAiProposal|null>(null);
 useEffect(()=>{let active=true;void scheduledAiRequest<{context:ScheduledAcademicContext}>(sessionId,'context').then(({context:c})=>{if(!active)return;setContext(c);onContext(c);setCpmks(c.session.cpmkIds);setSubs(c.session.subCpmkIds);}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[sessionId,onContext]);
 const generate=async()=>{setBusy(true);setError('');setProposal(null);try{const {proposal:p}=await scheduledAiRequest<{proposal:ScheduledAiProposal}>(sessionId,'generate',{materialIds,cpmkIds,subCpmkIds,minutes,instruction,includeQuiz:quiz});setProposal(p);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <section className="sc-card"><h2>RPS, materi, dan pembuat AI</h2>{loading&&<p>Memuat konteks pertemuan…</p>}{error&&<p role="alert" className="sc-alert">{error}</p>}{context&&<>
 <p><strong>{context.session.topic||context.session.title}</strong></p><p className="sc-prose">{context.session.learningIndicator}</p><p className="sc-prose">{context.session.learningMaterial}</p>{context.lessonPlan&&<p>Rencana pembelajaran tersimpan: {context.lessonPlan.title}. AI juga mempertimbangkan tujuan dan kegiatannya.</p>}
 <fieldset disabled={busy} className="sc-fields"><div className="sc-grid">
 <AcademicChoices label="Materi untuk AI (maksimal 4)" options={context.materials.filter(m=>m.aiReady).map(m=>({id:m.id,title:`${m.title} · v${m.version}${m.access==='student'?'':' · hanya dosen'}`}))} value={materialIds} onChange={setMaterials}/>
 <AcademicChoices label="CPMK sasaran" options={context.cpmks.map(c=>({id:c.id,title:`${c.code} — ${c.description}`}))} value={cpmkIds} onChange={setCpmks}/>
 <AcademicChoices label="Sub-CPMK sasaran" options={context.subCpmks.map(c=>({id:c.id,title:`${c.code} — ${c.description}`}))} value={subCpmkIds} onChange={setSubs}/>
 <label>Total durasi (menit)<input type="number" min={10} max={240} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label></div>
 <label>Arahan tambahan<textarea rows={2} maxLength={1500} value={instruction} onChange={e=>setInstruction(e.target.value)}/></label><label className="sc-check"><input type="checkbox" checked={quiz} onChange={e=>setQuiz(e.target.checked)}/>Sertakan kuis dari materi terpilih</label>
 <p>Materi AI memerlukan kutipan yang disetujui di Konteks AI pada Berkas. Tanpa berkas, AI memakai RPS untuk kegiatan tanpa kuis. Berkas khusus dosen digunakan sebagai sumber AI; isi draf tetap perlu ditinjau sebelum dibagikan.</p>
 <button onClick={()=>void generate()} disabled={materialIds.length>4}>{busy?'Membuat draf…':'Buat dengan AI'}</button></fieldset>
 {proposal&&<section aria-label="Usulan AI"><h3>Usulan: {proposal.draft.title}</h3><p className="sc-prose">{proposal.draft.instructions}</p><p>Sumber: {proposal.sources.map(s=>`${s.title} v${s.version}`).join(', ')||'RPS pertemuan'}</p>{proposal.draft.notes.map((n,i)=><p key={i}>{n}</p>)}<ol>{proposal.draft.activities.map((a,i)=><li key={i}><strong>{a.title} · {a.minutes} menit</strong><p className="sc-prose">{a.content}</p>{a.questions.map((q,j)=><details key={j}><summary>{q.text}</summary><p>{q.options.join(' / ')}</p><p>Kunci usulan: {q.options[q.correctIndex]} · {q.explanation}</p><blockquote>{q.sourceQuote}</blockquote></details>)}</li>)}</ol><p>Tinjau fakta, kesesuaian capaian, instruksi, dan kunci jawaban. Menerapkan usulan mengganti isi editor; jadwal tetap Anda tentukan.</p><button className="sc-primary" onClick={()=>{onApply(proposal.draft);}}>Terapkan ke editor</button></section>}
 </>}</section>;
}
