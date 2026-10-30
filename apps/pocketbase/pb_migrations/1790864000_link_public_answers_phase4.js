/// <reference path="../pb_data/types.d.ts" />

// Phase 4 — safely link existing public-link answers to enrolled student
// accounts when the submitted NIM unambiguously matches a student enrolled in
// the mata kuliah the task belongs to.
//
// - public_submissions gains `linkedUser` (→ users) and `linkedSubmission`
//   (→ assignment_submissions) relations. Both are written only server-side
//   (superuser) during linking; the public participant never sees or sets them
//   (public_submissions list/view rules already scope to the assignment owner,
//   and create is server-only).
// - assignment_submissions gains a `linkedFromPublic` bool marker so the
//   student and lecturer can see the submission was imported from a public
//   answer. It is locked on self-update (a student must not flip it) exactly
//   like the other privileged grading fields.

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");
		const submissions = app.findCollectionByNameOrId("assignment_submissions");
		const pubs = app.findCollectionByNameOrId("public_submissions");

		// public_submissions.linkedUser — the student account this answer was
		// linked to. No cascade: deleting the student keeps the public answer.
		if (!pubs.fields.getByName("linkedUser")) {
			pubs.fields.add(
				new RelationField({
					name: "linkedUser",
					maxSelect: 1,
					minSelect: 0,
					collectionId: users.id,
					cascadeDelete: false,
				}),
			);
		}

		// public_submissions.linkedSubmission — the enrolled submission row
		// created from this public answer. No cascade either direction.
		if (!pubs.fields.getByName("linkedSubmission")) {
			pubs.fields.add(
				new RelationField({
					name: "linkedSubmission",
					maxSelect: 1,
					minSelect: 0,
					collectionId: submissions.id,
					cascadeDelete: false,
				}),
			);
		}
		app.save(pubs);

		// assignment_submissions.linkedFromPublic — marker that this enrolled
		// submission was imported from a public answer (not created by the
		// student directly). Bool — leave `required` off so false is accepted.
		if (!submissions.fields.getByName("linkedFromPublic")) {
			submissions.fields.add(new BoolField({ name: "linkedFromPublic" }));
		}

		// Lock linkedFromPublic on the owner branch of updateRule, alongside
		// the other privileged grading fields. The assignment-owner branch
		// (lecturer) can still write it.
		submissions.updateRule =
			"@request.auth.id != '' && ((owner = @request.auth.id && " +
			"@request.body.grade:changed = false && " +
			"@request.body.feedback:changed = false && " +
			"@request.body.gradedBy:changed = false && " +
			"@request.body.gradedAt:changed = false && " +
			"@request.body.autoScore:changed = false && " +
			"@request.body.taskReview:changed = false && " +
			"@request.body.transcript:changed = false && " +
			"@request.body.transcriptStatus:changed = false && " +
			"@request.body.transcriptError:changed = false && " +
			"@request.body.transcriptFile:changed = false && " +
			"@request.body.linkedFromPublic:changed = false) || " +
			"assignment.owner = @request.auth.id)";
		app.save(submissions);
	},
	(app) => {
		const pubs = app.findCollectionByNameOrId("public_submissions");
		try {
			pubs.fields.removeByName("linkedUser");
		} catch (_) {}
		try {
			pubs.fields.removeByName("linkedSubmission");
		} catch (_) {}
		app.save(pubs);

		const submissions = app.findCollectionByNameOrId("assignment_submissions");
		try {
			submissions.fields.removeByName("linkedFromPublic");
		} catch (_) {}
		submissions.updateRule =
			"@request.auth.id != '' && ((owner = @request.auth.id && " +
			"@request.body.grade:changed = false && " +
			"@request.body.feedback:changed = false && " +
			"@request.body.gradedBy:changed = false && " +
			"@request.body.gradedAt:changed = false && " +
			"@request.body.autoScore:changed = false && " +
			"@request.body.taskReview:changed = false && " +
			"@request.body.transcript:changed = false && " +
			"@request.body.transcriptStatus:changed = false && " +
			"@request.body.transcriptError:changed = false && " +
			"@request.body.transcriptFile:changed = false) || " +
			"assignment.owner = @request.auth.id)";
		app.save(submissions);
	},
);
