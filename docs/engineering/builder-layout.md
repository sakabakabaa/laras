# Builder layout sections and containers

The shared Kelas/Tugas builder keeps `document.schemaVersion = 1` and `activity.blocks` as the flat, authoritative content list. Each activity may also carry an optional `layout` with its own `schemaVersion: 1`:

```ts
activity.layout = {
  schemaVersion: 1,
  nodes: [
    { kind: 'block', blockId },
    {
      kind: 'section' | 'container',
      id,
      title,
      columns: 1 | 2 | 3,
      gap: 'none' | 'sm' | 'md' | 'lg',
      padding: 'none' | 'sm' | 'md',
      surface: 'none' | 'muted' | 'accent',
      children: [...]
    }
  ]
}
```

Layout nodes reference block IDs; they do not own questions, keys, responses or grading. A document without `layout` is rendered in the original flat order, so published versions, imports, templates and existing drafts need no migration.

## Rendering contract

`resolveActivityLayout` is the single ordering source for authoring, preview and student runtime. It walks the layout tree, drops unknown or duplicate references, and appends every block that is not placed in the tree as a trailing item. Consequently every block renders exactly once, and new blocks created by imports, templates or older edit paths cannot disappear.

The shared `BuilderLayoutView` wraps sections/containers. Columns are 1–3 on wide screens and stack below 900px. Surfaces use the existing theme tokens. No arbitrary CSS, HTML or URLs are accepted; per-device settings cannot hide required content.

Group names are editor navigation labels, not student-facing headings. The mobile preview also stacks columns when the preview frame is narrow on a desktop browser.

## Editing rules

- Add a section or container, optionally inside the selected group, bounded to 3 nested group levels and 40 groups.
- Rename a group and set columns, gap, padding and surface in the contextual Isi/Tampilan/Lanjutan inspector.
- Blocks can be added directly to the selected container from the element picker.
- Insertion targets before blocks and at the end of each group support moving blocks within and across activities, including into empty containers. Keyboard move/reparent actions provide an alternative to dragging.
- Moving or reparenting groups rejects cycles and depth overflow. Removing a group flattens its children into the parent; child blocks and questions are never deleted.
- Removing a block removes its layout reference. Cross-activity moves remove the source reference and append the block to the target activity.
- Activity duplication and document copying remap both block IDs and layout block references, so copied questions keep fresh identities and private keys.

## Server validation

`apps/pocketbase/pb_hooks/builder-domain.js` validates layout after normalizing blocks. It rejects unknown or duplicate block references, duplicate node IDs, invalid node kinds, non-integer/out-of-range columns, unsupported gap/padding/surface values, more than 40 groups, more than 600 nodes, and group depth over 3. Only the fields listed above survive normalization.

## Compatibility and deferred work

Layout is additive to the existing `schemaVersion: 1` envelope, so legacy flat documents round-trip unchanged. Published snapshots store the normalized document (including layout) and private keys separately; student runtime receives the layout but never the private keys. Phase 4+ work deliberately deferred here includes responsive visibility controls, reusable container presets, margins/borders/shadows, per-element grid spans, and an element-level sidebar.
