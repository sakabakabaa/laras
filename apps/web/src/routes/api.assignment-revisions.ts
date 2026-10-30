import { z } from 'zod';
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin as db } from '@/lib/pocketbase-client.server';
import type { Assignment } from '@/lib/assignments';
const schema=z.object({action:z.enum(['plan','link','create']),assignmentId:z.string().regex(/^[a-zA-Z0-9]{5,40}$/),originalAssignmentId:z.string().regex(/^[a-zA-Z0-9]{5,40}$/).optional(),source:z.enum(['historical','laras']).default('laras'),sequenceConfirmed:z.boolean().default(false),deadline:z.string().max(40).optional()});
export const action=withApi(async({request})=>{
 if(request.method!=='POST')return apiError(405,'Method not allowed');
 const auth=await authenticateUser(request);if('error' in auth)return apiError(auth.error.status,auth.error.message);
 if(auth.user.role!=='lecturer')return apiError(403,'Hanya dosen.');
 const parsed=schema.safeParse(await readJsonBody(request));if(!parsed.success)return apiError(422,'Permintaan revisi tidak valid.');
 const body=parsed.data;
 const task=await db.getRecord<Assignment>('assignments',body.assignmentId);
 if(task.owner!==auth.user.id)return apiError(403,'Bukan pemilik tugas.');
 if(body.action==='create'){
  if(task.revisionOf||task.activityType==='formative')return apiError(422,'Pilih tugas produksi yang dinilai.');
  if(task.status==='draft')return apiError(422,'Terbitkan tugas asal terlebih dahulu.');
  if(body.deadline && !Number.isFinite(Date.parse(body.deadline)))return apiError(422,'Batas revisi tidak valid.');
  const existing=await db.listRecords<Assignment>('assignments',{filter:`revisionOf="${task.id}"`,perPage:2});
  if(existing.items.length)return json({assignmentId:existing.items[0].id,existing:true});
  const config=typeof task.taskConfig==='string'?JSON.parse(task.taskConfig):task.taskConfig;
  const revisionConfig=config && typeof config==='object' ? {...config,prompt:'Revisi jawaban produksi berdasarkan feedback dosen yang ditampilkan. Pertahankan tujuan tugas asal dan perbaiki bagian yang perlu diperbaiki.'} : config;
  const revision=await db.createRecord<Assignment>('assignments',{
   owner:task.owner,course:task.course,session:task.session,subCpmk:task.subCpmk,title:`Revisi — ${task.title}`,mode:task.mode,shape:task.shape,activityType:'formal',status:'published',
   revisionOf:task.id,revisionWorkflow:{source:'laras',feedbackChannel:'in_app',confirmedBy:auth.user.id,confirmedAt:new Date().toISOString()},
   instructions:'Revisi jawaban tugas asal berdasarkan feedback yang sudah diterbitkan dosen. Jelaskan perbaikan pada refleksi singkat.',requirements:task.requirements,
   taskConfig:revisionConfig,attachments:task.attachments||[],deadline:body.deadline||'',publicEnabled:false,allowRevision:false,assessmentGroup:'excluded',
  });
  return json({assignmentId:revision.id});
 }
 if(!body.originalAssignmentId)return apiError(422,'Pilih tugas asal.');
 const result=await db.send('/api/laras/revisions',{method:'POST',body:{assignmentId:task.id,originalAssignmentId:body.originalAssignmentId,ownerId:auth.user.id,source:body.source,sequenceConfirmed:body.sequenceConfirmed,apply:body.action==='link'}});
 return json(result);
});
