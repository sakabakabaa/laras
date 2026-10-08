/// <reference path="../pb_data/types.d.ts" />

/**
 * Batch 1 — link a Latihan formatif practice to its parent Tugas formal.
 *
 * Adds `parentAssignment` (single self-relation on `assignments`) plus an
 * index for the "latihan persiapan terkait" lookup. Only Latihan formatif
 * rows carry the link (the app never sets it on formal activities), and
 * `cascadeDelete` stays off so deleting the formal task never deletes the
 * practice — the practice is independently editable and independently
 * graded-irrelevant (it has no official grade at all).
 */
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');

		if (!assignments.fields.getByName('parentAssignment')) {
			assignments.fields.add(
				new RelationField({
					name: 'parentAssignment',
					maxSelect: 1,
					collectionId: assignments.id,
					cascadeDelete: false,
				}),
			);
			assignments.indexes.push(
				'CREATE INDEX idx_assignments_parent ON assignments (parentAssignment)',
			);
			app.save(assignments);
		}
	},
	(app) => {
		try {
			const assignments = app.findCollectionByNameOrId('assignments');
			assignments.fields.removeByName('parentAssignment');
			assignments.indexes = assignments.indexes.filter(
				(index) => !String(index).includes('idx_assignments_parent'),
			);
			app.save(assignments);
		} catch (_) {
			/* collection or field already gone — nothing to revert */
		}
	},
);
