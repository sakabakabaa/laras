import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,ArrowDownUp,ArrowLeft,ArrowRight,BookOpen,Check,CheckCheck,ChevronDown,Clock3,FileCheck2,KeyRound,ListFilter,LoaderCircle,Lock,Minus,Search,Sparkles,Users,X} from 'lucide-react';
import {activityBookReference} from '@/lib/scheduled-book-reference';
import {scheduledAttemptMarks} from '@/lib/scheduled-answer-marks';
import type {ClassReportRow,ScheduledAssessment,ScheduledClassState} from '@/lib/scheduled-classes';
import {buildAssessmentPayload,buildGradingSettingsPayload,buildPublishPayload,emptyGradeDraft,hydrateGradeDraft,type GradeDraftState} from '@/lib/scheduled-review';
import {gradingModeLabel,nextManualTarget,requiresManual,responseVerdicts,reviewTally,verdictTally} from '@/lib/session-review-verdict';
import {aiDraftFor,aiRowLabel,AUTO_STATUS_LABELS,autoApproved,autoAttention,draftFromAi,effectiveSettings,gradeFromDraft,suggestionToCriteria,writtenItemsOf,writtenStatus,WRITTEN_STATUS_LABELS,type EffectiveSettings,type ScheduledAiDraftRecord,type WrittenStatus} from '@/lib/scheduled-grading';
import {requestScheduledAiDraft,runScheduledAiForAll,scheduledRubricSuggestions} from '@/lib/scheduled-grading-aids';
import type {WaveProgress} from '@/lib/evaluation-bulk';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {ScheduledGradingPanel,type ScheduledSuggestionState} from './grading/scheduled-grading-panel';
import {ScheduledFinalizeChecklist} from './scheduled-finalize-checklist';
import {isExactResponse,ScheduledExactAnswerOverview} from './scheduled-exact-answer-overview';
import {ScheduledAnswerIdentity,ScheduledWrittenAnswer} from './scheduled-written-answer';
import '@/styles/scheduled-review-overview.css';

type Selection={student?:string;activity?:string};
type Props={state:ScheduledClassState;onAction:(action:string,body?:Record<string,unknown>)=>Promise<unknown>;onDirtyChange?:(dirty:boolean)=>void;initialSelection?:Selection;onSelectionChange?:(selection:Selection)=>void};
type CriterionDraft={id:string;label:string;maxPoints:string};
const personKey=(row:ClassReportRow)=>row.student||row.roster;
const VERDICT_LABELS={correct:'Benar',wrong:'Salah',manual:'Perlu dinilai',ungraded:'Belum dijawab'} as const;
const VERDICT_ICONS={correct:Check,wrong:X,manual:Minus,ungraded:Minus} as const;
// One vocabulary with Tugas: Perlu dinilai → Siap disetujui (AI) / Draf dosen → Siap diterbitkan → Diterbitkan.
const FILTERS=[['all','Semua mahasiswa'],['unreviewed','Perlu dinilai'],['ai','Siap disetujui'],['draft','Draf dosen'],['reviewed','Siap diterbitkan'],['published','Diterbitkan'],['missing','Belum mengirim']] as const;
const STATUS_CLASS:Record<WrittenStatus,string>={missing:'missing',needs:'unreviewed',ai:'ai',draft:'draft',ready:'reviewed',published:'published'};
const DENSITY_KEY='laras.review.density';
const FALLBACK_CRITERIA:CriterionDraft[]=[{id:'clarity',label:'Kejelasan',maxPoints:'10'}];
const assessmentScore=(attempt?:ScheduledClassState['attempts'][number],assessment?:ScheduledAssessment)=>assessment?.settingsRevision===0&&Object.keys(assessment.answerOverrides||{}).length>0&&typeof assessment.points==='number'?assessment.points:attempt?.score;
const NO_SUGGESTION:ScheduledSuggestionState={loading:false,criteria:[],reason:''};

export function ScheduledReviewWorkspace({state,onAction,onDirtyChange,initialSelection,onSelectionChange}:Props){
  const activities=state.activities.filter(a=>a.kind==='assignment'||a.kind==='exit_ticket'||a.kind==='quiz');
  // Work that needs a human comes first; auto-graded activities fold into one summary line.
  const orderedActivities=[...activities.filter(a=>requiresManual(a)),...activities.filter(a=>!requiresManual(a))];
  const autoActivities=activities.filter(a=>!requiresManual(a));
  const attempts=state.attempts.filter(a=>a.status!=='draft'&&activities.some(activity=>activity.id===a.activity));
  const tally=useMemo(()=>reviewTally(state),[state]);
  const queue=useMemo(()=>nextManualTarget(state,activities),[state,activities]);
  const [studentKey,setStudentKey]=useState(initialSelection?.student||queue?.student||attempts[0]?.student||personKey(state.report[0]||{student:'',roster:''} as ClassReportRow));
  const [activityId,setActivityId]=useState(initialSelection?.activity||queue?.activity||activities[0]?.id||'');
  const [expandedActivity,setExpandedActivity]=useState<string|null>(initialSelection?.activity||queue?.activity||activities[0]?.id||null);
  const [exactDetailsOpen,setExactDetailsOpen]=useState(()=>activities.some(a=>a.id===initialSelection?.activity&&!requiresManual(a)));
  const [search,setSearch]=useState(''),[filters,setFilters]=useState<string[]>([]),[filterOpen,setFilterOpen]=useState(false),[sort,setSort]=useState<'roster'|'name'|'pending'>('roster');
  const [draft,setDraft]=useState<GradeDraftState>(emptyGradeDraft),[savedDraft,setSavedDraft]=useState(JSON.stringify(emptyGradeDraft));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false),[settingsEdited,setSettingsEdited]=useState(false);
  const [settingsMode,setSettingsMode]=useState<'ungraded'|'points'|'rubric'>('ungraded'),[maxPoints,setMaxPoints]=useState('10');
  const [criteria,setCriteria]=useState<CriterionDraft[]>(FALLBACK_CRITERIA);
  const [compact,setCompact]=useState(true);
  // AI drafts are stored per answer on the server; local copies show a fresh draft before the next state refresh.
  const [localAi,setLocalAi]=useState<Record<string,ScheduledAiDraftRecord>>({});
  const [aiRequesting,setAiRequesting]=useState<Record<string,boolean>>({}),[aiErrors,setAiErrors]=useState<Record<string,string>>({});
  const [bulkAi,setBulkAi]=useState<(WaveProgress&{running:boolean;activity:string})|null>(null);
  const stopBulkAi=useRef(false);
  const [suggestions,setSuggestions]=useState<Record<string,ScheduledSuggestionState>>({});
  const student=state.report.find(r=>personKey(r)===studentKey)||state.report[0];
  const activity=activities.find(a=>a.id===activityId)||activities[0];
  const attempt=attempts.find(a=>a.student===student?.student&&a.activity===activity?.id);
  const assessment=state.assessments?.find(a=>a.attempt===attempt?.id);
  const displayedScore=assessmentScore(attempt,assessment);
  const settings=state.gradingSettings?.find(s=>s.activity===activity?.id);
  const aiRecords=useMemo(()=>{const merged=new Map((state.aiDrafts||[]).map(r=>[r.attempt,r]));for(const r of Object.values(localAi)){const stored=merged.get(r.attempt);if(!stored||(r.updated||'')>=(stored.updated||''))merged.set(r.attempt,r);}return [...merged.values()];},[state.aiDrafts,localAi]);
  const aiFor=(tryItem:typeof attempt)=>aiDraftFor(aiRecords,tryItem);
  const suggestionFor=(id:string)=>suggestions[id]||NO_SUGGESTION;
  const effectiveFor=(a:typeof activity):EffectiveSettings=>effectiveSettings(state.gradingSettings?.find(s=>s.activity===a?.id),a?suggestionFor(a.id).criteria:[]);
  const effective=effectiveFor(activity);
  const canGrade=['closed','reviewed'].includes(state.class?.phase||'');
  const lockedFor=(id?:string)=>!!state.assessments?.some(a=>a.activity===id);
  const lockedSettings=lockedFor(activity?.id);
  const dirty=JSON.stringify(draft)!==savedDraft;
  const unsaved=dirty||settingsEdited;
  const attemptId=attempt?.id||null,ownerRef=useRef<string|null>(attemptId);
  const currentAi=aiFor(attempt);
  const aiKey=currentAi?`${currentAi.status}:${currentAi.updated||''}:${currentAi.draft?.suggestedScore??''}`:'';
  const effectiveKey=`${effective.source}:${effective.mode}:${effective.criteria.map(c=>c.id).join(',')}`;
  const cards=useMemo(()=>activity&&attempt?responseVerdicts(activity,attempt):[],[activity,attempt]);
  const cardsFor=(a:typeof activities[number],tryItem:typeof attempts[number]|undefined)=>responseVerdicts(a,tryItem);
  const cardsWithOverrides=(a:typeof activities[number],tryItem:typeof attempts[number]|undefined,graded:typeof assessment)=>cardsFor(a,tryItem).map(card=>{const override=graded?.answerOverrides?.[card.id];return override==='correct'?{...card,verdict:'correct' as const,earned:card.points}:override==='wrong'?{...card,verdict:'wrong' as const,earned:0}:card;});
  const cardTally=useMemo(()=>verdictTally(cards,attempt),[cards,attempt]);
  const autoEntries=student?autoActivities.map(a=>{const own=attempts.find(t=>t.student===student.student&&t.activity===a.id);const graded=state.assessments?.find(g=>g.attempt===own?.id);return {activity:a,attempt:own,assessment:graded,score:assessmentScore(own,graded),wrong:own?cardsWithOverrides(a,own,graded).filter(c=>c.verdict==='wrong').length:0};}):[];
  const autoScores=autoEntries.map(e=>e.score).filter((v):v is number=>typeof v==='number');
  const autoAverage=autoScores.length?Math.round(autoScores.reduce((sum,v)=>sum+v,0)/autoScores.length):null;
  const autoPending=autoEntries.filter(e=>e.attempt&&typeof e.attempt.score==='number'&&!autoApproved(e.attempt,e.assessment)).length;
  const attention=autoAttention(autoEntries);
  const loadSettings=()=>{
    const suggested=!settings&&activity?suggestionToCriteria(suggestionFor(activity.id).criteria):[];
    if(settings){setSettingsMode(settings.mode);setMaxPoints(String(settings.maxPoints||10));setCriteria(settings.criteria.length?settings.criteria.map(c=>({...c,maxPoints:String(c.maxPoints)})):FALLBACK_CRITERIA);}
    else if(suggested.length){setSettingsMode('rubric');setMaxPoints('100');setCriteria(suggested.map(c=>({...c,maxPoints:String(c.maxPoints)})));}
    else{setSettingsMode('points');setMaxPoints('100');setCriteria(FALLBACK_CRITERIA);}
    setSettingsEdited(false);
  };
  // Never overwrite settings the lecturer is editing in the dialog.
  const suggestionCount=activity?suggestions[activity.id]?.criteria.length||0:0;
  useEffect(()=>{if(!settingsEdited)loadSettings();},[activity?.id,settings?.revision,suggestionCount]);
  useEffect(()=>{try{setCompact(localStorage.getItem(DENSITY_KEY)!=='full');}catch{/* storage blocked */}},[]);
  // Suggested rubric: written activities without saved settings get criteria derived from their model answers + guidance.
  const fetchSuggestion=(id:string,refresh=false)=>{
    setSuggestions(prev=>({...prev,[id]:{loading:true,criteria:[],reason:''}}));
    scheduledRubricSuggestions(state.session.id,id,refresh)
      .then(result=>setSuggestions(prev=>({...prev,[id]:{loading:false,criteria:result.pending,reason:result.reason}})))
      .catch((error:Error)=>setSuggestions(prev=>({...prev,[id]:{loading:false,criteria:[],reason:error.message}})));
  };
  useEffect(()=>{
    if(!activity||!canGrade||!requiresManual(activity)||settings||suggestions[activity.id])return;
    fetchSuggestion(activity.id);
  },[activity?.id,canGrade,settings?.revision]);
  useEffect(()=>{
    const next=hydrateGradeDraft(draft,ownerRef.current,attemptId,assessment,dirty);
    if(!(next.changedIdentity||!dirty))return;
    // Without a lecturer assessment the stored AI draft is the starting point, as in Tugas.
    const hydrated=!assessment&&currentAi?.status==='ready'?draftFromAi(effective,currentAi):next.draft;
    setDraft(hydrated);setSavedDraft(JSON.stringify(hydrated));ownerRef.current=attemptId;
  },[attemptId,assessment?.revision,dirty,aiKey,effectiveKey]);
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
  const rememberDensity=(next:boolean)=>{setCompact(next);try{localStorage.setItem(DENSITY_KEY,next?'compact':'full');}catch{/* storage blocked */}};
  const guard=()=>!unsaved||window.confirm('Perubahan penilaian belum disimpan. Buang perubahan dan lanjutkan?');
  // Selecting a student or activity never scrolls the page: the review surface is a
  // plain document, so the lecturer keeps their own scroll position.
  const select=(nextStudent:string,nextActivity=activity?.id||'',afterSave=false)=>{
    if(nextStudent===personKey(student||{student:'',roster:''} as ClassReportRow)&&nextActivity===activity?.id){setExpandedActivity(nextActivity);return true;}
    if(!afterSave&&!guard())return false;
    setStudentKey(nextStudent);setActivityId(nextActivity);setExpandedActivity(nextActivity);setMessage('');onSelectionChange?.({student:nextStudent,activity:nextActivity});return true;
  };
  const showError=(error:unknown)=>{setFailed(true);setMessage((error as Error).message||'Perubahan belum dapat disimpan. Coba lagi.');};
  const criteriaPayload=criteria.map(c=>({id:c.id,label:c.label.trim(),maxPoints:Number(c.maxPoints)}));
  const saveSettingsPayload=(forActivity:string,mode:EffectiveSettings['mode'],max:number,list:EffectiveSettings['criteria'])=>onAction('saveGradingSettings',buildGradingSettingsPayload({activityId:forActivity,settingsRevision:state.gradingSettings?.find(item=>item.activity===forActivity)?.revision||0,mode,maxPoints:mode==='ungraded'?0:max,criteria:mode==='rubric'?list:[]}));
  const saveSettings=async()=>{
    if(!activity)return;
    if(settingsMode==='rubric'&&(!criteriaPayload.length||criteriaPayload.some(c=>!c.label||!Number.isFinite(c.maxPoints)||c.maxPoints<=0)||Math.abs(criteriaPayload.reduce((sum,c)=>sum+c.maxPoints,0)-Number(maxPoints))>1e-8)){showError(new Error('Lengkapi kriteria rubrik. Total poin kriteria harus sama dengan nilai maksimum.'));return;}
    setBusy(true);setFailed(false);
    try{await saveSettingsPayload(activity.id,settingsMode,Number(maxPoints),criteriaPayload);setSettingsEdited(false);setSettingsOpen(false);setMessage('Pengaturan penilaian tersimpan untuk kegiatan ini.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const saveGrade=async(reviewStatus:'draft'|'reviewed',next=false)=>{
    if(!attempt||!activity)return;
    // The server validates drafts like final grades, so a draft also needs every score.
    const payloadGrade=gradeFromDraft(effective,draft);
    if('error' in payloadGrade){showError(new Error(payloadGrade.error));return;}
    setBusy(true);setFailed(false);
    try{
      let settingsRevision=effective.revision;
      // Grading is never blocked behind setup: the suggested (or 0–100) settings are saved with the first grade.
      if(effective.provisional){await saveSettingsPayload(activity.id,effective.mode,effective.maxPoints,effective.criteria);settingsRevision=1;}
      await onAction('saveAssessment',buildAssessmentPayload({attemptId:attempt.id,assessmentRevision:assessment?.revision||0,attemptRevision:attempt.revision,settingsRevision,status:reviewStatus,...payloadGrade,feedback:draft.feedback}));
      setSavedDraft(JSON.stringify(draft));
      setMessage(reviewStatus==='draft'?'Draf penilaian tersimpan. Hanya dosen yang dapat melihatnya.':'Penilaian disimpan · Siap diterbitkan.');
      if(next){const nextTarget=nextManualTarget(state,activities,{student:attempt.student,activity:activity.id});if(nextTarget&&nextTarget.id!==attempt.id)select(nextTarget.student,nextTarget.activity,true);else setMessage('Penilaian disimpan · Siap diterbitkan. Tidak ada jawaban lain yang perlu dinilai.');}
    }catch(e){showError(e);}finally{setBusy(false);}
  };
  const approveAutoScoreFor=async(tryItem:typeof attempt,graded:typeof assessment)=>{
    if(!tryItem||typeof tryItem.score!=='number'||autoApproved(tryItem,graded))return;
    setBusy(true);setFailed(false);setMessage('');
    try{await onAction('approveAutoScore',{attemptId:tryItem.id,attemptRevision:tryItem.revision,assessmentRevision:graded?.revision||0});setMessage('Nilai otomatis disetujui.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const overrideAutoAnswer=async(tryItem:typeof attempt,graded:typeof assessment,itemId:string,verdict:'correct'|'wrong'|null)=>{
    if(!tryItem||!guard())return;
    setBusy(true);setFailed(false);setMessage('');
    try{await onAction('overrideAutoAnswer',{attemptId:tryItem.id,attemptRevision:tryItem.revision,assessmentRevision:graded?.revision||0,itemId,verdict});setMessage('Penilaian jawaban diperbarui.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const applyPreset=async(mode:'points'|'ungraded',forActivity:typeof activities[number])=>{
    setBusy(true);setFailed(false);
    try{await saveSettingsPayload(forActivity.id,mode,100,[]);setMessage('Pengaturan penilaian tersimpan untuk kegiatan ini.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const acceptSuggestion=async(forActivity:typeof activities[number])=>{
    const suggested=effectiveFor(forActivity);
    if(suggested.source!=='suggested')return;
    setBusy(true);setFailed(false);
    try{await saveSettingsPayload(forActivity.id,'rubric',suggested.maxPoints,suggested.criteria);setMessage('Saran rubrik disimpan sebagai cara menilai kegiatan ini.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const publish=async()=>{
    if(!attempt||!settings||!assessment||dirty)return;
    setBusy(true);setFailed(false);
    try{await onAction('publishAssessment',buildPublishPayload({attemptId:attempt.id,assessmentRevision:assessment.revision||0,attemptRevision:attempt.revision,settingsRevision:settings.revision}));setMessage('Nilai dan umpan balik sudah diterbitkan kepada mahasiswa.');}catch(e){showError(e);}finally{setBusy(false);}
  };
  const writtenOf=(a:typeof activities[number],tryItem:typeof attempt)=>tryItem?writtenItemsOf(a,tryItem.answers):[];
  const provisionalCriteria=(a:typeof activities[number])=>{const eff=effectiveFor(a);return eff.provisional&&eff.mode==='rubric'?eff.criteria:[];};
  const requestAiFor=async(a:typeof activities[number],tryItem:NonNullable<typeof attempt>)=>{
    setAiRequesting(prev=>({...prev,[tryItem.id]:true}));setAiErrors(prev=>({...prev,[tryItem.id]:''}));
    try{const record=await requestScheduledAiDraft(state.session.id,tryItem.id,provisionalCriteria(a));setLocalAi(prev=>({...prev,[tryItem.id]:{...record,updated:new Date().toISOString()}}));return true;}
    catch(e){setAiErrors(prev=>({...prev,[tryItem.id]:(e as Error).message}));return false;}
    finally{setAiRequesting(prev=>({...prev,[tryItem.id]:false}));}
  };
  // "Jalankan AI untuk semua" for the open activity: answers without a lecturer grade and without a usable AI draft.
  const needsAi=activity&&requiresManual(activity)&&canGrade?attempts.filter(t=>t.activity===activity.id&&!state.assessments?.some(g=>g.attempt===t.id)&&aiFor(t)?.status!=='ready'&&writtenOf(activity,t).length>0):[];
  const runBulkAi=async()=>{
    if(!activity||bulkAi?.running||!needsAi.length)return;
    const forActivity=activity,targets=needsAi;
    stopBulkAi.current=false;
    setBulkAi({done:0,total:targets.length,failed:0,running:true,activity:forActivity.id});
    const result=await runScheduledAiForAll(targets.map(t=>t.id),async id=>{const target=targets.find(t=>t.id===id);return target?requestAiFor(forActivity,target):false;},progress=>setBulkAi({...progress,running:true,activity:forActivity.id}),()=>stopBulkAi.current);
    setBulkAi({...result,running:false,activity:forActivity.id});
    void onAction('state').catch(()=>{});
  };
  const statusOf=(tryItem:typeof attempt)=>writtenStatus(tryItem,state.assessments?.find(g=>g.attempt===tryItem?.id),aiFor(tryItem));
  const matchesFilter=(entry:{work:typeof attempts;relevant:typeof attempts[number]|undefined;status:WrittenStatus},value:string)=>{
    if(value==='missing')return !entry.work.length;
    if(!entry.relevant||!activity)return false;
    if(!requiresManual(activity)){const approved=autoApproved(entry.relevant,state.assessments?.find(g=>g.attempt===entry.relevant?.id));return value==='unreviewed'?!approved:value==='reviewed'?approved:false;}
    if(value==='unreviewed')return entry.status==='needs';
    if(value==='ai')return entry.status==='ai';
    if(value==='draft')return entry.status==='draft';
    if(value==='reviewed')return entry.status==='ready';
    if(value==='published')return entry.status==='published';
    return true;
  };
  const visible=useMemo(()=>{
    const rows=state.report.map(row=>{
    const work=attempts.filter(a=>a.student===row.student);
    const relevant=activity?work.find(a=>a.activity===activity.id):undefined;
    return {row,work,relevant,status:statusOf(relevant)};
    }).filter(entry=>{
    const {row}=entry;
    if(!`${row.name} ${row.nim}`.toLowerCase().includes(search.toLowerCase()))return false;
    if(filters.length&&!filters.includes('all')&&!filters.some(value=>matchesFilter(entry,value)))return false;
    return true;
    });
    const done=(status:WrittenStatus)=>status==='ready'||status==='published';
    return rows.sort((a,b)=>sort==='name'?a.row.name.localeCompare(b.row.name,'id'):sort==='pending'?Number(done(a.status))-Number(done(b.status))||a.row.name.localeCompare(b.row.name,'id'):state.report.findIndex(row=>personKey(row)===personKey(a.row))-state.report.findIndex(row=>personKey(row)===personKey(b.row)));
  },[state,attempts,activity,search,filters,sort,matchesFilter,statusOf]);
  const activeIndex=visible.findIndex(({row})=>personKey(row)===personKey(student||{student:'',roster:''} as ClassReportRow));
  const step=(delta:number)=>{const next=visible[activeIndex+delta];if(next)select(personKey(next.row));};
  const countOf=(value:string)=>value==='all'?state.report.length:state.report.filter(row=>{const work=attempts.filter(item=>item.student===row.student);const relevant=activity?work.find(item=>item.activity===activity.id):undefined;return matchesFilter({work,relevant,status:statusOf(relevant)},value);}).length;
  const toggleFilter=(value:string)=>setFilters(previous=>value==='all'?[]:previous.includes(value)?previous.filter(item=>item!==value):[...previous.filter(item=>item!=='all'),value]);
  const filterLabel=filters.length===0||filters.includes('all')?'Semua mahasiswa':FILTERS.filter(([value])=>filters.includes(value)).map(([,label])=>label).join(' · ');
  const pendingCount=tally.pending,autoCount=tally.autoScored;
  const openAuto=(id:string)=>{if(student&&select(personKey(student),id))setExactDetailsOpen(true);};
  return <section className="sr-workspace" aria-label="Tinjau jawaban tugas">
    <div className="evx-stats sr-summary" aria-label="Ringkasan pengumpulan kelas">
      <div className="evx-stat"><span className="evx-stat-ico blue"><Users size={16}/></span><div><strong>{state.report.length}</strong><span>Mahasiswa</span></div></div>
      <div className="evx-stat"><span className="evx-stat-ico blue"><FileCheck2 size={16}/></span><div><strong>{attempts.length}</strong><span>Jawaban terkumpul</span></div></div>
      <div className="evx-stat"><span className="evx-stat-ico amber"><Clock3 size={16}/></span><div><strong>{pendingCount}</strong><span>Perlu dinilai</span></div></div>
      <div className="evx-stat"><span className="evx-stat-ico green"><CheckCheck size={16}/></span><div><strong>{tally.reviewed}</strong><span>Sudah dinilai</span></div></div>
      <div className="evx-stat quiet"><div><strong>{autoCount}</strong><span>Dinilai otomatis</span></div></div>
    </div>
    <div className="sr-toolbar"><div><h2>Jawaban & nilai</h2><p>{tally.reviewed} dari {tally.manual} kiriman dinilai{tally.auto>0?` · ${tally.auto} dinilai otomatis`:''}</p></div><div className="sr-toolbar-actions">{activity&&requiresManual(activity)&&canGrade&&<button type="button" className="ss-button ss-button-small" disabled={Boolean(bulkAi?.running)||needsAi.length===0} title="Minta draf AI untuk setiap jawaban kegiatan ini yang belum dinilai dan belum memiliki draf. Tidak mengubah nilai resmi." onClick={()=>void runBulkAi()}>{bulkAi?.running?<LoaderCircle size={14} className="spin"/>:<Sparkles size={14}/>}Jalankan AI untuk semua ({needsAi.length})</button>}{tally.pending>0&&queue&&<button className="ss-button ss-button-small ss-button-primary" disabled={busy} onClick={()=>select(queue.student,queue.activity)}>Perlu dinilai {tally.pending}<ArrowRight size={15}/></button>}<span className="sr-review-progress" aria-label={`${tally.reviewed} dari ${tally.manual} dinilai`}><span style={{width:`${tally.manual?tally.reviewed/tally.manual*100:0}%`}}/></span></div></div>
    <ScheduledFinalizeChecklist state={state} onAction={onAction} busy={busy} collapsible onGrade={queue?()=>select(queue.student,queue.activity):undefined}/>
    {bulkAi&&<section className="evx-sync" role="status" aria-live="polite" aria-label="Status AI massal">
      {bulkAi.running?<LoaderCircle size={15} className="spin"/>:<Sparkles size={15}/>}
      <div><strong>{bulkAi.running?`Menjalankan AI: ${bulkAi.done} dari ${bulkAi.total} jawaban selesai…`:`AI selesai untuk ${bulkAi.done-bulkAi.failed} dari ${bulkAi.total} jawaban${bulkAi.failed?`, ${bulkAi.failed} gagal`:''}.`}</strong>
      <span>{bulkAi.running?'Draf diminta tiga jawaban sekaligus agar layanan AI tidak kewalahan. Biarkan halaman ini terbuka. Nilai resmi tidak berubah.':'Draf AI tersimpan per jawaban dan hanya usulan. Tinjau, Simpan & berikutnya, lalu terbitkan.'}</span></div>
      {bulkAi.running?<button type="button" className="ld-outline-action sm" onClick={()=>{stopBulkAi.current=true;}}>Hentikan</button>:<button type="button" className="ld-outline-action sm" onClick={()=>setBulkAi(null)}>Tutup</button>}
    </section>}
    {!canGrade&&<p className="sr-notice"><Clock3 size={17}/>Jawaban dapat dipantau sekarang. Penilaian dan penerbitan tersedia setelah kelas selesai.</p>}
    <div className="sr-review-bar">
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
        {visible.length? <ul className="eval-people">{visible.map(({row,relevant,status:studentStatus})=>{
          const current=personKey(row)===personKey(student||{student:'',roster:''} as ClassReportRow),assessmentForRow=state.assessments?.find(item=>item.attempt===relevant?.id);
          const auto=!!activity&&!requiresManual(activity),approved=autoApproved(relevant,assessmentForRow);
          const rowAi=auto?undefined:aiFor(relevant);
          const score=auto?assessmentScore(relevant,assessmentForRow):typeof assessmentForRow?.points==='number'?assessmentForRow.points:undefined;
          const scoreLabel=score==null?(rowAi&&!assessmentForRow?aiRowLabel(rowAi):'—'):String(score);
          const statusLabel=!relevant?'Belum mengirim':auto?(approved?AUTO_STATUS_LABELS.approved:AUTO_STATUS_LABELS.pending):WRITTEN_STATUS_LABELS[studentStatus];
          const done=auto?approved:studentStatus==='ready'||studentStatus==='published';
          return <li key={personKey(row)}><button type="button" className={`evx-person${current?' active':''}${done?' graded':' pending-grade'}`} aria-current={current?'true':undefined} onClick={()=>select(personKey(row))}><span className="cw-student-avatar">{row.name.split(/\s+/).slice(0,2).map(name=>name[0]).join('').toUpperCase()}</span><span><strong>{row.name}</strong><small>{row.nim||'NIM belum tersedia'}</small></span><em>{scoreLabel}</em><span className={`asg-tag sr-review-status sr-status-${auto?(approved?'published':'unreviewed'):STATUS_CLASS[studentStatus]}`}>{statusLabel}</span>{rowAi?.status==='failed'&&!assessmentForRow&&<span className="evx-ai-state failed">AI gagal</span>}</button></li>;
        })}</ul>:<div className="evx-empty-card" role="status"><Users size={18}/><strong>Belum ada mahasiswa</strong><p>{state.report.length?'Tidak ada mahasiswa pada saringan ini. Ubah filter atau kata kunci.':'Daftar mahasiswa akan tampil di sini.'}</p></div>}
        <p className="sr-student-count">{visible.length} dari {state.report.length} mahasiswa</p>
      </aside>
      <div className="sr-answer-area">
        {student&&activity?<>
         {autoActivities.length>0&&<section className="sr-auto-summary" aria-label="Ringkasan penilaian otomatis">
           <div><strong>Dinilai otomatis</strong><span>{autoActivities.length} kegiatan{autoAverage!==null?` · rata-rata ${autoAverage}`:''}{autoPending?` · ${autoPending} perlu disetujui`:''}</span></div>
           <button type="button" className="sr-exact-toggle" aria-expanded={exactDetailsOpen} aria-controls="sr-activity-reviews" onClick={()=>setExactDetailsOpen(open=>!open)}><ChevronDown size={16} aria-hidden="true"/>{exactDetailsOpen?'Sembunyikan rincian':'Lihat rincian'}</button>
           {attention.length>0&&<ul className="sr-auto-attention" aria-label="Perlu perhatian">{attention.map(item=><li key={item.activity}><button type="button" onClick={()=>openAuto(item.activity)}><AlertTriangle size={13} aria-hidden="true"/><strong>{item.title}</strong><span>{item.score==null?'—':`${item.score}/100`}{item.wrong?` · ${item.wrong} salah`:''}{item.low?' · nilai rendah':''}{item.overrides?` · ${item.overrides} jawaban disesuaikan`:''}{item.overrides&&!item.approved?' · penyesuaian belum terlihat mahasiswa':''}</span><em>{item.approved?AUTO_STATUS_LABELS.approved:AUTO_STATUS_LABELS.pending}</em></button></li>)}</ul>}
         </section>}
         {exactDetailsOpen&&<ScheduledExactAnswerOverview entries={activities.map((a,index)=>{const own=attempts.find(item=>item.student===student.student&&item.activity===a.id);const graded=state.assessments?.find(item=>item.attempt===own?.id);return {activity:a,index,cards:cardsWithOverrides(a,own,graded),score:assessmentScore(own,graded),submitted:!!own};})} selectedActivity={activity.id} onSelect={id=>{if(select(personKey(student),id))setExactDetailsOpen(true);}}/>}
         <div id="sr-activity-reviews">
         {orderedActivities.map(a=>{const index=activities.indexOf(a);const own=attempts.find(t=>t.student===student?.student&&t.activity===a.id);const ownAssessment=state.assessments?.find(g=>g.attempt===own?.id);const ownScore=assessmentScore(own,ownAssessment);const ownCards=cardsWithOverrides(a,own,ownAssessment);const sectionAuto=a.kind==='quiz'||!requiresManual(a);const ownMarks=sectionAuto?undefined:scheduledAttemptMarks(aiRecords.find(r=>r.attempt===own?.id),own,ownCards.filter(c=>!isExactResponse(a,c)));const sectionApproved=autoApproved(own,ownAssessment);const sectionSelected=activity?.id===a.id;const ownStatus=writtenStatus(own,ownAssessment,aiFor(own));return <section key={a.id} id={'review-activity-'+a.id} data-activity-id={a.id} hidden={sectionAuto&&!exactDetailsOpen} className={'sr-activity-block'+(!sectionAuto?' sr-written-activity':'')+(sectionSelected?' is-active':'')} aria-labelledby={'review-activity-title-'+a.id}>
           <header className="sr-activity-head"><h3 id={'review-activity-title-'+a.id}><button type="button" className="sr-activity-select" aria-expanded={expandedActivity===a.id} aria-controls={`review-response-${a.id} review-assessment-${a.id}`} onClick={()=>{if(expandedActivity===a.id)setExpandedActivity(null);else select(personKey(student),a.id);}}><ChevronDown size={16} className="sr-activity-chevron" aria-hidden="true"/><span className="sr-activity-index">{index+1}</span>{a.title}</button></h3><span className="sr-mode-chip">{gradingModeLabel(a)}</span>{!sectionAuto&&lockedFor(a.id)&&<span className="sr-mode-chip" title="Cara menilai terkunci karena sudah ada penilaian"><Lock size={11} aria-hidden="true"/> Terkunci</span>}{own&&typeof ownScore==='number'&&<span className="sr-activity-total">{ownScore} / 100</span>}<span className={'sr-review-status sr-status-'+(own?(sectionAuto?(sectionApproved?'published':'unreviewed'):STATUS_CLASS[ownStatus]):'missing')}>{own?(sectionAuto?(sectionApproved?AUTO_STATUS_LABELS.approved:AUTO_STATUS_LABELS.pending):WRITTEN_STATUS_LABELS[ownStatus]):'Belum mengirim'}</span></header>
           <div id={`review-response-${a.id}`} className="sr-activity-response" hidden={expandedActivity!==a.id}>
           {(activityBookReference(a)||a.worksheet?.sourceLabel)&&<p className="ss-source-label"><BookOpen size={15}/>{activityBookReference(a)||a.worksheet?.sourceLabel}</p>}
           {own?<>{!sectionAuto&&<ScheduledAnswerIdentity student={student} attempt={own}/>}<ol className={'sr-response-list'+(compact?' is-compact':'')}>{ownCards.map(card=>{const Icon=VERDICT_ICONS[card.verdict];const showKey=card.verdict==='wrong';const exact=isExactResponse(a,card);return <li key={card.id} hidden={exact&&!exactDetailsOpen} className={`sr-response-row is-${card.verdict}${!exact?' is-written':''}`}>
             {exact&&<span className="sr-row-verdict" title={VERDICT_LABELS[card.verdict]}><Icon size={14}/><span className="sr-sr-only">{VERDICT_LABELS[card.verdict]}</span></span>}<div className="sr-row-body">
               {exact?<><div className="sr-row-head"><span className="sr-row-number">{card.number}</span><p className="sr-row-prompt" lang="de">{card.prompt}</p>{card.points!==undefined&&<span className="sr-row-points">{card.earned||0}/{card.points}</span>}</div><div className="sr-row-answer"><span>Jawaban</span><p className={card.answer?'':'is-empty'}>{card.answer||'Belum dijawab'}</p></div></>:<ScheduledWrittenAnswer card={card} marks={ownMarks}/>}
               {showKey&&card.accepted?.length?<div className="sr-row-key"><KeyRound size={13}/><span>Diterima</span><p>{card.accepted.join(' / ')}</p></div>:null}
               {(a.kind==='quiz'||!requiresManual(a))&&card.points!==undefined&&card.answer&&<div className="sr-answer-override" aria-label={`Ubah penilaian jawaban ${card.number}`}><span>{ownAssessment?.answerOverrides?.[card.id]?'Penilaian dosen':'Jawaban kunci'}</span><button type="button" className={card.verdict==='correct'?'is-selected':''} disabled={!canGrade||busy||card.verdict==='correct'} onClick={()=>void overrideAutoAnswer(own,ownAssessment,card.id,'correct')}>Tandai benar</button><button type="button" className={card.verdict==='wrong'?'is-selected':''} disabled={!canGrade||busy||card.verdict==='wrong'} onClick={()=>void overrideAutoAnswer(own,ownAssessment,card.id,'wrong')}>Tandai salah</button>{ownAssessment?.answerOverrides?.[card.id]&&<button type="button" disabled={!canGrade||busy} onClick={()=>void overrideAutoAnswer(own,ownAssessment,card.id,null)}>Reset ke kunci</button>}</div>}
               {card.modelAnswer&&<details className="sr-row-reference" open><summary><BookOpen size={13}/>Contoh jawaban & rubrik</summary><p className="sr-reference-answer">{card.modelAnswer}</p>{card.rubric&&<p className="sr-reference-rubric">{card.rubric}</p>}{sectionSelected&&!sectionAuto&&<button type="button" className="ss-button ss-button-small" disabled={!canGrade||busy} onClick={()=>setDraft(d=>({...d,feedback:[card.rubric,card.modelAnswer?`Contoh jawaban:\n${card.modelAnswer}`:''].filter(Boolean).join('\n\n')}))}>Pakai sebagai umpan balik</button>}</details>}
             </div></li>;})}</ol></>:<p className="sr-activity-empty">Belum ada jawaban untuk kegiatan ini.</p>}
           {a.kind==='exit_ticket'&&typeof own?.answers.feedback==='string'&&own.answers.feedback.trim()&&<section className="sr-exit-feedback"><h4>Masukan untuk pembelajaran</h4><p>{own.answers.feedback}</p><small>Masukan mahasiswa · tidak dinilai</small></section>}
           </div>
           <section id={`review-assessment-${a.id}`} hidden={expandedActivity!==a.id} className={`sr-grading-section sr-activity-assessment${sectionSelected?' is-current':''}`} aria-label={`Penilaian kegiatan ${a.title}`}>
          {sectionAuto?<><p>{ownAssessment?.answerOverrides&&Object.keys(ownAssessment.answerOverrides).length?`Penilaian otomatis · ${Object.keys(ownAssessment.answerOverrides).length} jawaban disesuaikan`:own?'Penilaian otomatis dihitung dari kunci jawaban.':'Penilaian otomatis belum tersedia.'}</p><button type="button" className="ss-button ss-button-primary" disabled={!own||typeof own.score!=='number'||!canGrade||busy||sectionApproved} onClick={()=>void approveAutoScoreFor(own,ownAssessment)}>{busy?'Menyimpan…':sectionApproved?'Nilai disetujui':'Setujui nilai otomatis'}</button></>:sectionSelected?(own?<ScheduledGradingPanel
              activity={a} attempt={own} assessment={ownAssessment} settings={effective} locked={lockedSettings}
              draft={draft} onDraftChange={setDraft} dirty={dirty}
              aiRecord={aiFor(own)} aiRequesting={!!aiRequesting[own.id]} aiError={aiErrors[own.id]||''} hasWritten={writtenOf(a,own).length>0}
              onRequestAi={()=>void requestAiFor(a,own)}
              suggestion={suggestionFor(a.id)} canGrade={canGrade} busy={busy}
              onSave={(status,next)=>void saveGrade(status,next)} onPublish={()=>void publish()}
              onAcceptSuggestion={()=>void acceptSuggestion(a)} onPreset={mode=>void applyPreset(mode,a)}
              onOpenSettings={()=>{setFailed(false);setMessage('');loadSettings();setSettingsOpen(true);}}
              onRetrySuggestion={()=>fetchSuggestion(a.id,true)}
            />:<p className="sr-notice">Mahasiswa belum mengirim jawaban untuk bagian ini.</p>):<button type="button" className="ss-button sr-grade-open" onClick={()=>select(personKey(student||{student:'',roster:''} as ClassReportRow),a.id)}>Buka penilaian</button>}
           </section>
         </section>;})}
         </div>
         </>:<div className="ss-empty"><Users size={30}/><h3>Belum ada jawaban tugas</h3><p>Jawaban tugas dan refleksi akan tampil di sini.</p></div>}
        {message&&<p className={`sr-message${failed?' is-error':''}`} role={failed?'alert':'status'}>{message}</p>}
      </div>
    </div>
    <Dialog open={settingsOpen} onOpenChange={open=>{if(!open&&settingsEdited){if(!window.confirm('Buang perubahan pengaturan penilaian?'))return;loadSettings();}setSettingsOpen(open);}}><DialogContent className="ss-create-dialog sr-settings-dialog"><DialogHeader><DialogTitle>Pengaturan penilaian</DialogTitle><DialogDescription>{activity?.title} · Berlaku untuk seluruh mahasiswa pada kegiatan ini.</DialogDescription></DialogHeader>{lockedSettings&&<p className="sr-notice"><Lock size={15}/>Pengaturan terkunci karena sudah ada penilaian untuk kegiatan ini. Mengubah mode atau kriteria akan membatalkan nilai yang sudah dibuat.</p>}{!settings&&activity&&suggestionFor(activity.id).criteria.length>0&&!lockedSettings&&<p className="sr-notice"><Sparkles size={15}/>Kriteria di bawah disarankan dari contoh jawaban & panduan penilaian. Ubah sesuai kebutuhan sebelum menyimpan.</p>}<label>Mode penilaian<select disabled={lockedSettings||!canGrade} value={settingsMode} onChange={e=>{setSettingsMode(e.target.value as typeof settingsMode);setSettingsEdited(true);}}><option value="ungraded">Tanpa nilai — umpan balik saja</option><option value="points">Poin</option><option value="rubric">Rubrik</option></select></label>{settingsMode!=='ungraded'&&<label>Nilai maksimum<input type="number" min="1" max="100000" disabled={lockedSettings||!canGrade} value={maxPoints} onChange={e=>{setMaxPoints(e.target.value);setSettingsEdited(true);}}/></label>}{settingsMode==='rubric'&&<div className="sr-criteria-editor">{criteria.map((c,i)=><div key={c.id}><label>Kriteria {i+1}<input value={c.label} disabled={lockedSettings||!canGrade} onChange={e=>{setCriteria(prev=>prev.map((r,j)=>j===i?{...r,label:e.target.value}:r));setSettingsEdited(true);}}/></label><label>Poin<input type="number" min="1" disabled={lockedSettings||!canGrade} value={c.maxPoints} onChange={e=>{setCriteria(prev=>prev.map((r,j)=>j===i?{...r,maxPoints:e.target.value}:r));setSettingsEdited(true);}}/></label>{!lockedSettings&&canGrade&&<button className="ss-button ss-button-small" onClick={()=>{setCriteria(prev=>prev.filter((_,j)=>j!==i));setSettingsEdited(true);}}>Hapus</button>}</div>)}{!lockedSettings&&canGrade&&<button className="ss-button" onClick={()=>{setCriteria(prev=>[...prev,{id:`c${Date.now().toString(36)}`,label:'',maxPoints:'5'}]);setSettingsEdited(true);}}>Tambah kriteria</button>}</div>}{message&&failed&&<p role="alert" className="sr-message is-error">{message}</p>}<DialogFooter><button className="ss-button" onClick={()=>{if(!settingsEdited||window.confirm('Buang perubahan pengaturan penilaian?')){loadSettings();setSettingsOpen(false);}}}>Tutup</button>{!lockedSettings&&<button className="ss-button ss-button-primary" disabled={!canGrade||busy} onClick={()=>void saveSettings()}>Simpan pengaturan</button>}</DialogFooter></DialogContent></Dialog>
  </section>;
}
export default ScheduledReviewWorkspace;
