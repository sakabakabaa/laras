/// <reference path="../pb_data/types.d.ts" />
// Working grades, proposals, and immutable provenance. Never backfill approval.
migrate((app) => {
  const users = app.findCollectionByNameOrId('users');
  const courses = app.findCollectionByNameOrId('courses');
  const rel = (name, collectionId) => ({ name, type: 'relation', collectionId, required: true, maxSelect: 1, cascadeDelete: false });
  const dates = () => [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }, { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
  const privateRules = { listRule: '@request.auth.id != "" && owner = @request.auth.id', viewRule: '@request.auth.id != "" && owner = @request.auth.id', createRule: null, updateRule: null, deleteRule: null };
  const sets = new Collection({ name: 'grade_change_sets', type: 'base', ...privateRules, fields: [
    rel('owner', users.id), rel('course', courses.id),
    {type:'text', name: 'operationKey', required: true, max: 160 },
    {type:'text', name: 'requestHash', required: true, max: 64 },
    {type:'text', name: 'payloadHash', required: true, max: 64 },
    {type:'number', name: 'revision', required: true, onlyInt: true, min: 1 },
    {type:'select', name: 'status', required: true, maxSelect: 1, values: ['awaiting_approval', 'approved', 'committed', 'verified', 'committed_unverified', 'conflicted', 'expired', 'rejected', 'cancelled'] },
    {type:'select', name: 'source', required: true, maxSelect: 1, values: ['ui', 'assistant_input', 'import'] },
    {type:'json', name: 'payload', required: true, maxSize: 2000000 },
    {type:'json', name: 'result', maxSize: 1000000 },
    {type:'date', name: 'expiresAt', required: true },
    {type:'text', name: 'approvedBy', max: 40 }, {type:'date', name: 'approvedAt' },
    {type:'number', name: 'approvedRevision', onlyInt: true, min: 0 }, {type:'text', name: 'approvedHash', max: 64 },
    {type:'text', name: 'reverts', max: 40 }, ...dates(),
  ], indexes: ['CREATE UNIQUE INDEX idx_grade_change_operation ON grade_change_sets (owner, operationKey)', 'CREATE INDEX idx_grade_changes_course ON grade_change_sets (course, created)'] });
  app.save(sets);
  app.save(new Collection({ name: 'grade_change_items', type: 'base', ...privateRules, fields: [
    rel('owner', users.id), rel('changeSet', sets.id),
    {type:'number', name: 'position', required: true, min: 1, onlyInt: true },
    {type:'json', name: 'snapshot', required: true, maxSize: 100000 }, ...dates(),
  ], indexes: ['CREATE UNIQUE INDEX idx_grade_change_item ON grade_change_items (changeSet, position)'] }));
  app.save(new Collection({ name: 'grade_change_events', type: 'base', ...privateRules, fields: [
    rel('owner', users.id), rel('changeSet', sets.id), rel('course', courses.id),
    {type:'text', name: 'action', required: true, max: 40 },
    {type:'select', name: 'source', required: true, maxSelect: 1, values: ['ui', 'assistant_input', 'import'] },
    {type:'text', name: 'actor', required: true, max: 40 },
    {type:'text', name: 'operationKey', required: true, max: 160 },
    {type:'json', name: 'snapshot', required: true, maxSize: 2000000 }, ...dates(),
  ], indexes: ['CREATE INDEX idx_grade_change_events_set ON grade_change_events (changeSet, created)'] }));
  for (const name of ['grade_components', 'grade_entries', 'grade_overrides']) {
    const c = app.findCollectionByNameOrId(name);
    if (!c.fields.getByName('revision')) c.fields.add(new NumberField({ name: 'revision', onlyInt: true, min: 0 }));
    app.save(c);
  }
  // NumberField coerces null to 0. Never change an existing field's type in
  // place: copy to a new typed field, drop the old column, then rename the copy.
  // SQL copying preserves legacy numeric data without firing grade write hooks
  // against old invalid/unenrolled rows. No grade value is recomputed here.
  const entries = app.findCollectionByNameOrId('grade_entries');
  entries.fields.add(new JSONField({ name: 'valueNullableMigration', maxSize: 100 }));
  app.save(entries);
  app.db().newQuery('UPDATE "grade_entries" SET "valueNullableMigration" = CAST("value" AS TEXT)').execute();
  entries.fields.removeById(entries.fields.getByName('value').id);
  app.save(entries);
  entries.fields.getByName('valueNullableMigration').name = 'value';
  app.save(entries);
}, (app) => {
  // Schema rollback is safe only before commands have created history. Never
  // delete legitimate operations or coerce a saved clear into an earned zero.
  if (app.findRecordsByFilter('grade_change_sets', 'id != ""', '', 1).length) throw new Error('Grade proposals exist; disable command exposure instead of deleting history.');
  let offset = 0;
  while (true) {
    const rows = app.findRecordsByFilter('grade_entries', '', 'id', 500, offset);
    for (const row of rows) if (!row.getString('value') || row.getString('value') === 'null') throw new Error('Nullable grades exist; rollback would lose cleared-score meaning.');
    if (rows.length < 500) break;
    offset += rows.length;
  }
  const entries = app.findCollectionByNameOrId('grade_entries');
  entries.fields.add(new NumberField({ name: 'valueNumberMigration', min: 0 })); app.save(entries);
  app.db().newQuery('UPDATE "grade_entries" SET "valueNumberMigration" = CAST("value" AS REAL)').execute();
  entries.fields.removeById(entries.fields.getByName('value').id); app.save(entries);
  entries.fields.getByName('valueNumberMigration').name = 'value'; app.save(entries);
  for (const name of ['grade_change_events', 'grade_change_items', 'grade_change_sets']) app.delete(app.findCollectionByNameOrId(name));
  for (const name of ['grade_entries', 'grade_components', 'grade_overrides']) {
    const c = app.findCollectionByNameOrId(name), field = c.fields.getByName('revision');
    if (field) { c.fields.removeById(field.id); app.save(c); }
  }
});
