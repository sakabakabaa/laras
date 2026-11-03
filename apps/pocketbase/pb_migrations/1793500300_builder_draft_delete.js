migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('builder_documents');
		collection.fields.add(new BoolField({ name: 'deleted' }));
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('builder_documents');
		collection.fields.removeByName('deleted');
		app.save(collection);
	},
);
