# Shared Kelas/Tugas builder — authoring milestone

This is the first working milestone of the shared builder project planned on 31 October 2026. It implements draft authoring, not the complete published delivery and assessment roadmap.

## Available flow

- **Kelas terjadwal → Buat kelas** and **Tugas → Buat tugas** open `/app/builder/new` with the delivery kind selected.
- Course meeting cards offer context-prefilled creation for either kind.
- An existing Kelas has **Duplikat ke builder baru**. This copies authored content into a new private draft, with fresh response IDs and a cleared schedule. It does not mutate the source or copy student activity, submissions, attendance or grades. Private source PDFs are not attached; existing worksheet items become editable question blocks. This is a fresh authoring copy rather than an in-place or presentation-exact migration.
- Creation accepts a blank document, listening/writing/reflection starting pattern, or owned draft to duplicate.
- `/app/builder/:documentId` provides an activity outline, canvas, contextual key/settings panel, timing/submission settings and isolated student preview. Narrow screens open settings in a modal.
- Owner-scoped draft cards on both index pages reopen saved work. Existing scheduling and assignment editors remain reachable while publication for the new document format is developed.

## Implemented authoring

Instructions, image/audio/video/reference HTTPS links, reading acknowledgements, multiple-choice/short-answer groups, matching destinations/statements, explicit inline gaps, long writing, reflection and structured explanation cards/dialogues. Matching and lesson preview reuse the existing student components. Private example answers/guidance, accepted text alternatives, answer keys, case/punctuation settings, response requirements and points can be edited.

The current media path is explicit HTTPS links; library upload/import workflows are later work. Extended-writing guidance is available, while a structured rubric criterion editor and weighted aggregation remain later work. Draft timing policies are persisted; selecting a mode does not launch or schedule a student run.

## Persistence and safety

Migration `1793424000_builder_drafts.js` creates `builder_documents` and `builder_private_keys`. All SDK CRUD rules are locked. Authenticated faculty commands through `POST /api/laras/builder` provide `create`, `get`, `list`, and `save`.

Course ownership, meeting/section linkage, bounded schema, identity/reference integrity, question/key compatibility, media schemes and draft revisions are checked on the server. Content and private keys are saved transactionally. Creation/save command IDs acknowledge retries; stale revisions reject without overwriting accepted data. Keys are omitted from draft-list responses. Students cannot read either collection or invoke authoring commands.

The editor serializes debounced saves and keeps an account/document-scoped recovery copy when device storage permits. Restoring a different device copy is explicit. Account logout clears that account's builder recovery entries. Undo/redo is local authoring history. A conflict supports downloading a private recovery envelope and reloading the current server revision.

Preview receives only the document content and temporary answers. It never calls student save/submit, check-in or attendance endpoints. The JSON download includes private keys and is labelled a private draft copy.

## Still planned

Immutable published versions, publishing/scheduling the new schema, student delivery runs, timers and whole-Tugas submission, accommodations, manual/automatic assessment and release snapshots, official gradebook synchronization, custom template library, file/audio submissions, library source/import/AI assistance, drag reordering and the complete rich-text authoring surface. Do not expose a publication button until the corresponding server/runtime contract is implemented.

## Verification

`builder-document.test.ts` exercises remapping, identity/reference constraints, key validation and unsafe payload rejection. `builder-preview.test.ts` verifies unsaved content and private-data separation. The existing disposable PocketBase integration script now also verifies real migrations, authoring authorization, locked direct records, idempotency, save conflicts and private draft-list projection. CI runs these against a new isolated backend; it does not target production data.

Deploy the additive migration/hooks and web build together through the existing release process. Rolling back the app should preserve builder records for forward recovery; do not roll back the whole production database merely to hide the new UI.
