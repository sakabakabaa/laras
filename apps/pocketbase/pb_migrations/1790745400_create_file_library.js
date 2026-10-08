/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		let collection;
		try {
			collection = app.findCollectionByNameOrId("file_library");
		} catch (_) {
			const users = app.findCollectionByNameOrId("users");
			const courses = app.findCollectionByNameOrId("courses");
			const cpmk = app.findCollectionByNameOrId("cpmk");
			const subCpmk = app.findCollectionByNameOrId("sub_cpmk");
			const sessions = app.findCollectionByNameOrId("class_sessions");

			collection = new Collection({
				type: "base",
				name: "file_library",
				// Owner sees their own files; "student" access opens a file to any
				// signed-in user; "public" opens it to anyone. Writes stay
				// lecturer-only and owner-scoped.
				listRule:
					"owner = @request.auth.id || (access = 'student' && @request.auth.id != '') || access = 'public'",
				viewRule:
					"owner = @request.auth.id || (access = 'student' && @request.auth.id != '') || access = 'public'",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false",
				deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
				fields: [
					{ name: "title", type: "text", required: true, max: 200 },
					{ name: "description", type: "text", max: 2000 },
					{
						name: "file",
						type: "file",
						maxSelect: 1,
						maxSize: 104857600, // 100 MB
						mimeTypes: [
							"application/pdf",
							"application/vnd.openxmlformats-officedocument.presentationml.presentation",
							"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
							"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
							"application/vnd.ms-powerpoint",
							"application/msword",
							"application/vnd.ms-excel",
							"image/jpeg",
							"image/png",
							"image/webp",
							"image/gif",
							"image/svg+xml",
							"audio/mpeg",
							"audio/wav",
							"audio/ogg",
							"audio/aac",
							"audio/x-m4a",
							"video/mp4",
							"video/webm",
							"video/quicktime",
						],
					},
					{ name: "size", type: "number", min: 0 },
					{
						name: "access",
						type: "select",
						required: true,
						maxSelect: 1,
						values: ["faculty", "student", "public"],
					},
					{
						name: "status",
						type: "select",
						required: true,
						maxSelect: 1,
						values: ["processing", "ready", "failed"],
					},
					{
						name: "owner",
						type: "relation",
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{
						name: "course",
						type: "relation",
						maxSelect: 1,
						collectionId: courses.id,
					},
					{
						name: "cpmk",
						type: "relation",
						maxSelect: 1,
						collectionId: cpmk.id,
					},
					{
						name: "subCpmk",
						type: "relation",
						maxSelect: 1,
						collectionId: subCpmk.id,
					},
					{
						name: "session",
						type: "relation",
						maxSelect: 1,
						collectionId: sessions.id,
					},
					{ name: "created", type: "autodate", onCreate: true, onUpdate: false },
					{ name: "updated", type: "autodate", onCreate: true, onUpdate: true },
				],
				indexes: [
					"CREATE INDEX idx_file_library_owner ON file_library (owner)",
					"CREATE INDEX idx_file_library_course ON file_library (course)",
				],
			});
			app.save(collection);
		}
	},
	(app) => {
		try {
			const collection = app.findCollectionByNameOrId("file_library");
			app.delete(collection);
		} catch (e) {
			if (String(e?.message || e).includes("no rows in result set")) return;
			throw e;
		}
	},
);
