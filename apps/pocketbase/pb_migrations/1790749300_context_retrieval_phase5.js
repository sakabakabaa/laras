/// <reference path="../pb_data/types.d.ts" />

// Phase 5 — controlled, isolated AI context retrieval: audit trail.
//
// `context_retrievals` records every context-bundle retrieval performed by
// the shared read-only retrieval layer (/api/context/check, /insights,
// /material): which feature requested it, who requested it, the exact
// academic scope, the exact sources cited (file, active version, section,
// page reference, extraction timestamp), whether the result was sufficient
// or explicitly insufficient, and the size of the bundle.
//
// The `owner` of every audit row is the lecturer whose academic scope the
// retrieval ran against (assignment owner / course owner), and reads are
// owner-only — so students and public participants can never read audit
// records, including audits of their own formative-check retrievals. All
// writes are server-only (null rules): only the superuser API routes write
// audits after verifying the caller's permissions.
//
// The retrieval layer itself is strictly read-only with respect to stored
// file context: it never modifies file_library, file_extractions,
// file_versions, file_contexts, context_sections, or any academic record.
// This collection is additive and backward-compatible.
migrate(
  (app) => {
    let audits;
    try {
      audits = app.findCollectionByNameOrId("context_retrievals");
    } catch (_) {
      const users = app.findCollectionByNameOrId("users");

      audits = new Collection({
        type: "base",
        name: "context_retrievals",
        // Lecturer-private audit trail: only the owning lecturer may read
        // their own audit rows. Students and public participants are never
        // able to read audit records. Writes happen only through the
        // server-side superuser routes.
        listRule: "@request.auth.id != '' && owner = @request.auth.id",
        viewRule: "@request.auth.id != '' && owner = @request.auth.id",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: "feature",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["check", "insights", "material"],
          },
          { name: "bundleId", type: "text", required: true, max: 64 },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          // Identity label of the requesting user, e.g. "faculty:<id>",
          // "student:<id>", or "public-link". Audit information only.
          { name: "requester", type: "text", max: 120 },
          // Exact academic scope the retrieval ran against.
          { name: "scope", type: "json", maxSize: 50000 },
          // Exact source references cited by the bundle: file id, stored
          // filename, active version, section id/label, page reference, and
          // extraction timestamp.
          { name: "sources", type: "json", maxSize: 200000 },
          {
            name: "result",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["sufficient", "insufficient"],
          },
          { name: "reason", type: "text", max: 1000 },
          { name: "sectionCount", type: "number", min: 0 },
          { name: "charCount", type: "number", min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_context_retrievals_owner ON context_retrievals (owner)",
          "CREATE INDEX idx_context_retrievals_feature ON context_retrievals (feature)",
        ],
      });
      app.save(audits);
    }
  },
  (app) => {
    try {
      const audits = app.findCollectionByNameOrId("context_retrievals");
      app.delete(audits);
    } catch (e) {
      if (!String(e?.message || e).includes("no rows in result set")) throw e;
    }
  },
);
