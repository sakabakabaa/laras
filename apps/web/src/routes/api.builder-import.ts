import { apiError, json, readFormData, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { getBookPageImport, startBookPageImport, listBookPageImports } from '@/lib/builder-import.server';
import type { BuilderImportSettings } from '@/lib/builder-import';
export const action=withApi(async({request})=>{
 if(request.method!=='POST')return apiError(405,'Method not allowed');
 const auth=await authenticateUser(request);if('error'in auth)return apiError(auth.error.status,auth.error.message);
 if(auth.user.role!=='faculty')return apiError(403,'Impor builder hanya tersedia untuk dosen.');
 try{
  if(request.headers.get('content-type')?.includes('multipart/form-data')){
   const form=await readFormData(request);const pages=form.getAll('page');if(pages.length!==1||!(pages[0]instanceof File))return apiError(422,'Unggah tepat satu halaman buku.');
   let settings:BuilderImportSettings;try{settings=JSON.parse(String(form.get('settings')||''));}catch{return apiError(422,'Pengaturan impor tidak valid.');}
   return json(await startBookPageImport(auth.pb,auth.user.id,pages[0],settings,String(form.get('commandId')||'')));
  }
  const body=await readJsonBody<{id?:string;action?:string}>(request);if(body.action==='list')return json(await listBookPageImports(auth.pb,auth.user.id));if(!body.id||!['get','retry'].includes(body.action||''))return apiError(422,'Perintah impor tidak valid.');
  return json(await getBookPageImport(auth.pb,auth.user.id,body.id,body.action==='retry'));
 }catch(e){return apiError((e as {status?:number}).status||422,e instanceof Error?e.message:'Impor belum berhasil.');}
});
