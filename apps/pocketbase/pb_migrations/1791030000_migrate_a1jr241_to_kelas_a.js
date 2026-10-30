/// <reference path="../pb_data/types.d.ts" />

// Migrate every current mahasiswa (and the existing meeting schedule) of the
// A1 JR241 mata kuliah into Kelas A, so the section-aware attendance workflow
// has a single, well-defined section to record against.
//
// - Ensures a section named "A" exists for the course (it already does in the
//   current data; this is idempotent and creates it if missing).
// - Sets `section` to Kelas A on every enrollment, course_roster entry, and
//   class_session of this course that does not already carry a section.
// - Preserves all other course data (RPS, materi, tugas, submissions, grades).
// - Targets ONLY this course (matched by code "A1 JR241") and only rows whose
//   section is currently empty — rows already assigned to a section are left
//   untouched.
migrate(
  (app) => {
    let course;
    try {
      course = app.findFirstRecordByFilter("courses", "code = 'A1 JR241'");
    } catch (_) {
      // Course not found in this environment — nothing to migrate.
      console.log("A1 JR241 course not found, skipping Kelas A migration");
      return;
    }
    const courseId = course.get("id");

    // Ensure Kelas A exists for this course.
    let sectionA;
    try {
      sectionA = app.findFirstRecordByFilter(
        "course_sections",
        "course = '" + courseId + "' && name = 'A'",
      );
    } catch (_) {
      const sectionsCol = app.findCollectionByNameOrId("course_sections");
      sectionA = new Record(sectionsCol);
      sectionA.set("course", courseId);
      sectionA.set("owner", course.get("owner"));
      sectionA.set("name", "A");
      app.save(sectionA);
    }
    const sectionId = sectionA.get("id");

    // Move every unsectioned enrollment / roster / session into Kelas A.
    const targets = ["enrollments", "course_roster", "class_sessions"];
    for (const name of targets) {
      let rows;
      try {
        rows = app.findRecordsByFilter(
          name,
          "course = '" + courseId + "' && section = ''",
        );
      } catch (e) {
        if (String(e).includes("no rows in result set")) continue;
        throw e;
      }
      for (const row of rows) {
        row.set("section", sectionId);
        app.save(row);
      }
    }
  },
  (app) => {
    // One-way data migration. Rolling back would require remembering each row's
    // prior (empty) section, which is not recoverable — leave rows in Kelas A.
  },
);
