onBootstrap(e => {
    e.next();
    // onBootstrap runs BEFORE migrations create the collections, so the lookup
    // must tolerate a missing one. Without this guard a fresh database failed
    // to start with "sql: no rows in result set".
    let courses;
    try {
        courses = e.app.findRecordsByFilter('courses','', '',10000);
    } catch (error) {
        return; // collections not created yet
    }
    const helper = require(__hooks + '/grouped-assessment.js');
    for (const course of courses)
        helper.seed(e.app,course);
});
onRecordAfterCreateSuccess(e => {
    e.next(); require(__hooks + '/grouped-assessment.js').seed(e.app,e.record);
}, 'courses');
onRecordAfterUpdateSuccess(e => {
    e.next(); require(__hooks + '/grouped-assessment.js').syncAssessment(e.app,e.record);
}, 'assessments');
onRecordAfterCreateSuccess(e => {
    e.next(); require(__hooks + '/grouped-assessment.js').syncAssessment(e.app,e.record);
}, 'assessments');
onRecordAfterUpdateSuccess(e => {
    e.next(); require(__hooks + '/grouped-assessment.js').syncComponent(e.app,e.record);
}, 'grade_components');
onRecordAfterCreateSuccess(e => {
    e.next(); require(__hooks + '/grouped-assessment.js').syncComponent(e.app,e.record);
}, 'grade_components');
