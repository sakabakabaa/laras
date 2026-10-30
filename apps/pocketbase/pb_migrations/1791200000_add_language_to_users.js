/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");

		// Per-account interface language. Lecturers set their own here (settings
		// page); lecturers also set each enrolled student's language from the
		// roster page via the superuser client. Unset students default to German
		// in the app; unset lecturer accounts default to Indonesian.
		if (!users.fields.getByName("language")) {
			users.fields.add(
				new SelectField({
					name: "language",
					maxSelect: 1,
					values: ["id", "en", "de"],
				}),
			);
		}

		// Lock `language` against self-update for students: a student must not
		// override the dashboard language their lecturer chose. Faculty may still
		// change their own (settings page). Lecturer-driven changes to student
		// accounts happen server-side via the superuser client, which bypasses
		// this rule.
		users.updateRule =
			"id = @request.auth.id && @request.body.role:changed = false && @request.body.nim:changed = false && (@request.body.language:changed = false || @request.auth.role = 'faculty')";

		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		try {
			users.fields.removeByName("language");
		} catch (_) {
			// field already absent
		}
		users.updateRule =
			"id = @request.auth.id && @request.body.role:changed = false && @request.body.nim:changed = false";
		app.save(users);
	},
);
