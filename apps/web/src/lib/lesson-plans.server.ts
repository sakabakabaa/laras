import type PocketBase from 'pocketbase';
import { pocketbaseAdmin as db } from './pocketbase-client.server';
import type { AuthedUser } from './context-retrieval.server';
import type { ClassSession } from './learning';
import type { LessonPlan } from './agent-tasks';
import type { SessionLessonPlan } from './lesson-plans';
export async function lessonSession(pb:PocketBase,user:AuthedUser,id:string){
 if(user.role!=='faculty')throw Object.assign(new Error('Rencana ini hanya untuk dosen pemilik.'),{status:403});
 const session=await pb.collection('class_sessions').getOne<ClassSession>(id);
 const course=await pb.collection('courses').getOne(session.course);
 if(session.owner!==user.id || course.owner!==user.id)throw Object.assign(new Error('Pertemuan bukan milik Anda.'),{status:403});return session;
}
export async function ensureLessonPlan(pb:PocketBase,user:AuthedUser,sessionId:string){
 await lessonSession(pb,user,sessionId);
 return db.send<SessionLessonPlan>('/api/lesson-plans/write',{method:'POST',body:{action:'ensure',owner:user.id,sessionId}});
}
export function cleanLessonPlan(raw:unknown):LessonPlan{
 const p=raw as LessonPlan; const text=(v:unknown,max=3000)=>typeof v==='string'?v.trim().slice(0,max):'';
 if(!p || !text(p.title,200) || !Array.isArray(p.activities) || p.activities.length>30)throw Object.assign(new Error('Judul dan rundown yang valid diperlukan.'),{status:422});
 return {title:text(p.title,200),objective:text(p.objective),evidenceNote:text(p.evidenceNote),preparation:text(p.preparation),check:text(p.check),outcomeIds:Array.isArray(p.outcomeIds)?p.outcomeIds.filter(id=>/^[a-zA-Z0-9]{15}$/.test(id)).slice(0,50):[],
 activities:p.activities.map(a=>{if(!text(a.title,200)||!Number.isInteger(a.minutes)||a.minutes<1||a.minutes>600)throw Object.assign(new Error('Setiap kegiatan memerlukan judul dan durasi 1–600 menit.'),{status:422});return {title:text(a.title,200),minutes:a.minutes,instructions:text(a.instructions),studentActivity:text(a.studentActivity),sourceIds:Array.isArray(a.sourceIds)?a.sourceIds.filter(id=>/^[a-zA-Z0-9]{15}$/.test(id)).slice(0,30):[]};}),
 sources:Array.isArray(p.sources)?p.sources.slice(0,100).map(s=>({id:s.id,title:text(s.title,200),href:`/app/berkas/${s.id}`,locator:text(s.locator,500),version:s.version||1,sectionIds:Array.isArray(s.sectionIds)?s.sectionIds:[]})):[]};
}
