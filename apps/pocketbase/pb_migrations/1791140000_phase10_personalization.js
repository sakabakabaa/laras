/// <reference path="../pb_data/types.d.ts" />

// Phase 10 — adaptive and personalized German L2 feedback.
//
// ADDITIVE only. Generic feedback remains the default; personalization
// requires explicit lecturer enablement per assignment. No historical feedback
// or grades are changed.
//
// 1. `assignments.feedbackMode` (select: generic | personalized, default
//    generic) — the control-condition switch. Generic is the default so
//    existing courses/assignments keep their current behavior.
// 2. `assignments.personalizationThreshold` (number, default 3) — the
//    configurable minimum number of validated observations before a learner
//    pattern is considered recurring. Never hard-coded in the app logic.
// 3. `personalization_logs` collection — research provenance for every
//    personalized feedback generation. Server-only writes (superuser client
//    in the API route); reads scoped to the assignment owner so only the
//    lecturer/researcher can review them. Stores NO free-text student
//    answer, NO grade, and NO internal model confidence — only the
//    personalization metadata requested by the research design.

migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');

		// 1. feedbackMode — generic (default) vs personalized.
		if (!assignments.fields.getByName('feedbackMode')) {
			assignments.fields.add(
				new SelectField({
					name: 'feedbackMode',
					required: false,
					maxSelect: 1,
					values: ['generic', 'personalized'],
				}),
			);
		}

		// 2. personalizationThreshold — configurable minimum observations.
		if (!assignments.fields.getByName('personalizationThreshold')) {
			assignments.fields.add(
				new NumberField({
					name: 'personalizationThreshold',
					required: false,
					min: 1,
					max: 20,
					onlyInt: true,
				}),
			);
		}
		app.save(assignments);

		// 3. personalization_logs — research provenance, server-only writes.
		let logs;
		try {
			logs = app.findCollectionByNameOrId('personalization_logs');
		} catch (_) {
			const users = app.findCollectionByNameOrId('users');
			logs = new Collection({
				type: 'base',
				name: 'personalization_logs',
				// Only the assignment owner (lecturer/researcher) may read.
				listRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				// All writes happen server-side via the superuser client.
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: 'assignment',
						type: 'relation',
						required: true,
						maxSelect: 1,
						minSelect: 0,
						collectionId: assignments.id,
						cascadeDelete: true,
					},
					{
						name: 'owner',
						type: 'relation',
						required: true,
						maxSelect: 1,
						minSelect: 0,
						collectionId: users.id,
						cascadeDelete: true,
					},
					// Stable pseudonymous learner key (same shape as check_attempts
					// identityKey: u:<userId> for enrolled, n:<nim>/g:<group> for
					// public). Never the raw student name or email.
					{ name: 'learnerKey', type: 'text', required: true, max: 120 },
					// The check_attempt id this personalization event produced.
					{ name: 'feedbackItemId', type: 'text', max: 64 },
					// Content hash of the learner profile snapshot used (version).
					{ name: 'learnerProfileVersion', type: 'text', max: 128 },
					{ name: 'personalizationEnabled', type: 'bool', required: true },
					// JSON array of validated category labels relevant to the
					// current error (e.g. ["Morphology","case"]). No student text.
					{ name: 'relevantCategories', type: 'json', maxSize: 10000 },
					{ name: 'historicalObservationCount', type: 'number', min: 0 },
					{
						name: 'feedbackStrategy',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: [
							'generic',
							'reflection',
							'concept',
							'focused',
							'explicit',
							'reduce_scaffolding',
						],
					},
					// Progressive hint level actually delivered (1–4).
					{ name: 'hintLevel', type: 'number', min: 0, max: 4, onlyInt: true },
					{ name: 'model', type: 'text', max: 64 },
					{ name: 'modelVersion', type: 'text', max: 64 },
					{ name: 'promptVersion', type: 'text', max: 64 },
					{ name: 'generatedAt', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				],
				indexes: [
					'CREATE INDEX idx_personalization_logs_assignment ON personalization_logs (assignment)',
					'CREATE INDEX idx_personalization_logs_learner ON personalization_logs (learnerKey)',
				],
			});
			app.save(logs);
		}
	},
	(app) => {
		// Revert: remove the two fields and drop the collection.
		try {
			const assignments = app.findCollectionByNameOrId('assignments');
			if (assignments.fields.getByName('feedbackMode')) {
				assignments.fields.removeByName('feedbackMode');
			}
			if (assignments.fields.getByName('personalizationThreshold')) {
				assignments.fields.removeByName('personalizationThreshold');
			}
			app.save(assignments);
		} catch (e) {
			if (!e.message.includes('no rows in result set')) throw e;
		}
		try {
			const logs = app.findCollectionByNameOrId('personalization_logs');
			app.delete(logs);
		} catch (e) {
			if (!e.message.includes('no rows in result set')) throw e;
		}
	},
);
