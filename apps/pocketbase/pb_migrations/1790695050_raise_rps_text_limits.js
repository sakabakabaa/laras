/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase treats a text field max of 0 as an implicit 5.000-character cap.
 * `rps` and `syllabus` were created without an explicit max, so a real semester
 * plan (CPL + CPMK + strategi + penilaian + beban kerja) cannot be saved.
 * Raise the cap to a bounded document size. Existing text is left untouched.
 */
migrate(
	(app) => {
		const courses = app.findCollectionByNameOrId('courses');
		const rps = courses.fields.getByName('rps');
		const syllabus = courses.fields.getByName('syllabus');
		rps.max = 100000;
		syllabus.max = 100000;
		app.save(courses);
	},
	(app) => {
		const courses = app.findCollectionByNameOrId('courses');
		const rps = courses.fields.getByName('rps');
		const syllabus = courses.fields.getByName('syllabus');
		if (rps) rps.max = 0;
		if (syllabus) syllabus.max = 0;
		app.save(courses);
	},
);
