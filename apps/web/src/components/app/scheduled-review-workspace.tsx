import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDownUp,ArrowLeft,ArrowRight,BookOpen,Check,CheckCheck,ChevronDown,Clock3,FileCheck2,KeyRound,ListFilter,Minus,Search,Send,Settings2,Users,X} from 'lucide-react';
import {activityBookReference} from '@/lib/scheduled-book-reference';
import type {ClassReportRow,ScheduledAssessment,ScheduledClassState} from '@/lib/scheduled-classes';
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
const FILTERS=[['all','Semua mahasiswa'],['unreviewed','Perlu dinilai'],['reviewed','Sudah ditinjau'],['published','Sudah diterbitkan'],['missing','Belum mengirim']] as const;
const DENSITY_KEY='laras.review.density';
const assessmentApproved=(assessment?:ScheduledAssessment)=>assessment?.settingsRevision===0&&assessment.status==='reviewed';
const assessmentScore=(attempt?:ScheduledClassState['attempts'][number],assessment?:ScheduledAssessment)=>assessment?.settingsRevision===0&&Object.keys(assessment.answerOverrides||{}).length>0&&typeof assessment.points==='number'?assessment.points:attempt?.score;

export function ScheduledReviewWorkspace({state,onAction,onDirtyChange,initialSelection,onSelectionChange}:Props){
  const activities=state.activities.filter(a=>a.kind==='assignment'||a.kind==='exit_ticket'||a.kind==='quiz');
  const manualIds=new Set(manualActivities(state.activities).map(a=>a.id));
  const attempts=state.attempts.filter(a=>a.status!=='draft'&&activities.some(activity=>activity.id===a.activity));
  const tally=useMemo(()=>reviewTally(state),[state]);
  const queue=useMemo(()=>nextManualTarget(state,activities),[state,activities]);
  const [studentKey,setStudentKey]=useState(initialSelection?.student||queue?.student||attempts[0]?.student||personKey(state.report[0]||{student:'',roster:''} as ClassReportRow));
  const [activityId,setActivityId]=useState(initialSelection?.activity||queue?.activity||activities[0]?.id||'');
  const [search,setSearch]=useState(''),[filters,setFilters]=useState<string[]>([]),[filterOpen,setFilterOpen]=useState(false),[sort,setSort]=useState<'roster'|'name'|'pending'>('roster');
  const [draft,setDraft]=useState<GradeDraftState>(emptyGradeDraft),[savedDraft,setSavedDraft]=useState(JSON.stringify(emptyGradeDraft));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false),[settingsEdited,setSettingsEdited]=useState(false);
  const [settingsMode,setSettingsMode]=useState<'ungraded'|'points'|'rubric'>('ungraded'),[maxPoints,setMaxPoints]=useState('10');
  const [criteria,setCriteria]=useState<CriterionDraft[]>([{id:'clarity',label:'Kejelasan',maxPoints:'10'}]);
  const [compact,setCompact]=useState(true);
  const bar=useRef<HTMLDivElement>(null);
  const cardCache=useRef(new Map<string,ReturnType<typeof responseVerdicts>>());
  const student=state.report.find(r=>personKey(r)===studentKey)||state.report[0];
  const activity=activities.find(a=>a.id===activityId)||activities[0];
  const attempt=attempts.find(a=>a.student===student?.student&&a.activity===activity?.id);
  const assessment=state.assessments?.find(a=>a.attempt===attempt?.id);
  const displayedScore=assessmentScore(attempt,assessment);
  const settings=state.gradingSettings?.find(s=>s.activity===activity?.id);
  const activityManualAttempts=activity&&requiresManual(activity)?attempts.filter(item=>item.activity===activity.id):[];
  const activityReviewedCount=activityManualAttempts.filter(item=>['reviewed','published'].includes(assessmentStatus(state.assessments?.find(row=>row.attempt===item.id)))).length;
  const activityPendingCount=activityManualAttempts.length-activityReviewedCount;
  const canGrade=['closed','reviewed'].includes(state.class?.phase||'');
  const lockedSettings=state.assessments?.some(a=>a.activity===activity?.id);
  const dirty=JSON.stringify(draft)!==savedDraft;
  const unsaved=dirty||settingsEdited;
  const attemptId=attempt?.id||null,ownerRef=useRef<string|null>(attemptId);
  const status=assessmentStatus(assessment);
  const automaticallyScored=!!activity&&(activity.kind==='quiz'||!requiresManual(activity));
  const autoApproved=assessment?.settingsRevision===0&&status==='reviewed';
  const cards=useMemo(()=>activity&&attempt?responseVerdicts(activity,attempt):[],[activity,attempt]);
  const cardsFor=(a:typeof activities[number],tryItem:typeof attempts[number]|undefined)=>{if(!tryItem)return [];const key=`${a.id}:${tryItem.id}`;if(!cardCache.current.has(key))cardCache.current.set(key,responseVerdicts(a,tryItem));return cardCache.current.get(key)||[];};
  const cardsWithOverrides=(a:typeof activities[number],tryItem:typeof attempts[number]|undefined,graded:typeof assessment)=>cardsFor(a,tryItem).map(card=>{const override=graded?.answerOverrides?.[card.id];return override==='correct'?{...card,verdict:'correct' as const,earned:card.points}:override==='wrong'?{...card,verdict:'wrong' as const,earned:0}:card;});
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
  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
      const target=event.target;
      if(target instanceof HTMLElement&&target.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(event.key.toLowerCase()==='j'){event.preventDefault();step(1);}
      else if(event.key.toLowerCase()==='k'){event.preventDefault();step(-1);}
      else if(event.key.toLowerCase()==='n'&&student&&activity){event.preventDefault();const next=nextManualTarget(state,activities,{student:student.student,activity:activity.id});if(next)select(next.student,next.activity);}
    };
    window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown);
  });
  const prefersReduced=()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rememberDensity=(next:boolean)=>{setCompact(next);try{localStorage.setItem(DENSITY_KEY,next?'compact':'full');}catch{/* storage blocked */}};
  const guard=()=>!unsaved||window.confirm('Perubahan penilaian belum disimpan. Buang perubahan dan lanjutkan?');
  const reveal=()=>{requestAnimationFrame(()=>bar.current?.scrollIntoView({block:'start'}));};
  const select=(nextStudent:string,nextActivity=activity?.id||'',afterSave=false)=>{
    if(nextStudent===personKey(student||{student:'',roster:''} as ClassReportRow)&&nextActivity===activity?.id)return;
    if(!afterSave&&!guard())return;
    loadSettings();const sameStudent=nextStudent===personKey(student||{student:'',roster:''} as ClassReportRow);setStudentKey(nextStudent);setActivityId(nextActivity);setMessage('');if(sameStudent)document.getElementById(`review-activity-${nextActivity}`)?.scrollIntoView({block:'start',behavior:prefersReduced()?'auto':'smooth'});else reveal();onSelectionChange?.({student:nextStudent,activity:nextActivity});
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
    try{await onAction('saveAssessment',buildAssessmentPayload({attemptId:attempt.id,assessmentRevision:assessment?.revision||0,attemptRevision:attempt.revision,settingsRevision:settings.revision,status:reviewStatus,...grade,feedback:draft.feedback}));setSavedDraft(JSON.stringify(draft));setMessage(reviewStatus==='draft'?'Draf penilaian tersimpan.':'Penilaian ditinjau. Terbitkan saat siap dibagikan kepada mahasiswa.');if(next){const nextTarget=nextManualTarget(state,activities,{student:attempt.student,activity:activity.id});if(nextTarget&&nextTarget.id!==attempt.id)select(nextTarget.student,nextTarget.activity,true);}}catch(e){showError(e);}finally{setBusy(false);}
  };
  const approveAutoScoreFor=async(tryItem:typeof attempt,graded:typeof assessment)=>{
    if(!tryItem||typeof tryItem.score!=='number'||assessmentApproved(graded))return;
    setBusy(true);setFailed(false);setMessage('');
    try{await onAction('approveAutoScore',{attemptId:tryItem.id,attemptRevision:tryItem.revision,assessmentRevision:graded?.revision||0});setMessage('Nilai otomatis disetujui.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const overrideAutoAnswer=async(tryItem:typeof attempt,graded:typeof assessment,itemId:string,verdict:'correct'|'wrong'|null)=>{
    if(!tryItem||!guard())return;
    setBusy(true);setFailed(false);setMessage('');
    try{await onAction('overrideAutoAnswer',{attemptId:tryItem.id,attemptRevision:tryItem.revision,assessmentRevision:graded?.revision||0,itemId,verdict});setMessage('Penilaian jawaban diperbarui.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const approveAutoScore=()=>approveAutoScoreFor(attempt,assessment);
  const publish=async()=>{
    if(!attempt||!settings||!assessment||dirty||!window.confirm(`Terbitkan nilai dan umpan balik ${student?.name} untuk ${activity?.title}?`))return;
    setBusy(true);setFailed(false);
    try{await onAction('publishAssessment',buildPublishPayload({attemptId:attempt.id,assessmentRevision:assessment.revision||0,attemptRevision:attempt.revision,settingsRevision:settings.revision}));setMessage('Nilai dan umpan balik sudah diterbitkan kepada mahasiswa.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const matchesFilter=(entry:{work:typeof attempts;relevant:typeof attempts[number]|undefined;status:string},value:string)=>{
    if(value==='missing')return !entry.work.length;
    if(!entry.relevant)return false;
    if(!activity||!requiresManual(activity))return false;
    if(value==='unreviewed')return entry.status==='unreviewed'||entry.status==='draft';
    if(value==='reviewed')return entry.status==='reviewed'||entry.status==='published';
    if(value==='published')return entry.status==='published';
    return true;
  };
  const visible=useMemo(()=>{
    const rows=state.report.map(row=>{
    const work=attempts.filter(a=>a.student===row.student);
    const relevant=activity?work.find(a=>a.activity===activity.id):undefined;
    const related=activity?state.assessments?.find(g=>g.attempt===relevant?.id):undefined;
    return {row,work,relevant,status:assessmentStatus(related)};
    }).filter(entry=>{
    const {row}=entry;
    if(!`${row.name} ${row.nim}`.toLowerCase().includes(search.toLowerCase()))return false;
    if(filters.length&&!filters.includes('all')&&!filters.some(value=>matchesFilter(entry,value)))return false;
    return true;
    });
    return rows.sort((a,b)=>sort==='name'?a.row.name.localeCompare(b.row.name,'id'):sort==='pending'?Number(['reviewed','published'].includes(a.status))-Number(['reviewed','published'].includes(b.status))||a.row.name.localeCompare(b.row.name,'id'):state.report.findIndex(row=>personKey(row)===personKey(a.row))-state.report.findIndex(row=>personKey(row)===personKey(b.row)));
  },[state,attempts,activity,search,filters,sort,matchesFilter]);
  const activeIndex=visible.findIndex(({row})=>personKey(row)===personKey(student||{student:'',roster:''} as ClassReportRow));
  const step=(delta:number)=>{const next=visible[activeIndex+delta];if(next)select(personKey(next.row));};
  const countOf=(value:string)=>value==='all'?state.report.length:state.report.filter(row=>{const work=attempts.filter(item=>item.student===row.student);const relevant=activity?work.find(item=>item.activity===activity.id):undefined;const status=assessmentStatus(state.assessments?.find(item=>item.attempt===relevant?.id));return matchesFilter({work,relevant,status},value);}).length;
  const toggleFilter=(value:string)=>setFilters(previous=>value==='all'?[]:previous.includes(value)?previous.filter(item=>item!==value):[...previous.filter(item=>item!=='all'),value]);
  const filterLabel=filters.length===0||filters.includes('all')?'Semua mahasiswa':FILTERS.filter(([value])=>filters.includes(value)).map(([,label])=>label).join(' · ');
  const pendingCount=tally.pending,autoCount=tally.autoScored;
  return <section className="sr-workspace" aria-label="Tinjau jawaban tugas">
    <div className="evx-stats sr-summary" aria-label="Ringkasan pengumpulan kelas">
      <div className="evx-stat"><span className="evx-stat-ico blue"><Users size={16}/></span><div><strong>{state.report.length}</strong><span>Mahasiswa</span></div></div>
      <div className="evx-stat"><span className="evx-stat-ico blue"><FileCheck2 size={16}/></span><div><strong>{attempts.length}</strong><span>Jawaban terkumpul</span></div></div>
      <div className="evx-stat"><span className="evx-stat-ico amber"><Clock3 size={16}/></span><div><strong>{pendingCount}</strong><span>Perlu dinilai</span></div></div>
      <div className="evx-stat"><span className="evx-stat-ico green"><CheckCheck size={16}/></span><div><strong>{tally.reviewed}</strong><span>Sudah ditinjau</span></div></div>
      <div className="evx-stat quiet"><div><strong>{autoCount}</strong><span>Dinilai otomatis</span></div></div>
      <div className="evx-pager"><button type="button" aria-label="Mahasiswa sebelumnya" disabled={activeIndex<=0||busy} onClick={()=>step(-1)}><ArrowLeft size={16}/></button><span>{activeIndex<0?0:activeIndex+1} dari {visible.length}</span><button type="button" aria-label="Mahasiswa berikutnya" disabled={activeIndex<0||activeIndex>=visible.length-1||busy} onClick={()=>step(1)}><ArrowRight size={16}/></button></div>
    </div>
    <div className="sr-toolbar"><div><h2>Jawaban & nilai</h2><p>{tally.reviewed} dari {tally.manual} kiriman ditinjau{tally.auto>0?` · ${tally.auto} dinilai otomatis`:''}</p></div><div className="sr-toolbar-actions">{tally.pending>0&&queue&&<button className="ss-button ss-button-small ss-button-primary" disabled={busy} onClick={()=>select(queue.student,queue.activity)}>Perlu nilai {tally.pending}<ArrowRight size={15}/></button>}<span className="sr-review-progress" aria-label={`${tally.reviewed} dari ${tally.manual} ditinjau`}><span style={{width:`${tally.manual?tally.reviewed/tally.manual*100:0}%`}}/></span></div></div>
    {!canGrade&&<p className="sr-notice"><Clock3 size={17}/>Jawaban dapat dipantau sekarang. Penilaian dan penerbitan tersedia setelah kelas selesai.</p>}
    <div className="sr-review-bar" ref={bar}>
      <div className="sr-review-bar-person">{student?<><span className="ss-avatar">{student.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('')}</span><span><strong>{student.name}</strong><small>{student.nim||'NIM belum tersedia'}</small></span></>:<strong>Belum ada mahasiswa</strong>}</div>
      <div className="sr-review-bar-score">{typeof displayedScore==='number'?<><span className="sr-score-value">{displayedScore}</span><span className="sr-score-unit">/ 100</span></>:<span className="sr-score-value sr-score-empty">—</span>}<small>{activity?gradingModeLabel(activity):'Tidak ada kegiatan'}</small></div>
      <div className="sr-review-bar-counts">{cards.length?<><span className="sr-verdict-count is-correct" title="Benar"><Check size={14}/>{cardTally.correct}</span><span className="sr-verdict-count is-wrong" title="Salah"><X size={14}/>{cardTally.wrong}</span><span className="sr-verdict-count is-manual" title="Perlu dinilai atau belum dijawab"><Minus size={14}/>{cardTally.manual+cardTally.ungraded}</span></>:<span className="sr-verdict-count is-manual">Belum ada jawaban</span>}</div>
      <div className="sr-review-bar-nav"><button className="ss-icon-button" aria-label="Mahasiswa sebelumnya" disabled={activeIndex<=0||busy} onClick={()=>step(-1)}><ArrowLeft size={17}/></button><span>{activeIndex<0?0:activeIndex+1}/{visible.length}</span><button className="ss-icon-button" aria-label="Mahasiswa berikutnya" disabled={activeIndex<0||activeIndex>=visible.length-1||busy} onClick={()=>step(1)}><ArrowRight size={17}/></button><button className="ss-button ss-button-small" aria-pressed={compact} onClick={()=>rememberDensity(!compact)}>{compact?'Ringkas':'Lengkap'}</button></div>
    </div>
    <div className="sr-review-grid">
      <aside className="sr-students eval-col" aria-label="Daftar mahasiswa">
        <div className="eval-col-head"><h2>Mahasiswa ({visible.length})</h2><span className="evx-kbd-hint"><kbd>J</kbd><kbd>K</kbd> pindah · <kbd>N</kbd> perlu dinilai</span></div>
        <label className="cho-search sr-roster-search"><Search size={13}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Cari nama atau NIM..." aria-label="Cari nama atau NIM mahasiswa"/></label>
        <div className="evx-filter-drop">
          <button type="button" className={`evx-filter-btn${filters.length?' active':''}`} aria-expanded={filterOpen} aria-haspopup="true" onClick={()=>setFilterOpen(value=>!value)}><ListFilter size={13}/><span>{filterLabel}</span><ChevronDown size={13} className={filterOpen?'open':''}/></button>
          {filterOpen&&<div className="evx-filter-menu" role="group" aria-label="Saring mahasiswa">{FILTERS.map(([value,label])=>{const checked=value==='all'?filters.length===0:filters.includes(value);return <label key={value} className="evx-filter-item"><input type="checkbox" checked={checked} onChange={()=>toggleFilter(value)} aria-label={label}/><span>{label}</span><em>{countOf(value)}</em></label>;})}</div>}
        </div>
        <label className="eval-sort"><ArrowDownUp size={13}/><select value={sort} onChange={event=>setSort(event.target.value as typeof sort)} aria-label="Urutkan mahasiswa"><option value="roster">Urut: Daftar kelas</option><option value="name">Nama A–Z</option><option value="pending">Perlu dinilai dulu</option></select></label>
        {visible.length? <ul className="eval-people">{visible.map(({row,relevant,status:studentStatus})=>{const current=personKey(row)===personKey(student||{student:'',roster:''} as ClassReportRow),assessmentForRow=state.assessments?.find(item=>item.attempt===relevant?.id),score=assessmentScore(relevant,assessmentForRow),approved=assessmentForRow?.settingsRevision===0&&assessmentForRow?.status==='reviewed';const statusLabel=!relevant?'Belum mengirim':activity&&!requiresManual(activity)?approved?'Disetujui':'Perlu disetujui':studentStatus==='published'?'Diterbitkan':studentStatus==='reviewed'?'Sudah ditinjau':studentStatus==='draft'?'Draf tersimpan':'Terkirim';return <li key={personKey(row)}><button type="button" className={`evx-person${current?' active':''}${['reviewed','published'].includes(studentStatus)||approved?' graded':' pending-grade'}`} aria-current={current?'true':undefined} onClick={()=>select(personKey(row))}><span className="cw-student-avatar">{row.name.split(/\s+/).slice(0,2).map(name=>name[0]).join('').toUpperCase()}</span><span><strong>{row.name}</strong><small>{row.nim||'NIM belum tersedia'}</small></span><em>{score==null?'—':score}</em><span className={`asg-tag sub-${studentStatus}`}>{statusLabel}</span></button></li>;})}</ul>:<div className="evx-empty-card" role="status"><Users size={18}/><strong>Belum ada mahasiswa</strong><p>{state.report.length?'Tidak ada mahasiswa pada saringan ini. Ubah filter atau kata kunci.':'Daftar mahasiswa akan tampil di sini.'}</p></div>}
        <p className="sr-student-count">{visible.length} dari {state.report.length} mahasiswa</p>
      </aside>
      <div className="sr-answer-area">
        {student&&activity?<>
         {activities.map((a,index)=>{const own=attempts.find(t=>t.student===student?.student&&t.activity===a.id);const ownAssessment=state.assessments?.find(g=>g.attempt===own?.id);const ownStatus=assessmentStatus(ownAssessment);const ownScore=assessmentScore(own,ownAssessment);const ownCards=cardsWithOverrides(a,own,ownAssessment);const sectionSettings=state.gradingSettings?.find(item=>item.activity===a.id);const sectionAuto=a.kind==='quiz'||!requiresManual(a);const sectionApproved=assessmentApproved(ownAssessment);const sectionSelected=activity?.id===a.id;return <section key={a.id} id={'review-activity-'+a.id} data-activity-id={a.id} className={'sr-activity-block'+(sectionSelected?' is-active':'')} aria-labelledby={'review-activity-title-'+a.id}>
           <header className="sr-activity-head"><h3 id={'review-activity-title-'+a.id}><button type="button" className="sr-activity-select" aria-pressed={activity?.id===a.id} onClick={()=>select(personKey(student),a.id)}><span className="sr-activity-index">{index+1}</span>{a.title}</button></h3><span className="sr-mode-chip">{gradingModeLabel(a)}</span>{own&&typeof ownScore==='number'&&<span className="sr-activity-total">{ownScore} / 100</span>}<span className={'sr-review-status sr-status-'+(own?ownStatus:'missing')}>{own?((a.kind==='quiz'||!requiresManual(a))?(assessmentApproved(ownAssessment)?'Disetujui':'Perlu disetujui'):ASSESSMENT_LABELS[ownStatus]):'Belum mengirim'}</span></header>
           <div className="sr-activity-response">
           {(activityBookReference(a)||a.worksheet?.sourceLabel)&&<p className="ss-source-label"><BookOpen size={15}/>{activityBookReference(a)||a.worksheet?.sourceLabel}</p>}
           {own?<ol className={'sr-response-list'+(compact?' is-compact':'')}>{ownCards.map(card=>{const Icon=VERDICT_ICONS[card.verdict];const showKey=card.verdict==='wrong';return <li key={card.id} className={`sr-response-row is-${card.verdict}`}>
             <span className="sr-row-verdict" title={VERDICT_LABELS[card.verdict]}><Icon size={14}/><span className="sr-sr-only">{VERDICT_LABELS[card.verdict]}</span></span><div className="sr-row-body">
               <div className="sr-row-head"><span className="sr-row-number">{card.number}</span><p className="sr-row-prompt" lang="de">{card.prompt}</p>{card.points!==undefined&&<span className="sr-row-points">{card.earned||0}/{card.points}</span>}</div><div className="sr-row-answer"><span>Jawaban</span><p className={card.answer?'':'is-empty'}>{card.answer||'Belum dijawab'}</p></div>
               {showKey&&card.accepted?.length?<div className="sr-row-key"><KeyRound size={13}/><span>Diterima</span><p>{card.accepted.join(' / ')}</p></div>:null}
               {(a.kind==='quiz'||!requiresManual(a))&&card.points!==undefined&&card.answer&&<div className="sr-answer-override" aria-label={`Ubah penilaian jawaban ${card.number}`}><span>{ownAssessment?.answerOverrides?.[card.id]?'Penilaian dosen':'Jawaban kunci'}</span><button type="button" className={card.verdict==='correct'?'is-selected':''} disabled={!canGrade||busy||card.verdict==='correct'} onClick={()=>void overrideAutoAnswer(own,ownAssessment,card.id,'correct')}>Tandai benar</button><button type="button" className={card.verdict==='wrong'?'is-selected':''} disabled={!canGrade||busy||card.verdict==='wrong'} onClick={()=>void overrideAutoAnswer(own,ownAssessment,card.id,'wrong')}>Tandai salah</button>{ownAssessment?.answerOverrides?.[card.id]&&<button type="button" disabled={!canGrade||busy} onClick={()=>void overrideAutoAnswer(own,ownAssessment,card.id,null)}>Reset ke kunci</button>}</div>}
               {card.modelAnswer&&<details className="sr-row-reference" open={!compact}><summary><BookOpen size={13}/>Contoh jawaban & rubrik</summary><p className="sr-reference-answer">{card.modelAnswer}</p>{card.rubric&&<p className="sr-reference-rubric">{card.rubric}</p>}{settings&&<button type="button" className="ss-button ss-button-small" disabled={!canGrade||busy} onClick={()=>setDraft(d=>({...d,feedback:[card.rubric,card.modelAnswer?`Contoh jawaban:\n${card.modelAnswer}`:''].filter(Boolean).join('\n\n')}))}>Pakai sebagai umpan balik</button>}</details>}
             </div></li>;})}</ol>:<p className="sr-activity-empty">Belum ada jawaban untuk kegiatan ini.</p>}
           </div>
           <section className={`sr-grading-section sr-activity-assessment${sectionSelected?' is-current':''}`} aria-label={`Penilaian kegiatan ${a.title}`}>
          <header><div className="sr-assessment-card-title"><button type="button" onClick={()=>select(personKey(student||{student:'',roster:''} as ClassReportRow),a.id)}><span>{index+1}. {a.title}</span><small>{gradingModeLabel(a)}</small></button><span className={`sr-review-status ${!own?'sr-status-missing':sectionAuto?'sr-status-auto':'sr-status-'+ownStatus}`}>{!own?'Belum mengirim':sectionAuto?sectionApproved?'Disetujui':'Perlu disetujui':ASSESSMENT_LABELS[ownStatus]}</span></div>{sectionSelected&&<button className="ss-icon-button" aria-label="Pengaturan penilaian kegiatan" disabled={sectionAuto||busy} onClick={()=>{setFailed(false);setMessage('');setSettingsOpen(true);}}><Settings2 size={17}/></button>}</header>
          {ownScore!==undefined&&<strong className="sr-grading-section-score">{ownScore} <small>/ 100</small></strong>}
          {sectionAuto?<><p>{ownAssessment?.answerOverrides&&Object.keys(ownAssessment.answerOverrides).length?`Penilaian otomatis · ${Object.keys(ownAssessment.answerOverrides).length} jawaban disesuaikan`:own?'Penilaian otomatis dihitung dari kunci jawaban.':'Penilaian otomatis belum tersedia.'}</p><button type="button" className="ss-button ss-button-primary" disabled={!own||typeof own.score!=='number'||!canGrade||busy||sectionApproved} onClick={()=>void approveAutoScoreFor(own,ownAssessment)}>{busy?'Menyimpan…':sectionApproved?'Nilai disetujui':'Setujui nilai otomatis'}</button></>:sectionSelected?(!sectionSettings?<div className="sr-configure"><h4>Atur penilaian kegiatan</h4><p>Pilih poin, rubrik, atau umpan balik tanpa nilai. Pengaturan berlaku untuk seluruh mahasiswa pada kegiatan ini.</p><button className="ss-button" disabled={!canGrade||busy} onClick={()=>setSettingsOpen(true)}>Atur penilaian</button></div>:<>
            {own&&<>{sectionSettings.mode==='points'&&<label className="sr-points">Nilai<div><input type="number" min="0" max={sectionSettings.maxPoints} step="any" disabled={!canGrade||busy} value={draft.points} onChange={e=>setDraft(d=>({...d,points:e.target.value}))}/><span>/ {sectionSettings.maxPoints}</span></div></label>}{sectionSettings.mode==='rubric'&&<fieldset className="sr-rubric-scores"><legend>Nilai per kriteria</legend>{sectionSettings.criteria.map(c=><label key={c.id}><span>{c.label}<small>Maks. {c.maxPoints}</small></span><input aria-label={`Nilai ${c.label}`} type="number" min="0" max={c.maxPoints} step="any" disabled={!canGrade||busy} value={draft.criterionScores[c.id]??''} onChange={e=>setDraft(d=>({...d,criterionScores:{...d.criterionScores,[c.id]:e.target.value}}))}/></label>)}<p>Total <strong>{sectionSettings.criteria.reduce((sum,c)=>sum+Number(draft.criterionScores[c.id]||0),0)} / {sectionSettings.maxPoints}</strong></p></fieldset>}
            <label className="sr-feedback">Umpan balik<textarea rows={5} placeholder="Tulis komentar untuk mahasiswa..." maxLength={10000} disabled={!canGrade||busy} value={draft.feedback} onChange={e=>setDraft(d=>({...d,feedback:e.target.value}))}/></label><p className="sr-draft-hint">{dirty?'Perubahan belum disimpan.':ownAssessment?'Penilaian tersimpan.':'Belum ada penilaian tersimpan.'}</p>
            <div className="sr-save-actions"><button className="ss-button" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('draft')}>Simpan draf</button><button className="ss-button" aria-label="Tandai penilaian sudah ditinjau" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('reviewed')}>Ditinjau</button><button className="ss-button ss-button-primary" disabled={!canGrade||busy||settingsEdited} onClick={()=>void saveGrade('reviewed',true)}>Simpan & berikutnya<ArrowRight size={16}/></button></div>
            <p className="sr-save-hint">Draf hanya tersimpan untuk dosen. Tandai ditinjau saat siap; terbitkan secara terpisah untuk membagikan nilai dan umpan balik kepada mahasiswa.</p>
            {ownAssessment?.status==='reviewed'&&<div className="sr-publish"><p>{ownStatus==='published'?'Mahasiswa dapat melihat penilaian ini.':'Siap dibagikan kepada mahasiswa.'}</p><button className="ss-button" disabled={!canGrade||busy||dirty||ownStatus==='published'} onClick={()=>void publish()}><Send size={15}/>{ownStatus==='published'?'Sudah diterbitkan':'Terbitkan penilaian'}</button></div>}</>}
            {!own&&<p className="sr-notice">Mahasiswa belum mengirim jawaban untuk bagian ini.</p>}
          </>):<button type="button" className="ss-button sr-grade-open" onClick={()=>select(personKey(student||{student:'',roster:''} as ClassReportRow),a.id)}>Buka penilaian manual</button>}
           </section>
         </section>;})}
         </>:<div className="ss-empty"><Users size={30}/><h3>Belum ada jawaban tugas</h3><p>Jawaban tugas dan refleksi akan tampil di sini.</p></div>}
        {message&&<p className={`sr-message${failed?' is-error':''}`} role={failed?'alert':'status'}>{message}</p>}
      </div>
    </div>
    <Dialog open={settingsOpen} onOpenChange={open=>{if(!open&&settingsEdited){if(!window.confirm('Buang perubahan pengaturan penilaian?'))return;loadSettings();}setSettingsOpen(open);}}><DialogContent className="ss-create-dialog sr-settings-dialog"><DialogHeader><DialogTitle>Pengaturan penilaian</DialogTitle><DialogDescription>{activity?.title} · Berlaku untuk seluruh mahasiswa pada kegiatan ini.</DialogDescription></DialogHeader>{lockedSettings&&<p className="sr-notice">Pengaturan dikunci karena penilaian sudah dibuat.</p>}<label>Mode penilaian<select disabled={lockedSettings||!canGrade} value={settingsMode} onChange={e=>{setSettingsMode(e.target.value as typeof settingsMode);setSettingsEdited(true);}}><option value="ungraded">Tanpa nilai — umpan balik saja</option><option value="points">Poin</option><option value="rubric">Rubrik</option></select></label>{settingsMode!=='ungraded'&&<label>Nilai maksimum<input type="number" min="1" max="100000" disabled={lockedSettings||!canGrade} value={maxPoints} onChange={e=>{setMaxPoints(e.target.value);setSettingsEdited(true);}}/></label>}{settingsMode==='rubric'&&<div className="sr-criteria-editor">{criteria.map((c,i)=><div key={c.id}><label>Kriteria {i+1}<input value={c.label} disabled={lockedSettings||!canGrade} onChange={e=>{setCriteria(prev=>prev.map((r,j)=>j===i?{...r,label:e.target.value}:r));setSettingsEdited(true);}}/></label><label>Poin<input type="number" min="1" disabled={lockedSettings||!canGrade} value={c.maxPoints} onChange={e=>{setCriteria(prev=>prev.map((r,j)=>j===i?{...r,maxPoints:e.target.value}:r));setSettingsEdited(true);}}/></label>{!lockedSettings&&canGrade&&<button className="ss-button ss-button-small" onClick={()=>{setCriteria(prev=>prev.filter((_,j)=>j!==i));setSettingsEdited(true);}}>Hapus</button>}</div>)}{!lockedSettings&&canGrade&&<button className="ss-button" onClick={()=>{setCriteria(prev=>[...prev,{id:`c${Date.now().toString(36)}`,label:'',maxPoints:'5'}]);setSettingsEdited(true);}}>Tambah kriteria</button>}</div>}{message&&failed&&<p role="alert" className="sr-message is-error">{message}</p>}<DialogFooter><button className="ss-button" onClick={()=>{if(!settingsEdited||window.confirm('Buang perubahan pengaturan penilaian?')){loadSettings();setSettingsOpen(false);}}}>Tutup</button>{!lockedSettings&&<button className="ss-button ss-button-primary" disabled={!canGrade||busy} onClick={()=>void saveSettings()}>Simpan pengaturan</button>}</DialogFooter></DialogContent></Dialog>
  </section>;
}
export default ScheduledReviewWorkspace;
