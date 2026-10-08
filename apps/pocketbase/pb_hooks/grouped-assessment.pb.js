onBootstrap(e => {
    e.next();
    const helper = require(__hooks + '/grouped-assessment.js');
    for (const course of e.app.findRecordsByFilter('courses','', '',10000))
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
