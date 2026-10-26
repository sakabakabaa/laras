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
  assert.equal(s.activities[0].content, 'Private scheduled material'); assert(!s.activities[1].questions); assertions += 2;
  assert.equal(s.activities[0].sources.length,1);assert.equal(s.activities[0].sources[0].title,'Student handout');assert.equal(s.activities[0].academic.cpmks[0].id,outcome.id);assert(!JSON.stringify(s).includes('PRIVATE FACULTY REFERENCE'));assertions+=4;
  await call(second, 'join');
  await ok(records('scheduled_classes') + '/' + classId, {joinUntil: new Date(Date.now() - 1000).toISOString()}, admin, 'PATCH');
  await denied(noShow, 'join');
  s = await call(student, 'join'); assert.equal(s.participant.checkedInAt, joined); assertions++;
  await denied(wrongClass, 'join'); await denied(outsider, 'join');
  const material = s.activities[0].id, quiz = s.activities[1].id, writing = s.activities[2].id, exit = s.activities[3].id;
  await denied(student, 'saveAnswer', {activityId: quiz, baseRevision: 0, requestId: randomUUID(), answers: {q0: 0}});
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
  await call(second, 'saveAnswer', {activityId: quiz, baseRevision: 0, requestId: randomUUID(), answers: {q0: 1}});
  s = await call(second, 'state'); assert(s.attempts.every(t => t.student === second.id)); assertions++;
  await retime(135000);
  s = await call(student, 'state'); assert.equal(s.attempts.find(t => t.activity === quiz).status, 'expired'); assertions++;
  await denied(student, 'saveAnswer', {activityId: quiz, baseRevision: 2, requestId: randomUUID(), answers: {q0: 1}});
  // A lost acknowledgement for an accepted draft can be retried after expiry.
  const savedQuiz = s.attempts.find(t => t.activity === quiz);
  await call(student, 'submit', {activityId: quiz, baseRevision: savedQuiz.revision, requestId: randomUUID(), answers: {q0: 1}});
  await call(student, 'submit', {activityId: writing, baseRevision: 0, requestId: randomUUID(), answers: {text: 'My explanation'}});
  await retime(195000);
  await call(student, 'saveAnswer', {activityId: exit, baseRevision: 0, requestId: randomUUID(), answers: {text: 'My reflection'}});
  // End while no student or lecturer is visiting the classroom.
  await retime(255000);
  if (binary) {await stop(); await launch();}
  else await call(teacher, 'state');
  const attempts = await ok(records('scheduled_activity_attempts') + '?filter=' + encodeURIComponent(`class="${classId}"`), {}, admin, 'GET');
  assert(attempts.items.every(t => t.status !== 'draft')); assertions++;
  s = await call(student, 'state'); assert.equal(s.class.phase, 'closed'); assert.equal(s.participant.checkedInAt, joined); assertions += 2;
  assert(s.attempts.every(t => t.score === undefined)); assertions++;
  state = await call(teacher, 'state'); assert.equal(state.report.find(r => r.student === student.id).suggestion, 'present'); assertions++;
  // Nothing has silently written official attendance or official grades.
  assert.equal((await ok(records('attendance') + '?filter=' + encodeURIComponent(`session="${meeting.id}"`), {}, admin, 'GET')).totalItems, 0); assertions++;
  await call(teacher, 'markAttendance', {rosterId: roster[student.id].id, attendanceStatus: 'excused'});
  state = await call(teacher, 'state');
  assert.equal(state.events.find(e => e.action === 'attendance').detail.status, 'excused'); assertions++;
  const official = (await ok(records('attendance') + '?filter=' + encodeURIComponent(`session="${meeting.id}"`), {}, admin, 'GET')).items[0];
  assert.equal(official.status, 'excused'); assert.equal(official.student, student.id); assertions += 2;
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
  console.log(`Scheduled classroom integration passed (${assertions} checks, ${binary ? 'including backend restart recovery' : 'external local backend'}).`);
} catch (error) {console.error(logs.slice(-6000)); throw error;} finally {if (binary) await stop();}
