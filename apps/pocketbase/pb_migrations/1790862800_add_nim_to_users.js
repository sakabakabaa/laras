/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");

		// Add the student identifier (NIM) used by the lecturer-managed roster
		// to look up / create student accounts. Optional: faculty accounts and
		// self-signup accounts leave it empty.
		if (!users.fields.getByName("nim")) {
			users.fields.add(new TextField({ name: "nim", max: 32 }));
		}

		// Lock `nim` on self-update, exactly like `role`: a student must not
		// change their own NIM (it is their login identifier and links them to
		// roster/enrollment records). Lecturer-driven changes happen server-side
		// via the superuser client, which bypasses this rule.
		users.updateRule =
			"id = @request.auth.id && @request.body.role:changed = false && @request.body.nim:changed = false";

		// Unique NIM (only where set) so two accounts can never share a NIM.
		const idx = "CREATE UNIQUE INDEX `idx_users_nim` ON `users` (`nim`) WHERE `nim` != ''";
		if (!users.indexes.includes(idx)) {
			users.indexes.push(idx);
		}

		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		try {
			users.fields.removeByName("nim");
		} catch (_) {
			// field already absent
		}
		users.indexes = users.indexes.filter(
			(i) => !/idx_users_nim/.test(i),
		);
		users.updateRule = "id = @request.auth.id && @request.body.role:changed = false";
		app.save(users);
	},
);
