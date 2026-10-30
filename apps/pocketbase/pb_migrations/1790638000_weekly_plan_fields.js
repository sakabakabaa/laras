/// <reference path="../pb_data/types.d.ts" />

/**
 * Weekly plan fields on `class_sessions`.
 *
 * The weekly pertemuan now carries the full RPS mingguan schema: special week
 * type (normal / UTS / UAS / khusus), learning indicator, learning material,
 * per-session assessment method + weight, synchronous & asynchronous methods,
 * duration, references, and an access date/time. Normal teaching sessions are
 * kept distinct from special academic weeks (UTS at week 8, UAS at week 16 are
 * supported explicitly, but the lecturer may configure any other special week).
 *
 * All fields are additive and optional — existing imported sessions, composed
 * `notes`, and the original PDF stay intact. Nothing is backfilled or altered.
 */
migrate(
	(app) => {
		const sessions = app.findCollectionByNameOrId('class_sessions');

		const has = (name) => Boolean(sessions.fields.getByName(name));

		if (!has('specialWeekType')) {
			sessions.fields.add(
				new SelectField({
					name: 'specialWeekType',
					required: false,
					maxSelect: 1,
					values: ['normal', 'uts', 'uas', 'khusus'],
				}),
			);
		}
		if (!has('learningIndicator')) {
			sessions.fields.add(new TextField({ name: 'learningIndicator', required: false, max: 2000 }));
		}
		if (!has('learningMaterial')) {
			sessions.fields.add(new TextField({ name: 'learningMaterial', required: false, max: 5000 }));
		}
		if (!has('assessmentMethod')) {
			sessions.fields.add(new TextField({ name: 'assessmentMethod', required: false, max: 2000 }));
		}
		if (!has('assessmentWeight')) {
			sessions.fields.add(
				new NumberField({ name: 'assessmentWeight', required: false, min: 0, max: 100 }),
			);
		}
		if (!has('synchronousMethod')) {
			sessions.fields.add(
				new TextField({ name: 'synchronousMethod', required: false, max: 1000 }),
			);
		}
		if (!has('asynchronousMethod')) {
			sessions.fields.add(
				new TextField({ name: 'asynchronousMethod', required: false, max: 1000 }),
			);
		}
		if (!has('duration')) {
			sessions.fields.add(new TextField({ name: 'duration', required: false, max: 200 }));
		}
		if (!has('references')) {
			sessions.fields.add(new TextField({ name: 'references', required: false, max: 5000 }));
		}
		if (!has('accessDateTime')) {
			sessions.fields.add(new DateField({ name: 'accessDateTime', required: false }));
		}

		app.save(sessions);
	},
	(app) => {
		const sessions = app.findCollectionByNameOrId('class_sessions');
		const names = [
			'specialWeekType',
			'learningIndicator',
			'learningMaterial',
			'assessmentMethod',
			'assessmentWeight',
			'synchronousMethod',
			'asynchronousMethod',
			'duration',
			'references',
			'accessDateTime',
		];
		for (const n of names) {
			try {
				sessions.fields.removeByName(n);
			} catch (_) {
				/* already absent */
			}
		}
		app.save(sessions);
	},
);
