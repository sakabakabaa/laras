// Hook callbacks execute in isolated JSVM scopes. Resolve this helper through
// require, and use the event's app so reads share the caller's transaction.
exports.linkStudent = function (app, record) {
  const rosterId = record.getString('roster');
  if (!rosterId) return;
  const roster = app.findRecordById('course_roster', rosterId);
  const nim = roster.getString('nim');
  if (!nim) {record.set('student', ''); return;}
  const matches = app.findRecordsByFilter('users', 'role="student" && nim={:nim}', '', 2, 0, {nim});
  record.set('student', matches.length === 1 ? matches[0].id : '');
};
