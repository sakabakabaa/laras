/// <reference path="../pb_data/types.d.ts" />

// Lecturer Penilaian / Gradebook — manual grade components, per-student grade
// entries, and final-grade overrides.
//
// Three owner-scoped collections (the lecturer who owns the course):
//
// 1. `grade_components` — gradebook columns. Either a manual component
//    (kind='manual') or one linked to an existing LARAS assignment
//    (kind='assignment'). Holds name, description, maxScore, weight, order,
//    and status (active/archived). Assignment-linked components read their
//    grades live from `assignment_submissions.grade` (never duplicated);
//    manual components read/write `grade_entries`.
//
// 2. `grade_entries` — one per (component, student) for MANUAL components
//    only. `value` is optional: null/absent = "not graded" (never silently
//    zero). An explicit 0 is a real grade. `source` records manual vs
//    assignment origin for traceability.
//
// 3. `grade_overrides` — an optional lecturer final-grade override per
//    (course, student). When present it replaces the calculated final grade
//    and is visibly labeled "override dosen".
//
// All three are owner-only (the lecturer who owns the course). Students and
// public participants can never read gradebook data — the student-facing
// Nilai view reads published assignment grades through its own path.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const courses = app.findCollectionByNameOrId('courses');
		const assignments = app.findCollectionByNameOrId('assignments');

		// 1. grade_components
		try {
			app.findCollectionByNameOrId('grade_components');
		} catch (_) {
			const components = new Collection({
				type: 'base',
				name: 'grade_components',
				listRule: "@request.auth.id != '' && owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && owner = @request.auth.id",
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
					{ name: 'name', type: 'text', required: true, max: 200 },
					{ name: 'description', type: 'text', max: 2000 },
					{ name: 'maxScore', type: 'number', min: 1 },
					{ name: 'weight', type: 'number', min: 0, max: 100 },
					{
						name: 'kind',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['manual', 'assignment'],
					},
					{
						name: 'assignment',
						type: 'relation',
						maxSelect: 1,
						collectionId: assignments.id,
						cascadeDelete: false,
					},
					{ name: 'order', type: 'number', min: 0 },
					{
						name: 'status',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['active', 'archived'],
					},
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE INDEX idx_grade_components_course ON grade_components (course)',
					'CREATE INDEX idx_grade_components_owner ON grade_components (owner)',
				],
			});
			app.save(components);
		}

		// 2. grade_entries
		try {
			app.findCollectionByNameOrId('grade_entries');
		} catch (_) {
			const entries = new Collection({
				type: 'base',
				name: 'grade_entries',
				listRule: "@request.auth.id != '' && owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && owner = @request.auth.id",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && owner = @request.auth.id && @request.body.component:changed = false && @request.body.student:changed = false",
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
						name: 'component',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: app.findCollectionByNameOrId('grade_components').id,
						cascadeDelete: true,
					},
					{
						name: 'student',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{ name: 'value', type: 'number', min: 0 },
					{
						name: 'source',
						type: 'select',
						maxSelect: 1,
						values: ['manual', 'assignment'],
					},
					{ name: 'note', type: 'text', max: 500 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_grade_entries_pair ON grade_entries (component, student)',
					'CREATE INDEX idx_grade_entries_component ON grade_entries (component)',
				],
			});
			app.save(entries);
		}

		// 3b. grade_publications — one row per course marking that the
		// lecturer has explicitly published the gradebook results. Until this
		// row exists the gradebook is in draft; manual component grades and
		// the calculated final grade are lecturer-only and never shown to
		// students through this collection.
		try {
			app.findCollectionByNameOrId('grade_publications');
		} catch (_) {
			const pubs = new Collection({
				type: 'base',
				name: 'grade_publications',
				listRule: "@request.auth.id != '' && owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && owner = @request.auth.id",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && owner = @request.auth.id && @request.body.course:changed = false",
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
					{ name: 'publishedAt', type: 'date', required: true },
					{ name: 'note', type: 'text', max: 500 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_grade_publications_course ON grade_publications (course)',
				],
			});
			app.save(pubs);
		}

		// 3. grade_overrides
		try {
			app.findCollectionByNameOrId('grade_overrides');
		} catch (_) {
			const overrides = new Collection({
				type: 'base',
				name: 'grade_overrides',
				listRule: "@request.auth.id != '' && owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && owner = @request.auth.id",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && owner = @request.auth.id && @request.body.course:changed = false && @request.body.student:changed = false",
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
						name: 'student',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{ name: 'value', type: 'number', required: true, min: 0, max: 100 },
					{ name: 'note', type: 'text', max: 500 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_grade_overrides_pair ON grade_overrides (course, student)',
				],
			});
			app.save(overrides);
		}
	},
	(app) => {
		for (const name of ['grade_overrides', 'grade_publications', 'grade_entries', 'grade_components']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (e) {
				if (!String(e?.message || e).includes('no rows in result set')) throw e;
			}
		}
	},
);
