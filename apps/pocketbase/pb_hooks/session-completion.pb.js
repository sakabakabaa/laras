/// <reference path="../pb_data/types.d.ts" />

// Persist completion so dashboards, analytics, and student views agree.
cronAdd("complete-past-class-sessions", "* * * * *", () => {
    require(__hooks + "/session-completion.js").completePastSessions($app);
});

onBootstrap((e) => {
    e.next();
    require(__hooks + "/session-completion.js").completePastSessions(e.app);
});

onRecordCreate((e) => {
    require(__hooks + "/session-completion.js").completeIfPast(e.record);
    e.next();
}, "class_sessions");

onRecordUpdate((e) => {
    require(__hooks + "/session-completion.js").completeIfPast(e.record);
    e.next();
}, "class_sessions");
