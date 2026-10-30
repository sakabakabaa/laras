// The lecturer roster is the source of truth for a student's class in a course.
function studentNim(user) {
 if (user.getString('role') !== 'student') return '';
 const nim = user.getString('nim').trim();
 if (nim) return nim;
 const match = user.getString('email').toLowerCase().match(/^(\d+)@student\.upi\.edu$/);
 return match ? match[1] : '';
}
function resolveSection(app, course, user) {
 const nim = studentNim(user);
 if (!nim) return null;
 const rows = app.findRecordsByFilter('course_roster', 'course={:c} && nim={:n}', '', 2, 0, {c:course,n:nim});
 if (rows.length !== 1) return null;
 const section = rows[0].getString('section');
 if (section && app.findRecordById('course_sections',section).getString('course') !== course) throw new BadRequestError('Kelas tidak termasuk mata kuliah ini.');
 return section;
}
function alignEnrollment(app, record) {
 const course = record.getString('course');
 const user = app.findRecordById('users',record.getString('owner'));
 const resolved = resolveSection(app,course,user);
 if (resolved !== null) record.set('section',resolved);
 const section = record.getString('section');
 if (section && app.findRecordById('course_sections',section).getString('course') !== course) throw new BadRequestError('Kelas tidak termasuk mata kuliah ini.');
}
function syncRoster(app, row) {
 const course=row.getString('course'), nim=row.getString('nim').trim();
 if (!nim) return;
 const users=app.findRecordsByFilter('users','role="student" && (nim={:n} || (nim="" && email={:email}))','',2,0,{n:nim,email:`${nim}@student.upi.edu`});
 if(users.length!==1) return;
 const enrollments=app.findRecordsByFilter('enrollments','course={:c} && owner={:u}','',0,0,{c:course,u:users[0].id});
 for(const enrollment of enrollments) {
  const section=resolveSection(app,course,users[0]);
  if(section===null || enrollment.getString('section')===section)continue;
  enrollment.set('section',section); app.save(enrollment);
 }
}
module.exports={studentNim,resolveSection,alignEnrollment,syncRoster};
