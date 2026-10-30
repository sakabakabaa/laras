/// <reference path="../pb_data/types.d.ts" />

// Phase 3: full Simpan draf → Cek jawaban → Revisi → Kirim workflow for
// public-link participants.
// - `public_submissions.status` gains a `draft` value (additive — existing
//   submitted/late/graded rows and rules untouched).
// - `public_submissions.continuationToken` — random secret created together
//   with the first draft; required to reopen the draft, run further checks,
//   or submit. Unique partial index so codes never collide.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('public_submissions');

		const status = collection.fields.getByName('status');
		if (!status.values.includes('draft')) {
			status.values = ['draft', ...status.values];
		}

		if (!collection.fields.getByName('continuationToken')) {
			collection.fields.add(new TextField({ name: 'continuationToken', max: 64 }));
		}

		if (!collection.indexes.some((idx) => idx.includes('idx_public_sub_continuation'))) {
			collection.indexes.push(
				"CREATE UNIQUE INDEX `idx_public_sub_continuation` ON `public_submissions` (`continuationToken`) WHERE `continuationToken` != ''",
			);
		}

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('public_submissions');
		collection.indexes = collection.indexes.filter(
			(idx) => !idx.includes('idx_public_sub_continuation'),
		);
		const status = collection.fields.getByName('status');
		status.values = status.values.filter((value) => value !== 'draft');
		try {
			collection.fields.removeByName('continuationToken');
		} catch (_) {}
		app.save(collection);
	},
);
