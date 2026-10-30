# LARAS engineering handbook

Start here if you are maintaining LARAS or reviewing its code. This handbook explains what each layer owns and how a user action reaches persistent data. It documents the checked-in implementation, not a promise that every feature has production usage.

Reviewed against source commit `a909540` on 12 October 2026. Configuration defaults are described below; actual deployment environment values can override them. No credentials or production student records are included.

## Read in this order

1. [Architecture](architecture.md): runtime, authentication, directories and naming.
2. [Feature guide](features.md): where to edit a feature and its data flow.
3. [Data model](data-model.md): collection groups, ownership and migration history.
4. [AI and evidence](ai-and-evidence.md): providers, prompts, grounding and review.
5. [Local development and operations](operations.md): setup, checks, deployment and rollback.
6. [Source atlas](source-atlas.md): every first-party source module, its imports and database references.
7. [Routes](routes.md): all registered URL patterns and handler files.
8. [Configuration](configuration.md): environment-variable reference and consuming files.

See also [production/correction workflow](revision-workflow.md) for historical paper-feedback provenance and the one-time importer.

## A practical example

To investigate a wrong score, open the assignment route, follow it to `evaluation-workspace.tsx`, then inspect `api.evaluation-draft.ts`, `ai-evaluation.server.ts`, and `evaluation-rubric.ts`. For changes saved by the lecturer, follow `api.evaluation-review.ts` and `api.evaluation-publish.ts`. The AI draft and published submission grade are separate records; confusing them leads to incorrect analytics.

Use the source atlas to find which files import the module you are changing. Search the collection name in the data-model migration index and source atlas to find who reads or writes it. The indexes are navigational aids: dynamic imports, computed collection names and nested JSON fields still require reading the implementation.

## Maintaining these docs

After changing a route, collection, service or environment setting, update its narrative guide and run `python3 docs/engineering/generate_indexes.py` from the repository root. Commit regenerated indexes with the change. Do not copy `.env`, database exports, uploaded student work, or provider keys into documentation.

Existing specialist notes: [agent workflows](../agent-workflows.md) and [research rater integration](../P1-RATER-INTEGRATION.md).
