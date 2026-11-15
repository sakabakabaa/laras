---
slug: /
title: LARAS Documentation
description: How the LARAS learning platform works — courses, assignments, submissions, and how AI feedback is generated, grounded, scored, and reviewed.
sidebar_position: 0
---

# LARAS Documentation

LARAS is a learning-management platform for language courses used by lecturers and students in Indonesia. It covers course planning, assignments and assessment, student practice, and AI assistance. Its most distinctive feature is **AI-assisted feedback on student work**: the platform drafts findings and suggested rubric scores for every submission, always grounded in the student's actual work and lecturer-approved course material — and **a lecturer reviews and publishes every result before a student ever sees it**.

These docs explain how the platform works and, in particular, how the AI feedback pipeline operates end to end.

## Where to start

<div className="cards">

- **[How the platform works](/docs/how-it-works/overview)** — courses, sessions, assignments, submissions, practice, and the people involved.
- **[How AI feedback is provided](/docs/how-it-works/ai-feedback)** — the full pipeline: what the model receives, how it finds and verifies errors, how scores are computed, and why lecturers always have the final say.
- **[Grounding and evidence](/docs/how-it-works/ai-feedback/grounding-and-evidence)** — why AI feedback is anchored to exact quotations from the student's work and lecturer-approved material.
- **[Human review](/docs/how-it-works/ai-feedback/human-review)** — how drafts become published grades, and why the AI never publishes by itself.

</div>

## Docs sections

| Section | Audience | Contents |
|---|---|---|
| **How it works** | Lecturers, students, stakeholders | Plain-language guides to the platform and the AI feedback pipeline |
| **Engineering handbook** | Developers, maintainers | Architecture, data model, AI internals, operations, configuration |

The engineering handbook is maintained in the repository under `docs/engineering/` and published here automatically. The handbook describes the checked-in implementation, not assumptions about any particular deployment.

## Availability

The documentation is available in **English** and **Bahasa Indonesia** — switch using the language menu in the top-right corner. The engineering handbook is currently published in English only.
