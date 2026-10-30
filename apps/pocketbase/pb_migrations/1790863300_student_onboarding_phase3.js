/// <reference path="../pb_data/types.d.ts" />

// Phase 3 — student first-login onboarding & account security.
//
// Adds a `mustChangePassword` flag (set true when a student account is
// created from the lecturer roster with a random default password), plus an
// optional, verified `recoveryEmail` for recovery/notifications. Both fields
// are privileged: a student may not flip the flag or mark their own email
// verified — only server-side superuser code (the onboarding API routes)
// may. The student may not set `recoveryEmail` directly either; it is written
// only by the verify route after the email link is confirmed, so a verified
// address is always the product of the verification flow.
//
// Also creates an `email_verifications` collection that holds pending
// verification tokens (server-only writes; owner-only reads).

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");

		// mustChangePassword: true until the student completes first-login
		// password change. Bool — leave `required` off so false is accepted.
		if (!users.fields.getByName("mustChangePassword")) {
			users.fields.add(new BoolField({ name: "mustChangePassword" }));
		}

		// recoveryEmail: optional, only set by the verify route.
		if (!users.fields.getByName("recoveryEmail")) {
			users.fields.add(new EmailField({ name: "recoveryEmail" }));
		}

		// recoveryEmailVerified: true only after the email link is confirmed.
		if (!users.fields.getByName("recoveryEmailVerified")) {
			users.fields.add(new BoolField({ name: "recoveryEmailVerified" }));
		}

		// Lock the three new privileged fields on self-update (a student must
		// not clear mustChangePassword or self-verify an email), and lock
		// recoveryEmail so it only moves through the verify flow.
		users.updateRule =
			"id = @request.auth.id && " +
			"@request.body.role:changed = false && " +
			"@request.body.nim:changed = false && " +
			"@request.body.mustChangePassword:changed = false && " +
			"@request.body.recoveryEmail:changed = false && " +
			"@request.body.recoveryEmailVerified:changed = false";

		// Open sign-up is preserved, but a self-signup may not seed any of the
		// privileged fields (they default to false / empty).
		users.createRule =
			"@request.body.mustChangePassword:isset = false && " +
			"@request.body.recoveryEmail:isset = false && " +
			"@request.body.recoveryEmailVerified:isset = false";

		app.save(users);

		// Backfill: every existing student account is treated as still needing
		// the first-login password change. Faculty accounts are untouched.
		let studentCount = 0;
		try {
			const students = app.findRecordsByFilter(
				"users",
				"role = 'student'",
				"created",
				500,
			);
			for (const s of students) {
				if (!s.getBool("mustChangePassword")) {
					s.set("mustChangePassword", true);
					app.save(s);
					studentCount += 1;
				}
			}
		} catch (err) {
			console.log("backfill mustChangePassword skipped:", String(err));
		}
		console.log("backfilled mustChangePassword for", studentCount, "students");

		// email_verifications: pending verification tokens. Server-only writes;
		// owner-only reads so a student can poll their own pending request.
		let verifications;
		try {
			verifications = app.findCollectionByNameOrId("email_verifications");
		} catch (_) {
			verifications = new Collection({
				type: "base",
				name: "email_verifications",
				listRule: "@request.auth.id != '' && owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && owner = @request.auth.id",
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
					{ name: "verified", type: "bool" },
					{ name: "expiresAt", type: "date", required: true },
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				],
			});
			app.save(verifications);
		}

		// Unique token index (idempotent).
		const tokenIdx =
			"CREATE UNIQUE INDEX `idx_email_verifications_token` ON `email_verifications` (`token`)";
		if (!verifications.indexes.includes(tokenIdx)) {
			verifications.indexes.push(tokenIdx);
			app.save(verifications);
		}
	},
	(app) => {
		// Revert users fields + rules.
		try {
			const users = app.findCollectionByNameOrId("users");
			try {
				users.fields.removeByName("mustChangePassword");
			} catch (_) {}
			try {
				users.fields.removeByName("recoveryEmail");
			} catch (_) {}
			try {
				users.fields.removeByName("recoveryEmailVerified");
			} catch (_) {}
			users.updateRule =
				"id = @request.auth.id && @request.body.role:changed = false && @request.body.nim:changed = false";
			users.createRule = "";
			app.save(users);
		} catch (_) {}

		// Drop the verifications collection.
		try {
			const verifications = app.findCollectionByNameOrId("email_verifications");
			app.delete(verifications);
		} catch (e) {
			if (e.message.includes("no rows in result set")) return;
			throw e;
		}
	},
);
