/// <reference path="../pb_data/types.d.ts" />

// Formative evaluation review — lecturer review of Cek jawaban feedback and
// manual annotations on a Latihan formatif answer.
//
// Creates `formative_reviews` (owner-scoped, faculty-only create): one row
// per (assignment, participant identityKey). Stores:
// - `findings` (json): the lecturer's working copy — AI feedback points
//   reviewed (approved/rejected with reason) plus lecturer-authored manual
//   annotations. Each entry: { id, source:'ai'|'lecturer', severity:
//   'minor'|'major', quote, note, status:'pending'|'approved'|'rejected'|
//   'manual', rejectReason }.
// - `strengths` / `weaknesses` (text): lecturer insight notes.
//
// The original Cek jawaban feedback in `check_attempts` is never modified;
// this row only holds the lecturer's review decisions and annotations.
// Owner-only reads/writes; the lecturer who owns the assignment owns the
// review. A unique (assignment, identityKey) index keeps one review per
// participant.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const assignments = app.findCollectionByNameOrId('assignments');
		const submissions = app.findCollectionByNameOrId('assignment_submissions');
		const collection = new Collection({
			type: 'base',
			name: 'formative_reviews',
			listRule: "@request.auth.id != '' && owner = @request.auth.id",
			viewRule: "@request.auth.id != '' && owner = @request.auth.id",
			createRule:
				"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
			updateRule:
				"@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false",
			deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
			fields: [
				{
					name: 'owner',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{
					name: 'assignment',
					type: 'relation',
					required: true,
					maxSelect: 1,
					collectionId: assignments.id,
					cascadeDelete: true,
				},
				{
					name: 'submission',
					type: 'relation',
					maxSelect: 1,
					collectionId: submissions.id,
					cascadeDelete: true,
				},
				{ name: 'identityKey', type: 'text', required: true, max: 120 },
				{
					name: 'channel',
					type: 'select',
					maxSelect: 1,
					values: ['enrolled', 'public'],
				},
				{ name: 'findings', type: 'json', maxSize: 200000 },
				{ name: 'strengths', type: 'text', max: 4000 },
				{ name: 'weaknesses', type: 'text', max: 4000 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_formative_reviews_key ON formative_reviews (assignment, identityKey)',
			],
		});
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('formative_reviews');
		app.delete(collection);
	},
);
