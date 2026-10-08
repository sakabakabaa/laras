/// <reference path="../pb_data/types.d.ts" />

// Phase 2 (research — German as a Foreign Language writing) — preserve the
// raw AI model output for research reproducibility.
//
// `ai_evaluations.rawOutput` (text, up to 200k chars) stores the verbatim
// model response that produced the structured findings, so the AI
// classification (category/subcategory/correction/explanation/confidence and
// the original quote text) can always be re-derived from source. It is
// lecturer-private like the rest of the row (owner-only read, server-only
// write). Additive and backward-compatible: old rows simply have an empty
// rawOutput.
migrate(
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		if (!evaluations.fields.getByName('rawOutput')) {
			evaluations.fields.add(new TextField({ name: 'rawOutput', max: 200000 }));
			app.save(evaluations);
		}
	},
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		if (evaluations.fields.getByName('rawOutput')) {
			evaluations.fields.removeByName('rawOutput');
			app.save(evaluations);
		}
	},
);
