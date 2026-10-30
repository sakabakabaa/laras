/// <reference path="../pb_data/types.d.ts" />

// Existing sections remain usable by other context features. Formal evaluation
// requires an exact quotation; do not invent/backfill one from labels or pages.
migrate((app) => {
	const sections = app.findCollectionByNameOrId('context_sections');
	if (!sections.fields.getByName('excerpt')) {
		sections.fields.add(new TextField({ name: 'excerpt', max: 8000 }));
		app.save(sections);
	}
}, (app) => {
	const sections = app.findCollectionByNameOrId('context_sections');
	sections.fields.removeByName('excerpt');
	app.save(sections);
});
