/// <reference path="../pb_data/types.d.ts" />

/**
 * Speaking-task Phase 1 — allow browser-recorded audio mime types on the
 * submission file fields.
 *
 * MediaRecorder produces `audio/webm` (Chromium/Firefox) or `audio/mp4`
 * (Safari). Neither was in the original allowed mimeTypes list, so a
 * recorded clip would be rejected by PocketBase on upload. This adds both
 * (plus `audio/webm` already implied) to `assignment_submissions.files`
 * and `public_submissions.files` so recorded audio is stored securely
 * alongside the student submission. No transcription / Whisper wiring —
 * that is a later phase.
 */
migrate(
	(app) => {
		const ensureMime = (collectionName, fieldName, add) => {
			const collection = app.findCollectionByNameOrId(collectionName);
			const field = collection.fields.getByName(fieldName);
			if (!field || !Array.isArray(field.mimeTypes)) return;
			const set = new Set(field.mimeTypes);
			for (const m of add) set.add(m);
			field.mimeTypes = Array.from(set);
			app.save(collection);
		};

		// Enrolled channel.
		ensureMime('assignment_submissions', 'files', [
			'audio/webm',
			'audio/mp4',
			'audio/x-m4a',
		]);
		// Public channel (forward-compatible — public speaking recorder is a
		// later phase, but the field already accepts audio).
		ensureMime('public_submissions', 'files', ['audio/webm', 'audio/mp4']);
	},
	(app) => {
		const removeMime = (collectionName, fieldName, remove) => {
			try {
				const collection = app.findCollectionByNameOrId(collectionName);
				const field = collection.fields.getByName(fieldName);
				if (!field || !Array.isArray(field.mimeTypes)) return;
				field.mimeTypes = field.mimeTypes.filter((m) => !remove.includes(m));
				app.save(collection);
			} catch (e) {
				if (!String(e?.message || e).includes('no rows in result set')) throw e;
			}
		};
		removeMime('assignment_submissions', 'files', ['audio/webm', 'audio/mp4']);
		removeMime('public_submissions', 'files', ['audio/webm', 'audio/mp4']);
	},
);
