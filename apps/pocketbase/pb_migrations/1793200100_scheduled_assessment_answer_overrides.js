/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId('scheduled_assessments');
  if (!collection.fields.getByName('answerOverrides')) {
    collection.fields.add(new JSONField({name:'answerOverrides',maxSize:20000}));
    app.save(collection);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId('scheduled_assessments');
  if (collection.fields.getByName('answerOverrides')) {
    collection.fields.removeByName('answerOverrides');
    app.save(collection);
  }
});
