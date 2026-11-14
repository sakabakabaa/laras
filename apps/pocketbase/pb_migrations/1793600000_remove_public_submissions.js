/// <reference path="../pb_data/types.d.ts" />

// Public (anonymous, link-based) submissions were removed from the product.
// This migration drops the now-unused `public_submissions` collection and the
// `ai_evaluations.publicSubmission` relation (plus its unique index) that
// pointed at it. The relation must go first: PocketBase refuses to delete a
// collection that another collection still references.
//
// DESTRUCTIVE: every row and stored file in `public_submissions` is deleted
// and cannot be restored by rolling back. Export the collection first if its
// contents are needed. `assignment_submissions.linkedFromPublic` and
// `assignments.publicToken` are left in place on purpose: the former is locked
// by an existing update rule, the latter backs the login-gated /tugas/:token
// link.
migrate(
	(app) => {
		let evaluations = null;
		try {
			evaluations = app.findCollectionByNameOrId('ai_evaluations');
		} catch (_) {
			evaluations = null;
		}
		if (evaluations) {
			evaluations.indexes = evaluations.indexes.filter((index) => !index.includes('idx_ai_eval_public'));
			if (evaluations.fields.getByName('publicSubmission')) {
				evaluations.fields.removeByName('publicSubmission');
			}
			app.save(evaluations);
		}

		let publicSubmissions = null;
		try {
			publicSubmissions = app.findCollectionByNameOrId('public_submissions');
		} catch (_) {
			publicSubmissions = null;
		}
		if (publicSubmissions) app.delete(publicSubmissions);
	},
	() => {
		// Intentionally a no-op: the dropped data cannot be restored. To bring the
		// feature back, re-create the collection from the original migrations
		// (1790700484, 1790713888, 1790845000, 1790864000, 1790767000).
	},
);
