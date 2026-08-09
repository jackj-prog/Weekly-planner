# PROMPTS.md — amendment recipes for Week OS

The amendment workflow (CLAUDE.md §14): **one change per prompt → edit
`data/plan.js` only → `node tests/build.test.js` → bump the version in
`sw.js` (CACHE_VERSION) and `js/app.js` (APP_VERSION) → commit + push.**
The 12,000+-check suite is the guardrail that makes these edits safe —
if it passes, the 210-day build, the distance algebra, and every
special-week anchor still hold.

Paste any recipe below into Claude Code, filling the blanks. Each one
is a pure data edit; none should touch rendering code.

## Moving and missing sessions

**Move a session between days (one-off):**
> Real life: I can't run this Wednesday (date ___). In the app I'll use
> "Move to tomorrow" — no plan edit needed. Only edit data/plan.js if
> the change is permanent.

**Move a session permanently (e.g. gym night changes):**
> Move Upper A from Tuesday 19:30 to ___ (day, time) permanently from
> week ___. Edit the day templates (and scaffold eras if the change is
> era-specific) in data/plan.js, keep the session content identical,
> run tests, bump versions, commit and push.

**Convert a week to cutback after illness/injury:**
> I was ill in week ___. Convert it to a cutback: set weekly km to ___
> (roughly 70% of planned), long run to ___, Wednesday session to
> "Easy + strides", and add a note "converted to cutback — ill". Don't
> touch neighbouring weeks. Tests, versions, commit, push.

**Two-day niggle / rest to Sunday:** use the in-app buttons on the run
card (rule 5 protocol) — they're localStorage overrides, no deploy.

## Distances and sessions

**Change one week's volume:**
> Set week ___ to ___ km with a long run of ___ km. Leave the daily
> split to the §8 algorithm. Tests, versions, commit, push.

**Change a Wednesday/Sunday session:**
> In week ___, change the Wednesday session to "___" (and/or Sunday to
> "___"). Update the weekTable row only. Tests, versions, commit, push.

## Scaffold and anchors

**Retime a day's scaffold (new work/college pattern):**
> From week ___ (date ___), my ___ (day) becomes ___ (work/college/
> free). Add a scaffold era to data/plan.js with the day rebuilt around
> the same run and evening anchors, mirror the change in CLAUDE.md §5–6,
> extend the scaffold-era tests, bump versions, commit and push.

**Add / remove / retime a life anchor:**
> ___ (e.g. "Basketball moves to Saturday 10:00" / "College ends in
> June"). Update every affected day template and special week in
> data/plan.js, and the anchor table in CLAUDE.md §5. Tests, versions,
> commit, push.

## Race target

**After the Week-24 tune-up half:** enter the time in the Reference →
Tune-up recalibrator first (advisory, no deploy). To lock a new target:
> My half was ___ . Lock the marathon target at ___ (goal time): update
> PLAN.race goal/goalPace (and stretch if it's dead), the §10 pace
> table, and the race-day MP detail in week 30. Tests, versions,
> commit, push.

## Blocks (after the race)

**Author the next block:**
> Write block three: a ___ (e.g. spring half) block, ___ weeks,
> starting ___ (a Monday). Append a new object to PLAN.blocks with a
> weekTable, day templates reusing the current scaffold era (current-era
> Mondays, work Tuesdays), and any special weeks. The UI needs zero
> changes. Tests, versions, commit, push.

**Return to the standing week early:** shorten the recovery block's
`weeks` — dates past the last block resolve to `defaultWeek`
automatically.

## Ship checklist (every recipe ends the same way)

1. `node tests/build.test.js` → 0 failures.
2. Bump `CACHE_VERSION` in sw.js **and** `APP_VERSION` in js/app.js.
3. Commit with a message saying what changed in the plan, push.
4. GitHub Actions deploys Pages and regenerates `training.ics` — the
   calendar subscription updates itself.
