/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const relation = (name, collection) => new RelationField({name,collectionId:app.findCollectionByNameOrId(collection).id,maxSelect:1,required:true,cascadeDelete: false});
  const create = (name, fields, index) => {
    const collection = new Collection({name,type:'base',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null});
    app.save(collection);
    for (const field of fields) collection.fields.add(field);
    collection.fields.add(new AutodateField({name:'created',onCreate:true}));
    collection.fields.add(new AutodateField({name:'updated',onCreate:true,onUpdate:true}));
    app.save(collection);
    collection.indexes = [index];
    app.save(collection);
  };
  create('scheduled_grading_settings',[
    relation('class','scheduled_classes'),relation('activity','scheduled_class_activities'),
    new NumberField({name:'revision',onlyInt:true}),
    new SelectField({name:'mode',values:['ungraded','points','rubric'],maxSelect:1,required:true}),
    new NumberField({name:'maxPoints',min:0}),new JSONField({name:'criteria',maxSize:20000}),
  ],'CREATE UNIQUE INDEX idx_scheduled_grading_setting ON scheduled_grading_settings (class, activity)');
  create('scheduled_assessments',[
    relation('class','scheduled_classes'),relation('activity','scheduled_class_activities'),
    relation('attempt','scheduled_activity_attempts'),relation('student','users'),
    new NumberField({name:'revision',onlyInt:true}),new NumberField({name:'attemptRevision',onlyInt:true}),
    new NumberField({name:'settingsRevision',onlyInt:true}),new NumberField({name:'publishedRevision',onlyInt:true}),
    new SelectField({name:'status',values:['draft','reviewed'],maxSelect:1,required:true}),
    new NumberField({name:'points'}),new JSONField({name:'criterionScores',maxSize:20000}),
    new TextField({name:'feedback',max:10000}),new JSONField({name:'published',maxSize:15000}),
  ],'CREATE UNIQUE INDEX idx_scheduled_assessment_attempt ON scheduled_assessments (attempt)');
}, (app) => {
  app.delete(app.findCollectionByNameOrId('scheduled_assessments'));
  app.delete(app.findCollectionByNameOrId('scheduled_grading_settings'));
});
