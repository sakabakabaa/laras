/// <reference path="../pb_data/types.d.ts" />

/**
 * Staged AI feedback for image/document submissions.
 *
 * `ai_feedback` stores every progressive hint requested by a student on their
 * own submission: the extracted-content snapshot used, the criteria snapshot,
 * the hint level (1 area/reflection, 2 concept, 3 focused), the student's
 * understood/unclear mark, and the lecturer's review state (pending/approved/
 * edited/rejected) plus release control.
 *
 * Creates are server-route only (createRule: null) so hints are always grounded
 * by the server; students read their own rows, lecturers read rows for
 * assignments they own, and only the lecturer may delete.
 */
migrate(
	(app) => {
		try {
			app.findCollectionByNameOrId('ai_feedback');
		} catch (_) {
			const assignments = app.findCollectionByNameOrId('assignments');
			const submissions = app.findCollectionByNameOrId('assignment_submissions');
			const users = app.findCollectionByNameOrId('users');

			const rows = new Collection({
				type: 'base',
				name: 'ai_feedback',
				listRule:
					"@request.auth.id != '' && (owner = @request.auth.id || assignment.owner = @request.auth.id)",
				viewRule:
					"@request.auth.id != '' && (owner = @request.auth.id || assignment.owner = @request.auth.id)",
				createRule: null,
				updateRule:
					"@request.auth.id != '' && (owner = @request.auth.id || assignment.owner = @request.auth.id)",
				deleteRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				fields: [
					{
						name: 'assignment',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: assignments.id,
						cascadeDelete: true,
					},
					{
						name: 'submission',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: submissions.id,
						cascadeDelete: true,
					},
					{
						name: 'owner',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{ name: 'attempt', type: 'number', min: 0 },
					{ name: 'level', type: 'number', required: true, min: 1, max: 3 },
					{ name: 'area', type: 'text', max: 200 },
					{ name: 'hint', type: 'text', required: true, max: 3000 },
					{ name: 'evidence', type: 'text', max: 1000 },
					{ name: 'focus', type: 'text', max: 500 },
					{ name: 'extracted', type: 'json', maxSize: 200000 },
					{ name: 'criteria', type: 'json', maxSize: 50000 },
					{
						name: 'status',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['open', 'understood', 'unclear'],
					},
					{
						name: 'review',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['pending', 'approved', 'edited', 'rejected'],
					},
					{ name: 'released', type: 'bool' },
					{ name: 'lecturerNote', type: 'text', max: 2000 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE INDEX idx_ai_feedback_submission ON ai_feedback (submission)',
					'CREATE INDEX idx_ai_feedback_assignment ON ai_feedback (assignment)',
				],
			});
			app.save(rows);
		}
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('ai_feedback'));
		} catch (_) {}
	},
);
