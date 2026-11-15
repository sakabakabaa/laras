---
title: Scoring
description: How AI-recommended scores are computed in LARAS — rubric breakdowns, weighted means, certainty levels, and quality measurement against lecturer decisions.
sidebar_position: 3
---

# Scoring

AI evaluation produces **suggested scores** — never final grades. This page explains how those suggestions are computed and how their quality is measured.

## From rubric to recommended score

1. The assignment's **validated rubric** defines criteria and weights.
2. In pass 2 of the evaluation, the model assigns per-criterion feedback and scores — but only from **kept** findings (see [How AI feedback is provided](/docs/how-it-works/ai-feedback)).
3. The platform **recomputes** the recommended score as the **weighted mean of the rubric breakdown**.
4. The model's own total score is stored **for audit only** — it never becomes the recommendation.

This keeps the number consistent with the criterion-level detail: if the rubric breakdown says 74, the recommended score says 74.

## Certainty levels

Each finding carries a certainty from pass 2:

| Certainty | Confidence | Meaning |
|---|---|---|
| `pasti` (certain) | 0.9 | Verified with high confidence |
| `mungkin` (possible) | 0.6 | Plausible but less certain |

Findings from the fallback path (when pass 2 fails) are always marked `mungkin` and carry **no score**. Older drafts created before certainty existed still render, without the badge.

## Dropped candidates are kept for audit

When pass 2 rejects a pass-1 candidate, the rejection is not discarded: the dropped candidate and its reason are stored in the evaluation's research snapshot, alongside pass timings and raw outputs. This is what makes quality analysis possible later.

## Measuring quality against lecturers

The quality harness re-runs the pipeline in **dry-run mode** (nothing is stored) on *gold submissions* — those a lecturer has fully reviewed or published — and compares:

| Metric | Question it answers |
|---|---|
| **Precision** | Of the AI's findings, how many match findings the lecturer approved? |
| **Recall** | Of the lecturer's approved and added findings, how many did the AI find? |
| **Score MAE** | How far is the recommended score from the lecturer's published score? |

Matching is done by quote overlap, per rubric category, and can be compared across prompt versions — for example running the same submissions through the v4 and v5 pipelines. The harness lives in the repository (`apps/web/scripts/eval-ai-quality.mjs`); see the [engineering handbook](/docs/engineering/ai-and-evidence) for details.

## Boundaries

- Recommended scores are **suggestions**. Lecturer review, adjusted rubric scores, and publication are separate decisions stored separately from model output.
- The AI never trains on lecturer edits automatically; quality comparisons run against held-out lecturer-reviewed submissions, not live learning loops.
