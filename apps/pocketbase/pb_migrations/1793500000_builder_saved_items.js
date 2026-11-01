/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const c = new Collection({
			name: 'builder_saved_items',
			type: 'base',
			listRule: null,
			viewRule: null,
			createRule: null,
			updateRule: null,
			deleteRule: null,
		});
		app.save(c);
		for (const [name, target, required] of [
			['owner', 'users', true],
			['course', 'courses', true],
			['document', 'builder_documents', false],
		])
			c.fields.add(
				new RelationField({
					name,
					collectionId: app.findCollectionByNameOrId(target).id,
					maxSelect: 1,
					required,
					cascadeDelete: false,
				}),
			);
		c.fields.add(
			new SelectField({
				name: 'kind',
				values: ['snapshot', 'template'],
				maxSelect: 1,
				required: true,
			}),
		);
		c.fields.add(new TextField({ name: 'title', max: 200, required: true }));
		c.fields.add(new NumberField({ name: 'revision', min: 1, onlyInt: true }));
		c.fields.add(new JSONField({ name: 'envelope', maxSize: 3000000 }));
		c.fields.add(new TextField({ name: 'commandId', max: 80, required: true }));
		c.fields.add(new AutodateField({ name: 'created', onCreate: true }));
		app.save(c);
		c.indexes = [
			'CREATE UNIQUE INDEX idx_builder_saved_command ON builder_saved_items (owner, commandId)',
		];
		app.save(c);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('builder_saved_items'));
	},
);
