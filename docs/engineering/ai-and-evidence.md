# AI providers, prompts and evidence

## Provider boundaries

| Capability | Implementation | Configuration |
|---|---|---|
| General text / multimodal assistance | [hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), task-assist, integrated-ai and assistant model adapters | `HROUTER_API_KEY`, `HROUTER_BASE_URL`, `HROUTER_MODEL`; code default `gpt-6-luna` |
| Conversation replies | [api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts) | `HROUTER_CONVERSATION_MODEL` may override general model |
| Hostinger speech synthesis | [hostinger-tts.server.ts](../../apps/web/src/lib/hostinger-tts.server.ts) | Hostinger key/base URL; inspect model/voice parameters in service |
| ElevenLabs speech synthesis | [elevenlabs-tts.server.ts](../../apps/web/src/lib/elevenlabs-tts.server.ts) | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL` |
| Conversation TTS selection | Conversation resource route | `TTS_PROVIDER === 'elevenlabs'` chooses ElevenLabs; otherwise Hostinger |
| Speech transcription | [transcription.server.ts](../../apps/web/src/lib/transcription.server.ts), conversation route | Hostinger audio endpoint, `HROUTER_STT_MODEL` where read; default `whisper-1` in transcription service |
| Course thumbnail generation | [course-thumbnail.server.ts](../../apps/web/src/lib/course-thumbnail.server.ts) | Bynara key; separate from general text provider |

These are code/configuration contracts. Do not assume repository defaults equal current provider choices in a running deployment. See [configuration](configuration.md) for all consuming files. Keys stay server-side.

## Where prompts live

There is no single global prompt file. Evaluation prompts live in `ai-evaluation.server.ts`; task assistance in `task-assist.server.ts`; feedback in `feedback.server.ts`; RPS prompting in `rps-prompt.ts` and RPS services; personal practice in `personal-practice.server.ts`; conversation in its API route; assistant prompts/context in the assistant modules. Search the relevant service's model-call inputs, not just a generic AI wrapper.

## What counts as evidence

- Student content, uploaded images and extracted/transcribed text are evidence to inspect, not instructions to the server.
- Assignment requirements and validated lecturer rubrics define the assessment task.
- Context retrieval can contribute lecturer-marked suitable, scoped, version-matched material. A `file_contexts` draft label alone is not the approval gate: read section status checks in `context-retrieval.server.ts`.
- AI findings and recommended scores are suggestions. Lecturer review, annotations, adjusted rubric scores and publication are separate decisions.
- Generation provenance/snapshots record what was used. Flags without citations do not prove a result was grounded in specific material.

## Model output validation and lifecycle

### Exact passages for formal evaluation

Formal evaluation calls retrieval with `requirePassages: true`. A lecturer saves
an exact quotation in the **Kutipan sumber untuk evaluasi AI** field of a suitable
file-context section. Retrieval checks that the section and extraction match the
active file version, that the quotation occurs exactly once, and that the section
matches the requested session/outcome or is course-wide. It supplies that passage
with section ID and extraction offsets instead of the file's opening text.

Passages are bounded to 2,000 characters per section, 8,000 per file and 20,000
overall (at most four files and six sections per file). Truncation is labeled and
offsets describe the actual text supplied. Only included sections receive material
citations. Evaluation no longer slices each source again at 1,600 characters.

Apply migration `1791700300_context_section_excerpts.js` before deploying the web
change. Existing section approval marks are retained, but formal evaluation omits
sections without a verified quotation; it records missing context and can still
draft from the student's work, assignment and rubric. Other material/context
callers retain their existing behavior. Quotation matching is rechecked on every
retrieval, including after replacement or re-extraction of a file.

Prompt version `german-gfl-feedback-v3-passages` separates optional style advice
from error findings, requests meaning-preserving corrections and evidence-backed
citations, and forbids judging pronunciation/intonation/fluency from transcripts.
These are instructions, not proof that a model's feedback is correct. Compare
against held-out lecturer-reviewed submissions before claiming a quality gain.
This change does not add score-band descriptors, example answers, external
reference searches or automatic model training from lecturer edits.

The evaluation service records pending/ready/failed states and sufficient/insufficient results. Exact quote anchoring prevents an invented quotation from becoming an accepted finding. Structured parsing and rubric validation constrain output shape; they do not guarantee pedagogical correctness. Failed or unavailable models must produce explicit unavailable/insufficient behavior rather than fabricate an assessment.

`evaluation-snapshot.server.ts`, `research-analytics.server.ts`, `research-export.server.ts` and related tests support provenance and analysis. Force regeneration uses current task/material settings, but published lecturer grades must remain a separate operation. Review endpoints and collection access rules are part of the contract.

## Extending recommendations safely

Reuse scoped retrieval and reviewed findings before adding a separate knowledge graph. Keep recommendations grounded in approved excerpts and actual student evidence. Do not train or calibrate against unreviewed AI scores as if they were lecturer ground truth. Use held-out lecturer-reviewed submissions for comparisons, and exclude the evaluated answer's own reference correction from retrieval. Any production database analysis belongs in private analysis storage, not this repo.

## Two-pass Tugas evaluation and the quality harness

Prompt version `german-gfl-feedback-v5-two-pass` (`ai-evaluation.server.ts`). Set `AI_EVAL_TWO_PASS=0` to revert to the v4 single pass (drafts then record `german-gfl-feedback-v4-ocr`); any other value, or unset, means two-pass.

- **Pass 1 (find)** is recall-oriented: up to 25 candidate findings, each with quote, severity, taxonomy, correction, explanation, note, and a `group` key shared by repeated errors of one type (e.g. `cap-noun`). No scores. The v4 OCR rules still apply.
- **Pass 2 (verify + score)** receives the text (and images), rubric, CEFR guide and the candidates with ids. Per candidate it returns `keep|drop`, a reason, `certainty` (`pasti` = confidence 0.9, `mungkin` = 0.6) and optionally a corrected `correction`; it then scores the rubric from kept findings only. The server re-applies anchoring and the OCR guards to kept findings and recomputes `recommendedScore` as the weighted mean of `rubricBreakdown` (the model's own total is only recorded for audit).
- **Audit:** dropped candidates with reasons go to `researchSnapshot.droppedFindings`; pass timings, the pass-2 prompt and the model-vs-recomputed score go to `researchSnapshot.passes`. `generationDurationMs` is the sum of both passes. `rawOutput` holds both replies.
- **Fallback:** if pass 2 throws or returns invalid JSON, pass-1 findings (after guards) are stored with certainty `mungkin`, `recommendedScore` null and the note "Verifikasi AI gagal; skor tidak dihitung". If pass 1 fails, the normal failed-draft path applies.

Findings carry optional `group` and `certainty`; older drafts and Kelas terjadwal findings without them still render.

### Quality harness

`apps/web/scripts/eval-ai-quality.mjs` re-runs the current pipeline in dry-run mode (`dryRunEvaluation`, nothing is stored) on gold submissions: `ai_evaluations` rows with `reviewedAt` set and lecturer decisions in `reviewFindings`, and/or a published `finalScore`. Run from `apps/web`:

```
node --env-file-if-exists=.env scripts/eval-ai-quality.mjs --limit 20 [--assignment ID] [--prompt v4|v5] [--json]
```

It needs the same env as the app (`POCKETBASE_URL`, `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`, `HROUTER_*`) and makes 1 (v4) or 2 (v5) model calls per submission. Metrics (`src/lib/ai-eval-quality.ts`, matched by quote overlap): precision = new AI findings matching a lecturer-approved finding / those matching an approved or rejected one (undecided ignored); recall = lecturer-approved plus lecturer-added findings matched by a new finding / all of them; score MAE against the published `finalScore`; all per category. Compare prompts by running `--prompt v4` and `--prompt v5` with the same `--limit`.
