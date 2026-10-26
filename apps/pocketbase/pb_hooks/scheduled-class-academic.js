function linked(record, field) {return Array.from(record.getStringSlice(field) || []);}
function outcome(app, name, id, course) {
  const r=app.findRecordById(name,id);
  if(r.getString('course')!==course)throw new BadRequestError('Capaian pembelajaran bukan dari mata kuliah ini.');
  return {id:r.id,code:r.getString('code'),description:r.getString('description')};
}
exports.attach = function(app,ctx,plan) {
  const course=ctx.course.id;
  for(const activity of plan.activities) {
    const sources=activity.materialIds.map(id=>{
      const file=app.findRecordById('file_library',id);
      if(file.getString('owner')!==ctx.course.getString('owner') || !linked(file,'course').includes(course))throw new BadRequestError('Materi bukan milik dosen pada mata kuliah ini.');
      return {id:file.id,title:file.getString('title'),version:file.getInt('version')||1,filename:file.getString('file'),access:file.getString('access')};
    });
    const cpmks=activity.cpmkIds.map(id=>outcome(app,'cpmk',id,course));
    const subCpmks=activity.subCpmkIds.map(id=>outcome(app,'sub_cpmk',id,course));
    activity.materials=activity.materialIds; activity.cpmks=activity.cpmkIds; activity.subCpmks=activity.subCpmkIds;
    delete activity.materialIds; delete activity.cpmkIds; delete activity.subCpmkIds;
    activity.snapshot={...activity.snapshot,sources,academic:{cpmks,subCpmks}};
  }
  return {course:{id:course,title:ctx.course.getString('title'),rps:ctx.course.getString('rps').slice(0,20000)},session:{id:ctx.session.id,title:ctx.session.getString('title'),week:ctx.session.getInt('week'),topic:ctx.session.getString('topic'),learningIndicator:ctx.session.getString('learningIndicator'),learningMaterial:ctx.session.getString('learningMaterial'),assessmentMethod:ctx.session.getString('assessmentMethod'),duration:ctx.session.getString('duration'),references:ctx.session.getString('references')},capturedAt:new Date().toISOString()};
};
exports.studentSources = function(app,sources,course) {
  return (sources||[]).filter(s=>s.access==='student').flatMap(source=>{
    let file;try{file=app.findRecordById('file_library',source.id);}catch(_){return [{title:source.title,version:source.version,available:false}];}
    if(file.getString('access')!=='student'||!linked(file,'course').includes(course))return [];
    const available=(file.getInt('version')||1)===source.version&&file.getString('file')===source.filename&&Boolean(source.filename);
    return [{title:source.title,version:source.version,available,...(available?{url:'/hcgi/platform/api/files/file_library/'+source.id+'/'+encodeURIComponent(source.filename)}:{})}];
  });
};
