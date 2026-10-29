import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,CheckCheck,FileCheck2,MessageSquare,Search,Send,Settings2,Users} from 'lucide-react';
import {activityBookReference} from '@/lib/scheduled-book-reference';
import type {ClassReportRow,ScheduledClassState} from '@/lib/scheduled-classes';
import {buildAssessmentPayload,buildGradingSettingsPayload,buildPublishPayload,emptyGradeDraft,hydrateGradeDraft,validateManualGrade,type GradeDraftState} from '@/lib/scheduled-review';
import {ASSESSMENT_LABELS,assessmentStatus,manualActivities,responseCards} from '@/lib/scheduled-session-workspace';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';

type Selection={student?:string;activity?:string};
type Props={state:ScheduledClassState;onAction:(action:string,body?:Record<string,unknown>)=>Promise<void>;onDirtyChange?:(dirty:boolean)=>void;initialSelection?:Selection;onSelectionChange?:(selection:Selection)=>void};
type CriterionDraft={id:string;label:string;maxPoints:string};
const personKey=(row:ClassReportRow)=>row.student||row.roster;
export function ScheduledReviewWorkspace({state,onAction,onDirtyChange,initialSelection,onSelectionChange}:Props){
  const activities=manualActivities(state.activities);
  const attempts=state.attempts.filter(a=>a.status!=='draft'&&activities.some(activity=>activity.id===a.activity));
  const [studentKey,setStudentKey]=useState(initialSelection?.student||attempts[0]?.student||personKey(state.report[0]||{student:'',roster:''} as ClassReportRow));
  const [activityId,setActivityId]=useState(initialSelection?.activity||activities[0]?.id||'');
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
  const [draft,setDraft]=useState<GradeDraftState>(emptyGradeDraft),[savedDraft,setSavedDraft]=useState(JSON.stringify(emptyGradeDraft));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false),[settingsEdited,setSettingsEdited]=useState(false);
  const [settingsMode,setSettingsMode]=useState<'ungraded'|'points'|'rubric'>('ungraded'),[maxPoints,setMaxPoints]=useState('10');
  const [criteria,setCriteria]=useState<CriterionDraft[]>([{id:'clarity',label:'Kejelasan',maxPoints:'10'}]);
  const student=state.report.find(r=>personKey(r)===studentKey)||state.report[0];
  const activity=activities.find(a=>a.id===activityId)||activities[0];
  const attempt=attempts.find(a=>a.student===student?.student&&a.activity===activity?.id);
  const assessment=state.assessments?.find(a=>a.attempt===attempt?.id);
  const settings=state.gradingSettings?.find(s=>s.activity===activity?.id);
  const canGrade=['closed','reviewed'].includes(state.class?.phase||'');
  const lockedSettings=state.assessments?.some(a=>a.activity===activity?.id);
  const dirty=JSON.stringify(draft)!==savedDraft;
  const unsaved=dirty||settingsEdited;
  const attemptId=attempt?.id||null,ownerRef=useRef<string|null>(attemptId);
  const status=assessmentStatus(assessment);
  const loadSettings=()=>{setSettingsMode(settings?.mode||'ungraded');setMaxPoints(String(settings?.maxPoints||10));setCriteria(settings?.criteria.map(c=>({...c,maxPoints:String(c.maxPoints)}))||[{id:'clarity',label:'Kejelasan',maxPoints:'10'}]);setSettingsEdited(false);};
  useEffect(()=>{loadSettings();},[activity?.id,settings?.revision]);
  useEffect(()=>{
    const next=hydrateGradeDraft(draft,ownerRef.current,attemptId,assessment,dirty);
    if(next.changedIdentity||!dirty){setDraft(next.draft);setSavedDraft(JSON.stringify(next.draft));ownerRef.current=attemptId;}
  },[attemptId,assessment?.revision,dirty]);
  useEffect(()=>{onDirtyChange?.(unsaved);return()=>onDirtyChange?.(false);},[unsaved,onDirtyChange]);
  useEffect(()=>{if(!unsaved)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[unsaved]);
  const guard=()=>!unsaved||window.confirm('Perubahan penilaian belum disimpan. Buang perubahan dan lanjutkan?');
  const select=(nextStudent:string,nextActivity=activity?.id||'')=>{
    if(nextStudent===personKey(student||{student:'',roster:''} as ClassReportRow)&&nextActivity===activity?.id)return;
    if(!guard())return;
    loadSettings();setStudentKey(nextStudent);setActivityId(nextActivity);setMessage('');onSelectionChange?.({student:nextStudent,activity:nextActivity});
  };
  const showError=(error:unknown)=>{setFailed(true);setMessage((error as Error).message||'Perubahan belum dapat disimpan. Coba lagi.');};
  const criteriaPayload=criteria.map(c=>({id:c.id,label:c.label.trim(),maxPoints:Number(c.maxPoints)}));
  const saveSettings=async()=>{
    if(!activity)return;
    if(settingsMode==='rubric'&&(!criteriaPayload.length||criteriaPayload.some(c=>!c.label||!Number.isFinite(c.maxPoints)||c.maxPoints<=0)||Math.abs(criteriaPayload.reduce((sum,c)=>sum+c.maxPoints,0)-Number(maxPoints))>1e-8)){showError(new Error('Lengkapi kriteria rubrik. Total poin kriteria harus sama dengan nilai maksimum.'));return;}
    setBusy(true);setFailed(false);
    try{await onAction('saveGradingSettings',buildGradingSettingsPayload({activityId:activity.id,settingsRevision:settings?.revision||0,mode:settingsMode,maxPoints:settingsMode==='ungraded'?0:Number(maxPoints),criteria:settingsMode==='rubric'?criteriaPayload:[]}));setSettingsEdited(false);setSettingsOpen(false);setMessage('Pengaturan penilaian tersimpan untuk kegiatan ini.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const saveGrade=async(reviewStatus:'draft'|'reviewed',next=false)=>{
    if(!attempt||!settings)return;
    const scores:Record<string,number>={};for(const [id,value] of Object.entries(draft.criterionScores))if(value!=='')scores[id]=Number(value);
    if(settings.mode==='points'&&draft.points.trim()===''){showError(new Error('Isi nilai sebelum menyimpan penilaian.'));return;}
    const points=settings.mode==='ungraded'?null:settings.mode==='rubric'?settings.criteria.reduce((sum,c)=>sum+(scores[c.id]||0),0):Number(draft.points);
    const grade={points,criterionScores:settings.mode==='rubric'?scores:{}};
    const error=validateManualGrade(settings,grade);if(error){showError(new Error(error));return;}
    const ordered=state.report.flatMap(row=>activities.flatMap(a=>attempts.filter(t=>t.student===row.student&&t.activity===a.id)));
    const nextAttempt=ordered.slice(ordered.findIndex(t=>t.id===attempt.id)+1).find(t=>!state.assessments?.some(g=>g.attempt===t.id&&g.status==='reviewed'));
    setBusy(true);setFailed(false);
    try{await onAction('saveAssessment',buildAssessmentPayload({attemptId:attempt.id,assessmentRevision:assessment?.revision||0,attemptRevision:attempt.revision,settingsRevision:settings.revision,status:reviewStatus,...grade,feedback:draft.feedback}));setSavedDraft(JSON.stringify(draft));setMessage(reviewStatus==='draft'?'Draf penilaian tersimpan.':'Penilaian ditinjau. Terbitkan saat siap dibagikan kepada mahasiswa.');if(next&&nextAttempt){setStudentKey(nextAttempt.student);setActivityId(nextAttempt.activity);onSelectionChange?.({student:nextAttempt.student,activity:nextAttempt.activity});}}catch(e){showError(e);}finally{setBusy(false);}
  };
  const publish=async()=>{
    if(!attempt||!settings||!assessment||dirty||!window.confirm(`Terbitkan nilai dan umpan balik ${student?.name} untuk ${activity?.title}?`))return;
    setBusy(true);setFailed(false);
    try{await onAction('publishAssessment',buildPublishPayload({attemptId:attempt.id,assessmentRevision:assessment.revision||0,attemptRevision:attempt.revision,settingsRevision:settings.revision}));setMessage('Nilai dan umpan balik sudah diterbitkan kepada mahasiswa.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const studentAttempts=(row:ClassReportRow)=>attempts.filter(a=>a.student===row.student);
  const visibleStudents=state.report.filter(row=>`${row.name} ${row.nim}`.toLowerCase().includes(search.toLowerCase())).filter(row=>{
    const work=studentAttempts(row);return filter==='all'||(filter==='missing'&&!work.length)||work.some(a=>{const s=assessmentStatus(state.assessments?.find(g=>g.attempt===a.id));return filter==='unreviewed'?s==='unreviewed'||s==='draft':s===filter;});
  });
  const activeIndex=state.report.findIndex(r=>personKey(r)===personKey(student||{student:'',roster:''} as ClassReportRow));
  const reviewedCount=attempts.filter(a=>state.assessments?.some(g=>g.attempt===a.id&&g.status==='reviewed')).length;
  const cards=activity&&attempt?responseCards(activity,attempt):[];
  return <section className="sr-workspace" aria-label="Tinjau jawaban tugas">
    <div className="sr-toolbar"><div><h2>Jawaban & nilai</h2><p>{reviewedCount} dari {attempts.length} kiriman ditinjau</p></div><span className="sr-review-progress" aria-label={`${reviewedCount} dari ${attempts.length} ditinjau`}><span style={{width:`${attempts.length?reviewedCount/attempts.length*100:0}%`}}/></span></div>
    {!canGrade&&<p className="sr-notice"><ClockNotice/>Jawaban dapat dipantau sekarang. Penilaian dan penerbitan tersedia setelah kelas selesai.</p>}
    <div className="sr-review-grid">
      <aside className="sr-students" aria-label="Daftar mahasiswa"><div className="sr-student-tools"><label className="ss-search"><Search size={16}/><input aria-label="Cari mahasiswa untuk ditinjau" placeholder="Cari nama atau NIM..." value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filter penilaian" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Semua mahasiswa</option><option value="unreviewed">Belum ditinjau</option><option value="reviewed">Siap diterbitkan</option><option value="published">Diterbitkan</option><option value="missing">Belum mengirim</option></select><p>{visibleStudents.length} mahasiswa</p></div><ul>{visibleStudents.map(row=>{const work=studentAttempts(row),reviewed=work.filter(a=>state.assessments?.some(g=>g.attempt===a.id&&g.status==='reviewed')).length;return <li key={personKey(row)}><button aria-current={personKey(row)===personKey(student||{student:'',roster:''} as ClassReportRow)?'true':undefined} onClick={()=>select(personKey(row))}><span className="ss-avatar">{row.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('')}</span><span><strong>{row.name}</strong><small>{row.nim||'NIM belum tersedia'}</small><span className="sr-student-progress">{!work.length?'Belum ada kiriman':`${reviewed}/${work.length} ditinjau`}</span></span>{work.length>0&&reviewed===work.length&&<CheckCheck size={16}/>}</button></li>;})}</ul>{!visibleStudents.length&&<p className="sr-list-empty">Tidak ada mahasiswa yang sesuai.</p>}</aside>
      <div className="sr-answer-area">
        {student&&activity?<><header className="sr-answer-heading"><div className="ss-person"><span className="ss-avatar">{student.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('')}</span><div><h3>{student.name}</h3><p>{student.nim}</p></div></div><div className="sr-person-nav"><button className="ss-icon-button" aria-label="Mahasiswa sebelumnya" disabled={activeIndex<=0||busy} onClick={()=>select(personKey(state.report[activeIndex-1]))}><ArrowLeft size={17}/></button><span>{activeIndex+1}/{state.report.length}</span><button className="ss-icon-button" aria-label="Mahasiswa berikutnya" disabled={activeIndex>=state.report.length-1||busy} onClick={()=>select(personKey(state.report[activeIndex+1]))}><ArrowRight size={17}/></button></div></header>
        <label className="sr-activity-picker">Kegiatan<select value={activity.id} onChange={e=>select(personKey(student),e.target.value)}>{activities.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
        <div className="sr-answer-meta"><span className={`sr-review-status sr-status-${attempt?status:'missing'}`}>{attempt?ASSESSMENT_LABELS[status]:'Belum mengirim'}</span>{attempt&&<span>{attempt.status==='expired'?'Difinalisasi saat waktu habis':'Dikumpulkan'} · {attempt.complete?'Lengkap':'Belum lengkap'}</span>}</div>
        {(activityBookReference(activity)||activity.worksheet?.sourceLabel)&&<p className="ss-source-label"><BookOpen size={15}/>{activityBookReference(activity)||activity.worksheet?.sourceLabel}</p>}
        {attempt?<div className="sr-response-cards">{cards.map(card=><article className="sr-response-card" key={card.id}><div className="sr-question"><span className="sr-question-number">{card.number}</span><div><h4>{card.prompt}</h4>{card.translation&&<p>{card.translation}</p>}{card.options&&<small>Pilihan: {card.options.join(' · ')}</small>}</div></div><div className={`sr-answer-text${!card.answer?' is-empty':''}`}><span>Jawaban mahasiswa</span><p>{card.answer||'Belum dijawab'}</p></div></article>)}</div>:<div className="ss-empty sr-no-submission"><MessageSquare size={30}/><h3>Belum ada jawaban untuk kegiatan ini</h3><p>{student.checkedInAt?'Mahasiswa sudah check-in, tetapi belum mengirim jawaban ini.':'Mahasiswa belum tercatat check-in.'}</p></div>}
        </>:<div className="ss-empty"><Users size={30}/><h3>Belum ada jawaban tugas</h3><p>Jawaban tugas dan refleksi akan tampil di sini.</p></div>}
      </div>
      <aside className="sr-grading" aria-label="Penilaian mahasiswa"><div className="sr-grading-header"><h3>Penilaian</h3><button className="ss-icon-button" aria-label="Pengaturan penilaian kegiatan" disabled={!activity||busy} onClick={()=>{setFailed(false);setMessage('');setSettingsOpen(true);}}><Settings2 size={17}/></button></div>
        {!settings?<div className="sr-configure"><FileCheck2 size={26}/><h4>Atur penilaian kegiatan</h4><p>Pilih poin, rubrik, atau umpan balik tanpa nilai. Pengaturan berlaku untuk seluruh mahasiswa pada kegiatan ini.</p><button className="ss-button" disabled={!activity||!canGrade||busy} onClick={()=>setSettingsOpen(true)}>Atur penilaian</button></div>:<><p className="sr-grading-mode">{settings.mode==='ungraded'?'Umpan balik tanpa nilai':settings.mode==='rubric'?'Penilaian dengan rubrik':`Nilai maksimum ${settings.maxPoints}`}</p>
        {attempt&&<>{settings.mode==='points'&&<label className="sr-points">Nilai<div><input type="number" min="0" max={settings.maxPoints} step="any" disabled={!canGrade||busy} value={draft.points} onChange={e=>setDraft(d=>({...d,points:e.target.value}))}/><span>/ {settings.maxPoints}</span></div></label>}{settings.mode==='rubric'&&<fieldset className="sr-rubric-scores"><legend>Nilai per kriteria</legend>{settings.criteria.map(c=><label key={c.id}><span>{c.label}<small>Maks. {c.maxPoints}</small></span><input aria-label={`Nilai ${c.label}`} type="number" min="0" max={c.maxPoints} step="any" disabled={!canGrade||busy} value={draft.criterionScores[c.id]??''} onChange={e=>setDraft(d=>({...d,criterionScores:{...d.criterionScores,[c.id]:e.target.value}}))}/></label>)}<p>Total <strong>{settings.criteria.reduce((sum,c)=>sum+Number(draft.criterionScores[c.id]||0),0)} / {settings.maxPoints}</strong></p></fieldset>}
        <label className="sr-feedback">Umpan balik<textarea rows={7} placeholder="Tulis komentar untuk mahasiswa..." maxLength={10000} disabled={!canGrade||busy} value={draft.feedback} onChange={e=>setDraft(d=>({...d,feedback:e.target.value}))}/></label><p className="sr-draft-hint">{dirty?'Perubahan belum disimpan.':assessment?'Penilaian tersimpan.':'Belum ada penilaian tersimpan.'}</p>
        <div className="sr-save-actions"><button className="ss-button" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('draft')}>Simpan draf</button><button className="ss-button" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('reviewed')}>Ditinjau</button><button className="ss-button ss-button-primary" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('reviewed',true)}>Simpan & berikutnya<ArrowRight size={16}/></button></div>
        {assessment?.status==='reviewed'&&<div className="sr-publish"><p>{status==='published'?'Mahasiswa dapat melihat penilaian ini.':'Siap dibagikan kepada mahasiswa.'}</p><button className="ss-button" disabled={!canGrade||busy||dirty||status==='published'} onClick={()=>void publish()}><Send size={15}/>{status==='published'?'Sudah diterbitkan':'Terbitkan penilaian'}</button></div>}</>}
        {!attempt&&<p className="sr-notice">Pilih kiriman mahasiswa untuk memberikan penilaian.</p>}</>}
        {message&&<p className={`sr-message${failed?' is-error':''}`} role={failed?'alert':'status'}>{message}</p>}
      </aside>
    </div>
    <Dialog open={settingsOpen} onOpenChange={open=>{if(!open&&settingsEdited){if(!window.confirm('Buang perubahan pengaturan penilaian?'))return;loadSettings();}setSettingsOpen(open);}}><DialogContent className="ss-create-dialog sr-settings-dialog"><DialogHeader><DialogTitle>Pengaturan penilaian</DialogTitle><DialogDescription>{activity?.title} · Berlaku untuk seluruh mahasiswa pada kegiatan ini.</DialogDescription></DialogHeader>{lockedSettings&&<p className="sr-notice">Pengaturan dikunci karena penilaian sudah dibuat.</p>}<label>Mode penilaian<select disabled={lockedSettings||!canGrade} value={settingsMode} onChange={e=>{setSettingsMode(e.target.value as typeof settingsMode);setSettingsEdited(true);}}><option value="ungraded">Tanpa nilai — umpan balik saja</option><option value="points">Poin</option><option value="rubric">Rubrik</option></select></label>{settingsMode!=='ungraded'&&<label>Nilai maksimum<input type="number" min="1" max="100000" disabled={lockedSettings||!canGrade} value={maxPoints} onChange={e=>{setMaxPoints(e.target.value);setSettingsEdited(true);}}/></label>}{settingsMode==='rubric'&&<div className="sr-criteria-editor">{criteria.map((c,i)=><div key={c.id}><label>Kriteria {i+1}<input value={c.label} disabled={lockedSettings||!canGrade} onChange={e=>{setCriteria(prev=>prev.map((r,j)=>j===i?{...r,label:e.target.value}:r));setSettingsEdited(true);}}/></label><label>Poin<input type="number" min="1" disabled={lockedSettings||!canGrade} value={c.maxPoints} onChange={e=>{setCriteria(prev=>prev.map((r,j)=>j===i?{...r,maxPoints:e.target.value}:r));setSettingsEdited(true);}}/></label>{!lockedSettings&&canGrade&&<button className="ss-button ss-button-small" onClick={()=>{setCriteria(prev=>prev.filter((_,j)=>j!==i));setSettingsEdited(true);}}>Hapus</button>}</div>)}{!lockedSettings&&canGrade&&<button className="ss-button" onClick={()=>{setCriteria(prev=>[...prev,{id:`c${Date.now().toString(36)}`,label:'',maxPoints:'5'}]);setSettingsEdited(true);}}>Tambah kriteria</button>}</div>}{message&&failed&&<p role="alert" className="sr-message is-error">{message}</p>}<DialogFooter><button className="ss-button" onClick={()=>{if(!settingsEdited||window.confirm('Buang perubahan pengaturan penilaian?')){loadSettings();setSettingsOpen(false);}}}>Tutup</button>{!lockedSettings&&<button className="ss-button ss-button-primary" disabled={!canGrade||busy} onClick={()=>void saveSettings()}>Simpan pengaturan</button>}</DialogFooter></DialogContent></Dialog>
  </section>;
}
function ClockNotice(){return <FileCheck2 size={17}/>;}
export default ScheduledReviewWorkspace;
