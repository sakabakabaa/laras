migrate(app => {
  const c = app.findCollectionByNameOrId('scheduled_class_activities');
  for (const [name, collection, maxSelect] of [['materials','file_library',8],['cpmks','cpmk',20],['subCpmks','sub_cpmk',20]]) {
    c.fields.add(new RelationField({name, collectionId: app.findCollectionByNameOrId(collection).id, maxSelect, cascadeDelete: false}));
  }
  app.save(c);
  const classes = app.findCollectionByNameOrId('scheduled_classes');
  classes.fields.add(new JSONField({name:'academicSnapshot',maxSize:100000})); app.save(classes);
}, app => {
  const c=app.findCollectionByNameOrId('scheduled_class_activities');
  for(const name of ['materials','cpmks','subCpmks']) c.fields.removeByName(name);
  app.save(c);
  const classes=app.findCollectionByNameOrId('scheduled_classes'); classes.fields.removeByName('academicSnapshot'); app.save(classes);
});
