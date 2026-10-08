onRecordCreate(e => {
 const roster=e.app.findRecordById('course_roster',e.record.getString('roster'));
 const session=e.app.findRecordById('class_sessions',e.record.getString('session'));
 if(roster.getString('course')!==session.getString('course') || (session.getString('section') && session.getString('section')!==roster.getString('section'))) throw new BadRequestError('Mahasiswa tidak termasuk kelas pertemuan ini.');
 if(session.getBool('attendanceClosed')) throw new BadRequestError('Buka kembali pencatatan sebelum mengubah data.');
 if(e.record.getFloat('points')!==0.5 && e.record.getFloat('points')!==1) throw new BadRequestError('Poin harus 0.5 atau 1.');
 const users=e.app.findRecordsByFilter('users','nim={:nim}','',1,0,{nim:roster.getString('nim')});
 e.record.set('student',users.length ? users[0].id : ''); e.next();
},'participation_awards');
onRecordCreate(e => {
 const roster=e.app.findRecordById('course_roster',e.record.getString('roster'));
 const session=e.app.findRecordById('class_sessions',e.record.getString('session'));
 if(roster.getString('course')!==session.getString('course') || (session.getString('section') && session.getString('section')!==roster.getString('section'))) throw new BadRequestError('Mahasiswa tidak termasuk kelas pertemuan ini.');
 if(session.getBool('attendanceClosed')) throw new BadRequestError('Buka kembali pencatatan sebelum mengubah absensi.');
 e.next();
},'attendance');
onRecordUpdate(e => {
 const session=e.app.findRecordById('class_sessions',e.record.getString('session'));
 if(session.getBool('attendanceClosed') && e.record.getString('status')!==e.record.original().getString('status')) throw new BadRequestError('Buka kembali pencatatan sebelum mengubah absensi.');
 e.next();
},'attendance');
onRecordDelete(e => {
 const session=e.app.findRecordById('class_sessions',e.record.getString('session'));
 if(session.getBool('attendanceClosed')) throw new BadRequestError('Buka kembali pencatatan sebelum mengubah absensi.');
 e.next();
},'attendance');
onRecordUpdate(e => {
 if(e.record.getBool('attendanceClosed') && !e.record.original().getBool('attendanceClosed')) {
  let filter='course={:course}';const params={course:e.record.getString('course'),section:e.record.getString('section')};
  if(params.section)filter+=' && section={:section}';
  const roster=e.app.findRecordsByFilter('course_roster',filter,'',10000,0,params);
  const rows=e.app.findRecordsByFilter('attendance','session={:session}','',10000,0,{session:e.record.id});
  if(!roster.length||roster.some(r=>!rows.some(a=>a.getString('roster')===r.id))) throw new BadRequestError('Lengkapi kehadiran seluruh mahasiswa terlebih dahulu.');
 }
 e.next();
},'class_sessions');
onRecordAfterUpdateSuccess(e=>{
 e.next();
 if(e.record.getString('role')!=='student'||!e.record.getString('nim'))return;
 for(const name of ['attendance','participation_awards']){
  const rows=e.app.findRecordsByFilter(name,'roster.nim={:nim} && student=""','',10000,0,{nim:e.record.getString('nim')});
  for(const r of rows){r.set('student',e.record.id);e.app.save(r);}
 }
},'users');
