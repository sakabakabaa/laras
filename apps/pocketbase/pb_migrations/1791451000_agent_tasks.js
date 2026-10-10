/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId('users');
  const courses = app.findCollectionByNameOrId('courses');
  const tasks = new Collection({ name: 'agent_tasks', type: 'base',
    listRule: "@request.auth.id != '' && owner = @request.auth.id",
    viewRule: "@request.auth.id != '' && owner = @request.auth.id",
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'course', type: 'relation', collectionId: courses.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'kind', type: 'select', values: ['lesson', 'practice'], maxSelect: 1, required: true },
      { name: 'status', type: 'select', values: ['queued', 'running', 'awaiting_approval', 'awaiting_practice', 'needs_auth', 'failed', 'completed', 'cancelled'], maxSelect: 1, required: true },
      { name: 'goal', type: 'text', max: 1000, required: true },
      { name: 'activeKey', type: 'text', max: 150 },
      { name: 'credential', type: 'text', max: 10000, hidden: true },
      { name: 'lease', type: 'text', max: 64, hidden: true },
      { name: 'leaseUntil', type: 'date', hidden: true },
      { name: 'attempts', type: 'number', onlyInt: true },
      { name: 'revision', type: 'number', onlyInt: true },
      { name: 'approvedRevision', type: 'number', onlyInt: true },
      { name: 'steps', type: 'json', maxSize: 30000 },
      { name: 'payload', type: 'json', maxSize: 250000 },
      { name: 'result', type: 'json', maxSize: 50000 },
      { name: 'error', type: 'text', max: 1000 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ], indexes: ["CREATE UNIQUE INDEX idx_agent_tasks_active ON agent_tasks (activeKey) WHERE activeKey != ''", 'CREATE INDEX idx_agent_tasks_queue ON agent_tasks (status, leaseUntil)', 'CREATE INDEX idx_agent_tasks_owner ON agent_tasks (owner, created)'],
  });
  app.save(tasks);
  app.save(new Collection({ name: 'assistant_lesson_plans', type: 'base',
    listRule: "@request.auth.id != '' && owner = @request.auth.id",
    viewRule: "@request.auth.id != '' && owner = @request.auth.id",
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'owner', type: 'relation', collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: 'course', type: 'relation', collectionId: courses.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: 'task', type: 'relation', collectionId: tasks.id, required: true, maxSelect: 1, cascadeDelete: true },
      { name: 'title', type: 'text', max: 200, required: true },
      { name: 'plan', type: 'json', maxSize: 100000 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ], indexes: ['CREATE UNIQUE INDEX idx_assistant_lesson_task ON assistant_lesson_plans (task)'],
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId('assistant_lesson_plans'));
  app.delete(app.findCollectionByNameOrId('agent_tasks'));
});
