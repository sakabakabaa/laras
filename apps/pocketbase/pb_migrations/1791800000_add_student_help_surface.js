/// <reference path="../pb_data/types.d.ts" />

// Add the student-facing surface to `ai_model_prefs`.
//
// Phase 1 shipped five surfaces, all lecturer-owned. Student features (the
// worksheet learning assistant) had no surface at all, so they always used the
// deployment environment instead of the lecturer's configured provider. Adding
// `student_help` lets a lecturer choose a model for that surface; when they
// have not, resolution falls back to their default provider and then the env.
migrate((app) => {
	const prefs = app.findCollectionByNameOrId('ai_model_prefs');
	const surface = prefs.fields.getByName('surface');
	if (!surface) return;
	const values = surface.values || [];
	if (!values.includes('student_help')) {
		surface.values = [...values, 'student_help'];
		app.save(prefs);
	}
}, (app) => {
	// Revert: drop the value. Rows already using it are removed first so the
	// select constraint cannot reject the rollback.
	const prefs = app.findCollectionByNameOrId('ai_model_prefs');
	const surface = prefs.fields.getByName('surface');
	if (!surface) return;
	const rows = app.findRecordsByFilter('ai_model_prefs', "surface = 'student_help'", '', 500, 0);
	for (const row of rows) app.delete(row);
	surface.values = (surface.values || []).filter((value) => value !== 'student_help');
	app.save(prefs);
});
