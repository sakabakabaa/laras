/// <reference path="../pb_data/types.d.ts" />
migrate(app => {
 const assignments=app.findCollectionByNameOrId('assignments');
 if(!assignments.fields.getByName('revisionOf')) assignments.fields.add(new RelationField({name:'revisionOf',collectionId:assignments.id,maxSelect:1,cascadeDelete:false}));
 if(!assignments.fields.getByName('revisionWorkflow')) assignments.fields.add(new JSONField({name:'revisionWorkflow',maxSize:50000}));
 app.save(assignments);
 const submissions=app.findCollectionByNameOrId('assignment_submissions');
 if(!submissions.fields.getByName('revisionProvenance')) submissions.fields.add(new JSONField({name:'revisionProvenance',maxSize:200000}));
 if(!submissions.fields.getByName('revisionReflection')) submissions.fields.add(new TextField({name:'revisionReflection',max:2000}));
 // These fields describe server-confirmed provenance. Students cannot forge them.
 submissions.createRule='('+submissions.createRule+') && @request.body.revisionProvenance:isset = false';
 submissions.updateRule='('+submissions.updateRule+') && (@request.auth.role = "lecturer" || @request.body.revisionProvenance:changed = false)';
 app.save(submissions);
},app=>{
 const a=app.findCollectionByNameOrId('assignments');a.fields.removeByName('revisionOf');a.fields.removeByName('revisionWorkflow');app.save(a);
 const s=app.findCollectionByNameOrId('assignment_submissions');s.fields.removeByName('revisionProvenance');s.fields.removeByName('revisionReflection');
 s.createRule=s.createRule.replace(/^\((.*)\) && @request.body.revisionProvenance:isset = false$/,'$1');
 s.updateRule=s.updateRule.replace(/^\((.*)\) && \(@request.auth.role = "lecturer" \|\| @request.body.revisionProvenance:changed = false\)$/,'$1');app.save(s);
});
