# CLAUDE.md — Week OS

Personal routine app for one user. It runs his life through a
30-week marathon training block and is the single thing he opens to
answer "what am I doing right now, today, and this week."

This file is the **complete source of truth** for the routine content.
Design the app from first principles, but NEVER alter the training
data, day structures, times, or rules below unless explicitly asked.

---

## 1. Context

- User: 25, engineering apprentice. Works Mon/Wed/Thu,
  college Tuesday (until ~Sep 2026), structured self-study otherwise.
- Mission: first marathon, **Sun 24 Jan 2027, gun ~09:00**.
- Block: 30 weeks, **Mon 29 Jun 2026 → Sun 24 Jan 2027**.
- Goal: **4:00** (5:41/km). Stretch bet: **sub-3:45** (5:20/km).
  A December tune-up half recalibrates the target (see §10).
- He is disciplined and data-driven; the app should be dense with real
  information, zero filler, and honest about hard days.

## 2. Hard technical constraints

- Vanilla HTML/CSS/JS. No frameworks, no build step, no dependencies.
- Offline-first PWA: manifest + service worker, cache-first, works with
  no network after first load.
- Target device: iPhone Safari, installed to home screen (standalone).
  apple-touch-icon, safe-area insets, 390px design width.
- Persistence: localStorage only, keyed per ISO date (e.g. done-2026-07-01).
- All asset paths RELATIVE (GitHub Pages serves under /week-os/).
- Service worker cache name carries a version string; bump on every
  deploy; show an in-app "Updated — reload" toast on new SW.
- Date logic is local-time. Week number = floor((date − 2026-06-29)/7)+1,
  clamped 1–30. Day index: Mon=0 … Sun=6.
- **All routine content lives in one data module (data/plan.js)** —
  schema and rationale in §14. Rendering code contains zero plan content.

## 3. Design tokens (keep this identity)

- ink #16242a · paper #eef0ea · surface #ffffff · line #dde1da
- accent (race/key/hard) #d6492e
- phases: base #6f8c63 · build #436883 · taper #c5872f
- category colours: run #2c3f46 · cross-train #2f8f83 · gym #8a6d3b ·
  study #7c8a8c · german #3e6b5e · work #55605f · meal #a06a2c ·
  free #9aa4a0 · reading #6d5875 · routine #b9c0b7
- Type: Archivo 800/900 (display) · Space Mono (times/data) · Inter (body)

## 4. Product intent (UX is yours to design)

First-principles design is welcome. These behaviours are the intent:

1. Opens on TODAY. The first thing visible is **Now / Next** — the block
   in progress and the next one or two.
2. **The day's run is the hero**: distance, session, shoe, pace visible
   without scrolling.
3. Two visual weights: fixed life (work, commutes, meals, sleep) renders
   quiet and thin; the variable stuff (runs, gym, cross-training, German
   active, study, reading) renders as full cards.
4. Tick-off only on doable blocks (runs, gym, XT, German active, study,
   reading). Ticks persist per date. No checkbox on lunch.
5. Primary navigation: Today + Week. The 30-week plan overview and a
   reference page (paces/shoes/rules) live behind a secondary menu.
6. A NOW indicator that tracks the clock (minute refresh, date rollover).
7. Race countdown (weeks + days to gun) always one glance away.

## 5. Fixed life scaffold (non-negotiable anchors)

| Anchor | When | Detail |
|---|---|---|
| Work | Mon/Wed/Thu 07:00–16:30 | Lunch 12:00–13:00. ~2h passive German listening during work. |
| Commute | Work days 06:45 & 16:30, ~15–30 min | German podcasts. |
| College | Tue 08:00–15:00 (until ~Sep 2026) | Includes ~3h flexible OU/HNC study periods. **Open question §16.** |
| Dinner | Mon–Thu 18:30–19:30 | Family anchor. Never scheduled over. |
| Mum's | Fri from ~15:30 through the evening | Family time; basketball happens from here. |
| Anki (German) | Daily, 15 min with breakfast | Non-negotiable. |
| Reading | Nightly 22:00–22:30 · Thu anchor 21:00–22:00 · Sun catch-up 19:30–21:00 | ~200 pages/week target. |
| Sleep | Lights out 22:30 every night | Wake 06:00 work days, 06:45 Tue, 07:00 Fri, 07:30 weekend. |
| Punchbag | Mon 17:00–17:30 (after work) | Cross-training; Monday has no run. |
| Basketball | Fri ~19:00–20:00 (from Mum's) | Cross-training; flexes first (§12). |

Weekly load budget for sanity: work 25.5h · college 7.5h · OU ~12h ·
German total ~16–17h (only ~4–5.5h active; rest is passive/media/Anki) ·
gym 2–2.5h · running per plan · reading 6h.

## 6. Standard week templates (with times)

Run scheduling durations: easy pace ≈ 6.6 min/km · Wednesday quality ≈
6.1 min/km (includes ~10 min easy warm-up guidance) · Sunday long ≈
6.75 min/km. Add 15 min shower after every run.

### Monday — recovery, no run
06:00 Wake + Anki (15 min while eating) · 06:45 commute (podcast) ·
07:00–12:00 Work · 12:00 lunch · 13:00–16:30 Work · 16:30 commute ·
**17:00 Punchbag 30 min** · 17:30 shower + snack · 18:30 dinner ·
19:30–21:00 German active study (grammar/writing) · 21:00–22:00 German
media (TV/film) · 22:00 read · 22:30 sleep.

### Tuesday — easy run + Upper A
06:45 wake + Anki + breakfast (lie-in vs work days) · 07:45 commute ·
08:00–15:00 College (incl ~3h OU periods) · 15:00 commute + snack, home
~16:00 · **16:15 Easy run (Tue km)** · shower · OU study until 18:30 ·
18:30 dinner · **19:30 Gym — Upper A** (bench/row/OHP; drive over, no
run-commute — legs are for running) · 20:45 wind down · 22:00 read ·
22:30 sleep.
Week 23 special: the Tue run's first 5 km are the **Pro 4 fit-check**
(exchange window opens).

### Wednesday — quality run (the week's hard session)
Work day scaffold as Monday until 16:30 · **17:10 Quality run** (session
from §7, ~Wed km, Evo SL, warm up 10 min easy first) · quick shower ·
18:30 dinner · **19:30–21:00 OU study** (moved into the old gym slot) ·
21:00 wind down · 22:00 read · 22:30 sleep.

### Thursday — easy run + protected evening
Work day scaffold · **17:10 Easy run (Thu km)** · shower + snack ·
18:30 dinner · **19:00–21:00 protected free evening** (the release
valve; flex ≤1h to OU only on deadline weeks) · 21:00 deep reading
anchor · 22:00 read · 22:30 sleep.

### Friday — German + Upper B + Mum's + basketball. No run.
07:00 wake + Anki · **07:30 German active study** (end time by phase:
Base 12:00 · Build 11:30 · from Wk 23 and Taper 10:30) · lunch ·
**13:00 Gym — Upper B** (incline/pull-ups/arms, on the commute) ·
15:30 Mum's — family · **19:00 Basketball 1 hr** (unless the week says
skip — §7/§9) · evening free at Mum's · 22:00 read · sleep.

### Saturday — buffer run + study
07:30 wake + Anki · 08:00 breakfast · **08:30 Easy buffer run (Sat km)**
— if Sat km = 0: full rest before the long run ·
gym after the run: **Base phase (Wks 1–10): Lower B light-moderate ~50 min**
(deadlift/RDL kept through Base only, no grinding PRs) ·
**from Wk 11: Core + mobility 20 min, optional** (Lower B retired —
running owns the legs) · shower · 12:00 lunch · 13:00–16:30 OU/HNC
study · 16:30 free (social/hobbies) · 19:00 dinner · free evening ·
22:00 read · 22:30 sleep.

### Sunday — long run + reading
07:30 wake + Anki · 08:15 porridge + coffee (fuel) · **08:30 LONG RUN**
(session from §7) · shower + big refuel · OU study from ~13:30 (start
shifts later after the biggest runs; end 16:30) · 17:00 German media
(film/series in German) · 18:00 dinner · 18:30 free · 19:30–21:00
Sunday reading catch-up · 21:00 wind down (reading IS wind down) ·
22:00 read · 22:30 sleep.

### Phase deltas summary
- Fri German active end: 12:00 (Base) → 11:30 (Build) → 10:30 (Wk 23+ and Taper).
- Sat gym: Lower B light (Base) → optional 20-min core (Wk 11+).
- Gym intensity from Wk 23: both upper sessions labelled **maintenance**
  (reduced sets, keep the strength). Race week (30): no gym at all.
- Lean bulk pauses ~Oct–Jan: eat maintenance-plus to fuel mileage.

### Gym programming (exact sessions)
Strength serves the marathon: low volume, decent intensity, zero leg
fatigue near key runs. Compounds first, nothing to failure.

- **Upper A — Tue 19:30:** bench 4×6–8 · row 4×6–8 · OHP 3×8 ·
  face pulls 3×15.
- **Upper B — Fri 13:00:** incline bench 4×8–10 · pull-ups 4×max ·
  lateral raises 3×12 · curls 3×12 + pushdowns 3×12.
- **Lower B — Sat after the buffer run (Base, Wks 1–10, ~50 min):**
  deadlift 3×5 @ RPE 7 · RDL 3×8 light · step-ups 2×10/leg · calf
  raises 3×15. Calf/tendon work now is injury insurance later. Never
  grind — the long run owns tomorrow.
- **Core + mobility — Sat from Wk 11 (20 min, optional):** plank 3×45s ·
  side plank 2×30s/side · dead bugs 3×10 · glute bridges 2×15 · calves +
  hips stretch.
- **Maintenance from Wk 23 (both upper days):** 2 hard sets per lift,
  3 reps in reserve. Strength holds on far less than it was built on.
- **Race week (30):** no gym at all.

## 7. The 30-week block

Columns: week · dates · phase · weekly km · long run km · Wednesday
session · Sunday session · flags/notes.

| Wk | Dates | Phase | km | LR | Wednesday | Sunday | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 29 Jun–5 Jul | Base | 15 | 8 | Easy + strides | Long 8 easy | Settle into 4 runs/wk, all conversational |
| 2 | 6–12 Jul | Base | 17 | 9 | Easy | Long 9 easy | |
| 3 | 13–19 Jul | Base | 19 | 11 | Easy + strides | Long 11 easy | |
| 4 | 20–26 Jul | Base | 16 | 8 | Easy | Long 8 easy | CUTBACK |
| 5 | 27 Jul–2 Aug | Base | 21 | 12 | Easy + strides | Long 12 easy | |
| 6 | 3–9 Aug | Base | 24 | 13 | Easy | Long 13 easy | |
| 7 | 10–16 Aug | Base | 27 | 15 | Tempo 10 min steady | Long 15 easy | First tempo |
| 8 | 17–23 Aug | Base | 21 | 11 | Easy | Long 11 easy | CUTBACK |
| 9 | 24–30 Aug | Base | 29 | 16 | Tempo 15 min | Long 16 easy | |
| 10 | 31 Aug–6 Sep | Base | 33 | 18 | Tempo 20 min | Long 18 easy | Base complete |
| 11 | 7–13 Sep | Build | 36 | 19 | Tempo 2×10 min @ threshold | Long 19 easy | Build begins |
| 12 | 14–20 Sep | Build | 40 | 21 | Tempo 25 min continuous | Long 21 easy | |
| 13 | 21–27 Sep | Build | 32 | 16 | Easy + strides | Long 16 easy | CUTBACK |
| 14 | 28 Sep–4 Oct | Build | 42 | 22 | 5×3 min @ threshold | Long 22 — last 6 @ MP | First MP work; OU modules start |
| 15 | 5–11 Oct | Build | 46 | 24 | Tempo 25 min | Long 24 — last 6 @ MP | |
| 16 | 12–18 Oct | Build | 50 | 26 | 4×5 min @ threshold | Long 26 — last 8 @ MP | |
| 17 | 19–25 Oct | Build | 40 | 16 | Easy 5 (race week) | Long 16 easy — recovery | CUTBACK · KEY · **PARKRUN 5K PB Sat** · no basketball |
| 18 | 26 Oct–1 Nov | Build | 50 | 26 | Tempo 30 min | Long 26 — 2×5 @ MP | |
| 19 | 2–8 Nov | Build | 54 | 28 | 6×3 min @ threshold | Long 28 — last 10 @ MP | |
| 20 | 9–15 Nov | Build | 58 | 30 | Tempo 2×15 min | Long 30 — 12 @ MP | KEY · first 30 km |
| 21 | 16–22 Nov | Build | 46 | 22 | Easy + strides | Long 22 easy | CUTBACK |
| 22 | 23–29 Nov | Build | 56 | 28 | Tempo 30 min | Long 28 — last 10 @ MP | KEY · racer arrives, keep boxed |
| 23 | 30 Nov–6 Dec | Build | 60 | 30 | Tempo 2×15 min | Long 30 — last 12 @ MP (Evo SL) | KEY · peak volume · Pro 4 fit-check Tue |
| 24 | 7–13 Dec | Build | 48 | 21 | — | — | KEY · **TUNE-UP half** · no basketball (see §9) |
| 25 | 14–20 Dec | Build | 46 | 22 | Easy | Long 22 easy | CUTBACK · optional Pro 4 parkrun Sat (controlled) |
| 26 | 21–27 Dec | Build | 56 | 26 | Tempo 20 min | **DRESS REHEARSAL 26 km — last 14–16 @ MP (Pro 4)** | KEY · off work · Christmas Fri · no basketball |
| 27 | 28 Dec–3 Jan | Build | 58 | 32 | Easy + strides | **PEAK 32 km easy/steady (Evo SL)** | KEY · off work · NYD Fri · no basketball |
| 28 | 4–10 Jan | Taper | 40 | 18 | Easy + strides | Long 18 — mid 6–8 @ MP (Pro 4 sharpener) | KEY · taper begins |
| 29 | 11–17 Jan | Taper | 28 | 13 | 5×3 min @ MP | Long 13 easy | Fresh is the goal |
| 30 | 18–24 Jan | Taper | 15 | 42.2 | — | — | **RACE WEEK** (see §9) · no basketball |

## 8. Daily distance algorithm

rest = weekly km − long run.
Wed = round(rest × 0.32), Tue = round(rest × 0.30), Thu = round(rest ×
0.24), each with a minimum of 2. Sat = rest − Wed − Tue − Thu.
If Sat < 2: add Sat into Tue and set Sat = 0 (no Saturday run; full rest
before the long run). These four + the long run must equal weekly km
(±1 acceptable from rounding on the smallest weeks).

## 9. Special weeks & templates (override the standard day)

**Week 17 — parkrun PB (Sat 24 Oct).** Wed: easy 5 only. Thu: easy 4 +
strides. Fri: NO basketball ("fresh legs for the race"). Sat: light
breakfast 90 min before · travel + 2 km warm-up + 3–4 strides · **09:00
PARKRUN 5K all-out PB in the Evo SL** · even splits, don't sprint km 1 ·
cool-down jog · normal study afternoon. Sun: easy 16 recovery.

**Week 24 — tune-up (Sun 13 Dec).** Mon: punchbag as normal, OU eased.
Tue: easy 6. Wed: easy 5 + strides. Thu: REST. Fri: NO basketball. Sat:
3 km shakeout · race prep (kit, pacing plan, early carb dinner). Sun:
**TUNE-UP HALF ~21 km, raced honest** — this sets the marathon target
(§10).

**Week 25 Saturday:** optional parkrun in the Pro 4 at a controlled
80–90% (shoe familiarisation, NOT all-out) — or easy 4 km.

**Holiday template (Wks 26–27, off work Mon–Fri).** Wake 08:00 · Anki ·
breakfast · run of the day at ~09:30 (Mon: punchbag instead, no run) ·
family/free through the day · one light OU block ~90 min · family
evening · read 22:00. Christmas Day (Fri Wk 26): full rest, family, no
Anki guilt. New Year's Day (Fri Wk 27): rest — peak 32 km is in two days.

**Week 30 — race week, day by day.**
- Mon: work · easy 5 (17:10) · dinner · free evening, feet up.
- Tue: normal daytime · easy 4 (16:15) · OU 1.5h · dinner · NO gym.
- Wed: work · easy 4 + strides · dinner · OU light.
- Thu: work · shakeout 3–4 km (last run) · dinner · protected evening + reading anchor.
- Fri: no German block (rest the brain) · kit prep + logistics (number,
  gels, drop bag, route) 12:45 · Mum's from 15:30 · NO basketball.
- Sat: big carb breakfast · rest (optional 2 km leg-loosener) · carb
  lunch · feet up · early carb dinner 17:00 · final kit layout
  (Pro 4s, race socks, gels, vaseline, alarm) · wind down early · lights
  out 22:00.
- Sun RACE DAY: 06:00 wake, porridge + coffee (3h before gun), sip
  water · 07:00 travel, warm layers · 08:00 bag drop, toilet queue,
  1 km jog + strides · **09:00 MARATHON 42.2 km — Pro 4 · 5:41/km goal ·
  negative split · gel every 35–40 min** · finish, food, warm kit ·
  celebrate · eat again, early night.

## 10. Paces & the recalibration rule

| Type | Pace |
|---|---|
| Easy / long-run base | 6:20–6:50 /km |
| Marathon pace (4:00 goal) | **5:41 /km** |
| Tempo / threshold | 5:05–5:20 /km |
| Stretch MP (sub-3:45 bet) | 5:20 /km |

The Week 24 half sets the real target: **1:52–1:55 → sub-4:00 is on ·
~2:00 → lock 4:10–4:15 and run it smart.** Race-day pacing is a
negative split — first half slightly easier than goal.

## 11. Shoe rotation & the Pro 4 budget

| Shoe | Size | Job |
|---|---|---|
| Brooks Ghost | UK 9.5 | Easy, recovery, buffer runs |
| Adidas Evo SL | UK 9.5 | Quality, MP work, peak long run, Oct parkrun |
| Adidas Adios Pro 4 | UK 10 | **Race + rehearsals only** |

Pro 4 outings (≈50 km lifetime cap before the race): Wk 23 Tue 5 km
fit-check → optional Wk 25 controlled parkrun → Wk 26 dress rehearsal
(26 km, last 14–16 @ MP) → Wk 28 sharpener (mid 6–8 @ MP) → race-week
shakeout → RACE. Every unplanned easy km in them is bounce borrowed
from mile 22.

## 12. Rules of the block

1. Easy means easy — conversational, or you're stealing from Wednesday
   and Sunday.
2. Cutback weeks are training. No junk km because the number looks small.
3. Basketball flexes first: skip whenever legs are cooked; already OFF
   on weeks 17, 24, 26, 27, 30.
4. Fuelling is a skill: gels every 35–40 min on every run over 90 min
   from October. Race day rehearses something practised.
5. Niggle protocol: anything sharp or one-sided = 2 days off running
   before it becomes 2 weeks. The plan survives missed days, not a
   stress injury.
6. Sleep is where training sticks: 22:30 lights out is part of the plan.
7. The December tune-up sets the race pace — ambition doesn't.

## 13. Sacrifice ledger (what changed vs life-planner v6.4, and why)

- **Gym 5 → 2 sessions** (Upper A Tue 19:30 · Upper B Fri 13:00).
  Lower A cut immediately; Lower B light through Base then retired from
  Wk 11 (deadlifts the day before long runs don't mix). Sunday
  full-body replaced by the long run. Running owns the legs; lean bulk
  pauses ~Oct–Jan, regained after the race.
- **Runs live in the evening gaps** (Tue 16:15, Wed/Thu 17:10) and
  weekend mornings — built around the 18:30 dinner anchor. No 05:30 alarms;
  sleep protected.
- **Mon 25-min run → punchbag 30 min**: Monday is the recovery day.
- **German active trims by phase** (Fri block 4.5h → 4h → 2.5–3h from
  Wk 23). All passive German untouched (~11.75h: Anki, commute pods,
  work listening, media).
- **OU moves rather than shrinks**: Wed evening study takes the old gym
  slot (19:30–21:00). ~12h/wk in Build vs 13.5 planned; Thu free
  evening is the named flex on deadline weeks only.
- **Protected and untouched**: Mon–Thu dinners · Mum Fridays · Thu
  free evening · all reading targets · daily Anki · 22:30 sleep.

## 14. Amendability & life after the race

The plan WILL change — sessions get moved, weeks get ill, Tuesdays get
restructured, and on 25 Jan the block is simply over. Build for
amendment from day one.

**Architecture: content and code never mix.**
- All routine content lives in data/plan.js: START date, the 30-week
  table (§7), the distance algorithm constants (§8), day templates with
  times (§5–6), special-week overrides (§9), paces and shoes (§10–11).
- The day-builder and renderer read only from that module. Amending the
  plan = editing data, never surgery on app logic.
- Dates derive from START + week number everywhere, so a shifted start
  or a future block reuses the same machinery. Calendar-tied flags
  (Christmas, NYD, the off-work fortnight) are week-flagged data and
  get reviewed if dates ever move.

**Amendment workflow (via Claude Code):** one change per prompt → edit
data/plan.js only → run tests → bump SW version → commit + push.
These must all be data-only edits: moving a session between days,
converting a week to cutback after illness, changing a distance,
retiming a day's scaffold (e.g. Tuesday becoming a work day post-HNC),
adding or removing a life anchor.

**In-app day-level flexibility (v1):** "Skip" and "Move to tomorrow"
actions on any doable block, stored as per-date localStorage overrides
that never mutate the plan. Real life gets absorbed without a deploy;
the plan file stays canonical.

**Blocks model — post-marathon territory:**
- The app is built around a `blocks` array. The marathon block is just
  block one (start 2026-06-29, 30 weeks, ends 2027-01-24).
- When a block's end date passes, the app rolls to the next block, or —
  if none exists — to `defaultWeek`: the standing life template
  (v6.4 scaffold restored: 5-day gym split returns including Lower B
  and Sunday full body, German active back to ~6h, lean bulk resumes,
  running defaults to 3 easy runs/week as a hobby until a new goal).
- Ship block two pre-defined — **"Recovery & return", 2 weeks
  post-race**: days 1–3 no running (walk, eat, sleep, celebrate);
  rest of week 1 optional 2×20 min very easy; week 2 easy 4–5 km ×3 if
  legs feel normal; no hard running for the full fortnight; gym returns
  light in week 2. A reverse taper of celebration, not training.
- Defining the next goal (a spring half, the sub-3:45 rematch) =
  appending a new block object. The UI needs zero changes.

## 15. Definition of done (every phase, before every commit)

- A headless test (tests/build.test.js) builds all **210 days**
  (30 weeks × 7): no empty days, block times strictly ordered, all
  times within 00:00–23:59.
- Distance splits: for every non-special week, Tue+Wed+Thu+Sat+LR =
  weekly km (±1).
- Date anchors: 2026-07-01 → week 1, day index 2. 2027-01-24 → week 30,
  day index 6.
- Special-week spot checks: Wk 17 Sat = parkrun · Wk 24 Sun = tune-up
  half · Wk 26 Fri = Christmas rest · Wk 27 Fri = NYD rest · Wk 30 Sun
  = race protocol · Wk 23 Tue run mentions the Pro 4 fit-check.
- Post-block behaviour: 2027-01-27 resolves to the Recovery block;
  2027-03-01 resolves to defaultWeek; no crash on any date from
  2026-06-01 through 2027-12-31.
- JS syntax-checked; app loads offline after first visit; SW version
  bumped on deploy.

## 16. Open questions (ask the user, don't guess)

1. **Tuesdays after ~September 2026**: HNC ends; does Tuesday become a
   work day? The daytime scaffold for Wks ~12+ needs confirming.
2. **Basketball**: confirm Friday ~19:00 from Mum's is right (time/place).
3. Whether ticked-history export (JSON) is wanted in v1 or later.
