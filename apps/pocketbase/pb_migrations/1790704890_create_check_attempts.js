/// <reference path="../pb_data/types.d.ts" />

// Formative "Cek jawaban" (check answer) workflow:
// - `assignments.checkEnabled` / `assignments.checkMax` — lecturer controls
//   (default: enabled, 5 checks per participant per assignment).
// - `check_attempts` — one row per check: numbered attempt, response snapshot,
//   AI feedback + area + evidence, extraction/rubric snapshots, participant
//   identity (enrolled owner or public identity key), timestamps.
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId("assignments");
		const users = app.findCollectionByNameOrId("users");
		const submissions = app.findCollectionByNameOrId("assignment_submissions");

		// Lecturer controls on the assignment itself.
		assignments.fields.add(new BoolField({ name: "checkEnabled" }));
		assignments.fields.add(new NumberField({ name: "checkMax", min: 0, onlyInt: true }));
		app.save(assignments);

		// Backfill: the workflow ships enabled with the 5-check default.
		const existing = app.findRecordsByFilter("assignments", "id != ''", "-created", 500, 0);
		for (const row of existing) {
			row.set("checkEnabled", true);
			row.set("checkMax", 5);
			app.save(row);
		}

		const collection = new Collection({
			type: "base",
			name: "check_attempts",
			// Lecturers read attempts for their own assignments; enrolled
			// students read their own attempts. Creates are server-only.
			listRule:
				"@request.auth.id != '' && (assignment.owner = @request.auth.id || owner = @request.auth.id)",
			viewRule:
				"@request.auth.id != '' && (assignment.owner = @request.auth.id || owner = @request.auth.id)",
			createRule: null,
			updateRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
			deleteRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
			fields: [
				{
					name: "assignment",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: assignments.id,
					cascadeDelete: true,
				},
				{
					name: "submission",
					type: "relation",
					maxSelect: 1,
					collectionId: submissions.id,
				},
				{
					name: "owner",
					type: "relation",
					maxSelect: 1,
					collectionId: users.id,
				},
				{
					name: "channel",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["enrolled", "public"],
				},
				{ name: "attempt", type: "number", required: true, min: 1, onlyInt: true },
				{ name: "participantName", type: "text", max: 200 },
				{ name: "identityKey", type: "text", required: true, max: 120 },
				{ name: "responseSnapshot", type: "json", maxSize: 200000 },
				{ name: "feedback", type: "text", required: true, max: 6000 },
				{ name: "area", type: "text", max: 200 },
				{ name: "evidence", type: "text", max: 1000 },
				{ name: "extracted", type: "json", maxSize: 200000 },
				{ name: "criteria", type: "json", maxSize: 50000 },
				{ name: "focus", type: "text", max: 500 },
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_check_attempts_assignment ON check_attempts (assignment)",
				"CREATE INDEX idx_check_attempts_identity ON check_attempts (assignment, identityKey)",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("check_attempts");
			app.delete(collection);
		} catch (e) {
			if (!String(e).includes("no rows")) throw e;
		}
		const assignments = app.findCollectionByNameOrId("assignments");
		assignments.fields.removeByName("checkEnabled");
		assignments.fields.removeByName("checkMax");
		app.save(assignments);
	},
);
