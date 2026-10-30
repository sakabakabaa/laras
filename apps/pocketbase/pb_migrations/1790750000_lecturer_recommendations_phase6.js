/// <reference path="../pb_data/types.d.ts" />

// Phase 6 — evidence-based actionable lecturer recommendations.
//
// `lecturer_recommendations` stores DRAFT recommendations generated only from
// Phase 5 approved context bundles (feature "insights") plus the lecturer's
// aggregate formative Cek-jawaban signals. Each row keeps its full evidence:
// the exact citations (file, active version, section, page reference), the
// context bundle id and retrieval timestamp, and the aggregate insight
// signals it was grounded in.
//
// Recommendations are drafts for lecturer review only — nothing is ever
// auto-edited, published, assigned, graded, or notified. The lecturer
// reviews each draft: accept, dismiss, add a note, or mark it as acted on.
// Every status change is appended to the `audit` JSON field with the
// reviewer id and timestamp, preserving a full trail.
//
// Reads are owner-only (the owning lecturer); students and public
// participants can never see recommendations, private extracted text, or
// audit details. All writes happen through the server-side superuser routes
// (/api/recommendations/generate and /api/recommendations/review) after
// verifying faculty identity and ownership — create/update/delete rules are
// null, so no client can write directly.
migrate(
  (app) => {
    let recommendations;
    try {
      recommendations = app.findCollectionByNameOrId("lecturer_recommendations");
    } catch (_) {
      const users = app.findCollectionByNameOrId("users");

      recommendations = new Collection({
        type: "base",
        name: "lecturer_recommendations",
        // Lecturer-private: only the owning lecturer may read their own
        // recommendation drafts. Writes are server-only (null rules) — the
        // API routes verify faculty identity and record ownership first.
        listRule: "@request.auth.id != '' && owner = @request.auth.id",
        viewRule: "@request.auth.id != '' && owner = @request.auth.id",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          // Exact academic scope the recommendation was generated for
          // (course / cpmk / subCpmk / session / assignment ids).
          { name: "scope", type: "json", maxSize: 50000 },
          // Phase 5 context bundle the recommendation was grounded in.
          { name: "bundleId", type: "text", required: true, max: 64 },
          // Full evidence: citations (file, version, section, page ref,
          // extraction timestamp), retrieval timestamp, aggregate insight
          // signals, and the bundle limits that applied.
          { name: "evidence", type: "json", maxSize: 200000 },
          // Observed evidence — only what is actually present in the
          // approved material and recorded signals.
          { name: "observed", type: "text", required: true, max: 2000 },
          // Interpretation — pedagogical meaning of the observed evidence.
          { name: "interpretation", type: "text", required: true, max: 2000 },
          // Suggested action — a concrete step the lecturer may take.
          { name: "action", type: "text", required: true, max: 2000 },
          // Related learning/assessment signal label (difficulty area).
          { name: "signal", type: "text", max: 300 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["draft", "accepted", "dismissed", "acted_on"],
          },
          // Lecturer's own review note.
          { name: "note", type: "text", max: 2000 },
          // Last reviewer (relation to users, no cascade — history stays).
          {
            name: "reviewedBy",
            type: "relation",
            required: false,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: "reviewedAt", type: "date" },
          // Append-only status trail: { status, reviewerId, at, note? }.
          { name: "audit", type: "json", maxSize: 100000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_lecturer_recs_owner ON lecturer_recommendations (owner)",
          "CREATE INDEX idx_lecturer_recs_status ON lecturer_recommendations (status)",
        ],
      });
      app.save(recommendations);
    }
  },
  (app) => {
    try {
      const recommendations = app.findCollectionByNameOrId("lecturer_recommendations");
      app.delete(recommendations);
    } catch (e) {
      if (!String(e?.message || e).includes("no rows in result set")) throw e;
    }
  },
);
