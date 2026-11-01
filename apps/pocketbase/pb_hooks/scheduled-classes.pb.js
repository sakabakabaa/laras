/// <reference path="../pb_data/types.d.ts" />
routerAdd('GET', '/api/laras/scheduled-class-list', (e) => {
  if (!e.auth || e.auth.isSuperuser()) throw new ForbiddenError('Gunakan akun dosen.');
  e.response.header().set('Cache-Control', 'no-store');
  return e.json(200, {items:require(__hooks + '/scheduled-classes-service.js').list(e.app,e.auth,Date.now())});
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/laras/student-scheduled-classes', (e) => {
  if (!e.auth || e.auth.isSuperuser()) throw new ForbiddenError('Gunakan akun mahasiswa.');
  e.response.header().set('Cache-Control', 'no-store');
  const now=Date.now();
  return e.json(200, {serverNow:new Date(now).toISOString(),items:require(__hooks + '/scheduled-classes-service.js').studentList(e.app,e.auth,now)});
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/laras/scheduled-classes', (e) => {
  if (!e.auth || e.auth.isSuperuser()) throw new ForbiddenError('Gunakan akun dosen atau mahasiswa.');
  let result;
  e.app.runInTransaction(app => {
    result = require(__hooks + '/scheduled-classes-service.js').handle(app, e.requestInfo().body, e.auth, Date.now());
  });
  e.response.header().set('Cache-Control', 'no-store');
  return e.json(200, result);
}, $apis.requireAuth('users'), $apis.bodyLimit(2000000));

cronAdd('scheduled-class-finalization', '* * * * *', () => {
  require(__hooks + '/scheduled-classes-jobs.js').recover($app);
});
onBootstrap(e => {
  e.next();
  require(__hooks + '/scheduled-classes-jobs.js').recover(e.app);
});
