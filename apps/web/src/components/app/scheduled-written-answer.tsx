import type {ClassReportRow,ScheduledAttempt} from '@/lib/scheduled-classes';
import {wibLabel} from '@/lib/scheduled-classes';
import type {ResponseVerdictCard} from '@/lib/session-review-verdict';

export function ScheduledAnswerIdentity({student,attempt}:{student:ClassReportRow;attempt:ScheduledAttempt}){
  return <div className="evx-who sr-written-identity"><span className="evx-avatar lg">{student.name.charAt(0).toUpperCase()}</span><div><h4>{student.name}</h4><p>NIM {student.nim||'belum tersedia'} · Terkumpul{attempt.finalizedAt?` · ${wibLabel(attempt.finalizedAt)}`:''}</p></div></div>;
}

export function ScheduledWrittenAnswer({card}:{card:ResponseVerdictCard}){
  return <div className="sr-written-answer"><div className="sr-written-prompt"><span>Jawaban {card.number}</span><p lang="de">{card.prompt}</p>{card.translation&&<small>{card.translation}</small>}</div>{card.answer.trim()?<div className="evx-script sr-written-script" aria-label={`Jawaban tertulis ${card.number}`} lang="de">{card.answer.split(/\r?\n/).map((line,index)=><div className="evx-line" key={index}><span className="evx-ln" aria-hidden="true">{index+1}</span><span className="evx-line-text">{line||'\u00a0'}</span></div>)}</div>:<p className="sr-activity-empty">Belum dijawab</p>}</div>;
}
