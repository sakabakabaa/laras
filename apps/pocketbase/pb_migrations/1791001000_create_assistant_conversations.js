/// <reference path="../pb_data/types.d.ts" />

/**
 * Lecturer AI assistant conversation log. Stores the per-lecturer chat history
 * for the LARAS assistant (Asisten Dosen), including tool-call metadata and
 * the confirmation state of any record-creating action.
 *
 * Owner-scoped: only the lecturer who owns the conversation can read it. Writes
 * happen server-side through the user's own token (create) or superuser
 * (status updates after confirmation), always after faculty auth is verified.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const collection = new Collection({
      type: "base",
      name: "assistant_conversations",
      listRule: "@request.auth.id != '' && owner = @request.auth.id",
      viewRule: "@request.auth.id != '' && owner = @request.auth.id",
      createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
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
        {
          name: "role",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["user", "assistant"],
        },
        { name: "content", type: "text", required: true, max: 20000 },
        { name: "toolName", type: "text", max: 64 },
        { name: "toolArgs", type: "json", maxSize: 20000 },
        { name: "toolResult", type: "json", maxSize: 200000 },
        {
          name: "actionStatus",
          type: "select",
          maxSelect: 1,
          values: ["none", "pending", "confirmed", "rejected", "executed", "failed"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("assistant_conversations");
    app.delete(collection);
  },
);
