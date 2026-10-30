onRecordCreate(e=>{require(`${__hooks}/section-membership.js`).alignEnrollment(e.app,e.record);e.next();},'enrollments');
onRecordUpdate(e=>{require(`${__hooks}/section-membership.js`).alignEnrollment(e.app,e.record);e.next();},'enrollments');
onRecordAfterCreateSuccess(e=>{e.next();require(`${__hooks}/section-membership.js`).syncRoster(e.app,e.record);},'course_roster');
onRecordAfterUpdateSuccess(e=>{e.next();require(`${__hooks}/section-membership.js`).syncRoster(e.app,e.record);},'course_roster');
