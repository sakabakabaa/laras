/// <reference path="../pb_data/types.d.ts" />
// Additive: the lecturer's approve/reject decisions on AI findings of a scheduled-class answer.
migrate((app) => {
  const collection = app.findCollectionByNameOrId('scheduled_assessments');
  if (!collection.fields.getByName('reviewFindings')) {
    collection.fields.add(new JSONField({name:'reviewFindings',maxSize:40000}));
    app.save(collection);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId('scheduled_assessments');
  if (collection.fields.getByName('reviewFindings')) {
    collection.fields.removeByName('reviewFindings');
    app.save(collection);
  }
});
