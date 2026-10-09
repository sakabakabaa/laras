/// <reference path="../pb_data/types.d.ts" />

// Public file-library links are no longer supported. Existing public records
// become course-visible to students while staying owner-editable by faculty.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('file_library');
		for (const record of app.findRecordsByFilter('file_library', 'access = "public"', '', 10000, 0)) {
			record.set('access', 'student');
			app.save(record);
		}

		const access = collection.fields.getByName('access');
		access.values = ['faculty', 'student'];
		collection.listRule =
			"owner = @request.auth.id || (access = 'student' && course != '' && @request.auth.id != '' && @request.auth.role = 'student')";
		collection.viewRule = collection.listRule;
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('file_library');
		const access = collection.fields.getByName('access');
		access.values = ['faculty', 'student', 'public'];
		collection.listRule =
			"owner = @request.auth.id || access = 'public' || (course != '' && @request.auth.id != '' && @request.auth.role = 'student')";
		collection.viewRule = collection.listRule;
		app.save(collection);
	},
);
