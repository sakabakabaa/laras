/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const courses = app.findCollectionByNameOrId('courses');

		const addText = (name, max) => {
			if (courses.fields.getByName(name)) return;
			courses.fields.add(
				new TextField({
					name,
					required: false,
					max: max || 0,
				}),
			);
		};
		const addNumber = (name) => {
			if (courses.fields.getByName(name)) return;
			courses.fields.add(
				new NumberField({
					name,
					required: false,
					min: 0,
				}),
			);
		};

		addNumber('credits');
		addText('prerequisites', 2000);
		addText('courseGroup', 200);
		addText('lecturerName', 200);
		if (!courses.fields.getByName('publishedAt')) {
			courses.fields.add(new DateField({ name: 'publishedAt', required: false }));
		}
		addNumber('workloadLecture');
		addNumber('workloadTutorial');
		addNumber('workloadPractice');
		addNumber('workloadIndependent');
		addNumber('workloadTotal');
		addText('strategies', 5000);
		addText('workloadNotes', 5000);
		addText('assessmentNotes', 5000);
		app.save(courses);

		let collab;
		try {
			collab = app.findCollectionByNameOrId('collaborative_tasks');
		} catch (_) {
			collab = new Collection({
				type: 'base',
				name: 'collaborative_tasks',
				listRule: "@request.auth.id != ''",
				viewRule: "@request.auth.id != ''",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && @request.body.course:changed = false",
				deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
				fields: [
					{
						name: 'owner',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{
						name: 'course',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: courses.id,
						cascadeDelete: true,
					},
					{ name: 'title', type: 'text', required: true, max: 300 },
					{ name: 'description', type: 'text', max: 5000 },
					{ name: 'objectives', type: 'text', max: 3000 },
					{ name: 'schedule', type: 'text', max: 2000 },
					{ name: 'groupInfo', type: 'text', max: 2000 },
					{ name: 'order', type: 'number', min: 0 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: ['CREATE INDEX idx_collab_course ON collaborative_tasks (course)'],
			});
			app.save(collab);
		}

		// Relations to outcomes on collaborative tasks
		const cpl = app.findCollectionByNameOrId('cpl');
		const cpmk = app.findCollectionByNameOrId('cpmk');
		const sub = app.findCollectionByNameOrId('sub_cpmk');
		const assessments = app.findCollectionByNameOrId('assessments');
		collab = app.findCollectionByNameOrId('collaborative_tasks');
		const addRel = (name, collectionId) => {
			if (collab.fields.getByName(name)) return;
			collab.fields.add(
				new RelationField({
					name,
					required: false,
					maxSelect: 30,
					collectionId,
					cascadeDelete: false,
				}),
			);
		};
		addRel('cpls', cpl.id);
		addRel('cpmks', cpmk.id);
		addRel('subCpmks', sub.id);
		addRel('assessments', assessments.id);
		app.save(collab);
	},
	(app) => {
		try {
			const collab = app.findCollectionByNameOrId('collaborative_tasks');
			app.delete(collab);
		} catch (_) {
			/* missing */
		}
		const courses = app.findCollectionByNameOrId('courses');
		const names = [
			'credits',
			'prerequisites',
			'courseGroup',
			'lecturerName',
			'publishedAt',
			'workloadLecture',
			'workloadTutorial',
			'workloadPractice',
			'workloadIndependent',
			'workloadTotal',
			'strategies',
			'workloadNotes',
			'assessmentNotes',
		];
		for (const n of names) {
			try {
				courses.fields.removeByName(n);
			} catch (_) {
				/* */
			}
		}
		app.save(courses);
	},
);
