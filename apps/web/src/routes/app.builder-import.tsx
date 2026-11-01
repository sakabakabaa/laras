import { useEffect, useState } from 'react';
import { Link, redirect, useParams } from 'react-router';
import { AppShell } from '@/components/app/app-shell';
import { requireAuth } from '@/lib/require-auth';
import { builderImportRequest, type BuilderImportJob } from '@/lib/builder-import';
import '@/styles/builder-workspace.css';
export function meta(){return [{title:'Dari halaman buku | LARAS'}];}
export function clientLoader(){const user=requireAuth();if(user.role!=='faculty')throw redirect('/app/student');return {user};}
clientLoader.hydrate=true as const;
export function HydrateFallback(){return <p className="route-loading">Membuka impor…</p>;}
export default function ImportRoute(){const {jobId=''}=useParams();return <AppShell title="Dari halaman buku" eyebrow="BUILDER" variant="saas" hideHeading><ImportStatus key={jobId} id={jobId}/></AppShell>;}
function ImportStatus({id}:{id:string}){
 const [job,setJob]=useState<BuilderImportJob|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let live=true,timer:ReturnType<typeof setTimeout>;const load=async()=>{try{const next=await builderImportRequest<BuilderImportJob>({action:'get',id});if(!live)return;setJob(next);setError('');if(next.status==='queued'||next.status==='running')timer=setTimeout(()=>void load(),3000);}catch(e){if(live)setError((e as Error).message||'Status belum dapat dimuat.');}};void load();return()=>{live=false;clearTimeout(timer);};},[id,refresh]);
 const retry=async()=>{try{setError('');await builderImportRequest({action:'retry',id});setRefresh(n=>n+1);}catch(e){setError((e as Error).message);}};
 return <section className="bd-new bd-import-status">
  <span className="bd-kicker">DARI HALAMAN BUKU</span><h1>{job?.status==='ready'?'Draf siap dibuka':job?.status==='failed'?'Halaman belum berhasil dibangun':'Menyusun halaman menjadi kegiatan'}</h1>
  {error&&<p role="alert" className="bd-error">{error} <button className="bd-secondary" onClick={()=>setRefresh(n=>n+1)}>Muat ulang status</button></p>}
  {(!job||job.status==='queued'||job.status==='running')&&<div role="status" aria-live="polite"><p>{job?.status==='running'?'AI sedang membaca latihan, menyiapkan elemen, dan menyusun penilaian…':'Menyiapkan impor…'}</p><p>Anda boleh meninggalkan halaman ini. Buka kembali tautan ini untuk melanjutkan dan melihat hasilnya.</p></div>}
  {job?.status==='failed'&&<><p role="alert">{job.error}</p>{job.attempts<3&&<button className="bd-primary" onClick={()=>void retry()}>Coba lagi</button>}<Link className="bd-secondary" to="/app/builder/new?kind=tugas&from=book">Gunakan gambar lain</Link></>}
  {job?.status==='ready'&&<>
   <p>{job.report.activityCount} kegiatan · {job.report.questionCount} pertanyaan · {job.report.illustrationCount||0} ilustrasi. Tersimpan sebagai draf pribadi.</p>
   <div className="bd-inline-actions"><Link className="bd-primary" to={`/app/builder/${job.documentId}`}>Buka builder</Link><Link className="bd-secondary" to={`/app/builder/${job.documentId}/pratinjau`}>Pratinjau mahasiswa</Link></div>
   {job.report.missingMedia?.length>0&&<section className="bd-import-report"><h2>Media yang perlu ditambahkan</h2><ul>{job.report.missingMedia.map((s,i)=><li key={i}>{s}</li>)}</ul></section>}
   {job.report.warnings?.length>0&&<section className="bd-import-report"><h2>Perlu ditinjau</h2><ul>{job.report.warnings.map((s,i)=><li key={i}>{s}</li>)}</ul></section>}
   {job.report.inferredKeys?.length>0&&<details className="bd-import-report"><summary>{job.report.inferredKeys.length} kunci disimpulkan AI · periksa sebelum menerbitkan</summary><ul>{job.report.inferredKeys.map((s,i)=><li key={i}>{s}</li>)}</ul></details>}
   <p>Periksa hasil bacaan dan penilaian di builder, lalu atur jadwal sebelum menerbitkan.</p>
  </>}
  {job?.source&&<p><Link to={`/app/berkas/${job.source}`}>Lihat gambar sumber</Link></p>}
 </section>;
}
