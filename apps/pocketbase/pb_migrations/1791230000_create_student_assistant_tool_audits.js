/// <reference path="../pb_data/types.d.ts" />

// Phase 4 — Context-Aware Student AI Tools: tool audit trail.
//
// Every student assistant tool invocation is recorded here for auditability:
//   student, assignment, course, tool name, capability exercised, the
// validated params, the outcome (success/failure), and a timestamp.
//
// Students can CREATE their own audit rows (the API writes them with the
// student's token) but can never LIST/VIEW/UPDATE/DELETE them — internal
// security metadata is never exposed to the student. Faculty/superuser reads
// remain possible server-side for oversight.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const assignments = app.findCollectionByNameOrId("assignments");
		const courses = app.findCollectionByNameOrId("courses");

		const collection = new Collection({
			type: "base",
			name: "student_assistant_tool_audits",
			// Server-written by the student's own token; never student-readable.
			listRule: null,
			viewRule: null,
			createRule: "@request.auth.id != '' && owner = @request.auth.id",
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
				{ name: "tool", type: "text", required: true, max: 64 },
				{ name: "capability", type: "text", required: true, max: 64 },
				{ name: "params", type: "json", maxSize: 20000 },
				{
					name: "result",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["success", "denied", "failure"],
				},
				{ name: "errorMessage", type: "text", max: 500 },
				{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
				{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
			],
			indexes: [
				"CREATE INDEX idx_student_tool_audits_owner ON student_assistant_tool_audits (owner)",
				"CREATE INDEX idx_student_tool_audits_assignment ON student_assistant_tool_audits (assignment)",
				"CREATE INDEX idx_student_tool_audits_tool ON student_assistant_tool_audits (tool)",
			],
		});
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("student_assistant_tool_audits");
			app.delete(collection);
		} catch (e) {
			if (!String(e).includes("no rows")) throw e;
		}
	},
);
