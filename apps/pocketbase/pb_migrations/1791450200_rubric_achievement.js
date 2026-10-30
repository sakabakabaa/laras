migrate((app) => {
    const collection = app.findCollectionByNameOrId('ai_evaluations');
    if (!collection.fields.getByName('reviewCriterionScores')) {
        collection.fields.add(new JSONField({ name: 'reviewCriterionScores', maxSize: 30000 }));
        app.save(collection);
    }
}, (app) => {
    const collection = app.findCollectionByNameOrId('ai_evaluations');
    collection.fields.removeByName('reviewCriterionScores');
    app.save(collection);
});
