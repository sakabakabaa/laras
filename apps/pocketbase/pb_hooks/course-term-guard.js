function validateSection(app, record) {
 const course=app.findRecordById('courses',record.getString('course'));
 for(const field of ['academicYear','semester']) {
  const term=course.getString(field);
  const requested=record.getString(field);
  if(requested && requested!==term) throw new BadRequestError('Gunakan mata kuliah terpisah untuk tahun atau semester berbeda agar nilai tidak tercampur.');
  record.set(field,term);
 }
}
function validateCourse(app, record) {
 const before=record.original();
 if(['academicYear','semester'].every(f=>before.getString(f)===record.getString(f))) return;
 if(app.findRecordsByFilter('course_roster','course={:c}','',1,0,{c:record.id}).length || app.findRecordsByFilter('assignments','course={:c}','',1,0,{c:record.id}).length)
  throw new BadRequestError('Periode mata kuliah yang sudah berisi mahasiswa atau tugas tidak dapat diganti. Gunakan mata kuliah baru.');
}
module.exports={validateSection,validateCourse};
