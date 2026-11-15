---
title: Grounding and evidence
description: How LARAS grounds AI feedback — exact-passage retrieval from lecturer-approved material, quotation anchoring, context bounds, and prompt versions.
sidebar_position: 2
---

# Grounding and evidence

AI feedback in LARAS is designed to be **grounded**: anchored to the student's actual work and, where course material is relevant, to excerpts a lecturer has explicitly approved. This page explains the mechanisms.

## Why grounding matters

An AI model can produce plausible-sounding but wrong feedback. LARAS mitigates this structurally rather than trusting the model:

- Findings must **quote the student's work** — the quotation is re-checked server-side on every evaluation ("quote anchoring"), so an invented quotation cannot become an accepted finding.
- Context material must come from **lecturer-reviewed sections**. A draft label alone is not the approval gate; section status is checked at retrieval time.
- Everything used is recorded in the evaluation's **provenance snapshot**, so any result can be traced to its inputs.

## Exact-passage retrieval

For formal evaluation, retrieval requires **exact passages** (`requirePassages: true`). The workflow is:

1. The lecturer saves an exact quotation in the **"Kutipan sumber untuk evaluasi AI"** (source quotation for AI evaluation) field of a suitable file-context section.
2. At evaluation time, retrieval checks that the section and its extraction **match the active file version**, and that the quotation **occurs exactly once** in the extracted text.
3. The passage is supplied to the model with its section identity — not the file's opening text.

Quotation matching is **rechecked on every retrieval**, including after a file is replaced or re-extracted, so grounding never silently refers to stale content.

## Context bounds

Supplied material is deliberately bounded so prompts stay focused:

| Bound | Limit |
|---|---|
| Per section | 2,000 characters |
| Per file | 8,000 characters |
| Overall | 20,000 characters |
| Files | at most 4 |
| Sections per file | at most 6 |

Truncation is **labeled** — the evaluation knows what was and was not supplied — and only sections actually included can receive material citations in findings.

If no verified quotation exists, formal evaluation records **missing context** and can still draft from the student's work, the assignment, and the rubric. It does not silently fall back to unreviewed material.

## Prompt versions

The evaluation pipeline is versioned so results remain comparable:

| Version | Name | Key idea |
|---|---|---|
| v3 | `german-gfl-feedback-v3-passages` | Separates style advice from error findings; requests meaning-preserving corrections and evidence-backed citations; forbids judging pronunciation from transcripts |
| v4 | `german-gfl-feedback-v4-ocr` | OCR-aware single-pass evaluation |
| v5 | `german-gfl-feedback-v5-two-pass` | Current default: the two-pass find → verify + score pipeline described in [How AI feedback is provided](/docs/how-it-works/ai-feedback) |

Prompt versions are recorded in every draft's snapshot. Changing a prompt does not retroactively change old drafts.

## What grounding does not claim

Grounding makes feedback *traceable*, not automatically *correct*. Structured parsing and validation constrain output shape; they do not guarantee pedagogical soundness. That is why lecturer review remains the final gate — see [Human review](/docs/how-it-works/ai-feedback/human-review).
