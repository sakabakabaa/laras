/// <reference path="../pb_data/types.d.ts" />

// Phase 8 — progressive formative feedback instrumentation.
//
// Raises check_attempts.level max from 3 to 4 so Level 4 (explicit correction,
// student-requested only — never auto-escalated) can be stored, and adds
// research-safe interaction metadata recorded on every check:
// - requestedNextHint: the student returned for further assistance after a
//   prior check (attempt > 1).
// - revisionSubmitted: the student's answer changed since the previous check.
// - revisesAttempt: the previous check_attempt id this one revises (revision chain).
//
// These fields are server-recorded instrumentation only. They never carry
// research judgments, AI confidence, human adjudication, lecturer annotations,
// or personal data beyond the student's own attempt/submission identifiers and
// the previous-attempt revision link. Existing rows keep their level (1–3) and
// default the new booleans to false / the link to ''.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('check_attempts');

		const level = collection.fields.getByName('level');
		if (level) level.max = 4;

		if (!collection.fields.getByName('requestedNextHint')) {
			collection.fields.add(new BoolField({ name: 'requestedNextHint' }));
		}
		if (!collection.fields.getByName('revisionSubmitted')) {
			collection.fields.add(new BoolField({ name: 'revisionSubmitted' }));
		}
		if (!collection.fields.getByName('revisesAttempt')) {
			collection.fields.add(new TextField({ name: 'revisesAttempt', max: 64 }));
		}
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('check_attempts');
		const level = collection.fields.getByName('level');
		if (level) level.max = 3;
		collection.fields.removeByName('requestedNextHint');
		collection.fields.removeByName('revisionSubmitted');
		collection.fields.removeByName('revisesAttempt');
		app.save(collection);
	},
);
