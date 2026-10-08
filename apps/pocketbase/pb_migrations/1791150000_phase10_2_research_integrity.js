/// <reference path="../pb_data/types.d.ts" />

// Phase 10.2 — Research integrity hardening (ADDITIVE only).
//
// No historical records are altered. Existing rows simply have empty/default
// values for the new fields. No grades, feedback, or student-visible data
// are changed.
//
// 1. ai_feedback_items.raterJudgments (json) — minimal multi-rater foundation.
//    Stores an array of independent rater judgments:
//    [{ round, reviewer, judgment, reviewedAt }].
//    The existing reviewer/reviewedAt/adjudicationStatus fields remain for
//    backward compatibility; new annotations APPEND to raterJudgments so
//    Rater 1 is never overwritten by Rater 2. The system preserves
//    independent judgments rather than overwriting.
//
// 2. personalization_logs.feedbackMode (text) — immutable experimental
//    condition: 'generic' | 'personalized'. Recorded at feedback-generation
//    time so the mode can never change retroactively.
//
// 3. personalization_logs.personalizationThreshold (number) — the threshold
//    active when the feedback was generated (immutable provenance).
migrate(
	(app) => {
		const items = app.findCollectionByNameOrId('ai_feedback_items');
		if (!items.fields.getByName('raterJudgments')) {
			items.fields.add(new JSONField({ name: 'raterJudgments', maxSize: 100000 }));
		}
		app.save(items);

		let logs;
		try {
			logs = app.findCollectionByNameOrId('personalization_logs');
		} catch (_) {
			logs = null;
		}
		if (logs) {
			if (!logs.fields.getByName('feedbackMode')) {
				logs.fields.add(new TextField({ name: 'feedbackMode', max: 16 }));
			}
			if (!logs.fields.getByName('personalizationThreshold')) {
				logs.fields.add(
					new NumberField({
						name: 'personalizationThreshold',
						min: 0,
						max: 20,
						onlyInt: true,
					}),
				);
			}
			app.save(logs);
		}
	},
	(app) => {
		try {
			const items = app.findCollectionByNameOrId('ai_feedback_items');
			if (items.fields.getByName('raterJudgments')) {
				items.fields.removeByName('raterJudgments');
				app.save(items);
			}
		} catch (e) {
			if (!String(e?.message || e).includes('no rows in result set')) throw e;
		}
		try {
			const logs = app.findCollectionByNameOrId('personalization_logs');
			if (logs.fields.getByName('feedbackMode')) {
				logs.fields.removeByName('feedbackMode');
				app.save(logs);
			}
			if (logs.fields.getByName('personalizationThreshold')) {
				logs.fields.removeByName('personalizationThreshold');
				app.save(logs);
			}
		} catch (e) {
			if (!String(e?.message || e).includes('no rows in result set')) throw e;
		}
	},
);
