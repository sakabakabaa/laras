migrate((app) => {
 const c = new Collection({name:'builder_import_jobs',type:'base',listRule:null,viewRule:null,createRule:null,updateRule:null,deleteRule:null});
 app.save(c);
 for(const [name,target] of [['owner','users'],['course','courses'],['source','file_library']]) c.fields.add(new RelationField({name,collectionId:app.findCollectionByNameOrId(target).id,maxSelect:1,required:true}));
 for(const name of ['commandId','lease','error','documentId']) c.fields.add(new TextField({name,max:name==='error'?1000:100}));
 c.fields.add(new SelectField({name:'status',values:['queued','running','ready','failed'],maxSelect:1,required:true}));
 c.fields.add(new NumberField({name:'leaseUntil',min:0}));
 c.fields.add(new NumberField({name:'attempts',min:0,onlyInt:true}));
 c.fields.add(new JSONField({name:'settings',maxSize:10000}));
 c.fields.add(new JSONField({name:'report',maxSize:50000}));
 c.fields.add(new AutodateField({name:'created',onCreate:true}));
 c.fields.add(new AutodateField({name:'updated',onCreate:true,onUpdate:true}));
 app.save(c); c.indexes=['CREATE UNIQUE INDEX idx_builder_import_command ON builder_import_jobs (owner, commandId)']; app.save(c);
}, (app)=>app.delete(app.findCollectionByNameOrId('builder_import_jobs')));
