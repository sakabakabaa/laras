/// <reference path="../pb_data/types.d.ts" />

/**
 * AI usage audit events — persisted diagnostic records for the AI assistant
 * rate-limiting / usage-protection layer.
 *
 * Stores ONLY diagnostic metadata (user, role, capability, assignment,
 * weight, allowed/denied, denial reason, timestamp). NEVER student prompts
 * or AI responses. Counters themselves stay in process memory (TTL-based);
 * these rows are the audit trail for diagnosing abuse and answering "how much
 * AI usage has this user consumed".
 *
 * Writes are server-only (superuser via pocketbaseAdmin), so createRule is
 * null. Reads are owner-scoped and faculty-only: a lecturer may read their
 * own usage for a simple settings indicator; students can never read
 * internal rate-limit information.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const collection = new Collection({
      type: "base",
      name: "ai_usage_events",
      // Owner-scoped, faculty-only reads. Students cannot read their own
      // (or anyone's) usage audit — internal rate-limit data is not exposed.
      listRule:
        "@request.auth.id != '' && owner = @request.auth.id && @request.auth.role = 'faculty'",
      viewRule:
        "@request.auth.id != '' && owner = @request.auth.id && @request.auth.role = 'faculty'",
      // Server-only writes (pocketbaseAdmin / superuser).
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
        { name: "role", type: "text", max: 24 },
        { name: "capability", type: "text", max: 64 },
        { name: "assignment", type: "text", max: 64 },
        { name: "usageWeight", type: "number", onlyInt: true },
        { name: "allowed", type: "bool", required: true },
        { name: "denialReason", type: "text", max: 32 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_ai_usage_events_owner ON ai_usage_events (owner)",
        "CREATE INDEX idx_ai_usage_events_created ON ai_usage_events (created)",
        "CREATE INDEX idx_ai_usage_events_allowed ON ai_usage_events (allowed)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("ai_usage_events");
    app.delete(collection);
  },
);
