# Scheduled unattended classes / Kelas terjadwal

Lecturers can prepare a fixed sequence of activities attached to an existing
Pertemuan, then leave it to run without a lecturer browser open. The entry point
is **Pertemuan → Kelas terjadwal**, available to lecturers and students.

## First release

- Lecturer builder: title, instructions, WIB start, check-in cutoff, late threshold,
  target section, ordered activities, preview, draft revision checking, scheduling.
  Incomplete content can be saved as a draft; scheduling requires complete material,
  valid questions/keys, positive points and a valid check-in window.
- Activities: material text + HTTPS links, multiple-choice quiz, text assignment,
  and exit-ticket reflection. The existing quiz question editor is reused.
- One fixed window per activity, one attempt per student. A late student receives
  the remaining time, not a fresh timer. Previously released content remains readable.
- Student check-in, eight-second debounced autosave, explicit save/submit, device
  draft recovery, retry identifiers, revision conflicts, and visible save status.
- Server grading; keys, explanations and scores stay private until the lecturer
  explicitly releases results after class. Quiz accuracy does not determine attendance.
- Reports include the full target roster, including students who never check in,
  saved work, completion, check-in/last-seen, attendance suggestions and audit events.
- Official attendance is written only when the lecturer explicitly chooses a
  status for a roster row. Existing corrections are never overwritten by a job.
  Closed attendance must be reopened through the existing attendance screen.
- Scheduled class work does not write official assignment grades or gradebook entries.

Games, audio/video, screen monitoring, student file uploads, per-student
accommodations and make-up sessions are future increments. The preview is
lecturer-only and includes keys.

## Academic links and AI autofill

Each activity can explicitly relate to up to eight library materials and twenty
CPMK/Sub-CPMK records from its course. Saving captures the source titles, versions,
outcome descriptions and meeting RPS fields. Publishing freezes these snapshots.
Students see linked student-access materials only after the activity opens;
faculty-only references remain private. Removed or replaced files show an
unavailable notice instead of silently substituting a newer version.

The lecturer editor loads its context through authenticated POST
`/api/scheduled-class-draft`. **Buat dengan AI** uses the meeting RPS, selected
outcomes, an existing saved lesson plan, and up to four explicitly selected
approved material passages. It uses the lecturer's `lesson_plan` model preference
and existing AI access/quota controls. Selection is enforced before retrieval caps.
Insufficient context is rejected. RPS-only plans omit quizzes; every generated
quiz question must cite an exact quotation from a selected source. Exact text
matching verifies the quotation, not whether the answer is academically correct.
Lecturers must review factual correctness and proposed answer keys.

AI returns a proposal without writing a scheduled class. Applying a proposal
requires a replacement confirmation and changes the local editor only. Saving
and scheduling remain explicit actions. Generated durations sum exactly to the
requested total (10–240 minutes). Faculty-only material can inform a draft, so
lecturers should review its generated contents before sharing with students.

## Architecture and records

The browser calls PocketBase's authenticated **POST**
`/api/laras/scheduled-classes` through the existing `/hcgi/platform` prefix.
This avoids the web server's shared IP-wide API budget for classroom polling.
No superuser credentials are sent to the browser or required by this feature's
web flow. Existing PocketBase auth is reused.

All five collections have locked SDK CRUD rules. Authorization and response
projection live in `pb_hooks/scheduled-classes-service.js`, inside a transaction.

| Collection | Responsibility |
| --- | --- |
| `scheduled_classes` | Meeting, course, lecturer, section, timing, revision, lifecycle |
| `scheduled_class_activities` | Ordered immutable snapshots, including private quiz keys |
| `scheduled_class_participants` | Student, roster mapping, check-in and last seen |
| `scheduled_activity_attempts` | Whitelisted answers, revision, request identifier, final outcome |
| `scheduled_class_events` | Scheduling, cancellation, submission, release and attendance audit |

Database uniqueness covers meeting → scheduled class, class → student,
class → activity position and activity → student attempt. Publishing locks the
plan; changing another assignment or material elsewhere cannot mutate a snapshot.
Cancellation preserves records and stops student writes. A cancelled class cannot
be republished; use a new meeting for a replacement in this release.

The class phase `open` is derived from persisted UTC timestamps, not a browser
timer or an additional stored flag. The existing calendar-day meeting `completed`
flag remains separate. All displayed schedule times use `Asia/Jakarta`.

Actions: `state`, `savePlan`, `schedule`, `cancel`, `join`, `heartbeat`,
`saveAnswer`, `submit`, `release`, `markAttendance`, `review`.
Every call rechecks course ownership/enrollment and roster-defined section.
Students receive only their own attempts; activity content is withheld until
check-in and the activity start. No other endpoint exposes these snapshots.

Saving checks the server deadline and revision in the same transaction as the
write. Retries acknowledge accepted requests rather than duplicating attempts.
Requests after the deadline cannot edit answers. At expiry the last server-saved
answers are finalized even if the browser is closed. Device-only changes are not
accepted retrospectively; the UI explains this distinction and retains recovery text.

## Background work and recovery

`scheduled-classes.pb.js` registers a minute job plus a startup recovery hook.
`scheduled-classes-jobs.js` re-reads each due class in its own transaction and
continues if another class fails. State requests also reconcile their own class.
Repeating reconciliation does not duplicate outcomes, events, attendance or grades.

Authorization and deadline checks do not depend on the minute job. A temporarily
unavailable backend prevents access/saving, but persisted plans and accepted
answers are recovered on restart. Operational recovery of an outage during an
activity is a lecturer decision; this release does not silently extend deadlines.

Browser state refreshes every 30 seconds, on activity boundaries, on reconnect,
and when the tab becomes visible. Check-ins send a visible-tab heartbeat every
minute. Last-seen is supporting evidence, not a claim about attention or continuous
screen visibility. Realtime media infrastructure is not required.

A narrowly scoped authenticated PocketBase rate rule permits 6,000 classroom
requests per IP per five minutes, so a campus NAT can support a classroom's
polling and saves. Other API/auth limits are retained. Capacity beyond the tested
synthetic requests must be measured against the intended deployment/class size.

## Deployment

Deploy the web build **and** PocketBase hooks/migrations together using the
repository's existing release process. Back up the database first. New migrations:

- `1793000000_scheduled_classes.js`
- `1793000001_scheduled_class_rate_limit.js`

PocketBase applies them at startup. Confirm the `scheduled-class-finalization` job
appears in the dashboard, then schedule a future synthetic lesson and verify
student access using the deployed `/hcgi/platform` proxy. No new service, provider
key or environment variable is needed for this feature.

The attendance helper was moved from a top-level hook function into a required
module: PocketBase isolates hook callback scopes, so the previous `linkStudent`
reference failed during real attendance writes. It now uses the event's app to
share the enclosing transaction and resolves one unambiguous student NIM.

Rolling back the first migration drops scheduled-class records; take/export a
backup before any rollback. Prefer rolling forward once student work exists.

## Validation

From the repository root:

```sh
npm run typecheck --workspace=web
npm run build --workspace=web
npm run test --workspace=web -- scheduled-classes.test.ts
```

For the actual backend integration suite, set `PB_TEST_BINARY` to a local
PocketBase 0.40.4 executable and run:

```sh
node apps/web/scripts/test-scheduled-classes.mjs
```

It launches an isolated loopback backend with the full migration/hook stack,
creates synthetic accounts, and tests access rules, private projections,
concurrent saves, retries, automatic finalization, restart recovery, result release,
attendance corrections and shared-IP request volume. Data remains under ignored
`work/`. It refuses non-loopback targets. Do not point the external-backend mode at
a real local data snapshot; the suite intentionally creates and retimes synthetic
academic records.

Full-repository tests currently also contain eight failing assistant tests and
one suite importing the missing `bynara-model.server` module. These same failures
were reproduced on clean `main` at `78f2d08`; they are independent of this feature.

Browser verification also exercised the production build in Edge: preparation,
scheduling, check-in, material completion, quiz save, offline failure/retry,
reload recovery, exit-ticket submission and the lecturer report. Desktop and
390-pixel mobile layouts were inspected without page exceptions or horizontal
overflow. Keep the backend integration checks on answer JSON projection: JSVM
`publicExport()` exposes JSON as byte slices unless explicitly normalized.
