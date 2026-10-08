/// <reference path="../pb_data/types.d.ts" />

// Phase 2 (evaluasi dosen) — lecturer review and editing of AI evaluation
// drafts, Tugas formal only.
//
// Adds to `ai_evaluations`:
// - `reviewFindings` (json): the lecturer's working copy of findings — AI
//   recommendations they approved / rejected / edited, plus their own
//   manually created inline findings (source 'lecturer'). Each entry holds
//   { id, source: 'ai'|'lecturer', severity: 'minor'|'major', quote, note,
//   evidence, status: 'pending'|'approved'|'edited'|'rejected'|'manual' }.
//   Every quote stays an exact substring of the student's own text.
// - `reviewedAt` (date): when the lecturer last saved their review.
//
// The AI draft's own `findings` column is never touched (it stays the
// original recommendation), the original student text is never modified, and
// no grade, feedback, status, or publishing changes in this phase. Writes
// remain server-only (null rules) through /api/evaluation-review, which
// verifies the caller is the lecturer who owns the assignment.
migrate(
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		evaluations.fields.add(new JSONField({ name: 'reviewFindings', maxSize: 200000 }));
		evaluations.fields.add(new DateField({ name: 'reviewedAt' }));
		app.save(evaluations);
	},
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		evaluations.fields.removeByName('reviewFindings');
		evaluations.fields.removeByName('reviewedAt');
		app.save(evaluations);
	},
);
