# Agent workflows

The first release adds two bounded, durable workflows and resumes existing lecturer conversations after approved writes.

- Lecturer: gather aggregate formative help signals, read approved/version-matched materials, generate a cited lesson plan, pause for revision-specific approval, atomically save one private lesson plan and read it back.
- Student: read own progress, choose a tentative skill only with at least three relevant answers and a focus status, resume an existing round or generate five checked questions, wait for the student's answers, refresh evidence for a second round, and verify both rounds completed. No answers or formal grades are submitted by the agent.
- The chat has native `prepare_lesson` and `agent_task_status` tools. Existing write tools still each need approval; after an approved write, the model continues the original request within its rate/tool budget.

## Persistence and worker

`agent_tasks` stores goals, steps, revisions, result links and recovery state. `agent_task_events` records append-only transitions without answers or credentials. `assistant_lesson_plans` stores private meeting plans. `lesson_plan_revisions` stores immutable snapshots after manual saves, approved AI changes, and attachment. Only the server can mutate these collections; owner rules scope reads.

The web process polls the PocketBase queue and runs at most two jobs. Atomic PocketBase leases prevent multiple processes executing one task. Leases expire after four minutes and active workers renew them every thirty seconds. Web/PocketBase must be available; reopening a browser is not required. A user's expired/revoked login pauses the task and the Resume action supplies fresh credentials. Credentials are AES-256-GCM encrypted and hidden from ordinary API reads, and removed on completion/cancellation. Set `AGENT_CREDENTIAL_KEY` for a dedicated encryption secret; the existing server PocketBase password is the fallback. Key rotation requires affected tasks to be resumed.

Cancelled jobs cannot checkpoint or commit a lesson. Practice generation checks its lease between model passes and before saving a new round. A model request already in flight may finish after cancellation; cancellation prevents subsequent task work rather than promising instantaneous provider cancellation.

Unique active-task and lesson-per-task indexes prevent duplicate jobs/saves. Transient 502/503/504 errors retry up to three attempts. Other failures await explicit retry. The model generates text/plans; server code controls transitions and authorizes every course. No arbitrary SQL, shell, browsing, or unrestricted database tool exists.

## Meeting lesson plans

Lecturers open Pertemuan → Rencana pembelajaran for a meeting, edit objectives, outcomes, preparation, activities, durations, student actions, material links, and comprehension checks, then save as Draft or Ready. Ready remains private. The assistant requires a meeting before generating, captures its current plan and revision, and shows the proposed preparation and activities for approval. Atomic saves reject a stale proposal when a lecturer has edited the plan since generation began. Existing standalone plans can be attached to an empty meeting plan, retaining their identity and task result link. The editor polls for approved AI revisions and protects unsaved local edits.

## Remaining expansion

Publishing plans to students, sending notifications, releasing grades, scheduling spaced revision, arbitrary task planning, and broad course editing are not part of this release. Add typed tools with role/course checks, explicit publication approval, idempotent writes and readback verification before enabling them.

## Local review

The production Docker build and TypeScript compilation pass. Browser review covered lesson generation, cancellation, revision approval, private save/readback, persistence across restart, student resume of a saved round, and a chat create-course → read-course → summary continuation. Mobile and dark-theme layouts were inspected. The complete two-round student path has not been exercised with real student answers. Reviewer fixtures are local and separate from the real lecturer account.

Meeting-plan browser review covered attachment of an existing draft, activity duplication/reordering/removal, manual Ready save, persistence after rebuild, stale AI approval rejection, fresh AI approval into revision 4, and reopening through both Pertemuan and the assistant saved-plan list. Light and dark desktop rendering were inspected. Responsive CSS is present; the in-app browser viewport override did not change the measured viewport in this review, so phone rendering is not claimed as verified.
