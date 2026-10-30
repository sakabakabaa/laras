/// <reference path="../pb_data/types.d.ts" />

// Phase 4 — context organization for the Manajemen berkas library.
//
// 1. `file_contexts`: one record per library file holding the lecturer's
//    confirmed/corrected language, topics, and draft/confirmed status, plus
//    the exact active version the context was reviewed against. Owner-only
//    reads and writes (lecturer-private); students and public participants
//    can never reach it.
//
// 2. `context_sections`: lecturer-marked content sections of a library file.
//    Each row carries a label, a free-text page/section reference, an
//    explicit "suitable / unsuitable for AI context" mark (safe default is
//    unsuitable — nothing becomes AI context unless explicitly marked), an
//    optional note, and explicit links to existing authorized CPMK,
//    Sub-CPMK, and Sesi records. The mata kuliah link stays on the library
//    file itself (required since Phase 1). Every row records the exact
//    version it was marked against, for traceability.
//
// Both collections are additive and backward-compatible: no existing
// collection or field is changed.
migrate(
  (app) => {
    const fileLibrary = app.findCollectionByNameOrId("file_library");
    const users = app.findCollectionByNameOrId("users");
    const cpmk = app.findCollectionByNameOrId("cpmk");
    const subCpmk = app.findCollectionByNameOrId("sub_cpmk");
    const sessions = app.findCollectionByNameOrId("class_sessions");

    // ── 1. file_contexts (find-or-create) ─────────────────────
    let contexts;
    try {
      contexts = app.findCollectionByNameOrId("file_contexts");
    } catch (_) {
      contexts = new Collection({
        type: "base",
        name: "file_contexts",
        // Lecturer-private: only the owner reads and writes their own
        // context records. Creation is faculty-only with a matching owner.
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
          { name: "language", type: "text", max: 10 },
          { name: "topics", type: "text", max: 2000 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["draft", "confirmed"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          // One context record per library file.
          "CREATE UNIQUE INDEX idx_file_contexts_file ON file_contexts (file)",
        ],
      });
      app.save(contexts);
    }

    // ── 2. context_sections (find-or-create) ──────────────────
    let sections;
    try {
      sections = app.findCollectionByNameOrId("context_sections");
    } catch (_) {
      sections = new Collection({
        type: "base",
        name: "context_sections",
        // Lecturer-private, owner-scoped reads and writes; faculty-only
        // creation with a matching owner.
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
          { name: "label", type: "text", required: true, max: 200 },
          { name: "pageRef", type: "text", max: 100 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["suitable", "unsuitable"],
          },
          { name: "note", type: "text", max: 500 },
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
          { name: "order", type: "number", min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_context_sections_file ON context_sections (file)",
        ],
      });
      app.save(sections);
    }
  },
  (app) => {
    // Reverse dependency order: sections first (they reference file_library),
    // then the per-file context records.
    try {
      const sections = app.findCollectionByNameOrId("context_sections");
      app.delete(sections);
    } catch (e) {
      if (!String(e?.message || e).includes("no rows in result set")) throw e;
    }
    try {
      const contexts = app.findCollectionByNameOrId("file_contexts");
      app.delete(contexts);
    } catch (e) {
      if (!String(e?.message || e).includes("no rows in result set")) throw e;
    }
  },
);
