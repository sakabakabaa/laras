/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const sections = app.findCollectionByNameOrId('context_sections');
    if (!sections.fields.getByName('practiceSession')) {
        sections.fields.add(new RelationField({ name: 'practiceSession', maxSelect: 1, collectionId: app.findCollectionByNameOrId('class_sessions').id }));
        app.save(sections);
    }
    const rounds = app.findCollectionByNameOrId('personal_practice_rounds');
    app.save(new Collection({ name: 'personal_practice_reports', type: 'base', listRule: null, viewRule: null,
        createRule: null, updateRule: null, deleteRule: null,
        fields: [
            { name: 'round', type: 'relation', required: true, maxSelect: 1, collectionId: rounds.id, cascadeDelete: true },
            { name: 'ordinal', type: 'number', required: true, min: 1, max: 8, onlyInt: true },
            { name: 'reason', type: 'text', required: true, max: 1500 },
            { name: 'created', type: 'autodate', onCreate: true },
        ], indexes: ['CREATE UNIQUE INDEX idx_personal_practice_report ON personal_practice_reports(round,ordinal)'],
    }));
}, (app) => {
    app.delete(app.findCollectionByNameOrId('personal_practice_reports'));
    const sections = app.findCollectionByNameOrId('context_sections');
    sections.fields.removeByName('practiceSession'); app.save(sections);
});
