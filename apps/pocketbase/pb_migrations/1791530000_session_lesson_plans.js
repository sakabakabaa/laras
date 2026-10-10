migrate((app) => {
 const plans=app.findCollectionByNameOrId('assistant_lesson_plans');
 const sessions=app.findCollectionByNameOrId('class_sessions');
 const task=plans.fields.getByName('task'); task.required=false; task.cascadeDelete=false;
 plans.fields.add(new RelationField({name:'session',collectionId:sessions.id,maxSelect:1,cascadeDelete:true}));
 plans.fields.add(new NumberField({name:'revision',onlyInt:true}));
 plans.fields.add(new SelectField({name:'status',values:['draft','ready'],maxSelect:1}));
 plans.fields.add(new RelationField({name:'lastEditor',collectionId:app.findCollectionByNameOrId('users').id,maxSelect:1}));
 plans.indexes=['CREATE UNIQUE INDEX idx_assistant_lesson_task ON assistant_lesson_plans (task) WHERE task != \'\'','CREATE UNIQUE INDEX idx_lesson_session ON assistant_lesson_plans (session) WHERE session != \'\''];
 app.save(plans);
 app.save(new Collection({name:'lesson_plan_revisions',type:'base',listRule:"@request.auth.id != '' && owner = @request.auth.id",viewRule:"@request.auth.id != '' && owner = @request.auth.id",createRule:null,updateRule:null,deleteRule:null,fields:[
 {name:'owner',type:'relation',collectionId:app.findCollectionByNameOrId('users').id,required:true,maxSelect:1,cascadeDelete:true},
 {name:'lessonPlan',type:'relation',collectionId:plans.id,required:true,maxSelect:1,cascadeDelete:true},
 {name:'revision',type:'number',onlyInt:true}, {name:'origin',type:'select',values:['manual','ai','attach'],maxSelect:1},
 {name:'snapshot',type:'json',maxSize:150000}, {name:'created',type:'autodate',onCreate:true,onUpdate:false},
 ],indexes:['CREATE UNIQUE INDEX idx_lesson_revision ON lesson_plan_revisions (lessonPlan,revision)']}));
}, (app)=>{ app.delete(app.findCollectionByNameOrId('lesson_plan_revisions')); const c=app.findCollectionByNameOrId('assistant_lesson_plans'); for(const n of ['session','revision','status','lastEditor'])c.fields.removeByName(n); c.indexes=['CREATE UNIQUE INDEX idx_assistant_lesson_task ON assistant_lesson_plans (task) WHERE task != \'\'']; app.save(c); });
