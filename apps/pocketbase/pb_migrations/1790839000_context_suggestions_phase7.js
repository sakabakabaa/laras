/// <reference path="../pb_data/types.d.ts" />

// Phase 7 — AI-generated academic-context suggestions with an approve/reject
// review flow.
//
// `context_suggestions`: one row per AI-suggested academic tag for a library
// file. The suggestion carries its kind (language / topics / section / course /
// session), a human-readable label, an optional page reference, an evidence
// note grounded in the extracted text, and resolved links to existing
// authorized CPMK / Sub-CPMK / Sesi records (resolved server-side from codes
// the model returned — the model never invents record ids). Each suggestion
// starts `pending` and moves to `approved` or `rejected` only by explicit
// lecturer action; only approved suggestions are applied to the confirmed
// context stores (`context_sections`, `file_contexts`, `file_library`) that
// downstream AI grounding already reads. Lecturer-private: owner-only reads
// and writes, faculty-only creation with a matching owner.
//
// Additive and backward-compatible: no existing collection or field changes.
migrate(
  (app) => {
    const fileLibrary = app.findCollectionByNameOrId("file_library");
    const users = app.findCollectionByNameOrId("users");
    const courses = app.findCollectionByNameOrId("courses");
    const cpmk = app.findCollectionByNameOrId("cpmk");
    const subCpmk = app.findCollectionByNameOrId("sub_cpmk");
    const sessions = app.findCollectionByNameOrId("class_sessions");

    let suggestions;
    try {
      suggestions = app.findCollectionByNameOrId("context_suggestions");
    } catch (_) {
      suggestions = new Collection({
        type: "base",
        name: "context_suggestions",
        // Lecturer-private: only the owner reads and writes their own
        // suggestion records. Creation is faculty-only with a matching owner.
        listRule: "@request.auth.id != '' && owner = @request.auth.id",
        viewRule: "@request.auth.id != '' && owner = @request.auth.id",
        createRule:
          "@request.auth.id != '' && @request.auth.role = 'faculty' && @request.body.owner = @request.auth.id",
        updateRule: "@request.auth.id != '' && owner = @request.auth.id",
        deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
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
          { name: "version", type: "number", min: 1, onlyInt: true },
          {
            name: "kind",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["language", "topics", "section", "course", "session"],
          },
          { name: "label", type: "text", required: true, max: 500 },
          { name: "pageRef", type: "text", max: 100 },
          { name: "note", type: "text", max: 1000 },
          {
            name: "cpmk",
            type: "relation",
            maxSelect: 1,
            collectionId: cpmk.id,
          },
          {
            name: "subCpmk",
            type: "relation",
            maxSelect: 1,
            collectionId: subCpmk.id,
          },
          {
            name: "session",
            type: "relation",
            maxSelect: 1,
            collectionId: sessions.id,
          },
          {
            name: "course",
            type: "relation",
            maxSelect: 1,
            collectionId: courses.id,
          },
          {
            name: "review",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pending", "approved", "rejected"],
          },
          { name: "reviewedAt", type: "date" },
          { name: "bundleId", type: "text", max: 64 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_context_suggestions_file ON context_suggestions (file)",
          "CREATE INDEX idx_context_suggestions_review ON context_suggestions (review)",
        ],
      });
      app.save(suggestions);
    }
  },
  (app) => {
    try {
      const suggestions = app.findCollectionByNameOrId("context_suggestions");
      app.delete(suggestions);
    } catch (e) {
      if (!String(e?.message || e).includes("no rows in result set")) throw e;
    }
  },
);
