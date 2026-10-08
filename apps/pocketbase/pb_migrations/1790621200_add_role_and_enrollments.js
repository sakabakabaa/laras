/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // 1) Add a `role` select field to users (faculty | student) and lock it on
  //    update so a user cannot change their own role after signup.
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(
    new SelectField({
      name: "role",
      required: false,
      maxSelect: 1,
      values: ["faculty", "student"],
    })
  );
  users.updateRule = "id = @request.auth.id && @request.body.role:changed = false";
  app.save(users);

  // Backfill any existing users (created before this migration) as faculty,
  // since the platform was originally lecturer-focused.
  try {
    const existing = app.findRecordsByFilter("users", "id != ''");
    for (const record of existing) {
      if (!record.get("role")) {
        record.set("role", "faculty");
        app.save(record);
      }
    }
  } catch (e) {
    // No users yet — nothing to backfill.
  }

  // 2) Broaden courses + class_sessions read rules so students can browse
  //    catalog courses and view sessions/materials. Creation stays faculty-only.
  const courses = app.findCollectionByNameOrId("courses");
  courses.listRule = "@request.auth.id != ''";
  courses.viewRule = "@request.auth.id != ''";
  courses.createRule =
    "@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'";
  app.save(courses);

  const sessions = app.findCollectionByNameOrId("class_sessions");
  sessions.listRule = "@request.auth.id != ''";
  sessions.viewRule = "@request.auth.id != ''";
  sessions.createRule =
    "@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'";
  app.save(sessions);

  // 3) Enrollments: a student's link to a course they joined.
  const enrollments = new Collection({
    type: "base",
    name: "enrollments",
    listRule: "@request.auth.id != '' && owner = @request.auth.id",
    viewRule: "@request.auth.id != '' && owner = @request.auth.id",
    createRule:
      "@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'student'",
    updateRule: "@request.auth.id != '' && owner = @request.auth.id",
    deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
    fields: [
      {
        name: "owner",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: users.id,
        cascadeDelete: true,
      },
      {
        name: "course",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: courses.id,
        cascadeDelete: true,
      },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_enrollments_owner ON enrollments (owner)",
      "CREATE UNIQUE INDEX idx_enrollments_unique ON enrollments (owner, course)",
    ],
  });
  app.save(enrollments);
}, (app) => {
  // Rollback: remove enrollments, restore owner-scoped read rules, drop role.
  try {
    app.delete(app.findCollectionByNameOrId("enrollments"));
  } catch (e) {}

  const courses = app.findCollectionByNameOrId("courses");
  courses.listRule = "@request.auth.id != '' && owner = @request.auth.id";
  courses.viewRule = "@request.auth.id != '' && owner = @request.auth.id";
  courses.createRule =
    "@request.auth.id != '' && @request.body.owner = @request.auth.id";
  app.save(courses);

  const sessions = app.findCollectionByNameOrId("class_sessions");
  sessions.listRule = "@request.auth.id != '' && owner = @request.auth.id";
  sessions.viewRule = "@request.auth.id != '' && owner = @request.auth.id";
  sessions.createRule =
    "@request.auth.id != '' && @request.body.owner = @request.auth.id";
  app.save(sessions);

  const users = app.findCollectionByNameOrId("users");
  const roleField = users.fields.getByName("role");
  if (roleField) users.fields.remove(roleField);
  users.updateRule = "id = @request.auth.id";
  app.save(users);
});
