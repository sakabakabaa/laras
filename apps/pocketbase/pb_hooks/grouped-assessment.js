const defaults = [
    ['attendance','Kehadiran',10], ['tasks','Tugas',30],
    ['uts','UTS',25], ['uas','UAS',35], ['bonus','Keaktivan',0],
];
function typeOf(record) {
    const code = record.getString('code').trim().toLowerCase();
    const map = {kehadiran:'attendance',tugas:'tasks',uts:'uts',uas:'uas',keaktivan:'bonus',keaktifan:'bonus'};
    return record.getString('componentType') || map[code] || '';
}
module.exports = {
    seed(app, course) {
        if (app.findRecordsByFilter('grade_components','course={:c}', '',1,0,{c:course.id}).length) return;
        const assessmentCollection = app.findCollectionByNameOrId('assessments');
        const componentCollection = app.findCollectionByNameOrId('grade_components');
        const existing = app.findRecordsByFilter('assessments','course={:c}','',500,0,{c:course.id});
        defaults.forEach((d,i) => {
            let assessment = existing.find(a => typeOf(a) === d[0]);
            if (!assessment && existing.length === 0) {
                assessment = new Record(assessmentCollection);
                assessment.set('owner',course.getString('owner')); assessment.set('course',course.id);
                assessment.set('code',d[1]); assessment.set('description',d[0] === 'bonus' ? 'Bonus partisipasi, maksimal +5 poin di luar bobot 100%.' : d[1]);
                assessment.set('weight',d[2]); assessment.set('order',i);
                assessment.set('componentType',d[0]); assessment.set('bonusMax',d[0] === 'bonus' ? 5 : 0); app.save(assessment);
            }
            const record = new Record(componentCollection);
            record.set('owner',course.getString('owner')); record.set('course',course.id);
            record.set('name',d[1]); record.set('sourceType',d[0]); record.set('kind','manual');
            record.set('status','active'); record.set('order',i);
            record.set('weight',d[2]);
            record.set('maxScore',d[0] === 'bonus' ? 5 : 100); record.set('bonusMax',d[0] === 'bonus' ? 5 : 0);
            if(d[0] === 'attendance') record.set('attendanceLateCredit',1);
            app.save(record);
        });
    },
    syncAssessment(app, assessment) {
        const type = typeOf(assessment);
        if (!type) return;
        const records = app.findRecordsByFilter('grade_components','course={:c} && sourceType={:t}','',0,0,{c:assessment.getString('course'),t:type});
        records.forEach(record => {
            const weight = type === 'bonus' ? 0 : assessment.getFloat('weight');
            const bonus = type === 'bonus' ? assessment.getFloat('bonusMax') || 5 : 0;
            if (record.getFloat('weight') !== weight || record.getFloat('bonusMax') !== bonus) {
                record.set('weight',weight); record.set('bonusMax',bonus); if(type === 'bonus') record.set('maxScore',bonus); app.save(record);
            }
        });
    },
    syncComponent(app, component) {
        const type = component.getString('sourceType');
        if (!type) return;
        const rows = app.findRecordsByFilter('assessments','course={:c}','',0,0,{c:component.getString('course')});
        if (!rows.some(a => typeOf(a) === type)) {
            const definition = defaults.find(d => d[0] === type);
            if (definition) {
                const a = new Record(app.findCollectionByNameOrId('assessments'));
                a.set('owner',component.getString('owner')); a.set('course',component.getString('course'));
                a.set('code',definition[1]); a.set('description',type === 'bonus' ? 'Bonus partisipasi di luar bobot 100%.' : definition[1]);
                a.set('componentType',type); a.set('weight',type === 'bonus' ? 0 : component.getFloat('weight'));
                a.set('bonusMax',type === 'bonus' ? component.getFloat('maxScore') : 0); a.set('order',component.getFloat('order'));
                app.save(a);
            }
        }
        rows.filter(a => typeOf(a) === type).forEach(a => {
            const weight = type === 'bonus' ? 0 : component.getFloat('weight');
            const bonus = type === 'bonus' ? component.getFloat('maxScore') : 0;
            if(a.getFloat('weight') !== weight || a.getFloat('bonusMax') !== bonus) {
                a.set('weight',weight); a.set('bonusMax',bonus); a.set('componentType',type); app.save(a);
            }
        });
    }
};

