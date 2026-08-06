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
2. ~~**Tune-up recalibrator**~~ — SHIPPED v1.5: Reference widget takes
   the Week-24 half time, returns the §10 verdict + a Riegel projection
   (advisory — locking a target stays a data/plan.js edit). Input
   persists locally.
3. ~~**Pro 4 odometer**~~ — SHIPPED v1.5: §11's outings became
   `pro4Outings` data; Reference shows each outing with tick state and
   a used/planned bar against the ≈50 km cap. Also fixed a spec
   inconsistency: the race-week shakeout is now in the Pro 4s per §11
   (data said Ghost).
4. **Wake-block "today at a glance"** — during the first block of the
   day, Now/Next could append the day's run line (mirror of the
   tomorrow preview).

**Medium**
5. ~~**History view**~~ — SHIPPED v1.5 as the run log: every planned
   run in the block as one dot on the Plan view (filled phase-colour =
   done, hollow accent = missed, hollow grey = skipped, ring = today,
   faint = future). 141 runs, one glance.
6. ~~**Illness/niggle mode**~~ — SHIPPED v1.8: run cards' action menu
   gains "Niggle — rest 2 days" (rule 5) and "Ill — rest to Sunday";
   one tap skips every run in the window, excluded from streak/stats
   as deliberate rest. v1.8 also shipped gym weight memory: tap the
   kg chip on any exercise row to log the top-set weight; the next
   session shows it as "last" — the +2.5 kg rule finally has memory.
   Weights ride along in backups (wt-* keys).
7. ~~**Self-hosted fonts**~~ — SHIPPED v1.4: Archivo 800/900, Space
   Mono 400/700, Inter 400/600 (latin woff2 via fontsource, ~124KB),
   `font-display: swap`, precached by the SW. v1.4 also shipped the
   delight pass: tick pop + rotated BANKED/MARATHONER stamps on the
   done hero (animated only on the just-ticked block, reduced-motion
   aware), "N min left" live in the Now card, "open time" gap dividers
   in the timeline, days-only countdown in race week, and a fade on
   real navigation only.
8. **Home-screen widget-ish shortcut** — an `?view=week` start-URL
   parameter is cheap; a real iOS widget needs a native wrapper
   (rejected for now).

**Long-term**
9. ~~**AI plan surgery loop, formalised**~~ — SHIPPED v2.4:
   `docs/PROMPTS.md` is the recipe book ("convert week N to cutback",
   "retime a scaffold", "author block three"), each recipe ending in
   the same test → version-bump → push checklist. The suite (12,869
   checks after the scaffold-era work) is what makes AI edits safe.
   En route, v2.1–2.3 shipped the visual-delight arc (phase aura, Week
   strip with load bars, Plan season board incl. the recovery
   fortnight, Reference race card) and realigned race week, recovery
   and the standing week onto the HND era (§16 Q1).
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
(c) the definition-of-done suite. The one accepted risk — tick-ids
embedding an index + title slug, so renames or insertions orphaned past
ticks — was RESOLVED in v2.6: ids are now `t{HHMM}-{cat}` (start times
are unique within a day by the ordering invariant), with a one-time
localStorage migration that also re-runs after restoring an old backup.
Retiming a historical day still rewrites history, but the scaffold-era
pattern exists precisely so past weeks keep their old times.

---

## 5. Training audit — all 30 weeks (Aug 2026, shipped v2.15)

Prompted by a direct challenge: *"core and legs and upper A appear on a
Saturday later on?? With a buffer run?? Does the progression make
sense?"* — a fair one. Five findings; four fixed, two structural
decisions left open because they change 20 weeks of load and that is
the athlete's call, not the tool's.

### Fixed

1. **Saturday was carrying a triple stack.** From Wk 11 the day read
   *easy buffer run → Core + calves → Upper B*, putting loaded soleus
   ~20 h before a 26–32 km long run. That is precisely the failure mode
   that moving Lower B off Saturday was meant to eliminate; it had been
   recreated under a different name and never reconciled against the
   plan's own stated principle. Core + calves now runs **Tue 20:45,
   after Upper A** — already at the gym, five days clear of Sunday.
   Saturday from Wk 4 is Upper B and nothing else.
2. **Peak long run 32 km → 30 km, capped by time.** 32 km at ~6:45/km
   is ~3h36. Past ~3h20 the injury and recovery cost climbs faster than
   the aerobic return. Wk 27 Sunday now reads "cap at 3h20, run by
   time": if easy pace is slower on the day, the distance gives.
3. **Week table reconciled with the days it builds.** Wk 17 40 → 36 km,
   Wk 24 48 → 35 km. Both are race weeks whose special-day overrides
   replace the standard runs, so the headline numbers had drifted and
   overstated two cutbacks by 10–25%.
4. **Two rules promoted to CLAUDE.md §12** so neither can drift back:
   long runs capped by *time* not distance; *Saturday belongs to
   Sunday* (no legs, no calves, no intensity from Wk 4 on). Both have
   test coverage — including a negative assertion that no calf work
   appears on any Saturday in peak Build.

### Deliberately not changed

5. **The long run is 50–58% of weekly volume** against the usual
   30–35% guidance. This is structural, not sloppy: weekday runs are
   capped ~9 km by the 17:10 start against the 18:30 dinner anchor, so
   the only place volume can go is Sunday. It is the plan's largest
   remaining injury exposure and it has exactly two fixes, both of
   which need a human decision:
   - **A fifth run** (Friday ~07:00 before the German block, or
     something light restored to Monday). A 6 km fifth run at Wk 20
     drops the long-run share from 52% to ~47%. This is the only
     change that addresses the cause rather than the symptom.
   - **Rebalancing weekday km upward**, which runs straight into the
     dinner anchor — declared non-negotiable in §5.
6. **No VO2max block added.** The marathon is threshold-limited; Wk 8's
   2-mile TT and Wk 17's parkrun already supply top-end stimulus; and
   the plan is carrying elevated long-run load as it is. Intervals on
   top would be volume for its own sake.
