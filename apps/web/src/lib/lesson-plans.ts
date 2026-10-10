import type { LessonPlan } from './agent-tasks';
export type SessionLessonPlan = { id:string; owner:string; course:string; session:string; title:string; plan:LessonPlan; revision:number; status:'draft'|'ready'; updated:string };
export const lessonPlanLink = (course:string,session:string) => `/app/courses/${course}/pertemuan/${session}/rencana`;
export const emptyLessonPlan = (title:string):LessonPlan => ({title,objective:'',evidenceNote:'',activities:[],check:'',sources:[],preparation:'',outcomeIds:[]});
