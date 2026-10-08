migrate((app) => {
    for (const [name, fields] of [
        ['grade_components', [new TextField({name:'sourceType',max:30}), new NumberField({name:'bonusMax',min:0,max:100})]],
        ['assignments', [new TextField({name:'assessmentGroup',max:30}), new NumberField({name:'assessmentWeight',min:0,max:1000})]],
        ['assessments', [new TextField({name:'componentType',max:30}), new NumberField({name:'bonusMax',min:0,max:100})]],
    ]) {
        const c = app.findCollectionByNameOrId(name);
        for (const field of fields) if (!c.fields.getByName(field.name)) c.fields.add(field);
        app.save(c);
    }
}, (app) => {});
