/// <reference path="../pb_data/types.d.ts" />

// Short-term learner focus and minimal interaction evidence for guided practice.
// Answers to reflection checks are evaluated in memory and are never stored.
migrate(
	(app) => {
		const profile = app.findCollectionByNameOrId('student_learning_profiles');
		if (!profile.fields.getByName('currentGoal')) {
			profile.fields.add(new TextField({ name: 'currentGoal', max: 500 }));
			app.save(profile);
		}

		const attempts = app.findCollectionByNameOrId('personal_practice_attempts');
		let interactions;
		try {
			interactions = app.findCollectionByNameOrId('personal_practice_interactions');
		} catch (_) {
			interactions = new Collection({
				type: 'base',
				name: 'personal_practice_interactions',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'attempt', type: 'relation', required: true, maxSelect: 1, collectionId: attempts.id, cascadeDelete: true },
					{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['lesson_opened', 'lesson_check'] },
					{ name: 'verdict', type: 'select', maxSelect: 1, values: ['correct', 'partially_correct', 'needs_work', 'uncertain'] },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				],
				indexes: ['CREATE INDEX idx_practice_interactions_attempt ON personal_practice_interactions (attempt, kind, created)'],
			});
			app.save(interactions);
		}
	},
	(app) => {
		try { app.delete(app.findCollectionByNameOrId('personal_practice_interactions')); } catch (_) { /* already gone */ }
		try {
			const profile = app.findCollectionByNameOrId('student_learning_profiles');
			profile.fields.removeByName('currentGoal');
			app.save(profile);
		} catch (_) { /* profile migration not applied */ }
	},
);
