import { useEffect, useState, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import pb from '@/lib/pocketbase-client';
import type { AssignmentSubmission } from '@/lib/assignments';
import { submissionFileUrl } from '@/lib/assignments';
import { AnswerScript } from './ai-evaluation-review';
import { buildMarkedSegments, parseReviewFindings, parseFindings, deriveAiReviewFindings, type AiEvaluationRow } from '@/lib/ai-evaluation';
import { SubmissionPdfPreview } from './submission-pdf-preview';
export function SavedSubmissionText({submission}:{submission:AssignmentSubmission}) {
 const ref=useRef<HTMLDivElement|null>(null);
 const [evaluation,setEvaluation]=useState<AiEvaluationRow|null>(null);
 useEffect(()=>{let live=true;setEvaluation(null);pb.collection('ai_evaluations').getFirstListItem<AiEvaluationRow>(pb.filter('submission={:id}',{id:submission.id})).then(row=>{if(live)setEvaluation(row);}).catch(()=>{});return()=>{live=false;};},[submission.id]);
 const content=submission.content||submission.transcript||'';
 const saved=parseReviewFindings(evaluation?.reviewFindings);
 const marked=(saved.length?saved:deriveAiReviewFindings(parseFindings(evaluation?.findings))).filter(f=>f.status!=='rejected');
 return content?<AnswerScript textRef={ref} content={content} segments={buildMarkedSegments(content,marked)} marked={marked} visibleCount={marked.length} activeId={null} onFocus={()=>{}} onApprove={()=>{}} onReject={()=>{}} onRemove={()=>{}} checked={evaluation?.status==='ready'&&marked.length>0} readOnly/>:<p>Lihat file asli.</p>;
}
export function LinkedRevisionAbove({original}:{original:AssignmentSubmission}) {
 const [revisions,setRevisions]=useState<AssignmentSubmission[]>([]);
 useEffect(()=>{let live=true;setRevisions([]);pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({filter:pb.filter('originalSubmission={:id} && owner={:owner} && (status="submitted" || status="late" || status="graded")',{id:original.id,owner:original.owner}),sort:'created'}).then(rows=>{if(live)setRevisions(rows);}).catch(()=>{});return()=>{live=false;};},[original.id,original.owner]);
 return revisions.length?<>{revisions.map(row=><section className="revision-answer-section" key={row.id}><h3>Revisi <Link to={`/app/tugas/${row.assignment}`}>Buka ↗</Link></h3><SavedSubmissionText submission={row}/></section>)}<h3 className="revision-answer-heading">Teks asli</h3></>:null;
}
export function SubmissionRevisionContext({originalAssignmentId,studentId,revision,lecturer=false,children}:{originalAssignmentId:string;studentId:string;revision?:AssignmentSubmission|null;lecturer?:boolean;children?:ReactNode}) {
 const [reflection,setReflection]=useState(revision?.revisionReflection||'');const [saving,setSaving]=useState(false);const [saveNote,setSaveNote]=useState('');
 useEffect(()=>{setReflection(revision?.revisionReflection||'');setSaveNote('');},[revision?.id,revision?.revisionReflection]);
 const [original,setOriginal]=useState<AssignmentSubmission|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;setOriginal(null);setError('');setLoading(true);
  pb.collection('assignment_submissions').getList<AssignmentSubmission>(1,2,{filter:pb.filter('assignment={:a} && owner={:o} && (status="submitted" || status="late" || status="graded")',{a:originalAssignmentId,o:studentId})}).then(r=>{if(!live)return;if(r.items.length===1)setOriginal(r.items[0]);else setError(r.items.length?'Beberapa jawaban asal ditemukan. Tautan perlu diperiksa.':'Jawaban asal belum ditemukan.');}).catch(()=>{if(live)setError('Tidak dapat memuat jawaban asal.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[originalAssignmentId,studentId]);
 // Keep ordinary task content visible when there is no source submission.
 if (!lecturer && !original) return <>{children}</>;
 const historical=revision?.revisionProvenance?.source==='historical';
 return <section className="revision-context"><h3>Revisi</h3>{children || (revision && <SavedSubmissionText submission={revision}/>)}{loading?<p>Memuat jawaban asal…</p>:error?<p role="alert">{error}</p>:original?<>

 <h3>Teks asli</h3><SavedSubmissionText submission={original}/>
 <details><summary>Feedback asal</summary><p>{historical?'Feedback diberikan di kertas sebelum revisi. Komentarnya belum direkam; analisis AI sekarang bersifat retrospektif.':revision?.revisionProvenance?.feedbackSnapshot||original.feedback||'Feedback belum diterbitkan.'}</p>{original.gradedAt&&<p>Nilai asal: {original.grade}/100</p>}</details>
 {original.files?.length>0&&<details><summary>File asal</summary>{original.files.map(file=><div key={file}><a href={submissionFileUrl(original,file)} target="_blank" rel="noreferrer">{file}</a>{/\.pdf$/i.test(file)&&<SubmissionPdfPreview url={submissionFileUrl(original,file)} name={file}/>}</div>)}</details>}
 {revision && (!lecturer || revision.revisionReflection) && <details><summary>Refleksi</summary>{lecturer?<p>{revision.revisionReflection}</p>:<><textarea aria-label="Refleksi revisi" maxLength={2000} value={reflection} onChange={e=>setReflection(e.target.value)} placeholder="Apa yang kamu perbaiki dari feedback dosen?"/><button disabled={saving} onClick={async()=>{setSaving(true);try{await pb.collection('assignment_submissions').update(revision.id,{revisionReflection:reflection});setSaveNote('Refleksi tersimpan.');}catch{setSaveNote('Refleksi gagal disimpan.');}finally{setSaving(false);}}}>Simpan refleksi</button><p role="status">{saveNote}</p></>}</details>}

 </>:null}</section>;
}
