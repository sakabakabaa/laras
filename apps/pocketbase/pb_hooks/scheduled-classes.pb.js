/// <reference path="../pb_data/types.d.ts" />
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
