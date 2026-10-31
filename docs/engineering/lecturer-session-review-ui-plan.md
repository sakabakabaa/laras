# Lecturer session review — UI improvement plan

**Scope:** presentation + client-side derivation only. The page under review is
`/app/kelas-terjadwal/:courseId/:sessionId` (tab **Jawaban & nilai**), implemented in
`apps/web/src/components/app/scheduled-lecturer-session.tsx`,
`apps/web/src/components/app/scheduled-review-workspace.tsx`,
`apps/web/src/lib/scheduled-session-workspace.ts`,
`apps/web/src/styles/scheduled-session-workspace.css`.

No PocketBase hook, migration, endpoint, auth, or stored-data change is required:
the owner state response already ships everything needed (verified below).

**Goal:** a lecturer opens one page and immediately sees, per student and per
activity: **score**, **which items are correct**, **which are wrong**, and **whether
this activity needs manual evaluation** — compact enough to work through 39
students without scrolling or tab-hopping.

---

## 1. Evidence — measured on the live session

Session `n0239h77wykwein` ("Fit und gesund — Beim Arzt (Übung 10a–c)", course
`30152xyjuzxgpq4`), phase `closed`, 39 roster rows, 11 activities, 323 attempts.
Measured in the deployed app at 1432×769, light and dark.

| # | Observation | Measurement |
|---|---|---|
| 1 | Answer key reaches the lecturer payload but is never rendered | Activity `mb6wxbhyqbj7672` returns `answerKey.items` with 15 `mode:'exact'` entries; DOM text of `.sr-answer-area` contains no key/correct string (`/Kunci|Jawaban benar/` → false) |
| 2 | No correct/wrong marking at all | 15 rendered cards, 1 item actually wrong (`Haben Sie Schmerzen?` answered `P`, accepted `A`), zero verdict indicators in DOM |
| 3 | Auto score never shown in the review column | `attempt.score = 93.33` exists on the payload; `.sr-answer-area` contains no score text; the grading rail only renders a score for `kind === 'quiz'` |
| 4 | The pending badge over-counts manual work by 4.2× | Tab badge / toolbar says **276**; of those, **210** worksheet submissions were already auto-scored by exact keys and only **66** need a human (34 e-mail + 32 exit ticket) |
| 5 | Which activities need manual review is unknowable from the UI | 6 activities carry `exact` keys, 1 carries `mode:'reference'` (e-mail rubric + model answer), exit ticket and 3 material activities carry no key; the activity picker shows 8 bare titles |
| 6 | One answer sheet is 2.9k px tall for mostly one-letter answers | `.sr-answer-area` scrollHeight **2853 px**; 15 cards at **156 px** each + 18 px gaps; question block 77 px / answer block 76 px per single-token answer |
| 7 | Reference answers (rubric, model answer) are discarded entirely | `responseCards()` drops `answerKey`; the e-mail activity's `rubric`/`modelAnswer` never reach the lecturer, so manual grading has no anchor |
| 8 | Scrolling loses the identity of the student being graded | After scrolling `.ld-main` to 800 px, `.sr-answer-area` top = **−390 px**: name, NIM and student position are off-screen while the grading rail is still pinned |
| 9 | Type below the project floor | `.sr-answer-text>span` **9 px**, status chips **10 px**, student rows **11 px** (§3 of `DESIGN_PLAN.md` sets an 11 px floor) |
| 10 | Column geometry leaves the main task cramped | grid `224px / 726px / 272px`; the 272 px rail is where grading lives, the 726 px column holds the work |
| 11 | Contrast is fine in both themes | Worst measured pair 4.64:1 (11 px muted on `#F5F7FA`) light, 6.9:1 dark. No contrast work needed — keep as a regression gate |

Interaction cost implied by 4 + 6 + 8: reviewing one student's manual work means
selecting the activity in a `<select>`, scrolling up to 2853 px, scrolling back to
reach the verdict, then re-selecting per student — 66 times.

---

## 2. Design direction for this screen

**One row per response, verdict-first.** The lecturer's job on this page is
triage, not reading. Density wins over cards: a one-word answer must occupy one
compact row, and the verdict must be visible before the answer text is read.

Rules locked for this screen (consistent with `DESIGN_PLAN.md`):

1. Verdict is primary: **✓ benar / ✗ salah / ~ perlu dinilai** chips at the row
   start, scoring colours reserved for exactly those three meanings.
2. Score is always on screen: a summary bar at the top of the work column
   (`93.33 / 100 · 14 benar · 1 salah · otomatis`) that stays visible while
   scrolling.
3. Keys are shown where they matter: accepted answer inline for wrong items,
   collapsed behind a "lihat kunci" toggle for correct items, and the
   reference/model answer + rubric for `mode:'reference'` items.
4. Manual work is a queue, not a filter: "perlu dinilai (66)" drives the badge,
   the default filter, and the next-target selection.
5. Compact by default, expandable per item: single-token answers render at ~44 px;
   extended writing expands on demand (and always for reference-mode items).
6. Nothing else on the page moves: tabs, breadcrumbs, attendance tab, student
   preview and publish flow stay exactly as they are.

---

## 3. Workstreams

### W1 — Derive a verdict model (client, no data change) · 1 day

New module `apps/web/src/lib/session-review-verdict.ts`:

- `responseVerdicts(activity, attempt)` → per item
  `{itemId, prompt, answer, verdict: 'correct'|'wrong'|'manual'|'ungraded', accepted?, modelAnswer?, rubric?, points}`.
- Port `normalizeAnswer` **exactly** as implemented in
  `apps/pocketbase/pb_hooks/scheduled-classes-domain.js` (trim → collapse
  whitespace → strip trailing `.!?` → lowercase) so the client verdict can never
  disagree with the stored `attempt.score`. Cover it with a parity test using
  fixtures captured from that function.
- `reviewTally(state, activityId)` → `{autoScored, needsManual, manualDone,
  manualPending, studentsWithoutSubmission}`.
- `activityRequiresManual(activity)` → false when every worksheet item has an
  `exact` key or the activity is a `quiz`; true for `reference` items, exit
  tickets, free-text assignments.
- `needsManualTruthfully(state)` → the 276 → 66 correction, used by the badge.

Exit criteria: unit tests assert `wrong count × points` reproduces
`attempt.score` for a fixture of the live 15-item sheet, and that the tally
reports 210 auto / 66 manual for the captured session fixture.

### W2 — Verdict-first compact response list · 2 days

Replace `.sr-response-cards` markup in `scheduled-review-workspace.tsx` with a
single `ol.sr-response-list`:

- Row = number · verdict chip · prompt (single line, `lang="de"`) ·
  student answer · optional key column.
- Compact row height for answers < 60 chars; full block only for extended writing.
- Wrong rows get an inline `Diterima: A` and an amber-tinted background at
  ≤ 8 % opacity (no red for wrong — red stays reserved for destructive actions).
- `mode:'reference'` rows render the model answer and rubric in a collapsible
  detail, plus a one-click "pakai contoh jawaban sebagai umpan balik" that only
  fills the feedback field (never writes).
- A `Ringkas / Lengkap` toggle (persisted per user in `localStorage`) so a
  lecturer can switch to full prompt+translation when needed.

Target: the 15-item sheet from the evidence lands under **700 px** tall compact
(measured, not estimated) and under 1100 px in full mode.

Exit criteria: `<details>`/toggle keyboard-operable; verdict chips have text, not
colour alone; both themes contrast ≥ 4.5:1 for all new pairs; render test asserts
verdict chips for a correct, a wrong, and a reference item.

### W3 — Sticky score summary + sticky identity · 1 day

- A sticky bar inside the work column: student avatar+name+NIM, activity title,
  score, `x benar / y salah / z perlu dinilai`, status chip, and prev/next.
- On student or activity change, reset the scroll container to the top of the
  work column (fixes evidence #8). Guard it with the existing unsaved-change
  confirm.
- Keyboard: `J`/`K` next/prev student, `N` next *needs-manual* target, `1..n`
  jump to activity, `⌘/Ctrl+Enter` save-and-next. All announced in a shortcut
  hint line.

Exit criteria: identity bar remains visible at 1432, 1024, and 390 px widths;
scroll reset verified by test (scrollTop is 0 after a selection change).

### W4 — Queue and honest counts · 1.5 days

- Tabs/badge and toolbar use `needsManualTruthfully`: badge becomes **66**, and a
  secondary muted label reads `+210 otomatis`.
- Student list rows gain compact score and verdict chips
  (`93.3 · 1✗`) and a `perlu dinilai` marker when the selected activity is manual.
  The list itself gains a `Perlu dinilai` / `Semua` / `Belum mengirim` /
  `Sudah diterbitkan` segmented filter (replacing the `<select>`), retaining the
  search field.
- The default selection on open becomes the first student × first
  manual-required activity that lacks a reviewed assessment; if none, the first
  auto-scored activity (read-only view).
- Grading rail states the mode explicitly: `Otomatis · kunci jawaban`,
  `Manual · rubrik`, `Manual · poin`, `Tanpa nilai`. The 272 px rail keeps only
  the grade input, feedback, save/publish; the mode/config moves behind the
  existing settings dialog.

Exit criteria: badge equals the number of submissions that actually require a
human action, asserted in a render test against the captured fixture; the queue
lands on a manual item without any `<select>` interaction.

### W5 — Type, spacing, and density pass · 0.5 day

- Raise 9 px → 11 px and 10 px chips → 11 px; student rows 11 → 12 px.
- Numeric columns use `font-variant-numeric: tabular-nums`.
- Row borders replace card borders inside the response list; one border radius
  (10) for the three columns.
- Keep the 1120 px and 720 px reflows; at ≤ 720 px the identity bar collapses to
  name + score and the grading rail becomes a bottom sheet with the same fields.

Exit criteria: no font-size below 11 px on this route in either theme
(automated check); no horizontal overflow at 390 px; touch targets ≥ 44 px.

### W6 — Verification · 1 day

- Unit/parity tests (W1) plus render tests for verdicts, tally, badge, queue,
  and scroll reset.
- Manual pass on the live session for two activities (one exact-key, one
  reference-mode) covering: correct item, wrong item, unanswered item, no
  submission, unreviewed → draft → reviewed → published, and the
  unsaved-change guards.
- Both themes, widths 390 / 768 / 1024 / 1432; record before/after heights of the
  response column as the density proof.

---

## 4. Sequencing and risk

Order: **W1 → W2 → W3 → W4 → W5 → W6**. W1 is pure logic and testable without
UI. W2 and W3 touch only the review workspace; W4 touches the session shell
(badge/counts) — keep them separate commits so a revert of the count change does
not drag the layout with it.

| Risk | Mitigation |
|---|---|
| Client verdict drifts from server score | Port `normalizeAnswer` verbatim, add a parity test over a captured fixture; never compute a *score*, only display the server's `attempt.score` next to a per-item verdict |
| Lecturers read a client-side verdict as an official grade | Verdict chips are labelled `otomatis` and the rail keeps the authoritative manual score; publishing flow untouched |
| Losing compact/full preference across devices | Preference is per-device only; documented, not synced |
| Answer keys leaking to students | These components render only when `state.owner` is true; the student payload already strips `answerKey` before release (verified in `scheduled-classes-service.js`). Do not add key rendering to any shared student component |
| Reference answers used as a published grade | "Pakai contoh jawaban" only pre-fills the feedback textarea; saving remains an explicit manual action |

Rollback: the change is confined to four frontend files plus one new lib module
and CSS; revert the commits — no data migration to undo.

---

## 5. Out of scope (found, not touched)

- **Bulk actions** (mark-all-reviewed, per-activity publish). Needs a new
  server action; would be the natural follow-up after W4.
- **Auto-grading reference answers** with AI. The rubric exists, but scoring is
  a product decision and a backend change.
- **Attendance tab merge.** Cross-tab unsaved-change guarding already works; a
  unified per-student panel is a larger IA change, not part of this plan.
- The `276` figure being wrong is a *presentation* defect fixed by W4; the stored
  submissions are correct.

---

## 6. Next steps

1. Approve this plan (and confirm W1's client-side verdict model is acceptable
   versus adding a server `reviewSummary` field to the state response).
2. Implement W1 + W2 on a branch from `codex/ci-checks` tip, with tests.
3. Verify on the live session, capture before/after heights, then continue W3–W5.
