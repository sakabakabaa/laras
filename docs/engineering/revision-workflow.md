# Production → feedback → correction

A correction assignment uses `assignments.revisionOf`, not `parentAssignment` (which means formative preparation). `revisionWorkflow` records whether feedback was published in LARAS or given on paper before a historical correction.

## Future work

The lecturer opens **Alur revisi** in the production assignment's assessment screen, sets an optional deadline, and creates/opens a correction task. The new task is published and excluded from aggregate grades until explicitly configured. It inherits requirements/rubric and teaching attachments. Each student sees their own original answer and lecturer feedback. A final revision requires the original to have a published assessment; drafts may be prepared beforehand. The backend attaches the student's unique original submission automatically.

The student can save a short reflection. The lecturer sees original evidence, original-file previews, feedback and revision comparison. The original and correction grades remain separate.

## Historical batch

The approved initial mapping is TK1 → TP1, TK2 → TP2, TK3 → TP3 for JR242. `apps/web/scripts/import-historical-revisions.mjs` checks task identity and all three plans before writing. It uses current server records, not a stale local export. Default mode is dry-run; `--apply` is explicit. Each task's application is a database transaction; the three tasks are separate transactions. If interrupted, inspect the report and rerun safely.

Run inside the deployed web container, using its existing environment:

```sh
docker compose exec -T web node /app/apps/web/scripts/import-historical-revisions.mjs
docker compose exec -T web node /app/apps/web/scripts/import-historical-revisions.mjs --apply
```

Take a consistent production backup before applying. The operation writes only assignment links/workflow and submission lineage/provenance (plus standard update timestamps). It never changes answer content, files, original creation dates, grades or feedback. Missing/duplicate originals, duplicate revisions and conflicting links are reported; only clear matches are applied. Account IDs establish identity; title matching is used only for the operator-confirmed task mapping.

Historical provenance records source `historical`, feedback channel `paper`, user-authorized sequence confirmation, unknown feedback date and no invented feedback snapshot. The authorized operator confirmation is distinguishable from a lecturer confirmation in the UI. Saved AI scores are displayed as retrospective analysis in this context, not as original paper assessment. No item-level feedback-uptake claim is created without the actual comments.

## Integrity boundaries

- Course and lecturer ownership must match; no self-links, nested revisions or formative tasks.
- Once linked, the original assignment cannot be replaced.
- Student requests cannot write provenance or the existing server-managed lineage fields.
- Future final submissions require a unique assessed original; ambiguous historical rows stay unlinked for review.
- Feedback is snapshotted at first final submission for LARAS revisions and preserved on later edits.
- Original publication may predate this feature; a `gradedAt` marker and `graded` status are the existing release signals.

Implementation: `revisions.js` and `revisions.pb.js` in PocketBase hooks; migration `1791620000_submission_revision_workflow.js`; web route `api.assignment-revisions.ts`; `AssignmentRevisionControls` and `SubmissionRevisionContext` components. Tests: `submission-revisions.test.ts` plus isolated PocketBase upgrade/import checks.
