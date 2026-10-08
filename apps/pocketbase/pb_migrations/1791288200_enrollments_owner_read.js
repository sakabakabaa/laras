/// <reference path="../pb_data/types.d.ts" />

// Broaden enrollments read access so the course owner (dosen) can see the
// students enrolled in their mata kuliah. Previously the list/view rule was
// strictly `owner = @request.auth.id`, which limited reads to the student
// themselves — so a lecturer could never list their course's enrolled
// students, and the Mahasiswa page / gradebook showed an empty roster even
// when enrollments existed. Students still read their own enrollments; the
// course owner gains read access to enrollments for courses they own. This
// mirrors the access pattern already used by `course_roster` and
// `attendance` (`<relation>.course.owner = @request.auth.id`). Create/update/
// delete rules are unchanged, so enrollment ownership and self-service
// enrollment behavior are preserved.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("enrollments");
    col.listRule =
      "@request.auth.id != '' && (owner = @request.auth.id || course.owner = @request.auth.id)";
    col.viewRule =
      "@request.auth.id != '' && (owner = @request.auth.id || course.owner = @request.auth.id)";
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("enrollments");
    col.listRule = "@request.auth.id != '' && owner = @request.auth.id";
    col.viewRule = "@request.auth.id != '' && owner = @request.auth.id";
    app.save(col);
  },
);
