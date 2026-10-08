/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const courses = app.findCollectionByNameOrId("courses");

		const collection = new Collection({
			type: "base",
			name: "course_roster",
			// Lecturer-managed student roster: only the course owner (dosen) can
			// read or change the roster for their mata kuliah. Students do not
			// have accounts yet in Phase 1, so this is decoupled from the
			// self-enrollment `enrollments` collection.
			listRule:
				"@request.auth.id != '' && course.owner = @request.auth.id",
			viewRule:
				"@request.auth.id != '' && course.owner = @request.auth.id",
			createRule:
				"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
			updateRule:
				"@request.auth.id != '' && course.owner = @request.auth.id && @request.body.owner:changed = false && @request.body.course:changed = false",
			deleteRule:
				"@request.auth.id != '' && course.owner = @request.auth.id",
			fields: [
				{
					name: "nim",
					type: "text",
					required: true,
					min: 1,
					max: 32,
				},
				{
					name: "name",
					type: "text",
					required: true,
					min: 1,
					max: 200,
				},
				{
					name: "course",
					type: "relation",
					required: true,
					maxSelect: 1,
					minSelect: 0,
					collectionId: courses.id,
					cascadeDelete: true,
				},
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					minSelect: 0,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE UNIQUE INDEX idx_course_roster_course_nim ON course_roster (course, nim)",
				"CREATE INDEX idx_course_roster_course ON course_roster (course)",
			],
		});
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("course_roster");
		app.delete(collection);
	},
);
