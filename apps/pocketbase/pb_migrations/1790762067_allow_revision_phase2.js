/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 2 activity separation: `allowRevision` on `assignments`.
 *
 * Tugas formal only — documents the lecturer's revision policy for the
 * final submission (students may resubmit after lecturer feedback, before
 * the submission is graded). Optional bool, defaults to false, so every
 * existing activity keeps its current behavior.
 */
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');

		if (!assignments.fields.getByName('allowRevision')) {
			assignments.fields.add(new BoolField({ name: 'allowRevision' }));
			app.save(assignments);
		}
	},
	(app) => {
		try {
			const assignments = app.findCollectionByNameOrId('assignments');
			assignments.fields.removeByName('allowRevision');
			app.save(assignments);
		} catch (_) {
			/* collection or field already gone — nothing to revert */
		}
	},
);
