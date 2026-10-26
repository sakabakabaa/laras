/// <reference path="../pb_data/types.d.ts" />
// All access is through the authenticated scheduled-class endpoint. In particular,
// activity snapshots contain private answer keys and must never be SDK-readable.
migrate((app) => {
  const relation = (name, collection, required = true) => ({name, type: 'relation', collectionId: app.findCollectionByNameOrId(collection).id, maxSelect: 1, required, cascadeDelete: required});
  const dates = [{name: 'created', type: 'autodate', onCreate: true}, {name: 'updated', type: 'autodate', onCreate: true, onUpdate: true}];
  const create = (name, fields, indexes = []) => app.save(new Collection({name, type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields: [...fields, ...dates], indexes}));
  create('scheduled_classes', [
    relation('session', 'class_sessions'), relation('course', 'courses'), relation('owner', 'users'), relation('section', 'course_sections', false),
    {name: 'title', type: 'text', required: true, max: 200}, {name: 'instructions', type: 'text', max: 10000},
    {name: 'status', type: 'select', values: ['draft', 'scheduled', 'closed', 'reviewed', 'cancelled'], maxSelect: 1, required: true},
    {name: 'startsAt', type: 'date'}, {name: 'endsAt', type: 'date'}, {name: 'joinUntil', type: 'date'},
    {name: 'lateAfterMin', type: 'number', onlyInt: true, min: 0, max: 1440},
    {name: 'revision', type: 'number', onlyInt: true}, {name: 'releaseResults', type: 'bool'},
  ], ['CREATE UNIQUE INDEX idx_scheduled_session ON scheduled_classes (session)']);
  create('scheduled_class_activities', [
    relation('class', 'scheduled_classes'), {name: 'position', type: 'number', onlyInt: true},
    {name: 'kind', type: 'select', values: ['material', 'quiz', 'assignment', 'exit_ticket'], maxSelect: 1, required: true},
    {name: 'title', type: 'text', required: true, max: 200}, {name: 'minutes', type: 'number', onlyInt: true, min: 1, max: 600},
    {name: 'required', type: 'bool'}, {name: 'snapshot', type: 'json', maxSize: 150000},
  ], ['CREATE UNIQUE INDEX idx_scheduled_position ON scheduled_class_activities (class, position)']);
  create('scheduled_class_participants', [
    relation('class', 'scheduled_classes'), relation('student', 'users'), relation('roster', 'course_roster', false),
    {name: 'checkedInAt', type: 'date'}, {name: 'lastSeenAt', type: 'date'},
  ], ['CREATE UNIQUE INDEX idx_scheduled_participant ON scheduled_class_participants (class, student)']);
  create('scheduled_activity_attempts', [
    relation('class', 'scheduled_classes'), relation('activity', 'scheduled_class_activities'), relation('student', 'users'),
    {name: 'answers', type: 'json', maxSize: 100000}, {name: 'revision', type: 'number', onlyInt: true},
    {name: 'status', type: 'select', values: ['draft', 'submitted', 'expired'], maxSelect: 1, required: true},
    {name: 'savedAt', type: 'date'}, {name: 'finalizedAt', type: 'date'}, {name: 'score', type: 'number'},
    {name: 'complete', type: 'bool'}, {name: 'lastRequest', type: 'text', max: 100},
  ], ['CREATE UNIQUE INDEX idx_scheduled_attempt ON scheduled_activity_attempts (activity, student)', 'CREATE INDEX idx_scheduled_attempt_status ON scheduled_activity_attempts (status)']);
  create('scheduled_class_events', [relation('class', 'scheduled_classes'), relation('actor', 'users', false), {name: 'action', type: 'text', max: 100}, {name: 'detail', type: 'json', maxSize: 10000}]);
}, (app) => {
  for (const name of ['scheduled_class_events', 'scheduled_activity_attempts', 'scheduled_class_participants', 'scheduled_class_activities', 'scheduled_classes']) app.delete(app.findCollectionByNameOrId(name));
});
