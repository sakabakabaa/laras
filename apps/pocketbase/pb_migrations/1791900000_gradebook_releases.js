/// <reference path="../pb_data/types.d.ts" />

// Grade releases — immutable publication snapshots (PR 2 of the grading plan).
//
// Problem this fixes: `grade_publications` only records THAT a course was
// published, never WHAT was released. The student summary endpoint therefore
// recomputed the final grade from live entries on every read, so a lecturer
// editing a published course instantly changed what students see, with no
// record of what was actually released.
//
// Two collections:
//
// 1. `grade_releases` — one row per publication event. `revision` increments
//    per course; the newest row with status='published' is the current
//    student-visible release. Published releases are IMMUTABLE: no update or
//    delete rule grants anyone access, so only server code (superuser) can
//    ever touch them after creation. `inputsHash` pins the exact previewed
//    inputs; `summary` carries the release preview (changed students, counts).
//
// 2. `grade_release_items` — the per-student snapshot: final score, letter,
//    completeness and the full component rows. Students never read this
//    collection directly; they go through the authenticated summary endpoint,
//    which returns only their own item from the current release.
//
// Backfill (honest, marker-only): every course with a `grade_publications`
// row gets ONE release row with status='published', revision=1 and a reason
// stating plainly that the historical per-student values cannot be
// reconstructed. We deliberately do NOT fabricate `grade_release_items` rows:
// the live entries TODAY are not what was published originally (lecturers may
// have edited since), and inventing plausible items would be worse than
// having none — students would see a snapshot that looks authoritative but
// was never actually released. The reader (api.course-grade-summary) is
// therefore gated: it serves a release snapshot only when that release has
// items for the student, and falls back to the pre-existing live path
// (including intentionally public computed/assignment component values)
// while releases are still marker-only. See the rollout note in the reader.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const courses = app.findCollectionByNameOrId('courses');

		// 1. grade_releases
		try {
			app.findCollectionByNameOrId('grade_releases');
		} catch (_) {
			const releases = new Collection({
				type: 'base',
				name: 'grade_releases',
				listRule: "@request.auth.id != '' && owner = @request.auth.id",
				viewRule: "@request.auth.id != '' && owner = @request.auth.id",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				// Immutable once created: no update/delete rule at all. Only
				// server code (superuser/admin context) can correct or retire a
				// release, and superseding happens by creating a new one.
				updateRule: null,
				deleteRule: null,
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
					{ name: 'revision', type: 'number', required: true, min: 1 },
					{
						name: 'status',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['draft', 'published', 'superseded'],
					},
					{ name: 'reason', type: 'text', max: 2000 },
					{ name: 'publishedAt', type: 'date' },
					{ name: 'inputsHash', type: 'text', max: 200 },
					{ name: 'summary', type: 'json', maxSize: 200000 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE INDEX idx_grade_releases_course ON grade_releases (course)',
					'CREATE INDEX idx_grade_releases_owner ON grade_releases (owner)',
				],
			});
			app.save(releases);
		}

		// 2. grade_release_items
		try {
			app.findCollectionByNameOrId('grade_release_items');
		} catch (_) {
			const items = new Collection({
				type: 'base',
				name: 'grade_release_items',
				// Owner-scoped view only: students read released values through
				// the summary endpoint, which returns their own item exclusively.
				listRule: "@request.auth.id != '' && student = @request.auth.id",
				viewRule: "@request.auth.id != '' && student = @request.auth.id",
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{
						name: 'release',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: app.findCollectionByNameOrId('grade_releases').id,
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
					{ name: 'finalScore', type: 'number', min: 0, max: 100 },
					{ name: 'letterGrade', type: 'text', max: 4 },
					{ name: 'complete', type: 'bool' },
					{ name: 'components', type: 'json', maxSize: 100000 },
					{ name: 'override', type: 'json', maxSize: 2000 },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_grade_release_items_pair ON grade_release_items (release, student)',
					'CREATE INDEX idx_grade_release_items_release ON grade_release_items (release)',
				],
			});
			app.save(items);
		}

		// Backfill: one marker release per course that has a legacy
		// `grade_publications` row. Marker-only — see the file header for why
		// no per-student items are fabricated.
		const releases = app.findCollectionByNameOrId('grade_releases');
		const pubs = app.findCollectionByNameOrId('grade_publications');
		const rows = app.findRecordsByFilter(pubs, '', '', 0, 0);
		for (const pub of rows) {
			const existing = app.findRecordsByFilter(
				releases,
				'course = {:course}',
				'-revision',
				1,
				0,
				{ course: pub.get('course') },
			);
			if (existing.length > 0) continue;
			const release = new Record(releases);
			release.set('owner', pub.get('owner'));
			release.set('course', pub.get('course'));
			release.set('revision', 1);
			release.set('status', 'published');
			release.set('publishedAt', pub.get('publishedAt'));
			release.set(
				'reason',
				'Backfill dari nilai live saat migrasi. Rilis lama tidak pernah menyimpan potret per-mahasiswa, sehingga nilai yang diterbitkan pada saat itu tidak dapat direkonstruksi. Baris ini hanya menandai bahwa mata kuliah ini pernah diterbitkan tanpa potret; dosen perlu menerbitkan ulang untuk membuat potret resmi yang baru.',
			);
			app.save(release);
		}
	},
	(app) => {
		// Real reversible down: drop items first (they reference releases).
		for (const name of ['grade_release_items', 'grade_releases']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (e) {
				if (!String(e?.message || e).includes('no rows in result set')) throw e;
			}
		}
	},
);
