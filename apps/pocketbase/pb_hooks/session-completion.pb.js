/// <reference path="../pb_data/types.d.ts" />

// Persist completion so dashboards, analytics, and student views agree.
//
// The onBootstrap handler below runs BEFORE migrations create the collections
// it touches, so every lookup must tolerate a missing collection. Without this
// guard a fresh database failed to start with "sql: no rows in result set",
// because findCollectionByNameOrId('class_sessions') threw during bootstrap.
//
// The guard is inlined rather than factored into a helper because the JSVM
// bundler hoists hook registrations above top-level function declarations,
// which made a shared helper unreachable from the cron callback.
cronAdd("complete-past-class-sessions", "* * * * *", () => {
    try {
        $app.findCollectionByNameOrId("class_sessions");
    } catch (error) {
        return; // collection not created yet
    }
    require(__hooks + "/session-completion.js").completePastSessions($app);
});

onBootstrap((e) => {
    e.next();
    try {
        e.app.findCollectionByNameOrId("class_sessions");
    } catch (error) {
        return; // migrations have not created the collection yet
    }
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
