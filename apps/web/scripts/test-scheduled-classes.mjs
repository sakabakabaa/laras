// Real PocketBase integration test. All data is synthetic and the target must
// be loopback. Set PB_TEST_BINARY to launch/restart an isolated backend, or
// PB_TEST_URL + PB_TEST_EMAIL + PB_TEST_PASSWORD for a disposable local backend.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binary = process.env.PB_TEST_BINARY;
const url = process.env.PB_TEST_URL || 'http://127.0.0.1:8098';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Use a disposable loopback backend only');
const email = process.env.PB_TEST_EMAIL || 'scheduled-test@example.com';
const password = process.env.PB_TEST_PASSWORD || randomUUID() + 'Aa1!';
const dataDir = resolve(root, 'work', 'scheduled-integration-' + Date.now());
let child, admin, assertions = 0, logs = '';
async function launch() {
  await mkdir(dataDir, {recursive: true});
  child = spawn(resolve(binary), ['serve', '--dev', '--http=127.0.0.1:' + new URL(url).port, '--dir=' + dataDir, '--migrationsDir=' + resolve(root, 'apps/pocketbase/pb_migrations'), '--hooksDir=' + resolve(root, 'apps/pocketbase/pb_hooks'), '--hooksWatch=false'], {env: {...process.env, NODE_ENV: 'test', PB_SUPERUSER_EMAIL: email, PB_SUPERUSER_PASSWORD: password}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.on('data', b => {logs += b;}); child.stderr.on('data', b => {logs += b;});
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('PocketBase exited: ' + logs);
    try {if ((await fetch(url + '/api/health')).ok) return;} catch { /* starting */ }
    await delay(300);
  }
  throw new Error('Backend did not become healthy: ' + logs);
}
async function stop() {if (!child || child.exitCode !== null) return; const exited = new Promise(r => child.once('exit', r)); child.kill(); await exited;}
async function api(path, body, token, method = 'POST') {
  const r = await fetch(url + path, {method, headers: {'Content-Type': 'application/json', ...(token ? {Authorization: token} : {})}, ...(method !== 'GET' ? {body: JSON.stringify(body)} : {})});
  const data = await r.json(); return {status: r.status, data};
}
async function ok(path, body, token = admin, method = 'POST') {const r = await api(path, body, token, method); assert.equal(r.status, 200, `${path}: ${JSON.stringify(r.data)}`); assertions++; return r.data;}
const records = name => '/api/collections/' + name + '/records';
async function create(name, fields) {return ok(records(name), fields);}
const stamp = randomUUID().slice(0, 8);
async function account(role, nim = '') {
  const identity = `${role}-${randomUUID()}@example.com`, pw = randomUUID() + 'Aa1!';
  const user = await create('users', {email: identity, password: pw, passwordConfirm: pw, name: role + '-' + stamp, role, nim, verified: true, mustChangePassword: false});
  const auth = await ok('/api/collections/users/auth-with-password', {identity, password: pw}, '');
  return {...user, token: auth.token};
}
try {
  if (binary) await launch();
  admin = (await ok('/api/collections/_superusers/auth-with-password', {identity: email, password}, '')).token;
  const teacher = await account('faculty'), otherTeacher = await account('faculty');
  const cohort = String(Date.now());
  const student = await account('student', cohort + '1'), second = await account('student', cohort + '2'), wrongClass = await account('student', cohort + '3'), outsider = await account('student', cohort + '4'), noShow = await account('student', cohort + '5');
  const course = await create('courses', {owner: teacher.id, title: 'Scheduled integration ' + stamp, code: 'SC' + stamp});
  const a = await create('course_sections', {course: course.id, owner: teacher.id, name: 'A'});
  const b = await create('course_sections', {course: course.id, owner: teacher.id, name: 'B'});
  const meeting = await create('class_sessions', {owner: teacher.id, course: course.id, title: 'Unattended lesson', week: 1, section: a.id});
  const roster = {};
  for (const [u, section] of [[student, a], [second, a], [wrongClass, b], [noShow, a]]) {
    roster[u.id] = await create('course_roster', {owner: teacher.id, course: course.id, name: u.name, nim: u.nim, section: section.id});
    await create('enrollments', {owner: u.id, course: course.id, section: section.id});
  }
  // New builder uses protected draft/key records; this exercise touches only the disposable backend.
  const rich = text => ({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
  const builderEnvelope = {document:{schemaVersion:1,kind:'kelas',context:{courseId:course.id,meetingId:meeting.id,sectionIds:[a.id]},title:'Builder integration draft',instructions:rich(''),activities:[{id:'activity1',title:'Draft',required:true,plannedMinutes:15,blocks:[{id:'block1',type:'question_group',questionIds:['question1']}]}],questionsById:{question1:{id:'question1',kind:'short_answer',prompt:rich('A prompt'),required:true,points:1}},delivery:{kind:'kelas',progression:'scheduled',timeZone:'Asia/Jakarta',lateAfterMinutes:10,allowLate:false,timeLimitMinutes:0},scoring:{mode:'points'},results:{release:'manual'}},privateKeys:{schemaVersion:1,answersByQuestionId:{question1:{strategy:'exact_text',accepted:['PRIVATE BUILDER KEY'],comparison:{ignoreCase:true,ignorePunctuation:false}}}}};
  const builderCall = (user,action,body={}) => api('/api/laras/builder',{action,...body},user?.token||'');
  const commandId=randomUUID();
  const draft = await ok('/api/laras/builder',{action:'create',commandId,...builderEnvelope},teacher.token);
  assert.equal(draft.revision,1);assert.equal(draft.privateKeys.answersByQuestionId.question1.accepted[0],'PRIVATE BUILDER KEY');assertions+=2;
  const replay=await ok('/api/laras/builder',{action:'create',commandId,...builderEnvelope},teacher.token);assert.equal(replay.id,draft.id);assertions++;
  for(const actor of [student,otherTeacher,null]){const response=await builderCall(actor,'get',{id:draft.id});assert(response.status>=400&&response.status<500);assert(!JSON.stringify(response).includes('PRIVATE BUILDER KEY'));assertions+=2;}
  const direct=await api(records('builder_documents')+'/'+draft.id,{},teacher.token,'GET');assert(direct.status>=400);assertions++;
  const changed=structuredClone(builderEnvelope);changed.document.title='Builder updated';
  const saveId=randomUUID(),saved=await ok('/api/laras/builder',{action:'save',id:draft.id,baseRevision:1,commandId:saveId,...changed},teacher.token);assert.equal(saved.revision,2);assertions++;
  const savedReplay=await ok('/api/laras/builder',{action:'save',id:draft.id,baseRevision:1,commandId:saveId,...changed},teacher.token);assert.equal(savedReplay.revision,2);assertions++;
  const conflict=await builderCall(teacher,'save',{id:draft.id,baseRevision:1,commandId:randomUUID(),...builderEnvelope});assert.equal(conflict.status,400);assertions++;
  const afterConflict=await ok('/api/laras/builder',{action:'get',id:draft.id},teacher.token);assert.equal(afterConflict.document.title,'Builder updated');assert.equal(afterConflict.privateKeys.answersByQuestionId.question1.accepted[0],'PRIVATE BUILDER KEY');assertions+=2;
  const listDrafts=await ok('/api/laras/builder',{action:'list',kind:'kelas'},teacher.token);assert(listDrafts.items.some(row=>row.id===draft.id));assert(!JSON.stringify(listDrafts).includes('PRIVATE BUILDER KEY'));assertions+=2;
  const endpoint = '/api/laras/scheduled-classes';
  const call = (user, action, body = {}) => ok(endpoint, {sessionId: meeting.id, action, ...body}, user.token);
  const denied = async (user, action, body = {}) => {const r = await api(endpoint, {sessionId: meeting.id, action, ...body}, user?.token || ''); assert(r.status >= 400 && r.status < 500, JSON.stringify(r)); assertions++;};
  const outcome=await create('cpmk',{owner:teacher.id,course:course.id,code:'CPMK1',description:'Construct a sentence.',order:1});
  const shared=await create('file_library',{owner:teacher.id,course:[course.id],title:'Student handout',access:'student',status:'ready',version:1});
  const privateFile=await create('file_library',{owner:teacher.id,course:[course.id],title:'PRIVATE FACULTY REFERENCE',access:'faculty',status:'ready',version:1});
  const foreign=await create('file_library',{owner:otherTeacher.id,course:[course.id],title:'Foreign',access:'faculty',status:'ready',version:1});
  const future = Date.now() + 3600000;
  let state = await call(teacher, 'savePlan', {baseRevision: 0, title: 'Scheduled class', startsAt: new Date(future).toISOString(), joinUntil: new Date(future + 120000).toISOString(), lateAfterMin: 10, activities: [
    {kind: 'material', title: 'Read', content: 'Private scheduled material', minutes: 1, required: true,materialIds:[shared.id,privateFile.id],cpmkIds:[outcome.id]},
    {kind: 'quiz', title: 'Quiz', minutes: 1, required: true, questions: [{text: 'Pick A', options: ['A', 'B'], correctIndex: 0, points: 1, explanation: 'Private explanation'}]},
    {kind: 'assignment', title: 'Write', content: 'Explain your reasoning.', minutes: 1, required: true},
    {kind: 'exit_ticket', title: 'Reflect', content: 'What did you learn?', minutes: 1, required: true},
  ]});
  await denied(student, 'state'); await denied(otherTeacher, 'state'); await denied(outsider, 'state'); await denied(wrongClass, 'state'); await denied(null, 'state');
  assert.deepEqual(state.activities[0].materialIds,[shared.id,privateFile.id]); assert.deepEqual(state.activities[0].cpmkIds,[outcome.id]); assert.equal(state.class.academicSnapshot.session.id,meeting.id); assertions+=3;
  await denied(teacher,'savePlan',{...state.class,baseRevision:1,activities:state.activities.map((a,i)=>i===0?{...a,materialIds:[foreign.id]}:a)});
  const classId = state.class.id;
  const listEndpoint = '/api/laras/scheduled-class-list';
  const lecturerList = await ok(listEndpoint, {}, teacher.token, 'GET');
  const listedClass = lecturerList.items.find(item => item.id === classId);
  assert.equal(listedClass.session, meeting.id); assert.equal(listedClass.course.id, course.id); assert.equal(listedClass.activityCount, 4); assertions += 3;
  assert.equal(listedClass.snapshot, undefined); assert.equal(listedClass.attempts, undefined); assertions += 2;
  assert(!(await ok(listEndpoint, {}, otherTeacher.token, 'GET')).items.some(item => item.id === classId)); assertions++;
  assert.equal((await api(listEndpoint, {}, student.token, 'GET')).status, 403); assertions++;
  const studentList='/api/laras/student-scheduled-classes';
  const availableClasses=await ok(studentList,{},student.token,'GET');
  assert.equal(availableClasses.items.length,1);assert.equal(availableClasses.items[0].sessionId,meeting.id);assert.equal(availableClasses.items[0].phase,'scheduled');assert.equal(availableClasses.items[0].checkedIn,false);assert(!JSON.stringify(availableClasses).includes('PRIVATE'));assertions+=5;
  assert.equal((await ok(studentList,{},wrongClass.token,'GET')).items.length,0);assert.equal((await ok(studentList,{},outsider.token,'GET')).items.length,0);assert.equal((await api(studentList,{},teacher.token,'GET')).status,403);assertions+=3;

  assert.equal((await api(listEndpoint, {}, '', 'GET')).status, 401); assertions++;

  await denied(student, 'schedule', {baseRevision: 1});
  state = await call(teacher, 'schedule', {...state.class, baseRevision: 1, activities: state.activities});
  let s = await call(student, 'state'); assert(!JSON.stringify(s).includes('Private')); assert(!JSON.stringify(s).includes(shared.id));assert(!s.class.academicSnapshot);assert(!s.activities[0].academic);assertions+=4;
  await denied(student, 'join');
  for (const name of ['scheduled_classes', 'scheduled_class_activities', 'scheduled_activity_attempts', 'scheduled_class_events']) {
    const r = await api(records(name), {}, student.token, 'GET'); assert(r.status !== 200 || r.data.items.length === 0); assertions++;
  }
  async function retime(offset) {const startsAt = Date.now() - offset; await ok(records('scheduled_classes') + '/' + classId, {startsAt: new Date(startsAt).toISOString(), endsAt: new Date(startsAt + 240000).toISOString(), joinUntil: new Date(startsAt + 239000).toISOString()}, admin, 'PATCH');}
  await retime(15000);
  s = await call(student, 'join'); const joined = s.participant.checkedInAt;
  const liveClasses=await ok(studentList,{},student.token,'GET');assert.equal(liveClasses.items[0].phase,'open');assert.equal(liveClasses.items[0].checkedIn,true);assertions+=2;
  const checkedInMark = (await ok(records('attendance') + '?filter=' + encodeURIComponent(`session="${meeting.id}" && roster="${roster[student.id].id}"`), {}, admin, 'GET')).items[0];
  assert.equal(checkedInMark.status, 'present'); assert.equal(checkedInMark.student, student.id); assertions += 2;
  assert.equal(s.activities[0].content, 'Private scheduled material'); assert(s.activities[1].questions?.length); assertions += 2;
  assert.equal(s.activities[0].sources.length,1);assert.equal(s.activities[0].sources[0].title,'Student handout');assert.equal(s.activities[0].academic,undefined);assert(!JSON.stringify(s).includes('PRIVATE FACULTY REFERENCE'));assertions+=4;
  await call(second, 'join');
  await ok(records('scheduled_classes') + '/' + classId, {joinUntil: new Date(Date.now() - 1000).toISOString()}, admin, 'PATCH');
  await denied(noShow, 'join');
  s = await call(student, 'join'); assert.equal(s.participant.checkedInAt, joined); assertions++;
  await denied(wrongClass, 'join'); await denied(outsider, 'join');
  const material = s.activities[0].id, quiz = s.activities[1].id, writing = s.activities[2].id, exit = s.activities[3].id;
  await call(second, 'saveAnswer', {activityId: quiz, baseRevision: 0, requestId: randomUUID(), answers: {q0: 0}});
  const requestId = randomUUID();
  s = await call(student, 'submit', {activityId: material, baseRevision: 0, requestId, answers: {acknowledged: true}});
  s = await call(student, 'submit', {activityId: material, baseRevision: 0, requestId, answers: {acknowledged: false}});
  assert.equal(s.attempts[0].revision, 1); assert.equal(s.attempts[0].complete, true); assertions += 2;
  assert.equal(s.attempts[0].answers.acknowledged, true); assert.equal(Array.isArray(s.attempts[0].answers), false); assertions += 2;
  await denied(student, 'saveAnswer', {activityId: material, baseRevision: 1, requestId: randomUUID(), answers: {acknowledged: false}});
  await retime(75000);
  s = await call(student, 'state'); assert(!JSON.stringify(s).includes('correctIndex')); assertions++;
  const quizRequest = {activityId: quiz, baseRevision: 0, requestId: randomUUID(), answers: {q0: 0, score: 999}};
  const race = await Promise.all([api(endpoint, {sessionId: meeting.id, action: 'saveAnswer', ...quizRequest}, student.token), api(endpoint, {sessionId: meeting.id, action: 'saveAnswer', ...quizRequest, requestId: randomUUID(), answers: {q0: 1}}, student.token)]);
  assert.equal(race.filter(r => r.status === 200).length, 1); assert.equal(race.filter(r => r.status === 400).length, 1); assertions += 2;
  s = await call(student, 'saveAnswer', {activityId: quiz, baseRevision: 1, requestId: randomUUID(), answers: {q0: 0}});
  assert.deepEqual(s.attempts.find(t => t.activity === quiz).answers, {q0: 0}); assertions++;
  assert.equal(s.attempts.find(t => t.activity === quiz).score, undefined); assertions++;
  await call(second, 'saveAnswer', {activityId: quiz, baseRevision: 1, requestId: randomUUID(), answers: {q0: 1}});
  s = await call(second, 'state'); assert(s.attempts.every(t => t.student === second.id)); assertions++;
  await retime(135000);
  s = await call(student, 'state'); assert.equal(s.attempts.find(t => t.activity === quiz).status, 'draft'); assertions++;
  s = await call(student, 'saveAnswer', {activityId: quiz, baseRevision: 2, requestId: randomUUID(), answers: {q0: 0}});
  // Earlier activities remain writable until the overall session ends.
  const savedQuiz = s.attempts.find(t => t.activity === quiz);
  await call(student, 'submit', {activityId: quiz, baseRevision: savedQuiz.revision, requestId: randomUUID(), answers: {q0: 0}});
  await call(student, 'submit', {activityId: writing, baseRevision: 0, requestId: randomUUID(), answers: {text: 'My explanation'}});
  await retime(195000);
  await call(student, 'saveAnswer', {activityId: exit, baseRevision: 0, requestId: randomUUID(), answers: {text: 'My reflection', feedback: 'More speaking practice, please.'}});
  // End while no student or lecturer is visiting the classroom.
  await retime(255000);
  if (binary) {await stop(); await launch();}
  else await call(teacher, 'state');
  const attempts = await ok(records('scheduled_activity_attempts') + '?filter=' + encodeURIComponent(`class="${classId}"`), {}, admin, 'GET');
  assert(attempts.items.every(t => t.status !== 'draft')); assertions++;
  await denied(second, 'saveAnswer', {activityId: quiz, baseRevision: 2, requestId: randomUUID(), answers: {q0: 0}});
  s = await call(student, 'state'); assert.equal(s.attempts.find(t => t.activity === exit).answers.feedback, 'More speaking practice, please.'); assertions++; assert.equal(s.class.phase, 'closed'); assert.equal(s.participant.checkedInAt, joined); assertions += 2;
  // Current upstream automatically reveals objective results once required work is complete.
  assert.equal(s.class.resultsReady, true); assert.equal(s.attempts.find(t => t.activity === quiz).score, 100); assertions += 2;
  state = await call(teacher, 'state'); assert.equal(state.report.find(r => r.student === student.id).suggestion, 'present'); assertions++;
  // Manual scheduled assessment remains separate from completion, quiz scores, and official gradebook.
  const writingAttempt = state.attempts.find(t => t.activity === writing && t.student === student.id);
  const exitAttempt = state.attempts.find(t => t.activity === exit && t.student === student.id);
  state = await call(teacher, 'saveGradingSettings', {activityId: writing, baseRevision: 0, mode: 'points', maxPoints: 10, criteria: []});
  assert.equal(state.gradingSettings.find(x => x.activity === writing).revision, 1); assertions++;
  state = await call(teacher, 'saveAssessment', {attemptId: writingAttempt.id, baseRevision: 0, attemptRevision: writingAttempt.revision, settingsRevision: 1, status: 'reviewed', points: 8, criterionScores: {}, feedback: 'Clear explanation.'});
  assert.equal(state.assessments.find(x => x.attempt === writingAttempt.id).points, 8); assertions++;
  let learner = await call(student, 'state'); assert.equal(learner.gradingSettings, undefined); assert.equal((learner.assessments || []).length, 0); assertions += 2;
  state = await call(teacher, 'publishAssessment', {attemptId: writingAttempt.id, baseRevision: 1, attemptRevision: writingAttempt.revision, settingsRevision: 1});
  assert.equal(state.assessments.find(x => x.attempt === writingAttempt.id).published.points, 8); assertions++;
  state = await call(teacher, 'publishAssessment', {attemptId: writingAttempt.id, baseRevision: 1, attemptRevision: writingAttempt.revision, settingsRevision: 1});
  assert.equal(state.assessments.find(x => x.attempt === writingAttempt.id).revision, 2); assertions++;
  learner = await call(student, 'state'); assert.equal(learner.assessments[0].feedback, 'Clear explanation.'); assert.equal(learner.assessments[0].publishedRevision, undefined); assertions += 2;
  await denied(student, 'saveAssessment', {attemptId: writingAttempt.id, baseRevision: 2, attemptRevision: writingAttempt.revision, settingsRevision: 1, status: 'reviewed', points: 0, criterionScores: {}, feedback: 'Unauthorized'});
  await denied(otherTeacher, 'publishAssessment', {attemptId: writingAttempt.id, baseRevision: 2, attemptRevision: writingAttempt.revision, settingsRevision: 1});
  const staleGrade = await api(endpoint, {sessionId: meeting.id, action: 'saveAssessment', attemptId: writingAttempt.id, baseRevision: 1, attemptRevision: writingAttempt.revision, settingsRevision: 1, status: 'draft', points: 2, criterionScores: {}, feedback: 'Stale'}, teacher.token);
  assert.equal(staleGrade.status, 400); assertions++;
  state = await call(teacher, 'saveAssessment', {attemptId: writingAttempt.id, baseRevision: 2, attemptRevision: writingAttempt.revision, settingsRevision: 1, status: 'draft', points: 6, criterionScores: {}, feedback: 'Private revision'});
  learner = await call(student, 'state'); assert.equal(learner.assessments[0].feedback, 'Clear explanation.'); assert.equal(learner.assessments[0].points, 8); assertions += 2;
  const draftPublish = await api(endpoint, {sessionId: meeting.id, action: 'publishAssessment', attemptId: writingAttempt.id, baseRevision: 3, attemptRevision: writingAttempt.revision, settingsRevision: 1}, teacher.token);
  assert.equal(draftPublish.status, 400); assertions++;
  state = await call(teacher, 'saveAssessment', {attemptId: writingAttempt.id, baseRevision: 3, attemptRevision: writingAttempt.revision, settingsRevision: 1, status: 'reviewed', points: 6, criterionScores: {}, feedback: 'Updated public feedback'});
  const stalePublish = await api(endpoint, {sessionId: meeting.id, action: 'publishAssessment', attemptId: writingAttempt.id, baseRevision: 1, attemptRevision: writingAttempt.revision, settingsRevision: 1}, teacher.token);
  assert.equal(stalePublish.status, 400); assertions++;
  learner = await call(student, 'state'); assert.equal(learner.assessments[0].feedback, 'Clear explanation.'); assertions++;
  state = await call(teacher, 'publishAssessment', {attemptId: writingAttempt.id, baseRevision: 4, attemptRevision: writingAttempt.revision, settingsRevision: 1});
  learner = await call(student, 'state'); assert.equal(learner.assessments[0].feedback, 'Updated public feedback'); assert.equal(learner.assessments[0].points, 6); assertions += 2;
  state = await call(teacher, 'saveGradingSettings', {activityId: exit, baseRevision: 0, mode: 'ungraded', maxPoints: 0, criteria: []});
  state = await call(teacher, 'saveAssessment', {attemptId: exitAttempt.id, baseRevision: 0, attemptRevision: exitAttempt.revision, settingsRevision: 1, status: 'reviewed', points: null, criterionScores: {}, feedback: 'Useful reflection.'});
  assert.equal(state.assessments.find(x => x.attempt === exitAttempt.id).points, null); assertions++;
  // Check-in records official attendance, independently of submitted work.
  assert.equal(state.report.find(r => r.student === student.id).attendance, 'present'); assertions++;
  assert.equal(state.report.find(r => r.roster === roster[noShow.id].id).attendance, 'absent'); assertions++;
  state = await call(teacher, 'state');
  const official = (await ok(records('attendance') + '?filter=' + encodeURIComponent(`session="${meeting.id}" && roster="${roster[student.id].id}"`), {}, admin, 'GET')).items[0];
  assert.equal(official.status, 'present'); assert.equal(official.student, student.id); assertions += 2;
  assert.equal(state.events.filter(e => e.action === 'attendance' && e.detail.roster === roster[student.id].id).length, 1); assertions++;
  await denied(teacher, 'markAttendance', {rosterId: roster[student.id].id, attendanceStatus: 'excused'});
  await denied(student, 'markAttendance', {rosterId: roster[student.id].id, attendanceStatus: 'present'});
  await call(teacher, 'release');
  s = await call(student, 'state'); assert.equal(s.attempts.find(t => t.activity === quiz).score, 100); assert.equal(s.activities[1].questions[0].correctIndex, 0); assertions += 2;
  await call(teacher, 'review');
  // More than the generic 200/5-minute bucket, on one shared IP, must work on
  // the classroom endpoint without weakening auth limits elsewhere.
  for (let i = 0; i < 210; i++) await call(student, 'state');
  const replacement = await create('class_sessions', {owner: teacher.id, course: course.id, title: 'Cancelled lesson', week: 2, section: a.id});
  const cancelled = await ok(endpoint, {sessionId: replacement.id, action: 'schedule', baseRevision: 0, title: 'Cancelled', startsAt: new Date(future).toISOString(), joinUntil: new Date(future + 30000).toISOString(), lateAfterMin: 5, activities: [{kind: 'material', title: 'Read', content: 'Read later', minutes: 1}]}, teacher.token);
  await ok(endpoint, {sessionId: replacement.id, action: 'cancel'}, teacher.token);
  const cancelledState = await ok(endpoint, {sessionId: replacement.id, action: 'state'}, student.token);
  assert.equal(cancelledState.class.phase, 'cancelled'); assert.equal(cancelledState.activities[0].content, undefined); assertions += 2;
  const blocked = await api(endpoint, {sessionId: replacement.id, action: 'join'}, student.token);
  assert.equal(blocked.status, 400); assertions++;
  assert(cancelled.class.id); assertions++;
  const worksheetMeeting = await create('class_sessions', {owner:teacher.id,course:course.id,title:'Structured worksheet',week:3,section:a.id});
  const sheetCall = (user,action,body={}) => ok(endpoint,{sessionId:worksheetMeeting.id,action,...body},user.token);
  let sheetState=await sheetCall(teacher,'schedule',{baseRevision:0,title:'Beim Arzt worksheet',startsAt:new Date(Date.now()+60000).toISOString(),joinUntil:new Date(Date.now()+90000).toISOString(),lateAfterMin:10,activities:[{kind:'assignment',title:'Matching and writing',minutes:2,required:true,content:'Answer each item.',worksheet:{items:[{id:'match',type:'select',prompt:'Choose A, B or C.',options:['A','B','C']},{id:'write',type:'text',prompt:'Write a sentence with müssen.'}]}}]});
  const worksheetClass=sheetState.class.id, worksheetActivity=sheetState.activities[0].id;
  const bilingual={goal:{de:'Schreiben Sie einen Satz.',id:'Tulis satu kalimat.'},steps:[{de:'Wählen Sie A.',id:'Pilih A.'}],scenes:[]};
  const initialStart=sheetState.class.startsAt;
  sheetState=await sheetCall(teacher,'amendContent',{baseRevision:1,activities:[{id:worksheetActivity,lesson:bilingual,translations:[{id:'match',deText:'Wählen Sie A, B oder C.',idText:'Pilih A, B atau C.'},{id:'write',deText:'Schreiben Sie einen Satz mit müssen.',idText:'Tulis kalimat dengan müssen.'}]}]});
  assert.equal(sheetState.class.revision,2);assert.equal(sheetState.class.startsAt,initialStart);assert.equal(sheetState.activities[0].id,worksheetActivity);assert.equal(sheetState.activities[0].lesson.goal.id,bilingual.goal.id);assert.equal(sheetState.activities[0].worksheet.items[0].translation,'Pilih A, B atau C.');assertions+=5;
  for(const actor of[student,otherTeacher]){const response=await api(endpoint,{sessionId:worksheetMeeting.id,action:'amendContent',baseRevision:2,activities:[{id:worksheetActivity,lesson:bilingual}]},actor.token);assert.equal(response.status,403);assertions++;}
  const staleAmend=await api(endpoint,{sessionId:worksheetMeeting.id,action:'amendContent',baseRevision:1,activities:[{id:worksheetActivity,lesson:bilingual}]},teacher.token);assert.equal(staleAmend.status,400);assertions++;
  const badSource=await api(endpoint,{sessionId:worksheetMeeting.id,action:'amendContent',baseRevision:2,activities:[{id:worksheetActivity,lesson:{...bilingual,source:{sourceMaterialId:shared.id,sourcePage:1,sourceLabel:'Foreign'}}}]},teacher.token);assert.equal(badSource.status,400);assertions++;
  const rollback=await api(endpoint,{sessionId:worksheetMeeting.id,action:'amendContent',baseRevision:2,activities:[{id:worksheetActivity,lesson:{...bilingual,goal:{de:'Rollback',id:'Rollback'}}},{id:state.activities[0].id,lesson:bilingual}]},teacher.token);assert.equal(rollback.status,403);assert.equal((await sheetCall(teacher,'state')).activities[0].lesson.goal.id,bilingual.goal.id);assertions+=2;

  assert.equal((await sheetCall(student,'state')).activities[0].worksheet,undefined);assert.equal((await sheetCall(student,'state')).activities[0].lesson,undefined);assertions+=2;
  await ok(records('scheduled_classes')+'/'+worksheetClass,{startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+119000).toISOString(),joinUntil:new Date(Date.now()+60000).toISOString()},admin,'PATCH');
  sheetState=await sheetCall(student,'join');assert.equal(sheetState.activities[0].worksheet.items.length,2);assert.equal(sheetState.activities[0].lesson.goal.de,bilingual.goal.de);assertions+=2;
  const startedAmend=await api(endpoint,{sessionId:worksheetMeeting.id,action:'amendContent',baseRevision:2,activities:[{id:worksheetActivity,lesson:bilingual}]},teacher.token);assert.equal(startedAmend.status,400);assertions++;

  sheetState=await sheetCall(student,'saveAnswer',{activityId:worksheetActivity,baseRevision:0,requestId:randomUUID(),answers:{responses:{match:'A'},text:'Spoofed completion'}});
  assert.equal(sheetState.attempts[0].complete,false);assert.equal(sheetState.attempts[0].answers.responses.match,'A');assertions+=2;
  const invalidSelection=await api(endpoint,{sessionId:worksheetMeeting.id,action:'saveAnswer',activityId:worksheetActivity,baseRevision:1,requestId:randomUUID(),answers:{responses:{match:'D'}}},student.token);assert.equal(invalidSelection.status,400);assertions++;
  if(binary){await stop();await launch();}
  sheetState=await sheetCall(student,'state');assert.equal(sheetState.attempts[0].answers.responses.match,'A');assertions++;
  sheetState=await sheetCall(student,'submit',{activityId:worksheetActivity,baseRevision:1,requestId:randomUUID(),answers:{responses:{match:'A',write:'Du musst Tee trinken.',unknown:'Injected'},text:'Ignore this'}});
  assert.equal(sheetState.attempts[0].complete,true);assert.equal(sheetState.attempts[0].answers.responses.unknown,undefined);assert(sheetState.attempts[0].answers.text.includes('Du musst Tee trinken.'));assertions+=3;
  const teacherSheet=await sheetCall(teacher,'state');assert.equal(teacherSheet.report.find(r=>r.student===student.id).suggestion,'present');assertions++;

  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2f8AAAAASUVORK5CYII=','base64');
  const privateForm=new FormData();privateForm.set('owner',teacher.id);privateForm.set('course',JSON.stringify([course.id]));privateForm.set('title','Private source retained in storage');privateForm.set('access','faculty');privateForm.set('status','ready');privateForm.set('restrictDownload','true');privateForm.set('file',new File([pixel],'private-source.png',{type:'image/png'}));
  const uploaded=await fetch(url+records('file_library'),{method:'POST',headers:{Authorization:admin},body:privateForm});assert.equal(uploaded.status,200,uploaded.status===200?'':await uploaded.text());const retained=await uploaded.json(),privateUrl=url+'/api/files/file_library/'+retained.id+'/'+retained.file;assertions++;
  for(const token of['',student.token,otherTeacher.token]){assert.equal((await fetch(privateUrl,{headers:token?{Authorization:token}:{}})).status,403);assertions++;}
  const ownerDownload=await fetch(privateUrl,{headers:{Authorization:teacher.token}});assert.equal(ownerDownload.status,200);assert.deepEqual(Buffer.from(await ownerDownload.arrayBuffer()),pixel);assertions+=3;
  const ownerCookie=encodeURIComponent(JSON.stringify({token:teacher.token,record:{id:teacher.id}}));assert.equal((await fetch(privateUrl,{headers:{Cookie:'pb_auth='+ownerCookie}})).status,200);assertions++;
  const forged=encodeURIComponent(JSON.stringify({token:student.token,record:{id:teacher.id,role:'faculty'}}));assert.equal((await fetch(privateUrl,{headers:{Cookie:'pb_auth='+forged}})).status,403);assertions++;
  assert.equal((await fetch(privateUrl,{headers:{Authorization:admin}})).status,200);assertions++;
  await ok(records('file_library')+'/'+retained.id,{restrictDownload:false,access:'student'},admin,'PATCH');assert.equal((await fetch(privateUrl)).status,200);assertions++;
  console.log(`Scheduled classroom integration passed (${assertions} checks, ${binary ? 'including backend restart recovery' : 'external local backend'}).`);
} catch (error) {await delay(300);console.error(logs.slice(-12000)); throw error;} finally {if (binary) await stop();}
