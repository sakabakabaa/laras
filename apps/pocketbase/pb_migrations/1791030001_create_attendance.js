/// <reference path="../pb_data/types.d.ts" />

// Attendance (Absensi) — per class meeting and section.
//
// One row per (session, roster entry): a lecturer's attendance mark for a
// student at a specific pertemuan. Kept fully separate from grades and
// submissions. Statuses: present (Hadir), late (Terlambat), absent (Absen),
// excused (Izin). Lecturers can create and correct records; students see only
// their own history.
//
// Relations:
// - session  → class_sessions (required, cascade) — the meeting.
// - roster   → course_roster (required, cascade) — the student identity in
//   the course (NIM + name), so attendance works even before a student account
//   is activated.
// - section  → course_sections (optional) — denormalized for section filtering.
// - owner    → users (required, cascade) — the lecturer who recorded it.
// - student  → users (optional) — the student's account, auto-resolved from the
//   roster NIM by a PB hook so students can read their own attendance.
//
// Rules:
// - Lecturer (course owner) can list/view/create/update/delete.
// - A student can list/view only rows where `student` = themselves.
// - Create requires the session's course owner to be the caller (traversed via
//   session.course.owner), plus faculty role and owner = self.
// - Update locks session/roster/student/owner so a mark can only be corrected,
//   not reassigned to another meeting or student.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const sessions = app.findCollectionByNameOrId("class_sessions");
    const roster = app.findCollectionByNameOrId("course_roster");
    const sections = app.findCollectionByNameOrId("course_sections");

    let collection;
    try {
      collection = app.findCollectionByNameOrId("attendance");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "attendance",
        listRule:
          "@request.auth.id != '' && (session.course.owner = @request.auth.id || student = @request.auth.id)",
        viewRule:
          "@request.auth.id != '' && (session.course.owner = @request.auth.id || student = @request.auth.id)",
        createRule:
          "@request.auth.id != '' && @request.auth.role = 'faculty' && " +
          "session.course.owner = @request.auth.id && @request.body.owner = @request.auth.id",
        updateRule:
          "@request.auth.id != '' && session.course.owner = @request.auth.id && " +
          "@request.body.owner:changed = false && @request.body.session:changed = false && " +
          "@request.body.roster:changed = false && @request.body.student:changed = false",
        deleteRule:
          "@request.auth.id != '' && session.course.owner = @request.auth.id",
        fields: [
          {
            name: "session",
            type: "relation",
            required: true,
            maxSelect: 1,
            minSelect: 0,
            collectionId: sessions.id,
            cascadeDelete: true,
          },
          {
            name: "roster",
            type: "relation",
            required: true,
            maxSelect: 1,
            minSelect: 0,
            collectionId: roster.id,
            cascadeDelete: true,
          },
          {
            name: "section",
            type: "relation",
            required: false,
            maxSelect: 1,
            minSelect: 0,
            collectionId: sections.id,
            cascadeDelete: false,
          },
          {
            name: "owner",
            type: "relation",
            required: true,
            maxSelect: 1,
            minSelect: 0,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "student",
            type: "relation",
            required: false,
            maxSelect: 1,
            minSelect: 0,
            collectionId: users.id,
            cascadeDelete: false,
          },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["present", "late", "absent", "excused"],
          },
          { name: "note", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_attendance_session_roster ON attendance (session, roster)",
          "CREATE INDEX idx_attendance_session ON attendance (session)",
          "CREATE INDEX idx_attendance_student ON attendance (student)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("attendance");
      app.delete(collection);
    } catch (_) {
      /* already gone */
    }
  },
);
