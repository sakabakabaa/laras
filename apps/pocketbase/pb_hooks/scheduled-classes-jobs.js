// Re-read each class in its transaction. A failed class is retried on the next
// tick without preventing other classes from being finalized.
exports.recover = function (app) {
  try {app.findCollectionByNameOrId('scheduled_classes');} catch (_) {return;}
  const now = Date.now();
  const classes = app.findRecordsByFilter('scheduled_classes', 'status="scheduled" && startsAt <= {:now}', '', 0, 0, {now: new Date(now).toISOString()});
  for (const c of classes) {
    try {
      app.runInTransaction(tx => require(__hooks + '/scheduled-classes-service.js').reconcile(tx, tx.findRecordById('scheduled_classes', c.id), now));
    } catch (error) {console.error('Scheduled class finalization failed', c.id, String(error));}
  }
};
