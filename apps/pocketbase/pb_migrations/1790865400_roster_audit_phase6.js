/// <reference path="../pb_data/types.d.ts" />

// Phase 6 — production hardening: a course-scoped audit trail for privileged
// roster operations (account creation, enrollment, password reissue, and
// public-answer linking). Writes are server-only (the API routes log through
// the superuser client); reads are scoped to the mata kuliah owner so only the
// lecturer who owns the course can review the history. Passwords are never
// stored — only the action, target NIM/name, outcome, and a short detail.
//
// Recovery-email verification and password reset are account-level (not
// course-scoped) and student-initiated, so they are NOT logged here; their
// `email_verifications` and `password_resets` records already serve as the
// audit trail for those flows.

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const courses = app.findCollectionByNameOrId("courses");
		const assignments = app.findCollectionByNameOrId("assignments");

		let collection;
		try {
			collection = app.findCollectionByNameOrId("roster_audit");
		} catch (_) {
			collection = new Collection({
				type: "base",
				name: "roster_audit",
				// Only the mata kuliah owner may read the audit history for their
				// course. `course` is a relation, so `course.owner` traverses it.
				listRule:
					"@request.auth.id != '' && course.owner = @request.auth.id",
				viewRule:
					"@request.auth.id != '' && course.owner = @request.auth.id",
				// All writes happen server-side via the superuser client.
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
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
					{
						name: "action",
						type: "select",
						required: true,
						maxSelect: 1,
						values: [
							"roster_activated",
							"account_created",
							"password_reissued",
							"public_linked",
							"public_conflict",
						],
					},
					{ name: "nim", type: "text", max: 32 },
					{ name: "studentName", type: "text", max: 200 },
					{
						name: "outcome",
						type: "select",
						maxSelect: 1,
						values: ["success", "skipped", "conflict", "error"],
					},
					{ name: "detail", type: "text", max: 1000 },
					{
						name: "assignment",
						type: "relation",
						maxSelect: 1,
						minSelect: 0,
						collectionId: assignments.id,
						cascadeDelete: false,
					},
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				],
				indexes: [
					"CREATE INDEX idx_roster_audit_course ON roster_audit (course)",
					"CREATE INDEX idx_roster_audit_created ON roster_audit (created)",
				],
			});
			app.save(collection);
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("roster_audit");
			app.delete(collection);
		} catch (e) {
			if (e.message.includes("no rows in result set")) return;
			throw e;
		}
	},
);
