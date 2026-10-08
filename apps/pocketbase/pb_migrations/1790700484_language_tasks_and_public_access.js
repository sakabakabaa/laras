/// <reference path="../pb_data/types.d.ts" />

/**
 * Language-learning task types + public assignment access.
 *
 * - Keeps every existing `shape` value so stored assignments stay valid.
 * - Adds primary language-skill shapes (speaking, reading, conversation,
 *   vocabulary, language_project) without deleting legacy academic shapes.
 * - Adds lecturer-controlled public link fields.
 * - `public_submissions` is separate from enrolled `assignment_submissions`.
 *   Anonymous REST create is denied; the server route writes rows after
 *   checking name/NIM or group identity, deadline, and duplicates.
 */
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');
		const shape = assignments.fields.getByName('shape');
		shape.values = [
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
			'speaking',
			'reading',
			'conversation',
			'vocabulary',
			'language_project',
		];

		if (!assignments.fields.getByName('publicEnabled')) {
			assignments.fields.add(new BoolField({ name: 'publicEnabled' }));
		}
		if (!assignments.fields.getByName('publicToken')) {
			assignments.fields.add(new TextField({ name: 'publicToken', required: false, max: 64 }));
		}
		if (!assignments.fields.getByName('publicMax')) {
			assignments.fields.add(new NumberField({ name: 'publicMax', required: false, min: 0 }));
		}
		app.save(assignments);

		try {
			app.findCollectionByNameOrId('public_submissions');
		} catch (_) {
			const rows = new Collection({
				type: 'base',
				name: 'public_submissions',
				listRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				createRule: null,
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
					{ name: 'participantName', type: 'text', required: true, max: 200 },
					{ name: 'nim', type: 'text', max: 40 },
					{ name: 'groupName', type: 'text', max: 200 },
					{ name: 'members', type: 'text', max: 2000 },
					{ name: 'identityKey', type: 'text', required: true, max: 120 },
					{ name: 'content', type: 'text', max: 10000 },
					{
						name: 'files',
						type: 'file',
						maxSelect: 10,
						maxSize: 20971520,
						mimeTypes: [
							'application/pdf',
							'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
							'application/msword',
							'image/jpeg',
							'image/png',
							'image/webp',
							'audio/mpeg',
							'audio/wav',
							'audio/ogg',
							'audio/aac',
							'audio/mp4',
							'audio/x-m4a',
							'video/mp4',
							'video/webm',
							'video/quicktime',
						],
					},
					{ name: 'link', type: 'url' },
					{ name: 'taskAnswers', type: 'json', maxSize: 200000 },
					{ name: 'autoScore', type: 'number', min: 0, max: 100 },
					{
						name: 'status',
						type: 'select',
						maxSelect: 1,
						values: ['submitted', 'late', 'graded'],
					},
					{ name: 'grade', type: 'number', min: 0, max: 100 },
					{ name: 'feedback', type: 'text', max: 5000 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_public_sub_identity ON public_submissions (assignment, identityKey)',
					'CREATE INDEX idx_public_sub_assignment ON public_submissions (assignment)',
				],
			});
			app.save(rows);
		}
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('public_submissions'));
		} catch (_) {}
		const assignments = app.findCollectionByNameOrId('assignments');
		for (const name of ['publicEnabled', 'publicToken', 'publicMax']) {
			try {
				assignments.fields.removeByName(name);
			} catch (_) {}
		}
		const shape = assignments.fields.getByName('shape');
		shape.values = [
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
		app.save(assignments);
	},
);
