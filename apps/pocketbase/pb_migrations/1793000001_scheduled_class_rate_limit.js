// Classroom polling/autosaves from a campus NAT must not exhaust the generic
// 200 requests / 5 minutes IP bucket. Scope the larger bucket to this one
// authenticated endpoint, retaining existing authentication and other limits.
migrate(app => {
  const settings = app.settings();
  const label = 'POST /api/laras/scheduled-classes';
  if (!settings.rateLimits.rules.some(r => r.label === label)) {
    settings.rateLimits.rules = [...settings.rateLimits.rules, {label, audience: '@auth', duration: 300, maxRequests: 6000}];
    app.save(settings);
  }
}, app => {
  const settings = app.settings();
  settings.rateLimits.rules = settings.rateLimits.rules.filter(r => !(r.label === 'POST /api/laras/scheduled-classes' && r.audience === '@auth' && r.maxRequests === 6000));
  app.save(settings);
});
