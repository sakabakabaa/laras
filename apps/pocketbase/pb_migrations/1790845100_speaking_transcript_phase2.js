/// <reference path="../pb_data/types.d.ts" />

/**
 * Speaking-task Phase 2 — store the Whisper transcript alongside the
 * enrolled student's speaking submission.
 *
 * Adds four fields to `assignment_submissions`:
 *  - `transcript`       (text)  the transcribed text, written server-side only
 *  - `transcriptStatus` (select) pending | processing | ready | failed
 *  - `transcriptError`  (text)  a short failure reason shown to the student
 *  - `transcriptFile`   (text)  which audio file the transcript came from
 *
 * The transcript is produced server-side by `/api/transcribe` using the
 * `WHISPER_API_KEY` secret, so students must never write these fields
 * directly. The create/update rules below lock them the same way `grade`,
 * `feedback`, and `autoScore` are already locked: students can neither set
 * them on create nor change them on update. The lecturer (assignment owner)
 * path is unchanged — lecturers review, they do not author transcripts.
 *
 * Public submissions are intentionally untouched: the in-browser recorder is
 * enrolled-student-only (Phase 1), so Phase 2 transcription targets the
 * enrolled speaking flow.
 */
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('assignment_submissions');

		collection.fields.add(
			new TextField({
				name: 'transcript',
				max: 20000,
			}),
		);
		collection.fields.add(
			new SelectField({
				name: 'transcriptStatus',
				maxSelect: 1,
				values: ['pending', 'processing', 'ready', 'failed'],
			}),
		);
		collection.fields.add(
			new TextField({
				name: 'transcriptError',
				max: 1000,
			}),
		);
		collection.fields.add(
			new TextField({
				name: 'transcriptFile',
				max: 250,
			}),
		);

		// Lock the transcript fields against student writes, mirroring the
		// existing grade/feedback/autoScore locks. Lecturer path is unchanged.
		collection.createRule =
			"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false && @request.body.autoScore:isset = false && @request.body.taskReview:isset = false && @request.body.transcript:isset = false && @request.body.transcriptStatus:isset = false && @request.body.transcriptError:isset = false && @request.body.transcriptFile:isset = false";
		collection.updateRule =
			"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false && @request.body.autoScore:changed = false && @request.body.taskReview:changed = false && @request.body.transcript:changed = false && @request.body.transcriptStatus:changed = false && @request.body.transcriptError:changed = false && @request.body.transcriptFile:changed = false) || assignment.owner = @request.auth.id)";

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('assignment_submissions');
		collection.fields.removeByName('transcript');
		collection.fields.removeByName('transcriptStatus');
		collection.fields.removeByName('transcriptError');
		collection.fields.removeByName('transcriptFile');
		// Restore the pre-Phase-2 rules.
		collection.createRule =
			"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false && @request.body.autoScore:isset = false && @request.body.taskReview:isset = false";
		collection.updateRule =
			"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false && @request.body.autoScore:changed = false && @request.body.taskReview:changed = false) || assignment.owner = @request.auth.id)";
		app.save(collection);
	},
);
