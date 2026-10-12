// Add class term labels and student intake cohorts.
// Keep the existing UNIQUE(course, nim) roster identity: parallel classes
// share a course, while a new academic term must use a separate course until
// all enrollment, submission and grading records support term isolation.

/** Student intake year from a NIM: 4-digit leading year, else 2-digit → 20xx. */
function angkatanFromNim(nim) {
	const digits = String(nim || '').replace(/\D/g, '');
	if (!digits) return '';
	const y4 = parseInt(digits.slice(0, 4), 10);
	if (y4 >= 2000 && y4 <= 2099) return String(y4);
	const y2 = parseInt(digits.slice(0, 2), 10);
	if (!Number.isNaN(y2) && y2 >= 0 && y2 <= 99) return String(2000 + y2);
	return '';
}

migrate(
	(app) => {
		// 1 — Term fields on course_sections.
		const sections = app.findCollectionByNameOrId('course_sections');
		if (!sections.fields.getByName('academicYear'))
			sections.fields.add(new TextField({ name: 'academicYear', max: 20 }));
		if (!sections.fields.getByName('semester'))
			sections.fields.add(new TextField({ name: 'semester', max: 40 }));
		app.save(sections);

		// 2 — Angkatan on course_roster; preserve course-wide uniqueness.
		const roster = app.findCollectionByNameOrId('course_roster');
		if (!roster.fields.getByName('angkatan'))
			roster.fields.add(new TextField({ name: 'angkatan', max: 10 }));
        // Keep one roster identity per course until enrollment, submissions and
        // grade publication are term-scoped. Parallel classes remain supported.
		app.save(roster);

		// 3 — Backfill section terms from the parent course.
		const allSections = app.findAllRecords('course_sections');
		for (const section of allSections) {
			if (section.getString('academicYear') && section.getString('semester')) continue;
			let course;
			try {
				course = app.findRecordById('courses', section.getString('course'));
			} catch {
				continue;
			}
			if (!course) continue;
			if (!section.getString('academicYear'))
				section.set('academicYear', course.getString('academicYear'));
			if (!section.getString('semester')) section.set('semester', course.getString('semester'));
			app.save(section);
		}

		// 4 — Backfill angkatan from NIM where unset.
		const allRoster = app.findAllRecords('course_roster');
		for (const entry of allRoster) {
			if (entry.getString('angkatan')) continue;
			const derived = angkatanFromNim(entry.getString('nim'));
			if (derived) {
				entry.set('angkatan', derived);
				app.save(entry);
			}
		}
	},
	(app) => {
		const roster = app.findCollectionByNameOrId('course_roster');
		const rosterAngkatan = roster.fields.getByName('angkatan');
		if (rosterAngkatan) roster.fields.removeById(rosterAngkatan.id);
		app.save(roster);

		const sections = app.findCollectionByNameOrId('course_sections');
		for (const fieldName of ['academicYear', 'semester']) {
			const f = sections.fields.getByName(fieldName);
			if (f) sections.fields.removeById(f.id);
		}
		app.save(sections);
	},
);
