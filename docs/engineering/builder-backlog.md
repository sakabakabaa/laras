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
| Library and tools | Element library supports append/insert and desktop drag; AI proposal UI has explicit add-to-draft behavior. | Full copy-style controls; touch drag; selectable scroll/lock behaviors; contextual AI/upload proposals supporting validated append/insert/replace with one undo action. |

## Missing

| Scope | Evidence / status |
|---|---|
| Rich text follow-up | Headings/lists are flat only (nesting unsupported); controls appear in the shared instruction/acknowledgement editor. Templates, contextual AI, responsive backgrounds, media controls, drag locks, broader accessibility validation, rich editing for other text fields, and browser IME/selection behavior still need separate bounded work. Do not store arbitrary HTML or render through raw HTML. Preserve plain text compatibility and protect assessment IDs/private keys. |
| Nested section/container templates | Nested sections and containers exist; reusable nested templates/library workflow is not present in the current authoring surface. |
| Theme controls | No complete theme contrast controls or safe reset workflow identified in the builder appearance surface. |
| Registry, commands, and compatibility | Extend existing validated capability and command boundaries for new authoring types; explicitly test older documents and published lessons remain readable without destructive normalization. |
| Accessibility, touch, and performance | No end-to-end acceptance evidence for keyboard and screen reader flows, touch authoring, or large-document performance. |
| Publishing and staged acceptance | Authoring capability and existing rollout protection are present. Full staged acceptance for rich text, nested templates, media, recovery, and publishing remains outstanding. Do not infer publish readiness from authoring tests. |

## Unverified

- Physical keyboard IME composition behavior; editor composition handlers are present, but browser-level IME parity is explicitly unverified.
- Runtime behavior of any backlog item in production; no browser, SSH, deployment, or live health check was run for this task.
- Touch interaction, assistive technology behavior, and performance under large authored documents.
- Release-time compatibility of future schema additions with all old published lesson variants; focused fixtures and staged acceptance are required before enabling them.

## Checkpoint

This task starts from live origin/main PR101 base `a11c44adceaedfaa59074f6fe5a413fd09ed5c33`, which includes inline marks and safe links. This bounded slice adds H2-H4 and flat bullet/number lists in the existing instruction/acknowledgement editor, server validation, and shared semantic rendering; nested lists and migrations are out of scope. Original rich authoring scope remains incomplete. Physical keyboard/browser runtime and IME parity remain unverified. No legacy course migration or gradebook integration is included.
