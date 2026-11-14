/// <reference path="../pb_data/types.d.ts" />
// Additive: one stored AI draft per written scheduled-class answer, so the
// lecturer's "Draf AI" survives navigation and can be run for a whole
// activity. Superuser-only (all rules null): the web app writes it after an
// ownership check and the lecturer reads it through the scheduled-classes
// state endpoint. Students never see it.
migrate((app) => {
  try {
    app.findCollectionByNameOrId('scheduled_ai_drafts');
    return;
  } catch {
    /* create below */
  }
  const relation = (name, collection) => new RelationField({name,collectionId:app.findCollectionByNameOrId(collection).id,maxSelect:1,required:true,cascadeDelete: false});
  const collection = new Collection({name:'scheduled_ai_drafts',type:'base',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null});
  app.save(collection);
  for (const field of [
    relation('class','scheduled_classes'),relation('activity','scheduled_class_activities'),
    relation('attempt','scheduled_activity_attempts'),relation('student','users'),
    new SelectField({name:'status',values:['ready','failed'],maxSelect:1,required:true}),
    new NumberField({name:'attemptRevision',onlyInt:true}),new NumberField({name:'settingsRevision',onlyInt:true}),
    new JSONField({name:'draft',maxSize:40000}),new TextField({name:'error',max:500}),
  ]) collection.fields.add(field);
  collection.fields.add(new AutodateField({name:'created',onCreate:true}));
  collection.fields.add(new AutodateField({name:'updated',onCreate:true,onUpdate:true}));
  app.save(collection);
  collection.indexes = ['CREATE UNIQUE INDEX idx_scheduled_ai_draft_attempt ON scheduled_ai_drafts (attempt)','CREATE INDEX idx_scheduled_ai_draft_class ON scheduled_ai_drafts (class)'];
  app.save(collection);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId('scheduled_ai_drafts'));
  } catch {
    /* already gone */
  }
});
