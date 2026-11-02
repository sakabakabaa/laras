# Builder reliability review implementation

## Review boundary

This branch was initially prepared for local review only. The user authorized a production build/deployment on November 2, 2026. Deploy the pinned feature-branch commit without merging main. No production records, existing published versions, attendance, grades, or deployment configuration are migrated or rewritten.

## Implemented

- Shared builder saves keep the same command ID, base revision, and immutable snapshot after a failed response. A retry first acknowledges that snapshot, then autosave can send newer edits. Genuine revision conflicts still require explicit server reload. Concurrent saves are rejected.
- The editor pauses server saves while offline and reports unavailable device storage rather than silently claiming recovery is available. Device recovery shows its timestamp/base revision, offers a private JSON download, and asks for confirmation when restoring against a different server revision.
- Scheduled-class editing has account/session-scoped, seven-day device recovery, explicit restore/discard, revision comparison, storage warnings, duplicate-save protection, and browser/SPA navigation protection. Recovery only changes the editor; it never schedules a class.
- Client and backend publish validation both reject expired schedules using the effective cutoff, including the exact deadline. A hard close does not extend assignments that disallow late submissions. Existing validation requiring a future due date or configured hard close at publication is retained.
- Shared-builder publishing has an audience/schedule preflight, selected section names, previous runs of the same revision, duration/cutoff warnings, and explicit acknowledgement that publication creates a new immutable run. It rechecks readiness at confirmation and preserves the publish retry command ID.
- AI import stores key evidence and teacher confirmation in the private key envelope. Inferred/unknown keys block publishing until reviewed; printed keys are initially confirmed. Older keys without review metadata retain their behavior. Student documents and previews do not receive this metadata.
- Builder colors and focus states use shared red-theme tokens. Inputs use one focus indicator; buttons retain keyboard focus; coarse-pointer controls have 44px targets.
- Preview supports opening, on-time, late check-in, closed check-in, late submission, expiry, submitted, and offline scenarios. Available scenarios depend on class/task mode. Offline allows local editing but not simulated submission. All answers remain in component state, with no student-response requests. Automatic class timing uses the shared absolute session deadline; closed check-in does not lock students who already joined. Assignment late policy and time limits remain distinct.
- Login replaces the raw authentication failure with a combined NIM/username/email-or-password message. Connection, rate-limit, permission, cancellation, and server failures have separate explanations. Identifier fallback retries only credential failures, not outages or throttling; the UI never claims which individual credential was incorrect.

## Capability boundaries

### Simple class creation follow-up

New classes use one entry: **Buat kelas → Mata kuliah → Pertemuan → Builder**. The entry asks only for course and meeting; the initial title comes from the meeting and its section is inherited. Scheduling, content, and optional tools remain inside the builder. Existing class records still open their original workspace, and explicit duplication links preserve authored content without copying attempts or schedules. Task creation is unchanged.

The builder sidebar starts with optional manual-input, meeting-based AI, and book-page tools. AI uses the selected meeting's RPS fields, outcomes, existing lesson-plan context, and up to four approved, AI-ready files linked to that meeting. It does not silently select unrelated course files. Generating a proposal does not save or publish anything; applying it adds native editable blocks in one undoable change. It does not replace existing activities, instructions, audience, or delivery dates. Only the untouched default empty activity is replaced. AI quiz keys stay private and require teacher confirmation. Missing/insufficient meeting context remains an explicit error, not an invitation to invent facts.

Builder-context AI requests verify the owned builder's course and meeting server-side. This allows a separate new draft for a meeting whose legacy class is already scheduled, without weakening the legacy editor's published-class restriction. Book reconstruction also receives owned meeting context as teaching guidance only; page content remains the source of truth. Its background import still creates a separate recoverable staging draft/report; the lecturer explicitly adds its content to the open builder. No published records or student responses are changed.

Validated locally on November 2, 2026: 121 test files / 1,361 tests passed, along with typecheck, targeted ESLint, production build, and `git diff --check`. The initial concurrent build exceeded available memory; a sequential retry passed. Browser interaction and live AI-provider requests are not covered by these checks.

| Capability | Shared builder | Scheduled-class editor | Legacy AssignmentForm |
| --- | --- | --- | --- |
| Save | Autosave, explicit retry, idempotent replay | Manual save, revision checks | Existing manual save |
| Device recovery | Account/document; compare, restore, download | Account/session; compare, restore/discard | Existing fresh-task recovery only |
| Navigation guard | Browser and SPA blocker | Browser and SPA blocker | Existing behavior unchanged |
| Publication | New-run preflight and server validation | Existing scheduling confirmation/server validation | Existing assignment lifecycle |
| Preview | Local student journey and timing scenarios | Existing schedule preview | Existing specialized builders |
| Private keys | Owner envelope, AI evidence review | Existing quiz/worksheet ownership | Existing separate answer-key records |

Full authoring-flow consolidation is intentionally not part of this patch. Legacy AssignmentForm edit/practice recovery needs a separate scoped change: its private keys load asynchronously and must not overwrite restored edits, and existing rubric/stage/AI-policy behaviors must survive. Do not remove old routes until parity is verified. Undo coalescing and large-document optimization also remain deferred until profiling establishes a baseline. Recovery storage remains device-local and must not be treated as an encrypted backup; do not share exported private draft files with students.

## Local validation

Use Node 22 with locked dependencies. Commands run from the repository root:

```sh
npm test --workspace web
npm run typecheck --workspace web
npm run build --workspace web
PB_TEST_BINARY=/path/to/local/executable/pocketbase node apps/web/scripts/test-scheduled-classes.mjs
```

The integration script requires loopback and creates synthetic records in a disposable local data directory. It checks ownership/privacy, save replay/conflicts, immutable delivery, grading, attendance, free navigation, deadlines, and backend restart recovery. It must never point at production. Browser/computed-style testing is not included in this branch validation; visual review of light/dark themes, focus, narrow-screen preflight, and scenarios remains a pre-merge checklist.

Validated locally on November 2, 2026: 118 test files / 1,339 tests passed; 472 isolated backend integration checks passed, including restart recovery; web typecheck, changed-file ESLint, production build, and `git diff --check` passed. Building production assets locally does not deploy them.

The login-error follow-up passes 119 test files / 1,347 tests, web typecheck, and targeted ESLint. Production release must build both web and PocketBase images, preserve the data volume, retain image rollback tags, and verify health after restart.
