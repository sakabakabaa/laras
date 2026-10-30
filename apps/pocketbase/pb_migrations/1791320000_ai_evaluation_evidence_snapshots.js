/// <reference path="../pb_data/types.d.ts" />
// Additive generation-time evidence. No backfill: historical inputs are unknown.
// Entire prior rows are archived before regeneration; max-size failures must reject
// the overwrite, never silently truncate history. Students have no read access.
migrate(
 (app) => {
  const evaluations = app.findCollectionByNameOrId('ai_evaluations');
  for (const [name, maxSize] of [['researchSnapshot', 2000000], ['generationHistory', 20000000]]) {
   if (!evaluations.fields.getByName(name)) evaluations.fields.add(new JSONField({ name, maxSize }));
  }
  evaluations.listRule = "@request.auth.id != '' && owner = @request.auth.id";
  evaluations.viewRule = evaluations.listRule;
  evaluations.createRule = null;
  evaluations.updateRule = null;
  evaluations.deleteRule = null;
  app.save(evaluations);
 },
 (app) => {
  const evaluations = app.findCollectionByNameOrId('ai_evaluations');
  for (const name of ['researchSnapshot', 'generationHistory']) {
   if (evaluations.fields.getByName(name)) evaluations.fields.removeByName(name);
  }
  app.save(evaluations);
 },
);
