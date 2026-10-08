/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const courses = new Collection({
    type: "base",
    name: "courses",
    listRule: "@request.auth.id != '' && owner = @request.auth.id",
    viewRule: "@request.auth.id != '' && owner = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
    updateRule: "@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false",
    deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "title", type: "text", required: true, max: 200 },
      { name: "code", type: "text", max: 40 },
      { name: "semester", type: "text", max: 80 },
      { name: "academicYear", type: "text", max: 40 },
      { name: "description", type: "text", max: 2000 },
      { name: "rps", type: "text" },
      { name: "syllabus", type: "text" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ],
    indexes: ["CREATE INDEX idx_courses_owner ON courses (owner)"]
  });
  app.save(courses);
  const sessions = new Collection({
    type: "base",
    name: "class_sessions",
    listRule: "@request.auth.id != '' && owner = @request.auth.id",
    viewRule: "@request.auth.id != '' && owner = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
    updateRule: "@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && @request.body.course:changed = false",
    deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "course", type: "relation", required: true, maxSelect: 1, collectionId: courses.id, cascadeDelete: true },
      { name: "title", type: "text", required: true, max: 200 },
      { name: "week", type: "number", min: 1, max: 52 },
      { name: "date", type: "date" },
      { name: "topic", type: "text", max: 2000 },
      { name: "notes", type: "text", max: 10000 },
      { name: "completed", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true }
    ],
    indexes: ["CREATE INDEX idx_sessions_course ON class_sessions (course)"]
  });
  app.save(sessions);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("class_sessions"));
  app.delete(app.findCollectionByNameOrId("courses"));
});
