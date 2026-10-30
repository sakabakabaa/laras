/// <reference path="../pb_data/types.d.ts" />

// Phase 5 — password reset via a verified recovery email.
//
// Creates a `password_resets` collection that holds single-use reset tokens.
// Writes are server-only (the request-reset route creates a row as superuser
// after confirming the address is a verified recovery email for some account;
// the reset-password route marks it used). Reads are null so tokens never
// leave the server through the REST API. The password-reset-send hook fires
// on create to email the link.

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");

		let resets;
		try {
			resets = app.findCollectionByNameOrId("password_resets");
		} catch (_) {
			resets = new Collection({
				type: "base",
				name: "password_resets",
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: "owner",
						type: "relation",
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{ name: "email", type: "email", required: true },
					{ name: "token", type: "text", required: true, max: 64 },
					{ name: "used", type: "bool" },
					{ name: "expiresAt", type: "date", required: true },
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				],
			});
			app.save(resets);
		}

		const tokenIdx =
			"CREATE UNIQUE INDEX `idx_password_resets_token` ON `password_resets` (`token`)";
		if (!resets.indexes.includes(tokenIdx)) {
			resets.indexes.push(tokenIdx);
			app.save(resets);
		}
	},
	(app) => {
		try {
			const resets = app.findCollectionByNameOrId("password_resets");
			app.delete(resets);
		} catch (e) {
			if (e.message.includes("no rows in result set")) return;
			throw e;
		}
	},
);
