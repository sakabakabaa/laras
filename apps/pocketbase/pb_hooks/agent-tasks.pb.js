/// <reference path="../pb_data/types.d.ts" />
// Atomic leases/checkpoints: several web workers cannot execute the same job.
// Only the application server's superuser can call this internal route.
routerAdd('POST', '/api/agent-tasks/{id}/transition', (e) => {
  if (!e.auth || !e.auth.isSuperuser()) throw new ForbiddenError('Server only.');
  const body = e.requestInfo().body;
  let result;
  e.app.runInTransaction((app) => {
    const task = app.findRecordById('agent_tasks', e.request.pathValue('id'));
    const status = task.getString('status');
    const now = new Date();
    const leased = task.getString('lease') && Date.parse(task.getString('leaseUntil')) > now.getTime();
    if (body.action === 'claim') {
      if (leased || !['queued', 'running', 'awaiting_practice'].includes(status)) throw new BadRequestError('Task unavailable.');
      task.set('lease', body.lease);
      task.set('leaseUntil', new Date(now.getTime() + 240000).toISOString());
      task.set('status', 'running');
    } else if (body.action === 'checkpoint') {
      if (status !== 'running' || task.getString('lease') !== body.lease || !leased) throw new BadRequestError('Lease ended.');
      const patch = body.patch || {};
      // Bound field access; caller cannot rewrite task ownership or scope.
      for (const key of ['status', 'steps', 'payload', 'result', 'error', 'attempts', 'revision', 'activeKey', 'credential']) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) task.set(key, patch[key]);
      }
      task.set('leaseUntil', new Date(now.getTime() + 240000).toISOString());
      if (patch.status && patch.status !== 'running') { task.set('lease', ''); task.set('leaseUntil', ''); }
    } else if (body.action === 'save_lesson') {
      if (status !== 'running' || task.getString('lease') !== body.lease || !leased || !task.getInt('revision') || task.getInt('approvedRevision') !== task.getInt('revision')) throw new BadRequestError('Approved lease required.');
      const payload = JSON.parse(task.getString('payload'));
      const plan = payload.plan;
      if (!plan || !plan.activities || !plan.activities.length) throw new BadRequestError('No approved plan.');
      const course = app.findRecordById('courses', task.getString('course'));
      if (course.getString('owner') !== task.getString('owner')) throw new ForbiddenError('Course ownership changed.');
      // Approval is tied to the cited versions and approved sections.
      for (const source of plan.sources || []) {
        const file = app.findRecordById('file_library', source.id);
        if (file.getString('owner') !== task.getString('owner') || file.getString('course') !== course.id || (file.getInt('version') || 1) !== source.version) throw new BadRequestError('Materi berubah. Batalkan draf ini dan susun ulang.');
        for (const id of source.sectionIds || []) {
          const section = app.findRecordById('context_sections', id);
          if (section.getString('file') !== file.id || section.getString('status') !== 'suitable' || (section.getInt('version') || 1) !== source.version) throw new BadRequestError('Persetujuan materi berubah. Batalkan draf ini dan susun ulang.');
        }
      }
      // The meeting document is the target; approval is a revision-checked update.
      let saved;
      if(payload.lessonPlanId && payload.sessionId){
        const session=app.findRecordById('class_sessions',payload.sessionId);
        saved=app.findRecordById('assistant_lesson_plans',payload.lessonPlanId);
        if(session.getString('course')!==course.id || session.getString('owner')!==task.getString('owner') || saved.getString('owner')!==task.getString('owner') || saved.getString('session')!==session.id)throw new ForbiddenError('Target pertemuan berubah.');
        if(saved.getInt('revision')!==payload.baseRevision)throw new BadRequestError('Rencana sudah diedit. Batalkan usulan ini dan susun ulang dari revisi terbaru.');
        saved.set('revision',saved.getInt('revision')+1);saved.set('lastEditor',task.getString('owner'));saved.set('status','draft');
      }else{
        try { saved=app.findFirstRecordByFilter('assistant_lesson_plans','task={:id}',{id:task.id}); }catch(_){saved=new Record(app.findCollectionByNameOrId('assistant_lesson_plans'));saved.set('owner',task.getString('owner'));saved.set('course',course.id);saved.set('revision',1);saved.set('status','draft');}
      }
      saved.set('task',task.id);saved.set('title',plan.title);saved.set('plan',plan);app.save(saved);
      const checked=app.findRecordById('assistant_lesson_plans',saved.id);
      if(JSON.stringify(JSON.parse(checked.getString('plan')))!==JSON.stringify(plan))throw new BadRequestError('Saved result mismatch.');
      const rev=new Record(app.findCollectionByNameOrId('lesson_plan_revisions'));rev.set('owner',task.getString('owner'));rev.set('lessonPlan',saved.id);rev.set('revision',saved.getInt('revision'));rev.set('origin','ai');rev.set('snapshot',{plan:plan,status:'draft',title:plan.title});app.save(rev);
      const steps = JSON.parse(task.getString('steps'));
      for (const step of steps) step.status = 'done';
      task.set('steps', steps); task.set('status', 'completed');
      task.set('result', { recordId: saved.id, link: payload.sessionId ? '/app/courses/'+course.id+'/pertemuan/'+payload.sessionId+'/rencana' : '/app/asisten?task='+task.id, verifiedAt: now.toISOString() });
      task.set('activeKey', ''); task.set('credential', ''); task.set('lease', ''); task.set('leaseUntil', '');
    } else if (body.action === 'cancel') {
      // A completed result remains completed; cancellation never deletes it.
      if (!['completed', 'cancelled'].includes(status)) {
        task.set('status', 'cancelled'); task.set('activeKey', ''); task.set('credential', ''); task.set('lease', ''); task.set('leaseUntil', '');
      }
    } else if (body.action === 'approve') {
      if (status !== 'awaiting_approval' || task.getInt('revision') !== body.revision) throw new BadRequestError('Draft changed.');
      task.set('approvedRevision', body.revision); task.set('status', 'queued'); task.set('credential', body.credential);
    } else if (body.action === 'resume') {
      if (!['failed', 'needs_auth'].includes(status)) throw new BadRequestError('Cannot resume this task.');
      task.set('status', 'queued'); task.set('credential', body.credential); task.set('error', ''); task.set('attempts', 0);
    } else throw new BadRequestError('Unknown transition.');
    app.save(task);
    // Append-only transition audit, without credentials, arguments or student answers.
    if (body.action !== 'checkpoint' || (body.patch && (body.patch.status || body.patch.steps))) {
      const event = new Record(app.findCollectionByNameOrId('agent_task_events'));
      event.set('owner', task.getString('owner')); event.set('task', task.id);
      event.set('action', body.action); event.set('status', task.getString('status')); event.set('revision', task.getInt('revision'));
      app.save(event);
    }
    result = body.action === 'claim' ? { ok: true, credential: task.getString('credential') } : { ok: true };
  });
  return e.json(200, result);
});

routerAdd('POST', '/api/assistant-actions/{id}/claim', (e) => {
  if (!e.auth || !e.auth.isSuperuser()) throw new ForbiddenError('Server only.');
  const owner = e.requestInfo().body.owner;
  e.app.runInTransaction((app) => {
    const message = app.findRecordById('assistant_messages', e.request.pathValue('id'));
    if (!owner || message.getString('owner') !== owner || message.getString('actionStatus') !== 'pending') throw new BadRequestError('Action already claimed.');
    message.set('actionStatus', 'confirmed'); app.save(message);
  });
  return e.json(200, { ok: true });
});
