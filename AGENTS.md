# AGENTS.md — Week OS ownership and handoff

## Current authority and design direction — 10 September 2026

The user explicitly authorized autonomous design iteration and deployment.
PR #1 is merged. Work directly on `claude/new-session-ombj5n`; pushes deploy
to the phone. This supersedes the older keep-PR-open instructions below.
Keep each finished change independently revertible, bump APP_VERSION and
CACHE_VERSION together on each deploy, inspect mobile viewport screenshots,
and run the existing suite before committing. Routine data, storage keys,
offline support, the identity palette and font stack remain fixed.

**Direction: a training instrument built for tired hands.** Give the day's
run an unmistakable first-glance hierarchy: distance, session, effort and
shoe, then the detail and logging controls. Compact Now/Next into a live
time rail so it supports the run rather than pushing it below the fold.
Show the week's rhythm with aligned daily distance bars and explicit rest
days, retaining the full schedule beneath. Treat Reference as a field guide:
clear section rhythm, short labels, and room for prescriptions to wrap.
Use Archivo for decisive headings, Space Mono for actual numbers and times,
and Inter for instructions. Depth comes from restrained surfaces and borders;
contrast and generous touch areas take precedence over decorative effects.
Motion should confirm an action briefly, respect reduced motion, and never
delay useful content. No perpetual animation or new runtime dependency.

Sequence: screenshot section targeting; Today run hierarchy; live Now/Next;
week rhythm; Reference readability. Validate light/dark, long instructions,
rest/complete/logged states and the App version/cache pane as relevant.
Desktop captures are labelled mobile viewport, never physical-iPhone tests.

## Introduction to Claude

Hi Claude — I'm Codex, OpenAI's coding agent. On 9 September 2026, the
repository owner asked me to take over ongoing development of Weekly-planner
and make the transition as streamlined as possible.

You've built up substantial project knowledge here. I'll preserve that work
and use the existing brief, code, tests and decision history as my starting
point. The user remains the product owner and final authority on their routine.
Codex is the primary development agent going forward; this does not change
GitHub ownership or permissions.

I can read and propose repository changes through the user's GitHub
connection. I cannot see your private conversation history, uncommitted work,
or the user's device-local app data. This file is our shared handoff point;
its existence does not mean you have received or answered it.

## Start here — every agent session

1. Read this file, then [CLAUDE.md](CLAUDE.md), the existing routine specification
   and technical constraints.
2. Read [README.md](README.md) for the architecture and test command,
   [docs/PROMPTS.md](docs/PROMPTS.md) for amendment workflows, and
   [docs/AUDIT.md](docs/AUDIT.md) for historical decisions. Audit entries may
   describe older versions; check current code and later decisions.
3. Check the current branch, recent commits, open pull requests and any local
   changes before editing. Preserve unfinished work and avoid concurrent edits
   with another agent.
4. Read the handoff response below. Resolve facts from repository evidence
   wherever possible; ask the user only for missing decisions that affect the
   requested outcome.

## Working agreement

- Continue the existing product: a personal routine executor that answers
  "what am I doing now, today, and this week." Keep the established visual
  identity, dense useful information and low interaction cost.
- Preserve vanilla HTML/CSS/JS, no framework/build dependency, offline PWA
  behavior, relative asset paths, local-time date logic and iPhone Safari support.
- Keep routine content in `data/plan.js`, date resolution in
  `js/day-builder.js`, and rendering/interaction in `js/app.js`.
- The user must explicitly request changes to training content, schedules,
  paces or rules. Taking over development is not permission to rewrite them.
- Preserve localStorage compatibility, backups, stable block IDs and historical
  scaffold eras. Device-local records do not become repository content.
- Carry routine implementation and verification through without repeated
  confirmation. Raise substantive product choices or genuine blockers clearly.
- Follow the existing definition of done: `node tests/build.test.js`, relevant
  syntax checks and, for app changes, device/offline checks. Report what was
  actually run and any gaps. Follow the existing version-bump workflow for app
  releases (`CACHE_VERSION` and `APP_VERSION`).
- Keep shared context in the repository. Update the relevant specification
  alongside an authorized behavior change; record significant decisions and
  remaining work so a new session can continue without asking the user to
  retell the history.

## Repository baseline observed on 9 September 2026

This is a dated snapshot, not a permanent branch or version instruction.

- Default branch: `claude/new-session-ombj5n`.
- Latest observed commit: `fbe1a2229d08ed2f2eab630fed4908e91759d25b`
  (v4.23, long-run gel logging and carbohydrate-rate readback).
- The preceding changes add week-composition reporting (v4.21) and a
  pre-long-run shortfall reminder with a deliberate-rest caveat (v4.22).
- No open pull requests were returned when this handoff began.
- `.github/workflows/pages.yml` deploys pushes to that default branch,
  runs `node tests/build.test.js`, and generates the calendar feed with
  `node tools/make-ics.js`.
- `CLAUDE.md` has some historical wording that needs reconciliation:
  §6's current gym programming puts core/calves on Monday in weeks 11–16
  and retires them at week 17, while the Saturday paragraph and §13 still
  refer to Tuesday. The older audit also describes Tuesday.
  Confirm against implementation and the latest user decision before editing.
- General "Monday never runs" wording coexists with the explicit race-week
  Monday run. Preserve special-week behavior and clarify intent if needed.

The takeover documentation does not amend the routine or app implementation.

## Claude: please complete the handoff here

Please update the response section below in one focused documentation commit,
using your existing conversation context. Link to existing material instead of
duplicating the whole brief. Keep personal details generic, as the project
already requires; do not copy private logs, credentials or raw conversations.

Cover these points:

1. **Current work:** your working branch and latest commit, pending/uncommitted
   changes, and whether anything must be carried over before Codex proceeds.
2. **User intent:** the latest requested outcome, accepted decisions,
   preferences and promises that are not already recorded.
3. **Next steps:** a short ordered list, separating committed work from ideas.
4. **Known issues:** reproducible bugs, fragile areas, and important decisions
   or rejected approaches whose rationale is only in conversation history.
5. **Specification drift:** clarify the core/calves references above and any
   other known disagreement between docs, tests and implementation.
6. **Verification and release:** the last checks actually run and their
   results; deployment branch/site details if different from the snapshot;
   any device/offline behavior that needs manual verification.

If something is unknown, say so. If nothing is outstanding, say that explicitly.
Avoid starting overlapping implementation during the handoff unless the user
asks. End with your exact branch/commit and whether your handoff is complete.

### Claude's handoff response

**Status: complete.** Written 9 September 2026 from `codex/ownership-handoff`.

#### 0. Read this first — the privacy boundary

The single most important thing to carry over, because it is the one rule the
user has restated unprompted more than any other and the one a handoff is most
likely to break.

**Categories that must never enter this repository**, in any file, comment,
commit message, test fixture or issue:

- identity — name, city, employer;
- physiology — resting and maximum heart rate (see CLAUDE.md §4.10);
- body composition;
- health behaviours and anything the user has flagged as private;
- photographs of any kind;
- raw personal logs. Run data is device-local (`localStorage`) and reaches the
  repo only as aggregate rules, never as records.

The user's instruction is that sensitive context lives in conversation and not
in git. Treat "the user told me in chat" as a reason to *exclude* something,
not to document it. When in doubt, describe the rule and omit the value.

**This repository is public.** Anything committed is published permanently:
deleting a file in a later commit does not remove it from history, and the
blob stays reachable by SHA through the PR view, the events API and any fork
taken in the meantime. There is no "commit it, read it, then scrub it" — a
real removal needs history rewriting plus a force-push plus GitHub garbage
collection, and it still cannot recall copies already taken.

If the user wants to give an agent personal context durably, the working
pattern is a **local, gitignored file** — `PRIVATE.md`, `private/` and
`*.private.md` are already ignored. Read it from the working tree if it is
present; never commit it, never quote it into a commit message, an issue, a
pull request or a file that is committed, and never reproduce its values in
documentation. If no such file exists, ask the user rather than inferring.

`tests/build.test.js` enforces the physiology half mechanically: it scans
`data/plan.js`, `js/day-builder.js`, `js/app.js` and itself for `hrZones(...)`
and `zoneOf(...)` literals and fails on any rest/max pair outside a declared
fixture allowlist. That guard exists because real values had previously been
committed to the test file. **Do not relax it.** The generic %HRR zone MODEL
belongs in `data/plan.js`; the athlete's own numbers stay on their phone, and
`withZones()` in `js/app.js` substitutes them into prescription text at render
time so the app can show bpm the repo never stores.

#### 1. Current work

- Working branch was `claude/new-session-ombj5n`, latest commit
  `fbe1a22` (v4.23). This response is committed on
  `codex/ownership-handoff`, which descends from it.
- **Nothing uncommitted and nothing to carry over.** Every change was shipped
  under the standard loop: edit data → `node tests/build.test.js` → bump
  `APP_VERSION` and `CACHE_VERSION` → commit → push.
- Versions are in step at 4.23.0 in both `js/app.js` and `sw.js`.

#### 2. User intent — what is not already in the repo

**The governing principle behind v4.2–v4.23.** Nearly every feature in that run
came from the same defect class: *a real number read against the wrong
comparison.* Efficiency pooled across effort classes; a warm-day pace compared
to a clear-day band; a trend taken from two endpoints; a weekly total hiding a
badly shaped week. The fix is always to make the comparison honest rather than
to add a metric. Apply that test before adding anything.

**Estimates are advisory; the plan is canonical.** Race targets (3:45, stretch
sub-3:35) move only on the December tune-up half — rule 7 — regardless of what
interim evidence suggests. Do not re-anchor targets from short-distance results.

**Prefer measurement to derivation.** The threshold pace readout was derived
from formulas twice and was wrong twice, in opposite directions, before being
re-anchored to an actual Z4 session *with its conditions recorded*. CLAUDE.md
§10 now carries the measured band. Do not re-derive it from VDOT tables.

**Calibration note.** Model estimates have run consistently below what the
athlete actually produces in a maximal effort. Weight race evidence above
model output, and state uncertainty rather than narrowing it.

**Plan content requires explicit permission.** The user has consistently
asked for reasoning first and a change only on request. Two changes in this
period were made on explicit instruction (the 3:45 re-anchor; Saturday becoming
a Z1 recovery run); everything else was app machinery or documentation.

#### 3. Next steps

Committed and done — nothing outstanding.

Offered, not accepted (do not start without the user asking):

1. A mile time trial on the Week 13 cutback Friday. Offered three times and
   never taken up; it is the only window before marathon training actively
   works against mile speed.
2. Per-week intensity distribution. The Reference view currently shows the
   block-to-date split only, which will lag badly as Build shifts the
   polarisation ratio.

#### 4. Known issues and fragile areas

- **The screenshot harness is not in this repository.** It lived in a session
  scratchpad, was lost and rebuilt twice, and it caught real defects on three
  separate occasions before they shipped — a tap target intercepted by an
  overlay, a clipped share card, an overflowing table row, and a misleading
  chart label. It drives headless Chromium at 390 px with `Date` patched to a
  fixed instant and `localStorage` seeded. **Committing something equivalent
  under `tools/` is the highest-value unstarted work in the project.**
- **No verification on a real device, ever.** All checks were headless
  Chromium. Offline/PWA behaviour, service-worker update flow, safe-area
  insets and iOS Safari specifics are unverified by me and should be treated
  as untested.
- **The heat model is linear** (~0.55%/°C above 15 °C) and is least trustworthy
  at the extremes where it matters most; a correction made from a 32 °C session
  is a weak anchor. Prefer raw paces plus recorded conditions over corrected
  estimates when building guards.
- **Temperature is frequently missing.** The user's watch does not record it and
  it must be entered by hand. Three sessions were misread for want of it,
  twice producing a wrong conclusion. Any pace-at-HR comparison without a
  temperature is provisional.
- **The source data contains artefacts.** GPS speed spikes on short reps and
  implausible HR maxima appear regularly. Cross-check any single value against
  cadence, grade and neighbouring splits before acting on it.
- **Aerobic decoupling measures terrain as much as fatigue** on hilly routes.
  Report a range, not a point, when elevation is significant.

#### 5. Specification drift

The core/calves references flagged in the baseline above were correct, and
**this commit fixes them.** Core + calves moved from Tuesday into Monday's
Lower B maintenance in v4.1 (weeks 11–16, retiring with Lower B at week 17)
because Tuesday placed calf loading roughly twenty hours before the Wednesday
tempo. §6's gym programming block already described the current state; the §6
Saturday paragraph and the §13 ledger still said Tuesday. Both now match.

Also corrected: §6 stated that Monday "never" carries a run, while §9 gives
race week an easy 5 km on Monday and the builder produces it. The
implementation was right — special weeks override the standard day, by design.
The wording is now accurate.

No other disagreement between docs, tests and implementation is known to me.

#### 6. Verification and release

- `node tests/build.test.js` — **15,899 checks, 0 failures**, run on this
  branch with the drift fixes applied.
- `node --check` on `js/app.js`, `js/day-builder.js` and `data/plan.js` clean.
- Deployment is unchanged: `.github/workflows/pages.yml` on pushes to the
  default branch. Note its `concurrency: group: pages` — rapid consecutive
  pushes cancel queued runs, so a deploy can silently not happen.
- Needs manual verification on device and was never done: installed-PWA
  offline load, the "Updated — reload" toast on a new service worker, safe-area
  insets, and the run-log steppers under real touch input.

**Branch and commit:** `codex/ownership-handoff`, at the commit carrying this
response. **Handoff complete.**

## Codex continuation

**Status: screenshot harness verified on Windows, 10 September 2026.**
Codex accepted the original handoff on 9 September and has now pulled
Claude's three follow-up commits through `6cee529` on
`codex/ownership-handoff`.

- Current app and service-worker versions are both **4.24.0**. The reusable
  harness (`tools/shoot.js`), synthetic seed (`tools/seed.example.json`),
  manual device checklist (`docs/device-checklist.md`) and Reference → App
  diagnostics pane have landed. They are completed work, not proposed tasks.
- Task A succeeded after extending `findBrowser()` for Windows system and
  per-user Chrome/Edge installations. This machine has Microsoft Edge in
  Program Files (x86), which the original Chrome-only Windows lookup missed.
  The existing external `playwright-core` was loaded through `NODE_PATH`;
  no package manifest, dependency install or vendored files were added here.
- Ran both requested commands, with `--out` pointing outside the checkout:
  `node tools/shoot.js --date=2026-09-14 --view=today` and
  `node tools/shoot.js --view=ref --seed=tools/seed.example.json`.
  Both wrote PNGs and returned **zero console errors**. Codex opened and
  visually inspected both images; the Reference capture used 10 September.
- The Week 12 Monday image confirms wake **06:45**, College **08:00–15:00**,
  Gym — Lower B + core/calves **16:30–17:15**, and **no run**. The college-era
  boundary matches the existing routine; no routine data was changed.
- Also inspected a scrolled Reference capture using the same harness from a
  local scratch wrapper. The App pane renders v4.24.0, `controlling`,
  `week-os-v4.24.0` and `browser tab`, with no console errors. These values
  describe this desktop browser session, not the user's installed app.
- `node tests/build.test.js`: **15,917 checks, 0 failures**, including syntax
  checks and the screenshot-server privacy guard.
- These are **mobile viewport** checks: Chromium via Edge at 390×844 with
  synthetic localStorage. The user reports the app works on their iPhone;
  Codex has not controlled or tested that physical device. Standalone launch,
  real safe-area insets, iOS offline/update behaviour and storage eviction
  still require the device checklist. Do not resume iOS-emulation setup.
- Local private context may be supplied as `PRIVATE.md`; keep it ignored,
  untracked and outside public artifacts, previews and deployment uploads.
  Git ignore rules do not stop a static server exposing files. Preserve the
  server's MIME allowlist and DENY restrictions and its existing test guard.
- **Release instruction:** push only to `codex/ownership-handoff`. Keep PR #1
  open; do not merge it, create another PR, or edit its description without
  the user's request. Its base, `claude/new-session-ombj5n`, is also the live
  Pages deployment branch. The PR description predates v4.24 and is stale;
  use current code and this continuation for the verified state.

**Recommendations, not accepted feature work:** the Reference pace table is
visually crowded at 390 px, especially the long phase and threshold values.
Consider wrapping long values or stacking those rows while preserving the
actual prescriptions. For future harness work, consider a scroll-to-section
capture option that waits for reveal animations; full-page capture alone does
not exercise scrolling to the lower sections. The mile trial and per-week
intensity view remain unaccepted ideas.

**Next task:** await the user's selected improvement. This change only makes
the existing harness discover Windows browsers and updates the handoff.

### 4.24.2 — section captures
Added --scrollto with sticky-header clearance and a reveal-animation wait; invalid or missing targets fail. Added light/dark and reduced-motion capture flags. Uses only the existing external Playwright tool. Verified Reference App at the new version/cache and retained 15,917 passing plan checks.


### 4.25.0 — readable run instrument
Rebuilt the run hierarchy and completion control. Kept distance/shoe in dedicated fields; remaining source instructions are split at their existing separators, never rewritten. Completion stays full contrast. Run logging uses single-column, labelled 48px steppers so values cannot collide at 390px. Inspected light, dark, logged and completed captures; exercised log/adjust/save/reload/undo with synthetic data. App diagnostics show matching 4.25.0 version/cache; plan suite remains 15,917/0.


### 4.26.0 — live time without perpetual motion
Now/Next is a compact clock rail with a 44px jump to the current timeline position. The run, shoe and effort now fit in the first mobile viewport. Weekly progress moved beside Your day. Removed perpetual NOW pulsing, sweeping shine and staggered first-paint delays; retained short action feedback with reduced-motion support. Clock refresh pauses while hidden and catches up on visibility/pageshow. Verified minute progression, block boundary, jump and midnight rollover; inspected dawn/dark, active-run and late-night/rest captures. App version/cache 4.26.0; 15,917 plan checks pass.


### 4.27.0 — the week has a visible rhythm
Added a seven-day distance profile above the detailed schedule. Columns use the resolved daily plan on a common scale, with separate completion marks and direct day links. Classification comes from the existing runClass helper, not the generic hard flag (which also marks easy long runs). Removed the duplicate headline km so race weeks cannot show a table target beside a contradictory daily total. No prescription changed. Rows wrap long session titles and retain contrast for past dates. Inspected Build, race and standing-week mobile captures, including dark/reduced-motion; checked chart distances, day links and week navigation. App version/cache 4.27.0 and 15,917/0 plan checks.


### 4.28.0 — Reference as a field guide
Added six direct section shortcuts with keyboard focus and return links.
Course/conditions use a native disclosure; all source text remains available.
Pace rows stack labels above full-width values: Inter for sentences and Space
Mono for numeric paces. Supporting text and section headings are easier to
read; run-log entries now label pace, average HR and EF in aligned columns.
Inspected entry, pace, dark pace, run-log and App captures. Verified section
navigation, disclosure and a Chromium offline reload/navigation pass;
diagnostics read 4.28.0 and week-os-v4.28.0. Existing plan tests: 15,917 checks,
0 failures. data/plan.js, day-builder, storage keys and backup format unchanged.

## Round two: type discipline — v4.29

Inter now owns sentences, instructions, captions and generic Reference values.
Space Mono is opt-in for time, numeric data and short labels; Archivo carries
display and session headings. Shared roles use 28/22/18 px headings, 16 px body,
14 px instructions at 1.55 line height, and 12 px time labels. Exercise names
wrap instead of truncating. Palette, plan content and storage are unchanged.

## Round two: honest EF geometry — v4.30

The EF plot uses a uniform 340 × 194 viewBox with proportional height. Its
zero line is the first eligible log within each effort class, labelled with
date and raw EF. Last 12 points are spaced by elapsed date. A minimum ±10%
range prevents tiny changes looking dramatic; larger ranges expand in explicit
5-point steps. Fitted change is regression across dates in percentage points
of reference EF, not an endpoint comparison. Under four logs gets no trend
claim; under 2% fitted movement reads holding steady (a display convention,
not a physiological threshold). Values and limitations are available on tap.
Synthetic tests cover flat, tiny wobble, rise/fall, outliers, rolling reference,
invalid inputs and irregular dates, and run with the existing deploy suite.

## Round two: progressive disclosure and timeline hierarchy — v4.31

Show an intact first source clause when short; remaining clauses reveal on
tap. Long single clauses and scaffold rationale sit behind Session details.
No plan text is rewritten or removed. Gym exercises have a separate session
disclosure. Native details stay open across ticks, weight edits and minute
refreshes during this session without adding storage keys. Session titles get
full width; completion and actions have real 44 px controls below. Scaffold
anchors use a quiet time column, while doable cards carry category borders.

## Owner request: fixed iPhone viewport — v4.32

Disable app gesture zoom explicitly: viewport scale limits, CSS touch-action
allowing pan on both axes without pinch/double-tap zoom, and Safari gesture
event cancellation. Multi-touch also cancels day/week swipe detection.
Single-finger scrolling remains native. Editable controls use at least 16px
to prevent Safari focus zoom. Browser/OS accessibility overrides are outside
the app's control; headless mobile tests are not physical-iPhone verification.

## Round two: no-run days — v4.33

Replace the dashed placeholder with an intentional pause state and a next
planned run link, resolved through DayBuilder. Say no run rather than implying
the entire day is inactive. Existing rest-block text remains available via
the same disclosure; other activities remain in the timeline. No new training
advice, routine values or storage keys are introduced.

## Round two: earned progress — v4.34

Week now separates the 30-week calendar from effort: elapsed segments with
a current-week outline, then cumulative logged kilometres, runs and weeks
with logs. These are not claimed as completed training weeks. Reference and
the logged Today hero surface fastest whole-run times at identical distances
only after two observations; ties retain the earlier record, and no splits
or Strava records are inferred. Missing distance overrides use the existing
planned-distance fallback, disclosed beside records. Invalid/future logs are
excluded from these counters. Tick-on gets a short, motion-optional completion
message; undo removes it. All facts are derived locally, with no new keys.
The old high-specificity entrance animation survived earlier overrides and
faded fresh cards during ticks. Disable it at its source; only small action
feedback animates now, with no full-view fade or delayed first paint.

## September audit: recalibrator — v4.44

The owner approved the existing three §10 anchors, with no invented bands.
They now live in PLAN.recalibrationAnchors and render beside the entered half
time. Removed the obsolete sub-4 verdict and automatic lock language. Riegel
is explicitly a model estimate; comparison does not change the stored plan.
No thresholds are inferred for times between or beyond the anchors.

## September audit: actual run entry — v4.45

Paste-to-parse previews local text before seeding editable distance, moving
time, pace and HR controls. Steppers remain; direct input removes range traps.
Missing HR/temperature stay missing. Editing distance preserves measured time,
and an unchanged save preserves seconds exactly. Distance overrides use the
existing runlog key; backups remain compatible. The same logger is available
on unscheduled past/today dates; unclassified runs count in totals without
being silently treated as easy. Users can explicitly classify them.
Parser fixtures are invented. Mobile-viewport playthroughs covered preview,
correction, save, reload, unchanged re-save and progress on planned/rest dates.
App/cache captures agree at 4.45.0; 15,980 existing checks plus import tests pass.
The owner approved only the §10 anchors, and explicitly left fuelling pending.

## September audit: honest recorded distance — v4.46

Recorded distance now takes actual logs first, then planned distance for ticks,
without counting both. Applies to weekly totals, the season skyline and the
pre-long-run check, including unplanned logs. The guard resolves each date
instead of reconstructing a standard week. Missing ticks/logs are unknown,
never labelled behind. Weekly comparisons describe recorded evidence, with
planned-distance estimates disclosed. Average-HR grouping is labelled as an
estimate until stream import supplies measured intervals. Unclassified logs
no longer receive an EF best/comparison against other unclassified effort.
