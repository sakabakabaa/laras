/// <reference path="../pb_data/types.d.ts" />

// Additive only: a provisional `suggestedCriteria` json field on `assignments`
// for rubric-criterion suggestions derived from a writing/speaking task's own
// data. This is a task-creation affordance — it NEVER holds the assignment's
// real criteria (those live inside `taskConfig`), never affects grading, the
// factors breakdown, the divergence warning, transcript confidence, or any
// published score. scoringVersion is intentionally NOT bumped.
//
// The field is owner-writable (the lecturer requests/accepts/dismisses
// suggestions on their own task) and is not privileged, so no access-rule
// change is required — the existing owner-scoped create/update rules already
// govern it. Existing assignments keep `suggestedCriteria` null and behave
// exactly as before.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('assignments');
		if (!collection.fields.getByName('suggestedCriteria')) {
			collection.fields.add(new JSONField({ name: 'suggestedCriteria', maxSize: 50000 }));
			app.save(collection);
		}
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('assignments');
		if (collection.fields.getByName('suggestedCriteria')) {
			collection.fields.removeByName('suggestedCriteria');
			app.save(collection);
		}
	},
);
