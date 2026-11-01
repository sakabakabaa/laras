# Builder media, authoring tools and delivery

## Authoring

- Images, audio and video select/upload from the owner's course-scoped Berkas library; HTTPS links remain optional. Uploads use existing MIME/size limits (500 MB), are stored with faculty access and restricted downloads, and retain library identity, filename and version. Binary uploads are not duplicated when a block/activity/template is copied.
- Image blocks support up to four images, individual alt text/captions, replace/remove, drag/arrow ordering and 1–4 columns. Columns default to image count; narrow layouts stack images. Existing single linked images remain editable.
- Element duplication remaps block/question/option/destination/rubric IDs and private keys through the existing duplication logic. Move menus preserve identities across activities; arrows/dragging remain available.
- Activities can collapse and show question/point/time/required summaries. Total planned time is compared with class duration. Question groups accept bulk prompt lines; choices and keys are completed afterward. Writing/reflection support structured rubric criteria and synchronized point totals.
- `Riwayat & template` stores named private snapshots and course-scoped activity templates on the server. Restoration is an undoable draft change. Saving requires an acknowledged server revision. No published version or student response is modified by restore/insert.

## Publish and student delivery

`Tinjau draf` includes content/key/date validation, audience summary and explicit publication confirmation. Publication creates a new immutable content version, private key record and delivery run in one transaction, tied to the acknowledged draft revision and retry command ID. Publishing again creates a new run. Existing runs/submissions retain their version; drafts remain private and independently editable.

Published runs appear in Kelas/Tugas indexes and the student dashboard, linking to `/app/kegiatan/:runId`. Access requires the owned course (faculty) or current enrollment plus unambiguous roster/section membership (students). Direct collection CRUD is locked.

- Kelas: server check-in window; scheduled, lecturer-guided or free progression; activity submission locks that activity. A teacher can advance guided activities and close collection.
- Tugas: availability/due/hard-close/late policies, optional whole-attempt time limit, navigation between activities and whole-task submission.
- Time limits use server time and persisted attempt start. Saves validate question identity, choices, bounds, open activity, submission state and response revision. The client serializes saves and warns before leaving with unsaved answers; polling does not overwrite local edits. Last-second text rejected after a deadline/activity lock is retained visibly as a copy outside the accepted submission. Expired/closed attempts finalize their last server-saved answers when accessed. This is lazy finalization, not a background attendance job.
- Student simulation reuses the public renderer with local answers/navigation/timers/submission and never calls student mutation APIs.

## Review and release

Automatic grading uses saved version keys for choices, matching and normalized exact text. Open writing is marked for lecturer review. Lecturers review submitted/expired activities, override correctness/points, provide feedback, grade rubric criteria and explicitly release an assessment snapshot. Later grading edits do not change the already released snapshot until release is repeated.

This delivery domain is independent of legacy scheduled classes and assignments. Official attendance/gradebook synchronization and grade-component mapping are not implemented by this release; no official grade entries are written implicitly. The authoring/runtime can be used without migrating legacy sessions.

## Media delivery

Owner previews use short-lived PocketBase file tokens, keeping tokens out of saved documents. The owner-only download hook also recognizes valid file tokens while retaining the same ownership checks. Prior versions resolve through the existing Berkas version history.

Students do not receive an owner/superuser storage token. An authenticated POST to `/api/builder-media` asks the delivery domain to authorize the exact asset referenced by the run, then issues a signed, file-scoped ticket for 20 minutes. GET validates the signature/expiry and streams the pinned current/prior binary with Range support. Server storage credentials remain internal. Responses are private/no-store with a sandbox CSP; process restart invalidates outstanding tickets and the viewer renews them. Deleting a source binary/history from Berkas can make a reference unavailable; it is not silently replaced by new content.

## Storage and operations

Additive migrations create `builder_saved_items`, `builder_versions`, `builder_version_keys`, `builder_runs` and `builder_responses`, with null SDK rules. Preserve these records when rolling back a release; older builder backends should not write newer envelopes because they do not recognize gallery/file fields. Deploy hooks, migrations and web together, with a database backup before migration. Student release controls do not publish a lecturer's current draft.

## Checks

Changed-file lint, type generation/typecheck and production compilation are run locally. Existing repository CI runs unit/render checks and isolated PocketBase integration (including additive migrations). Production UI inspection must preserve the lecturer's current draft and must not publish it to real students as a verification side effect.

## Full-page author preview

The builder preview opens `/app/builder/:documentId/pratinjau` after autosave finishes. The faculty-only page loads the owner-authorized saved draft, reuses `BuilderJourneyPreview`, and keeps simulated answers in memory. It has desktop/phone widths and a return link to the builder. No publication is created. Shared matching card styles no longer require the classroom `.sc-page` ancestor; compact placed cards and screen-reader labels also apply in builder delivery.
