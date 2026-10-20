/// <reference path="../pb_data/types.d.ts" />

// Phase 2 (Manajemen Berkas navigation) — denormalised parse index.
//
// The library page used to download every file and every extraction and join
// them in the browser, so filtering and paging were client-side only. These
// columns let the server filter, count and page:
//
//   parseStatus  mirrors the latest file_extractions row (pending/ready/review/failed)
//   parsedChars  character count of the extracted text (0 = nothing usable)
//   parsedAt     when that extraction finished
//   contentHash  SHA-256 of the bytes, for duplicate detection
//   kind         cached media kind, so type filtering is a column match
//
// Existing rows are backfilled from file_extractions; rows without an
// extraction become `pending` and show up under "Perlu tindakan" until the
// lecturer re-processes them.
migrate((app) => {
	const KIND_BY_EXT = {
		pdf: 'document', doc: 'document', docx: 'document', ppt: 'document', pptx: 'document',
		xls: 'document', xlsx: 'document', odt: 'document', ods: 'document', odp: 'document',
		rtf: 'document', txt: 'document', md: 'document', csv: 'document',
		png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', heic: 'image',
		mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', aac: 'audio', flac: 'audio',
		mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
	};

	const collection = app.findCollectionByNameOrId('file_library');
	// In this PocketBase version getByName returns undefined for a missing field
	// instead of throwing, so existence is a truthiness check.
	const hasField = (name) => Boolean(collection.fields.getByName(name));

	if (!hasField('parseStatus')) {
		collection.fields.add(new SelectField({
			name: 'parseStatus',
			maxSelect: 1,
			values: ['pending', 'ready', 'review', 'failed'],
		}));
	}
	if (!hasField('parsedChars')) {
		collection.fields.add(new NumberField({ name: 'parsedChars', onlyInt: true }));
	}
	if (!hasField('parsedAt')) {
		collection.fields.add(new DateField({ name: 'parsedAt' }));
	}
	if (!hasField('contentHash')) {
		collection.fields.add(new TextField({ name: 'contentHash', max: 64 }));
	}
	if (!hasField('kind')) {
		collection.fields.add(new SelectField({
			name: 'kind',
			maxSelect: 1,
			values: ['document', 'image', 'audio', 'video', 'other'],
		}));
	}

	// Multi-relation fields (course, session) cannot back a plain SQL index, so
	// the list index is owner + created and the relation filters stay unindexed.
	const wanted = [
		'CREATE INDEX idx_file_library_owner_status ON file_library (owner, parseStatus)',
		'CREATE INDEX idx_file_library_owner_created ON file_library (owner, created)',
		'CREATE INDEX idx_file_library_hash ON file_library (contentHash)',
	];
	const existing = collection.indexes || [];
	collection.indexes = [
		...existing.filter((sql) => !wanted.some((w) => w.split(' ')[2] === sql.split(' ')[2])),
		...wanted,
	];
	app.save(collection);

	// Backfill. Wrapped per record so one malformed row cannot abort the migration.
	const records = app.findAllRecords('file_library');
	for (const record of records) {
		try {
			const filename = String(record.getString('file') || '');
			const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
			record.set('kind', KIND_BY_EXT[ext] || 'other');

			const extractions = app.findRecordsByFilter(
				'file_extractions',
				`file="${record.id}"`,
				'-created',
				1,
				0,
			);
			const extraction = extractions.length ? extractions[0] : null;
			if (extraction) {
				record.set('parseStatus', extraction.getString('status') || 'pending');
				record.set('parsedChars', extraction.getInt('chars'));
				const at = extraction.getString('extractedAt');
				if (at) record.set('parsedAt', at);
			} else {
				record.set('parseStatus', 'pending');
				record.set('parsedChars', 0);
			}
			app.save(record);
		} catch (_) {
			// leave this row untouched; a re-process will fix it
		}
	}
});
