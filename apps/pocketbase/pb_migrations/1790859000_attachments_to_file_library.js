/// <reference path="../pb_data/types.d.ts" />

/**
 * Repoints `assignments.attachments` from `course_resources` to `file_library`
 * (the Berkas system) so the Tugas creator's "Materi pendukung" step lists the
 * documents a lecturer actually uploaded and linked to a course/session through
 * Manajemen berkas — instead of the parallel, sparser `course_resources` table.
 *
 * PocketBase does not allow changing an existing relation field's target
 * collection in a single save (it treats remove+re-add-with-same-name as an
 * in-place collectionId change and rejects it with "The relation collection
 * cannot be changed"). The workaround is two separate saves: first remove the
 * old field and persist, then add a fresh field (new internal id) pointing at
 * `file_library` and persist again. There is no existing assignment data
 * (0 rows, 0 course_resources attachments), so this is lossless.
 * `course_resources` itself is kept for the course-detail "Materi mata
 * kuliah" tab and the listening builder.
 *
 * Also repairs a data bug: `file_library.version` was never set on create, so
 * rows stored `0` while their extractions / context sections stored `1`. That
 * made every approved context section look version-mismatched and silently
 * excluded the file from AI grounding. Backfill `0` → `1` so existing approved
 * context becomes eligible again.
 */
migrate(
	(app) => {
		const fileLibrary = app.findCollectionByNameOrId('file_library');

		const assignments = app.findCollectionByNameOrId('assignments');
		const existing = assignments.fields.getByName('attachments');
		if (existing && existing.collectionId !== fileLibrary.id) {
			// Step 1: drop the old relation field and persist so PocketBase
			// forgets its prior collectionId.
			assignments.fields.removeByName('attachments');
			app.save(assignments);
			// Step 2: re-add a fresh field pointing at file_library.
			assignments.fields.add(
				new RelationField({
					name: 'attachments',
					collectionId: fileLibrary.id,
					maxSelect: 20,
					minSelect: 0,
				}),
			);
			app.save(assignments);
		}

		// Repair file_library.version = 0 → 1 (the create flow now sets it, but
		// rows uploaded before this fix stored 0 and broke context matching).
		const files = app.findRecordsByFilter('file_library', 'version = 0', '', 500);
		for (const row of files) {
			row.set('version', 1);
			app.save(row);
		}
	},
	(app) => {
		const courseResources = app.findCollectionByNameOrId('course_resources');
		const assignments = app.findCollectionByNameOrId('assignments');
		const existing = assignments.fields.getByName('attachments');
		if (existing && existing.collectionId !== courseResources.id) {
			assignments.fields.removeByName('attachments');
			app.save(assignments);
			assignments.fields.add(
				new RelationField({
					name: 'attachments',
					collectionId: courseResources.id,
					maxSelect: 20,
					minSelect: 0,
				}),
			);
			app.save(assignments);
		}
	},
);
