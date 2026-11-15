---
title: "LARAS engineering handbook"
description: "LARAS engineering handbook — LARAS engineering handbook"
sidebar_position: 0
---
# LARAS engineering handbook

Start here if you are maintaining LARAS or reviewing its code. This handbook explains what each layer owns and how a user action reaches persistent data. It documents the checked-in implementation, not a promise that every feature has production usage.

Reviewed against source commit `a909540` on 12 October 2026. Configuration defaults are described below; actual deployment environment values can override them. No credentials or production student records are included.

## Read in this order

1. [Architecture](/docs/engineering/architecture): runtime, authentication, directories and naming.
2. [Feature guide](/docs/engineering/features): where to edit a feature and its data flow.
3. [Builder layout](/docs/engineering/builder-layout): sections, containers and compatibility with flat activities.
4. [Data model](/docs/engineering/data-model): collection groups, ownership and migration history.
5. [AI and evidence](/docs/engineering/ai-and-evidence): providers, prompts, grounding and review.
6. [Local development and operations](/docs/engineering/operations): setup, checks, deployment and rollback.
7. Source atlas (`source-atlas.md`): every first-party source module, its imports and database references.
8. [Routes](/docs/engineering/routes): all registered URL patterns and handler files.
9. [Configuration](/docs/engineering/configuration): environment-variable reference and consuming files.

See also production/correction workflow (`revision-workflow.md`) for historical paper-feedback provenance and the one-time importer.

## A practical example

To investigate a wrong score, open the assignment route, follow it to `evaluation-workspace.tsx`, then inspect `api.evaluation-draft.ts`, `ai-evaluation.server.ts`, and `evaluation-rubric.ts`. For changes saved by the lecturer, follow `api.evaluation-review.ts` and `api.evaluation-publish.ts`. The AI draft and published submission grade are separate records; confusing them leads to incorrect analytics.

Use the source atlas to find which files import the module you are changing. Search the collection name in the data-model migration index and source atlas to find who reads or writes it. The indexes are navigational aids: dynamic imports, computed collection names and nested JSON fields still require reading the implementation.

## Maintaining these docs

After changing a route, collection, service or environment setting, update its narrative guide and run `python3 docs/engineering/generate_indexes.py` from the repository root. Commit regenerated indexes with the change. Do not copy `.env`, database exports, uploaded student work, or provider keys into documentation.

Existing specialist notes: [agent workflows](/docs/engineering/agent-workflows) and [research rater integration](/docs/engineering/p1-research-rater).
