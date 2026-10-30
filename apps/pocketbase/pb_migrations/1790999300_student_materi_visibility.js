/// <reference path="../pb_data/types.d.ts" />

// Course Materi visibility for students. Previously file_library list/view
// rules only exposed files with access='student' or access='public' to
// students, while the upload dialog defaults new files to access='faculty'
// ("Dosen only"). That hid every course-linked material from students in the
// course Materi section, even though the lecturer explicitly linked the file
// to the mata kuliah.
//
// This widens read access so any logged-in student can view file_library
// records linked to a course (course != ''). Files without a course link
// remain private to their owner. Write rules (create/update/delete) are
// unchanged, so lecturer management controls are fully preserved.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("file_library");
    collection.listRule =
      "owner = @request.auth.id || access = 'public' || (course != '' && @request.auth.id != '' && @request.auth.role = 'student')";
    collection.viewRule =
      "owner = @request.auth.id || access = 'public' || (course != '' && @request.auth.id != '' && @request.auth.role = 'student')";
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("file_library");
    collection.listRule =
      "owner = @request.auth.id || (access = 'student' && @request.auth.id != '') || access = 'public'";
    collection.viewRule =
      "owner = @request.auth.id || (access = 'student' && @request.auth.id != '') || access = 'public'";
    app.save(collection);
  },
);
