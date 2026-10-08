/// <reference path="../pb_data/types.d.ts" />

// Phase 2 (additive): progressive hint levels on formative checks.
// `check_attempts.level` records which hint tier each check used:
// 1 = reflection prompt, 2 = general concept hint, 3 = focused hint.
// Existing rows are backfilled from their attempt number (min(attempt, 3)).
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("check_attempts");
		collection.fields.add(new NumberField({ name: "level", min: 1, max: 3, onlyInt: true }));
		app.save(collection);

		const rows = app.findRecordsByFilter("check_attempts", "id != ''", "created", 500, 0);
		for (const row of rows) {
			const attempt = Number(row.get("attempt")) || 1;
			row.set("level", Math.min(Math.max(attempt, 1), 3));
			app.save(row);
		}
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("check_attempts");
		collection.fields.removeByName("level");
		app.save(collection);
	},
);
