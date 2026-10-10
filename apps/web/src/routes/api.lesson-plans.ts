import { withApi,apiError,json,readJsonBody } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin as db } from '@/lib/pocketbase-client.server';
import { lessonSession,ensureLessonPlan,cleanLessonPlan } from '@/lib/lesson-plans.server';
export const action=withApi(async({request})=>{
 const auth=await authenticateUser(request);if('error' in auth)return apiError(auth.error.status,auth.error.message);
 const b=await readJsonBody<Record<string,unknown>>(request);
 try{
  if(typeof b.sessionId!=='string')return apiError(422,'Pilih pertemuan.');
  const session=await lessonSession(auth.pb,auth.user,b.sessionId);
  if(b.action==='ensure')return json({plan:await ensureLessonPlan(auth.pb,auth.user,session.id)});
  if(!['save','attach'].includes(String(b.action))||!Number.isInteger(b.baseRevision))return apiError(422,'Aksi atau revisi tidak valid.');
  const plan=b.action==='save'?cleanLessonPlan(b.plan):undefined;
  if(plan){
   if(b.status==='ready'&&(!plan.objective||!plan.check||!plan.activities.length))return apiError(422,'Lengkapi tujuan, rundown, dan cek pemahaman sebelum menandai Siap.');
   for(const id of plan.outcomeIds||[]){let outcome=await auth.pb.collection('cpmk').getOne(id).catch(()=>null);if(!outcome)outcome=await auth.pb.collection('sub_cpmk').getOne(id).catch(()=>null);if(!outcome||outcome.course!==session.course||outcome.owner!==auth.user.id)return apiError(422,'Capaian bukan dari mata kuliah ini.');}
   for(const source of plan.sources){const file=await auth.pb.collection('file_library').getOne(source.id);if(file.owner!==auth.user.id||file.course!==session.course)return apiError(422,'Materi bukan dari mata kuliah ini.');}
   if(plan.activities.some(a=>a.sourceIds.some(id=>!plan.sources.some(s=>s.id===id))))return apiError(422,'Rujukan kegiatan tidak valid.');
  }
  const saved=await db.send('/api/lesson-plans/write',{method:'POST',body:{...b,plan,owner:auth.user.id}});return json({plan:saved});
 }catch(e){return apiError((e as {status?:number}).status||500,e instanceof Error?e.message:'Rencana belum tersimpan.');}
});
