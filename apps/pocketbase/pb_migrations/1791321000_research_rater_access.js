/// <reference path="../pb_data/types.d.ts" />
// P1: no implicit assignment-owner research role, no client-side raw reads.
// A reviewer can occupy exactly one round per assignment; a round has one account.
migrate((app) => {
 const users = app.findCollectionByNameOrId('users');
 const assignments = app.findCollectionByNameOrId('assignments');
 app.save(new Collection({
  name: 'research_rater_assignments', type: 'base',
  listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  fields: [
   { name: 'assignment', type: 'relation', collectionId: assignments.id, maxSelect: 1, required: true, cascadeDelete: false },
   { name: 'reviewer', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: false },
   { name: 'round', type: 'select', values: ['1', '2', '0'], maxSelect: 1, required: true },
   { name: 'active', type: 'bool' },
  ],
  indexes: [
   'CREATE UNIQUE INDEX idx_research_assignment_reviewer ON research_rater_assignments (assignment, reviewer)',
   'CREATE UNIQUE INDEX idx_research_assignment_round ON research_rater_assignments (assignment, round)',
  ],
 }));
 // Distributed mutex: a unique insert serializes finding writes across server processes.
 // No expiry/takeover: crashed writers fail closed until an operator verifies and clears locks.
 app.save(new Collection({
  name: 'research_annotation_locks', type: 'base',
  listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  fields: [{ name: 'key', type: 'text', required: true, max: 100 }],
  indexes: ['CREATE UNIQUE INDEX idx_research_annotation_lock ON research_annotation_locks (key)'],
 }));
 const items = app.findCollectionByNameOrId('ai_feedback_items');
 items.listRule = null;
 items.viewRule = null;
 // Do not silently consolidate historical duplicates: migration fails until audited.
 items.indexes.push('CREATE UNIQUE INDEX idx_research_ai_finding ON ai_feedback_items (evaluation, parentAiFindingId) WHERE origin = \'ai\' AND parentAiFindingId != \'\'');
 app.save(items);
}, (app) => {
 const items = app.findCollectionByNameOrId('ai_feedback_items');
 items.listRule = "@request.auth.id != '' && owner = @request.auth.id";
 items.viewRule = items.listRule;
 items.indexes = items.indexes.filter((index) => !index.includes('idx_research_ai_finding'));
 app.save(items);
 app.delete(app.findCollectionByNameOrId('research_annotation_locks'));
 app.delete(app.findCollectionByNameOrId('research_rater_assignments'));
});
