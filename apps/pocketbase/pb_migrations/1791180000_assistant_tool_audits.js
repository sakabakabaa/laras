/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 13 — assistant tool audit log.
 *
 * A privacy-minimized, append-only audit record for every tool execution and
 * confirmation in the LARAS Asisten Dosen. One row per tool attempt captures:
 *   - session + message (correlation back to the conversation)
 *   - tool name + sanitized arguments (no drafts, no document text, no secrets)
 *   - status (success / failed / denied / pending / confirmed / rejected)
 *   - result metadata (ok, source provenance, error code, link)
 *   - duration in milliseconds
 *   - confirmation state (none / pending / confirmed / rejected)
 *
 * The collection is append-only from the REST perspective: the runtime only
 * ever creates rows (through the lecturer's own token), and update/delete are
 * denied to everyone so the audit trail cannot be rewritten by a client.
 * Reads are owner-scoped so a lecturer can review their own tool history.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const sessions = app.findCollectionByNameOrId("assistant_sessions");
    const messages = app.findCollectionByNameOrId("assistant_messages");

    const audits = new Collection({
      type: "base",
      name: "assistant_tool_audits",
      // Owner-scoped reads: a lecturer may review only their own tool history.
      listRule: "@request.auth.id != '' && owner = @request.auth.id",
      viewRule: "@request.auth.id != '' && owner = @request.auth.id",
      // Creates are allowed only for the session owner, so a message/session
      // belonging to another lecturer can never be referenced.
      createRule:
        "@request.auth.id != '' && @request.body.owner = @request.auth.id && session.owner = @request.auth.id",
      // Append-only: nobody may rewrite or delete an audit row via REST. The
      // runtime never updates or deletes these records.
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
        {
          name: "session",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: sessions.id,
          cascadeDelete: true,
        },
        {
          name: "message",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: messages.id,
          cascadeDelete: false,
        },
        { name: "tool", type: "text", required: true, max: 64 },
        { name: "args", type: "json", maxSize: 20000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "success",
            "failed",
            "denied",
            "pending",
            "confirmed",
            "rejected",
          ],
        },
        { name: "resultMeta", type: "json", maxSize: 10000 },
        { name: "durationMs", type: "number", onlyInt: true },
        {
          name: "confirmationState",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["none", "pending", "confirmed", "rejected"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_assistant_tool_audits_session ON assistant_tool_audits (session)",
        "CREATE INDEX idx_assistant_tool_audits_owner ON assistant_tool_audits (owner)",
        "CREATE INDEX idx_assistant_tool_audits_tool ON assistant_tool_audits (tool)",
      ],
    });
    app.save(audits);
  },
  (app) => {
    try {
      const audits = app.findCollectionByNameOrId("assistant_tool_audits");
      app.delete(audits);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
