/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users'),
			courses = app.findCollectionByNameOrId('courses');
		const drafts = new Collection({
			name: 'builder_documents',
			type: 'base',
			listRule: null,
			viewRule: null,
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				new RelationField({
					name: 'owner',
					collectionId: users.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: false,
				}),
				new RelationField({
					name: 'course',
					collectionId: courses.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: false,
				}),
				new TextField({ name: 'title', max: 200, required: true }),
				new SelectField({
					name: 'kind',
					values: ['kelas', 'tugas'],
					maxSelect: 1,
					required: true,
				}),
				new NumberField({
					name: 'revision',
					min: 1,
					onlyInt: true,
					required: true,
				}),
				new JSONField({ name: 'document', maxSize: 2000000 }),
				new TextField({ name: 'creationKey', max: 80, required: true }),
				new TextField({ name: 'lastSaveId', max: 80 }),
				new AutodateField({ name: 'created', onCreate: true }),
				new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_builder_creation ON builder_documents (owner, creationKey)',
			],
		});
		app.save(drafts);
		app.save(
			new Collection({
				name: 'builder_private_keys',
				type: 'base',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					new RelationField({
						name: 'document',
						collectionId: drafts.id,
						maxSelect: 1,
						required: true,
						cascadeDelete: false,
					}),
					new JSONField({ name: 'keys', maxSize: 1000000 }),
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_builder_keys_document ON builder_private_keys (document)',
				],
			}),
		);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('builder_private_keys'));
		app.delete(app.findCollectionByNameOrId('builder_documents'));
	},
);
