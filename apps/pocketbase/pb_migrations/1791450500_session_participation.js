migrate(app => {
 const sessions=app.findCollectionByNameOrId('class_sessions');
 sessions.fields.add(new BoolField({name:'attendanceClosed'})); app.save(sessions);
 const attendance=app.findCollectionByNameOrId('attendance');
 attendance.fields.getByName('status').values=['present','late','absent','excused','sick']; app.save(attendance);
 const c=new Collection({name:'participation_awards',type:'base'}); app.save(c);
},app=>{});
