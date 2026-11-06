# Builder implementation backlog

Updated 6 November 2026. This is a status ledger for the original builder scope. “Code evidence” describes repository behavior; it is not runtime or production proof. No live-record migration is part of this scope.

## Done

| Scope | Code evidence | Test evidence | Live evidence |
|---|---|---|---|
| Draft authoring, save/recovery/conflict handling, ordering, private keys, and shared preview/student renderer | `apps/web/src/lib/builder-document.ts`, `builder-capability.ts`, `builder-layout.ts`; `builder-workspace.tsx`; `apps/pocketbase/pb_hooks/builder-domain.js`, `builder-service.js` | `builder-document.test.ts`, `builder-preview.test.ts`, capability and layout tests; existing CI integration script | No runtime verification in this task. Existing published lessons and records were not migrated. |
| Sections/containers, unequal columns, flow direction, alignment, wrapping, per-side spacing, solid/gradient backgrounds, protected image backgrounds | `builder-layout.ts`, `builder-layout-view.tsx`, `builder-group-background-controls.tsx`, responsive styles, PocketBase hooks | `builder-layout.test.ts`, responsive layout, appearance, and image-background tests | Prior rollout work exists; this task did not inspect production. |

## Partial

| Scope | Present | Remaining |
|---|---|---|
| Rich text | Inline bold/italic marks and safe inline links are represented on existing text runs, normalized by the PocketBase validator, editable from a selection toolbar on instruction/acknowledgement textareas and canvas/sidebar fields, and rendered as React emphasis and anchors in the builder and shared preview/student instruction and acknowledgement output. This task adds H2-H4, flat bullet/number list items, selection conversion and paragraph reversion, server level/type validation, and semantic shared rendering. Canvas links cannot navigate while authoring. | 39 focused tests pass across `builder-document.test.ts`, `builder-richtext-render.test.ts`, and `builder-capability.test.ts`, including legacy shape, selection/reversion, edit-after-format, inline retention, semantic output, server bounds and invalid structures, field scoping, and fallback protection. TypeScript, scoped ESLint, PocketBase hook syntax, and `git diff --check` pass. | No runtime verification in this task. |
| Backgrounds and media | Theme backgrounds and protected image backgrounds are represented; block types include image/audio/video/reference. | Responsive background authoring; media crop/focal point/caption/transcripts/playback and upload behavior. |
| Library and tools | Element library supports append/insert and desktop drag. AI and book-import results now share a reviewed proposal surface, shared student-renderer preview, APPEND/INSERT/confirmed REPLACE, stable activity/group/block plus draft snapshot checks, identity remapping, document/layout capacity checks, and one workspace `change()` application. Server-generated AI and upload selection context reloads the owned draft, validates activity/group/block ownership, bounds the text, and extracts student-visible content only. Book OCR keeps its existing import endpoint and uses the shared proposal/apply path after import. | 19 focused tests pass across `builder-authoring.test.ts` and `scheduled-class-draft-server.test.ts`, including remapped insertion, exact activity-content replacement, private-key pruning/exclusion, foreign selected-block rejection, oversized context rejection, group scoping, stale target rejection, and capacity failure atomicity. Provider roundtrip, upload-worker flow, async stale-selection interaction, browser interaction, and production remain unverified. |
| Reusable nested templates | Local implementation extends existing `builder_saved_items` templates with an additive `scope` payload. Selected SECTION/CONTAINER subtrees retain nested layout, responsive/appearance/background fields and referenced blocks; only their questions and private keys are retained. `savedGet` enforces owner, context, and protected-media authorization. The browser offers named saves, scope labels, shared layout renderer preview, and copy-only insertion with remapped identities and one `change()` mutation. Activity templates keep their prior path. | `builder-document.test.ts` and `builder-image-background-backend.test.ts`: 31 passed, including subtree extraction, private-key/question filtering, identity remapping, nested insertion/removal references, depth/capacity atomicity, and owner/media access checks. TypeScript, changed-file ESLint, both PocketBase hook syntax checks, and `git diff --check` passed. Old-template read/apply fixtures and workspace undo interaction remain unverified. | No production/runtime verification in this task. |

## Missing

| Scope | Evidence / status |
|---|---|
| Rich text follow-up | Headings/lists are flat only (nesting unsupported); controls appear in the shared instruction/acknowledgement editor. Contextual AI, responsive backgrounds, media controls, drag locks, broader accessibility validation, rich editing for other text fields, and browser IME/selection behavior still need separate bounded work. Do not store arbitrary HTML or render through raw HTML. Preserve plain text compatibility and protect assessment IDs/private keys. |
| Nested template validation | Subtree extraction/insertion pure helper tests pass. Backend owner/media authorization, old-template read/apply fixtures, and workspace undo integration still need focused coverage. |
| Theme controls | No complete theme contrast controls, theme preset registry, or safe reset workflow identified in the builder appearance surface. |
| Registry, commands, and compatibility | Extend existing validated capability and command boundaries for new authoring types; explicitly test older documents and published lessons remain readable without destructive normalization. |
| Accessibility, touch, and performance | No end-to-end acceptance evidence for keyboard and screen reader flows, touch authoring, or large-document performance. |
| Publishing and staged acceptance | Authoring capability and existing rollout protection are present. Full staged acceptance for rich text, nested templates, media, recovery, and publishing remains outstanding. Do not infer publish readiness from authoring tests. |

## Unverified

- Physical keyboard IME composition behavior; editor composition handlers are present, but browser-level IME parity is explicitly unverified. Nested lists and full semantic authoring parity are also outstanding.
- Runtime behavior of any backlog item in production; no browser, SSH, deployment, or live health check was run for this task.
- Touch interaction, assistive technology behavior, and performance under large authored documents.
- Release-time compatibility of future schema additions with all old published lesson variants; focused fixtures and staged acceptance are required before enabling them.

## Checkpoint

This task starts from deployed origin/main PR102 base `ca25b1a6505d7b6d6da5d37f6e133cb3fe418c80`, which includes inline bold/italic, safe links, H2-H4, and flat bullet/number lists in the existing instruction/acknowledgement editor, server validation, and shared semantic rendering. Nested lists and real browser IME parity remain outstanding; semantic core/full rich authoring parity is not complete. This task adds scoped nested section/container template code without a collection migration. Focused runtime checks and backend authorization integration remain unverified. No legacy course migration or gradebook integration is included.
