/// <reference path="../pb_data/types.d.ts" />

// Phase 3 — versioning & traceability for the Manajemen berkas library.
//
// 1. New `file_versions` collection: immutable snapshots of prior versions.
//    Whenever a lecturer replaces a managed file (or restores a prior
//    version), the current original binary plus its extraction metadata
//    (status, failure reason, language, pages, chars, extractedAt, parser
//    version, sourceKey) is copied here before the active record changes.
//    Writes are server-only (null rules) — only the /api/berkas-* routes
//    write as superuser after verifying the caller owns the file. Reads are
//    owner-only, so students and public participants can never see version
//    history. The snapshot binary is `protected`, so it is only served with
//    a short-lived file token to a caller who can view the record.
//
// 2. `version` (monotonic version number) and `restoredFrom` (traceability:
//    which prior version the active file was restored from) on
//    `file_library`. Existing rows are backfilled to version 1.
//
// 3. `version` on `file_extractions` so the stored extraction stays tied to
//    the exact version it parsed. Existing rows are backfilled to version 1.
migrate(
  (app) => {
    // ── 1. file_versions (find-or-create) ──────────────────────
    let versions;
    try {
      versions = app.findCollectionByNameOrId("file_versions");
    } catch (_) {
      const fileLibrary = app.findCollectionByNameOrId("file_library");
      const users = app.findCollectionByNameOrId("users");

      versions = new Collection({
        type: "base",
        name: "file_versions",
        // Owner-only reads: version history is lecturer-private. All writes
        // are null — only the superuser API routes mutate snapshots, after
        // verifying ownership, which keeps prior versions immutable.
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
          { name: "version", type: "number", required: true, min: 1, onlyInt: true },
          {
            name: "fileData",
            type: "file",
            maxSelect: 1,
            maxSize: 524288000, // 500 MB — matches file_library.file
            protected: true,
            mimeTypes: [
              "application/pdf",
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "application/vnd.ms-powerpoint",
              "application/msword",
              "application/vnd.ms-excel",
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/gif",
              "image/svg+xml",
              "audio/mpeg",
              "audio/wav",
              "audio/ogg",
              "audio/aac",
              "audio/x-m4a",
              "video/mp4",
              "video/webm",
              "video/quicktime",
            ],
          },
          { name: "filename", type: "text", max: 250 },
          { name: "size", type: "number", min: 0 },
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
          "CREATE INDEX idx_file_versions_file ON file_versions (file)",
          // One snapshot per version number — makes the snapshot step
          // idempotent even if a replace is retried after a partial failure.
          "CREATE UNIQUE INDEX idx_file_versions_unique ON file_versions (file, version)",
        ],
      });
      app.save(versions);
    }

    // ── 2. version + restoredFrom on file_library ──────────────
    const library = app.findCollectionByNameOrId("file_library");
    if (!library.fields.getByName("version")) {
      library.fields.add(new NumberField({ name: "version", min: 1, onlyInt: true }));
    }
    if (!library.fields.getByName("restoredFrom")) {
      library.fields.add(new NumberField({ name: "restoredFrom", min: 1, onlyInt: true }));
    }
    app.save(library);

    // Backfill: every existing file starts at version 1.
    const libraryRows = app.findRecordsByFilter("file_library", "id != ''");
    for (const row of libraryRows) {
      if (!row.get("version")) {
        row.set("version", 1);
        app.save(row);
      }
    }

    // ── 3. version on file_extractions ─────────────────────────
    const extractions = app.findCollectionByNameOrId("file_extractions");
    if (!extractions.fields.getByName("version")) {
      extractions.fields.add(new NumberField({ name: "version", min: 1, onlyInt: true }));
    }
    app.save(extractions);

    const extractionRows = app.findRecordsByFilter("file_extractions", "id != ''");
    for (const row of extractionRows) {
      if (!row.get("version")) {
        row.set("version", 1);
        app.save(row);
      }
    }
  },
  (app) => {
    // Revert in reverse dependency order: snapshots first (they reference
    // file_library), then the added fields.
    try {
      const versions = app.findCollectionByNameOrId("file_versions");
      app.delete(versions);
    } catch (e) {
      if (!String(e?.message || e).includes("no rows in result set")) throw e;
    }

    try {
      const library = app.findCollectionByNameOrId("file_library");
      if (library.fields.getByName("restoredFrom")) {
        library.fields.removeByName("restoredFrom");
      }
      if (library.fields.getByName("version")) {
        library.fields.removeByName("version");
      }
      app.save(library);
    } catch (e) {
      if (!String(e?.message || e).includes("no rows in result set")) throw e;
    }

    try {
      const extractions = app.findCollectionByNameOrId("file_extractions");
      if (extractions.fields.getByName("version")) {
        extractions.fields.removeByName("version");
      }
      app.save(extractions);
    } catch (e) {
      if (!String(e?.message || e).includes("no rows in result set")) throw e;
    }
  },
);
