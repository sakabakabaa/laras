/// <reference path="../pb_data/types.d.ts" />

// Phase 1 — research-grade feedback data infrastructure.
//
// Creates the `ai_feedback_items` collection, which stores individual AI
// feedback items AND later human-expert evaluations of those items. It is
// designed to support both AI-generated feedback and human-added missed /
// reference errors, with full research-judgment, review, and alignment
// fields.
//
// This is an ADDITIVE, data-only change:
// - The existing `ai_evaluations` collection and all existing behavior are
//   preserved untouched.
// - No existing fields are deleted or renamed.
// - No published evaluations are migrated destructively.
// - Existing AI evaluations keep working even when no `ai_feedback_items`
//   exist — the two collections are related but independent.
//
// Access: owner-only (the owning lecturer/researcher). Students can never
// read research fields. All writes are server-only (null create/update/delete
// rules) so no client can write directly; the owning lecturer may list/view
// their own rows.
migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId('ai_feedback_items');
		} catch (_) {
			const users = app.findCollectionByNameOrId('users');
			const evaluations = app.findCollectionByNameOrId('ai_evaluations');
			const assignments = app.findCollectionByNameOrId('assignments');
			const submissions = app.findCollectionByNameOrId('assignment_submissions');

			collection = new Collection({
				type: 'base',
				name: 'ai_feedback_items',
				// Owner-only reads: only the owning lecturer/researcher may list
				// or view their own feedback items. Students never see research
				// fields.
				listRule: "@request.auth.id != '' && owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && owner = @request.auth.id",
				// Server-only writes — no client may create/update/delete
				// directly. All writes happen through server-side superuser
				// routes after ownership/identity checks.
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					// ── Identity and relationships ──────────────────────────
					{
						name: 'evaluation',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: evaluations.id,
						cascadeDelete: true,
					},
					{
						name: 'assignment',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: assignments.id,
						cascadeDelete: true,
					},
					{
						name: 'submission',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: submissions.id,
						cascadeDelete: true,
					},
					{
						name: 'owner',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{
						name: 'origin',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['ai', 'human'],
					},

					// ── Student-text anchoring ─────────────────────────────
					{ name: 'quote', type: 'text', max: 600 },
					{ name: 'quoteStart', type: 'number', min: 0 },
					{ name: 'quoteEnd', type: 'number', min: 0 },
					{ name: 'anchorValid', type: 'bool' },

					// ── AI-generated content ────────────────────────────────
					{
						name: 'aiSeverity',
						type: 'select',
						maxSelect: 1,
						values: ['minor', 'major'],
					},
					{ name: 'aiCategory', type: 'text', max: 200 },
					{ name: 'aiSubcategory', type: 'text', max: 200 },
					{ name: 'aiNote', type: 'text', max: 2000 },
					{ name: 'aiCorrection', type: 'text', max: 2000 },
					{ name: 'aiExplanation', type: 'text', max: 4000 },
					{ name: 'aiCriterion', type: 'text', max: 200 },
					{ name: 'aiConfidence', type: 'number', min: 0, max: 1 },

					// ── Human / reference annotation ────────────────────────
					{
						name: 'errorPresent',
						type: 'select',
						maxSelect: 1,
						values: ['yes', 'no', 'unclear'],
					},
					{ name: 'referenceCategory', type: 'text', max: 200 },
					{ name: 'referenceSubcategory', type: 'text', max: 200 },
					{
						name: 'referenceSeverity',
						type: 'select',
						maxSelect: 1,
						values: ['minor', 'major'],
					},
					{ name: 'referenceCorrection', type: 'text', max: 2000 },
					{ name: 'referenceExplanation', type: 'text', max: 4000 },

					// ── Research judgments ──────────────────────────────────
					{
						name: 'detectionJudgment',
						type: 'select',
						maxSelect: 1,
						values: [
							'correct',
							'incorrect',
							'missed',
							'not_applicable',
						],
					},
					{
						name: 'correctionJudgment',
						type: 'select',
						maxSelect: 1,
						values: [
							'correct',
							'partially_correct',
							'incorrect',
							'not_provided',
							'not_applicable',
						],
					},
					{
						name: 'explanationJudgment',
						type: 'select',
						maxSelect: 1,
						values: [
							'correct',
							'partially_correct',
							'incorrect',
							'not_provided',
							'not_applicable',
						],
					},
					{
						name: 'completenessJudgment',
						type: 'select',
						maxSelect: 1,
						values: ['complete', 'incomplete', 'not_applicable'],
					},
					{
						name: 'necessityJudgment',
						type: 'select',
						maxSelect: 1,
						values: ['necessary', 'unnecessary', 'not_applicable'],
					},
					{
						name: 'pedagogicalJudgment',
						type: 'select',
						maxSelect: 1,
						values: [
							'appropriate',
							'needs_revision',
							'inappropriate',
							'not_applicable',
						],
					},

					// ── Review ─────────────────────────────────────────────
					{
						name: 'reviewer',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: false,
					},
					{ name: 'reviewedAt', type: 'date' },
					{
						name: 'adjudicationStatus',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['unreviewed', 'reviewed', 'adjudicated'],
					},
					{ name: 'reviewerNote', type: 'text', max: 4000 },

					// ── Alignment ──────────────────────────────────────────
					{ name: 'matchedReferenceId', type: 'text', max: 64 },
					{ name: 'parentAiFindingId', type: 'text', max: 64 },

					// ── Audit ───────────────────────────────────────────────
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE INDEX idx_ai_feedback_items_evaluation ON ai_feedback_items (evaluation)',
					'CREATE INDEX idx_ai_feedback_items_submission ON ai_feedback_items (submission)',
					'CREATE INDEX idx_ai_feedback_items_assignment ON ai_feedback_items (assignment)',
					'CREATE INDEX idx_ai_feedback_items_owner ON ai_feedback_items (owner)',
				],
			});
			app.save(collection);
		}
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('ai_feedback_items'));
		} catch (e) {
			if (!String(e?.message || e).includes('no rows in result set')) throw e;
		}
	},
);
