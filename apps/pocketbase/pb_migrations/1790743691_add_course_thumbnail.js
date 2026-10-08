/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId("courses");

		const existing = collection.fields.getByName("thumbnail");
		if (existing) {
			if (existing.type === "file") return; // correct type already, skip
			collection.fields.removeByName("thumbnail"); // wrong type, replace
		}

		collection.fields.add(
			new FileField({
				name: "thumbnail",
				maxSelect: 1,
				maxSize: 5242880, // 5 MB
				mimeTypes: [
					"image/jpeg",
					"image/png",
					"image/webp",
					"image/gif",
					"image/svg+xml",
				],
				thumbs: ["400x300"],
			}),
		);
		app.save(collection);
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("courses");
			collection.fields.removeByName("thumbnail");
			app.save(collection);
		} catch (e) {
			if (String(e?.message || e).includes("no rows in result set")) return;
			throw e;
		}
	},
);
