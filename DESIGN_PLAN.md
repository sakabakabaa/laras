# LARAS redesign plan — Red + Playful

**Status:** plan only. No redesign code has been implemented. This is a frontend-only plan for a GitHub feature branch/PR; production deployment is explicitly out of scope for now.
**Date:** 2026-10-21
**Reference:** the previously attached image was the wrong screenshot (a camera/recording UI). Its blue palette, timeline, and layouts are discarded. The correct visual reference is still pending; until it arrives, this plan is grounded in the existing LARAS UI audit and the decisions below.

## Decisions locked by the user

- Keep LARAS's **red brand and interactive accent**; do not switch to blue.
- Keep the student experience **playful**, including its German-learning illustrations and gamification, while making components more coherent and progress states truthful.
- **Dark theme is required**, not optional. Design and verify both themes from the token foundation onward.
- **Frontend only**: no data-model, schema, migration, PocketBase hook, auth, or backend API changes. Preserve existing URLs, API contracts, and stored data.
- Work on GitHub for now; do not deploy to production.
- Defaults I choose: keep wide desktop tables where they materially help grading/roster work; reflow them for tablet/mobile rather than shrinking them into illegibility. Keep the full ~9-week redesign staged in reviewable PRs, with a useful two-week foundation milestone.

---

## 1. Design direction — the reference is pending

The wrong attachment was a camera/recording app. It is **not** an approved visual reference and should not influence LARAS's layout or content. In particular, discard the earlier recommendations to adopt blue as the primary accent, copy its archive timeline, or flatten the playful student home into generic SaaS cards.

What is approved now is the product direction: **academic clarity for lecturers; playful, encouraging German-learning character for students; a unified LARAS red brand; calm neutral surfaces; readable density; first-class light and dark themes.** The correct reference screenshot can refine details such as surface treatment, density, typography, and navigation after it is supplied, but it must not reverse the decisions above without the user's instruction.

The current LARAS UI already provides the brand starting point: `--red: #7F1D16`, `--cta: #B3261E`, Plus Jakarta Sans, white cards, and an existing dark theme. The redesign should consolidate—not replace—this identity. Preserve red as the primary interactive/action color, reserve green/amber/blue for semantic statuses only, and use the student's current warm illustrated vocabulary consistently rather than deleting it.

---

## 2. Current state — what we are fixing

Measured from the live mirror (`apps/web/src`):

| Metric | Current | Target |
|---|---|---|
| CSS total | **12,735 lines** across 15 files | ~7,000 after consolidation |
| `index.css` | 6,631 lines | <1,200 (split by domain) |
| `dark-overrides.css` | 2,829 lines, **3,285 hardcoded hex, 0 `var()`** | <400, fully token-driven |
| Hardcoded hex vs tokens | **9,575 hex / 2,845 `var()`** (77% hardcoded) | >70% token-driven |
| Custom properties in `:root` | 78 (many near-duplicates) | ~40, one scale each |
| Brand hues on one screen | red `#7F1D16` + burgundy `#B3261E` + yellow `#FFF8D6` + blush `#FBE9E7` + cream `#FFFDF2` + violet `#7C3AED` + green `#047857` + blue `#2563EB` | 1 neutral ramp + 1 accent + 4 semantic |
| Yellow "premium" surfaces | **231 occurrences** of `#FFF8D6` / `#FFFDF2` / `#FFEB99` | 0 |
| Distinct radii | **44 distinct `border-radius` declarations** | 5 |
| Font stacks | `Barlow Condensed` (`--display`, used **14×** — mostly vestigial) + `Plus Jakarta Sans` | 1 family, 2 roles |
| Distinct breakpoints | **28 widths** (390, 480, 520, 560, 600, 640, 650, 680, 700, 720, 750/751, 760, 768, 800, 820, 850, 860/861, 900/901, 980, 1000, 1050, 1080, 1100, 1150, 1300) | 4 widths |
| Media queries | 143 in `index.css` alone | ~30 total across the app |
| Components | 92 app components, several over 1,000 lines (`ai-evaluation-review` 3,360; `assignment-form` 2,518; `lecturer-gradebook` 2,037) | split by concern |

**Content inconsistencies found while auditing** (real bugs, not aesthetics):

- Gradebook publish panel reads *"Semua nilai sudah lengkap dan siap diterbitkan"* while the summary card says **1 incomplete** and the student row says **Belum dinilai**. The banner is unconditional; it should be derived from the same state as the summary.
- Student dashboard combines a playful illustrated hero with conventional dashboard cards, a native-styled `<select>`, and denser utility controls. The problem is inconsistent execution—not the playful direction; preserve the character and bring the controls/cards into the same system.
- Student dashboard showed **`0 XP` with a "+" affordance and a `0/1` goal progress** — a gamification layer that is either broken or disconnected from real progress.
- The instructor AI badge was 9px; calendar out-of-month dates were 1.42:1 contrast. Both fixed in the readability pass, but they show how thin the shared token layer is.

---

## 3. Design principles (decisions locked)

1. **LARAS red stays the brand and primary action colour.** Unify current red/burgundy aliases into one accessible red scale based on `#7F1D16`; do not replace it with blue. Blue is reserved for information/status only.
2. **Keep the student product playful.** Retain the illustrated German-learning world, encouragement, XP, and goals. Make them feel intentional and consistent with the rest of the UI; never hide real zero-progress data, but use a welcoming first-step state instead of broken-looking counters.
3. **Dark theme is a requirement.** Tokenize both light and dark surfaces from Phase 1; every surface/component/page must be designed and visually checked in both themes as it is migrated, not deferred to the end.
4. **Colour carries meaning, not decoration.** Use one neutral ramp, the LARAS red accent, and restrained semantic success/warning/danger/info colors. Remove the unrelated yellow premium-card tint; preserve warm playful illustration colours only where they support the student identity.
5. **Type scale is closed.** 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32px. Body copy is never below 13px; metadata never below 12px; nothing below 11px anywhere.
6. **One radius scale.** 6 (chips) / 10 (controls) / 14 (cards) / 999 (pills) / 0 (tables).
7. **Surfaces are theme tokens.** Light: white cards on neutral `#F7F8FA`; dark: corresponding layered charcoal surfaces. Both use theme-aware borders, focus rings, and readable muted text—no per-component hardcoded dark hex overrides.
8. **Density is a per-page choice.** Lecturer grading/roster surfaces may remain dense and table-based; student home and writing surfaces should breathe. Desktop tables retain the width they need, then reflow to accessible cards/rows on smaller screens.
9. **Every interactive target ≥ 44×44 on touch, ≥ 28×28 on desktop.** Enforced by a test, not by eye.
10. **Presentation-only changes.** No data-model/schema migrations, PocketBase hooks, new endpoints, API contract changes, auth changes, or URL changes. Use the current data and API surface; fix misleading UI states only from existing state.

---

## 4. The token layer (Phase 1 foundation)

Replace the current 78 custom properties with a single light/dark token scale. **This is the highest-leverage work in the plan**—both themes are required from this phase onward.

```
Neutral ramp   light: #FFFFFF / #FCFCFD / #F7F8FA / #F0F2F5 / #E6E7E9
               dark:  #111318 / #181B22 / #20242D / #2A303B / #353D49
Text ramp      theme-mapped primary / secondary / muted / disabled
LARAS red      900 #7F1D16 (brand) · 700 #9B2118 (hover) · 600 #B3261E (action)
               light tint #FBE9E7 · dark tint #3A1D20 (measure contrast before use)
Semantic       success #067647 / tint theme-specific
               warning #B54708 / tint theme-specific
               danger  #B42318 / tint theme-specific
               info    #2563EB / tint theme-specific (status only; not a primary accent)
Type           11 12 13 14 16 20 24 32 (line-heights 1.25 / 1.4 / 1.5)
Space          4 8 12 16 20 24 32 40 48 64
Radius         6 10 14 999 (plus 0 for tabular grids)
Shadow         xs / sm / md / lg — checked in both themes
Breakpoints    480 (xs) 768 (sm) 1024 (md) 1280 (lg)   ← consolidate 28 widths
```

Implementation: define shared semantic names in `tokens.css`; provide light values by default and dark values in `tokens-dark.css` via the existing theme selector. Map old names (`--red`, `--cta`, `--soft`, etc.) to the approved red/neutral scales during migration. Keep dark overrides only as a temporary compatibility layer, then delete them once all routes use tokens. Confirm contrast for red text/buttons, statuses, focus rings, and disabled states in both themes; token values are candidates until measured.

---

## 5. Phased plan

Each phase is independently shippable and leaves the app in a working state. Effort is in person-days for one developer.

### Phase 0 — Baseline & guardrails (2 days) · *do this first*

Build the safety net before touching a 12,735-line stylesheet. Since GitHub is the target, checks should run in PR CI; production is not part of this phase.

- **Visual regression harness.** Playwright screenshots of all 18 lecturer + 12 student route paths (the `verify.py` harness already exists in `ui-audit/`), in **both light and dark themes**, at desktop, tablet, and mobile. Store baselines; diff on each PR.
- **Token-audit script.** PR CI fails on font sizes outside the scale, non-token colours/radii, and targets under 28px desktop / 44px touch.
- **Contrast + target audit stays in CI.** Assert ≥4.5:1 normal text and ≥3:1 large text/non-text UI in both themes; retain the current route metrics as regression gates.
- **Bundle-size and CSS-line budget** recorded as baseline.
- **Frontend-scope guard.** The redesign PRs must not change migrations, PocketBase hooks, server routes/API contracts, auth, or persisted data shape; flag any such diff for separate approval.

**Exit criteria:** PR CI runs visual, token, contrast, scope, and responsive checks; the starting point is captured under the same routes/fixtures in both themes at 375px, 768px, 1024px, and 1440px.

### Phase 1 — Light/dark token layer (5 days)

- Write shared `tokens.css` + `tokens-dark.css`; map every existing custom property to the red/neutral/semantic scales.
- Unify `--red` / `--cta` / `--brand-*` so selected states, links, focus rings, and primary actions consistently use accessible LARAS red.
- Convert `dark-overrides.css` into token aliases, then delete it after component migration; no component may use hardcoded dark hex.
- Introduce a temporary compatibility shim for old names so migration can be incremental.
- Normalize the 28 breakpoint widths to the four approved breakpoints while preserving current route behavior.
- Keep the existing theme toggle and preference behavior; improve it only with frontend accessibility and persistence using the current client-side mechanism.

**Exit criteria:** light/dark screenshot parity is reviewed for all 30 route paths; contrast passes in both; `var()` usage >70% of colour declarations; switching theme is immediate, persists per the existing behavior, and introduces no flash or layout shift.

### Phase 2 — Component primitives (7 days)

Extract the repeated patterns into a small, consistent set — currently they are copy-pasted per page, which is why the same bug (tiny text, low contrast) appears on 12 screens.

| Primitive | Replaces | Notes |
|---|---|---|
| `Surface` | `.hm-card`, `.ld-card`, `.sa-panel`, `.sas-workspace`, 20+ variants | white, 14px radius, hairline border, optional 20px padding |
| `SectionHeader` | per-page eyebrow + title + action | supports title + primary action + optional filters |
| `ListRow` | roster rows, task rows, file rows | thumbnail + title + meta + chevron, 2-line max, 56px min height |
| `MetricTile` | the 4-up dashboard stats, gradebook 5-up cards | icon tile right-aligned, label + value + optional helper |
| `Tabs` | 4 different tab implementations | shared underline treatment with red selected-state indicator |
| `Badge` / `StatusPill` | ~15 bespoke pills | 3 variants only: neutral, accent, semantic |
| `Button` | primary/ghost/pill/outline variants (~8) | 40/44/50px heights, one focus ring |
| `EmptyState` | ~10 different empty states | icon + one line + one action |
| `Field` | inputs, selects, textareas | 40px, 10px radius, consistent label/helper/error |

The native `<select>` on the student dashboard gets replaced by a styled `Select` — it is the most visible "unfinished" element in the current UI.

**Exit criteria:** no page defines its own card/button/badge CSS; `index.css` no longer contains page-level style blocks.

### Phase 3 — App shell & responsive navigation (5 days)

- **Desktop:** retain a collapsible sidebar, but add readable labels in its expanded state and keep the icon-only compact state. Do not force a wide 220px rail on users who prefer the existing density.
- **Mobile:** use a bottom tab bar for the highest-frequency destinations (max 5) and place lower-frequency destinations under an accessible “More” menu. Use existing routes; no route/API changes.
- Top bar: retain global search, but make its placement responsive and prevent it from competing with the page title. Preserve its existing command-palette behavior.
- Keep wide gradebook/roster tables on desktop. At narrower widths, show key identity/status/score columns first and provide a legible stacked/card view rather than compressing every desktop column.
- Reduce shell coupling where practical, without broad component rewrites that add risk.

**Exit criteria:** all 30 route paths usable at 375px, 768px, 1024px, 1440px, no horizontal page overflow, nav labels are accessible, and high-frequency actions remain reachable in both themes.

### Phase 4 — Lecturer surfaces (6 days)

Rework in this order (highest traffic first):

1. **Dashboard** — reduce the 4-up metric wall to a compact 2-up strip plus a single "needs attention" list, so actionable work outranks empty statistics. Keep the existing AI composer as a right-rail panel on ≥1280px and a responsive sheet below; preserve current send/API behavior.
2. **Gradebook** — table-first, fixed header, sticky first column, 40px rows, score cells as direct-edit inputs. Fix the **publish-banner bug** (derive from the same completion state as the summary).
3. **Evaluation workspace** (3,360-line component) — split into `RubricEditor` / `EvidenceList` / `ScoreSummary` / `ReviewActions`; the AI findings become an evidence rail, never inline prose.
4. **Course detail / roster / assignment editor** — consistent `SectionHeader` + `ListRow` patterns; fix the "15 criteria in one flat list" density problem in the rubric editor.
5. **Calendar** — week view as the primary class-schedule view and month view secondary. Use existing session records only; do not copy the wrong attachment's surveillance timeline.

**Exit criteria:** lecturer's 5 most common tasks (grade a submission, publish grades, create an assignment, check roster, read a course) each ≤ 3 clicks from the dashboard, verified by scripted walkthroughs.

### Phase 5 — Student surfaces (6 days)

1. **Home — playful stays.** Keep the illustrated German-learning hero, “Abenteuer” framing, encouragement, XP, goals, and progress. Unify the typography, surfaces, action hierarchy, and form controls around it rather than flattening it into generic SaaS. Show accurate zero-progress states as friendly first-step prompts; never imply XP/goal completion that is not present in the existing data.
2. **Writing workspace** (`/app/kerja/:id`) — keep the writing task as the core activity. Make prompt and editor the primary focus; use a responsive assistant slide-over on smaller screens. Any layout change must use existing assignment/submission/evaluation data and endpoints.
3. **Practice** — retain playful language-learning feedback and visual affordances; standardize exercise rows/cards, difficulty/status chips, and durations. Do not add new game-state fields or scoring semantics.
4. **Assistants** — unify visual primitives across lecturer/student assistants while preserving their existing role-specific actions and API behavior.
5. **Onboarding** — make the current friendly tone and illustrations coherent with the student home; steps use the shared component system.

**Exit criteria:** student completes a writing task end-to-end on 375px and 1440px without horizontal scrolling; both themes pass contrast; existing XP/goals render honestly from current state; no text under 12px on student-facing surfaces.

### Phase 6 — Dark-theme completion, density, and final polish (3 days)

Dark theme is mandatory, not a stretch goal. Token foundations and dual-theme work begin in Phases 0–1 and continue through every component/route batch. This phase is the full-route audit and cleanup:

- Complete dark-theme parity across all 30 route paths; test theme switching, persisted preference, focus/hover/disabled states, dialogs, charts, and empty/error/loading states.
- Add comfortable/compact density modes for gradebook and roster using existing client-side preference behavior only; no new persisted fields or server storage.
- Unify empty/loading/error states across routes without changing API contracts.
- Add/verify print styles for gradebook and rosters in light mode; dark theme is not printed with dark backgrounds.

**Exit criteria:** every route has reviewed light/dark captures at the required widths; no low-contrast states, theme flash, invisible controls, or horizontal overflow; all data comes from existing state/API surfaces.

### Phase 7 — GitHub PR rollout (3 days)

- Build the redesign on a dedicated GitHub feature branch, not directly on production or `main`.
- Migrate routes in small PR batches (3–4 routes); every PR includes screenshots for both themes and responsive widths, with the visual diff as a review gate.
- Keep the front-end route tree and API contracts stable. No PocketBase migrations/hooks or data-model changes in these PRs.
- Remove the legacy CSS and `readability-pass.css` / `ui-audit-improvements.css` only after all fixes are intrinsic to shared tokens/components and all route/theme baselines pass.
- Production deployment is a separate future decision after GitHub review and VPS reactivation; it is not part of this work.

---

## 6. Effort summary

| Phase | Days | Depends on |
|---|---|---|
| 0 — Baseline & guardrails | 2 | — |
| 1 — Token layer | 5 | 0 |
| 2 — Component primitives | 7 | 1 |
| 3 — Shell & navigation | 5 | 2 |
| 4 — Lecturer surfaces | 6 | 2, 3 |
| 5 — Student surfaces | 6 | 2, 3 |
| 6 — Theming & polish | 3 | 4, 5 |
| 7 — Migration & rollout | 3 | 4, 5, 6 |
| **Total** | **37 days** | |

Plus a 20% buffer for the unknowns in Phases 4–5 (the 3,360-line evaluation workspace and the 2,518-line assignment form have never been described in a spec): **~45 days ≈ 9 weeks**.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Correct visual reference has not yet been supplied | Medium | This plan locks product direction, not screenshot-specific art direction. Reconcile typography/surface/density details when the correct reference arrives; do not copy the wrong camera UI. |
| Scope creep beyond frontend-only | High | PR scope guard: no migrations, hooks, backend routes, API contracts, auth, or persisted data shape changes. |
| Rewriting CSS with no safety net silently breaks a screen | High | Phase 0 creates screenshot baselines for every lecturer/student route in both themes. No restyle without a matching baseline. |
| Dark-theme gaps reappear during component migration | High | Dark parity is a per-PR gate from Phase 0 onward; not deferred to the last phase. |
| The 12,735-line CSS has hidden dependencies | Medium | Compatibility shim + token-usage metric makes them visible before removal. |
| Student playfulness gets diluted into generic LMS UI | Medium | Keep the student illustration/gamification vocabulary as a locked direction; unify execution, not personality. |
| 92 components, several >2,000 lines | High | Phase 2 splits by concern first; later work lands on smaller components. |
| Production VPS is suspended | Medium | No production dependency for this GitHub-only work; deployment remains separate and blocked until VPS reactivation. |
| 8 unrelated test failures | Low | Preserve baseline and do not widen into assistant/bynara repairs unless separately requested. |

---

## 8. Quick wins (first two-week GitHub milestone)

Ship as reviewable frontend-only PRs; keep light/dark screenshots paired. Roughly 1–2 days each, high visible value, no data-model/API changes:

1. **Unify LARAS red** — consolidate `--red`, `--cta`, and `--brand-*` into one accessible red scale for active nav, tabs, links, and primary actions. *(~0.5 day)*
2. **Remove unrelated yellow premium tints** (`#FFF8D6`, `#FFFDF2`, `#FFEB99`) from generic lecturer/admin surfaces; retain warm colour only in the intentional student illustration/gamification art. *(~0.5 day)*
3. **Fix the gradebook publish-banner contradiction** using the existing completion state: never say ready when the summary reports incomplete work. Frontend logic only. *(~0.5 day)*
4. **Replace the native-looking student course `<select>`** with the existing accessible frontend component pattern, keeping its current options/value contract. *(~0.5 day)*
5. **Make zero XP / `0/1` goal states encouraging and honest** using existing state; no fabricated progress or new game-state fields. *(~0.5 day)*
6. **Normalize radii** from 44 distinct declarations to five tokens, screenshot-checking both themes. *(~1 day)*
7. **Add/review mobile navigation** with a bottom tab bar for common routes and a “More” menu, without changing route destinations. *(~1–2 days)*
8. **Start dark-theme token conversion now** rather than postponing it: define light/dark surface, text, border, and action tokens and migrate the shell first. *(~2 days)*

---

## 9. Decisions and remaining input

### Locked decisions

- **Brand:** keep LARAS red as the primary accent; blue is status/info only.
- **Student personality:** playful German-learning illustrations, encouragement, and gamification stay.
- **Dark theme:** required and included in every phase's review gate.
- **Scope:** frontend only; preserve routes, data model, API contracts, auth, PocketBase, and stored data.
- **Release target:** GitHub feature branch/PR for now; no production deployment.
- **Layout defaults chosen:** collapsible labelled desktop sidebar; responsive bottom navigation on mobile; keep wide desktop tables and reflow them at smaller widths.
- **Schedule chosen:** retain the full ~9-week phased plan, with a useful first two-week milestone rather than cutting to a polish-only subset.

### Still needed

- Supply the correct visual-reference screenshot when available. It can refine the detailed visual language, but the locked red/playful/dark/frontend-only decisions remain unless explicitly changed.

---

---

## 10. Delivery status

Work is on GitHub as reviewable PRs (no production deployment yet):

- **PR #4 — `redesign/plan-v1` → `main`**: this document.
  https://github.com/sakabakabaa/laras/pull/4
- **PR #5 — `fix/rubric-tests-and-readability` → `main`**: the rubric-test fix, the PocketBase bootstrap guards, and the UI readability pass.
  https://github.com/sakabakabaa/laras/pull/5

Both branches are based directly on GitHub's `main` and contain only their own files. The production VPS remains suspended, so deployment is blocked until it is reactivated.
