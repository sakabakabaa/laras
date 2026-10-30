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
    require(__hooks + '/attendance-student-link.js').linkStudent(e.app, e.record);
    e.next();
}, "attendance");
onRecordUpdate((e) => {
    require(__hooks + '/attendance-student-link.js').linkStudent(e.app, e.record);
    e.next();
}, "attendance");
