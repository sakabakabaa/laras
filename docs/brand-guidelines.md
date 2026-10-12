# LARAS Brand Guidelines

Single source of truth for the visual system shared by the marketing pages
(`.lp-*`, `.hm-*`) and the application shell (`.ld-*`, `.sd-*`). Keep this file
and `apps/web/src/index.css` / `apps/web/src/styles/landing.css` in sync.

## Typography

- **Family:** Plus Jakarta Sans everywhere. No Inter, Roboto, Geist, or Satoshi.
  - `--body: 'Plus Jakarta Sans'` (app + landing).
  - Legacy `--display: 'Barlow Condensed'` survives only on a few condensed
    numeric display elements inside the app; new work uses Jakarta.
- Display headings use tight tracking (`letter-spacing: -.02em … -.04em`).
- Numeric/data columns use tabular numerals.

## Color

### The two reds (consistency rule)

LARAS uses exactly **two** reds, and they are not interchangeable:

| Token         | Hex       | Role                                                              |
|---------------|-----------|-------------------------------------------------------------------|
| `--cta`       | `#B3261E` | **Conversion red.** Filled primary buttons / CTAs, coral fills.   |
| `--cta-hover` | `#7F1D16` | Hover/pressed state of a `--cta` surface (deepens on interaction). |
| `--red`       | `#7F1D16` | **Wine accent.** Text-on-light accents, links, rail/sidebar active, dots, checks, badges, borders, focus ring. |

Rule of thumb:

- If it is a **button the user clicks to move forward**, it is `--cta` (#B3261E),
  deepening to `#7F1D16` on hover.
- If it is **ink, an accent, an indicator, or chrome**, it is `--red` (#7F1D16).

This removes the pre-audit seam where marketing CTAs were `#B3261E` while the app
shell rendered the same actions in `#7F1D16`, so the product read as two apps at
the moment of login. The landing tokens `--lp-red` (#B3261E) and `--lp-red-deep`
(#7F1D16) are the marketing-side mirror of `--cta` / `--cta-hover`.

### Neutrals & text contrast (WCAG AA)

On the warm paper canvas (`--paper: #F8F9FB`) and white surfaces:

| Token          | Hex       | Min use                                                        |
|----------------|-----------|----------------------------------------------------------------|
| `--ink`        | `#172033` | Primary text, display.                                         |
| `--neutral-700`| `#475467` | Strong secondary text.                                         |
| `--soft` / `--neutral-600` | `#667085` | **Lightest tier allowed for any body-size text or placeholder.** Passes AA (~4.9:1 on paper). |
| `--neutral-500`| `#98A2B3` | **Decorative only** — large display numerals, icon glyphs, non-essential ornament. Never body text. |
| `--neutral-400`| `#B8C5CC` | **Decorative only** — hairline/ornamental. Never text that must be read. |

Contrast rule: **any text at body size (and all placeholders) must be `#667085`
or darker.** `#98A2B3` and `#B8C5CC` are reserved for large display-only text and
icon fills. The light theme in `index.css` has been normalized to this rule; the
`:root.dark` block keeps its own (lighter) tiers because the contrast math inverts
on dark surfaces.

### Supporting palette

Semantic ramps (`--success-*`, `--warning-*`, `--error-*`, `--info-*`, `--ai-*`)
and the `--neutral-*` scale are defined in `index.css :root`. The AI/assistant
surfaces use the violet `--ai-*` ramp; keep that distinct from the red brand.

## Surfaces, radius, elevation

- Canvas: warm paper `#F8F9FB`. **No** AI-gradient purple/blue washes, no random
  dark sections in the light product. Dark surfaces are intentional and limited
  (lecturer marketing band, final CTA).
- Radius: 8 / 12 / 18 / 24 px (`--lp-r-sm … --lp-r-xl`); app cards 12–18px.
- Shadows: soft, tinted (`--lp-shadow-1..3`), never hard black.

## Motion

- Durations 150–300ms; easing `--lp-ease-out: cubic-bezier(.16,1,.3,1)`.
- Animate `transform` / `opacity` only. No layout-thrash or scroll-jacking.
- Feedback: primary buttons press with `:active { transform: scale(.98) }`;
  cards lift ~`translateY(-3px)` on hover; progress rings/counts animate on reveal.
- Everything is guarded by `@media (prefers-reduced-motion: reduce)`.

## Do-not-change (passed audit)

- Jakarta-only typography.
- Warm-paper background discipline (no gradient washes / stray dark sections).
- Login page composition (dual-role segmented control, NIM hint placeholder,
  honest "Segera hadir" OAuth buttons).

## Keeping tokens in sync

Treat this document as the spec. When a value here changes, update:

1. `apps/web/src/index.css` `:root` (app + home `hm-*`).
2. `apps/web/src/styles/landing.css` `:root` (`--lp-*` marketing mirror).

(There is no automated `sync-brand-to-tokens` script in this repo yet; the audit
referenced the generic `brand` skill workflow. Until one exists, sync by hand and
keep the two `:root` blocks aligned to the table above.)
