# Week OS — product & engineering audit (July 2026, v1.2)

Scope: full pass over vision, UX, behaviour, architecture, code, a11y,
performance. Everything marked **SHIPPED** landed in v1.2; the rest is
the roadmap, ranked by impact ÷ effort.

---

## 1. The strategic read

Week OS is **not a planner — it's a routine executor**. The plan is
authored once, as data; the app's job is *what am I doing right now*.
That inverts the usual planner economics: planning cost is already ~0,
so the classic wins (fast task entry, drag-drop scheduling, smart
inboxes) are anti-features here. They would add the very cognitive
load the product exists to remove.

**Considered and deliberately rejected:**
- Task inbox / ad-hoc todos — would turn a routine OS into a todo app.
  Real life is absorbed by Skip / Move, and plan changes are data edits.
- Drag-drop rescheduling — same reasoning; the plan file stays canonical.
- Gamification beyond honest numbers (badges, confetti) — the user is
  data-driven; the motivating artefact is the truth, not a sticker.
- Accounts/sync/backend — offline-first localStorage + paste-backup
  fits a single user better than any server.

The genuine gap was the feedback half of the habit loop: **ticks were
write-only**. Cue and routine were strong (every block has a time and
place — implementation intentions by construction); the reward/evidence
channel didn't exist. v1.2 is mostly that.

## 2. What shipped in v1.2

| Change | Why |
|---|---|
| **Adherence engine** (`DayBuilder.adherence`, pure + tested) | km banked, runs done/due, sessions, current & best run streak. Honesty rules: today's pending items don't count against you; an explicitly-skipped run (niggle protocol) is excluded and does **not** break the streak — deliberate rest is compliance. A silently missed run does break it. |
| **Plan view: stat tiles + phase progress bar** | Day n/210, km banked, runs, streak — then a base/build/taper strip with a today-marker. Per-week "✓ km" badges on past weeks. |
| **Week view: banked line** | "✓ 9 of 17 km banked" under the header. |
| **Tomorrow preview** | From 21:00 (or when nothing is left today) Now/Next shows tomorrow's run — distance, time, shoe — so kit gets laid out the night before. Implementation-intention priming, zero taps. |
| **Day navigation** | Chevrons on Today + horizontal swipe (Today: ±1 day, Week: ±1 week). Previously any other day took 3 taps via Week. |
| **Dark theme** | Auto via `prefers-color-scheme`. Hand-picked steps from the same hues (not an inverted flip); chips switch to dark text; `theme-color` metas per scheme. The 22:00 read block no longer glares. |
| **Backup / restore** | Reference → Data: copy a JSON blob to clipboard, paste to restore (per-entry validation; corrupt entries skipped). Closes CLAUDE.md open question 3. localStorage is a single point of failure; now it has an exit. |
| **Structured gym cards** | Exercise prescriptions moved from a run-on detail sentence into `plan: [{ex, sets}]` data, rendered as an explicit exercise table on the card (name left, sets right). Maintenance weeks swap in `maintPlan`. Every gym block across all 210 days is test-asserted to carry a ≥3-exercise plan. |
| **First-visit reload bug (real)** | `clients.claim()` fires `controllerchange` on the very first load; the reload listener yanked the app seconds after install. Now reloads only when an update takes over or the user taps the toast. |
| **Minute tick made surgical** | Was: full DOM rebuild every 60s. Now: rebuild only when the NOW block changes; otherwise update the progress bar width + NOW label in place. Less battery, no scroll jank. |
| **Accessibility pass** | `aria-pressed` on ticks, per-block labels, `:focus-visible` rings, ≥44px touch targets (inset hit-area expansion), grey text consolidated to tokens and lifted to ~4.5:1 contrast. |
| **Token consolidation** | All hardcoded greys → `--t2/--t3`; ink/paper pairings → `--chrome-*`; hero bg decoupled from the category colour. This is what made dark mode a 40-line diff instead of a rewrite. |

Colour note: the phase palette passes CVD separation (ΔE > 40) but the
muted brand tokens sit below the chroma floor and taper-amber is < 3:1
on the light surface (validated with the dataviz checker, not by eye).
Kept deliberately — identity tokens are fixed by spec — with the
sanctioned mitigation: phase identity is always carried by order
(base→build→taper), gaps, and text labels, never colour alone.

## 3. Roadmap (impact ÷ effort, descending)

**Quick wins**
1. ~~**.ics calendar export**~~ — SHIPPED v1.3: Reference → Reminders.
   Every training block from today to the end of the recovery block as
   floating-local-time events with 15-minute VALARMs; stable UIDs make
   re-imports update-in-place; share-sheet first, blob download
   fallback. Native iOS reminders with zero backend.
2. **Tune-up recalibrator** — Reference widget: enter the Week-24 half
   time → applies §10's rule, shows the locked race pace. Deterministic,
   ~30 lines.
3. **Pro 4 odometer** — the shoe has a ≈50 km pre-race budget and every
   outing is planned data; show "Pro 4: 12 of ~50 km used" on Reference.
4. **Wake-block "today at a glance"** — during the first block of the
   day, Now/Next could append the day's run line (mirror of the
   tomorrow preview).

**Medium**
5. **History view** — a month grid of run-day dots (done/missed/skipped)
   behind More. The streak number shipped; this is its picture.
6. **Illness/niggle mode** — one action that skips the next N days'
   runs and stamps the reason, so streak/stats stay honest without
   ceremony (currently N separate skips).
7. **Self-hosted fonts** — Archivo/Space Mono/Inter woff2 checked into
   the repo (network policy blocked fetching them this session); the
   identity currently rides on fallbacks.
8. **Home-screen widget-ish shortcut** — an `?view=week` start-URL
   parameter is cheap; a real iOS widget needs a native wrapper
   (rejected for now).

**Long-term**
9. **AI plan surgery loop, formalised** — the amendment workflow (edit
   `data/plan.js` via Claude Code, tests as guardrails) already works;
   add a `docs/PROMPTS.md` of recipes: "convert week N to cutback",
   "shift Tuesday scaffold post-HNC", "generate spring-half block two".
   The 12,839-check suite is what makes AI edits safe.
10. **Adaptive recalibration** — feed tune-up + parkrun results into
    pace-table updates as data edits (still no runtime AI: the app stays
    deterministic; intelligence lives in the editing loop).
11. **Block-two authoring** — post-race, appending the next goal block
    is the designed extension path; UI needs zero changes.

## 4. Architecture verdict

Kept as-is, deliberately: vanilla JS + full-view re-render (~35 nodes
per day) is the *right* size for this app; a framework or vDOM would be
pure overhead. The load-bearing walls are (a) plan-as-data with zero
content in render code, (b) pure day-builder shared by app and tests,
(c) the definition-of-done suite. Known accepted risk: block tick-ids
embed a title slug, so renaming a block in the plan orphans that
block's *past* ticks (stats undercount historical days). Acceptable for
a single user; fix would be content-hash ids with a migration.
