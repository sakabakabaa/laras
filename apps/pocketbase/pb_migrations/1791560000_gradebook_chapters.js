// Chapter-tracked offline tasks (e.g. textbook chapters, scored by completion).
//
// A grade component may define an ordered list of chapters in `chapters`
// (JSON: [{ id, label }]). For such a component each per-student grade_entry
// records a per-chapter status map in its own `chapters` field
// (JSON: { [chapterId]: 'done' | 'partial' | 'missing' }). The entry's numeric
// `value` stays the single source of truth for the final-grade math and is
// derived from completion: value = round((done + 0.5*partial) / total * maxScore).
// Both fields are optional, so existing manual/assignment components are
// unaffected.
migrate(
	(app) => {
		const defs = [
			['grade_components', new JSONField({ name: 'chapters', maxSize: 20000 })],
			['grade_entries', new JSONField({ name: 'chapters', maxSize: 20000 })],
		];
		for (const [name, field] of defs) {
			const c = app.findCollectionByNameOrId(name);
			if (!c.fields.getByName(field.name)) c.fields.add(field);
			app.save(c);
		}
	},
	(app) => {
		for (const name of ['grade_components', 'grade_entries']) {
			const c = app.findCollectionByNameOrId(name);
			const f = c.fields.getByName('chapters');
			if (f) {
				c.fields.removeById(f.id);
				app.save(c);
			}
		}
	},
);
