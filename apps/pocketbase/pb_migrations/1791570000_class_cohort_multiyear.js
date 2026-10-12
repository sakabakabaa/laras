// Multi-year reliability for classes (Kelas) and student cohorts (Angkatan).
//
// Problem: a `courses` record carries a single `semester`/`academicYear`, a
// `course_sections` (Kelas) is just a name, and there is no angkatan concept —
// so re-running a course across years meant duplicating it, and the roster's
// UNIQUE (course, nim) blocked retakers/off-cohort students entirely.
//
// This migration keeps one Course reusable across years:
//   - course_sections gains `academicYear` + `semester` → each Kelas is pinned
//     to a term (Kelas A · 2024/2025 · Ganjil), while RPS/materi/tugas stay
//     shared on the parent course.
//   - course_roster gains `angkatan` (the student's intake cohort, a property
//     of the student, derived from NIM by default and lecturer-editable).
//   - course_roster uniqueness moves from (course, nim) to (course, section,
//     nim) so the same NIM can appear in a later term's Kelas — the retake /
//     off-cohort case — without colliding.
//
// All added fields are optional; existing single-run courses keep working.

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

		// 2 — Angkatan on course_roster + retake-safe uniqueness.
		const roster = app.findCollectionByNameOrId('course_roster');
		if (!roster.fields.getByName('angkatan'))
			roster.fields.add(new TextField({ name: 'angkatan', max: 10 }));
		roster.indexes = roster.indexes
			.filter((ix) => !ix.includes('idx_course_roster_course_nim'))
			.concat(
				'CREATE UNIQUE INDEX `idx_course_roster_course_section_nim` ON `course_roster` (`course`, `section`, `nim`)',
			);
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
		roster.indexes = roster.indexes
			.filter((ix) => !ix.includes('idx_course_roster_course_section_nim'))
			.concat('CREATE UNIQUE INDEX `idx_course_roster_course_nim` ON `course_roster` (`course`, `nim`)');
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
