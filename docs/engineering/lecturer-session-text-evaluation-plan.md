# Lecturer session review — text evaluation + AI wiring plan

**Status:** plan only. No code from this document is deployed. Extends
[session review UI plan](lecturer-session-review-ui-plan.md) (verdict list, score
summary bar) with **inline text evaluation** and **AI draft evaluation** for
writing activities in a scheduled class, mirroring what a formal assignment
already has under **Penilaian**.

**Scope:** presentation + client derivation (part A) and a new server path
(part B). Part B adds collections, routes, and a queue; it does **not** change
existing AI evaluation behaviour for formal assignments.

---

## 1. What already exists (measured)

### 1.1 On a scheduled class

| Thing | Location | State |
|---|---|---|
| Activity answer key | `scheduled_class_activities.snapshot.worksheet.answerKey` | `exact` (auto-scored) or `reference` (`modelAnswer` + `rubric`) |
| Auto scoring | `scheduled-classes-domain.js` `result()` | exact keys only; `score` = earned/total ×100 |
| Manual grading | `scheduled_assessments` (`points`, `criterionScores`, `feedback`, `status`, `published`) | whole-attempt score + free-text feedback. **No per-span marking, no rubric derived from the text, no AI** |
| Grading settings | `scheduled_grading_settings` (`ungraded`/`points`/`rubric`) | lecturer-chosen per activity |
| Live data | session `n0239h77wykwein` | 11 activities, 7 auto-keyed, **1 reference-mode writing activity**, 1 exit ticket, 34–35 submissions each |

### 1.2 On a formal assignment (the thing to mirror)

| Piece | Location | Reusable? |
|---|---|---|
| Prompt contract, findings schema, taxonomy | `lib/ai-evaluation.server.ts` (644 lines), `lib/ai-evaluation.ts` | **Yes** — already client-safe parsing + server prompt |
| Rubric weighting + scoring factors | `lib/evaluation-rubric.ts`, `lib/evaluation-scoring.ts` (221 lines) | Yes, pure |
| Anchor resolution (quote → exact offsets) | `lib/ai-evaluation.ts` `resolveAnchor`, `buildMarkedSegments` | Yes, pure |
| Review/publish validation | `lib/evaluation-review.server.ts` (`loadEvaluationTarget`, `validateReviewFindings`, max 40 findings, quote must be exact substring) | Partly — hard-bound to `assignments` |
| Storage | `ai_evaluations` (lecturer-private, `owner` list/view rule, `assignment` relation **required**) | No — cannot point at a scheduled activity |
| Draft trigger | `/api/evaluation-draft` → `queueEvaluationDraft` | Signature bound to `Assignment` |
| Save/publish | `/api/evaluation-review`, `/api/evaluation-publish` | Bound to assignment + submission |

**Two blocking facts**

1. `ai_evaluations.assignment` is a **required** relation (`1790767000_create_ai_evaluations.js`, the `assignment` field block: `required: true`) with a unique index on `submission`. A scheduled attempt has neither. Reusing the collection needs a schema migration on a table that already holds production research data.
2. `runEvaluation()` builds its prompt from `assignment.title/instructions/requirements/taskConfig` and `submission.content/transcript/files`. A scheduled activity has `snapshot.content/questions/worksheet` and `attempt.answers.responses`. Both sides need an adapter either way.

**Gap found in passing (out of scope, do not fix silently):** the existing
`/api/evaluation-draft` path never calls `enforceAiAccess`; only 5 routes do.
The new path must be gated from day one, and the legacy gap gets its own ticket.

---

## 2. Design decisions

1. **New storage, shared logic.** Add `scheduled_evaluation_drafts` rather than
   loosening `ai_evaluations`. Extract the channel-agnostic core
   (prompt assembly, model call, validation) into `evaluation-core.server.ts`
   and have both channels call it through a small "subject" adapter. One prompt,
   one parser, one rubric scorer — two stores.
2. **AI is opt-in per activity, never automatic.** Unlike the assignment path
   (draft queued on submission), a scheduled class can hold 7 writing activities
   × 39 students = 273 model calls. The lecturer presses **Siapkan draf AI** for
   one activity; the queue is capped and visible.
3. **AI is a suggestion; the lecturer's mark is the grade.** The existing
   `scheduled_assessments` publish snapshot stays the single source of truth.
   AI output is stored in its own collection with `owner`-only read rules and
   never reaches students before `publishAssessment`.
4. **Marks and score are separate.** A per-span mark explains *why*; the rubric
   criterion scores produce *what*. Publishing composes feedback from approved
   marks; the score comes from `criterionScores` (mode `rubric`) or `points`.
5. **Text is the evidence.** For writing, the evidence string is
   `formatScheduledResponse(activity, attempt)` (already exists in
   `lib/scheduled-review.ts`) — the combined prompt+answer text the lecturer
   already sees. Every AI quote is validated as an exact substring of it.

---

## 3. Part A — manual text evaluation (client + one field)

### A1. Data

`migration 1793300000_scheduled_evaluation.js`:

```
scheduled_assessments  +=  annotations  json  maxSize 100000     // lecturer working marks
                       +=  aiDraft      relation scheduled_evaluation_drafts (optional, maxSelect 1)
```

`annotations` shape (validated server-side, mirroring `ReviewFinding`):

```
{ version: 1, marks: [
  { id, quote, start, end, severity, category, subcategory,
    errorDescription, correction, note, status: 'pending'|'approved'|'edited'|'rejected'|'manual',
    source: 'ai'|'lecturer', criterion?, anchorValid?: boolean }
], note: string }
```

### A2. UI — the writing row becomes an editor

Inside the verdict list from the UI plan, a `manual` verdict row expands into:

| Zone | Content |
|---|---|
| Script | Student text rendered by an extracted `AnnotatedText` component (`buildMarkedSegments` + `resolveAnchor`, already pure). Click a word span → mark. Gutter numbers, same as `AnswerScript`. |
| Mark panel | Per mark: severity chip, note (≤600 chars), correction, criterion select, approve/reject/remove. |
| Rubric | `criterionScores` inputs, live weighted total, next to the AI recommendation when present. |
| Feedback | Textarea, with **Sisipkan dari mark yang disetujui** composing `Saran perbaikan:` bullets exactly like `composeFeedback()` in `api.evaluation-publish.ts`. |
| Actions | Simpan draf · Ditinjau · Simpan & berikutnya (existing behaviour). |

Extraction: `AnswerScript` is inside the 3409-line `ai-evaluation-review.tsx`
and depends on a React `useReview()` context. Pull only the pure renderer into
`components/app/annotated-text.tsx` (`content`, `segments`, `marks`, handlers,
`readOnly`); leave the assignment context where it is. Both views then share one
renderer and one anchor algorithm.

### A3. Validation

`saveAssessment` gains `annotations`. Validation lives in
`scheduled-evaluation.js` (hook helper, sibling of `scheduled-assessment.js`):

- ≤ 40 marks, unique ids `^[a-z0-9-]{1,64}$`
- `note` 1–600 chars; `severity ∈ {minor, major}`
- `quote` must be an exact substring of `formatScheduledResponse(activity, attempt)` (recomputed server-side — never trust client offsets)
- `anchorValid:false` allowed but never published
- rejected marks are stored, never counted in the composed feedback

Exit criteria: a submitted mark quotes the student's own text; an edited quote
that no longer exists is rejected with a 422 and the saved draft is unchanged.

---

## 4. Part B — AI draft evaluation

### B1. Adapt the core

New `lib/evaluation-core.server.ts`:

```ts
type EvaluationSubject = {
  channel: 'assignment' | 'scheduled';
  ownerId: string; courseId: string; sessionId: string; subCpmkId: string;
  title: string; instructions: string; requirements: string;
  rubric: { id: string; label: string; weight: number }[];
  evidenceText: string;            // student's own words, the only quotable source
  structuredAnswers?: string;      // quiz answers, if any
  images?: string[]; link?: string;
  levelGuide: string;
};
```

`runEvaluationCore(subject, sink)` keeps today's behaviour exactly: persist
`researchSnapshot` → call provider → `validateDraft` → persist findings,
recommended score, rubric breakdown, provenance, `rawOutput`, `outputHash`.
`sink` writes to `ai_evaluations` or `scheduled_evaluation_drafts`
(`create`, `update`). No prompt text changes, so existing prompts stay
comparable across channels.

Scheduled adapter maps:

| Core field | From |
|---|---|
| `title` / `instructions` | `activity.title`, `activity.content` |
| `requirements` | `worksheet.answerKey.items[*].rubric` and `.modelAnswer` joined (the lecturer already wrote these) |
| `rubric` | `scheduled_grading_settings.criteria` when mode is `rubric`; else the reference `rubric` text as a single criterion set of ≤5 aspects (explicitly labelled as derived) |
| `evidenceText` | `formatScheduledResponse(activity, attempt)` |
| `levelGuide` | `languageLevelGuide` from the activity's course code, as today |

When neither criteria nor a reference rubric exists, return `result:
'insufficient'` with an explicit Indonesian reason — never invent criteria.

### B2. Storage

`scheduled_evaluation_drafts` (lecturer-private):

```
class, activity, attempt, student, owner          relations (required)
status        select pending|ready|failed
result        select sufficient|insufficient
reason        text 2000
findings      json 200000
recommendedScore number 0..100
rubricBreakdown json 50000
summary       text 2000
citations     json 100000
contextNote   text 500
rawOutput     text 100000        // research reproducibility, as today
generationHistory json
researchSnapshot json
provenance columns (model, modelVersion, promptVersion, systemPromptVersion,
                    inputTextHash, outputHash, generationDurationMs, generatedAt,
                    usedStudentText/Images/CourseMaterial/Rubric/Cefr)
listRule/viewRule: "@request.auth.id != '' && owner = @request.auth.id"
create/update/delete rules: null            // server-only
unique index: (attempt)
```

### B3. Routes

| Route | Method | Purpose | Guard |
|---|---|---|---|
| `/api/scheduled-evaluation-draft` | POST | queue one activity's drafts, or re-run with `force` | `authenticateUser`, `role==='faculty'`, class owner, phase `closed`/`reviewed` |
| `/api/scheduled-evaluation-review` | POST | save marks + criterion scores to `scheduled_assessments.annotations` (delegates to PocketBase action, no second source of truth) | same + attempt belongs to class |
| existing `saveAssessment` | — | unchanged, plus `annotations` | unchanged |

Queue rules:

- one in-flight per `(attempt)` via a lock key, as `queueLocks` does today
- per-request cap **25 attempts**, per-class daily cap **300** model calls
- concurrency **2**; the UI shows `x/y draf selesai` and can stop
- every call passes `enforceAiAccess({role:'lecturer', capability:'provide_feedback', weight: 3, assignmentId: activity.id, idempotencyKey})` and `commitUsage` on success
- provider surface: `evaluation` (existing `AI_SURFACES` entry, `requires: ['vision','json']`) via `resolveModel(ownerId,'evaluation')`, honouring `ai_model_prefs`

### B4. UI

In the writing row editor, a **Draf AI** panel:

- `Siapkan draf AI` (activity scope) with a cost line: `34 kiriman · ±1–2 menit · memakai kuota AI`
- states: *belum diminta* / *menyiapkan (12/34)* / *siap* / *gagal, alasan terlihat*
- when an AI draft exists: recommendation score, rubric breakdown, summary,
  findings list. Approve → mark enters the script and the mark panel; reject →
  stored as `rejected`, never published
- a permanent label **"Saran AI — bukan nilai"** and a one-line provenance strip
  (model, prompt version, material context used y/n), matching the assignment workspace
- lecturer's own score stays in the existing field, visibly separate from the
  recommendation, with `disesuaikan dosen` shown once manually changed

### B5. Publish

`publishAssessment` composes feedback from approved marks when the lecturer
clicks **Susun umpan balik dari mark**, using the same `composeFeedback` shape:

```
Saran perbaikan:
- Perlu perbaikan: <note> Pada teks: “<quote>”.
- Kesalahan berarti: ...
<lecturer note>
Dinilai dan dipublikasikan oleh dosen pengampu.
```

The student sees only the published snapshot (`published` JSON on
`scheduled_assessments`), never `annotations`, `findings`, or the AI row.

---

## 5. Phases

| Phase | Work | Days | Exit criteria |
|---|---|---|---|
| P0 | Verdict UI (previous plan W1–W2) | 3 | wrong/correct/manual visible; list <700 px on the live 15-item sheet |
| P1 | `annotations` field + hook validation + `AnnotatedText` extraction | 2 | mark saved, re-quoted, rejected; assignment view unchanged (same renderer, tests green) |
| P2 | Writing row editor (script + marks + rubric + feedback compose) | 2.5 | one reference-mode activity reviewable end-to-end without leaving the row |
| P3 | `evaluation-core.server.ts` extraction, assignment channel still passing its tests | 2 | every existing `ai_evaluations` test passes unchanged; prompt text byte-identical |
| P4 | `scheduled_evaluation_drafts` + adapter + draft route + queue caps + AI access gate | 3 | 34/34 drafts for one activity, `insufficient` recorded honestly when no rubric exists, cap enforced, denial message surfaced |
| P5 | AI panel UI + provenance + approve/reject | 2 | approved marks appear in script; rejected never published |
| P6 | Publish composition + student-side verification | 1 | student sees published feedback only; no AI field leaks (assert in render test) |
| P7 | Verification pass | 1.5 | see §7 |

Total ≈ 17 person-days, shippable in three PRs: P0 · P1–P2 · P3–P7.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Loosening `ai_evaluations` breaks production research data | Do not touch it. New collection; core extracted behind a sink interface |
| Model cost explosion (273 calls) | Opt-in per activity, cap 25/request + 300/class/day, concurrency 2, visible progress and abort |
| Prompt drift between channels | P3 exit criterion: prompt text byte-identical, shared constant compared in a test |
| AI quote not found in text | Reuse `resolveAnchor`; invalid anchors stored with `anchorValid:false`, never counted, never published |
| Lecturer mistakes recommendation for the grade | Separate fields, permanent label, `disesuaikan dosen` badge on manual change, publish requires explicit confirmation |
| Student sees private drafts | New collection is `owner`-only; render test asserts no AI keys in the student state payload (already mirrors `delete a.score`/answerKey stripping in `scheduled-classes-service.js`) |
| Rubric absent for a writing activity | `insufficient` result with reason; never invent criteria |
| Double budget spend on re-runs | `force` requires an explicit confirm; each run is a new usage event |

**Rollback:** migration reversal drops the new collection and the two new
columns (data loss limited to marks drafted after release); routes and UI revert
with the code. Existing grading and publishing are untouched.

---

## 7. Verification gates

1. `npm run typecheck`, `npm run lint`, `npx vitest run tests/session-review-verdict.test.ts tests/scheduled-review-workspace.test.ts tests/ai-evaluation*.test.ts` green.
2. Anchor parity: a mark created in the scheduled workspace resolves to the same
   `start/end` as `AnswerScript` for the same text.
3. Honest queue: forced provider failure records `status:'failed'` + reason; the
   activity still grades manually.
4. Cost guard: request with 30 attempts queues 25 and reports the remainder.
5. Privacy: student state payload for the same session contains no
   `findings`, `recommendedScore`, `annotations`, or mark text (assert on the
   live response, not just fixtures).
6. Live pass on session `n0239h77wykwein`, activity *Zusatz · Eine E-Mail
   schreiben (c)* (1 reference item, 34 submissions): mark two students, request
   AI for the activity, approve 3 marks, publish one, verify the student view.
7. Both themes, widths 390 / 768 / 1024 / 1432; no new contrast pair under 4.5:1.

---

## 8. Out of scope

- Backfilling `enforceAiAccess` into the legacy `/api/evaluation-draft` path
  (found during this audit; separate ticket, affects live grading behaviour).
- Bulk AI drafts for the whole class in one click.
- Speaking/audio activities in scheduled classes (no transcript pipeline there).
- Cross-class analytics of AI marks.
- Auto-publishing AI-composed feedback without lecturer confirmation.
