/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 12 — durable session context & compaction metadata.
 *
 * Adds the fields the compaction runtime needs to `assistant_sessions`:
 *
 *   - summaryVersion        — incremented each time the session is compacted
 *   - lastCompactedMessageId — id of the newest message folded into the summary
 *   - estimatedTokens       — cached token estimate of the recent window + summary
 *
 * `summary` and `structuredContext` already exist on the collection (created in
 * 1791160000). `summary` is repurposed from a "latest content slice" hint into
 * the compacted narrative summary; `structuredContext` holds the structured
 * session state (goal, decisions, entities, …). Both are written only by the
 * compaction step now, never overwritten by per-message `touchSession`.
 *
 * Additive only: no existing field is removed or narrowed, and no data is
 * migrated. Original messages are NEVER deleted — the database remains the
 * complete historical record; only the model context is compacted.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("assistant_sessions");

    collection.fields.add(
      new NumberField({
        name: "summaryVersion",
        onlyInt: true,
      }),
    );

    collection.fields.add(
      new TextField({
        name: "lastCompactedMessageId",
        max: 64,
      }),
    );

    collection.fields.add(
      new NumberField({
        name: "estimatedTokens",
        onlyInt: true,
      }),
    );

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("assistant_sessions");
    collection.fields.removeByName("summaryVersion");
    collection.fields.removeByName("lastCompactedMessageId");
    collection.fields.removeByName("estimatedTokens");
    app.save(collection);
  },
);
