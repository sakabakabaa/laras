# Builder group flow, alignment, and wrapping

Sections and containers keep their existing grid layout unless `direction` is explicitly set to `row` or `column`. Grid column counts and unequal column ratios apply only to grid groups. Flex groups use normal document flow and retain DOM, keyboard, and reading order; reverse visual ordering and fixed heights are not supported.

Groups may set cross-axis alignment (`start`, `center`, `end`, `stretch`), main-axis distribution (`start`, `center`, `end`, `between`), and flex wrapping. These bounded fields can be overridden independently for tablet and phone; an absent override inherits the group value. Row flow stacks vertically on phones unless a phone direction override selects another flow. Flex items can shrink and wrap without imposing intrinsic minimum widths.

The PocketBase normalizer allowlists every value and rejects unknown fields. The shared renderer applies the same saved layout to builder, preview, and student views. Existing width, grid ratios, spacing, and responsive defaults remain unchanged when these fields are absent. Backgrounds, media layout, and broader style controls remain future work.
