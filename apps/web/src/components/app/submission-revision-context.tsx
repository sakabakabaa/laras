import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import pb from '@/lib/pocketbase-client';
import type { AssignmentSubmission } from '@/lib/assignments';
import { submissionFileUrl } from '@/lib/assignments';
import { SubmissionPdfPreview } from './submission-pdf-preview';
export function SubmissionRevisionContext({originalAssignmentId,studentId,revision,lecturer=false}:{originalAssignmentId:string;studentId:string;revision?:AssignmentSubmission|null;lecturer?:boolean}) {
 const [reflection,setReflection]=useState(revision?.revisionReflection||'');const [saving,setSaving]=useState(false);const [saveNote,setSaveNote]=useState('');
 useEffect(()=>{setReflection(revision?.revisionReflection||'');setSaveNote('');},[revision?.id,revision?.revisionReflection]);
 const [original,setOriginal]=useState<AssignmentSubmission|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{let live=true;setOriginal(null);setError('');setLoading(true);
  pb.collection('assignment_submissions').getList<AssignmentSubmission>(1,2,{filter:pb.filter('assignment={:a} && owner={:o} && (status="submitted" || status="late" || status="graded")',{a:originalAssignmentId,o:studentId})}).then(r=>{if(!live)return;if(r.items.length===1)setOriginal(r.items[0]);else setError(r.items.length?'Beberapa jawaban asal ditemukan. Tautan perlu diperiksa.':'Jawaban asal belum ditemukan.');}).catch(()=>{if(live)setError('Tidak dapat memuat jawaban asal.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[originalAssignmentId,studentId]);
 const historical=revision?.revisionProvenance?.source==='historical';
 return <section className="revision-context"><h3>Tugas revisi · jawaban asal</h3><Link to={`/app/${lecturer?"tugas":"kerja"}/${originalAssignmentId}`}>Buka tugas asal</Link>{loading?<p>Memuat jawaban asal…</p>:error?<p role="alert">{error}</p>:original?<>
 <p className="revision-note">{historical?'Riwayat impor · feedback diberikan di kertas sebelum revisi. Komentar kertas belum direkam; bukan penilaian AI pada saat itu.':'Perbaiki jawaban berdasarkan feedback dosen. Nilai tugas asal tetap tersimpan terpisah.'}</p>
 <div className="revision-columns"><div><h4>Jawaban produksi</h4><div className="revision-text">{original.content||original.transcript||'Lihat file asli.'}</div></div><div><h4>Feedback dosen</h4><div className="revision-text">{historical?'Feedback kertas: urutan dikonfirmasi, komentar belum ditranskripsikan.':revision?.revisionProvenance?.feedbackSnapshot||original.feedback||'Feedback belum diterbitkan. Tunggu penilaian dosen sebelum mengumpulkan revisi.'}</div>{original.gradedAt&&<p>Nilai tugas asal di LARAS: {original.grade}/100</p>}</div></div>
 {original.files?.length>0&&<details><summary>File asli tugas produksi</summary>{original.files.map(file=><div key={file}><a href={submissionFileUrl(original,file)} target="_blank" rel="noreferrer">{file}</a>{/\.pdf$/i.test(file)&&<SubmissionPdfPreview url={submissionFileUrl(original,file)} name={file}/>}</div>)}</details>}
 {revision && <div><h4>Refleksi revisi</h4>{lecturer?<p>{revision.revisionReflection||'Belum ada refleksi.'}</p>:<><textarea aria-label="Refleksi revisi" maxLength={2000} value={reflection} onChange={e=>setReflection(e.target.value)} placeholder="Apa yang kamu perbaiki dari feedback dosen?"/><button disabled={saving} onClick={async()=>{setSaving(true);try{await pb.collection('assignment_submissions').update(revision.id,{revisionReflection:reflection});setSaveNote('Refleksi tersimpan.');}catch{setSaveNote('Refleksi gagal disimpan.');}finally{setSaving(false);}}}>Simpan refleksi</button><p role="status">{saveNote}</p></>}</div>}
 {revision?.content&&<details><summary>Bandingkan teks revisi</summary><div className="revision-columns"><div className="revision-text">{original.content}</div><div className="revision-text">{revision.content}</div></div></details>}
 </>:null}</section>;
}
