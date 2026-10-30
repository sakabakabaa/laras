/// <reference path="../pb_data/types.d.ts" />

/**
 * Adds the required `shape` (bentuk tugas) select to `assignments`.
 *
 * The shape drives the assignment builder: default stages, group settings,
 * and submission structure. Existing rows are backfilled from their mode
 * (collaborative → group_project, individual → individual) so no record is
 * left without a shape.
 */
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');
		assignments.fields.add(
			new SelectField({
				name: 'shape',
				required: false,
				maxSelect: 1,
				values: [
					'individual',
					'group_project',
					'case_study',
					'presentation',
					'practical',
					'portfolio',
					'discussion',
					'quiz',
				],
			}),
		);
		app.save(assignments);

		// Backfill: derive a sensible shape from the stored mode.
		const rows = app.findRecordsByFilter('assignments', "id != ''");
		for (const row of rows) {
			const current = row.get('shape');
			if (current) continue;
			row.set('shape', row.get('mode') === 'collaborative' ? 'group_project' : 'individual');
			app.save(row);
		}
	},
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');
		assignments.fields.removeByName('shape');
		app.save(assignments);
	},
);
