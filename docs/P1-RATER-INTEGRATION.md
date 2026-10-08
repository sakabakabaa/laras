# P1 independent research-rater integration (not deployed)

## Server contract

Apply `1791321000_research_rater_access.js` through the normal migration workflow in an isolated synthetic-data environment first. No accounts, credentials, memberships, or live data are created by this change. Provision `research_rater_assignments` through the authorized server/operator workflow:

```json
{"assignment":"<assignment-record-id>","reviewer":"<user-record-id>","round":"2","active":true}
```

`round` in membership records is the **string** `"1"`, `"2"`, or `"0"`; requests use numeric `1`, `2`, or `0`. The unique indexes require one account per assignment/round and one round per assignment/account, including inactive records. Revoke with `active:false`. Do not reassign a round after originals have been submitted: use a new study assignment instead. There is no implicit assignment-owner research override. Omitted request round means 1 only; every P1 client should send the authorized round explicitly.

The existing owner-only grade/review/publish target loader is unchanged. Being an assigned rater never grants assignment ownership, generation, grade, draft-review, or publication access.

### Blind load

Authenticated `POST /api/evaluation-annotation`:

```json
{"intent":"load","submissionId":"<submission-record-id>","round":2}
```

Use `publicSubmissionId` instead of `submissionId` for the public channel, never both. IDs are validated literally (no whitespace repair). The result contains `ok`, `round`, `evaluationId`, `content`, parsed AI `findings`, and projected `items`.

- Independent rounds see only their own account/round entries in `items[].raterJudgments`, never flat shared judgment fields or another rater's note, identity, or reference answer.
- Other raters' human missed-error rows are omitted entirely for independent readers.
- Round 0 sees original pairs only after both distinct independent raters have submitted that item's originals. A single observation is not adjudication-ready.
- Loads use POST because the platform can cache authenticated GET responses by URL despite `no-store`.

### Save original / adjudication

POST the existing annotation endpoint with `intent:"save"` (or omit intent), target ID, authorized numeric round, `findingFingerprint`, and the existing judgment fields. Unknown AI fingerprints are rejected. `reviewer` is always taken from authentication, never the request.

For a human missed-error candidate, use `itemId` **instead of** `findingFingerprint`. Its assignment and evaluation must match the selected target. This supports an independently prepared confirmation on a coordinator-supplied candidate ID and subsequent round-0 adjudication. The server does not reveal the other original to an independent rater. Candidate assignment must not distribute original reference judgments to the second rater.

`DELETE /api/evaluation-missed-error` requires the authenticated target + explicit round and uses the blind rater assignment check. It verifies that the target assignment/submission matches the candidate and that the caller is the assignment owner. Independent raters cannot delete originals, and any submitted/adjudicated record is immutable.

### Missed-error discovery

`POST /api/evaluation-missed-error` accepts the existing discovery fields plus numeric `round`. Each creation stores one original judgment with `origin:"human"`, `detectionJudgment:"missed"`, and **`adjudicationStatus:"reviewed"`**, never `adjudicated`. Discovery in round 0 is rejected. Existing gold labels are not automatically rewritten or backfilled: historical provenance must be audited explicitly.

Two separately discovered human rows are not automatically/fuzzily merged. A coordinator must pair neutral candidate IDs without exposing reference judgments; submit confirmation through `itemId` as above. Unmatched single discoveries remain non-gold. Human flat reference fields retained on discovery are observation metadata, not adjudicated truth.

## UI integration remains partial

The shared lecturer research pane now requests research records through authenticated `POST /api/evaluation-annotation` with an explicit round; it no longer directly reads `ai_feedback_items`. Its client maps only the returned round judgment, clears stale research state on target/round changes, and fails closed on authorization/load errors. Submitted annotations are locked in the UI, with server-side immutability remaining authoritative. The missed-error creation path sends the explicit selected round.

This is **not a complete independent-rater interface**. The surrounding lecturer workspace still loads `ai_evaluations` and review state through owner-scoped product workflows, and there is no dedicated non-owner rater page or assignment-discovery UI. Do not broaden grading loaders to admit raters. Until a separate read-only rater workspace is implemented and tested end-to-end, use this integration only for explicitly assigned raters who already have authorized workspace access; do not treat the app as ready for independent rater data collection. A coordinator must supply target/candidate IDs until assignment discovery exists.

## Parent-owned export/analytics integration requirement

This workspace enables generic export after membership becomes inactive; it does not implement a release-only adjudicator/export policy. Define that policy before participant data are collected or raw export is enabled.

JSON export schema v3 carries a **metadata/hash-only projection** of the generation snapshots/history: generation/build/prompt versions, allowlisted provider/model metadata, timestamps, and hashes. It excludes snapshot learner text, structured answers, prompt bodies, image URLs, and archived full outputs/summaries. The existing export still includes evaluation outputs/findings and quoted excerpts under owner/researcher authorization; this is not a blanket de-identification or release-only control. Full generation evidence stays server-side pending a separately approved controlled-access workflow. CSV includes hashes and generation identifiers, never the complete submission or prompts.

## Concurrency and operations

`research_annotation_locks` is a server-only distributed mutex. Its unique `key` index serializes writes to a finding across app processes; membership and feedback collections also use database uniqueness. Competing writes get 409 and should reload/retry. A missing/unavailable authorization or history/lock collection fails closed. Locks are released in `finally`. A crashed writer deliberately leaves a lock rather than allowing unsafe timed takeover. An operator may clear a stale lock only after confirming no writer is still running and reading the feedback row to determine whether the previous write completed. A lock-release failure may make the response uncertain; reload before retrying.

The feedback unique index fails migration if historical AI finding duplicates exist; audit/consolidate explicitly rather than silently deleting originals. Downgrade re-enables raw owner reads and drops memberships/locks, so it is not compatible with continuing a blinded P1 study.

## Verification

Synthetic-only tests exercise the real helpers and API wrapper with mocked storage/auth boundaries; schema tests execute the migration against an in-memory collection harness. They do not claim live PocketBase/browser/deployment verification.

```sh
cd /data/workspace/horizons-deploy/apps/web
npx vitest run tests/research-rater-access.test.ts tests/research-rater-migration.test.ts
npx vitest run
npx tsc --noEmit
npx eslint src/lib/research-target.server.ts src/lib/evaluation-annotation.server.ts src/routes/api.evaluation-annotation.ts --quiet
```
