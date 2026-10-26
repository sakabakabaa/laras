import {withApi,apiError,json,readJsonBody} from '@/lib/api.server';
import {authenticateUser} from '@/lib/context-retrieval.server';
import {scheduledAcademicContext,generateScheduledClassDraft} from '@/lib/scheduled-class-draft.server';
export const action=withApi(async({request})=>{
 if(request.method!=='POST')return apiError(405,'Method not allowed');
 const auth=await authenticateUser(request);if('error'in auth)return apiError(auth.error.status,auth.error.message);
 if(auth.user.role!=='faculty')return apiError(403,'Hanya dosen pemilik yang dapat membuat draf kelas.');
 const body=await readJsonBody<Record<string,unknown>>(request);
 if(typeof body.sessionId!=='string'||!['context','generate'].includes(String(body.action)))return apiError(422,'Pilih pertemuan dan aksi yang valid.');
 try{
  if(body.action==='context')return json({context:await scheduledAcademicContext(auth.pb,auth.user,body.sessionId)});
  return json({proposal:await generateScheduledClassDraft(auth.pb,auth.user,body)});
 }catch(error){
  if(error instanceof Response)return error;
  const e=error as {status?:number;message?:string};
  if(e.status&&e.status>=400&&e.status<500)return apiError(e.status,e.message||'Draf belum dapat dibuat.');
  return apiError(502,'Draf AI belum berhasil dibuat. Periksa materi dan pengaturan model AI, lalu coba kembali.');
 }
});
