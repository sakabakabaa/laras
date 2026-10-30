onRecordCreate(e=>{require(`${__hooks}/revisions.js`).link(e.app,e.record);e.next();},'assignment_submissions');
onRecordUpdate(e=>{const h=require(`${__hooks}/revisions.js`);h.validateUpdate(e.app,e.record);h.link(e.app,e.record);e.next();},'assignment_submissions');
onRecordCreate(e=>{if(e.record.getString('revisionOf'))require(`${__hooks}/revisions.js`).validateTask(e.app,e.record,e.record.getString('revisionOf'));e.next();},'assignments');
onRecordUpdate(e=>{
 const h=require(`${__hooks}/revisions.js`);const before=h.parse(e.record.original().getString('revisionWorkflow'));const after=h.parse(e.record.getString('revisionWorkflow'));
 if(before.source && (before.source!==after.source || before.confirmedBy!==after.confirmedBy || before.confirmedAt!==after.confirmedAt))throw new BadRequestError('Provenans revisi yang dikonfirmasi tidak boleh diganti.');
 if(e.record.original().getString('revisionOf') && e.record.getString('revisionOf')!==e.record.original().getString('revisionOf'))throw new BadRequestError('Tugas asal revisi tidak boleh diganti.');
 if(e.record.getString('revisionOf'))require(`${__hooks}/revisions.js`).validateTask(e.app,e.record,e.record.getString('revisionOf'));e.next();
},'assignments');
routerAdd('POST','/api/laras/revisions',e=>{
 if(!e.auth||!e.auth.isSuperuser())throw new ForbiddenError('Server only.');
 const body=e.requestInfo().body;
 if(!body.assignmentId||!body.originalAssignmentId)throw new BadRequestError('Pilih tugas asal dan revisi.');
 const helper=require(`${__hooks}/revisions.js`);let output;
 try { e.app.runInTransaction(app=>{
  const task=app.findRecordById('assignments',body.assignmentId);
  if(body.ownerId && task.getString('owner')!==body.ownerId)throw new ForbiddenError('Bukan pemilik tugas.');
  if(task.getString('revisionOf')&&task.getString('revisionOf')!==body.originalAssignmentId)throw new BadRequestError('Tugas sudah tertaut ke sumber berbeda.');
  const rows=helper.plan(app,task,body.originalAssignmentId);
  output={assignmentId:task.id,originalAssignmentId:body.originalAssignmentId,rows,applied:false};
  if(body.apply!==true)return;
  if(body.source==='historical'&&body.sequenceConfirmed!==true)throw new BadRequestError('Konfirmasi urutan feedback kertas diperlukan.');
  const workflow=helper.parse(task.getString('revisionWorkflow'));
  if(workflow.source&&workflow.source!==(body.source==='historical'?'historical':'laras'))throw new BadRequestError('Provenans tidak boleh diganti.');
  task.set('revisionOf',body.originalAssignmentId);
  if(!workflow.source)task.set('revisionWorkflow',{source:body.source==='historical'?'historical':'laras',feedbackChannel:body.source==='historical'?'paper':'in_app',sequenceConfirmed:true,confirmedBy:body.confirmedBy||body.ownerId||'authorized_operator',confirmedAt:new Date().toISOString()});
  app.save(task);
  for(const row of rows){if(row.status!=='ready')continue;const record=app.findRecordById('assignment_submissions',row.submissionId);helper.link(app,record);app.save(record);}
  output.applied=true;
 }); } catch(error) { return e.json(400,{message:String(error)}); }
 return e.json(200,output);
});
