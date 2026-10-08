/// <reference path="../pb_data/types.d.ts" />

// Phase 2 — Student Learning Assistant.
//
// One conversation record per (student, assignment): a tutor-first AI
// assistant that helps students understand instructions, get hints, learn
// vocabulary/grammar, analyze their own draft, practice, and understand
// mistakes. It is gated by the Phase 1 AI assistance policy and never
// completes assessed work.
//
// `student_assistant_chats` is owner-only: a student can read/write only
// their own conversation. The assistant message history (json) and the
// current hint-ladder level live here. Writes happen server-side through
// `/api/student-assistant`, which enforces the policy before any model call.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const assignments = app.findCollectionByNameOrId("assignments");
		const courses = app.findCollectionByNameOrId("courses");

		const collection = new Collection({
			type: "base",
			name: "student_assistant_chats",
			// Owner-only: a student sees and mutates only their own chats.
			listRule: "@request.auth.id != '' && owner = @request.auth.id",
			viewRule: "@request.auth.id != '' && owner = @request.auth.id",
			createRule: "@request.auth.id != '' && owner = @request.auth.id",
			updateRule: "@request.auth.id != '' && owner = @request.auth.id",
			deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
			fields: [
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{
					name: "assignment",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: assignments.id,
					cascadeDelete: true,
				},
				{
					name: "course",
					type: "relation",
					maxSelect: 1,
					collectionId: courses.id,
				},
				{ name: "messages", type: "json", maxSize: 200000 },
				{ name: "hintLevel", type: "number", min: 1, max: 4, onlyInt: true },
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE UNIQUE INDEX idx_student_assistant_owner_assignment ON student_assistant_chats (owner, assignment)",
				"CREATE INDEX idx_student_assistant_assignment ON student_assistant_chats (assignment)",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("student_assistant_chats");
			app.delete(collection);
		} catch (e) {
			if (!String(e).includes("no rows")) throw e;
		}
	},
);
