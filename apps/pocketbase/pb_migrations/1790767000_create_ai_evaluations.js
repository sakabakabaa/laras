/// <reference path="../pb_data/types.d.ts" />

// Phase 1 (evaluasi dosen) — AI evaluation drafts for Tugas formal.
//
// `ai_evaluations` stores one lecturer-private DRAFT evaluation per formal
// submission (enrolled `assignment_submissions` row or `public_submissions`
// row), generated in the background when a final submission lands. The draft
// holds validated findings (severity minor/major + exact quote from the
// student's own text + note + evidence reference), a recommended score with a
// rubric breakdown, a short summary, and the exact material-context citations
// it was grounded in (bundle id, file, active version, section, page
// reference) when approved material was available.
//
// A draft is a RECOMMENDATION ONLY — it is never published to students, never
// writes grades or feedback, and is clearly labeled as not yet approved.
// Lecturer approval/rejection, manual markings, score overrides, and
// publishing arrive in later phases.
//
// Reads are owner-only (the lecturer who owns the assignment); students and
// public participants can never see AI evaluation drafts. All writes happen
// through the server-side superuser route (/api/evaluation-draft and the
// submission routes) after identity/ownership checks — create/update/delete
// rules are null, so no client can write directly.
migrate(
	(app) => {
		let evaluations;
		try {
			evaluations = app.findCollectionByNameOrId('ai_evaluations');
		} catch (_) {
			const users = app.findCollectionByNameOrId('users');
			const assignments = app.findCollectionByNameOrId('assignments');
			const submissions = app.findCollectionByNameOrId('assignment_submissions');
			const publicSubmissions = app.findCollectionByNameOrId('public_submissions');

			evaluations = new Collection({
				type: 'base',
				name: 'ai_evaluations',
				// Lecturer-private: only the owning lecturer may read their own
				// AI evaluation drafts. Writes are server-only (null rules).
				listRule: "@request.auth.id != '' && owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && owner = @request.auth.id",
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: 'assignment',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: assignments.id,
						cascadeDelete: true,
					},
					// Enrolled channel: the assignment_submissions row.
					{
						name: 'submission',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: submissions.id,
						cascadeDelete: true,
					},
					// Public channel: the public_submissions row.
					{
						name: 'publicSubmission',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: publicSubmissions.id,
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
					// Generation state: pending → ready | failed.
					{
						name: 'status',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['pending', 'ready', 'failed'],
					},
					// Meaningful when ready: sufficient (draft produced) or
					// insufficient (explicitly not enough verifiable evidence).
					{
						name: 'result',
						type: 'select',
						required: false,
						maxSelect: 1,
						values: ['sufficient', 'insufficient'],
					},
					// Indonesian reason for a failed or insufficient draft.
					{ name: 'reason', type: 'text', max: 2000 },
					// Validated findings: { severity, quote, note, evidence }[].
					// Every quote is an exact substring of the student's own text.
					{ name: 'findings', type: 'json', maxSize: 200000 },
					// Recommended score 0–100 — a recommendation, never official.
					{ name: 'recommendedScore', type: 'number', min: 0, max: 100 },
					// Rubric breakdown: { criterion, score, note }[].
					{ name: 'rubricBreakdown', type: 'json', maxSize: 50000 },
					{ name: 'summary', type: 'text', max: 2000 },
					// Phase 5 context bundle the draft was grounded in ('' when
					// no approved material was available).
					{ name: 'bundleId', type: 'text', max: 64 },
					// Exact citations from the bundle (file, version, section,
					// page reference, extraction timestamp).
					{ name: 'citations', type: 'json', maxSize: 100000 },
					// Indonesian note about material-context availability.
					{ name: 'contextNote', type: 'text', max: 500 },
					{ name: 'generatedAt', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE INDEX idx_ai_eval_assignment ON ai_evaluations (assignment)',
					'CREATE UNIQUE INDEX idx_ai_eval_submission ON ai_evaluations (submission) WHERE submission != \'\'',
					'CREATE UNIQUE INDEX idx_ai_eval_public ON ai_evaluations (publicSubmission) WHERE publicSubmission != \'\'',
				],
			});
			app.save(evaluations);
		}
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('ai_evaluations'));
		} catch (e) {
			if (!String(e?.message || e).includes('no rows in result set')) throw e;
		}
	},
);
