const builder=require(__hooks+'/builder-service.js');
const json=(r,f)=>JSON.parse(r.getString(f)||'{}');
function view(r){return {id:r.id,status:r.getString('status'),source:r.getString('source'),settings:json(r,'settings'),documentId:r.getString('documentId'),report:json(r,'report'),error:r.getString('error'),attempts:r.getInt('attempts'),leaseUntil:r.getFloat('leaseUntil')};}
function handle(app,user,b){
 const find=(filter,params)=>app.findRecordsByFilter('builder_import_jobs',filter,'',1,0,params)[0];
 if(b.action==='list')return {items:app.findRecordsByFilter('builder_import_jobs','owner={:u}','-created',20,0,{u:user.id}).map(view)};
 if(b.action==='lookup'||b.action==='start'){
  if(typeof b.commandId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.commandId))throw new BadRequestError('Identitas impor tidak valid.');
  const prior=find('owner={:u} && commandId={:k}',{u:user.id,k:b.commandId});
  if(prior)return view(prior); if(b.action==='lookup')return null;
  const s=b.settings||{};
  if(!['kelas','tugas'].includes(s.kind)||!s.context||!Array.isArray(s.context.sectionIds))throw new BadRequestError('Pilih jenis dan mata kuliah.');
  builder.authorizeContext(app,user,{context:s.context});
  const file=app.findRecordById('file_library',b.source);
  if(file.getString('owner')!==user.id||!Array.from(file.getStringSlice('course')).includes(s.context.courseId)||!/^image\/(png|jpeg|webp)$/.test(file.getString('mimeType')) && !/\.(png|jpe?g|webp)$/i.test(file.getString('file')))throw new ForbiddenError('Gambar sumber tidak tersedia.');
  const r=new Record(app.findCollectionByNameOrId('builder_import_jobs'));
  r.load({owner:user.id,course:s.context.courseId,source:file.id,commandId:b.commandId,status:'queued',settings:{kind:s.kind,context:s.context,title:String(s.title||'').slice(0,200),goal:String(s.goal||'').slice(0,2000)},report:{},attempts:0});app.save(r);return view(r);
 }
 if(typeof b.id!=='string'||!/^[a-z0-9]{15}$/.test(b.id))throw new BadRequestError('ID impor tidak valid.');
 const r=app.findRecordById('builder_import_jobs',b.id);if(r.getString('owner')!==user.id)throw new ForbiddenError('Impor tidak tersedia.');
 builder.authorizeContext(app,user,{context:json(r,'settings').context});
 if(b.action==='get')return view(r);
 if(b.action==='retry'){
  if(r.getString('status')==='failed'&&r.getInt('attempts')<3){r.load({status:'queued',error:'',lease:'',leaseUntil:0});app.save(r);}return view(r);
 }
 if(b.action==='claim'){
  if(r.getString('status')!=='queued'&&!(r.getString('status')==='running'&&r.getFloat('leaseUntil')<Date.now()))return null;
  if(r.getInt('attempts')>=3){r.load({status:'failed',error:'Impor belum selesai setelah tiga percobaan. Buat impor baru dengan gambar yang lebih jelas.'});app.save(r);return null;}
  if(typeof b.lease!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.lease))throw new BadRequestError('Lease tidak valid.');
  r.load({status:'running',lease:b.lease,leaseUntil:Date.now()+360000,attempts:r.getInt('attempts')+1});app.save(r);return view(r);
 }
 if(!['finish','fail'].includes(b.action)||r.getString('status')!=='running'||b.lease!==r.getString('lease')||r.getFloat('leaseUntil')<Date.now())throw new BadRequestError('Pekerjaan sudah berubah. Muat ulang status.');
 if(b.action==='fail'){r.load({status:'failed',error:String(b.error||'Impor gagal.').slice(0,1000),lease:'',leaseUntil:0});app.save(r);return view(r);}
 const settings=json(r,'settings');
 if(!b.envelope||!b.envelope.document||b.envelope.document.kind!==settings.kind||b.envelope.document.context.courseId!==settings.context.courseId||b.envelope.document.context.meetingId!==settings.context.meetingId||JSON.stringify(b.envelope.document.context.sectionIds)!==JSON.stringify(settings.context.sectionIds))throw new BadRequestError('Konteks draf tidak sesuai.');
 const created=builder.handle(app,user,Object.assign({},b.envelope,{action:'create',commandId:'import_'+r.id}));
 r.load({status:'ready',documentId:created.id,report:b.report||{},error:'',lease:'',leaseUntil:0});app.save(r);return view(r);
}
module.exports={handle};
