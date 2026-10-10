routerAdd('POST','/api/lesson-plans/write',(e)=>{
 if(!e.auth || !e.auth.isSuperuser())throw new ForbiddenError('Server only.');
 const b=e.requestInfo().body; let result;
 e.app.runInTransaction(app=>{
  const session=app.findRecordById('class_sessions',b.sessionId), course=app.findRecordById('courses',session.getString('course'));
  if(!b.owner || course.getString('owner')!==b.owner || session.getString('owner')!==b.owner)throw new ForbiddenError('Pertemuan bukan milik Anda.');
  let plan; try{plan=app.findFirstRecordByFilter('assistant_lesson_plans','session={:s}',{s:session.id});}catch(_){
   plan=new Record(app.findCollectionByNameOrId('assistant_lesson_plans'));plan.set('owner',b.owner);plan.set('course',course.id);plan.set('session',session.id);plan.set('title',session.getString('title'));plan.set('revision',0);plan.set('status','draft');
  }
  if(plan.getString('owner')!==b.owner)throw new ForbiddenError('Rencana bukan milik Anda.');
  if(b.action!=='ensure'){
   if(plan.getInt('revision')!==b.baseRevision)throw new BadRequestError('Rencana berubah. Muat ulang sebelum menyimpan.');
   let content=b.plan;
   if(b.action==='attach'){
    const old=app.findRecordById('assistant_lesson_plans',b.sourceId);
    if(old.getString('owner')!==b.owner || old.getString('course')!==course.id || old.getString('session'))throw new BadRequestError('Pilih draf terpisah dari mata kuliah yang sama.');
    if(plan.getInt('revision')>0)throw new BadRequestError('Pertemuan sudah memiliki rencana.');
    content=JSON.parse(old.getString('plan')); if(plan.id)app.delete(plan);
    // Re-home the original draft into the selected session; preserve its record identity.
    plan=old;plan.set('session',session.id);
   }
   if(!content || !content.title || !Array.isArray(content.activities))throw new BadRequestError('Rencana tidak valid.');
   plan.set('plan',content);plan.set('title',content.title);plan.set('revision',plan.getInt('revision')+1);plan.set('status',b.status==='ready'?'ready':'draft');plan.set('lastEditor',b.owner);
   app.save(plan);
   if(b.action==='attach' && plan.getString('task')){const task=app.findRecordById('agent_tasks',plan.getString('task'));const r=JSON.parse(task.getString('result')||'{}');r.link='/app/courses/'+course.id+'/pertemuan/'+session.id+'/rencana';r.recordId=plan.id;task.set('result',r);app.save(task);}
   const rev=new Record(app.findCollectionByNameOrId('lesson_plan_revisions'));rev.set('owner',b.owner);rev.set('lessonPlan',plan.id);rev.set('revision',plan.getInt('revision'));rev.set('origin',b.action==='attach'?'attach':'manual');rev.set('snapshot',{plan:content,status:plan.getString('status'),title:content.title});app.save(rev);
  }else if(!plan.id)app.save(plan);
  result=app.findRecordById('assistant_lesson_plans',plan.id).publicExport();
 });return e.json(200,result);
});
