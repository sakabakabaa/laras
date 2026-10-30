migrate(app=>{
 const c=app.findCollectionByNameOrId('participation_awards');
 for(const pair of [['session','class_sessions'],['roster','course_roster'],['owner','users'],['student','users']])if(!c.fields.getByName(pair[0]))c.fields.add(new RelationField({name:pair[0],collectionId:app.findCollectionByNameOrId(pair[1]).id,required:pair[0]!=='student',maxSelect:1,cascadeDelete:true}));
 const fields=[new NumberField({name:'points',required:true,min:0.5,max:1}),new SelectField({name:'reason',required:true,maxSelect:1,values:['Menjawab','Bertanya','Diskusi','Presentasi','Membantu teman']}),new TextField({name:'note',max:500}),new BoolField({name:'revoked'}),new AutodateField({name:'created',onCreate:true}),new AutodateField({name:'updated',onCreate:true,onUpdate:true})];
 for(const f of fields)if(!c.fields.getByName(f.name))c.fields.add(f);
 c.listRule="@request.auth.id != '' && (session.course.owner = @request.auth.id || student = @request.auth.id)";c.viewRule=c.listRule;
 c.createRule="@request.auth.role = 'faculty' && session.course.owner = @request.auth.id && owner = @request.auth.id && roster.course = session.course && (session.section = '' || roster.section = session.section) && revoked = false";
 c.updateRule="session.course.owner = @request.auth.id && @request.body.session:changed = false && @request.body.roster:changed = false && @request.body.owner:changed = false && @request.body.student:changed = false && @request.body.points:changed = false && @request.body.reason:changed = false && @request.body.note:changed = false";
 c.deleteRule=null; app.save(c);
},app=>{});
