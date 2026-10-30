import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,CheckCheck,Clock3,FileCheck2,KeyRound,MessageSquare,Minus,Search,Send,Settings2,Users,X} from 'lucide-react';
import {activityBookReference} from '@/lib/scheduled-book-reference';
import type {ClassReportRow,ScheduledClassState} from '@/lib/scheduled-classes';
import {buildAssessmentPayload,buildGradingSettingsPayload,buildPublishPayload,emptyGradeDraft,hydrateGradeDraft,validateManualGrade,type GradeDraftState} from '@/lib/scheduled-review';
import {ASSESSMENT_LABELS,assessmentStatus,manualActivities} from '@/lib/scheduled-session-workspace';
import {gradingModeLabel,nextManualTarget,requiresManual,responseVerdicts,reviewTally,verdictTally} from '@/lib/session-review-verdict';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';

type Selection={student?:string;activity?:string};
type Props={state:ScheduledClassState;onAction:(action:string,body?:Record<string,unknown>)=>Promise<void>;onDirtyChange?:(dirty:boolean)=>void;initialSelection?:Selection;onSelectionChange?:(selection:Selection)=>void};
type CriterionDraft={id:string;label:string;maxPoints:string};
const personKey=(row:ClassReportRow)=>row.student||row.roster;
const VERDICT_LABELS={correct:'Benar',wrong:'Salah',manual:'Perlu dinilai',ungraded:'Belum dijawab'} as const;
const VERDICT_ICONS={correct:Check,wrong:X,manual:Minus,ungraded:Minus} as const;
const FILTERS=[['all','Semua'],['unreviewed','Perlu nilai'],['reviewed','Siap'],['published','Terbit'],['missing','Kosong']] as const;
const DENSITY_KEY='laras.review.density';

export function ScheduledReviewWorkspace({state,onAction,onDirtyChange,initialSelection,onSelectionChange}:Props){
  const activities=state.activities.filter(a=>a.kind==='assignment'||a.kind==='exit_ticket'||a.kind==='quiz');
  const manualIds=new Set(manualActivities(state.activities).map(a=>a.id));
  const attempts=state.attempts.filter(a=>a.status!=='draft'&&activities.some(activity=>activity.id===a.activity));
  const tally=useMemo(()=>reviewTally(state),[state]);
  const queue=useMemo(()=>nextManualTarget(state,activities),[state,activities]);
  const [studentKey,setStudentKey]=useState(initialSelection?.student||attempts[0]?.student||personKey(state.report[0]||{student:'',roster:''} as ClassReportRow));
  const [activityId,setActivityId]=useState(initialSelection?.activity||activities[0]?.id||'');
  const [search,setSearch]=useState(''),[filter,setFilter]=useState<string>('all');
  const [draft,setDraft]=useState<GradeDraftState>(emptyGradeDraft),[savedDraft,setSavedDraft]=useState(JSON.stringify(emptyGradeDraft));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false),[settingsEdited,setSettingsEdited]=useState(false);
  const [settingsMode,setSettingsMode]=useState<'ungraded'|'points'|'rubric'>('ungraded'),[maxPoints,setMaxPoints]=useState('10');
  const [criteria,setCriteria]=useState<CriterionDraft[]>([{id:'clarity',label:'Kejelasan',maxPoints:'10'}]);
  const [compact,setCompact]=useState(true);
  const bar=useRef<HTMLDivElement>(null);
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
  const cards=useMemo(()=>activity&&attempt?responseVerdicts(activity,attempt):[],[activity,attempt]);
  const cardTally=useMemo(()=>verdictTally(cards,attempt),[cards,attempt]);
  const loadSettings=()=>{setSettingsMode(settings?.mode||'ungraded');setMaxPoints(String(settings?.maxPoints||10));setCriteria(settings?.criteria.map(c=>({...c,maxPoints:String(c.maxPoints)}))||[{id:'clarity',label:'Kejelasan',maxPoints:'10'}]);setSettingsEdited(false);};
  useEffect(()=>{loadSettings();},[activity?.id,settings?.revision]);
  useEffect(()=>{try{setCompact(localStorage.getItem(DENSITY_KEY)!=='full');}catch{/* storage blocked */}},[]);
  useEffect(()=>{
    const next=hydrateGradeDraft(draft,ownerRef.current,attemptId,assessment,dirty);
    if(next.changedIdentity||!dirty){setDraft(next.draft);setSavedDraft(JSON.stringify(next.draft));ownerRef.current=attemptId;}
  },[attemptId,assessment?.revision,dirty]);
  useEffect(()=>{onDirtyChange?.(unsaved);return()=>onDirtyChange?.(false);},[unsaved,onDirtyChange]);
  useEffect(()=>{if(!unsaved)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[unsaved]);
  const rememberDensity=(next:boolean)=>{setCompact(next);try{localStorage.setItem(DENSITY_KEY,next?'compact':'full');}catch{/* storage blocked */}};
  const guard=()=>!unsaved||window.confirm('Perubahan penilaian belum disimpan. Buang perubahan dan lanjutkan?');
  const reveal=()=>{requestAnimationFrame(()=>bar.current?.scrollIntoView({block:'start'}));};
  const select=(nextStudent:string,nextActivity=activity?.id||'')=>{
    if(nextStudent===personKey(student||{student:'',roster:''} as ClassReportRow)&&nextActivity===activity?.id)return;
    if(!guard())return;
    loadSettings();setStudentKey(nextStudent);setActivityId(nextActivity);setMessage('');reveal();onSelectionChange?.({student:nextStudent,activity:nextActivity});
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
    setBusy(true);setFailed(false);
    try{await onAction('saveAssessment',buildAssessmentPayload({attemptId:attempt.id,assessmentRevision:assessment?.revision||0,attemptRevision:attempt.revision,settingsRevision:settings.revision,status:reviewStatus,...grade,feedback:draft.feedback}));setSavedDraft(JSON.stringify(draft));setMessage(reviewStatus==='draft'?'Draf penilaian tersimpan.':'Penilaian ditinjau. Terbitkan saat siap dibagikan kepada mahasiswa.');if(next&&queue)select(queue.student,queue.activity);}catch(e){showError(e);}finally{setBusy(false);}
  };
  const publish=async()=>{
    if(!attempt||!settings||!assessment||dirty||!window.confirm(`Terbitkan nilai dan umpan balik ${student?.name} untuk ${activity?.title}?`))return;
    setBusy(true);setFailed(false);
    try{await onAction('publishAssessment',buildPublishPayload({attemptId:attempt.id,assessmentRevision:assessment.revision||0,attemptRevision:attempt.revision,settingsRevision:settings.revision}));setMessage('Nilai dan umpan balik sudah diterbitkan kepada mahasiswa.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const visible=useMemo(()=>state.report.map(row=>{
    const work=attempts.filter(a=>a.student===row.student);
    const relevant=activity?work.find(a=>a.activity===activity.id):undefined;
    const related=activity?state.assessments?.find(g=>g.attempt===relevant?.id):undefined;
    return {row,work,relevant,status:assessmentStatus(related)};
  }).filter(({row,work,relevant})=>{
    if(!`${row.name} ${row.nim}`.toLowerCase().includes(search.toLowerCase()))return false;
    if(filter==='missing')return !work.length;
    if(filter==='all')return true;
    if(!relevant)return false;
    const rowStatus=assessmentStatus(state.assessments?.find(g=>g.attempt===relevant.id));
    if(filter==='unreviewed')return rowStatus==='unreviewed'||rowStatus==='draft';
    if(filter==='reviewed')return rowStatus==='reviewed'||rowStatus==='published';
    if(filter==='published')return rowStatus==='published';
    return true;
  }),[state,attempts,activity,search,filter]);
  const activeIndex=state.report.findIndex(r=>personKey(r)===personKey(student||{student:'',roster:''} as ClassReportRow));
  const step=(delta:number)=>{const row=state.report[activeIndex+delta];if(row)select(personKey(row));};
  return <section className="sr-workspace" aria-label="Tinjau jawaban tugas">
    <div className="sr-toolbar"><div><h2>Jawaban & nilai</h2><p>{tally.reviewed} dari {tally.manual} kiriman ditinjau{tally.auto>0?` · ${tally.auto} dinilai otomatis`:''}</p></div><div className="sr-toolbar-actions">{tally.pending>0&&queue&&<button className="ss-button ss-button-small ss-button-primary" disabled={busy} onClick={()=>select(queue.student,queue.activity)}>Perlu nilai {tally.pending}<ArrowRight size={15}/></button>}<span className="sr-review-progress" aria-label={`${tally.reviewed} dari ${tally.manual} ditinjau`}><span style={{width:`${tally.manual?tally.reviewed/tally.manual*100:0}%`}}/></span></div></div>
    {!canGrade&&<p className="sr-notice"><Clock3 size={17}/>Jawaban dapat dipantau sekarang. Penilaian dan penerbitan tersedia setelah kelas selesai.</p>}
    <div className="sr-review-bar" ref={bar}>
      <div className="sr-review-bar-person">{student?<><span className="ss-avatar">{student.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('')}</span><span><strong>{student.name}</strong><small>{student.nim||'NIM belum tersedia'}</small></span></>:<strong>Belum ada mahasiswa</strong>}</div>
      <div className="sr-review-bar-score">{attempt&&typeof attempt.score==='number'?<><span className="sr-score-value">{attempt.score}</span><span className="sr-score-unit">/ 100</span></>:<span className="sr-score-value sr-score-empty">—</span>}<small>{activity?gradingModeLabel(activity):'Tidak ada kegiatan'}</small></div>
      <div className="sr-review-bar-counts">{cards.length?<><span className="sr-verdict-count is-correct" title="Benar"><Check size={14}/>{cardTally.correct}</span><span className="sr-verdict-count is-wrong" title="Salah"><X size={14}/>{cardTally.wrong}</span><span className="sr-verdict-count is-manual" title="Perlu dinilai atau belum dijawab"><Minus size={14}/>{cardTally.manual+cardTally.ungraded}</span></>:<span className="sr-verdict-count is-manual">Belum ada jawaban</span>}</div>
      <div className="sr-review-bar-nav"><button className="ss-icon-button" aria-label="Mahasiswa sebelumnya" disabled={activeIndex<=0||busy} onClick={()=>step(-1)}><ArrowLeft size={17}/></button><span>{activeIndex+1}/{state.report.length}</span><button className="ss-icon-button" aria-label="Mahasiswa berikutnya" disabled={activeIndex>=state.report.length-1||busy} onClick={()=>step(1)}><ArrowRight size={17}/></button><button className="ss-button ss-button-small" aria-pressed={compact} onClick={()=>rememberDensity(!compact)}>{compact?'Ringkas':'Lengkap'}</button></div>
    </div>
    <div className="sr-review-grid">
      <aside className="sr-students" aria-label="Daftar mahasiswa"><div className="sr-student-tools"><label className="ss-search"><Search size={16}/><input aria-label="Cari mahasiswa untuk ditinjau" placeholder="Cari nama atau NIM..." value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="sr-segments" role="group" aria-label="Filter penilaian">{FILTERS.map(([id,label])=><button key={id} type="button" aria-pressed={filter===id} className={filter===id?'is-active':undefined} onClick={()=>setFilter(id)}>{label}</button>)}</div><p>{visible.length} mahasiswa</p></div><ul>{visible.map(({row,relevant,status:studentStatus})=>{const current=personKey(row)===personKey(student||{student:'',roster:''} as ClassReportRow),score=relevant&&typeof relevant.score==='number'?relevant.score:undefined;return <li key={personKey(row)}><button aria-current={current?'true':undefined} onClick={()=>select(personKey(row))}><span className="ss-avatar">{row.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('')}</span><span><strong>{row.name}</strong><small>{row.nim||'NIM belum tersedia'}</small><span className="sr-student-progress">{!relevant?'Belum ada kiriman':score!==undefined?`${score} / 100`:'Terkirim'}</span></span>{relevant&&['reviewed','published'].includes(studentStatus)?<CheckCheck size={16}/>:relevant&&studentStatus==='draft'?<span className="sr-student-dot" aria-label="Draf tersimpan"/>:null}</button></li>;})}</ul>{!visible.length&&<p className="sr-list-empty">Tidak ada mahasiswa yang sesuai.</p>}</aside>
      <div className="sr-answer-area">
        {student&&activity?<>
        <header className="sr-answer-heading"><label className="sr-activity-picker">Kegiatan<select value={activity.id} onChange={e=>select(personKey(student),e.target.value)}>{activities.map(a=><option key={a.id} value={a.id}>{a.title}{requiresManual(a)?' · perlu dinilai':' · otomatis'}</option>)}</select></label>
          <div className="sr-answer-meta"><span className={`sr-review-status sr-status-${attempt?status:'missing'}`}>{attempt?activity.kind==='quiz'?'Dinilai otomatis':ASSESSMENT_LABELS[status]:'Belum mengirim'}</span><span className="sr-mode-chip">{gradingModeLabel(activity)}</span>{attempt&&<span>{attempt.status==='expired'?'Difinalisasi saat waktu habis':'Dikumpulkan'} · {attempt.complete?'Lengkap':'Belum lengkap'}</span>}</div>
          {(activityBookReference(activity)||activity.worksheet?.sourceLabel)&&<p className="ss-source-label"><BookOpen size={15}/>{activityBookReference(activity)||activity.worksheet?.sourceLabel}</p>}
        </header>
        {attempt?<ol className={`sr-response-list${compact?' is-compact':''}`}>{cards.map(card=>{const Icon=VERDICT_ICONS[card.verdict];const showKey=card.verdict==='wrong';return <li key={card.id} className={`sr-response-row is-${card.verdict}`}>
          <span className="sr-row-verdict" title={VERDICT_LABELS[card.verdict]}><Icon size={14}/><span className="sr-sr-only">{VERDICT_LABELS[card.verdict]}</span></span>
          <div className="sr-row-body">
            <div className="sr-row-head"><span className="sr-row-number">{card.number}</span><p className="sr-row-prompt" lang="de">{card.prompt}</p>{card.points!==undefined&&<span className="sr-row-points">{card.earned||0}/{card.points}</span>}</div>
            <div className="sr-row-answer"><span>Jawaban</span><p className={card.answer?'':'is-empty'}>{card.answer||'Belum dijawab'}</p></div>
            {showKey&&card.accepted?.length?<div className="sr-row-key"><KeyRound size={13}/><span>Diterima</span><p>{card.accepted.join(' / ')}</p></div>:null}
            {card.modelAnswer&&<details className="sr-row-reference" open={!compact}><summary><BookOpen size={13}/>Contoh jawaban & rubrik</summary><p className="sr-reference-answer">{card.modelAnswer}</p>{card.rubric&&<p className="sr-reference-rubric">{card.rubric}</p>}{settings&&<button type="button" className="ss-button ss-button-small" disabled={!canGrade||busy} onClick={()=>setDraft(d=>({...d,feedback:[card.rubric,card.modelAnswer?`Contoh jawaban:\n${card.modelAnswer}`:''].filter(Boolean).join('\n\n')}))}>Pakai sebagai umpan balik</button>}</details>}
          </div>
        </li>;})}</ol>:<div className="ss-empty sr-no-submission"><MessageSquare size={30}/><h3>Belum ada jawaban untuk kegiatan ini</h3><p>{student.checkedInAt?'Mahasiswa sudah check-in, tetapi belum mengirim jawaban ini.':'Mahasiswa belum tercatat check-in.'}</p></div>}
        </>:<div className="ss-empty"><Users size={30}/><h3>Belum ada jawaban tugas</h3><p>Jawaban tugas dan refleksi akan tampil di sini.</p></div>}
      </div>
      <aside className="sr-grading" aria-label="Penilaian mahasiswa"><div className="sr-grading-header"><h3>Penilaian</h3><button className="ss-icon-button" aria-label="Pengaturan penilaian kegiatan" disabled={!activity||activity.kind==='quiz'||busy} onClick={()=>{setFailed(false);setMessage('');setSettingsOpen(true);}}><Settings2 size={17}/></button></div>
        {activity&&<p className="sr-grading-mode">{gradingModeLabel(activity)}{settings&&settings.mode!=='ungraded'?` · maks. ${settings.maxPoints}`:''}</p>}
        {activity?.kind==='quiz'?<div className="sr-auto-grade"><FileCheck2 size={26}/><h4>Penilaian otomatis</h4><strong>{attempt?.score??'—'}<small> / 100</small></strong><p>Nilai kuis dihitung dari jawaban mahasiswa. Kuis tidak memerlukan penilaian manual.</p></div>:!settings?<div className="sr-configure"><FileCheck2 size={26}/><h4>Atur penilaian kegiatan</h4><p>Pilih poin, rubrik, atau umpan balik tanpa nilai. Pengaturan berlaku untuk seluruh mahasiswa pada kegiatan ini.</p><button className="ss-button" disabled={!activity||!canGrade||busy} onClick={()=>setSettingsOpen(true)}>Atur penilaian</button></div>:<>
        {attempt&&<>{settings.mode==='points'&&<label className="sr-points">Nilai<div><input type="number" min="0" max={settings.maxPoints} step="any" disabled={!canGrade||busy} value={draft.points} onChange={e=>setDraft(d=>({...d,points:e.target.value}))}/><span>/ {settings.maxPoints}</span></div></label>}{settings.mode==='rubric'&&<fieldset className="sr-rubric-scores"><legend>Nilai per kriteria</legend>{settings.criteria.map(c=><label key={c.id}><span>{c.label}<small>Maks. {c.maxPoints}</small></span><input aria-label={`Nilai ${c.label}`} type="number" min="0" max={c.maxPoints} step="any" disabled={!canGrade||busy} value={draft.criterionScores[c.id]??''} onChange={e=>setDraft(d=>({...d,criterionScores:{...d.criterionScores,[c.id]:e.target.value}}))}/></label>)}<p>Total <strong>{settings.criteria.reduce((sum,c)=>sum+Number(draft.criterionScores[c.id]||0),0)} / {settings.maxPoints}</strong></p></fieldset>}
        <label className="sr-feedback">Umpan balik<textarea rows={6} placeholder="Tulis komentar untuk mahasiswa..." maxLength={10000} disabled={!canGrade||busy} value={draft.feedback} onChange={e=>setDraft(d=>({...d,feedback:e.target.value}))}/></label><p className="sr-draft-hint">{dirty?'Perubahan belum disimpan.':assessment?'Penilaian tersimpan.':'Belum ada penilaian tersimpan.'}</p>
        <div className="sr-save-actions"><button className="ss-button" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('draft')}>Simpan draf</button><button className="ss-button" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('reviewed')}>Ditinjau</button><button className="ss-button ss-button-primary" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('reviewed',true)}>Simpan & berikutnya<ArrowRight size={16}/></button></div>
        {assessment?.status==='reviewed'&&<div className="sr-publish"><p>{status==='published'?'Mahasiswa dapat melihat penilaian ini.':'Siap dibagikan kepada mahasiswa.'}</p><button className="ss-button" disabled={!canGrade||busy||dirty||status==='published'} onClick={()=>void publish()}><Send size={15}/>{status==='published'?'Sudah diterbitkan':'Terbitkan penilaian'}</button></div>}</>}
        {!attempt&&<p className="sr-notice">Pilih kiriman mahasiswa untuk memberikan penilaian.</p>}</>}
        {message&&<p className={`sr-message${failed?' is-error':''}`} role={failed?'alert':'status'}>{message}</p>}
      </aside>
    </div>
    <Dialog open={settingsOpen} onOpenChange={open=>{if(!open&&settingsEdited){if(!window.confirm('Buang perubahan pengaturan penilaian?'))return;loadSettings();}setSettingsOpen(open);}}><DialogContent className="ss-create-dialog sr-settings-dialog"><DialogHeader><DialogTitle>Pengaturan penilaian</DialogTitle><DialogDescription>{activity?.title} · Berlaku untuk seluruh mahasiswa pada kegiatan ini.</DialogDescription></DialogHeader>{lockedSettings&&<p className="sr-notice">Pengaturan dikunci karena penilaian sudah dibuat.</p>}<label>Mode penilaian<select disabled={lockedSettings||!canGrade} value={settingsMode} onChange={e=>{setSettingsMode(e.target.value as typeof settingsMode);setSettingsEdited(true);}}><option value="ungraded">Tanpa nilai — umpan balik saja</option><option value="points">Poin</option><option value="rubric">Rubrik</option></select></label>{settingsMode!=='ungraded'&&<label>Nilai maksimum<input type="number" min="1" max="100000" disabled={lockedSettings||!canGrade} value={maxPoints} onChange={e=>{setMaxPoints(e.target.value);setSettingsEdited(true);}}/></label>}{settingsMode==='rubric'&&<div className="sr-criteria-editor">{criteria.map((c,i)=><div key={c.id}><label>Kriteria {i+1}<input value={c.label} disabled={lockedSettings||!canGrade} onChange={e=>{setCriteria(prev=>prev.map((r,j)=>j===i?{...r,label:e.target.value}:r));setSettingsEdited(true);}}/></label><label>Poin<input type="number" min="1" disabled={lockedSettings||!canGrade} value={c.maxPoints} onChange={e=>{setCriteria(prev=>prev.map((r,j)=>j===i?{...r,maxPoints:e.target.value}:r));setSettingsEdited(true);}}/></label>{!lockedSettings&&canGrade&&<button className="ss-button ss-button-small" onClick={()=>{setCriteria(prev=>prev.filter((_,j)=>j!==i));setSettingsEdited(true);}}>Hapus</button>}</div>)}{!lockedSettings&&canGrade&&<button className="ss-button" onClick={()=>{setCriteria(prev=>[...prev,{id:`c${Date.now().toString(36)}`,label:'',maxPoints:'5'}]);setSettingsEdited(true);}}>Tambah kriteria</button>}</div>}{message&&failed&&<p role="alert" className="sr-message is-error">{message}</p>}<DialogFooter><button className="ss-button" onClick={()=>{if(!settingsEdited||window.confirm('Buang perubahan pengaturan penilaian?')){loadSettings();setSettingsOpen(false);}}}>Tutup</button>{!lockedSettings&&<button className="ss-button ss-button-primary" disabled={!canGrade||busy} onClick={()=>void saveSettings()}>Simpan pengaturan</button>}</DialogFooter></DialogContent></Dialog>
  </section>;
}
export default ScheduledReviewWorkspace;
