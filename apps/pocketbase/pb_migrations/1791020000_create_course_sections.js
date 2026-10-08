/// <reference path="../pb_data/types.d.ts" />

// Multi-section (Kelas) support for mata kuliah.
//
// A course may have one or more sections (Kelas A, Kelas B, …). RPS, materi,
// dan tugas stay shared at the parent course level. Each section gets its own
// jadwal (class_sessions), daftar mahasiswa (course_roster), enrollment, and
// class-specific progress.
//
// The `section` field added to class_sessions / course_roster / enrollments is
// OPTIONAL (empty = default / all sections). Existing courses with no
// sections continue to work exactly as before — a single implicit section —
// with zero data migration. When a lecturer creates sections, they can assign
// sessions, roster entries, and enrollments to specific sections.
//
// Reads on course_sections are open to any signed-in user (same as
// class_sessions) so students can identify their section. Writes are
// faculty-only and scoped to the course owner.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const courses = app.findCollectionByNameOrId("courses");

    // 1 — Create course_sections collection.
    let sections;
    try {
      sections = app.findCollectionByNameOrId("course_sections");
    } catch (_) {
      sections = new Collection({
        type: "base",
        name: "course_sections",
        // Open reads (any signed-in user) so students can see their section;
        // writes are faculty-only and course-owner-scoped.
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
        updateRule:
          "@request.auth.id != '' && course.owner = @request.auth.id && @request.body.owner:changed = false && @request.body.course:changed = false",
        deleteRule: "@request.auth.id != '' && course.owner = @request.auth.id",
        fields: [
          { name: "name", type: "text", required: true, min: 1, max: 100 },
          {
            name: "course",
            type: "relation",
            required: true,
            maxSelect: 1,
            minSelect: 0,
            collectionId: courses.id,
            cascadeDelete: true,
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            minSelect: 0,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_course_sections_course ON course_sections (course)",
        ],
      });
      app.save(sections);
      sections = app.findCollectionByNameOrId("course_sections");
    }

    const sectionId = sections.id;

    // 2 — Add optional `section` relation to class_sessions, course_roster,
    // and enrollments. cascadeDelete is false so deleting a section does not
    // silently destroy sessions/roster/enrollments — the UI warns first and
    // the records keep their (now-empty) section reference cleared by PB.
    const targets = ["class_sessions", "course_roster", "enrollments"];
    for (const name of targets) {
      const col = app.findCollectionByNameOrId(name);
      if (!col.fields.getByName("section")) {
        col.fields.add(
          new RelationField({
            name: "section",
            required: false,
            maxSelect: 1,
            minSelect: 0,
            collectionId: sectionId,
            cascadeDelete: false,
          }),
        );
        app.save(col);
      }
    }
  },
  (app) => {
    for (const name of ["class_sessions", "course_roster", "enrollments"]) {
      try {
        const col = app.findCollectionByNameOrId(name);
        if (col.fields.getByName("section")) {
          col.fields.removeByName("section");
          app.save(col);
        }
      } catch (_) {
        /* collection may not exist */
      }
    }
    try {
      const col = app.findCollectionByNameOrId("course_sections");
      app.delete(col);
    } catch (_) {
      /* already gone */
    }
  },
);
