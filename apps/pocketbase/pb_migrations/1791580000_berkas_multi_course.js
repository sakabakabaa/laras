// Berkas multi-course linking.
//
// The file library originally tied each file to exactly ONE course (and one
// CPMK / Sub-CPMK / session). In practice a document — a textbook chapter, a
// reference, a shared handout — is relevant to several mata kuliah at once, so
// the single relation forced lecturers to duplicate uploads or pick one owner.
//
// This migration widens the four link relations to multi-select so a berkas can
// appear under several courses. It is additive: existing links are preserved by
// converting the stored scalar ("abc123") into a single-element array
// (["abc123"]). PocketBase reads a maxSelect=1 relation as a bare string and a
// maxSelect>1 relation as an array, so the values MUST be rewritten in the same
// step the field widens — otherwise every existing file would silently lose its
// course link.
//
// The view layer groups these links for navigation only; nothing is moved.

/** Rewrites one relation value from scalar string to array form. */
function toArray(value) {
	if (Array.isArray(value)) return value;
	if (typeof value === 'string' && value) return [value];
	return [];
}

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('file_library');

	// 1 — Widen each relation and convert its stored values.
		for (const name of ['course', 'cpmk', 'subCpmk', 'session']) {
			const field = collection.fields.getByName(name);
			if (!field) continue;
			// Already widened (e.g. a re-run) — leave the data alone.
			if (field.maxSelect > 1) continue;
			field.maxSelect = 50;
			collection.fields.add(field);
	}
	app.save(collection);

	// 2 — Convert scalar values to arrays now that the fields accept them.
		const records = app.findAllRecords('file_library');
		for (const record of records) {
			let changed = false;
			for (const name of ['course', 'cpmk', 'subCpmk', 'session']) {
				const current = record.get(name);
				if (Array.isArray(current)) continue;
				const next = toArray(current);
				// An empty array is still a meaningful (if unlinked) value.
				record.set(name, next);
				changed = true;
			}
			if (changed) app.save(record);
	}

	// 3 — The collection rules test `course` as a scalar. With a multi-relation
	// the request body carries an array, so require it to be present and
	// non-empty (`!= ""` works for both arrays and scalars in the filter
	// language; there is no `[]` literal).
	collection.createRule =
			"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty' && @request.body.course != '' && @request.body.course != null";
	collection.updateRule =
			"@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && (@request.body.course:isset = false || (@request.body.course != '' && @request.body.course != null))";
	app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('file_library');

	// Collapse arrays back to the first linked id before narrowing.
		const records = app.findAllRecords('file_library');
		for (const record of records) {
			let changed = false;
			for (const name of ['course', 'cpmk', 'subCpmk', 'session']) {
				const current = record.get(name);
				if (!Array.isArray(current)) continue;
				record.set(name, current.length ? current[0] : '');
				changed = true;
			}
			if (changed) app.save(record);
	}

		for (const name of ['course', 'cpmk', 'subCpmk', 'session']) {
			const field = collection.fields.getByName(name);
			if (!field) continue;
			field.maxSelect = 1;
			collection.fields.add(field);
	}
	collection.createRule =
			"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty' && @request.body.course != ''";
	collection.updateRule =
			"@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && (@request.body.course:isset = false || @request.body.course != '')";
	app.save(collection);
	},
);
