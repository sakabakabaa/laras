/// <reference path="../pb_data/types.d.ts" />

// Phase 9 — Student feedback uptake and revision analytics.
//
// Additive, backward-compatible schema for measuring what happens AFTER a
// student receives formative AI feedback (Cek jawaban): revision
// relationships on submissions, a lecturer-controlled association between
// formative feedback events and student revisions, and a human-only uptake
// annotation layer. No existing grades, published feedback, or student
// access is changed. All new collections are faculty-only writes and
// assignment-owner-scoped reads.
//
// 1. assignment_submissions: add originalSubmission / parentSubmission
//    (self-relations) + revisionNumber. Locked against student writes exactly
//    like the other research/grading fields — only the assignment owner
//    (lecturer) or server-side code may set them.
//
// 2. feedback_revisions: associates a formative feedback event
//    (check_attempts row) with a subsequent revision (a later check attempt
//    where the answer changed, or a formal submission revision). Stores the
//    hint levels used before the revision and an attributionStatus that
//    defaults to 'uncertain' — the system NEVER assumes a revision was caused
//    by AI feedback.
//
// 3. feedback_uptake: lecturer/researcher-only uptake annotation for one
//    feedback_revision association. Carries the uptake judgment, before/after
//    error status, reviewer, and note. Uptake judgments are HUMAN-ENTERED
//    ONLY — AI never assigns them. One uptake row per feedback_revision
//    (unique index).
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const assignments = app.findCollectionByNameOrId('assignments');
		const checkAttempts = app.findCollectionByNameOrId('check_attempts');
		const submissions = app.findCollectionByNameOrId('assignment_submissions');

		// ── 1. Revision relationship fields on assignment_submissions ──
		if (!submissions.fields.getByName('originalSubmission')) {
			submissions.fields.add(
				new RelationField({
					name: 'originalSubmission',
					maxSelect: 1,
					collectionId: submissions.id,
				}),
			);
		}
		if (!submissions.fields.getByName('parentSubmission')) {
			submissions.fields.add(
				new RelationField({
					name: 'parentSubmission',
					maxSelect: 1,
					collectionId: submissions.id,
				}),
			);
		}
		if (!submissions.fields.getByName('revisionNumber')) {
			submissions.fields.add(new NumberField({ name: 'revisionNumber', min: 0 }));
		}
		// Lock the revision fields against student writes, exactly like the
		// other research/grading fields. The lecturer (assignment.owner) may
		// still set them via the owner-override branch of the updateRule.
		submissions.createRule =
			"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false && @request.body.autoScore:isset = false && @request.body.taskReview:isset = false && @request.body.transcript:isset = false && @request.body.transcriptStatus:isset = false && @request.body.transcriptError:isset = false && @request.body.transcriptFile:isset = false && @request.body.transcriptConfidence:isset = false && @request.body.originalSubmission:isset = false && @request.body.parentSubmission:isset = false && @request.body.revisionNumber:isset = false";
		submissions.updateRule =
			"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false && @request.body.autoScore:changed = false && @request.body.taskReview:changed = false && @request.body.transcript:changed = false && @request.body.transcriptStatus:changed = false && @request.body.transcriptError:changed = false && @request.body.transcriptFile:changed = false && @request.body.linkedFromPublic:changed = false && @request.body.transcriptConfidence:changed = false && @request.body.originalSubmission:changed = false && @request.body.parentSubmission:changed = false && @request.body.revisionNumber:changed = false) || assignment.owner = @request.auth.id)";
		app.save(submissions);

		// ── 2. feedback_revisions collection ──
		let feedbackRevisions;
		try {
			feedbackRevisions = app.findCollectionByNameOrId('feedback_revisions');
		} catch (_) {
			feedbackRevisions = new Collection({
				type: 'base',
				name: 'feedback_revisions',
				listRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && assignment.owner = @request.auth.id && @request.body.owner:changed = false",
				deleteRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
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
						name: 'feedbackAttempt',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: checkAttempts.id,
						cascadeDelete: true,
					},
					{
						name: 'revisionAttempt',
						type: 'relation',
						maxSelect: 1,
						collectionId: checkAttempts.id,
					},
					{
						name: 'originalSubmission',
						type: 'relation',
						maxSelect: 1,
						collectionId: submissions.id,
					},
					{
						name: 'revisionSubmission',
						type: 'relation',
						maxSelect: 1,
						collectionId: submissions.id,
					},
					{
						name: 'attributionStatus',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['confirmed', 'uncertain', 'rejected'],
					},
					{ name: 'hintLevelsUsed', type: 'json', maxSize: 10000 },
					{ name: 'numberOfHints', type: 'number', min: 0 },
					{ name: 'identityKey', type: 'text', required: true, max: 120 },
					{ name: 'participantName', type: 'text', max: 200 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE INDEX idx_feedback_revisions_assignment ON feedback_revisions (assignment)',
					'CREATE INDEX idx_feedback_revisions_attempt ON feedback_revisions (feedbackAttempt)',
					'CREATE UNIQUE INDEX idx_feedback_revisions_attempt_revision ON feedback_revisions (feedbackAttempt, revisionAttempt) WHERE revisionAttempt != \'\'',
				],
			});
			app.save(feedbackRevisions);
		}

		// ── 3. feedback_uptake collection ──
		let feedbackUptake;
		try {
			feedbackUptake = app.findCollectionByNameOrId('feedback_uptake');
		} catch (_) {
			feedbackUptake = new Collection({
				type: 'base',
				name: 'feedback_uptake',
				listRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && assignment.owner = @request.auth.id && @request.body.owner:changed = false",
				deleteRule: "@request.auth.id != '' && assignment.owner = @request.auth.id",
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
						name: 'feedbackRevision',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: feedbackRevisions.id,
						cascadeDelete: true,
					},
					{
						name: 'feedbackAttempt',
						type: 'relation',
						maxSelect: 1,
						collectionId: checkAttempts.id,
					},
					{
						name: 'originalSubmission',
						type: 'relation',
						maxSelect: 1,
						collectionId: submissions.id,
					},
					{
						name: 'revisionSubmission',
						type: 'relation',
						maxSelect: 1,
						collectionId: submissions.id,
					},
					{
						name: 'uptakeJudgment',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: [
							'successful_uptake',
							'partial_uptake',
							'unsuccessful_uptake',
							'no_uptake',
							'not_applicable',
						],
					},
					{
						name: 'beforeRevisionStatus',
						type: 'select',
						maxSelect: 1,
						values: ['error', 'acceptable', 'unclear'],
					},
					{
						name: 'afterRevisionStatus',
						type: 'select',
						maxSelect: 1,
						values: [
							'corrected',
							'partially_corrected',
							'unchanged',
							'worsened',
							'introduced_new_error',
							'unclear',
						],
					},
					{ name: 'uptakeNote', type: 'text', max: 4000 },
					{ name: 'uptakeReviewedAt', type: 'date' },
					{ name: 'identityKey', type: 'text', max: 120 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_feedback_uptake_revision ON feedback_uptake (feedbackRevision)',
					'CREATE INDEX idx_feedback_uptake_assignment ON feedback_uptake (assignment)',
				],
			});
			app.save(feedbackUptake);
		}
	},
	(app) => {
		// ── down: remove new fields and collections ──
		try {
			const uptake = app.findCollectionByNameOrId('feedback_uptake');
			app.delete(uptake);
		} catch (_) {
			/* already gone */
		}
		try {
			const revisions = app.findCollectionByNameOrId('feedback_revisions');
			app.delete(revisions);
		} catch (_) {
			/* already gone */
		}
		try {
			const submissions = app.findCollectionByNameOrId('assignment_submissions');
			submissions.fields.removeByName('originalSubmission');
			submissions.fields.removeByName('parentSubmission');
			submissions.fields.removeByName('revisionNumber');
			submissions.createRule =
				"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false && @request.body.autoScore:isset = false && @request.body.taskReview:isset = false && @request.body.transcript:isset = false && @request.body.transcriptStatus:isset = false && @request.body.transcriptError:isset = false && @request.body.transcriptFile:isset = false && @request.body.transcriptConfidence:isset = false";
			submissions.updateRule =
				"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false && @request.body.autoScore:changed = false && @request.body.taskReview:changed = false && @request.body.transcript:changed = false && @request.body.transcriptStatus:changed = false && @request.body.transcriptError:changed = false && @request.body.transcriptFile:changed = false && @request.body.linkedFromPublic:changed = false && @request.body.transcriptConfidence:changed = false) || assignment.owner = @request.auth.id)";
			app.save(submissions);
		} catch (_) {
			/* already gone */
		}
	},
);
