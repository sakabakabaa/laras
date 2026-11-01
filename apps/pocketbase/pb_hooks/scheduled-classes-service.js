// Database operations run inside a single PocketBase transaction, including
// deadline checks, revision comparisons, grading and finalization.
const rules = require(__hooks + '/scheduled-classes-domain.js');
function bad(message) { throw new BadRequestError(message); }
function rows(app, name, filter, params, sort = '') { return app.findRecordsByFilter(name, filter, sort, 0, 0, params); }
function data(record) {
  const value = JSON.parse(JSON.stringify(record.publicExport()));
  // JSVM publicExport exposes JSON fields as raw byte slices. Serializing
  // through JSON.stringify otherwise turns saved answers into numeric arrays.
  for (const field of ['snapshot', 'answers', 'detail', 'academicSnapshot', 'answerOverrides']) {
    if (Object.prototype.hasOwnProperty.call(value, field)) value[field] = JSON.parse(record.getString(field) || '{}');
  }
  return value;
}
function json(record, field) { return JSON.parse(record.getString(field) || '{}'); }
function create(app, name, fields) { const r = new Record(app.findCollectionByNameOrId(name)); r.load(fields); app.save(r); return r; }
function event(app, c, actor, action, detail = {}) { create(app, 'scheduled_class_events', {class: c.id, actor, action, detail}); }
function activities(app, c) {
  return rules.windows(data(c), rows(app, 'scheduled_class_activities', 'class={:c}', {c: c.id}, 'position').map(r => ({...data(r), snapshot: json(r, 'snapshot')})));
}
function autoScoreItems(activity, answers, overrides = {}) {
  const items = [];
  if (activity.kind === 'quiz') {
    for (const question of activity.snapshot.questions || []) {
      if (typeof question.points !== 'number' || question.points <= 0) continue;
      items.push({id:question.id,points:question.points,correct:answers[question.id] === question.correctIndex,answered:Number.isInteger(answers[question.id])});
    }
  } else {
    const worksheet = activity.snapshot.worksheet, keys = worksheet?.answerKey?.items || {};
    for (const item of worksheet?.items || []) {
      const key = keys[item.id];
      if (key?.mode !== 'exact' || typeof key.points !== 'number' || key.points <= 0) continue;
      const answer = String(answers.responses?.[item.id] ?? '').trim().replace(/\s+/g,' ').replace(/[.!?]+$/g,'').toLowerCase();
      items.push({id:item.id,points:key.points,correct:key.accepted.some(value=>String(value).trim().replace(/\s+/g,' ').replace(/[.!?]+$/g,'').toLowerCase()===answer),answered:Boolean(answer)});
    }
  }
  if (!items.length) return null;
  const total = items.reduce((sum,item)=>sum+item.points,0);
  const earned = items.reduce((sum,item)=>{
    const override = overrides[item.id];
    const correct = override === 'correct' ? true : override === 'wrong' ? false : item.correct;
    return sum + (correct ? item.points : 0);
  },0);
  return {score:Math.round(earned/total*10000)/100,items};
}
function isAutoScoredActivity(activity) {
  const items = activity.snapshot.worksheet?.items || [], keys = activity.snapshot.worksheet?.answerKey?.items || {};
  return activity.kind === 'quiz' || (['assignment','exit_ticket'].includes(activity.kind) && items.length > 0 && items.every(item=>keys[item.id]?.mode==='exact'));
}
function finalize(app, record, activity, now, status) {
  const outcome = rules.result(activity, json(record, 'answers'));
  record.load({...outcome, status, finalizedAt: new Date(now).toISOString()});
  app.save(record);
}
function syncCheckInAttendance(app, c) {
  const participants = rows(app, 'scheduled_class_participants', 'class={:c} && checkedInAt!="" && roster!=""', {c: c.id});
  for (const participant of participants) {
    const roster = app.findRecordById('course_roster', participant.getString('roster'));
    if (roster.getString('course') !== c.getString('course') || (c.getString('section') && roster.getString('section') !== c.getString('section'))) continue;
    let mark = rows(app, 'attendance', 'session={:s} && roster={:r}', {s: c.getString('session'), r: roster.id})[0];
    if (mark?.getString('status') === 'present') continue;
    const previous = mark?.getString('status') || '';
    if (!mark) mark = new Record(app.findCollectionByNameOrId('attendance'));
    mark.load({session: c.getString('session'), roster: roster.id, owner: c.getString('owner'), section: roster.getString('section'), student: participant.getString('student'), status: 'present'});
    app.save(mark);
    event(app, c, participant.getString('student'), 'attendance', {roster: roster.id, previous, status: 'present', source: 'check_in'});
  }
}
function reconcile(app, c, now) {
  if (!['scheduled', 'closed', 'reviewed'].includes(c.getString('status'))) return;
  syncCheckInAttendance(app, c);
  const plan = activities(app, c), drafts = rows(app, 'scheduled_activity_attempts', 'class={:c} && status="draft"', {c: c.id});
  for (const attempt of drafts) {
    const activity = plan.find(a => a.id === attempt.getString('activity'));
    if (activity && now >= Date.parse(c.getString('endsAt'))) finalize(app, attempt, activity, now, 'expired');
  }
  if (c.getString('status') === 'scheduled' && now >= Date.parse(c.getString('endsAt'))) {
    c.set('status', 'closed'); app.save(c); event(app, c, '', 'closed');
  }
}
function context(app, sessionId, user) {
  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9]{15}$/.test(sessionId)) bad('Pilih pertemuan yang valid.');
  const session = app.findRecordById('class_sessions', sessionId), course = app.findRecordById('courses', session.getString('course'));
  const assignedClass = rows(app, 'scheduled_classes', 'session={:s}', {s: session.id})[0];
  const owner = user.getString('role') === 'faculty' && (course.getString('owner') === user.id || assignedClass?.getString('owner') === user.id);
  let enrollment, roster;
  if (!owner) {
    if (user.getString('role') !== 'student') throw new ForbiddenError('Kelas tidak tersedia.');
    enrollment = rows(app, 'enrollments', 'course={:c} && owner={:u}', {c: course.id, u: user.id})[0];
    if (!enrollment) throw new ForbiddenError('Anda belum terdaftar pada mata kuliah ini.');
    const nim = require(__hooks + '/section-membership.js').studentNim(user);
    const matches = nim ? rows(app, 'course_roster', 'course={:c} && nim={:n}', {c: course.id, n: nim}) : [];
    if (matches.length > 1) throw new ForbiddenError('Identitas mahasiswa ambigu. Hubungi dosen.');
    roster = matches[0];
    const section = session.getString('section');
    if (section && (!roster || roster.getString('section') !== section)) throw new ForbiddenError('Pertemuan untuk kelas lain.');
  }
  return {session, course, owner, enrollment, roster};
}
function assertClassAccess(c, ctx) {
  if (ctx.owner) return;
  if (c.getString('status') === 'draft') throw new ForbiddenError('Kelas belum dijadwalkan.');
  if (c.getString('section') && (!ctx.roster || ctx.roster.getString('section') !== c.getString('section'))) throw new ForbiddenError('Kelas terjadwal untuk rombel lain.');
}
function rosterReport(app, c, plan, participants, attempts, phase) {
  const course = c.getString('course'), section = c.getString('section');
  const roster = rows(app, 'course_roster', 'course={:c}' + (section ? ' && section={:s}' : ''), {c: course, s: section}, 'name');
  const report = roster.map(r => {
    const p = participants.find(p => p.roster === r.id), work = p ? attempts.filter(a => a.student === p.student) : [];
    const summary = rules.attendance(data(c), p, plan, work);
    return {roster: r.id, student: p?.student || '', name: r.getString('name'), nim: r.getString('nim'), checkedInAt: p?.checkedInAt || '', lastSeenAt: p?.lastSeenAt || '', ...summary, attendance: p?.checkedInAt ? 'present' : (['closed', 'reviewed'].includes(phase) ? 'absent' : ''), attempts: work};
  });
  for (const p of participants.filter(p => !p.roster || !roster.some(r => r.id === p.roster))) {
    const user = app.findRecordById('users', p.student), work = attempts.filter(a => a.student === p.student);
    report.push({roster: '', student: p.student, name: user.getString('name') || user.getString('email'), nim: user.getString('nim'), checkedInAt: p.checkedInAt, lastSeenAt: p.lastSeenAt, ...rules.attendance(data(c), p, plan, work), attendance: p.checkedInAt ? 'present' : (['closed', 'reviewed'].includes(phase) ? 'absent' : ''), attempts: work});
  }
  return report;
}
function gradingState(app, c, owner, user) {
  const activities = rows(app, 'scheduled_class_activities', 'class={:c}', {c:c.id});
  const settings = rows(app, 'scheduled_grading_settings', 'class={:c}', {c:c.id});
  const assessments = rows(app, 'scheduled_assessments', 'class={:c}' + (owner ? '' : ' && student={:u}'), {c:c.id,u:user.id});
  const assess = require(__hooks + '/scheduled-assessment.js');
  const published = assessments.filter(r => json(r,'published') && Object.keys(json(r,'published')).length).map(r => {
    const published = json(r, 'published');
    published.publishedRevision = r.getInt('publishedRevision');
    delete published.publishedRevision;
    return assess.studentPublished({attempt:r.getString('attempt'),activity:r.getString('activity'),...published});
  });
  if (!owner) return {assessments:published};
  const settingsByActivity = Object.fromEntries(settings.map(r => [r.getString('activity'), r.getString('mode')]));
  return {
    gradingSettings: settings.map(r => ({id:r.id,activity:r.getString('activity'),revision:r.getInt('revision'),mode:r.getString('mode'),maxPoints:r.getFloat('maxPoints'),criteria:json(r,'criteria')||[]})),
    assessments: assessments.map(r => ({id:r.id,attempt:r.getString('attempt'),activity:r.getString('activity'),student:r.getString('student'),revision:r.getInt('revision'),attemptRevision:r.getInt('attemptRevision'),settingsRevision:r.getInt('settingsRevision'),status:r.getString('status'),points:settingsByActivity[r.getString('activity')] === 'ungraded' ? null : r.get('points'),criterionScores:json(r,'criterionScores')||{},answerOverrides:json(r,'answerOverrides')||{},feedback:r.getString('feedback'),...(json(r,'published')&&Object.keys(json(r,'published')).length?{published:json(r,'published')}:{})}))
  };
}
function view(app, c, ctx, user, now) {
  const assess = gradingState(app,c,ctx.owner,user);
    const owner = ctx.owner, info = data(c), currentPhase = rules.phase(info, now);
  const plan = activities(app, c);
  const participants = rows(app, 'scheduled_class_participants', 'class={:c}' + (owner ? '' : ' && student={:u}'), {c: c.id, u: user.id}).map(data);
  const attempts = rows(app, 'scheduled_activity_attempts', 'class={:c}' + (owner ? '' : ' && student={:u}'), {c: c.id, u: user.id}).map(data);
  const participant = participants.find(p => p.student === user.id);
  if(!owner)delete info.academicSnapshot;
  const required = plan.filter(a => a.required);
  const completedRequired = required.filter(a => attempts.some(t => t.activity === a.id && t.status !== 'draft' && t.complete)).length;
  const resultsReady = !owner && required.length > 0 && completedRequired === required.length;
  const released = resultsReady || (info.releaseResults && ['closed', 'reviewed'].includes(currentPhase));
  const approvedAutoScores = owner ? {} : Object.fromEntries(rows(app,'scheduled_assessments','class={:c} && student={:u} && settingsRevision=0 && status="reviewed"',{c:c.id,u:user.id}).map(record=>{const attempt=attempts.find(item=>item.id===record.getString('attempt')),overrides=json(record,'answerOverrides')||{};return [record.getString('attempt'),{score:Object.keys(overrides).length?record.get('points'):attempt?.score??record.get('points'),revision:record.getInt('attemptRevision')}];}));
  const safeAttempts = attempts.map(a => {
    const activity = plan.find(item => item.id === a.activity);
    const graded = activity && (activity.kind === 'quiz' || Object.values(activity.snapshot.worksheet?.answerKey?.items || {}).some(entry => entry.mode === 'exact' && entry.points > 0));
    if (!graded || (!owner && !released)) delete a.score;
    else if (!owner && approvedAutoScores[a.id]?.revision === a.revision && typeof approvedAutoScores[a.id].score === 'number') a.score = approvedAutoScores[a.id].score;
    return a;
  });
  return {
    serverNow: new Date(now).toISOString(), owner, session: {id: ctx.session.id, title: ctx.session.getString('title'), course: ctx.course.id, section: ctx.session.getString('section')},
    class: {...info, phase: currentPhase, resultsReady}, participant: participant || null,
    activities: plan.map(a => {
      const {snapshot,materials,cpmks,subCpmks, ...meta} = a;
      if (owner) return {...meta, ...snapshot, materialIds:materials||[],cpmkIds:cpmks||[],subCpmkIds:subCpmks||[]};
      if (!participant || now < Date.parse(info.startsAt) || currentPhase === 'cancelled') return meta;
      let worksheet;
      if (snapshot.worksheet) {
        const {answerKey, ...studentWorksheet} = snapshot.worksheet;
        if (released && answerKey) {
          const exactItems = Object.fromEntries(Object.entries(answerKey.items || {}).filter(([, entry]) => entry.mode === 'exact'));
          worksheet = {...studentWorksheet, ...(Object.keys(exactItems).length ? {answerKey: {...answerKey, items: exactItems}} : {})};
        } else worksheet = studentWorksheet;
      }
      return {...meta, content: snapshot.content, url: snapshot.url, ...(snapshot.lesson?{lesson:snapshot.lesson}:{}), ...(worksheet ? {worksheet}:{}), sources:require(__hooks+'/scheduled-class-academic.js').studentSources(app,snapshot.sources,ctx.course.id),questions: snapshot.questions.map(q => ({id: q.id, text: q.text, options: q.options, points: q.points, ...(released ? {correctIndex: q.correctIndex, explanation: q.explanation} : {})}))};
    }),
    attempts: safeAttempts,
    ...(owner ? {gradingSettings:assess.gradingSettings,assessments:assess.assessments} : {assessments:assess.assessments}),
    report: owner ? rosterReport(app, c, plan, participants, attempts, currentPhase) : [],
    events: owner ? rows(app, 'scheduled_class_events', 'class={:c}', {c: c.id}, '-created').map(data).slice(0, 100) : [],
  };
}
function handle(app, body, user, now) {
  const ctx = context(app, body.sessionId, user);
  let c = rows(app, 'scheduled_classes', 'session={:s}', {s: ctx.session.id})[0];
  const action = body.action;
  if (!['state', 'amendContent', 'savePlan', 'schedule', 'cancel', 'join', 'heartbeat', 'saveAnswer', 'submit', 'release', 'review', 'saveGradingSettings', 'saveAssessment', 'publishAssessment', 'approveAutoScore', 'overrideAutoAnswer'].includes(action)) bad('Aksi tidak dikenal.');
  if (['amendContent', 'savePlan', 'schedule', 'cancel', 'release', 'review', 'saveGradingSettings', 'saveAssessment', 'publishAssessment', 'approveAutoScore', 'overrideAutoAnswer'].includes(action) && !ctx.owner) throw new ForbiddenError('Hanya dosen pemilik yang dapat mengubah kelas.');
  if(action==='amendContent'){
    if(!c||c.getString('status')!=='scheduled'||now>=Date.parse(c.getString('startsAt')))bad('Materi hanya dapat direvisi sebelum kelas terjadwal dimulai.');
    if(body.baseRevision!==c.getInt('revision'))bad('Draf berubah. Muat ulang sebelum menyimpan.');
    if(rows(app,'scheduled_class_participants','class={:c}',{c:c.id}).length||rows(app,'scheduled_activity_attempts','class={:c}',{c:c.id}).length)bad('Kelas sudah memiliki partisipasi; materi dikunci.');
    if(!Array.isArray(body.activities)||!body.activities.length||body.activities.length>30)bad('Pilih kegiatan yang akan direvisi.');
    const seen={};
    for(const patch of body.activities){
      if(!patch||typeof patch.id!=='string'||seen[patch.id])bad('Kegiatan revisi tidak valid.');seen[patch.id]=true;
      const record=app.findRecordById('scheduled_class_activities',patch.id);
      if(record.getString('class')!==c.id)throw new ForbiddenError('Kegiatan bukan dari kelas ini.');
      const snapshot=json(record,'snapshot'),materials=Array.from(record.getStringSlice('materials')||[]);
      try{snapshot.lesson=require(__hooks+'/scheduled-lesson-domain.js').validate(patch.lesson,materials);}catch(e){bad(e.message);}
      if(!snapshot.lesson)bad('Lengkapi materi dwibahasa.');
      if(patch.translations!==undefined){
        const items=snapshot.worksheet?.items||[];
        if(!Array.isArray(patch.translations)||patch.translations.length!==items.length)bad('Lengkapi terjemahan setiap butir.');
        for(const item of items){const translated=patch.translations.find(t=>t.id===item.id);if(!translated||typeof translated.idText!=='string'||!translated.idText.trim()||translated.idText.length>1000)bad('Terjemahan butir tidak valid.');if(translated.deText!==undefined){if(typeof translated.deText!=='string'||!translated.deText.trim()||translated.deText.length>1000)bad('Instruksi Jerman tidak valid.');item.prompt=translated.deText.trim();}item.translation=translated.idText.trim();}
      }
      record.set('snapshot',snapshot);app.save(record);
    }
    if(body.instructions){try{const pair=require(__hooks+'/scheduled-lesson-domain.js').validate({goal:body.instructions,steps:[body.instructions],scenes:[]},[]).goal;c.set('instructions',pair.de+'\n\n'+pair.id);}catch(e){bad(e.message);}}
    c.set('revision',c.getInt('revision')+1);app.save(c);event(app,c,user.id,'content_amended',{activities:body.activities.map(a=>a.id),revision:c.getInt('revision')});
  }
  if (action === 'savePlan' || action === 'schedule') {
    if (c && c.getString('status') !== 'draft') bad('Kelas yang sudah dijadwalkan tidak dapat diedit. Batalkan jika diperlukan.');
    if (!Number.isInteger(body.baseRevision) || body.baseRevision !== (c?.getInt('revision') || 0)) bad('Draf berubah. Muat ulang sebelum menyimpan.');
    let plan;
    try { plan = rules.validatePlan(body, now, action === 'schedule'); } catch (e) { bad(e.message); }
    for(let i=0;i<plan.activities.length;i++){try{const lesson=require(__hooks+'/scheduled-lesson-domain.js').validate(body.activities[i].lesson,plan.activities[i].materialIds);if(lesson)plan.activities[i].snapshot.lesson=lesson;}catch(e){bad(e.message);}}
    const academicSnapshot=require(__hooks+'/scheduled-class-academic.js').attach(app,ctx,plan);
    const section = ctx.session.getString('section') || (typeof body.section === 'string' ? body.section : '');
    if (section && app.findRecordById('course_sections', section).getString('course') !== ctx.course.id) bad('Rombel bukan dari mata kuliah ini.');
    const fields = {session: ctx.session.id, course: ctx.course.id, owner: user.id, section, title: plan.title, instructions: plan.instructions, startsAt: plan.startsAt, endsAt: plan.endsAt, joinUntil: plan.joinUntil, lateAfterMin: plan.lateAfterMin, status: action === 'schedule' ? 'scheduled' : 'draft', revision: (c?.getInt('revision') || 0) + 1,academicSnapshot};
    if (!c) c = create(app, 'scheduled_classes', fields); else {c.load(fields); app.save(c);}
    for (const old of rows(app, 'scheduled_class_activities', 'class={:c}', {c: c.id})) app.delete(old);
    for (const a of plan.activities) create(app, 'scheduled_class_activities', {...a, class: c.id});
    event(app, c, user.id, action);
  }
  if (!c) {
    if (!ctx.owner) return {serverNow: new Date(now).toISOString(), owner: false, session: {id: ctx.session.id, title: ctx.session.getString('title'), course: ctx.course.id}, class: null, activities: [], attempts: [], report: [], events: []};
    return {serverNow: new Date(now).toISOString(), owner: true, session: {id: ctx.session.id, title: ctx.session.getString('title'), course: ctx.course.id, section: ctx.session.getString('section')}, class: null, activities: [], attempts: [], report: [], events: []};
  }
  assertClassAccess(c, ctx);
  reconcile(app, c, now);
  if (action === 'approveAutoScore') {
    const phaseNow = rules.phase(data(c), now);
    if (!['closed','reviewed'].includes(phaseNow)) bad('Persetujuan nilai tersedia setelah kelas selesai.');
    const attempt = app.findRecordById('scheduled_activity_attempts', String(body.attemptId||''));
    if (attempt.getString('class') !== c.id) throw new ForbiddenError('Jawaban bukan dari kelas ini.');
    if (attempt.getString('status') === 'draft') bad('Jawaban belum dikumpulkan.');
    if (!Number.isInteger(body.attemptRevision) || body.attemptRevision !== attempt.getInt('revision')) bad('Jawaban berubah. Muat ulang sebelum menyetujui.');
    const activity = activities(app,c).find(item => item.id === attempt.getString('activity'));
    if (!activity || activity.class !== c.id) throw new ForbiddenError('Kegiatan bukan dari kelas ini.');
    if (!isAutoScoredActivity(activity)) bad('Persetujuan satu klik hanya tersedia untuk nilai otomatis dari kunci jawaban.');
    const answers=json(attempt,'answers'), existing=rows(app,'scheduled_assessments','attempt={:a}',{a:attempt.id})[0], overrides=existing?.getInt('settingsRevision')===0?json(existing,'answerOverrides')||{}:{};
    const calculated=autoScoreItems(activity,answers,overrides);
    const baseline=autoScoreItems(activity,answers,{});
    if (!calculated || !baseline || Math.abs(baseline.score-attempt.getFloat('score'))>0.01) bad('Nilai otomatis tidak tersedia atau sudah berubah.');
    if (existing && existing.getInt('settingsRevision') !== 0) bad('Penilaian manual sudah dimulai untuk jawaban ini.');
    const expectedAssessmentRevision=existing?.getInt('revision')||0;
    if (!Number.isInteger(body.assessmentRevision)||body.assessmentRevision!==expectedAssessmentRevision) bad('Penilaian berubah. Muat ulang sebelum menyetujui.');
    if (existing?.getString('status') === 'reviewed' && existing.getInt('attemptRevision') === attempt.getInt('revision')) return view(app,c,ctx,user,now);
    if (existing) {
      existing.load({...data(existing),revision:expectedAssessmentRevision+1,attemptRevision:attempt.getInt('revision'),settingsRevision:0,status:'reviewed',points:calculated.score,answerOverrides:overrides});app.save(existing);
    } else {
      create(app,'scheduled_assessments',{class:c.id,activity:activity.id,attempt:attempt.id,student:attempt.getString('student'),revision:1,attemptRevision:attempt.getInt('revision'),settingsRevision:0,status:'reviewed',points:calculated.score,criterionScores:{},answerOverrides:{},feedback:'',published:{},publishedRevision:0});
    }
    event(app,c,user.id,'auto_score_approved',{attempt:attempt.id,activity:activity.id,score:calculated.score});
  }
  if (action === 'overrideAutoAnswer') {
    const phaseNow=rules.phase(data(c),now);
    if(!['closed','reviewed'].includes(phaseNow))bad('Perubahan jawaban tersedia setelah kelas selesai.');
    const attempt=app.findRecordById('scheduled_activity_attempts',String(body.attemptId||''));
    if(attempt.getString('class')!==c.id)throw new ForbiddenError('Jawaban bukan dari kelas ini.');
    if(attempt.getString('status')==='draft')bad('Jawaban belum dikumpulkan.');
    if(!Number.isInteger(body.attemptRevision)||body.attemptRevision!==attempt.getInt('revision'))bad('Jawaban berubah. Muat ulang sebelum mengubah penilaian.');
    if(typeof body.itemId!=='string'||!body.itemId||!['correct','wrong',null].includes(body.verdict))bad('Perubahan jawaban tidak valid.');
    const activity=activities(app,c).find(item=>item.id===attempt.getString('activity'));
    if(!activity||activity.class!==c.id)throw new ForbiddenError('Kegiatan bukan dari kelas ini.');
    if(!isAutoScoredActivity(activity))bad('Perubahan hanya tersedia untuk nilai otomatis dari kunci jawaban.');
    const answers=json(attempt,'answers'), existing=rows(app,'scheduled_assessments','attempt={:a}',{a:attempt.id})[0];
    if(existing&&existing.getInt('settingsRevision')!==0)bad('Penilaian manual sudah dimulai untuk jawaban ini.');
    const expectedAssessmentRevision=existing?.getInt('revision')||0;
    if(!Number.isInteger(body.assessmentRevision)||body.assessmentRevision!==expectedAssessmentRevision)bad('Penilaian berubah. Muat ulang sebelum mengubah jawaban.');
    if(existing&&existing.getInt('attemptRevision')!==attempt.getInt('revision'))bad('Jawaban berubah. Muat ulang sebelum mengubah penilaian.');
    const base=autoScoreItems(activity,answers,{}), item=base?.items.find(value=>value.id===body.itemId);
    if(!base||Math.abs(base.score-attempt.getFloat('score'))>0.01)bad('Nilai otomatis berubah. Muat ulang sebelum mengubah penilaian.');
    if(!item)bad('Jawaban tidak memakai kunci otomatis.');
    if(!item.answered)bad('Jawaban kosong tidak dapat diubah.');
    const overrides=existing?json(existing,'answerOverrides')||{}:{};
    const previous=overrides[body.itemId];
    if(body.verdict===previous&&existing)return view(app,c,ctx,user,now);
    if(body.verdict===null)delete overrides[body.itemId];else overrides[body.itemId]=body.verdict;
    const calculated=autoScoreItems(activity,answers,overrides);
    if(existing){
      existing.load({...data(existing),revision:expectedAssessmentRevision+1,attemptRevision:attempt.getInt('revision'),settingsRevision:0,status:'draft',points:calculated.score,answerOverrides:overrides,published:{},publishedRevision:0});app.save(existing);
    }else{
      create(app,'scheduled_assessments',{class:c.id,activity:activity.id,attempt:attempt.id,student:attempt.getString('student'),revision:1,attemptRevision:attempt.getInt('revision'),settingsRevision:0,status:'draft',points:calculated.score,criterionScores:{},answerOverrides:overrides,feedback:'',published:{},publishedRevision:0});
    }
    event(app,c,user.id,'auto_answer_overridden',{attempt:attempt.id,activity:activity.id,itemId:body.itemId,verdict:body.verdict,previous:previous||null,score:calculated.score});
  }
  if (['saveGradingSettings','saveAssessment','publishAssessment'].includes(action)) {
    const assess = require(__hooks + '/scheduled-assessment.js');
    const phaseNow = rules.phase(data(c), now);
    if (!['closed','reviewed'].includes(phaseNow)) bad('Penilaian tersedia setelah kelas selesai.');
    if (action === 'saveGradingSettings') {
      const activity = app.findRecordById('scheduled_class_activities', String(body.activityId||''));
      if (activity.getString('class') !== c.id) throw new ForbiddenError('Kegiatan bukan dari kelas ini.');
      assess.assertGradable(activity.getString('kind'));
      const old = rows(app,'scheduled_grading_settings','class={:c} && activity={:a}',{c:c.id,a:activity.id})[0];
      const base = old?.getInt('revision') || 0;
      if (!Number.isInteger(body.baseRevision) || body.baseRevision !== base) bad('Pengaturan berubah. Muat ulang sebelum menyimpan.');
      if (rows(app,'scheduled_assessments','activity={:a}',{a:activity.id}).length) bad('Pengaturan terkunci karena penilaian sudah dibuat.');
      const settings = assess.validateSettings({mode:body.mode,maxPoints:body.maxPoints,criteria:body.criteria});
      let record = old || new Record(app.findCollectionByNameOrId('scheduled_grading_settings'));
      record.load({class:c.id,activity:activity.id,revision:base+1,mode:settings.mode,maxPoints:settings.maxPoints,criteria:settings.criteria}); app.save(record);
      event(app,c,user.id,'grading_settings',{activity:activity.id,revision:base+1});
    } else {
      const attempt = app.findRecordById('scheduled_activity_attempts',String(body.attemptId||''));
      if (attempt.getString('class') !== c.id) throw new ForbiddenError('Jawaban bukan dari kelas ini.');
      const activity = app.findRecordById('scheduled_class_activities',attempt.getString('activity'));
      if (attempt.getString('activity') !== activity.id) throw new ForbiddenError('Kegiatan bukan dari jawaban ini.');
      if (activity.getString('class') !== c.id) throw new ForbiddenError('Kegiatan bukan dari kelas ini.');
      assess.assertGradable(activity.getString('kind'));
      if (attempt.getString('status') === 'draft') bad('Jawaban belum dikumpulkan.');
      const setting = rows(app,'scheduled_grading_settings','class={:c} && activity={:a}',{c:c.id,a:activity.id})[0];
      if (!setting) bad('Pengaturan penilaian tidak tersedia.');
      let record = rows(app,'scheduled_assessments','attempt={:a}',{a:attempt.id})[0];
      if (action === 'publishAssessment') {
        if (!record || record.getString('status') !== 'reviewed') bad('Tinjau penilaian sebelum menerbitkan.');
        const alreadyPublishedRevision = record.getInt('publishedRevision');
        const isUnchangedPublishRetry = body.baseRevision === alreadyPublishedRevision && record.getInt('revision') === alreadyPublishedRevision + 1;
        if (!Number.isInteger(body.baseRevision) || (body.baseRevision !== record.getInt('revision') && !isUnchangedPublishRetry)) bad('Penilaian berubah. Muat ulang sebelum menerbitkan.');
        if (body.attemptRevision !== attempt.getInt('revision') || body.settingsRevision !== setting.getInt('revision') || record.getInt('attemptRevision') !== attempt.getInt('revision') || record.getInt('settingsRevision') !== setting.getInt('revision')) bad('Jawaban atau pengaturan berubah. Muat ulang sebelum menerbitkan.');
        const grade = assess.validateGrade({mode:setting.getString('mode'),maxPoints:setting.getFloat('maxPoints'),criteria:json(setting,'criteria')||[]},json(record,'criterionScores'),record.get('points'));
        if (record.getString('feedback').length > 10000) bad('Umpan balik tidak valid.');
        const current = json(record,'published');
        if (!current || current.publishedRevision !== record.getInt('revision') - 1) {const publishedRevision = record.getInt('revision'); const snapshot={points:grade.points,maxPoints:setting.getFloat('maxPoints'),feedback:record.getString('feedback'),publishedAt:new Date(now).toISOString(),publishedRevision};record.set('published',snapshot);record.set('publishedRevision',publishedRevision);record.set('revision',publishedRevision+1);app.save(record);event(app,c,user.id,'assessment_published',{attempt:attempt.id,status:record.getString('status')});}
      } else {
        if (!Number.isInteger(body.baseRevision)||body.baseRevision!==(record?.getInt('revision')||0)) bad('Penilaian berubah. Muat ulang sebelum menyimpan.');
        if (body.attemptRevision!==attempt.getInt('revision')||body.settingsRevision!==setting.getInt('revision')) bad('Jawaban atau pengaturan berubah. Muat ulang sebelum menyimpan.');
        if (!['draft','reviewed'].includes(body.status)) bad('Status penilaian tidak valid.');
        const grade=assess.validateGrade({mode:setting.getString('mode'),maxPoints:setting.getFloat('maxPoints'),criteria:json(setting,'criteria')||[]},body.criterionScores,body.points);
        if (typeof body.feedback!=='string'||body.feedback.length>10000) bad('Umpan balik tidak valid.');
        if (!record) record=new Record(app.findCollectionByNameOrId('scheduled_assessments'));
        record.load({class:c.id,activity:activity.id,attempt:attempt.id,student:attempt.getString('student'),revision:(record.getInt('revision')||0)+1,attemptRevision:attempt.getInt('revision'),settingsRevision:setting.getInt('revision'),status:body.status,points:grade.points,criterionScores:grade.criterionScores,feedback:body.feedback,published:record.get('published'),publishedRevision:record.getInt('publishedRevision')});app.save(record);
        event(app,c,user.id,'assessment_saved',{attempt:attempt.id,status:body.status});
      }
    }
  }
  const phase = rules.phase(data(c), now);
  if (action === 'cancel') {
    if (['closed', 'reviewed', 'cancelled'].includes(phase)) bad('Kelas sudah selesai atau dibatalkan.');
    c.set('status', 'cancelled'); app.save(c); event(app, c, user.id, 'cancel');
  }
  if (action === 'release' || action === 'review') {
    if (!['closed', 'reviewed'].includes(phase)) bad('Tunggu hingga kelas selesai.');
    if (action === 'release') c.set('releaseResults', true); else c.set('status', 'reviewed');
    app.save(c); event(app, c, user.id, action);
  }
  if (['join', 'heartbeat', 'saveAnswer', 'submit'].includes(action)) {
    if (ctx.owner) bad('Gunakan akun mahasiswa untuk mengikuti kelas.');
    // A response may be lost just before the deadline. Acknowledge an already
    // accepted request even after the activity/class closes, without editing it.
    if (['saveAnswer', 'submit'].includes(action)) {
      const previous = rows(app, 'scheduled_activity_attempts', 'class={:c} && activity={:a} && student={:u}', {c: c.id, a: String(body.activityId || ''), u: user.id})[0];
      if (phase !== 'cancelled' && previous && (previous.getString('lastRequest') === body.requestId || (action === 'submit' && previous.getString('status') !== 'draft'))) return view(app, c, ctx, user, now);
    }
    if (phase !== 'open') bad('Kelas belum dibuka atau sudah ditutup.');
    let participant = rows(app, 'scheduled_class_participants', 'class={:c} && student={:u}', {c: c.id, u: user.id})[0];
    if (!participant) {
      if (action !== 'join') bad('Lakukan check-in terlebih dahulu.');
      if (now >= Date.parse(c.getString('joinUntil'))) bad('Batas masuk kelas sudah lewat. Hubungi dosen.');
      participant = create(app, 'scheduled_class_participants', {class: c.id, student: user.id, roster: ctx.roster?.id || '', checkedInAt: new Date(now).toISOString(), lastSeenAt: new Date(now).toISOString()});
      event(app, c, user.id, 'join');
    } else { participant.set('lastSeenAt', new Date(now).toISOString()); app.save(participant); }
    if (action === 'join') syncCheckInAttendance(app, c);
    if (action === 'saveAnswer' || action === 'submit') {
      const activity = activities(app, c).find(a => a.id === body.activityId);
      if (!activity) bad('Kegiatan tidak ditemukan pada kelas ini.');
      let attempt = rows(app, 'scheduled_activity_attempts', 'activity={:a} && student={:u}', {a: activity.id, u: user.id})[0];
      if (typeof body.requestId !== 'string' || !/^[\w-]{8,100}$/.test(body.requestId)) bad('Identitas permintaan tidak valid.');
      // A retry is an acknowledgement, never a second submission or overwrite.
      if (!(attempt && (attempt.getString('lastRequest') === body.requestId || (action === 'submit' && attempt.getString('status') !== 'draft')))) {
        if (now < Date.parse(c.getString('startsAt')) || now >= Date.parse(c.getString('endsAt'))) bad('Waktu pengerjaan kelas sudah ditutup atau belum dibuka.');
        if (attempt && attempt.getString('status') !== 'draft') bad('Jawaban sudah dikumpulkan.');
        if (!Number.isInteger(body.baseRevision) || body.baseRevision !== (attempt?.getInt('revision') || 0)) bad('Jawaban berubah di tab lain. Muat ulang sebelum melanjutkan.');
        let answers;
        try {answers = rules.cleanAnswers(activity, body.answers);} catch (e) {bad(e.message);}
        if (!attempt) attempt = new Record(app.findCollectionByNameOrId('scheduled_activity_attempts'));
        attempt.load({class: c.id, activity: activity.id, student: user.id, answers, status: 'draft', revision: attempt.getInt('revision') + 1, savedAt: new Date(now).toISOString(), lastRequest: body.requestId});
        app.save(attempt);
        if (action === 'submit') {finalize(app, attempt, activity, now, 'submitted'); event(app, c, user.id, 'submit', {activity: activity.id});}
      }
    }
  }
  return view(app, c, ctx, user, now);
}
function list(app, user, now) {
  if (user.getString('role') !== 'faculty') throw new ForbiddenError('Daftar kelas hanya tersedia untuk dosen.');
  return rows(app, 'scheduled_classes', 'owner={:u} || course.owner={:u}', {u:user.id}, '-startsAt').map(c => {
    const course = app.findRecordById('courses', c.getString('course'));
    const section = c.getString('section') ? app.findRecordById('course_sections', c.getString('section')).getString('name') : '';
    return {id:c.id,session:c.getString('session'),title:c.getString('title'),status:c.getString('status'),phase:rules.phase(data(c),now),startsAt:c.getString('startsAt'),endsAt:c.getString('endsAt'),course:{id:course.id,title:course.getString('title'),code:course.getString('code')},section,activityCount:rows(app,'scheduled_class_activities','class={:c}',{c:c.id}).length,checkedIn:rows(app,'scheduled_class_participants','class={:c} && checkedInAt!=""',{c:c.id}).length};
  });
}
// Student dashboard only: reuse the same enrollment and roster checks as the classroom.
function studentList(app, user, now, includePast = false) {
  if (user.getString('role') !== 'student') throw new ForbiddenError('Daftar kelas ini hanya tersedia untuk mahasiswa.');
  const enrollments = rows(app, 'enrollments', 'owner={:u}', {u:user.id});
  const courseIds = [...new Set(enrollments.map(item=>item.getString('course')).filter(Boolean))];
  const items=[];
  for (const courseId of courseIds) {
    const classes=rows(app,'scheduled_classes',includePast?'course={:c} && (status="scheduled" || status="closed" || status="reviewed")':'course={:c} && status="scheduled"',{c:courseId},'startsAt');
    for(const c of classes){
      const endsAt=Date.parse(c.getString('endsAt'));
      if(!Number.isFinite(endsAt)||(!includePast && endsAt<=now))continue;
      let ctx;
      try {ctx=context(app,c.getString('session'),user);assertClassAccess(c,ctx);}
      catch(error){if(error instanceof ForbiddenError)continue;throw error;}
      const participant=rows(app,'scheduled_class_participants','class={:c} && student={:u}',{c:c.id,u:user.id})[0];
      const info=data(c);
      items.push({id:c.id,sessionId:ctx.session.id,courseId:ctx.course.id,courseTitle:ctx.course.getString('title'),title:c.getString('title'),startsAt:c.getString('startsAt'),endsAt:c.getString('endsAt'),joinUntil:c.getString('joinUntil'),phase:rules.phase(info,now),checkedIn:Boolean(participant)});
    }
  }
  return items.sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
}
module.exports = {handle, reconcile, list, studentList};
