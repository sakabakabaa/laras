/// <reference path="../pb_data/types.d.ts" />
// Raise scheduled_class_activities.materials maxSelect from 8 to 40 so matching cards can carry individual item images.
migrate((app) => {
  const collection = app.findCollectionByNameOrId('scheduled_class_activities');
  const field = collection.fields.getByName('materials');
  if (field && field.maxSelect < 40) {
    field.maxSelect = 40;
    app.save(collection);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId('scheduled_class_activities');
  const field = collection.fields.getByName('materials');
  if (field) {
    field.maxSelect = 8;
    app.save(collection);
  }
});
