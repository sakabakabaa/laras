/// <reference path="../pb_data/types.d.ts" />

/**
 * Shared task-type foundation for specialized assignments.
 *
 * 1. `assignments.shape` gains `listening` (Menyimak) and `writing` (Menulis)
 *    alongside the existing `quiz` (Kuis) shape.
 * 2. `assignments.taskConfig` (json) stores the type-specific, student-visible
 *    configuration — questions, options, points, media, rubric — WITHOUT
 *    correct answers, which live in the owner-only `task_answer_keys`.
 * 3. `assignment_submissions` gains:
 *    - `taskAnswers` (json) — the student's progressive answers / draft state
 *      (writable by the owning student),
 *    - `autoScore` (number) — server-computed score for auto-gradable
 *      questions, locked from student writes via `:isset` / `:changed`,
 *    - `taskReview` (json) — lecturer-only rubric scores / notes, locked the
 *      same way,
 *    - a `draft` submission status so students can save progress before the
 *      final collection.
 * 4. New `task_answer_keys` collection: the answer key per assignment, visible
 *    only to the assignment's faculty owner. Auto-grading runs server-side
 *    (superuser) so students never see the key.
 */
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');

		// ── 1. shape values + taskConfig ──────────────────────────
		const shapeField = assignments.fields.getByName('shape');
		shapeField.values = [
			'individual',
			'group_project',
			'case_study',
			'presentation',
			'practical',
			'portfolio',
			'discussion',
			'quiz',
			'listening',
			'writing',
		];

		if (!assignments.fields.getByName('taskConfig')) {
			assignments.fields.add(
				new JSONField({
					name: 'taskConfig',
					required: false,
					maxSize: 200000,
				}),
			);
		}
		app.save(assignments);

		// ── 2. submission fields + draft status + locked fields ───
		const submissions = app.findCollectionByNameOrId('assignment_submissions');

		const statusField = submissions.fields.getByName('status');
		statusField.values = ['draft', 'submitted', 'late', 'revision', 'graded'];

		if (!submissions.fields.getByName('taskAnswers')) {
			submissions.fields.add(
				new JSONField({
					name: 'taskAnswers',
					required: false,
					maxSize: 200000,
				}),
			);
		}
		if (!submissions.fields.getByName('autoScore')) {
			submissions.fields.add(
				new NumberField({
					name: 'autoScore',
					required: false,
					min: 0,
					max: 100,
				}),
			);
		}
		if (!submissions.fields.getByName('taskReview')) {
			submissions.fields.add(
				new JSONField({
					name: 'taskReview',
					required: false,
					maxSize: 100000,
				}),
			);
		}

		// Students may write their own answers but never the server-computed
		// autoScore or the lecturer's taskReview.
		submissions.createRule =
			"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false && @request.body.autoScore:isset = false && @request.body.taskReview:isset = false";
		submissions.updateRule =
			"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false && @request.body.autoScore:changed = false && @request.body.taskReview:changed = false) || assignment.owner = @request.auth.id)";
		app.save(submissions);

		// ── 3. owner-only answer keys ─────────────────────────────
		try {
			app.findCollectionByNameOrId('task_answer_keys');
		} catch (_) {
			const keys = new Collection({
				type: 'base',
				name: 'task_answer_keys',
				// Only the assignment's faculty owner may read or write the key.
				listRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				createRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				updateRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
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
					{ name: 'key', type: 'json', required: false, maxSize: 200000 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_task_keys_assignment ON task_answer_keys (assignment)',
				],
			});
			app.save(keys);
		}
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('task_answer_keys'));
		} catch (_) {
			/* already absent */
		}

		const submissions = app.findCollectionByNameOrId('assignment_submissions');
		submissions.createRule =
			"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false";
		submissions.updateRule =
			"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false) || assignment.owner = @request.auth.id)";
		for (const name of ['taskAnswers', 'autoScore', 'taskReview']) {
			try {
				submissions.fields.removeByName(name);
			} catch (_) {
				/* already absent */
			}
		}
		const statusField = submissions.fields.getByName('status');
		statusField.values = ['submitted', 'late', 'revision', 'graded'];
		app.save(submissions);

		const assignments = app.findCollectionByNameOrId('assignments');
		const shapeField = assignments.fields.getByName('shape');
		shapeField.values = [
			'individual',
			'group_project',
			'case_study',
			'presentation',
			'practical',
			'portfolio',
			'discussion',
			'quiz',
		];
		try {
			assignments.fields.removeByName('taskConfig');
		} catch (_) {
			/* already absent */
		}
		app.save(assignments);
	},
);
