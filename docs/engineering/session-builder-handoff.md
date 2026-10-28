# Session builder: implementation handoff

## Read this first

This is an implementation specification for the next agent, not a claim that the builder already exists. Read alongside [session-builder-plan.md](session-builder-plan.md). Last updated 28 October 2026, Asia/Jakarta.

**User objective:** a lecturer must be able to create, edit, preview, reuse and schedule these worksheets through Laras without asking Codex to construct each session.

**Latest explicit instruction:** the current Beim Arzt session must be ported to the new builder while keeping its same exact function. Keeping that class permanently on a separate legacy authoring path does not satisfy the request. Replacing it with a newly created live class also does not satisfy it.

Deliver the builder and an in-place, verified port. Preserve existing student behaviour and data while changing the authoring/data representation. The current activity is planning/handoff only; this document does not authorize treating the builder as already shipped.

## 1. Verified baseline and scope

- Repository: `https://github.com/sakabakabaa/laras`.
- Working branch: `codex/scheduled-classes`; latest application commit at handoff: `19231cb5771656f17800f1b27af524d7f03b66f6`. This documentation commit will be newer. Fetch and inspect before changing anything; another chat/user may have made changes.
- Production: `https://laras.zulficar.me`, VPS `31.97.48.26`, checkout `/opt/laras-git`.
- Existing scheduled-class editor, worksheet editor, AI session draft panel, material search, lesson renderer, preview and PDF/image quiz importer are implemented. A unified visual block builder, explicit matching-block authoring and template library are not yet implemented.
- Current matching cards, inline gaps, extended email field, compact instructions and sidebar behaviour are implemented and deployed. Do not rebuild or revert them accidentally.

### Protected class

| Property | Value at handoff |
| --- | --- |
| Course | `30152xyjuzxgpq4` — SCHREIBEN A1 |
| Meeting | `n0239h77wykwein` |
| Scheduled class | `oxeb6ykx9qlwqiy` |
| Owner | `921exj61qu9yelr` |
| Section | B only, `tataw8jvs6wbdbh` |
| Excluded section | A, `mdrppyqrc08ycbn` |
| Class revision | 9 at last read; fetch again, never assume it is still 9 |
| Date/time | Thursday **29 October 2026, 13:00–16:30 WIB**, total 210 minutes |
| Check-in | Closes 13:30 WIB; after 13:10 is marked late for review |
| Student preview | `https://laras.zulficar.me/app/courses/30152xyjuzxgpq4/pertemuan/n0239h77wykwein/terjadwal?preview=student` |

Do not shift this scheduled class into the future when implementing later. The date above describes the real baseline, not a relative-date instruction. Inspect whether it has started or received submissions before conversion.

### Exact current sequence

| # | Activity | WIB | Required | Responses |
| --- | --- | --- | --- | --- |
| 1 | Check-in / orientation | 13:00–13:15 | No | Reading acknowledgement |
| 2 | Grammar: müssen / (nicht) dürfen | 13:15–13:35 | No | Reading acknowledgement; five animated scenes |
| 3 | 10a: Wer sagt was? | 13:35–13:55 | Yes | 6 card assignments to A/B/C |
| 4 | 10b: Hören und zuordnen | 13:55–14:25 | Yes | 9 card assignments to A/B/C; audio 2.20, 2.21, 2.22 |
| 5 | 10c: Anweisungen schreiben | 14:25–14:55 | Yes | 6 written sentences; preserve du/Sie cues |
| 6 | Zusatz: Arzt oder Patient? | 14:55–15:15 | Yes | 15 card assignments to A/P |
| 7 | Zusatz: Formen von dürfen | 15:15–15:25 | Yes | 7 inline gaps |
| 8 | Zusatz: Modalverben | 15:25–15:40 | Yes | 8 inline gaps in passages |
| 9 | Zusatz: Eine E-Mail schreiben | 15:40–16:05 | Yes | 1 extended writing field, currently ten rows |
| 10 | Review / transfer | 16:05–16:20 | Yes | 2 written responses; three lesson scenes including two dialogues |
| 11 | Exit ticket | 16:20–16:30 | Yes | 3 written responses |

There are **9 required activities and 57 worksheet response IDs**: 30 matching assignments and 27 text/gap responses. The two optional reading acknowledgements are separate from those 57. There are no scheduled breaks. Fetch exact current text/assets/IDs from the backend rather than reconstructing them from this table.

## 2. Student behaviour that must survive the port

- Matching destinations are above the card stack. Several cards can share a destination. Placed cards remain visible, can be reassigned, and can return to the unassigned stack. Support native desktop drag, mobile tap-to-select/tap-to-place, keyboard selection/placement and accessible announcements.
- Matching continues to store the existing question-ID-to-option-string response map. Preserve loaded assignments and partial progress. Never silently replace A/B/C or A/P with new response values.
- Ordinary multiple choice stays as visible options rather than dropdowns. Do not turn every quiz into picture matching.
- Single-word gaps use compact inline fields. The modal passages appear once with numbered inputs. Preserve each gap's original response ID, including multiple gaps within one passage.
- Short writing and email have appropriate response areas; no repeated answer-count banners or “Giliran Anda · Jawaban dan pengumpulan” section.
- Core exercises retain their existing German/Indonesian text. The four additional tasks (Arzt/Patient, dürfen, modal verbs, email) retain German-only question content. Do not auto-translate or regenerate existing text.
- Main instructions stay visible; references and secondary guidance are expandable. Keep source/page references accurate and the useful patient illustrations/audio available.
- Student actions remain **Simpan / Berikutnya**, with existing autosave, local recovery, save revisions, completion checks, submission locking and progression. A preview may navigate freely; an actual student cannot bypass the shared schedule.
- Lecturer academic/RPS/CPMK metadata remains available to the lecturer without exposing academic outcome panels to students.
- The left course/global sidebar remains hidden while a student works in the session, including lecturer student-preview mode; it returns outside that context. The right activity timeline is a separate element.
- Preserve server-authoritative timing, B-only access, attendance calculation, late check-in policy, required/optional flags and current results-release behaviour. Do not add voice/video or screen monitoring.

## 3. Source materials: critical restrictions

The source PDF must remain in storage and in the lecturer library, but **must not be attached to this live session or exposed as a full-page student reference**. The user explicitly corrected a previous accidental deletion. Do not delete it, reattach it, or publish a page image during import/porting.

- Original book record: `qyde12rb792mnwh`, NW_N_KB_A1_08. It has faculty access and restricted download; fetch its actual current filename instead of hardcoding an old one.
- Existing A/B/C illustration records: `tvkvdui8kh5f8ua`, `3op28k7f8zbsdme`, `ttgh40owolmsxj4`.
- The two Arzt/Patient photographs are existing, individually extracted image records. Resolve the exact current IDs from activity sources. Preserve their A · Arzt / P · Patientin association.
- Audio records: `gi0z9g977svo9od`, `8tai68brxqxv72q`, `brdufsqfgzh93wd`.
- Only the approved extracted illustrations/photos and audio belong in the student-facing matching blocks. Do not substitute generated artwork or full-page scans.
- Preserve `private-library-files.pb.js` and migration `1793000003_private_library_downloads.js`. Never weaken access rules to make preview/import work.

Source selection in the new builder must distinguish private extraction input from assets explicitly shared with students. Choosing a PDF for parsing must not attach that PDF to the activity automatically.

## 4. Code map: start here

All paths below are repository-relative.

| Path | Role / caution |
| --- | --- |
| `apps/web/src/routes/course.scheduled-class.tsx` | Lecturer/student entry point and state refresh |
| `apps/web/src/components/app/scheduled-class-editor.tsx` | Existing plan editor, activities, section, schedule, save/publish and revision handling |
| `apps/web/src/components/app/scheduled-worksheet.tsx` | Existing worksheet editor, source reference display and answer rendering |
| `apps/web/src/components/app/scheduled-card-matching.tsx` | Reuse the current matching interaction component |
| `apps/web/src/lib/card-matching.ts` | Legacy image-label detection and immutable response moves; detection is not the new authoring schema |
| `apps/web/src/lib/worksheet-layout.ts` | Legacy numbered-gap grouping and inferred field sizes; replace inference with explicit metadata for new authoring |
| `apps/web/src/components/app/scheduled-classroom.tsx` | Student workspace, actual autosave/submission and local preview responses |
| `apps/web/src/components/app/scheduled-student-preview.tsx` and `apps/web/src/lib/scheduled-student-preview.ts` | Preview navigation, simulated clock, sanitized student projection; currently based on persisted state |
| `apps/web/src/components/app/scheduled-lesson.tsx` and `scheduled-lesson-editor.tsx` | Existing bilingual lesson scenes and pre-start amendments |
| `apps/web/src/lib/scheduled-classes.ts` and `scheduled-lesson.ts` | Shared types and request helpers |
| `apps/web/src/components/app/scheduled-material-picker.tsx` | Search materials beyond the current meeting |
| `apps/web/src/components/app/scheduled-class-ai-panel.tsx` and `apps/web/src/routes/api.scheduled-class-draft.ts` | Existing academic-context/session draft generation |
| `apps/web/src/components/app/task-builders/quiz-source-builder.tsx` and `apps/web/src/routes/api.quiz-source.ts` | Existing PDF page/image parsing and question import/generation; extend rather than duplicate |
| `apps/web/src/styles/scheduled-classes.css` and `scheduled-lesson.css` | Reuse theme tokens, fonts and existing student styling |
| `apps/pocketbase/pb_hooks/scheduled-classes-domain.js` | Plan/worksheet/answer validation, completion and attendance rules; unknown presentation fields may currently be stripped |
| `apps/pocketbase/pb_hooks/scheduled-classes-service.js` | Ownership, snapshots, class actions, amendments and student response projection |
| `apps/pocketbase/pb_hooks/scheduled-classes.pb.js`, `scheduled-classes-jobs.js` | API hooks and schedule jobs |
| `apps/pocketbase/pb_hooks/scheduled-lesson-domain.js` | Lesson validation |
| `apps/pocketbase/pb_migrations/1793000000_scheduled_classes.js` and subsequent migrations | Existing collections/schema |

Do not assume similarly named general assignment helpers such as `worksheet-brief.ts` already implement the scheduled-session builder.

## 5. Implementation order and deliverables

### A. Baseline and compatibility, before changing the production class

1. Read the latest branch, production commit, current class revision, activities and any attempts/participants. Preserve user edits made after this handoff.
2. Create a private, read-only export and normalized baseline comparison. Include every ID, prompt, translation, scene, source, option, schedule timestamp, section and response mapping. Keep exports/screenshots containing private data out of Git.
3. Capture the current student experience in all 11 activities at desktop/mobile sizes. Establish tests for the contract in sections 1–3.
4. Add a versioned builder representation and a pure legacy-to-builder adapter. It must open this class in the builder without writing to it just by viewing or previewing.

### B. Manual visual builder and shared rendering

Implement activity navigation, central worksheet canvas and contextual block controls. On smaller screens these panels must stack or become drawers. Provide add, remove, duplicate and reorder actions with keyboard alternatives to dragging.

Required editable blocks: instructions/optional notes, image/media, card matching, ordinary multiple choice, single gap, passage with several gaps, short writing, extended/email writing, audio and reflection. Choose response length and optional translation explicitly. Let the lecturer upload/paste permitted images or search the existing library. Keep UI labels plain; generation is optional and should not dominate the editor.

Use the same renderer for unsaved draft preview and the actual student session. Preview all steps without creating attendance or attempts and without changing real server time or publishing state. Preview must show unsaved content, not silently fetch the last saved version.

Reuse existing grammar/dialogue scenes as editable/reusable lesson content. Preserve them on open, save, duplicate and port. First release must recreate the current class via its template without requiring unfinished advanced animation-authoring tools. Rich authoring of entirely new animated scene types can follow later.

### C. Drafts, templates and scheduling

- Autosave draft edits with optimistic revisions and clear saving/saved/conflict states. Never overwrite another tab's newer revision silently.
- Duplicate an activity, duplicate a session, save as template, choose a template and apply to another date/section. Require destination section/date selection; do not carry over the original publish state or student data.
- Show activity durations and calculated start/end times in WIB. Report unallocated/overallocated minutes against the requested end time; do not silently rebalance durations. Do not auto-insert pauses.
- Final review lists the section/roster scope, actual time window, required activities and student-visible assets. Retain publication confirmation and existing published-class edit restrictions.
- Keep lecturer-only academic links/search available. Student preview must remain sanitized.

### D. Port this same current class, then verify

Follow section 7. A copied sandbox class is a test fixture, not the final port. The production class ID and URL must remain the same.

### E. Later increments

Integrate the existing PDF/image parse flow into block creation: choose pages, inspect/crop permitted excerpts, review extracted text, choose block type, optionally generate a draft, review and apply. Never auto-publish generated content. Later add richer editable grammar/dialogue/animation templates and optional games. Manual builder and reuse must work independently of model availability.

## 6. Data-model direction and compatibility contract

Choose and document a validated versioned schema. A suitable direction is to retain the existing worksheet `items` as canonical answer definitions and add explicit presentation blocks referencing those item IDs. For example, a matching block references statement IDs plus destinations with option values, image IDs and titles; a passage references numbered gap item IDs; writing blocks carry explicit response length. This is a design direction, not an already implemented API.

Requirements regardless of exact schema:

- Stable IDs for retained class/activity/question/gap identities. New block IDs can be added without replacing existing answer IDs. Distinct new sessions/templates need consistent fresh identity mapping and no copied attempts.
- Persist complete paragraphs once, with explicit gap references. Do not make future lecturers type `A · Lücke 1:` conventions, infer email rows from wording, or name files `Bild A` to configure matching.
- Extend both TypeScript types and backend validators/snapshot serialization/student projections. A UI-only field that is stripped on save is not an implementation.
- Keep private correct answers and rubrics in an appropriate server/lecturer-only representation; do not put keys into student-visible blocks. Audit nested fields, preview, template APIs and generated drafts for leaks.
- Validate allowed block types, limits, ID uniqueness, item references, option membership, asset ownership/access, gap completeness, URLs and template permissions. Do not render arbitrary stored HTML.
- Retain legacy reading while deployment/conversion is in progress. Unknown versions must fail safely, without writing an empty plan or dropping content.
- Preserve `answers.responses`, partial saves, backend completeness checks, request idempotency, optimistic attempt revisions, local recovery, submission finality and attendance semantics.

## 7. In-place port and rollback: mandatory release gate

1. **Fetch and guard:** reread the real class and revision immediately before writing. Detect active participation and newer owner edits. Do not use a hardcoded revision or old local export as the source of truth.
2. **Backup privately:** take a consistent PocketBase database backup plus a targeted class/activity export. Record the deployed application version and a normalized baseline hash. Preserve file storage; do not copy secrets into the repo.
3. **Dry run:** convert the fetched data without persisting it. Print a safe structural diff showing new version/block metadata and all preserved identities. Any unexplained content, source, timing, access or answer-mapping difference blocks the port.
4. **Rehearse:** test conversion, student rendering, reload, saves and submission in an isolated fixture with copied content and synthetic participation. Do not create real-student attendance for this class as a test.
5. **Deploy compatibility first:** old stored sessions must work on the new application before any production record is converted. Use a controlled enablement/rollout flag for the new builder and conversion. Conversion must be explicit, guarded, transactional where supported and idempotent.
6. **Port the existing records:** keep `oxeb6ykx9qlwqiy`, its activity IDs and every existing response ID. Add builder representation; do not recreate the class, renumber/reorder activities, replace snapshots indiscriminately, regenerate content or touch attempts/attendance/grades. Maintain the real user-edited activity order from the latest fetch.
7. **Respect live state:** if it is underway or has submissions, preserve the same published-content restrictions. A representation-only port must not reopen editing, change timing, unlock answers or invalidate attempts. If a safe live storage conversion cannot be proven, provide a lossless builder projection/read path first and defer the storage write to an appropriate safe window; clearly report the remaining conversion work rather than claiming the port is complete.
8. **Verify:** compare normalized content/function before and after, including a save/reload through the new builder. Confirm exact ID/answer associations, all scenes, media, schedule, privacy and section restrictions. Rerunning the converter must make no duplicate blocks or ID changes.
9. **Rollback:** retain a metadata-targeted rollback and the previous compatible application image. Never restore an old whole database over newly submitted student work. A representation rollback must preserve all newer attempts/attendance and unrelated user edits. Keep a consistent database backup for disaster recovery, not routine reversal over live writes.

Do not use an automatic startup migration to bulk-convert every session. Do not use root scripts as the normal lecturer authoring workflow. If reordering backend records is ever necessary for a separate feature, inspect the unique `(class, position)` constraint; this port should not need reordering.

## 8. Acceptance checklist: evidence required before “done”

- [ ] Lecturer creates a new session with every first-release block without code/JSON editing or generation.
- [ ] Lecturer can open the real existing class in the new builder, and its in-place port is complete with a verified diff and rollback record.
- [ ] Current 11-activity sequence, 210 minutes, 9 required activities, 57 worksheet response IDs, B-only access and check-in policy remain unchanged.
- [ ] Current five grammar scenes and three review scenes, original wording/translations and all source labels/assets remain available.
- [ ] Three matching activities retain 6/9/15 cards, correct A/B/C or A/P destinations above the stack, reassignment, return, multiple cards per destination, mobile tap and keyboard interactions.
- [ ] Existing partial answers load correctly; autosave/save, offline/local recovery, conflict handling, Next/completion, final submission and post-deadline locks still work.
- [ ] Passage gaps preserve independent answers, and save/reload cannot collapse or reorder IDs.
- [ ] Preview reflects unsaved edits, navigates every step, works at desktop/mobile sizes and creates no real attempts/attendance.
- [ ] Template/session duplication carries no participant data and validates destination permissions/assets.
- [ ] Private PDF still exists for the lecturer, remains detached from the live session, and is denied to students/anonymous clients. No full-page source reference appears in the student view.
- [ ] No private answer keys/academic panels leak to students, previews or template APIs.
- [ ] Normal multiple-choice activities remain normal options. Legacy sessions still render during rollout; conversion is idempotent and scoped.
- [ ] Production smoke test, regression screenshots, required checks, GitHub push and verified deployed commit are recorded. Any incomplete later phases are stated explicitly.

## 9. Tests, tooling and deployment notes

Relevant tests: `apps/web/tests/scheduled-*.test.ts`, `worksheet-layout.test.ts`, `card-matching.test.ts`, i18n tests; backend integration runner `apps/web/scripts/test-scheduled-classes.mjs`.

From repository root: `npm run build --workspace=web`. From `apps/web`: `npm run typecheck`, `npm run lint`, and `npx vitest run scheduled- worksheet-layout card-matching i18n`. Extend meaningful schema/conversion/round-trip/API tests and run the backend integration suite for backend changes; the latest matching feature baseline had 56 relevant unit tests passing. Browser verification covers all 11 activities at 1440px/390px and actual drag/tap/keyboard interactions for the three matching activities.

Local optional tooling (ignored files, not guaranteed to survive a new checkout): Playwright Core under `work/browser/node_modules`, Edge at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, and browser helpers `work/audit-session-ui.mjs`, `work/check-card-matching.mjs`. Private auth fixtures expire and must never be committed or printed. Do not ask the user for credentials before checking the existing authorized SSH/test-account setup.

Production uses root SSH key access to `31.97.48.26`; do not assume access exists in a different agent environment without testing it. Checkout `/opt/laras-git`; private environment config must not be printed. Container names: `laras-git-web-1`, `laras-git-pocketbase-1`, `laras-git-whisper-1`. Health endpoint: `https://laras.zulficar.me/api/health`. The VPS hosts other apps; scope container changes to Laras. Old host `187.77.115.18` is not the deployment target.

Existing ignored deploy scripts such as `work/deploy-matching-order.sh` show the last web-only build/deploy procedure, including a cached-runtime workaround for apt mirror issues. Inspect current Dockerfiles/compose and real server state rather than blindly rerunning a script with old commit guards/tags. Backend schema/hook changes require a PocketBase build/restart and a consistent database backup; a web-only deploy is insufficient. Validate deployment health and the actual student UI, not just a successful Docker command.

`typecheck` generates tracked `.react-router` artifacts; review/restore generated-only changes before committing. Preserve unrelated `.dsh/`, `remotion/` or other user work. Push the working branch and report the exact deployed commit; do not claim a merge to main unless it happened.

## 10. Suggested next-agent first message and first actions

Tell the user you are implementing the builder and an in-place compatible port, beginning with a baseline audit. Then inspect current code, latest owner changes, production version, class status and tests. Write a short execution checklist corresponding to A–D above. Implement compatibility/schema first, then the manual editor and shared preview, templates/scheduling, rehearsal and the current-class port. Deliver working end-to-end increments and evidence; do not stop after another high-level plan.
