/// <reference path="../pb_data/types.d.ts" />
// No network calls in a transaction. All reads/writes use the transaction app.
routerAdd('POST', '/api/gradebook/commands', (e) => {
  const body = e.requestInfo().body || {};
  const isApproval = body.action === 'approve';
  if (!e.auth) throw new ForbiddenError('Faculty authentication required.');
  if (isApproval ? !e.auth.isSuperuser() : (e.auth.isSuperuser() || e.auth.getString('role') !== 'faculty')) throw new ForbiddenError(isApproval ? 'Server-only user-action approval.' : 'Faculty authentication required.');
  const owner = isApproval ? body.ownerId : e.auth.id;
  if (typeof owner !== 'string' || !owner) throw new ForbiddenError('Owner required.');
  const parse = (record, key, fallback) => { const s = record.getString(key); return s ? JSON.parse(s) : fallback; };
  const canonical = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  };
  const hash = value => $security.sha256(canonical(value));
  const text = (v, max) => typeof v === 'string' && v.length <= max;
  const readState = record => record ? { value: parse(record, 'value', null), note: record.getString('note'), chapters: parse(record, 'chapters', {}) || {} } : { value: null, note: '', chapters: {} };
  const same = (a, b) => canonical(a) === canonical(b);
  const find = (app, name, filter, params, limit) => app.findRecordsByFilter(name, filter, '', limit || 1000, 0, params || {});
  const entryFor = (app, componentId, studentId) => find(app, 'grade_entries', 'component={:c} && student={:s}', { c: componentId, s: studentId }, 2)[0] || null;
  const courseFor = (app, id) => {
    const course = app.findRecordById('courses', id);
    if (course.getString('owner') !== owner || app.findRecordById('users', owner).getString('role') !== 'faculty') throw new ForbiddenError('Course is not owned by this faculty user.');
    return course;
  };
  const scope = (app, courseId, componentId, studentId) => {
    courseFor(app, courseId);
    const component = app.findRecordById('grade_components', componentId);
    if (component.getString('course') !== courseId || component.getString('owner') !== owner) throw new ForbiddenError('Component is outside the owned course.');
    if (component.getString('status') !== 'active' || component.getString('kind') !== 'manual' || component.getString('assignment')) throw new BadRequestError('Assignment-linked or archived target is not manually editable.');
    const source = component.getString('sourceType');
    if (['attendance', 'tasks', 'uts', 'uas'].includes(source)) throw new BadRequestError('Computed target is read only.');
    const user = app.findRecordById('users', studentId);
    if (user.getString('role') !== 'student') throw new BadRequestError('Target must be a registered student.');
    const enrollments = find(app, 'enrollments', 'course={:c} && owner={:s}', { c: courseId, s: studentId }, 2);
    if (enrollments.length !== 1) throw new BadRequestError('Student is not uniquely enrolled in this course.');
    const enrollment = enrollments[0];
    const sectionId = enrollment.getString('section');
    let section = null;
    if (sectionId) { section = app.findRecordById('course_sections', sectionId); if (section.getString('course') !== courseId) throw new BadRequestError('Enrollment section is outside this course.'); }
    const nim = user.getString('nim').trim() || ((user.getString('email').toLowerCase().match(/^(\d+)@student\.upi\.edu$/) || [])[1] || '');
    const roster = nim ? find(app, 'course_roster', 'course={:c} && nim={:n}', { c: courseId, n: nim }, 2) : [];
    if (roster.length > 1 || (roster.length === 1 && roster[0].getString('section') !== sectionId)) throw new BadRequestError('Roster identity or section does not match enrollment.');
    const fields = ['owner', 'course', 'kind', 'assignment', 'sourceType', 'status', 'maxScore', 'bonusMax', 'weight', 'chapters', 'revision', 'updated'];
    const componentSnapshot = { id: component.id };
    for (const key of fields) componentSnapshot[key] = component.getString(key);
    return { component, baseline: { component: componentSnapshot, enrollment: { id: enrollment.id, section: sectionId, updated: enrollment.getString('updated') }, roster: roster.map(r => ({ id: r.id, section: r.getString('section'), updated: r.getString('updated') })), student: { id: user.id, nim, role: user.getString('role') }, section: section ? { id: section.id, course: section.getString('course'), updated: section.getString('updated') } : null } };
  };
  const normalize = (component, state, op) => {
    if (!op || typeof op !== 'object') throw new BadRequestError('Operation required.');
    const defs = parse(component, 'chapters', []) || [];
    const bonus = component.getString('sourceType') === 'bonus';
    const chapter = defs.length > 0;
    const allowed = chapter ? ['set_chapter', 'set_note'] : bonus ? ['adjust_bonus', 'set_note'] : ['set_score', 'clear_score', 'set_note'];
    if (!allowed.includes(op.op)) throw new BadRequestError('Wrong operation for target kind.');
    const after = JSON.parse(JSON.stringify(state));
    if (op.op === 'set_note') {
      if (!text(op.note, 500)) throw new BadRequestError('Note exceeds the persisted 500-character limit.');
      after.note = op.note;
    } else if (op.op === 'set_chapter') {
      if (!defs.some(d => d.id === op.chapterId) || !['done', 'partial', 'missing'].includes(op.status)) throw new BadRequestError('Invalid chapter or status.');
      after.chapters[op.chapterId] = op.status;
      let points = 0;
      for (const def of defs) points += after.chapters[def.id] === 'done' ? 1 : after.chapters[def.id] === 'partial' ? 0.5 : 0;
      after.value = Math.round(points / defs.length * (component.getFloat('maxScore') || 100));
    } else if (op.op === 'clear_score') after.value = null;
    else {
      const n = op.op === 'adjust_bonus' ? op.delta : op.score;
      if (typeof n !== 'number' || !Number.isFinite(n) || Math.round(n * 100) / 100 !== n) throw new BadRequestError('Finite score with at most two decimals required.');
      if (op.op === 'adjust_bonus' && Math.abs(n) > 100) throw new BadRequestError('Bonus delta is out of range.');
      const max = bonus ? component.getFloat('maxScore') || component.getFloat('bonusMax') || 5 : component.getFloat('maxScore') || 100;
      after.value = op.op === 'adjust_bonus' ? Math.round(((after.value || 0) + n) * 100) / 100 : n;
      if (after.value < 0 || after.value > max) throw new BadRequestError('Score is outside component bounds.');
    }
    return after;
  };
  const event = (app, proposal, action, snapshot) => {
    const record = new Record(app.findCollectionByNameOrId('grade_change_events'));
    record.set('owner', owner); record.set('course', proposal.getString('course')); record.set('changeSet', proposal.id);
    record.set('action', action); record.set('source', proposal.getString('source')); record.set('actor', owner); record.set('operationKey', proposal.getString('operationKey')); record.set('snapshot', snapshot); app.save(record);
  };
  const output = record => ({ id: record.id, course: record.getString('course'), revision: record.getInt('revision'), payloadHash: record.getString('payloadHash'), status: record.getString('status'), items: parse(record, 'payload', {}).items || [], result: parse(record, 'result', null) });
  const createProposal = (app, courseId, operationKey, source, inputs, reverts, restores) => {
    courseFor(app, courseId);
    if (!text(operationKey, 160) || operationKey.length < 8 || !['ui', 'assistant_input', 'import'].includes(source)) throw new BadRequestError('Valid durable operation key and source required.');
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 2000) throw new BadRequestError('Between 1 and 2000 input operations required.');
    const requestHash = hash({ courseId, source, inputs, reverts: reverts || '' });
    const existing = find(app, 'grade_change_sets', 'owner={:o} && operationKey={:k}', { o: owner, k: operationKey }, 1)[0];
    if (existing) { if (existing.getString('requestHash') !== requestHash) throw new BadRequestError('Operation key already used for different input.'); return existing; }
    const items = [], pairs = {};
    for (const input of inputs) {
      if (!input || typeof input.componentId !== 'string' || typeof input.studentId !== 'string') throw new BadRequestError('Explicit component and registered student IDs required.');
      const key = input.componentId + ':' + input.studentId;
      let item = pairs[key];
      if (!item) {
        const checked = scope(app, courseId, input.componentId, input.studentId);
        const entry = entryFor(app, input.componentId, input.studentId);
        if (entry && entry.getString('owner') !== owner) throw new ForbiddenError('Entry owner mismatch.');
        item = { componentId: input.componentId, studentId: input.studentId, operations: [], before: readState(entry), after: readState(entry), expected: entry ? { id: entry.id, revision: entry.getInt('revision'), updated: entry.getString('updated') } : null, baseline: checked.baseline };
        pairs[key] = item; items.push(item);
      }
      const target = input.operation && input.operation.op + ':' + (input.operation.chapterId || '');
      const duplicate = item.operations.find(op => op.op + ':' + (op.chapterId || '') === target);
      if (duplicate) { if (!same(duplicate, input.operation)) throw new BadRequestError('Conflicting duplicate operations.'); continue; }
      const component = app.findRecordById('grade_components', input.componentId);
      item.after = normalize(component, item.after, input.operation); item.operations.push(input.operation);
    }
    if (items.length > 200) throw new BadRequestError('At most 200 changed cells per approved proposal.');
    if (restores) items.forEach((item, index) => {
      const original = restores[index];
      if (!original || item.componentId !== original.componentId || item.studentId !== original.studentId) throw new BadRequestError('Invalid inverse source.');
      item.after = original.before; item.restore = true; item.removeEntry = !original.expected;
    });
    const payload = { courseId, owner, source, items, reverts: reverts || '' };
    const proposal = new Record(app.findCollectionByNameOrId('grade_change_sets'));
    proposal.set('owner', owner); proposal.set('course', courseId); proposal.set('operationKey', operationKey); proposal.set('requestHash', requestHash);
    proposal.set('revision', 1); proposal.set('payload', payload); proposal.set('payloadHash', hash(payload)); proposal.set('status', 'awaiting_approval');
    proposal.set('source', source); proposal.set('reverts', reverts || ''); proposal.set('expiresAt', new Date(Date.now() + 86400000).toISOString()); app.save(proposal);
    items.forEach((item, index) => { const row = new Record(app.findCollectionByNameOrId('grade_change_items')); row.set('owner', owner); row.set('changeSet', proposal.id); row.set('position', index + 1); row.set('snapshot', item); app.save(row); });
    event(app, proposal, 'prepared', { revision: 1, payloadHash: proposal.getString('payloadHash'), items });
    return proposal;
  };
  let result;
  e.app.runInTransaction((app) => {
    if (body.action === 'prepare') { result = output(createProposal(app, body.courseId, body.operationKey, body.source || 'ui', body.items)); return; }
    const proposal = app.findRecordById('grade_change_sets', body.proposalId);
    if (proposal.getString('owner') !== owner) throw new ForbiddenError('Proposal is outside your scope.');
    courseFor(app, proposal.getString('course'));
    const payload = parse(proposal, 'payload', {});
    if (hash(payload) !== proposal.getString('payloadHash')) throw new BadRequestError('Persisted proposal hash mismatch.');
    const rows = find(app, 'grade_change_items', 'changeSet={:id}', { id: proposal.id }, 201).sort((a,b) => a.getInt('position') - b.getInt('position'));
    if (!same(rows.map(r => parse(r, 'snapshot', {})), payload.items)) throw new BadRequestError('Persisted proposal items mismatch.');
    if (['approve', 'apply', 'reject'].includes(body.action) && (body.revision !== proposal.getInt('revision') || body.payloadHash !== proposal.getString('payloadHash'))) throw new BadRequestError('Reviewed proposal revision/hash changed.');
    const status = proposal.getString('status');
    const committed = ['committed', 'verified', 'committed_unverified'].includes(status);
    if (body.action === 'reconcile' || (body.action === 'apply' && committed)) {
      if (!committed && ['awaiting_approval', 'approved'].includes(status) && Date.parse(proposal.getString('expiresAt')) <= Date.now()) { proposal.set('status', 'expired'); app.save(proposal); event(app, proposal, 'expired', {}); }
      if (committed) {
        const saved = parse(proposal, 'result', {});
        const matches = payload.items.every((item, index) => {
          const actual = entryFor(app, item.componentId, item.studentId);
          const target = (saved.entries || [])[index];
          return item.removeEntry ? !actual && target && target.deleted === true : actual && target && actual.id === target.id && actual.getInt('revision') === target.revision && same(readState(actual), item.after);
        });
        // Later edits are reported as drift, never replayed as a second write.
        if (status !== 'verified') { proposal.set('status', matches ? 'verified' : 'committed_unverified'); if (matches) { saved.verifiedAt = new Date().toISOString(); proposal.set('result', saved); } app.save(proposal); event(app, proposal, matches ? 'verified' : 'verification_mismatch', { payloadHash: proposal.getString('payloadHash') }); }
      }
      result = output(proposal); return;
    }
    if (body.action === 'revert') {
      if (!committed) throw new BadRequestError('Only committed operations can be reverted.');
      const existing = find(app, 'grade_change_sets', 'owner={:o} && operationKey={:k}', { o: owner, k: body.operationKey }, 1)[0];
      if (existing) { if (existing.getString('reverts') !== proposal.id) throw new BadRequestError('Operation key already used for different input.'); result = output(existing); return; }
      const inputs = [];
      for (let i = 0; i < payload.items.length; i++) {
        const item = payload.items[i], entry = entryFor(app, item.componentId, item.studentId);
        const written = (parse(proposal, 'result', {}).entries || [])[i];
        if (item.removeEntry ? !!entry || !written || written.deleted !== true : !entry || !written || entry.id !== written.id || entry.getInt('revision') !== written.revision || !same(readState(entry), item.after)) throw new BadRequestError('Intervening edits conflict with revert.');
        // Only the server creates inverse snapshots. A note operation establishes
        // scope/baseline; restoration itself is bound to the immutable source.
        inputs.push({ componentId: item.componentId, studentId: item.studentId, operation: { op: 'set_note', note: item.before.note } });
      }
      result = output(createProposal(app, proposal.getString('course'), body.operationKey, 'ui', inputs, proposal.id, payload.items)); return;
    }
    if (!['approve', 'apply', 'reject'].includes(body.action)) throw new BadRequestError('Unknown gradebook command.');
    if (body.revision !== proposal.getInt('revision') || body.payloadHash !== proposal.getString('payloadHash')) throw new BadRequestError('Reviewed proposal revision/hash changed.');
    if (body.action === 'reject') {
      if (committed) throw new BadRequestError('Committed grades cannot be rejected; prepare a guarded revert.');
      if (status !== 'rejected') { proposal.set('status', 'rejected'); app.save(proposal); event(app, proposal, 'rejected', { revision: body.revision, payloadHash: body.payloadHash }); }
      result = output(proposal); return;
    }
    if (['awaiting_approval', 'approved'].includes(status) && Date.parse(proposal.getString('expiresAt')) <= Date.now()) { proposal.set('status', 'expired'); app.save(proposal); event(app, proposal, 'expired', {}); result = output(proposal); return; }
    if (body.action === 'approve') {
      if (status === 'approved') { result = output(proposal); return; }
      if (status !== 'awaiting_approval') throw new BadRequestError('Proposal cannot be approved.');
      proposal.set('approvedBy', owner); proposal.set('approvedAt', new Date().toISOString()); proposal.set('approvedRevision', body.revision); proposal.set('approvedHash', body.payloadHash); proposal.set('status', 'approved'); app.save(proposal);
      event(app, proposal, 'approved', { revision: body.revision, payloadHash: body.payloadHash }); result = output(proposal); return;
    }
    if (status !== 'approved' || proposal.getInt('approvedRevision') !== proposal.getInt('revision') || proposal.getString('approvedHash') !== proposal.getString('payloadHash') || proposal.getString('approvedBy') !== owner) throw new BadRequestError('Exact persisted user approval required.');
    // Validate EVERY target before any grade mutation, then recheck in the same transaction.
    try {
    for (const item of payload.items) {
      const checked = scope(app, proposal.getString('course'), item.componentId, item.studentId);
      const current = entryFor(app, item.componentId, item.studentId);
      if (!same(checked.baseline, item.baseline) || (item.expected ? !current || current.id !== item.expected.id || current.getInt('revision') !== item.expected.revision || current.getString('updated') !== item.expected.updated || !same(readState(current), item.before) : !!current)) throw new BadRequestError('Stale proposal: component, roster, or grade changed. Prepare a new proposal.');
      if (item.restore) {
        if (!payload.reverts) throw new BadRequestError('Inverse source required.');
        const originalProposal = app.findRecordById('grade_change_sets', payload.reverts);
        if (originalProposal.getString('owner') !== owner || !['committed', 'verified', 'committed_unverified'].includes(originalProposal.getString('status'))) throw new ForbiddenError('Invalid inverse source.');
        const source = parse(originalProposal, 'payload', {}).items.find(row => row.componentId === item.componentId && row.studentId === item.studentId);
        if (!source || !same(source.before, item.after) || item.removeEntry !== !source.expected) throw new BadRequestError('Inverse snapshot changed.');
      } else {
        let after = item.before;
        for (const op of item.operations) after = normalize(checked.component, after, op);
        if (!same(after, item.after)) throw new BadRequestError('Proposal normalization mismatch.');
      }
    }
    } catch (_) {
      proposal.set('status', 'conflicted'); proposal.set('result', { conflicts: ['Component, enrollment, roster or grade inputs changed. Prepare and approve a new proposal.'] }); app.save(proposal);
      event(app, proposal, 'conflicted', { revision: proposal.getInt('revision'), payloadHash: proposal.getString('payloadHash') }); result = output(proposal); return;
    }
    const entries = [];
    for (const item of payload.items) {
      const record = entryFor(app, item.componentId, item.studentId) || new Record(app.findCollectionByNameOrId('grade_entries'));
      if (item.removeEntry) { record.set('_gradeCommandDelete', true); app.delete(record); entries.push({ id: record.id, componentId: item.componentId, studentId: item.studentId, revision: 0, deleted: true }); continue; }
      record.set('owner', owner); record.set('component', item.componentId); record.set('student', item.studentId); record.set('source', 'manual');
      record.set('value', item.after.value); record.set('note', item.after.note); record.set('chapters', item.after.chapters); app.save(record);
      entries.push({ id: record.id, componentId: item.componentId, studentId: item.studentId, revision: record.getInt('revision') });
    }
    proposal.set('status', 'committed_unverified'); proposal.set('result', { entries }); app.save(proposal);
    event(app, proposal, 'committed', { revision: proposal.getInt('revision'), payloadHash: proposal.getString('payloadHash'), items: payload.items, entries });
    result = output(proposal);
  });
  // Independent post-commit read-back. A failed response/read never causes a
  // retry with new writes; the committed ledger is sufficient for reconcile.
  if (body.action === 'apply' && result.status === 'committed_unverified') {
    try {
      e.app.runInTransaction(app => {
        const proposal = app.findRecordById('grade_change_sets', result.id);
        const payload = parse(proposal, 'payload', {}), saved = parse(proposal, 'result', {});
        const matches = payload.items.every((item, index) => {
          const actual = entryFor(app, item.componentId, item.studentId), target = (saved.entries || [])[index];
          return item.removeEntry ? !actual && target && target.deleted === true : actual && target && actual.id === target.id && actual.getInt('revision') === target.revision && same(readState(actual), item.after);
        });
        if (!matches) return;
        proposal.set('status', 'verified'); saved.verifiedAt = new Date().toISOString(); proposal.set('result', saved); app.save(proposal);
        event(app, proposal, 'verified', { entries: saved.entries }); result = output(proposal);
      });
    } catch (_) { /* Keep committed_unverified; reconciliation is safe. */ }
  }
  return e.json(200, result);
});

// SDK mutations cannot claim approval or bypass the transaction ledger. These
// hooks run for superusers too; internal transaction app.save is not a request.
onRecordCreateRequest(e => { throw new ForbiddenError('Use gradebook commands.'); }, 'grade_entries', 'grade_change_sets', 'grade_change_items', 'grade_change_events');
onRecordUpdateRequest(e => { throw new ForbiddenError('Use gradebook commands.'); }, 'grade_entries', 'grade_change_sets', 'grade_change_items', 'grade_change_events');
onRecordDeleteRequest(e => { throw new ForbiddenError('Grade history cannot be deleted through the API.'); }, 'grade_entries', 'grade_change_sets', 'grade_change_items', 'grade_change_events');
onRecordUpdate(e => { throw new ForbiddenError('Grade audit and proposal items are immutable.'); }, 'grade_change_items', 'grade_change_events');
onRecordDelete(e => { throw new ForbiddenError('Grade audit and proposal items are immutable.'); }, 'grade_change_items', 'grade_change_events');
onRecordDelete(e => {
  // Transient, non-schema marker is set only on the in-memory record by the
  // approved inverse transaction. SDK entry mutations are always blocked.
  if (e.record.get('_gradeCommandDelete') !== true) throw new ForbiddenError('Grade deletion requires a guarded revert; archive the parent instead.');
  e.next();
}, 'grade_entries');

onRecordCreate(e => {
  const r = e.record;
  const c = e.app.findRecordById('grade_components', r.getString('component'));
  const course = e.app.findRecordById('courses', c.getString('course'));
  if (r.getString('owner') !== course.getString('owner') || c.getString('owner') !== course.getString('owner')) throw new ForbiddenError('Grade ownership mismatch.');
  if (c.getString('kind') !== 'manual' || c.getString('assignment') || c.getString('status') !== 'active' || ['attendance','tasks','uts','uas'].includes(c.getString('sourceType'))) throw new BadRequestError('Target is not manually editable.');
  const student = e.app.findRecordById('users', r.getString('student'));
  const members = e.app.findRecordsByFilter('enrollments', 'course={:c} && owner={:s}', '', 2, 0, { c: course.id, s: student.id });
  if (student.getString('role') !== 'student' || members.length !== 1) throw new BadRequestError('Enrolled student required.');
  const raw = r.getString('value'); const value = raw ? JSON.parse(raw) : null;
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (c.getFloat('maxScore') || (c.getString('sourceType') === 'bonus' ? c.getFloat('bonusMax') || 5 : 100)) || Math.round(value*100)/100 !== value)) throw new BadRequestError('Invalid bounded score.');
  if (r.getString('source') !== 'manual') throw new BadRequestError('Manual provenance required.');
  const defs = c.getString('chapters') ? JSON.parse(c.getString('chapters')) || [] : [];
  const map = r.getString('chapters') ? JSON.parse(r.getString('chapters')) || {} : {};
  if (Object.keys(map).some(k => !defs.some(d=>d.id===k) || !['done','partial','missing'].includes(map[k]))) throw new BadRequestError('Invalid chapter map.');
  if (defs.length && !(value === null && Object.keys(map).length === 0)) { let sum=0; for (const d of defs) sum += map[d.id]==='done'?1:map[d.id]==='partial'?0.5:0; if(value!==Math.round(sum/defs.length*(c.getFloat('maxScore')||100)))throw new BadRequestError('Chapter score must be derived.'); }
  r.set('revision', 1); e.next();
}, 'grade_entries');
onRecordUpdate(e => {
  const r=e.record, before=r.original();
  if (['owner','component','student'].some(k=>r.getString(k)!==before.getString(k))) throw new ForbiddenError('Grade identity is immutable.');
  const c=e.app.findRecordById('grade_components',r.getString('component'));
  if(c.getString('owner')!==r.getString('owner') || e.app.findRecordById('courses',c.getString('course')).getString('owner')!==r.getString('owner'))throw new ForbiddenError('Grade ownership mismatch.');
  if(c.getString('kind')!=='manual'||c.getString('assignment')||c.getString('status')!=='active'||['attendance','tasks','uts','uas'].includes(c.getString('sourceType')))throw new BadRequestError('Target is not manually editable.');
  const members=e.app.findRecordsByFilter('enrollments','course={:c} && owner={:s}','',2,0,{c:c.getString('course'),s:r.getString('student')});
  if(members.length!==1||e.app.findRecordById('users',r.getString('student')).getString('role')!=='student')throw new BadRequestError('Enrolled student required.');
  const value=r.getString('value')?JSON.parse(r.getString('value')):null;
  if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>(c.getFloat('maxScore')||(c.getString('sourceType')==='bonus'?c.getFloat('bonusMax')||5:100))||Math.round(value*100)/100!==value))throw new BadRequestError('Invalid bounded score.');
  if(r.getString('source')!=='manual')throw new BadRequestError('Manual provenance required.');
  const defs=c.getString('chapters')?JSON.parse(c.getString('chapters'))||[]:[], map=r.getString('chapters')?JSON.parse(r.getString('chapters'))||{}:{};
  if(Object.keys(map).some(k=>!defs.some(d=>d.id===k)||!['done','partial','missing'].includes(map[k])))throw new BadRequestError('Invalid chapter map.');
  if(defs.length&&!(value===null&&Object.keys(map).length===0)){let sum=0;for(const d of defs)sum+=map[d.id]==='done'?1:map[d.id]==='partial'?0.5:0;if(value!==Math.round(sum/defs.length*(c.getFloat('maxScore')||100)))throw new BadRequestError('Chapter score must be derived.');}
  r.set('revision',before.getInt('revision')+1);e.next();
},'grade_entries');
onRecordCreate(e=>{
  const r=e.record, course=e.app.findRecordById('courses',r.getString('course'));
  if(course.getString('owner')!==r.getString('owner')||e.app.findRecordById('users',r.getString('owner')).getString('role')!=='faculty')throw new ForbiddenError('Course ownership required.');
  if(r.collection().name==='grade_components') {
    const assignmentId=r.getString('assignment');
    if(assignmentId){const a=e.app.findRecordById('assignments',assignmentId);if(r.getString('kind')!=='assignment'||a.getString('owner')!==r.getString('owner')||a.getString('course')!==course.id)throw new BadRequestError('Assignment must belong to the same owned course.');}
    if(r.getString('kind')==='assignment'&&!assignmentId)throw new BadRequestError('Assignment-linked component requires an assignment.');
  } else {
    const student=e.app.findRecordById('users',r.getString('student'));
    const members=e.app.findRecordsByFilter('enrollments','course={:c} && owner={:s}','',2,0,{c:course.id,s:student.id});
    if(student.getString('role')!=='student'||members.length!==1)throw new BadRequestError('Enrolled student required for final override.');
  }
  r.set('revision',1);e.next();
},'grade_components','grade_overrides');
onRecordUpdate(e=>{
  const r=e.record,before=r.original();
  if(['owner','course'].some(k=>r.getString(k)!==before.getString(k))||e.app.findRecordById('courses',r.getString('course')).getString('owner')!==r.getString('owner'))throw new ForbiddenError('Grade ownership is immutable.');
  if(r.collection().name==='grade_overrides') {
    if(r.getString('student')!==before.getString('student'))throw new ForbiddenError('Override student is immutable.');
    const student=e.app.findRecordById('users',r.getString('student'));
    const members=e.app.findRecordsByFilter('enrollments','course={:c} && owner={:s}','',2,0,{c:r.getString('course'),s:student.id});
    if(student.getString('role')!=='student'||members.length!==1)throw new BadRequestError('Enrolled student required for final override.');
  } else {
    const assignmentId=r.getString('assignment');
    if(assignmentId){const a=e.app.findRecordById('assignments',assignmentId);if(r.getString('kind')!=='assignment'||a.getString('owner')!==r.getString('owner')||a.getString('course')!==r.getString('course'))throw new BadRequestError('Assignment must belong to the same owned course.');}
    if(r.getString('kind')==='assignment'&&!assignmentId)throw new BadRequestError('Assignment-linked component requires an assignment.');
  }
  r.set('revision',before.getInt('revision')+1);e.next();
},'grade_components','grade_overrides');
