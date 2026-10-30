/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
 const users = app.findCollectionByNameOrId('users');
 const tasks = app.findCollectionByNameOrId('agent_tasks');
 app.save(new Collection({ name: 'agent_task_events', type: 'base',
  listRule: "@request.auth.id != '' && owner = @request.auth.id", viewRule: "@request.auth.id != '' && owner = @request.auth.id",
  createRule: null, updateRule: null, deleteRule: null,
  fields: [
   { name: 'owner', type: 'relation', collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
   { name: 'task', type: 'relation', collectionId: tasks.id, required: true, maxSelect: 1, cascadeDelete: true },
   { name: 'action', type: 'text', max: 64, required: true },
   { name: 'status', type: 'text', max: 64, required: true },
   { name: 'revision', type: 'number', onlyInt: true },
   { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  ], indexes: ['CREATE INDEX idx_agent_events_task ON agent_task_events (task, created)'],
 }));
}, (app) => app.delete(app.findCollectionByNameOrId('agent_task_events')));
