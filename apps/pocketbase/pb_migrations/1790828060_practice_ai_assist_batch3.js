/// <reference path="../pb_data/types.d.ts" />

/**
 * Batch 3 — optional AI assistance for Latihan formatif practices.
 *
 * Adds `aiAssistEnabled` (bool, off by default) to `assignments`. Only a
 * lecturer can turn it on per practice from the assignment form; it is
 * meaningful only for formative activities (the student practice view is the
 * only consumer). AI assistance is guidance-only: it never touches grades,
 * submissions, evaluation drafts, or publishing — no other collection or rule
 * changes are needed.
 */
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');

		if (!assignments.fields.getByName('aiAssistEnabled')) {
			assignments.fields.add(
				new BoolField({
					name: 'aiAssistEnabled',
					required: false,
				}),
			);
			app.save(assignments);
		}
	},
	(app) => {
		try {
			const assignments = app.findCollectionByNameOrId('assignments');
			assignments.fields.removeByName('aiAssistEnabled');
			app.save(assignments);
		} catch (_) {
			/* collection or field already gone — nothing to revert */
		}
	},
);
