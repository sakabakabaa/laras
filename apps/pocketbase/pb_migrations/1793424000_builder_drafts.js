/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const relation = (name, target) =>
			new RelationField({
				name,
				collectionId: app.findCollectionByNameOrId(target).id,
				maxSelect: 1,
				required: true,
				cascadeDelete: false,
			});
		const create = (name, fields, indexes) => {
			const collection = new Collection({
				name,
				type: 'base',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
			});
			app.save(collection);
			for (const field of fields) collection.fields.add(field);
			app.save(collection);
			collection.indexes = indexes;
			app.save(collection);
		};
		create(
			'builder_documents',
			[
				relation('owner', 'users'),
				relation('course', 'courses'),
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
			[
				'CREATE UNIQUE INDEX idx_builder_creation ON builder_documents (owner, creationKey)',
			],
		);
		create(
			'builder_private_keys',
			[
				relation('document', 'builder_documents'),
				new JSONField({ name: 'keys', maxSize: 1000000 }),
			],
			[
				'CREATE UNIQUE INDEX idx_builder_keys_document ON builder_private_keys (document)',
			],
		);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('builder_private_keys'));
		app.delete(app.findCollectionByNameOrId('builder_documents'));
	},
);
