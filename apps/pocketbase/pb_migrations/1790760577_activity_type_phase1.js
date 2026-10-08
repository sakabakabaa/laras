/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 1 activity separation: `activityType` on `assignments`.
 *
 * - `formal`   → Tugas formal (graded, counts toward official assessment).
 * - `formative`→ Latihan formatif (practice; Cek jawaban stays available).
 *
 * Backfill: every existing activity defaults to `formal`. No stored field
 * clearly marks an activity as formative practice, so nothing is switched.
 * The field is optional at the DB level so pre-backfill rows stay valid;
 * the app always sends an explicit value on create/update.
 */
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');

		if (!assignments.fields.getByName('activityType')) {
			assignments.fields.add(
				new SelectField({
					name: 'activityType',
					maxSelect: 1,
					values: ['formal', 'formative'],
				}),
			);
			app.save(assignments);
		}

		// Single-select unset rows store '' — normalize them to 'formal'.
		// Any row the filter misses still reads as 'formal' in the app
		// (`activityTypeOf` defaults legacy/empty values to formal).
		const rows = app.findRecordsByFilter(
			'assignments',
			"activityType = ''",
			'-created',
			500,
			0,
		);
		for (const row of rows) {
			row.set('activityType', 'formal');
			app.save(row);
		}
	},
	(app) => {
		try {
			const assignments = app.findCollectionByNameOrId('assignments');
			assignments.fields.removeByName('activityType');
			app.save(assignments);
		} catch (_) {
			/* collection or field already gone — nothing to revert */
		}
	},
);
