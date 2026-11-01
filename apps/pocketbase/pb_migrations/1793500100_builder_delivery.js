/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const relation = (name, target, required = true) =>
			new RelationField({
				name,
				collectionId: app.findCollectionByNameOrId(target).id,
				maxSelect: 1,
				required,
				cascadeDelete: false,
			});
		const create = (name, fields, indexes = []) => {
			const c = new Collection({
				name,
				type: 'base',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
			});
			app.save(c);
			for (const field of fields) c.fields.add(field);
			app.save(c);
			c.indexes = indexes;
			app.save(c);
		};
		create(
			'builder_versions',
			[
				relation('document', 'builder_documents'),
				relation('owner', 'users'),
				relation('course', 'courses'),
				new NumberField({ name: 'revision', min: 1, onlyInt: true }),
				new TextField({ name: 'commandId', max: 80, required: true }),
				new JSONField({ name: 'content', maxSize: 2000000 }),
				new AutodateField({ name: 'created', onCreate: true }),
			],
			[
				'CREATE UNIQUE INDEX idx_builder_version_command ON builder_versions (owner, commandId)',
			],
		);
		create(
			'builder_version_keys',
			[
				relation('version', 'builder_versions'),
				new JSONField({ name: 'keys', maxSize: 1000000 }),
			],
			[
				'CREATE UNIQUE INDEX idx_builder_version_keys ON builder_version_keys (version)',
			],
		);
		create(
			'builder_runs',
			[
				relation('version', 'builder_versions'),
				relation('owner', 'users'),
				relation('course', 'courses'),
				new TextField({ name: 'title', max: 200 }),
				new SelectField({
					name: 'kind',
					values: ['kelas', 'tugas'],
					maxSelect: 1,
				}),
				new NumberField({ name: 'activeIndex', min: 0, onlyInt: true }),
				new BoolField({ name: 'closed' }),
				new AutodateField({ name: 'created', onCreate: true }),
			],
			['CREATE UNIQUE INDEX idx_builder_run_version ON builder_runs (version)'],
		);
		create(
			'builder_responses',
			[
				relation('run', 'builder_runs'),
				relation('student', 'users'),
				new JSONField({ name: 'answers', maxSize: 1000000 }),
				new JSONField({ name: 'submittedActivities', maxSize: 10000 }),
				new DateField({ name: 'startedAt' }),
				new DateField({ name: 'submittedAt' }),
				new NumberField({ name: 'revision', min: 1, onlyInt: true }),
				new JSONField({ name: 'manual', maxSize: 1000000 }),
				new JSONField({ name: 'released', maxSize: 1000000 }),
				new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
			],
			[
				'CREATE UNIQUE INDEX idx_builder_response_student ON builder_responses (run, student)',
			],
		);
	},
	(app) => {
		for (const name of [
			'builder_responses',
			'builder_runs',
			'builder_version_keys',
			'builder_versions',
		])
			app.delete(app.findCollectionByNameOrId(name));
	},
);
