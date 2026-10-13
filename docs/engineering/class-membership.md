# Parallel class membership

The lecturer's `course_roster.section` is the source of truth for a student's class. `enrollments.section` mirrors it so students can resolve their own class without accessing the private roster.

`pb_hooks/section-membership.js` derives enrollment membership on creation/update from one exact course + student NIM match. A canonical `NIM@student.upi.edu` email is used only when the student NIM is empty. Staff accounts and ambiguous identities are not guessed. Cross-course class references are rejected. Roster creation/moves synchronize the matching student's existing enrollments. These hooks do not alter submissions or grades.

`src/lib/class-scope.ts` treats sessions with an empty section as shared course sessions. Selecting A or B includes shared sessions and that class's own sessions, excluding the other class. Attendance already followed this rule; Pertemuan now follows it too. Course tasks and RPS remain shared.

## Existing data

Run `scripts/reconcile-class-membership.mjs` inside the web container. Default is a read-only dry run. `--apply` fills only blank enrollment classes with exact roster matches; conflicting existing assignments cause it to stop. It verifies protected academic collection hashes before/after and is idempotent.

Production JR242 was reconciled on 13 October 2026: 72 assignments filled, no conflicting assignments; one enrollment without a student roster match was retained unchanged. Classes A/B contain 37/35 roster students. Existing 16 unassigned sessions are shared and were not relabelled.

Native database/files backups were taken before changes:
- Production: `pre-kelas-prod-20261013.zip`
- Local: `pre-kelas-local-20261013.zip`

A post-reconciliation production snapshot is used for the local refresh. Snapshots contain private data, stay outside Git, and must not be committed. Backend migrations/hooks must be rebuilt alongside the frontend when restoring newer data locally.

## Local snapshot switching

`docker-compose.local.yml` uses `LARAS_LOCAL_DATA_VOLUME` to select a named local database volume. The refreshed snapshot is in `laras_pocketbase-local-data-synced-20261013`; the original `laras_pocketbase-local-data` remains intact. The local `.env` is ignored by Git and its previous version is preserved privately for rollback. Matching encryption settings are required when restoring a PocketBase snapshot. Local app metadata points to localhost rather than the production domain.

Validation: 18 focused tests, full typecheck/lint/build, a real local backend request confirming an enrollment cannot override its roster-defined class, UI roster counts A=37/B=35, and 16 shared meetings visible with B selected. Production web and backend health checks passed after deployment.
