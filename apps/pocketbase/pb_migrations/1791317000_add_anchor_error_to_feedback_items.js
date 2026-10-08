/// <reference path="../pb_data/types.d.ts" />

// Phase 11 (finding integrity) — add an `anchorError` text field to
// `ai_feedback_items`.
//
// When a research annotation is saved, the source AI finding's anchor is
// re-validated against the versioned submission text. When the anchor is
// invalid (the quote no longer matches the text at the stored offsets, the
// offsets are inverted, the length disagrees, or the quote is absent from the
// text), the row's `anchorValid` is set to `false` and `anchorError` carries
// a machine-readable reason. This makes a broken anchor EXPLICIT in the
// research export instead of silently emitting an empty quote.
//
// Additive and backward compatible: the field is optional and defaults to
// the empty string. Historical rows keep their existing `anchorValid` value
// and have an empty `anchorError` (unknown reason) — no values are invented.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('ai_feedback_items');
		if (collection.fields.getByName('anchorError')) return;
		collection.fields.add(
			new TextField({
				name: 'anchorError',
				required: false,
				max: 64,
			}),
		);
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('ai_feedback_items');
		collection.fields.removeByName('anchorError');
		app.save(collection);
	},
);
