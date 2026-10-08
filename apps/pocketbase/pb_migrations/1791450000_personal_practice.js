/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const users = app.findCollectionByNameOrId('users');
    const courses = app.findCollectionByNameOrId('courses');
    const relation = (name, collectionId) => ({ name, type: 'relation', required: true, maxSelect: 1, collectionId, cascadeDelete: true });
    const timestamps = [
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ];
    const create = (name, fields, indexes) => {
        try { app.findCollectionByNameOrId(name); return; } catch (_) {}
        app.save(new Collection({ name, type: 'base', listRule: null, viewRule: null,
            createRule: null, updateRule: null, deleteRule: null, fields: fields.concat(timestamps), indexes }));
    };
    create('personal_practice_settings', [relation('course', courses.id),
        { name: 'enabled', type: 'bool' }, { name: 'language', type: 'text', max: 80 },
        { name: 'level', type: 'text', max: 2 },
    ], ['CREATE UNIQUE INDEX idx_personal_practice_course ON personal_practice_settings(course)']);
    create('personal_practice_rounds', [relation('course', courses.id), relation('student', users.id),
        { name: 'preview', type: 'bool' }, { name: 'activeKey', type: 'text', max: 150 },
        { name: 'status', type: 'select', values: ['generating', 'active', 'completed'], maxSelect: 1, required: true },
        { name: 'payload', type: 'json', maxSize: 250000 },
    ], ["CREATE UNIQUE INDEX idx_personal_practice_active ON personal_practice_rounds(activeKey) WHERE activeKey != ''",
        'CREATE INDEX idx_personal_practice_student ON personal_practice_rounds(student,course,created)']);
    const rounds = app.findCollectionByNameOrId('personal_practice_rounds');
    create('personal_practice_attempts', [relation('round', rounds.id),
        { name: 'ordinal', type: 'number', required: true, min: 1, max: 8, onlyInt: true },
        { name: 'status', type: 'select', values: ['evaluating', 'done'], required: true, maxSelect: 1 },
        { name: 'answer', type: 'text', max: 2000 },
        { name: 'result', type: 'json', maxSize: 30000 },
    ], ['CREATE UNIQUE INDEX idx_personal_practice_answer ON personal_practice_attempts(round,ordinal)']);
    const sections = app.findCollectionByNameOrId('context_sections');
    if (!sections.fields.getByName('practiceExcerpt')) {
        sections.fields.add(new TextField({ name: 'practiceExcerpt', max: 6000 }));
        app.save(sections);
    }
}, (app) => {
    for (const name of ['personal_practice_attempts', 'personal_practice_rounds', 'personal_practice_settings']) {
        try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
    const sections = app.findCollectionByNameOrId('context_sections');
    sections.fields.removeByName('practiceExcerpt'); app.save(sections);
});
