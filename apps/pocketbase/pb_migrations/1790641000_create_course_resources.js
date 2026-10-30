/// <reference path="../pb_data/types.d.ts" />

/**
 * Course resources / file storage.
 *
 * A lecturer-managed library of materials linked to a course and optionally to
 * a specific weekly session. Supports uploaded files (PPTX, PDF, DOCX, XLSX,
 * images, audio, video) and external links. Students read/download in read-only
 * mode; only the faculty owner may create/update/delete.
 *
 *   kind        — "file" (uploaded binary) or "link" (external URL)
 *   file        — single file upload (when kind = "file")
 *   url         — external link URL (when kind = "link")
 *   session     — optional relation to a class_sessions pertemuan
 */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const courses = app.findCollectionByNameOrId('courses');
		const sessions = app.findCollectionByNameOrId('class_sessions');

		let collection;
		try {
			collection = app.findCollectionByNameOrId('course_resources');
		} catch (_) {
			collection = new Collection({
				type: 'base',
				name: 'course_resources',
				// All signed-in users (students included) may browse resources.
				listRule: "@request.auth.id != ''",
				viewRule: "@request.auth.id != ''",
				// Only faculty owners may add resources for their own course.
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && @request.body.course:changed = false",
				deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
				fields: [
					{
						name: 'owner',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{
						name: 'course',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: courses.id,
						cascadeDelete: true,
					},
					{
						name: 'session',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: sessions.id,
						cascadeDelete: false,
					},
					{
						name: 'title',
						type: 'text',
						required: true,
						max: 200,
					},
					{ name: 'description', type: 'text', max: 2000 },
					{
						name: 'kind',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['file', 'link'],
					},
					{
						name: 'file',
						type: 'file',
						required: false,
						maxSelect: 1,
						maxSize: 100 * 1024 * 1024, // 100MB
						mimeTypes: [
							'application/pdf',
							'application/vnd.openxmlformats-officedocument.presentationml.presentation',
							'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
							'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
							'application/vnd.ms-powerpoint',
							'application/msword',
							'application/vnd.ms-excel',
							'image/jpeg',
							'image/png',
							'image/webp',
							'image/gif',
							'image/svg+xml',
							'audio/mpeg',
							'audio/wav',
							'audio/ogg',
							'audio/aac',
							'audio/x-m4a',
							'video/mp4',
							'video/webm',
							'video/ogg',
							'video/quicktime',
						],
					},
					{ name: 'url', type: 'url', required: false },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE INDEX idx_resources_course ON course_resources (course)',
					'CREATE INDEX idx_resources_session ON course_resources (session)',
				],
			});
			app.save(collection);
		}
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('course_resources'));
		} catch (_) {
			/* already absent */
		}
	},
);
