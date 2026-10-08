/// <reference path="../pb_data/types.d.ts" />

// New assignments created after checkEnabled was added stored the PocketBase
// bool default (false), so public and enrolled "Cek jawaban" never appeared.
// The workflow ships enabled (5 checks) unless a lecturer later turns it off.
// Only rows that were never configured (still false, and checkMax unset/0)
// are switched on — an explicit disable with a positive checkMax is left alone.
migrate(
	(app) => {
		const rows = app.findRecordsByFilter(
			"assignments",
			"checkEnabled = false && (checkMax = 0 || checkMax = null)",
			"-created",
			500,
			0,
		);
		for (const row of rows) {
			row.set("checkEnabled", true);
			row.set("checkMax", 5);
			app.save(row);
		}
	},
	(app) => {
		// Intentionally empty: re-disabling checks would hide a working
		// participant workflow. Lecturers turn it off from the assignment.
	},
);
