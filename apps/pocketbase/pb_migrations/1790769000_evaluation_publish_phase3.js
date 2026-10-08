/// <reference path="../pb_data/types.d.ts" />

// Phase 3 (evaluasi dosen) — rubric score recalculation, lecturer score
// override, and explicit publishing for Tugas formal.
//
// Adds to `ai_evaluations`:
// - `rubricScores` (json): snapshot of the recalculated per-criterion scores
//   at publish time — { rows: [{ id, label, weight, major, minor, score }],
//   total, hasRubric, majorPenalty, minorPenalty }. Only findings the
//   lecturer approved (or created themselves) and assigned to a rubric
//   criterion count; rejected AI findings never affect the score.
// - `finalScore` (number 0–100): the published final score — the recalculated
//   total, or the lecturer's manual override.
// - `scoreAdjusted` (bool): true when the lecturer manually overrode the
//   calculated score (visibly labeled "disesuaikan dosen").
// - `publishedAt` (date): when the lecturer explicitly confirmed and
//   published the markings, notes, rubric scores, and final grade to the
//   student. Empty = never published.
//
// Publishing reaches the student only through the existing official
// submission fields (grade, feedback, status) written by the server-side
// route after explicit lecturer confirmation. The AI draft's own columns and
// the original student text are never modified; the full finding history and
// authorship stay in `reviewFindings`.
migrate(
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		evaluations.fields.add(new JSONField({ name: 'rubricScores', maxSize: 50000 }));
		evaluations.fields.add(new NumberField({ name: 'finalScore', min: 0, max: 100 }));
		evaluations.fields.add(new BoolField({ name: 'scoreAdjusted' }));
		evaluations.fields.add(new DateField({ name: 'publishedAt' }));
		app.save(evaluations);
	},
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		evaluations.fields.removeByName('rubricScores');
		evaluations.fields.removeByName('finalScore');
		evaluations.fields.removeByName('scoreAdjusted');
		evaluations.fields.removeByName('publishedAt');
		app.save(evaluations);
	},
);
