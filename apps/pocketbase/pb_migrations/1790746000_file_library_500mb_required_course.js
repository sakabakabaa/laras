/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("file_library");

    // Raise the per-file upload limit from 100 MB to 500 MB — course documents
    // and lecture media regularly exceed the old ceiling. The field-level
    // maxSize remains the server-side cap, so oversized uploads are still
    // rejected by PocketBase itself.
    const fileField = collection.fields.getByName("file");
    fileField.maxSize = 524288000; // 500 MB

    // A file must be linked to a mata kuliah on create. Existing records are
    // left untouched (backward compatible); updates may not clear the link.
    collection.createRule =
      "@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty' && @request.body.course != ''";
    collection.updateRule =
      "@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && (@request.body.course:isset = false || @request.body.course != '')";

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("file_library");

    const fileField = collection.fields.getByName("file");
    fileField.maxSize = 104857600; // 100 MB

    collection.createRule =
      "@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'";
    collection.updateRule =
      "@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false";

    app.save(collection);
  },
);
