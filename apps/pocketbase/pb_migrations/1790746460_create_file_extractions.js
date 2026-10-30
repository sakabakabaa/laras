/// <reference path="../pb_data/types.d.ts" />

// Phase 2 — document processing: one stored extraction per library file.
// The original file stays untouched in `file_library`; this collection holds
// the parsed text plus extraction metadata (language, pages, chars, timestamp,
// parser version) and a clear failure reason when parsing is not possible.
// Writes are server-only (null rules) — the /api/berkas-process route writes
// as superuser after verifying the caller owns the file; lecturers can read
// their own extraction records to show processing states.
migrate(
  (app) => {
    let collection;
    try {
      collection = app.findCollectionByNameOrId("file_extractions");
    } catch (_) {
      const fileLibrary = app.findCollectionByNameOrId("file_library");
      const users = app.findCollectionByNameOrId("users");
      collection = new Collection({
        type: "base",
        name: "file_extractions",
        listRule: "@request.auth.id != '' && owner = @request.auth.id",
        viewRule: "@request.auth.id != '' && owner = @request.auth.id",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: "file",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: fileLibrary.id,
            cascadeDelete: true,
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pending", "processing", "ready", "review", "failed"],
          },
          { name: "extractedText", type: "text", max: 400000 },
          { name: "language", type: "text", max: 10 },
          { name: "pages", type: "number", min: 0 },
          { name: "chars", type: "number", min: 0 },
          { name: "extractedAt", type: "date" },
          { name: "parserVersion", type: "text", max: 40 },
          { name: "failureReason", type: "text", max: 1000 },
          { name: "sourceKey", type: "text", max: 250 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_file_extractions_file ON file_extractions (file)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("file_extractions");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("Collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);
