onRecordCreate(e=>{require(`${__hooks}/course-term-guard.js`).validateSection(e.app,e.record);e.next();},'course_sections');
onRecordUpdate(e=>{require(`${__hooks}/course-term-guard.js`).validateSection(e.app,e.record);e.next();},'course_sections');
onRecordUpdate(e=>{require(`${__hooks}/course-term-guard.js`).validateCourse(e.app,e.record);e.next();},'courses');
