# UI audit implementation — 13 October 2026

Based on the public/lecturer/student audit in [ui-improvement-plan.md](ui-improvement-plan.md), implemented on GitHub main 861f6e0 in branch `codex/ui-improvement-plan`.

## Grading accuracy

`src/lib/submission-state.ts` defines collected, officially graded and awaiting grading. A grade field may contain a default zero, AI suggestion or lecturer draft. Only `status=graded` counts as official. Zero is a valid official score. Returned work remains collected and awaiting grading; drafts are excluded.

Dashboard and task list include enrolled and public channels. A public record linked to an enrolled record is counted once; the enrolled record is canonical. Evaluation participants use the same duplicate rule. The gradebook and learning-outcome averages exclude unpublished submission scores. No saved grades, feedback, publication status or submission records are changed by this work.

Course analytics keeps roster collection/progress separate from the lecturer grading queue: roster collection measures enrolled students; grading completion includes unlinked public submissions. Student analytics always uses one student's expected assignments, filters requests by the signed-in owner, and never requests the roster or public submissions. Student alerts lead to `/app/kerja/:assignmentId` or their own course grades. Existing PocketBase rules remain the authority for access control.

## Interface changes

- Shared paired surface/foreground/border/focus tokens fix syllabus, RPS, revision text, analytics and input contrast. Source PDF/image previews retain document colors.
- Analytics controls and personal alerts use Indonesian/English/German dictionaries. Course content is kept in its original language. Interface language does not rewrite materials or student answers; AI explanation language remains controlled by the existing AI workflows.
- Login identifies lecturer credentials as email, retaining NIM/email for students and automatic role correction.
- Students see a revision comparison only after its source submission is available. Normal task content stays visible during lookup.
- Dashboard AI composer is a closed disclosure by default, preserving all its existing controls.
- Roster search matches name, NIM and cohort; sorting and selection remain scoped to the filtered rows. Sticky headers support long rosters and outcome tables.
- File library renders 30 files per page and resets paging on filter changes. Failed reads do not masquerade as an empty library. File relation expansions support both legacy single objects and current arrays.
- Analytics failure is shown before the absent-model loading condition, with retry. AI usage sends the existing authentication token and supports retry.
- Welcome tour is shown once per browser/account/role/version across sessions. The explicit “do not show again” preference and profile replay remain available. Restricted storage access does not crash the tour.
- Mobile/tablet adaptations, visible focus and reduced-motion styles cover the changed surfaces.

## Verification and boundaries

Typecheck, lint, 14 focused grading/analytics/chapter/file-relation regression tests and production build run in an isolated local Node 22 container. Local preview uses the existing development database; production was not modified. The local dataset has 194 submissions, unlike the larger dataset in the audit. Browser checks verify dashboard/task/analytics agreement, dark syllabus readability and mobile/tablet layouts. The local lecturer session is available; personal analytics is verified through model regressions and owner-scoped request code, not a new student browser login.

This is the audit's implementation foundation, not a claim that every legacy interface string or screen has been redesigned. The exhaustive migration of remaining settings, practice/editor messages and lecturer analytics prose to locale keys, all-page breadcrumbs, a full student keyboard/screen-reader pass, and simulated slow/failure UI checks remain follow-up work. Large file libraries are paginated in the DOM; fetching is still the existing cached full-list query. Server pagination should be considered if profiling shows it is needed.
