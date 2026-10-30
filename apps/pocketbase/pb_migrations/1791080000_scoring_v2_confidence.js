/// <reference path="../pb_data/types.d.ts" />

// Scoring v2 — proportional capped penalties, length/completion awareness,
// general-finding pool, robust criterion matching, and speaking-task
// pronunciation confidence.
//
// 1. `ai_evaluations.scoringVersion` (number): distinguishes evaluations
//    published under the old flat -20/-8 model (null) from those published
//    under the new proportional capped model (2). Existing published grades
//    are NEVER retroactively recomputed — the field simply records which
//    scoring logic produced the stored finalScore/rubricScores.
//
// 2. `assignment_submissions.transcriptConfidence` (json): a per-word
//    confidence summary produced server-side alongside the speaking
//    transcript — { mean, min, lowWords: [{ word, confidence, start }] }.
//    Locked against student writes exactly like the other transcript fields;
//    lecturers read it as an advisory pronunciation signal (never an
//    auto-penalty).
migrate(
	(app) => {
		// 1. scoringVersion on ai_evaluations
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		if (!evaluations.fields.getByName('scoringVersion')) {
			evaluations.fields.add(new NumberField({ name: 'scoringVersion', min: 0 }));
			app.save(evaluations);
		}

		// 2. transcriptConfidence on assignment_submissions + lock
		const submissions = app.findCollectionByNameOrId('assignment_submissions');
		if (!submissions.fields.getByName('transcriptConfidence')) {
			submissions.fields.add(new JSONField({ name: 'transcriptConfidence', maxSize: 50000 }));
			submissions.createRule =
				"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false && @request.body.autoScore:isset = false && @request.body.taskReview:isset = false && @request.body.transcript:isset = false && @request.body.transcriptStatus:isset = false && @request.body.transcriptError:isset = false && @request.body.transcriptFile:isset = false && @request.body.transcriptConfidence:isset = false";
			submissions.updateRule =
				"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false && @request.body.autoScore:changed = false && @request.body.taskReview:changed = false && @request.body.transcript:changed = false && @request.body.transcriptStatus:changed = false && @request.body.transcriptError:changed = false && @request.body.transcriptFile:changed = false && @request.body.linkedFromPublic:changed = false && @request.body.transcriptConfidence:changed = false) || assignment.owner = @request.auth.id)";
			app.save(submissions);
		}
	},
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		evaluations.fields.removeByName('scoringVersion');
		app.save(evaluations);

		const submissions = app.findCollectionByNameOrId('assignment_submissions');
		submissions.fields.removeByName('transcriptConfidence');
		submissions.createRule =
			"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false && @request.body.autoScore:isset = false && @request.body.taskReview:isset = false && @request.body.transcript:isset = false && @request.body.transcriptStatus:isset = false && @request.body.transcriptError:isset = false && @request.body.transcriptFile:isset = false";
		submissions.updateRule =
			"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false && @request.body.autoScore:changed = false && @request.body.taskReview:changed = false && @request.body.transcript:changed = false && @request.body.transcriptStatus:changed = false && @request.body.transcriptError:changed = false && @request.body.transcriptFile:changed = false && @request.body.linkedFromPublic:changed = false) || assignment.owner = @request.auth.id)";
		app.save(submissions);
	},
);
