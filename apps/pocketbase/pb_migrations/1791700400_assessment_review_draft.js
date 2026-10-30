/// <reference path="../pb_data/types.d.ts" />
migrate(app => {
	const evaluations = app.findCollectionByNameOrId('ai_evaluations');
	if (!evaluations.fields.getByName('reviewDraft')) {
		evaluations.fields.add(new JSONField({ name: 'reviewDraft', maxSize: 12000 }));
		app.save(evaluations);
	}
}, app => {
	const evaluations = app.findCollectionByNameOrId('ai_evaluations');
	evaluations.fields.removeByName('reviewDraft');
	app.save(evaluations);
});
