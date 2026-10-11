/// <reference path="../pb_data/types.d.ts" />

// Completed personal conversation practice is visible only through the
// authenticated student-profile API. Lecturers cannot read these reflections.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const courses = app.findCollectionByNameOrId('courses');
    app.save(new Collection({
      type: 'base', name: 'student_conversation_reflections',
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
        { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
        { name: 'course', type: 'relation', required: true, maxSelect: 1, collectionId: courses.id, cascadeDelete: true },
        { name: 'sessionKey', type: 'text', required: true, max: 64 },
        { name: 'courseTitle', type: 'text', max: 200 },
        { name: 'scenario', type: 'text', max: 160 },
        { name: 'language', type: 'text', max: 80 },
        { name: 'level', type: 'text', max: 40 },
        { name: 'transcript', type: 'json', maxSize: 100000 },
        { name: 'reflection', type: 'json', maxSize: 10000 },
        { name: 'completedAt', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_student_conversation_reflection_session ON student_conversation_reflections (owner, sessionKey)',
        'CREATE INDEX idx_student_conversation_reflection_created ON student_conversation_reflections (owner, created)',
      ],
    }));
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId('student_conversation_reflections')); } catch (_) { /* already removed */ }
  },
);
