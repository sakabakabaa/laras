import type {ClassReportRow,ScheduledAttempt} from '@/lib/scheduled-classes';
import {wibLabel} from '@/lib/scheduled-classes';
import type {ResponseVerdictCard} from '@/lib/session-review-verdict';
import type {AttemptMarks} from '@/lib/scheduled-answer-marks';
import {MarkedText,MarkLegend} from './grading/marked-text';

export function ScheduledAnswerIdentity({student,attempt}:{student:ClassReportRow;attempt:ScheduledAttempt}){
  return <div className="evx-who sr-written-identity"><span className="evx-avatar lg">{student.name.charAt(0).toUpperCase()}</span><div><h4>{student.name}</h4><p>NIM {student.nim||'belum tersedia'} · Terkumpul{attempt.finalizedAt?` · ${wibLabel(attempt.finalizedAt)}`:''}</p></div></div>;
}

/** Compact "what the AI draft was based on" chips for a written answer (only what the draft recorded). */
function ScheduledChips({marks}:{marks?:AttemptMarks}){
  if(!marks||marks.status==='none')return null;
  const chips:{label:string;on:boolean;tip:string}[]=[{label:'Teks terbaru',on:marks.status==='ready',tip:marks.status==='ready'?'Draf AI dibuat dari jawaban yang sekarang.':'Jawaban berubah setelah draf AI dibuat.'}];
  if(marks.status==='ready'){
    const {cefrLevel,usedRubric}=marks.meta;
    if(cefrLevel!==undefined)chips.push({label:cefrLevel?`CEFR ${cefrLevel}`:'CEFR',on:!!cefrLevel,tip:'Apakah AI disesuaikan dengan tingkat CEFR mata kuliah (dari kode atau judul).'});
    if(usedRubric!==undefined)chips.push({label:'Rubrik',on:usedRubric,tip:'Apakah AI menerima rubrik penilaian.'});
  }
  return <div className="aev-chips" role="list" aria-label="Dasar draf AI">{chips.map(c=><span key={c.label} role="listitem" className={`aev-chip-ctx${c.on?' on':''}`} title={c.tip}>{c.label} {c.on?'✓':'✗'}</span>)}</div>;
}

/** One written answer; `marks` (from a ready AI draft of this revision) adds the inline colouring. */
export function ScheduledWrittenAnswer({card,marks}:{card:ResponseVerdictCard;marks?:AttemptMarks}){
  const own=marks?.status==='ready'?marks.cards[card.id]:undefined;
  const legacy=marks?.status==='ready'&&marks.legacy;
  const answered=!!card.answer.trim();
  return <div className="sr-written-answer"><div className="sr-written-prompt"><span>Jawaban {card.number}</span><p lang="de">{card.prompt}</p>{card.translation&&<small>{card.translation}</small>}</div>{answered?<>
    <ScheduledChips marks={marks}/>
    <MarkedText text={card.answer} findings={own?.findings} checked={own?.checked} className="sr-written-script" label={`Jawaban tertulis ${card.number}`} lang="de"/>
    {own&&(own.findings.length>0||own.checked)&&<MarkLegend ok={!!own.checked}/>}
    {own&&legacy&&<p className="sr-mark-hint">Buat ulang draf AI untuk warna lengkap.</p>}
    {marks?.status==='stale'&&<p className="sr-mark-hint">Jawaban berubah setelah draf AI dibuat, jadi tanda AI tidak ditampilkan. Buat ulang draf AI.</p>}
  </>:<p className="sr-activity-empty">Belum dijawab</p>}</div>;
}
