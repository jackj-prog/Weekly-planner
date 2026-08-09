# CLAUDE.md — Week OS

Personal routine app for one user. It runs their life through a
30-week marathon training block and is the single thing they open to
answer "what am I doing right now, today, and this week."

This file is the **complete source of truth** for the routine content.
Design the app from first principles, but NEVER alter the training
data, day structures, times, or rules below unless explicitly asked.

---

## 1. Context

- User: works Mon/Wed/Thu, college day per the scaffold eras (§5),
  structured self-study otherwise. Personal detail is kept generic by
  design — the repo describes a schedule, not a person.
- Mission: first marathon — **Bank of Cyprus Nicosia Marathon, Cyprus,
  Sun 24 Jan 2027, gun 06:45** (pre-dawn; sunrise ≈06:50). Flat and fast:
  ~120 m climb over 42.2 km. Requires international travel (UTC+2).
- Block: 30 weeks, **Mon 29 Jun 2026 → Sun 24 Jan 2027**.
- Goal: **4:00** (5:41/km). Stretch bet: **sub-3:45** (5:20/km).
  A December tune-up half recalibrates the target (see §10).
- The user is disciplined and data-driven; the app should be dense with real
  information, zero filler, and honest about hard days.

## 2. Hard technical constraints

- Vanilla HTML/CSS/JS. No frameworks, no build step, no dependencies.
- Offline-first PWA: manifest + service worker, cache-first, works with
  no network after first load.
- Target device: iPhone Safari, installed to home screen (standalone).
  apple-touch-icon, safe-area insets, 390px design width.
- Persistence: localStorage only, keyed per ISO date (e.g. done-2026-07-01;
  run log entries as runlog-ISO = {sec, hr, km?}).
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
7. Race countdown (weeks + days to gun) always one glance away, plus the
   next KEY date (TT → parkrun → half → rehearsal → race) as a chip on
   today.
8. **The app closes the loop (v3.0):** any run on or before today can be
   logged in two taps — time + avg HR (+ optional km override) on the
   run hero. The app computes pace and EF (m/min ÷ HR), stores it per
   date (`runlog-ISO`), includes it in backups, and trends easy-run EF
   on Reference with a sparkline. Prescription AND readback, offline.
9. Blocks may carry a structured pacing `table` (TT lap script, race
   splits) — rendered as a mono split table wherever the block renders.
   Content lives in data/plan.js like everything else.

## 5. Fixed life scaffold (non-negotiable anchors)

| Anchor | When | Detail |
|---|---|---|
| Work | See scaffold eras below | Lunch 12:00–13:00. ~2h passive German listening. Quiet spells absorb study — never flat out. |
| Commute | Work days 06:45 & 16:30, ~15–30 min | German podcasts. |
| College | Tue → Mon (see eras) | Includes flexible study in free periods (08:00–15:00). |
| Dinner | Mon–Thu 18:30–19:30 | Fixed anchor. Never scheduled over. |
| Friday evening | Fri from ~15:30 through the evening | Standing plans, out; basketball happens from here. |
| Anki (German) | Daily, 15 min with breakfast | Non-negotiable. |
| Reading | Nightly 22:00–22:30 · Thu anchor 21:00–22:00 · Sun catch-up 19:30–21:00 | ~200 pages/week target. |
| Sleep | Lights out 22:30 every night | Wake 06:00 work days, 06:45 on the college day (Tue then Mon), 07:00 Fri, 07:30 weekend. |
| Basketball | Fri ~19:00–20:00 | Cross-training; flexes first (§12). |

Weekly load budget for sanity: work 25.5h · college 7.5h · study ~12h ·
German total ~16–17h (only ~4–5.5h active; rest is passive/media/Anki) ·
gym 2–2.5h · running per plan · reading 6h.

**Scaffold eras (§16 Q1 answered, Jul 2026).** Life changes twice mid-block:
- **Wks 1–2** (until 12 Jul): as originally planned — **Tuesday is a
  college day** (08:00–15:00), easy run 16:15, Upper A 19:30.
- **Wks 3–11** (from 13 Jul): the Tuesday course finished. **Tuesday becomes a work
  day** (07:00–16:30) — the easy run slides to **17:10** (home off the
  16:30 commute), Upper A unchanged at 19:30. Study no longer needs its own
  Tuesday evening slot; it rides the quiet spells at work.
- **Wks 12–30** (from Mon 14 Sep, the second Monday): **College moves to
  Mondays.** Monday becomes the college day (08:00–15:00, wake 06:45) while
  keeping its evening intact — German active 19:30, still no run, no
  gym. Tuesday stays a work day. Holiday/race weeks still override.
- **Punchbag retired (Jul 2026, from Wk 4):** Lower B moves off Saturday
  into Monday 17:10 for Wks 4–10 (day-after-long-run legs — Saturday
  stays fresh for Sunday); Wks 11–16 it drops to a ~35-min maintenance
  version (keep the hinge, lose the fatigue); from Wk 17 Monday is the
  week's true zero day (no run, no gym) through the 50–60 km weeks and
  taper. Wks 1–3 keep the original layout as lived.
- **Upper B moves Fri 13:00 → Sat 10:00 (Jul 2026, from Wk 4):**
  Fridays proved the fragile day (German + evening plans + basketball), and
  Base Saturdays are clear (Sat km is mostly 0 until ~Wk 11). Friday
  becomes gym-free; Wk 17 keeps Upper B after the parkrun; Wk 24
  Saturday has no gym (half taper).

## 6. Standard week templates (with times)

Run scheduling durations: easy pace ≈ 6.6 min/km · Wednesday quality ≈
6.1 min/km (includes ~10 min easy warm-up guidance) · Sunday long ≈
6.75 min/km. Add 15 min shower after every run.

### Monday — legs (Base) then the zero day. No run, ever.
- **Wks 1–3 (as lived):** work scaffold · 17:00 punchbag · evening as
  below. (Punchbag retired from Wk 4.)
- **Wks 4–10 (work):** 06:00 Wake + Anki · 06:45 commute · 07:00–16:30
  Work · 16:30 commute · **17:10 Gym — Lower B** (moved off Saturday —
  day-after-long-run legs, RPE ≤ 7, never grind) · 18:05 shower + snack.
- **Wks 11–16 (work Wk 11; college on Monday from Wk 12, wake 06:45):**
  **Lower B (maintenance)** ~35 min after work/college — deadlift 2×5 @
  RPE 6–7 · RDL 2×8 light · calf raises 3×15 · plank 2×45s.
- **Wks 17+ :** evening completely OFF — Monday is the week's true zero
  day (no run, no gym) as the 50–60 km weeks arrive.
- **Every era:** 18:30 dinner · 19:30–21:00 German active study ·
  21:00–22:00 German media · 22:00 read · 22:30 sleep. Monday never
  carries a run.

### Tuesday — easy run + Upper A (scaffold varies by era — see §5)
- **Wks 1–2 (college era):** 06:45 wake + Anki · 08:00–15:00 College (incl
  study periods) · home ~16:00 · **16:15 Easy run** · study until 18:30 · 18:30
  dinner · **19:30 Upper A** · wind down · read · sleep.
- **Wks 3+ (work day):** 06:00 wake + Anki · 07:00–16:30 Work (study in the
  quiet spells) · 16:30 commute · **17:10 Easy run (Tue km)** · shower ·
  18:30 dinner · **19:30 Gym — Upper A** (bench/row/OHP/dips/curls;
  drive over, no run-commute — legs are for running) · 20:45 wind down ·
  22:00 read · 22:30 sleep.
- **Wks 11+ :** Upper A 19:30–20:45 is followed by **Core + calves
  20:45–21:10** (~25 min, already at the gym), then wind down 21:10.
  Tuesday is five days clear of the Sunday long run — the only slot in
  the week where calf loading costs nothing.

Upper A every era: **bench 4×6–8 (pull-aparts 4×15–20 in the rests) ·
row 4×6–8 · OHP 3×8 · weighted dips 3×8–10 · EZ bar curls 3×10–12 ·
face pulls 3×15** (see gym programming).
Week 23 special: the Tue run's first 5 km are the **Pro 4 fit-check**
(exchange window opens).

### Wednesday — quality run (the week's hard session)
Work day scaffold as Monday until 16:30 · **17:10 Quality run** (session
from §7, ~Wed km, Evo SL, warm up 10 min easy first) · quick shower ·
18:30 dinner · **19:30–21:00 Study** (moved into the old gym slot — any subject) ·
21:00 wind down · 22:00 read · 22:30 sleep.

### Thursday — easy run + protected evening
Work day scaffold · **17:10 Easy run (Thu km) + 4×20 s strides** ·
Tue/Thu easy runs start with **2×15 pogo hops** (tendon stiffness —
running economy for free) · shower + snack ·
18:30 dinner · **19:00–21:00 protected free evening** (the release
valve; flex ≤1h to study only on deadline weeks) · 21:00 deep reading
anchor · 22:00 read · 22:30 sleep.

### Friday — German + evening out + basketball. No run; no gym from Wk 4.
07:00 wake + Anki · **07:30 German active study** (end time by phase:
Base 12:00 · Build 11:30 · from Wk 23 and Taper 10:30) · lunch ·
13:00 free/errands (Upper B lived here 13:00–14:30 in Wks 1–3) ·
15:30 out — standing plans · **19:00 Basketball 1 hr** (unless the week
says skip — §7/§9) · evening free, out · 22:00 read · sleep.

### Saturday — buffer run + study
07:30 wake + Anki · 08:00 breakfast · **08:30 Easy buffer run (Sat km)**
— if Sat km = 0 (most of Base): no run ·
after the run: **Wks 1–3 (as lived): Lower B ~50 min** — and **no leg
or calf work on any Saturday from Wk 4 onward**. The day before the long
run stays fresh; that is the whole reason Lower B left Saturday, and
Core + calves lives on Tuesday for the same reason ·
**10:00 Gym — Upper B** (from Wk 4; Fri 13:00 in Wks 1–3) · shower ·
12:00 lunch · 13:00–16:30 Study (any subject) · 16:30 free (social/hobbies) ·
19:00 dinner (carb-forward from Wk 14 whenever tomorrow’s long run
≥ 22 km) · free evening · 22:00 read · 22:30 sleep.

### Sunday — long run + reading
07:30 wake + Anki · 08:15 porridge + coffee (fuel) · **08:30 LONG RUN**
(session from §7) · shower + big refuel · study from ~13:30 (start
shifts later after the biggest runs; end 16:30) · 17:00 German media
(film/series in German) · 18:00 dinner · 18:30 free · 19:30–21:00
Sunday reading catch-up · 21:00 wind down (reading IS wind down) ·
22:00 read · 22:30 sleep.

### Phase deltas summary
- Fri German active end: 12:00 (Base) → 11:30 (Build) → 10:30 (Wk 23+ and Taper).
- Mon gym: punchbag (Wks 1–3, retired) → Lower B 17:10 (Wks 4–10) →
  Lower B maintenance (Wks 11–16) → zero day (Wk 17+).
- Sat gym: Lower B (Wks 1–3 as lived) → Upper B only from Wk 4. No
  lower-body or calf work on a Saturday ever again — Saturday is the
  long run's rest day.
- Tue gym: Upper A every era → **+ Core + calves from Wk 11** (stays
  through Build, optional in Taper).
- Gym intensity from Wk 23: both upper sessions labelled **maintenance**
  (reduced sets, keep the strength). Race week (30): no gym at all.
- Lean bulk pauses ~Oct–Jan: eat maintenance-plus to fuel mileage.

### Gym programming (exact sessions)
Strength serves the marathon: low volume, decent intensity, zero leg
fatigue near key runs. Compounds first, nothing to failure. The brief:
**functional fit legs, aesthetic fit upper body** — pulling volume kept
close to pushing (rear delts + pull-aparts are shoulder insurance AND
the 3D look).

- **Upper A — Tue 19:30:** bench 4×6–8 · band pull-aparts 4×15–20 (in
  the bench rests) · row 4×6–8 · OHP 3×8 · weighted dips 3×8–10 ·
  EZ bar curls 3×10–12 · face pulls 3×15 (superset curls + face pulls
  to finish inside the 75 min).
- **Upper B — Sat 10:00 (Fri 13:00 in Wks 1–3 as lived):** incline
  bench 4×8–10 · pull-ups 4×max (add weight past 10 reps) · lateral
  raises 4×12–15 · rear-delt flyes 3×12–15 · hammer curls 3×10–12 ·
  rope pushdowns 3×10–12 (superset curls + pushdowns to hold the
  slot) · hanging leg raises 3×10–15.
- **Lower B — Mon 17:10 (Base only; Sat in Wks 1–3 as lived, Monday
  from Wk 4; maintenance 2×5 Wks 11–16, retired from Wk 17):** deadlift 3×5 @ RPE 7 · RDL 3×8
  light · step-ups 2×10/leg · calf raises 3×15 · plank finisher 3×45s.
  Day-after-long-run legs — stress stacks on tired legs, Saturday stays
  fresh. Calf/tendon work now is injury insurance later. Never grind —
  Wednesday quality is two days off.
- **Plyo micro-dose:** Tue/Thu easy runs start with 2×15 pogo hops
  (stiff ankles, quiet landings) — tendon stiffness and running economy
  at near-zero fatigue cost. Thu still finishes with the 4×20 s strides.
- **Session rules:** ramp 2 warm-up sets on the first lift · top of the
  rep range on every set → +2.5 kg next week (upper days only; Lower B
  holds at RPE ≤ 7, it is insurance not progression) · rest 2–3 min on
  compounds, 60–90 s on accessories.
- **Core + calves — Tue 20:45, from Wk 11 (~25 min, after Upper A):**
  straight-leg calf raises 2×15 · bent-knee calf raises 2×12 (soleus —
  the marathon muscle) · plank 3×45s · side plank 2×30s/side · dead
  bugs 3×10 · glute bridges 2×15 · calves + hips stretch.
  Non-negotiable through Build — the trunk and calves carry km 30+;
  optional again in Taper. **It sits on Tuesday, not Saturday:** loaded
  calves ~20 h before a 26–32 km long run is the exact mistake moving
  Lower B off Saturday was meant to prevent. Tuesday is five days clear
  of Sunday, in a slot already at the gym after Upper A.
- **Maintenance from Wk 23 (both upper days):** 2 hard sets per lift,
  3 reps in reserve (pull-aparts and rear delts stay — they cost
  nothing). Strength holds on far less than it was built on.
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
| 7 | 10–16 Aug | Base | 29 | 15 | Tempo 10 min steady | Long 15 easy | First tempo |
| 8 | 17–23 Aug | Base | 23 | 11 | Easy | Long 11 easy | CUTBACK · **2-MILE TT Fri** · Tue 400s rehearsal (§9) |
| 9 | 24–30 Aug | Base | 34 | 16 | Tempo 15 min | Long 16 easy | |
| 10 | 31 Aug–6 Sep | Base | 38 | 18 | Tempo 20 min | Long 18 easy | Base complete |
| 11 | 7–13 Sep | Build | 41 | 19 | Tempo 2×10 min @ threshold | Long 19 easy | Build begins |
| 12 | 14–20 Sep | Build | 43 | 21 | Tempo 25 min continuous | Long 21 easy | |
| 13 | 21–27 Sep | Build | 35 | 16 | Easy + strides | Long 16 easy | CUTBACK |
| 14 | 28 Sep–4 Oct | Build | 42 | 22 | 5×3 min @ threshold | Long 22 — last 6 @ MP | First MP work; study modules start |
| 15 | 5–11 Oct | Build | 46 | 24 | Tempo 25 min | Long 24 — last 6 @ MP | |
| 16 | 12–18 Oct | Build | 50 | 26 | 4×5 min @ threshold | Long 26 — last 8 @ MP | |
| 17 | 19–25 Oct | Build | 36 | 16 | Easy 5 (race week) | Long 16 easy — recovery | CUTBACK · KEY · **PARKRUN 5K PB Sat** · no basketball |
| 18 | 26 Oct–1 Nov | Build | 50 | 26 | Tempo 30 min | Long 26 — 2×5 @ MP | |
| 19 | 2–8 Nov | Build | 54 | 28 | 6×3 min @ threshold | Long 28 — last 10 @ MP | |
| 20 | 9–15 Nov | Build | 58 | 30 | Tempo 2×15 min | Long 30 — 12 @ MP | KEY · first 30 km |
| 21 | 16–22 Nov | Build | 46 | 22 | Easy + strides | Long 22 easy | CUTBACK |
| 22 | 23–29 Nov | Build | 56 | 28 | Tempo 30 min | Long 28 — last 10 @ MP | KEY · racer arrives, keep boxed |
| 23 | 30 Nov–6 Dec | Build | 60 | 30 | Tempo 2×15 min | Long 30 — last 12 @ MP (Evo SL) | KEY · peak volume · Pro 4 fit-check Tue |
| 24 | 7–13 Dec | Build | 35 | 21 | — | — | KEY · **TUNE-UP half** · no basketball (see §9) |
| 25 | 14–20 Dec | Build | 46 | 22 | Easy | Long 22 easy | CUTBACK · optional Pro 4 parkrun Sat (controlled) |
| 26 | 21–27 Dec | Build | 56 | 26 | Tempo 20 min | **DRESS REHEARSAL 26 km — last 14–16 @ MP (Pro 4)** | KEY · off work · Christmas Fri · no basketball |
| 27 | 28 Dec–3 Jan | Build | 58 | 30 | Easy + strides | **PEAK 30 km easy/steady (Evo SL) — cap at 3h20, run by time** | KEY · off work · NYD Fri · no basketball |
| 28 | 4–10 Jan | Taper | 40 | 18 | Easy + strides | Long 18 — mid 6–8 @ MP (Pro 4 sharpener) | KEY · taper begins |
| 29 | 11–17 Jan | Taper | 28 | 13 | 5×3 min @ MP | Long 13 easy | Fresh is the goal |
| 30 | 18–24 Jan | Taper | 15 | 42.2 | — | — | **RACE WEEK** (see §9) · no basketball |

**Base rebalanced (Aug 2026, wks 7–13).** Weekly km raised (27→29 ·
21→23 · 29→34 · 33→38 · 36→41 · 40→43 · 32→35) with every long run
unchanged, pulling the long run's share of the week from ~55–64% down
toward ~47–50%. All growth lands in the Tue/Wed/Thu runs (they were
2–4 km against a 13 km long run — too short to build anything). Build
weeks from 14 stay as planned: their share is already ~50%, normal for
a schedule-constrained marathoner.

## 8. Daily distance algorithm

rest = weekly km − long run.
Wed = round(rest × 0.32), Tue = round(rest × 0.30), Thu = round(rest ×
0.24), each with a minimum of 2. Sat = rest − Wed − Tue − Thu.
If Sat < 2: add Sat into Tue and set Sat = 0 (no Saturday run; full rest
before the long run). These four + the long run must equal weekly km
(±1 acceptable from rounding on the smallest weeks).

## 9. Special weeks & templates (override the standard day)

**Week 8 — 2-mile time trial (Fri 21 Aug, Aberdare track).** The one
sanctioned benchmark before October, on an 8-lane certified 400 m
surface — Friday-only access sets the day, **16:30** sets the shape:
late afternoon is the circadian peak for performance, and it leaves the
German block intact. **Tue: 4×400 m pacing rehearsal** (Evo SL, 1:42–1:43
each, 400 m jog recoveries, ~5 km total) — the only speed work since
June, so the legs meet goal lap pace once before race day; do not race
it · Wed easy 2 km · **Thu shakeout 2 km + strides** (priming, not full
rest — the same way wks 24 and 30 open their race days) · Fri: German
07:30–12:00 as normal · carb lunch 12:00 (~3.5 h out) · top-up snack
14:30 · 15:00 travel · 16:00 warm-up 2 km + strides · **16:30 2-MILE
TIME TRIAL in the Evo SL** — 8 laps, lane 1, THE SCRIPT: laps 1–2 in
1:42–1:43 feeling embarrassingly held back · laps 3–5 hold 1:42 ·
lap 6 is the decision — still controlled? start winding up · laps 7–8
everything. Nothing before lap 6 can win it; everything before lap 6
can lose it (the classic 2-mile death is opening at mile pace and dying
by lap 5 — a fast day shows up in the LAST two laps, nowhere else).
Log the peak HR from the final lap — it recalibrates every training
zone · cool-down · home 18:00 refuel · **basketball shooting
only** · **Sat run dropped** (Upper B stays) — the cost of an all-out
effort, and it clears a full rest day before Sunday. Sun long run 11 km
eased: legs heavy for 2–3 km, run by effort ~15–20 s/km slower than
usual. Week lands ~23 km on the cutback.

**Week 17 — parkrun PB (Sat 24 Oct).** Wed: easy 5 only. Thu: easy 4 +
strides. Fri: NO basketball ("fresh legs for the race"). Sat: light
breakfast 90 min before · travel + 2 km warm-up + 3–4 strides · **09:00
PARKRUN 5K all-out PB in the Evo SL** · even splits, don't sprint km 1 ·
cool-down jog · Upper B 10:30 (legs are done — ride the PB high) ·
normal study afternoon. Sun: easy 16 recovery.

**Week 24 — tune-up (Sun 13 Dec).** Mon: zero day as normal, study eased.
Tue: easy 6. Wed: easy 5 + strides. Thu: REST. Fri: NO basketball. Sat:
3 km shakeout · race prep (kit, pacing plan, early carb dinner). Sun:
**TUNE-UP HALF ~21 km, raced honest** — this sets the marathon target
(§10).

**Week 25 Saturday:** optional parkrun in the Pro 4 at a controlled
80–90% (shoe familiarisation, NOT all-out) — or easy 4 km.

**Holiday template (Wks 26–27, off work Mon–Fri).** Wake 08:00 · Anki ·
breakfast · run of the day at ~09:30 (Mon: full rest, no run) ·
free time through the day · one light study block ~90 min · free
evening · read 22:00. Christmas Day (Fri Wk 26): full rest, no
Anki guilt. New Year's Day (Fri Wk 27): rest — peak 30 km is in two days.

**Week 30 — race week, day by day.**
- Mon: college · easy 5 (16:15) · free evening, feet up.
- Tue: work · easy 4 (17:10) · study 1.5h (19:30, the gym slot) · NO gym.
- Wed: work · easy 4 + strides · study light.
- Thu: work · shakeout 3–4 km (last run at home) · pack.
- Fri: **TRAVEL DAY** — 05:30 wake, fly UK → Larnaca (~4.5 h) + ~45 min
  transfer to Nicosia. **Race kit, Pro 4s, gels and number in hand
  luggage, never the hold.** Check in, 20-min shakeout walk, familiar
  dinner, lights out 22:00. No German block, no basketball.
- Sat: 08:00 big carb breakfast · 09:30 number collection (then off the
  feet — no sightseeing) · **11:00 2 km leg-loosener + strides in full
  race kit** · carb lunch · feet up · early carb dinner 16:30 · final kit
  layout + two alarms 17:30 · **lights out 20:15** (brutal, but the alarm
  is 04:15; 20:15 local is 18:15 UK).
- Sun RACE DAY: **04:15 alarm** · 04:30 porridge + coffee (~2h15 before
  the gun — the same breakfast as every long run) · 05:00 kit, vaseline,
  throwaway layer (6–10 °C and dark) · 05:45 walk to Solomou Square ·
  06:00 bag drop + toilet queue · 06:20 warm-up 1 km + strides ·
  **06:45 MARATHON 42.2 km — Pro 4 · 5:41/km goal · negative split · gel
  every 35–40 min · sunrise 06:50, you run into it · Athalassa false
  flats run by effort not pace · dress for the finish (low teens), not
  the start** · finish ~10:45, free recovery massage, food, warm kit ·
  celebrate · eat again · early night.

**Course & conditions (Nicosia).** Solomou Square → Griva Digeni →
University of Cyprus → Athalassa National Park → Venetian Walls and Old
Town → finish Eleftheria Square. ~120 m total climb — genuinely flat.
January: gun in twilight at 6–10 °C, finishing into the low teens.
Cyprus is UTC+2, so 06:45 local is 04:45 UK body clock — fly out Friday
at the latest and shift bedtime earlier in the days before.

## 10. Paces & the recalibration rule

| Type | Pace |
|---|---|
| Easy / long-run base | by phase — see the band table below |
| Marathon pace (4:00 goal) | **5:41 /km** |
| Tempo / threshold | 5:05–5:20 /km |
| Stretch MP (sub-3:45 bet) | 5:20 /km |

The Week 24 half sets the real target: **1:52–1:55 → sub-4:00 is on ·
~2:00 → lock 4:10–4:15 and run it smart.** Race-day pacing is a
negative split — first half slightly easier than goal. Caveat: the
half comes six days after the 60 km peak week, so the legs will be
heavy — read a near-miss generously.

**Easy pace by phase.** A single 6:20–6:50 band for all 30 weeks hid the
one thing 30 weeks of aerobic work is supposed to move. `band` is the
legal range on any day; `good` is what a clear, 7/10 day on the
benchmark route should return.

| Weeks | Band | Clear day, 7/10 |
|---|---|---|
| 1–6 | 6:25–6:50 | **6:30–6:40** |
| 7–13 | 6:22–6:47 | **6:27–6:37** |
| 14–20 | 6:19–6:44 | **6:24–6:34** |
| 21–27 | 6:16–6:41 | **6:21–6:31** |
| 28–30 | 6:16–6:41 | **6:21–6:31** (same clock, lower HR) |

The band shifts only ~9 s/km across the whole block, and that is
deliberate: easy pace is anchored to marathon pace, and **MP stays 5:41
until the Week 24 half says otherwise** (rule 7). Chasing easy pace down
toward MP is how easy runs quietly become steady runs. If the tune-up
upgrades MP to 5:20, easy re-anchors to ~6:05–6:30 — not one second
before.

**The band is a description, not a target.** If the clock and the talk
test disagree, the talk test wins (rule 1).

**Benchmark run — Thursday easy, km 2–4, before the strides.** Same
route every time, Ghost (never the Evo SL), 8–15 °C, wind under
~15 km/h, 7+ hours sleep, 2+ hours after food, and never the day after
the long run. Log average pace **and average HR** over km 2–4, plus the
temperature. Expect pace at the same HR to improve ~5–8 s/km per 4-week
block early in Base, easing to ~2–4 s/km by peak Build. Above 18 °C add
10–20 s/km before comparing; above 24 °C it is not a benchmark.
**Pace improving while HR climbs is not fitness** — that is Sunday's
session being spent on a Thursday.

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
4. Fuelling is a skill: gels every 35–40 min on every run over 90 min,
   from Wk 7 on (gut training takes weeks — the rule starts with the
   first ~100-min long runs, so race day rehearses something practised).
5. Niggle protocol: anything sharp or one-sided = 2 days off running
   before it becomes 2 weeks. The plan survives missed days, not a
   stress injury.
6. Sleep is where training sticks: 22:30 lights out is part of the plan.
7. The December tune-up sets the race pace — ambition doesn't.
8. From October, evening runs are dark runs: headtorch, hi-vis, lit
   routes.
9. **Long runs are capped by time, not distance: ~3h20 maximum.** Past
   that the injury and recovery cost climbs faster than the aerobic
   return, and at 6:45/km 3h20 is 30 km. If easy pace is slower on the
   day, cut the distance — never chase the number.
10. **Saturday belongs to Sunday.** No leg work, no calf work, no
   intensity on a Saturday from Wk 4 on. The buffer run is easy or it
   doesn't happen.

## 13. Sacrifice ledger (what changed vs life-planner v6.4, and why)

- **Gym 5 → 2 sessions** (Upper A Tue 19:30 · Upper B Sat 10:00 —
  Fri 13:00 until Wk 4, when fragile Fridays lost it).
  Lower A cut immediately; Lower B light on Monday through Base,
  maintenance Wks 11–16, retired from Wk 17 (deadlifts near long runs
  don't mix). What survives of leg work is **Core + calves on Tuesday
  from Wk 11** — the soleus and trunk get their insurance dose five
  days clear of Sunday. Sunday full-body replaced by the long run.
  Running owns the legs; lean bulk pauses ~Oct–Jan, regained after the
  race.
- **Runs live in the evening gaps** (Tue 16:15, Wed/Thu 17:10) and
  weekend mornings — built around the 18:30 dinner anchor. No 05:30 alarms;
  sleep protected.
- **Mon 25-min run → punchbag → retired (Jul 2026)**: Lower B took the
  Monday slot through Base (day-after-long-run legs), holds on as a
  maintenance hinge Wks 11–16, and from Wk 17 Monday is the week's zero
  day — the only fully-off evening in peak Build.
- **German active trims by phase** (Fri block 4.5h → 4h → 2.5–3h from
  Wk 23). All passive German untouched (~11.75h: Anki, commute pods,
  work listening, media).
- **Study moves rather than shrinks**: Wed evening study takes the old gym
  slot (19:30–21:00). ~12h/wk in Build vs 13.5 planned; Thu free
  evening is the named flex on deadline weeks only.
- **Protected and untouched**: Mon–Thu dinners · Friday evenings out · Thu
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
retiming a day's scaffold (e.g. Tuesday becoming a work day mid-block),
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
  The §5 era carries through: Monday stays the college day and
  Tuesday the work day in the recovery block and standing week too.
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

1. ~~**Tuesdays after ~September 2026**~~ — ANSWERED (Jul 2026, see §5
   scaffold eras): the Tuesday course finished early. Tuesday → work
   day from Wk 3 (run to 17:10); from Wk 12 (Mon 14 Sep) college moves
   to Mondays. Study rides work's quiet spells rather than a fixed slot.
2. **Basketball**: confirm the Friday ~19:00 slot is right (time/place).
3. ~~Ticked-history export (JSON)~~ — SHIPPED v1.2: copy-paste backup /
   restore lives on the Reference page.
