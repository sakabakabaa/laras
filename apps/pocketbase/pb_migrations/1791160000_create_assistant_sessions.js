/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 11 — explicit assistant sessions.
 *
 * Replaces the single global conversation model with explicit, owner-scoped
 * assistant sessions. Creates two new collections:
 *
 *   - assistant_sessions  — session metadata (title, status, context, counts)
 *   - assistant_messages  — per-session messages (role, content, tool metadata)
 *
 * Both are owner-scoped: a lecturer can only read/write their own sessions and
 * messages. The legacy `assistant_conversations` collection is PRESERVED and its
 * records are migrated into one initial session per owner ("Percakapan awal")
 * so no conversation history is lost. The old collection stays in place as a
 * compatibility layer; the runtime now reads/writes the new collections.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const sessions = new Collection({
      type: "base",
      name: "assistant_sessions",
      listRule: "@request.auth.id != '' && owner = @request.auth.id",
      viewRule: "@request.auth.id != '' && owner = @request.auth.id",
      createRule:
        "@request.auth.id != '' && @request.body.owner = @request.auth.id",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: "owner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "title", type: "text", required: true, max: 200 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "archived"],
        },
        { name: "feature", type: "text", max: 64 },
        { name: "entityType", type: "text", max: 64 },
        { name: "entityId", type: "text", max: 64 },
        { name: "summary", type: "text", max: 1000 },
        { name: "structuredContext", type: "json", maxSize: 50000 },
        { name: "messageCount", type: "number", onlyInt: true },
        { name: "lastMessageAt", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_assistant_sessions_owner ON assistant_sessions (owner)",
        "CREATE INDEX idx_assistant_sessions_status ON assistant_sessions (status)",
      ],
    });
    app.save(sessions);

    const messages = new Collection({
      type: "base",
      name: "assistant_messages",
      listRule: "@request.auth.id != '' && owner = @request.auth.id",
      viewRule: "@request.auth.id != '' && owner = @request.auth.id",
      createRule:
        "@request.auth.id != '' && @request.body.owner = @request.auth.id && session.owner = @request.auth.id",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: "session",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: sessions.id,
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
          name: "role",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["user", "assistant", "tool"],
        },
        { name: "content", type: "text", required: true, max: 20000 },
        { name: "toolName", type: "text", max: 64 },
        { name: "toolArgs", type: "json", maxSize: 20000 },
        { name: "toolResult", type: "json", maxSize: 200000 },
        {
          name: "actionStatus",
          type: "select",
          maxSelect: 1,
          values: [
            "none",
            "pending",
            "confirmed",
            "rejected",
            "executed",
            "failed",
          ],
        },
        { name: "tokenEstimate", type: "number", onlyInt: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_assistant_messages_session ON assistant_messages (session)",
        "CREATE INDEX idx_assistant_messages_owner ON assistant_messages (owner)",
      ],
    });
    app.save(messages);

    // Migrate legacy assistant_conversations into one initial session per owner.
    // The old collection is left intact as a compatibility layer.
    let legacy = null;
    try {
      legacy = app.findCollectionByNameOrId("assistant_conversations");
    } catch (_) {
      legacy = null;
    }

    if (legacy) {
      const rows = app.findAllRecords("assistant_conversations");
      const byOwner = new Map();
      for (const row of rows) {
        const owner = row.get("owner");
        if (!owner) continue;
        if (!byOwner.has(owner)) byOwner.set(owner, []);
        byOwner.get(owner).push(row);
      }

      const copyJson = (v) => {
        if (v == null) return null;
        if (typeof v === "object") {
          try {
            return JSON.parse(JSON.stringify(v));
          } catch (_) {
            return null;
          }
        }
        return v;
      };

      for (const [owner, ownerRows] of byOwner) {
        ownerRows.sort((a, b) => {
          const ca = a.get("created") || "";
          const cb = b.get("created") || "";
          if (ca < cb) return -1;
          if (ca > cb) return 1;
          return 0;
        });

        const sessionRec = new Record(sessions);
        sessionRec.set("owner", owner);
        sessionRec.set("title", "Percakapan awal");
        sessionRec.set("status", "active");
        sessionRec.set("messageCount", ownerRows.length);
        const last = ownerRows[ownerRows.length - 1];
        const lastCreated = last.get("created");
        if (lastCreated) sessionRec.set("lastMessageAt", lastCreated);
        app.save(sessionRec);

        for (const row of ownerRows) {
          const msg = new Record(messages);
          msg.set("session", sessionRec.id);
          msg.set("owner", owner);
          msg.set("role", row.get("role") || "user");
          msg.set("content", row.get("content") || "");
          msg.set("toolName", row.get("toolName") || "");
          msg.set("toolArgs", copyJson(row.get("toolArgs")));
          msg.set("toolResult", copyJson(row.get("toolResult")));
          msg.set("actionStatus", row.get("actionStatus") || "none");
          app.save(msg);
        }
      }
    }
  },
  (app) => {
    // Revert: drop the new collections. The legacy assistant_conversations
    // collection and its records are untouched by the down migration.
    try {
      const messages = app.findCollectionByNameOrId("assistant_messages");
      app.delete(messages);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      const sessions = app.findCollectionByNameOrId("assistant_sessions");
      app.delete(sessions);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);
