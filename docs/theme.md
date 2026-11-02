# Theme ownership

`apps/web/src/styles/theme.css` owns the shared light and dark theme tokens, including the `--r-*` scale, legacy and Tailwind aliases, the `--p-*` workspace palette, and the red gradient shell token. The root stylesheet list loads it after the existing legacy styles so the established token cascade remains predictable.

Feature stylesheets should own feature layout and component rules. New feature CSS should not define another global token family or theme palette. Shared surfaces and controls now live in `shared-components.css`; it uses the root semantic tokens and is loaded before `redesign-v1.css` so later touch, typography, and print refinements retain their cascade.

The migration remains incremental. `index.css` base tokens and the many legacy component declarations remain in place. Compatibility aliases remain available for existing consumers; unrelated feature sections have not moved.

## Editing the theme

- Change shared colors, typography, radii, shadows, and focus rings in `theme.css`, not in a late override file.
- Keep light values under `:root` and dark values under `:root.dark`. Workspace-specific palette values and the red gradient use `.ld-layout` and `:root.dark .ld-layout` so public routes do not inherit the workspace treatment.
- Existing `--r-*` tokens are the shared scale. `--p-*` workspace colors retain their current values during migration; they are not yet identical to the shared scale. Responsive sidebar dimensions remain in the shell stylesheet because they are layout state, not theme colors.
- The existing `useTheme` hook, saved preference, and pre-paint script remain unchanged.
- Portalled dialogs and search use the root theme tokens; do not depend on inheriting workspace-only variables outside the shell.

## Current boundaries and next steps

`global-search-palette.css` now uses root `--r-*` colors, surface, border, radius, and focus tokens. It is portaled to `body`, so it must not use workspace-only `--p-*` tokens. Its category and result states use the red brand instead of blue. The obsolete search blocks in `index.css` and `dark-overrides.css` have been removed, not left to compete with the component.

Assistant composer, textarea, and composer-bar styling is shared across full-page, greeting, and drawer contexts in `shared-components.css`. Only their size/layout differences remain contextual. The old light/dark composer blocks and the generic premium form overrides have been removed; the shared low-specificity defaults provide standalone field styling while composite inputs stay borderless and their outer wrappers show focus.

Primary buttons, including password setup actions, use `--r-action`, `--r-action-hover`, and `--r-on-action` from the theme. Disabled buttons use the shared surface/text ramp rather than a red background with muted text. The old generic primary-button rules in the base and premium stylesheets no longer compete with these states.

Remaining legacy and feature-specific hardcoded colors are future migration work. Keep distinct semantic states (success, warning, error) rather than turning every color red. Do not remove `dark-overrides.css` wholesale until its remaining consumers have been migrated.

`theme-ownership.test.ts` checks palette ownership, aliases, and stylesheet order. `shared-components.test.ts` protects extracted ownership and touch/print cascade ordering. `student-shell-theme.test.ts` protects the shared light/dark red gradients. The input-cascade and search-layout tests protect the previous search/chat fixes.
