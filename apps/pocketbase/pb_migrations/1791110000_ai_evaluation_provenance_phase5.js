/// <reference path="../pb_data/types.d.ts" />

// Phase 5 (research — German as a Foreign Language writing) — AI generation
// provenance and reproducibility metadata for formal-task AI evaluation drafts.
//
// Every new formal writing AI evaluation records research provenance so the
// generated feedback can be reproduced and audited: the model identifier and
// version actually used (or "unknown" when the platform API does not expose
// them), the prompt and system-prompt version constants, the exact raw model
// output hash and the hashed student input text, the generation duration, the
// research schema version, and boolean indicators of which input sources the
// run consumed (student text, images, approved course material, rubric, CEFR
// level information).
//
// All fields are additive and backward-compatible: existing evaluations without
// provenance remain valid and simply read as empty/unknown. Provenance is
// lecturer/researcher private — the `ai_evaluations` collection is already
// owner-only (list/view rules scope to the owning lecturer) with server-only
// writes (create/update/delete rules are null), so students and public
// participants can never read provenance, and no client can edit it. Official
// scoring is unchanged.
migrate(
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');

		const addText = (name, max) => {
			if (!evaluations.fields.getByName(name)) {
				evaluations.fields.add(new TextField({ name, max }));
			}
		};
		const addNumber = (name) => {
			if (!evaluations.fields.getByName(name)) {
				evaluations.fields.add(new NumberField({ name }));
			}
		};
		const addBool = (name) => {
			if (!evaluations.fields.getByName(name)) {
				evaluations.fields.add(new BoolField({ name }));
			}
		};

		// Model identifier / version actually used, or "unknown" when the
		// platform model API does not expose them. Never invented.
		addText('model', 64);
		addText('modelVersion', 64);
		// Prompt / system-prompt version constants (e.g. "german-gfl-feedback-v1").
		addText('promptVersion', 64);
		addText('systemPromptVersion', 64);
		// SHA-256 hex hash of the reviewed student input text and of the exact
		// raw model output, for reproducibility without storing the full input.
		addText('inputTextHash', 128);
		addText('outputHash', 128);
		// Wall-clock generation duration in milliseconds, when available.
		addNumber('generationDurationMs');
		// Research provenance schema version (integer). Null on old rows.
		addNumber('researchSchemaVersion');
		// Boolean input-source indicators: which sources the AI run consumed.
		addBool('usedStudentText');
		addBool('usedImages');
		addBool('usedCourseMaterial');
		addBool('usedRubric');
		addBool('usedCefr');

		app.save(evaluations);
	},
	(app) => {
		const evaluations = app.findCollectionByNameOrId('ai_evaluations');
		[
			'model',
			'modelVersion',
			'promptVersion',
			'systemPromptVersion',
			'inputTextHash',
			'outputHash',
			'generationDurationMs',
			'researchSchemaVersion',
			'usedStudentText',
			'usedImages',
			'usedCourseMaterial',
			'usedRubric',
			'usedCefr',
		].forEach((name) => {
			if (evaluations.fields.getByName(name)) {
				evaluations.fields.removeByName(name);
			}
		});
		app.save(evaluations);
	},
);
