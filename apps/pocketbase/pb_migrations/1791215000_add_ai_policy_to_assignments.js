/// <reference path="../pb_data/types.d.ts" />

/**
 * Phase 1 (Student AI Assistance Policy) — add `aiPolicy` JSON field to
 * `assignments`.
 *
 * The field stores an explicit AI assistance policy
 * ({ enabled, assistanceLevel, allowedCapabilities, restrictedCapabilities,
 * prohibitedCapabilities, assessmentMode }) that the server-side enforcement
 * layer consults for every student AI request. When unset (legacy
 * assignments), the policy is derived from the assignment's existing AI
 * configuration fields (activity type, check settings) — preserving backward
 * compatibility. No existing field is removed or changed; this is a purely
 * additive extension to the existing assignment AI configuration.
 *
 * Lecturer AI behavior is untouched: the lecturer assistant does not read or
 * consult this field.
 */
migrate(
	(app) => {
		const assignments = app.findCollectionByNameOrId('assignments');

		if (!assignments.fields.getByName('aiPolicy')) {
			assignments.fields.add(
				new JSONField({
					name: 'aiPolicy',
					maxSize: 50000,
				}),
			);
			app.save(assignments);
		}
	},
	(app) => {
		try {
			const assignments = app.findCollectionByNameOrId('assignments');
			assignments.fields.removeByName('aiPolicy');
			app.save(assignments);
		} catch (_) {
			/* collection or field already gone — nothing to revert */
		}
	},
);
