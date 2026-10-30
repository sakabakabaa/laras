/// <reference path="../pb_data/types.d.ts" />

// Student-authored learning preferences. Access is mediated by authenticated
// API routes so lecturer sharing and AI personalization can be independently
// consented to and scoped.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		try {
			app.findCollectionByNameOrId('student_learning_profiles');
			return;
		} catch (_) {
			const collection = new Collection({
				type: 'base',
				name: 'student_learning_profiles',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'student', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
					{ name: 'goals', type: 'text', max: 2000 },
					{ name: 'priorExperience', type: 'text', max: 2000 },
					{ name: 'confidence', type: 'select', maxSelect: 1, values: ['low', 'medium', 'high'] },
					{ name: 'explanationLanguage', type: 'select', maxSelect: 1, values: ['id', 'en', 'de'] },
					{ name: 'supportPreference', type: 'select', maxSelect: 1, values: ['examples', 'steps', 'concise'] },
					{ name: 'shareWithLecturer', type: 'bool' },
					{ name: 'aiPersonalization', type: 'bool' },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: ['CREATE UNIQUE INDEX idx_student_learning_profiles_student ON student_learning_profiles (student)'],
			});
			app.save(collection);
		}
	},
	(app) => {
		try { app.delete(app.findCollectionByNameOrId('student_learning_profiles')); } catch (_) { /* already gone */ }
	},
);
