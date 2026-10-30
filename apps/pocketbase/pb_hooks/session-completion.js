// Session dates represent calendar days, not UTC timestamps. Finish a session
// only after its entire scheduled day has passed in the campus timezone (WIB).
function todayJakarta() {
    return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isPast(record, today) {
    const date = record.getString("date").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today;
}

exports.completeIfPast = function (record) {
    if (isPast(record, todayJakarta())) record.set("completed", true);
};

exports.completePastSessions = function (app) {
    const today = todayJakarta();
    // Repeatedly fetch the first batch: saved records leave the filter, so no
    // offset is needed and larger courses cannot be skipped during updates.
    while (true) {
        const sessions = app.findRecordsByFilter(
            "class_sessions",
            "completed = false && date != '' && date < {:today}",
            "date,id", 200, 0, { today: today + " 00:00:00.000Z" }
        );
        if (!sessions.length) break;
        let saved = 0;
        for (const session of sessions) {
            if (!isPast(session, today)) continue;
            try {
                // Refetch to avoid applying completion to a rescheduled record.
                const current = app.findRecordById("class_sessions", session.id);
                if (!isPast(current, today) || current.getBool("completed")) continue;
                current.set("completed", true);
                app.save(current);
                saved++;
            } catch (error) {
                console.error("Session auto-completion failed", session.id, String(error));
            }
        }
        // Avoid an infinite loop if remaining records cannot be saved.
        if (!saved) break;
    }
};
