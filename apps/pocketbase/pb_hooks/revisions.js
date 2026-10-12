// Shared by record hooks and the transactional historical importer.
const parse = value => {try{const result=JSON.parse(value||'{}');return result && typeof result==='object' ? result : {}}catch(_){return {}}};
const finalStatuses=['submitted','late','graded'];
function candidates(app,assignment,owner) {
 return app.findRecordsByFilter('assignment_submissions','assignment={:assignment} && owner={:owner} && (status="submitted" || status="late" || status="graded")','',10000,0,{assignment,owner});
}
function validateTask(app,task,parentId) {
 const parent=app.findRecordById('assignments',parentId);
 if(parent.id===task.id||parent.getString('course')!==task.getString('course')||parent.getString('owner')!==task.getString('owner')||parent.getString('revisionOf'))throw new BadRequestError('Tugas asal harus berbeda, dalam mata kuliah dan pemilik yang sama, dan bukan tugas revisi.');
 if(task.getString('activityType')==='formative'||parent.getString('activityType')==='formative')throw new BadRequestError('Revisi ini hanya untuk tugas penilaian.');
 const workflow=parse(task.getString('revisionWorkflow'));
 if(workflow.source==='historical' && workflow.sequenceConfirmed!==true)throw new BadRequestError('Konfirmasi urutan feedback kertas diperlukan.');
 return parent;
}
function match(app,task,row,parentId) {
 const sources=candidates(app,parentId,row.getString('owner'));
 const revisions=candidates(app,task.id,row.getString('owner'));
 if(sources.length!==1)return {reason:sources.length?'duplicate_original':'missing_original'};
 if(revisions.some(r=>r.id!==row.id))return {reason:'duplicate_revision'};
 const original=sources[0];
 if((row.getString('originalSubmission')&&row.getString('originalSubmission')!==original.id)||(row.getString('parentSubmission')&&row.getString('parentSubmission')!==original.id))return {reason:'conflicting_link'};
 return {original};
}
function link(app,row) {
 const task=app.findRecordById('assignments',row.getString('assignment'));
 const parentId=task.getString('revisionOf');
 if(!parentId||!finalStatuses.includes(row.getString('status')))return;
 validateTask(app,task,parentId);
 const result=match(app,task,row,parentId);
 const workflow=parse(task.getString('revisionWorkflow'));
 if(result.reason && workflow.source==='historical')return;
 if(result.reason)throw new BadRequestError('Tautan revisi memerlukan pemeriksaan: '+result.reason);
 const original=result.original;
 if(workflow.source!=='historical' && (!original.getString('gradedAt')||original.getString('status')!=='graded'))throw new BadRequestError('Tunggu penilaian dan feedback dosen pada tugas asal sebelum mengumpulkan revisi.');
 const existing=parse(row.getString('revisionProvenance'));
 if(existing.originalSubmission&&existing.originalSubmission!==original.id)throw new BadRequestError('Sumber revisi telah dikonfirmasi dan tidak boleh diganti.');
 row.set('originalSubmission',original.id);row.set('parentSubmission',original.id);row.set('revisionNumber',1);
 if(!existing.originalSubmission)row.set('revisionProvenance',{
  schemaVersion:1,originalSubmission:original.id,source:workflow.source==='historical'?'historical':'laras',feedbackChannel:workflow.source==='historical'?'paper':'in_app',
  sequenceConfirmed:true,confirmedBy:workflow.confirmedBy||task.getString('owner'),confirmedAt:workflow.confirmedAt||new Date().toISOString(),
  feedbackDate:workflow.source==='historical'?'':original.getString('gradedAt'),feedbackDatePrecision:workflow.source==='historical'?'unknown':'system',
  feedbackSnapshot:workflow.source==='historical'?'':original.getString('feedback'),
  originalGradeSnapshot:original.getString('gradedAt')?original.getFloat('grade'):null,
  evidenceStatus:workflow.source==='historical'?'sequence_confirmed_comments_not_captured':'published_feedback',linkedAt:new Date().toISOString()
 });
}
function plan(app,task,parentId) {
 validateTask(app,task,parentId);
 const rows=app.findRecordsByFilter('assignment_submissions','assignment={:assignment} && (status="submitted" || status="late" || status="graded")','id',10000,0,{assignment:task.id});
 return rows.map(row=>{const r=match(app,task,row,parentId);return {submissionId:row.id,originalId:r.original?r.original.id:'',status:r.reason|| (row.getString('originalSubmission')===r.original.id && parse(row.getString('revisionProvenance')).originalSubmission===r.original.id?'already_linked':'ready')};});
}
module.exports={parse,validateTask,link,plan};
