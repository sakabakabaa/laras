migrate((app) => {
    const c = app.findCollectionByNameOrId('grade_components');
    for (const name of ['attendanceLateCredit','attendanceExcusedCredit'])
        if (!c.fields.getByName(name)) c.fields.add(new NumberField({name,min:0,max:1}));
    app.save(c);
    for (const record of app.findRecordsByFilter('grade_components','sourceType="attendance"','',10000)) {
        record.set('attendanceLateCredit',1); app.save(record);
    }
}, (app) => {});
