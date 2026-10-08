/// <reference path="../pb_data/types.d.ts" />

// Auto-resolve the `student` (user account) on every attendance record from
// the linked roster entry's NIM. This lets students view their own attendance
// history (the collection listRule allows `student = @request.auth.id`) without
// the lecturer needing to resolve user ids in the browser — student user
// records are self-only-read, so the client cannot look them up by NIM.
//
// Runs before create and before update so the link is set on insert and
// refreshed if the roster reference changes. A roster student without an
// activated account (no matching user NIM) leaves `student` empty — the
// lecturer can still mark attendance; the student simply cannot self-view
// until their account exists.
onRecordCreate((e) => {
    linkStudent(e.record);
    e.next();
}, "attendance");

onRecordUpdate((e) => {
    linkStudent(e.record);
    e.next();
}, "attendance");

function linkStudent(record) {
    const rosterId = record.get("roster");
    if (!rosterId) return;
    let roster;
    try {
        roster = $app.findRecordById("course_roster", rosterId);
    } catch (_) {
        return;
    }
    const nim = roster.getString("nim");
    if (!nim) return;
    // NIM is alphanumeric (max 32); escape any single quotes defensively.
    const safeNim = nim.replace(/'/g, "''");
    try {
        const user = $app.findFirstRecordByFilter("users", "nim = '" + safeNim + "'");
        record.set("student", user.get("id"));
    } catch (_) {
        record.set("student", "");
    }
}
