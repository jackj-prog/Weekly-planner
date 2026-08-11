/* ==========================================================================
   Week OS — data/plan.js
   THE single source of routine content. Rendering code contains zero plan
   content; the day-builder reads only from this module.

   Amending the plan = editing this file, never surgery on app logic.
   (One change per prompt → edit here → run tests → bump SW version → ship.)
   ========================================================================== */

/* Shared gym sessions — one definition, referenced by every scaffold
   that carries them, so the protocol can never diverge between eras. */
const UPPER_A = {
  title: 'Gym — Upper A', cat: 'gym', doable: true, gym: 'upper',
  detail: 'Ramp 2 warm-up sets on bench · top of the range → +2.5 kg next week · pull-aparts ride the bench rests · superset curls + face pulls to finish · drive over, no run-commute',
  plan: [
    { ex: 'Bench press',      sets: '4 × 6–8' },
    { ex: 'Band pull-aparts', sets: '4 × 15–20' },
    { ex: 'Barbell row',      sets: '4 × 6–8' },
    { ex: 'Overhead press',   sets: '3 × 8' },
    { ex: 'Weighted dips',    sets: '3 × 8–10' },
    { ex: 'EZ bar curls',     sets: '3 × 10–12' },
    { ex: 'Face pulls',       sets: '3 × 15' },
  ],
  maintDetail: '2 hard sets each, 3 reps in reserve — keep the look through the taper',
  maintPlan: [
    { ex: 'Bench press',      sets: '2 × 6–8' },
    { ex: 'Band pull-aparts', sets: '2 × 15' },
    { ex: 'Barbell row',      sets: '2 × 8' },
    { ex: 'Weighted dips',    sets: '2 × 8' },
    { ex: 'EZ bar curls',     sets: '2 × 10' },
  ],
};

/* Trunk and calves — the tissue that carries km 30+. Lives on TUESDAY from
   Wk 11 (after Upper A, already at the gym), five days clear of the Sunday
   long run. Deliberately not Saturday: calf loading the day before a 30 km
   run is exactly what moving Lower B off Saturday was meant to prevent. */
const CORE_CALVES = {
  title: 'Core + calves', cat: 'gym', doable: true,
  detail: '~25 min after Upper A — the soleus and the trunk carry km 30+. Light loads, this is insurance not training',
  plan: [
    { ex: 'Straight-leg calf raises', sets: '2 × 15' },
    { ex: 'Bent-knee calf raises',    sets: '2 × 12 — soleus, the marathon muscle' },
    { ex: 'Plank',                    sets: '3 × 45s' },
    { ex: 'Side plank',               sets: '2 × 30s/side' },
    { ex: 'Dead bugs',                sets: '3 × 10' },
    { ex: 'Glute bridges',            sets: '2 × 15' },
    { ex: 'Calves + hips stretch',    sets: '~5 min' },
  ],
};

const UPPER_B = {
  title: 'Gym — Upper B', cat: 'gym', doable: true, gym: 'upper',
  detail: 'Ramp 2 warm-up sets on incline · same rule: top of the range → +2.5 kg · add weight to pull-ups past 10 reps · superset curls + pushdowns to hold the slot',
  plan: [
    { ex: 'Incline bench',      sets: '4 × 8–10' },
    { ex: 'Pull-ups',           sets: '4 × max' },
    { ex: 'Lateral raises',     sets: '4 × 12–15' },
    { ex: 'Rear-delt flyes',    sets: '3 × 12–15' },
    { ex: 'Hammer curls',       sets: '3 × 10–12' },
    { ex: 'Rope pushdowns',     sets: '3 × 10–12' },
    { ex: 'Hanging leg raises', sets: '3 × 10–15' },
  ],
  maintDetail: 'In and out — the race is the priority, the look keeps ticking',
  maintPlan: [
    { ex: 'Incline bench',   sets: '2 × 8' },
    { ex: 'Pull-ups',        sets: '2 × max−3' },
    { ex: 'Lateral raises',  sets: '2 × 12' },
    { ex: 'Rear-delt flyes', sets: '2 × 12' },
    { ex: 'Arms superset',   sets: '1 × 12 + 12' },
  ],
};

const PLAN = {

  /* ---- Race & targets (§1, §10) ------------------------------------- */
  race: {
    name: 'Bank of Cyprus Nicosia Marathon',
    city: 'Nicosia, Cyprus',
    date: '2027-01-24',          // Sun 24 Jan 2027
    gun: '06:45',                // pre-dawn start — sunrise ≈ 06:50
    sunrise: '06:50',
    goal: '4:00',
    goalPace: '5:41/km',
    stretch: 'sub-3:45',
    stretchPace: '5:20/km',
    course:
      'Solomou Square → Griva Digeni → University of Cyprus → Athalassa ' +
      'National Park → Venetian Walls and Old Town → Eleftheria Square. ' +
      '~120 m total climb over 42.2 km — genuinely flat and fast. Watch the ' +
      'gentle false flats out at Athalassa: run them by effort, not pace.',
    conditions:
      'Gun in twilight at 6–10 °C, sunrise ≈06:50, finishing into the low ' +
      'teens. Cool start, warming second half — dress for the finish, not ' +
      'the start line. Cyprus is UTC+2: 06:45 local is 04:45 UK body clock.',
  },

  /* ---- Paces (§10) --------------------------------------------------- */
  paces: [
    { type: 'Easy / long-run base',        pace: 'by phase — see below' },
    { type: 'Marathon pace (4:00 goal)',   pace: '5:41 /km' },
    { type: 'Tempo / threshold',           pace: '5:05–5:20 /km' },
    { type: 'Stretch MP (sub-3:45 bet)',   pace: '5:20 /km' },
  ],

  /* ---- Easy pace, by phase (§10) --------------------------------------
     A single 6:20–6:50 band for all 30 weeks was wrong: 30 weeks of
     aerobic work on 15 → 60 km/wk moves easy pace, and a static band
     hides the improvement. `band` is the legal range on any given day;
     `good` is what a clear, 7/10 day on the benchmark route should
     return. The band shifts ~15 s/km across the block — deliberately
     conservative, because easy pace must stay well clear of MP.
     THE BAND IS A DESCRIPTION, NOT A TARGET. If the talk test and the
     clock disagree, the talk test wins every time (rule 1). */
  easyBands: [
    { fromWk: 1,  band: '6:25–6:50', good: '6:30–6:40', note: 'Settling in. Four runs a week IS the adaptation — pace is not.' },
    { fromWk: 7,  band: '6:22–6:47', good: '6:27–6:37', note: 'First tempos land. Easy days should feel easier, not get quicker.' },
    { fromWk: 14, band: '6:19–6:44', good: '6:24–6:34', note: 'MP work starts. The honest gain here is HR, not the clock.' },
    { fromWk: 21, band: '6:16–6:41', good: '6:21–6:31', note: 'Peak volume. If this band costs effort you are tired, not slow — take the slow end.' },
    { fromWk: 28, band: '6:16–6:41', good: '6:21–6:31', note: 'Taper shows up as a lower HR at the same pace. The clock barely moves; you feel dangerous.' },
  ],
  /* The band only shifts ~9 s/km across 30 weeks, and that is deliberate:
     easy pace is anchored to marathon pace, and MP stays 5:41 until the
     Week 24 half says otherwise (rule 7). Chasing easy pace down toward
     MP is how easy runs quietly become steady runs. If the tune-up
     upgrades MP, the band upgrades with it. */
  easyBandUnlock:
    'These bands assume the 4:00 target (MP 5:41). If the Week 24 half ' +
    'says sub-3:45 is on (MP 5:20), easy re-anchors to roughly 6:05–6:30 ' +
    '— but not one second before the tune-up says so. Easy pace getting ' +
    'quicker at the SAME heart rate is evidence your MP has moved; easy ' +
    'pace getting quicker because you pushed is just Sunday’s session ' +
    'spent early.',

  /* The controlled test. Same day, same route, same shoes — otherwise
     you are measuring the weather, not your fitness. */
  benchmark: {
    slot: 'Thursday easy run — km 2–4, before the strides',
    conditions: [
      '8–15 °C, wind under ~15 km/h, dry',
      'The same flat-ish route every time',
      'Ghost, never the Evo SL — carbon flatters the number',
      '7+ hours sleep, 2+ hours after a meal',
      'Not the day after the long run (Mon/Tue read slow — that is fatigue, not fitness)',
    ],
    log: 'Average pace AND average HR over km 2–4, plus the temperature.',
    expect:
      'Pace at the same HR should improve ~5–8 s/km per 4-week block early ' +
      'in Base, easing to ~2–4 s/km by peak Build. Pace improving while HR ' +
      'climbs is not fitness — that is you pushing, and it gets paid for on ' +
      'Wednesday and Sunday. Above 18 °C add 10–20 s/km before comparing; ' +
      'above 24 °C the run is not a benchmark at all.',
  },
  recalibration:
    'The Week 24 half sets the real target: 1:52–1:55 → sub-4:00 is on · ' +
    '~2:00 → lock 4:10–4:15 and run it smart. Race-day pacing is a negative ' +
    'split — first half slightly easier than goal. Caveat: the half comes ' +
    'six days after the 60 km peak week, so the legs will be heavy — read ' +
    'a near-miss generously.',

  /* ---- Shoes (§11) ---------------------------------------------------- */
  shoes: [
    { shoe: 'Brooks Ghost',       size: 'UK 9.5', job: 'Easy, recovery, buffer runs' },
    { shoe: 'Adidas Evo SL',      size: 'UK 9.5', job: 'Quality, MP work, peak long run, Oct parkrun' },
    { shoe: 'Adidas Adios Pro 4', size: 'UK 10',  job: 'Race + rehearsals only' },
  ],
  pro4Budget:
    'Pro 4 outings (≈50 km lifetime cap before the race): Wk 23 Tue 5 km ' +
    'fit-check → optional Wk 25 controlled parkrun → Wk 26 dress rehearsal ' +
    '(26 km, last 14–16 @ MP) → Wk 28 sharpener (mid 6–8 @ MP) → race-week ' +
    'shakeout → RACE. Every unplanned easy km in them is bounce borrowed ' +
    'from mile 22.',
  /* The §11 outings as data — drives the odometer. km = Pro 4 kilometres
     within that run (fit-check and sharpener are partial-shoe runs). */
  pro4Cap: 50,
  /* The block's decisive moments (§7 KEY flags as data) — drives the
     "next key date" chip. Ordered; di is day index Mon=0. */
  keyEvents: [
    { wk: 8,  di: 4, label: '2-MILE TT' },
    { wk: 17, di: 5, label: 'PARKRUN 5K PB' },
    { wk: 24, di: 6, label: 'TUNE-UP HALF' },
    { wk: 26, di: 6, label: 'DRESS REHEARSAL' },
    { wk: 30, di: 6, label: 'MARATHON' },
  ],

  pro4Outings: [
    { wk: 23, di: 1, km: 5,  label: 'Fit-check (first 5 km of Tue run)' },
    { wk: 25, di: 5, km: 5,  label: 'Controlled parkrun', optional: true },
    { wk: 26, di: 6, km: 26, label: 'Dress rehearsal' },
    { wk: 28, di: 6, km: 7,  label: 'Sharpener (mid 6–8 @ MP)' },
    { wk: 30, di: 3, km: 4,  label: 'Race-week shakeout' },
  ],

  /* ---- Rules of the block (§12) --------------------------------------- */
  rules: [
    'Easy means easy — conversational, or you’re stealing from Wednesday and Sunday.',
    'Cutback weeks are training. No junk km because the number looks small.',
    'Basketball is two sessions, not one: the 1v1 hour is real training (~500 kcal — the block’s only top-end and lateral work), the shooting hour is active recovery (~350 kcal, about a brisk walk). Flex the 1v1 half first: least marathon-specific, highest ankle risk. OFF entirely on weeks 17, 24, 26, 27, 30.',
    'Fuelling is a skill: gels every 35–40 min on every run over 90 min, from Wk 7 on. Race day rehearses something practised.',
    'Niggle protocol: anything sharp or one-sided = 2 days off running before it becomes 2 weeks. The plan survives missed days, not a stress injury.',
    'Sleep is where training sticks: 22:30 lights out is part of the plan.',
    'The December tune-up sets the race pace — ambition doesn’t.',
    'From October, evening runs are dark runs: headtorch, hi-vis, lit routes.',
  ],

  /* ---- Weekly load budget (§5) ---------------------------------------- */
  loadBudget:
    'Work 25.5h · college 7.5h · study ~12h · German ~16–17h total (only ' +
    '~4–5.5h active; rest is passive/media/Anki) · gym 2–2.5h · running ' +
    'per plan · basketball 2h (~850 kcal ≈ 10 km-equivalent: 1 hr training ' +
    '+ 1 hr active recovery) · ' +
    'reading 6h (~200 pages/week).',

  /* ---- Open questions (§16 — surfaced in Reference, never guessed) ---- */
  openQuestions: [
    'Basketball: ANSWERED (Aug 2026) — Friday 19:00–21:00: 1 hr 1v1 (training) then 1 hr shooting (active recovery).',
  ],

  /* ---- Scheduling constants (§6, §8) ----------------------------------
     paceMinPerKm: run duration = km × pace, then +15 min shower after
     every run. split: Wed/Tue/Thu shares of (weekly − LR), min 2 km each;
     Sat takes the remainder; Sat < 2 → folded into Tue, Sat = 0 (full
     rest before the long run). */
  pacing: { easy: 6.6, quality: 6.1, long: 6.75, showerMin: 15 },
  split:  { wed: 0.32, tue: 0.30, thu: 0.24, minKm: 2 },

  /* Gels rule (§12 rule 4): every 35–40 min on runs > 90 min, from October. */
  /* Gut training takes weeks — the rule starts with the first ~100-min
     long runs (Wk 7), not October, so race day rehearses something
     practised (rule 4). */
  gels: { fromDate: '2026-08-10', minRunMin: 90, text: 'Gel every 35–40 min' },

  /* Heart-rate zone MODEL only — generic training science, safe in the
     repo. The athlete's own resting/max HR are personal health data and
     live in localStorage (`hr` key), never here (§1 privacy). Karvonen
     %HRR rather than %max: with a resting HR in the 40s, %max badly
     overstates true intensity at the easy end. */
  zoneModel: {
    method: '% of heart-rate reserve (Karvonen) — max minus rest, not % of max',
    note: 'A low resting HR makes %max flatter the easy end. HRR is the honest one.',
    zones: [
      { z: 1, name: 'Recovery',  lo: 0.50, hi: 0.60, use: 'Shakeouts and the day after something hard. Genuinely gentle.' },
      { z: 2, name: 'Easy',      lo: 0.60, hi: 0.70, use: 'Where 80%+ of this block lives. The §10 pace bands should land here — if they do not, the band is wrong, not you.' },
      { z: 3, name: 'Steady',    lo: 0.70, hi: 0.80, use: 'Marathon-pace work. Useful on purpose; corrosive by accident — this is the grey zone easy runs drift into.' },
      { z: 4, name: 'Threshold', lo: 0.80, hi: 0.90, use: 'Wednesday tempos. The most trainable quality between here and January.' },
      { z: 5, name: 'VO2max',    lo: 0.90, hi: 1.00, use: 'The 2-mile TT, the parkrun, the last two laps of anything. Rarely, and never by accident.' },
    ],
  },

  /* Run-log stepper model (§4.8): estimates centre on the runner's own
     last 3 similar runs; these are the bounds and steps of the ± controls
     and the neutral fallbacks before any history exists. */
  logModel: {
    paceStep: 5,  paceSpan: 30,     // ± seconds/km around the estimate
    hrStep: 2,    hrSpan: 20,       // ± bpm around the estimate
    fallbackHr: { easy: 150, long: 152, quality: 170, race: 182 },
  },

  /* Run cues (§6): micro-doses stapled onto the easy runs — pogo hops for
     tendon stiffness/running economy, Thursday strides to stay sharp.
     Keyed by run slot; special-week fixed runs carry their own details. */
  runCues: {
    tue: 'start with 2×15 pogo hops',
    thu: 'start with 2×15 pogo hops · finish with 4×20 s relaxed strides',
  },

  /* Dark-runs rule (§12 rule 8): evening runs need kit once the light goes.
     Oct: 17:10 runs are dusk/dark · Nov onwards: even 16:15 is dark. */
  darkKit: {
    text: 'Dark out — headtorch + hi-vis',
    tiers: [
      { fromDate: '2026-10-01', afterMin: 1020 },   // ≥17:00 starts
      { fromDate: '2026-11-01', afterMin: 960 },    // ≥16:00 starts
    ],
  },

  /* ====================================================================
     BLOCKS — the app is built around this array (§14). Block one is the
     marathon block; block two ships pre-defined (Recovery & return).
     After the last block, dates resolve to defaultWeek.
     ==================================================================== */
  blocks: [

  /* ---------------------- BLOCK 1 · MARATHON --------------------------- */
  {
    id: 'marathon',
    name: 'Marathon block',
    start: '2026-06-29',         // Mon
    weeks: 30,
    phases: { base: [1, 10], build: [11, 27], taper: [28, 30] },

    /* ---- The 30-week table (§7) ----
       wk · phase · weekly km · long-run km · Wednesday session · Sunday
       session · flags/notes. Dates derive from start + wk everywhere.
       wedShoe/lrShoe assign §11 jobs per week (design, not new training
       data). wed/sun = null → fully special week (§9 owns the days). */
    weekTable: [
      { wk: 1,  phase: 'base',  km: 15, lr: 8,  wed: 'Easy + strides', sun: 'Long 8 easy',  wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'Settle into 4 runs/wk, all conversational' },
      { wk: 2,  phase: 'base',  km: 17, lr: 9,  wed: 'Easy',           sun: 'Long 9 easy',  wedShoe: 'Ghost',  lrShoe: 'Ghost' },
      { wk: 3,  phase: 'base',  km: 19, lr: 11, wed: 'Easy + strides', sun: 'Long 11 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost' },
      { wk: 4,  phase: 'base',  km: 16, lr: 8,  wed: 'Easy',           sun: 'Long 8 easy',  wedShoe: 'Ghost',  lrShoe: 'Ghost', cutback: true },
      { wk: 5,  phase: 'base',  km: 21, lr: 12, wed: 'Easy + strides', sun: 'Long 12 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost' },
      { wk: 6,  phase: 'base',  km: 24, lr: 13, wed: 'Easy',           sun: 'Long 13 easy', wedShoe: 'Ghost',  lrShoe: 'Ghost' },
      /* Wks 7–13 rebalanced (Aug 2026, Strava audit): weekly km raised with
         the long runs UNCHANGED, pulling the long run's share of the week
         from ~55–64% down toward ~47–50%. All growth lands midweek — the
         Tue/Wed/Thu runs were 2–4 km against a demonstrated 13 km long run,
         too short to build anything. Build weeks from 14 stay as planned
         (their share is already ~50%, normal for a constrained schedule). */
      { wk: 7,  phase: 'base',  km: 29, lr: 15, wed: 'Tempo 10 min steady', sun: 'Long 15 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'First tempo' },
      { wk: 8,  phase: 'base',  km: 23, lr: 11, wed: 'Easy',           sun: 'Long 11 easy', wedShoe: 'Ghost',  lrShoe: 'Ghost', cutback: true, notes: '2-MILE TT Fri · Tue 400s rehearsal' },
      { wk: 9,  phase: 'base',  km: 34, lr: 16, wed: 'Tempo 15 min',   sun: 'Long 16 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost' },
      { wk: 10, phase: 'base',  km: 38, lr: 18, wed: 'Tempo 20 min',   sun: 'Long 18 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'Base complete' },
      { wk: 11, phase: 'build', km: 41, lr: 19, wed: 'Tempo 2×10 min @ threshold', sun: 'Long 19 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'Build begins' },
      { wk: 12, phase: 'build', km: 43, lr: 21, wed: 'Tempo 25 min continuous',    sun: 'Long 21 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost' },
      { wk: 13, phase: 'build', km: 35, lr: 16, wed: 'Easy + strides', sun: 'Long 16 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost', cutback: true },
      { wk: 14, phase: 'build', km: 42, lr: 22, wed: '5×3 min @ threshold', sun: 'Long 22 — last 6 @ MP', wedShoe: 'Evo SL', lrShoe: 'Evo SL', notes: 'First MP work; study modules start' },
      { wk: 15, phase: 'build', km: 46, lr: 24, wed: 'Tempo 25 min',   sun: 'Long 24 — last 6 @ MP',  wedShoe: 'Evo SL', lrShoe: 'Evo SL' },
      { wk: 16, phase: 'build', km: 50, lr: 26, wed: '4×5 min @ threshold', sun: 'Long 26 — last 8 @ MP', wedShoe: 'Evo SL', lrShoe: 'Evo SL' },
      { wk: 17, phase: 'build', km: 36, lr: 16, wed: 'Easy 5 (race week)', sun: 'Long 16 easy — recovery', wedShoe: 'Ghost', lrShoe: 'Ghost', cutback: true, key: true, noBasketball: true, notes: 'PARKRUN 5K PB Sat' },
      { wk: 18, phase: 'build', km: 50, lr: 26, wed: 'Tempo 30 min',   sun: 'Long 26 — 2×5 @ MP',     wedShoe: 'Evo SL', lrShoe: 'Evo SL' },
      { wk: 19, phase: 'build', km: 54, lr: 28, wed: '6×3 min @ threshold', sun: 'Long 28 — last 10 @ MP', wedShoe: 'Evo SL', lrShoe: 'Evo SL' },
      { wk: 20, phase: 'build', km: 58, lr: 30, wed: 'Tempo 2×15 min', sun: 'Long 30 — 12 @ MP',      wedShoe: 'Evo SL', lrShoe: 'Evo SL', key: true, notes: 'First 30 km' },
      { wk: 21, phase: 'build', km: 46, lr: 22, wed: 'Easy + strides', sun: 'Long 22 easy',           wedShoe: 'Evo SL', lrShoe: 'Ghost', cutback: true },
      { wk: 22, phase: 'build', km: 56, lr: 28, wed: 'Tempo 30 min',   sun: 'Long 28 — last 10 @ MP', wedShoe: 'Evo SL', lrShoe: 'Evo SL', key: true, notes: 'Racer arrives, keep boxed' },
      { wk: 23, phase: 'build', km: 60, lr: 30, wed: 'Tempo 2×15 min', sun: 'Long 30 — last 12 @ MP (Evo SL)', wedShoe: 'Evo SL', lrShoe: 'Evo SL', key: true, notes: 'Peak volume · Pro 4 fit-check Tue' },
      { wk: 24, phase: 'build', km: 35, lr: 21, wed: null, sun: null,  key: true, noBasketball: true, notes: 'TUNE-UP half (see §9)' },
      { wk: 25, phase: 'build', km: 46, lr: 22, wed: 'Easy',           sun: 'Long 22 easy',           wedShoe: 'Ghost',  lrShoe: 'Ghost', cutback: true, notes: 'Optional Pro 4 parkrun Sat (controlled)' },
      { wk: 26, phase: 'build', km: 56, lr: 26, wed: 'Tempo 20 min',   sun: 'DRESS REHEARSAL 26 km — last 14–16 @ MP (Pro 4)', wedShoe: 'Evo SL', lrShoe: 'Pro 4', key: true, offWork: true, noBasketball: true, notes: 'Off work · Christmas Fri' },
      { wk: 27, phase: 'build', km: 58, lr: 30, wed: 'Easy + strides', sun: 'PEAK 30 km easy/steady (Evo SL) — cap at 3h20, run by time', wedShoe: 'Evo SL', lrShoe: 'Evo SL', key: true, offWork: true, noBasketball: true, notes: 'Off work · NYD Fri' },
      { wk: 28, phase: 'taper', km: 40, lr: 18, wed: 'Easy + strides', sun: 'Long 18 — mid 6–8 @ MP (Pro 4 sharpener)', wedShoe: 'Evo SL', lrShoe: 'Pro 4', key: true, notes: 'Taper begins' },
      { wk: 29, phase: 'taper', km: 28, lr: 13, wed: '5×3 min @ MP',   sun: 'Long 13 easy',           wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'Fresh is the goal' },
      { wk: 30, phase: 'taper', km: 15, lr: 42.2, wed: null, sun: null, race: true, key: true, noBasketball: true, notes: 'RACE WEEK (see §9)' },
    ],

    /* Weeks whose run distances are hand-set by §9, excluded from the
       algorithm split test. (26–27 keep algorithmic distances — only the
       day scaffold goes on holiday.) */
    specialDistanceWeeks: [8, 17, 24, 30],

    /* ---- Phase deltas (§6) ---- */
    friGermanEnd: [
      { fromWk: 1,  end: '12:00' },   // Base
      { fromWk: 11, end: '11:30' },   // Build
      { fromWk: 23, end: '10:30' },   // Wk 23+ and Taper
    ],
    satGym: [
      { fromWk: 1,  mins: 50, title: 'Gym — Lower B (light–moderate)',
        detail: 'Base only · RPE cap, no progression chasing — the long run owns tomorrow',
        plan: [
          { ex: 'Deadlift',          sets: '3 × 5 @ RPE 7' },
          { ex: 'Romanian deadlift', sets: '3 × 8 light' },
          { ex: 'Step-ups',          sets: '2 × 10/leg' },
          { ex: 'Calf raises',       sets: '3 × 15' },
          { ex: 'Plank finisher',    sets: '3 × 45s' },
        ] },
      /* Wk 4+: Lower B moves to Monday (day AFTER the long run) — Saturday
         legs stay fresh. Wks 1–3 keep the old slot so history stays true. */
      /* Nothing on Saturday from Wk 4 onward. Core + calves used to sit
         here from Wk 11, which put calf loading ~20 h before a 26–32 km
         long run and contradicted the reason Lower B was moved off in the
         first place. It now lives on Tuesday (see the Wk 11 scaffold),
         five days clear of Sunday. */
      { fromWk: 4, none: true },
    ],
    gymMaintenanceFromWk: 23,   // both upper sessions → maintenance (reduced sets, keep the strength)
    /* Gym deload on running cutback weeks, from Wk 13 (§6). Strength is
       maintained on roughly a third of the volume that built it, so
       halving sets costs almost nothing — while the fatigue, and the
       connective-tissue load that stacks on top of 40–60 km weeks, does
       come off. LOAD NEVER DROPS: cutting weight is what loses strength;
       cutting sets is what sheds fatigue. Before Wk 13 the running is
       small enough that the gym should just keep building. */
    gymDeload: {
      fromWk: 13, setFactor: 0.5, minSets: 2,
      note: 'Deload — SAME weights, half the sets. The cutback is for adapting, not just for running less',
    },
    bulkNote: 'Lean bulk pauses ~Oct–Jan: eat maintenance-plus to fuel mileage.',

    /* ---- Standard week templates with times (§5–6) ----
       Entry schema:
         t/end        fixed times "HH:MM"
         run          run slot: 'tue' | 'wed' | 'thu' | 'sat' | 'long'
                      (builder computes distance, duration, shoe, pace and
                      injects a 15-min shower block after)
         after: true  starts when the previous block ends (needs end/mins)
         cat          category token (§3)
         doable       tick-off block (runs, gym, XT, German active, study,
                      reading only — never lunch)
         quiet        fixed-life rendering hint (thin row, not a card)   */
    templates: {

      /* Monday — recovery, no run */
      0: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', detail: '15 min Anki while eating — non-negotiable', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', detail: '~2h passive German listening across the day', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', detail: 'German podcasts', cat: 'work', quiet: true },
        { t: '17:00', end: '17:30', title: 'Punchbag', detail: '6 × 3 min rounds, 1 min rest — Monday has no run', cat: 'xt', doable: true },
        { t: '17:30', end: '18:30', title: 'Shower + snack', cat: 'routine', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', detail: 'Fixed anchor — never scheduled over', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'German active study', detail: 'Grammar / writing', cat: 'german', doable: true },
        { t: '21:00', end: '22:00', title: 'German media', detail: 'TV / film in German (passive)', cat: 'german', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],

      /* Tuesday — easy run + Upper A */
      1: [
        { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', detail: 'Lie-in vs work days · 15 min Anki', cat: 'routine', quiet: true },
        { t: '07:45', end: '08:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
        { t: '08:00', end: '15:00', title: 'College', detail: 'Incl ~3h flexible study periods', cat: 'study', quiet: true },
        { t: '15:00', end: '16:00', title: 'Commute + snack', detail: 'Home ~16:00', cat: 'work', quiet: true },
        { t: '16:15', run: 'tue' },
        { after: true, end: '18:30', title: 'Study', detail: 'Until dinner — any subject, interchangeable', cat: 'study', doable: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        Object.assign({ t: '19:30', end: '20:45' }, UPPER_A),
        { t: '20:45', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],

      /* Wednesday — quality run (the week's hard session) */
      2: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', detail: '15 min Anki while eating', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', detail: '~2h passive German listening', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:10', run: 'wed' },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'Study', detail: 'Moved into the old gym slot — any subject, interchangeable', cat: 'study', doable: true },
        { t: '21:00', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],

      /* Thursday — easy run + protected evening */
      3: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', detail: '15 min Anki while eating', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', detail: '~2h passive German listening', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:10', run: 'thu' },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'Protected free evening', detail: 'The release valve — flex ≤1h to study only on deadline weeks', cat: 'free', quiet: true },
        { t: '21:00', end: '22:00', title: 'Deep reading anchor', cat: 'reading', doable: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],

      /* Friday — German + Upper B + evening out + basketball. No run. */
      4: [
        { t: '07:00', end: '07:30', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '07:30', end: '12:00', title: 'German active study', detail: 'The deep German block — end time set by phase', cat: 'german', doable: true, friGerman: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        Object.assign({ t: '13:00', end: '14:30' }, UPPER_B),
        { t: '15:30', end: '19:00', title: 'Afternoon — out', detail: 'Standing Friday plans through the evening', cat: 'free', quiet: true },
        { t: '19:00', end: '20:00', title: 'Basketball — 1v1', detail: 'THE TRAINING HALF. ~500 kcal at ~6.5 METs: continuous, no subs, repeated accelerations, cuts and jumps. This is the block’s only genuine top-end work (running is 98% Z2) and its only lateral loading (running is purely sagittal) — hips, adductors, reactive strength. Also its highest acute injury risk: ankles. Flex THIS half first when legs are cooked', cat: 'xt', doable: true, basketball: true },
        { t: '20:00', end: '21:00', title: 'Basketball — shooting', detail: '~350 kcal at ~4.5 METs — jogging for rebounds, about a brisk walk. Active recovery, not training. Keep this half on tired legs; drop it first when time is short', cat: 'xt', doable: true, basketball: true },
        { t: '21:00', end: '22:00', title: 'Evening — out', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],

      /* Saturday — buffer run + study */
      5: [
        { t: '07:30', end: '08:00', title: 'Wake · Anki', cat: 'routine', quiet: true },
        { t: '08:00', end: '08:30', title: 'Breakfast', cat: 'meal', quiet: true },
        { t: '08:30', run: 'sat' },
        { after: true, satGym: true, cat: 'gym', doable: true, gym: 'lower' },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Study', cat: 'study', doable: true },
        { t: '16:30', end: '19:00', title: 'Free — social / hobbies', cat: 'free', quiet: true },
        { t: '19:00', end: '20:00', title: 'Dinner', cat: 'meal', quiet: true, carbEve: true },
        { t: '20:00', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],

      /* Sunday — long run + reading */
      6: [
        { t: '07:30', end: '08:15', title: 'Wake · Anki', cat: 'routine', quiet: true },
        { t: '08:15', end: '08:30', title: 'Porridge + coffee', detail: 'Fuel the long run', cat: 'meal', quiet: true },
        { t: '08:30', run: 'long' },
        { after: true, mins: 30, title: 'Big refuel', cat: 'meal', quiet: true },
        { t: '13:30', end: '16:30', title: 'Study', detail: 'Start shifts later after the biggest runs · end 16:30', cat: 'study', doable: true },
        { t: '17:00', end: '18:00', title: 'German media', detail: 'Film / series in German (passive)', cat: 'german', quiet: true },
        { t: '18:00', end: '18:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '18:30', end: '19:30', title: 'Free', cat: 'free', quiet: true },
        { t: '19:30', end: '21:00', title: 'Sunday reading catch-up', cat: 'reading', doable: true },
        { t: '21:00', end: '22:00', title: 'Wind down', detail: 'Reading IS wind down', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
    },

    /* ---- Scaffold eras (§16 answered, Jul 2026) ----
       The Tuesday course finished early: from Wk 3 Tuesday is a work day (run
       moves 16:15 → 17:10; study rides the quiet spells at work — never
       flat out). From Wk 12 (Mon 14 Sep, second Monday) college lands
       on Mondays: Monday becomes the college day, evening unchanged.
       Weeks 1–2 keep the original templates so history stays true. */
    scaffolds: [
      { fromWk: 3, days: {
        1: [
          { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', detail: '15 min Anki while eating', cat: 'routine', quiet: true },
          { t: '06:45', end: '07:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
          { t: '07:00', end: '12:00', title: 'Work', detail: 'Quiet spells = study — never flat out', cat: 'work', quiet: true },
          { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
          { t: '13:00', end: '16:30', title: 'Work', detail: 'More study in the gaps', cat: 'work', quiet: true },
          { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
          { t: '17:10', run: 'tue' },
          { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
          Object.assign({ t: '19:30', end: '20:45' }, UPPER_A),
          { t: '20:45', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
          { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
          { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
        ],
      } },
      /* Wks 4–10: punchbag retired (Jul 2026) — Lower B moves to Monday,
         the day AFTER the long run, so Saturday's legs stay fresh for it. */
      { fromWk: 4, days: {
        0: [
          { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', detail: '15 min Anki while eating — non-negotiable', cat: 'routine', quiet: true },
          { t: '06:45', end: '07:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
          { t: '07:00', end: '12:00', title: 'Work', detail: '~2h passive German listening across the day', cat: 'work', quiet: true },
          { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
          { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
          { t: '16:30', end: '17:00', title: 'Commute home', detail: 'German podcasts', cat: 'work', quiet: true },
          { t: '17:10', end: '18:05', title: 'Gym — Lower B (light–moderate)', cat: 'gym', doable: true,
            detail: 'Day-after-long-run legs · RPE cap 7, insurance not progression — never grind, Wednesday quality is two days off',
            plan: [
              { ex: 'Deadlift',          sets: '3 × 5 @ RPE 7' },
              { ex: 'Romanian deadlift', sets: '3 × 8 light' },
              { ex: 'Step-ups',          sets: '2 × 10/leg' },
              { ex: 'Calf raises',       sets: '3 × 15' },
              { ex: 'Plank finisher',    sets: '3 × 45s' },
            ] },
          { t: '18:05', end: '18:30', title: 'Shower + snack', cat: 'routine', quiet: true },
          { t: '18:30', end: '19:30', title: 'Dinner', detail: 'Fixed anchor — never scheduled over', cat: 'meal', quiet: true },
          { t: '19:30', end: '21:00', title: 'German active study', detail: 'Grammar / writing', cat: 'german', doable: true },
          { t: '21:00', end: '22:00', title: 'German media', detail: 'TV / film in German (passive)', cat: 'german', quiet: true },
          { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
          { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
        ],
        /* Upper B also moves Fri → Sat from Wk 4: Fridays proved the
           fragile day, and Base Saturdays are clear (Sat km mostly 0). */
        4: [
          { t: '07:00', end: '07:30', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
          { t: '07:30', end: '12:00', title: 'German active study', detail: 'The deep German block — end time set by phase', cat: 'german', doable: true, friGerman: true },
          { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
          { t: '13:00', end: '15:30', title: 'Free / errands', detail: 'Upper B lives on Saturday now — Friday breathes', cat: 'free', quiet: true },
          { t: '15:30', end: '19:00', title: 'Afternoon — out', detail: 'Standing Friday plans through the evening', cat: 'free', quiet: true },
          { t: '19:00', end: '20:00', title: 'Basketball — 1v1', detail: 'THE TRAINING HALF. ~500 kcal at ~6.5 METs: continuous, no subs, repeated accelerations, cuts and jumps. This is the block’s only genuine top-end work (running is 98% Z2) and its only lateral loading (running is purely sagittal) — hips, adductors, reactive strength. Also its highest acute injury risk: ankles. Flex THIS half first when legs are cooked', cat: 'xt', doable: true, basketball: true },
        { t: '20:00', end: '21:00', title: 'Basketball — shooting', detail: '~350 kcal at ~4.5 METs — jogging for rebounds, about a brisk walk. Active recovery, not training. Keep this half on tired legs; drop it first when time is short', cat: 'xt', doable: true, basketball: true },
          { t: '21:00', end: '22:00', title: 'Evening — out', cat: 'free', quiet: true },
          { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
          { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
        ],
        5: [
          { t: '07:30', end: '08:00', title: 'Wake · Anki', cat: 'routine', quiet: true },
          { t: '08:00', end: '08:30', title: 'Breakfast', cat: 'meal', quiet: true },
          { t: '08:30', run: 'sat' },
          { after: true, satGym: true, cat: 'gym', doable: true, gym: 'lower' },
          Object.assign({ t: '10:00', end: '11:30' }, UPPER_B),
          { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
          { t: '13:00', end: '16:30', title: 'Study', cat: 'study', doable: true },
          { t: '16:30', end: '19:00', title: 'Free — social / hobbies', cat: 'free', quiet: true },
          { t: '19:00', end: '20:00', title: 'Dinner', cat: 'meal', quiet: true, carbEve: true },
          { t: '20:00', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
          { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
          { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
        ],
      } },
      /* Wks 11–16: Lower B drops to maintenance — the hinge and the legs
         stay through the first half of Build at a cost Wednesday won't
         notice. (Wk 11 is still a work Monday; college takes over Wk 12.) */
      { fromWk: 11, days: {
        /* Tuesday picks up Core + calves after Upper A — moved off Saturday
           so the calves are five days clear of the Sunday long run. */
        1: [
          { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', detail: '15 min Anki while eating', cat: 'routine', quiet: true },
          { t: '06:45', end: '07:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
          { t: '07:00', end: '12:00', title: 'Work', detail: 'Quiet spells = study — never flat out', cat: 'work', quiet: true },
          { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
          { t: '13:00', end: '16:30', title: 'Work', detail: 'More study in the gaps', cat: 'work', quiet: true },
          { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
          { t: '17:10', run: 'tue' },
          { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
          Object.assign({ t: '19:30', end: '20:45' }, UPPER_A),
          Object.assign({ t: '20:45', end: '21:10' }, CORE_CALVES),
          { t: '21:10', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
          { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
          { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
        ],
        0: [
          { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', detail: '15 min Anki while eating — non-negotiable', cat: 'routine', quiet: true },
          { t: '06:45', end: '07:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
          { t: '07:00', end: '12:00', title: 'Work', detail: '~2h passive German listening across the day', cat: 'work', quiet: true },
          { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
          { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
          { t: '16:30', end: '17:00', title: 'Commute home', detail: 'German podcasts', cat: 'work', quiet: true },
          { t: '17:10', end: '17:45', title: 'Gym — Lower B (maintenance)', cat: 'gym', doable: true,
            detail: 'Keep the hinge, lose the fatigue · RPE ≤ 7, in and out',
            plan: [
              { ex: 'Deadlift',          sets: '2 × 5 @ RPE 6–7' },
              { ex: 'Romanian deadlift', sets: '2 × 8 light' },
              { ex: 'Calf raises',       sets: '3 × 15' },
              { ex: 'Plank',             sets: '2 × 45s' },
            ] },
          { t: '17:45', end: '18:30', title: 'Shower + snack', cat: 'routine', quiet: true },
          { t: '18:30', end: '19:30', title: 'Dinner', detail: 'Fixed anchor — never scheduled over', cat: 'meal', quiet: true },
          { t: '19:30', end: '21:00', title: 'German active study', detail: 'Grammar / writing', cat: 'german', doable: true },
          { t: '21:00', end: '22:00', title: 'German media', detail: 'TV / film in German (passive)', cat: 'german', quiet: true },
          { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
          { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
        ],
      } },
      { fromWk: 12, days: {
        0: [
          { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', detail: 'College lie-in vs work days · 15 min Anki', cat: 'routine', quiet: true },
          { t: '07:45', end: '08:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
          { t: '08:00', end: '15:00', title: 'College', detail: 'College day (Mondays from 14 Sep) · free periods = study', cat: 'study', quiet: true },
          { t: '15:00', end: '16:00', title: 'Commute + snack', detail: 'Home ~16:00', cat: 'work', quiet: true },
          { t: '16:30', end: '17:05', title: 'Gym — Lower B (maintenance)', cat: 'gym', doable: true,
            detail: 'Keep the hinge, lose the fatigue · RPE ≤ 7, in and out',
            plan: [
              { ex: 'Deadlift',          sets: '2 × 5 @ RPE 6–7' },
              { ex: 'Romanian deadlift', sets: '2 × 8 light' },
              { ex: 'Calf raises',       sets: '3 × 15' },
              { ex: 'Plank',             sets: '2 × 45s' },
            ] },
          { t: '17:05', end: '18:30', title: 'Shower · feet up', cat: 'routine', quiet: true },
          { t: '18:30', end: '19:30', title: 'Dinner', detail: 'Fixed anchor — never scheduled over', cat: 'meal', quiet: true },
          { t: '19:30', end: '21:00', title: 'German active study', detail: 'Grammar / writing', cat: 'german', doable: true },
          { t: '21:00', end: '22:00', title: 'German media', detail: 'TV / film in German (passive)', cat: 'german', quiet: true },
          { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
          { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
        ],
      } },
      /* Wk 17+: Lower B retired for real — Monday becomes the true zero
         day exactly as the 50–60 km weeks arrive (18–23) and stays zero
         through taper. Race week (30) overrides with its own Monday. */
      { fromWk: 17, days: {
        0: [
          { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', detail: 'College lie-in vs work days · 15 min Anki', cat: 'routine', quiet: true },
          { t: '07:45', end: '08:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
          { t: '08:00', end: '15:00', title: 'College', detail: 'College day (Mondays from 14 Sep) · free periods = study', cat: 'study', quiet: true },
          { t: '15:00', end: '16:00', title: 'Commute + snack', detail: 'Home ~16:00', cat: 'work', quiet: true },
          { t: '16:00', end: '18:30', title: 'Full rest — the week’s zero day', detail: 'No run, no gym — Build volume is carried by this evening', cat: 'free', quiet: true },
          { t: '18:30', end: '19:30', title: 'Dinner', detail: 'Fixed anchor — never scheduled over', cat: 'meal', quiet: true },
          { t: '19:30', end: '21:00', title: 'German active study', detail: 'Grammar / writing', cat: 'german', doable: true },
          { t: '21:00', end: '22:00', title: 'German media', detail: 'TV / film in German (passive)', cat: 'german', quiet: true },
          { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
          { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
        ],
      } },
    ],

    /* ---- Special weeks & templates (§9) — override the standard day ----
       Per week: days[dayIndex] with either
         run: {...}   patch the day's run (km/title/detail/shoe/pace)
         noRun: true  remove run + shower
         noGym: true  remove gym blocks
         blocks: []   full replacement day                                 */
    specialWeeks: {

      /* Week 8 — the one sanctioned benchmark before October (Fri 21 Aug),
         on the Aberdare track: 8 lanes, IAAF/UKA-certified surface, so the
         number is properly comparable to October's parkrun. Friday-only
         access sets the day; 16:30 sets the shape (circadian peak, German
         block intact). Tue is a 4×400 pacing rehearsal — the only speed
         work since June, so the legs must meet goal lap pace once before
         race day. Wed trims to 2 km · Thu shakeout primes · Sat run
         dropped as the deliberate cost of an all-out effort (Upper B
         stays). Week lands ~23 km; 8 sits in specialDistanceWeeks. */
      8: {
        label: 'Cutback · 2-MILE TT',
        days: {
          1: { run: { km: 5, title: 'TT rehearsal — 4 × 400 m', shoe: 'Evo SL', detail: 'Evo SL · 1.5 km easy warm-up · 4 × 400 m at goal lap pace — 1:42–1:43 each, watch-measured on a flat stretch — with 400 m jog recoveries · 1 km cool-down. The ONLY job is to teach the legs what 1:42 feels like so Friday’s open is automatic. Do not race these — leave the fitness in them' } },
          2: { run: { km: 2, title: 'Easy 2', detail: 'Short and genuinely easy — the time trial is Friday' } },
          3: { run: { km: 2, title: 'Shakeout + strides', detail: 'Very easy 2 km + 3–4 relaxed strides. A full rest day before a race leaves the legs flat — this primes them at no fatigue cost, the same way wks 24 and 30 open their race days' } },
          4: { blocks: [
            { t: '07:00', end: '07:30', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '07:30', end: '12:00', title: 'German active study', detail: 'The deep German block — the 16:30 gun means today keeps it in full', cat: 'german', doable: true, friGerman: true },
            { t: '12:00', end: '13:00', title: 'Lunch', detail: 'Carb-forward, ~3.5 h before the gun — normal food, nothing new', cat: 'meal', quiet: true },
            { t: '13:00', end: '14:30', title: 'Free — legs up', cat: 'free', quiet: true },
            { t: '14:30', end: '14:45', title: 'Top-up snack', detail: 'Small and simple ~2 h out — banana or toast, or practise a gel', cat: 'meal', quiet: true },
            { t: '15:00', end: '16:00', title: 'Travel to Aberdare', detail: '~1 h — 8-lane certified track, worth the drive', cat: 'routine', quiet: true },
            { t: '16:00', end: '16:25', title: 'Warm-up', detail: '2 km easy + 3–4 build-up strides — never hit a hard effort cold', cat: 'run', quiet: true },
            { t: '16:30', end: '16:45', title: '2-MILE TIME TRIAL', detail: 'Evo SL · 8 laps, LANE 1 (add ~18 m past the line) · THE SCRIPT — laps 1–2: 1:42–1:43, feeling embarrassingly held back · laps 3–5: hold 1:42 · lap 6: the decision — still controlled? start winding up · laps 7–8: everything. Nothing before lap 6 can win this; everything before lap 6 can lose it — the classic 2-mile death is opening at mile pace and dying by lap 5. A fast day shows up in the LAST two laps, nowhere else · afterwards log the peak HR from the final lap — it recalibrates every training zone for the next 22 weeks', cat: 'run', doable: true, runKm: 3.2, shoe: 'Evo SL', estPace: '4:15',
              table: { title: 'THE SCRIPT — 8 laps, lane 1', cols: ['Lap', 'Target', 'Clock'], rows: [
                ['1', '1:42–1:43 — held back', '1:42'],
                ['2', '1:42', '3:25'],
                ['3', '1:42', '5:07'],
                ['4', '1:42', '6:49'],
                ['5', '1:42', '8:31'],
                ['6', 'THE DECISION', '10:13'],
                ['7–8', 'everything', 'the close decides it'],
              ] } },
            { t: '16:45', end: '17:00', title: 'Cool-down jog', detail: 'Never just stop', cat: 'run', quiet: true },
            { t: '17:00', end: '18:00', title: 'Travel home', cat: 'routine', quiet: true },
            { t: '18:00', end: '19:00', title: 'Refuel', detail: 'Proper meal within the hour — carbs and protein', cat: 'meal', quiet: true },
            { t: '19:00', end: '20:00', title: 'Basketball — shooting only', detail: 'Shots and light movement only — no full-court games two hours after a maximal effort', cat: 'xt', doable: true, basketball: true },
            { t: '20:00', end: '22:00', title: 'Evening — feet up', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          5: { noRun: true, note: 'REST — Saturday run dropped, the cost of Friday’s all-out effort' },
          6: { run: { detailExtra: 'Legs heavy for the first 2–3 km, 40 h after the TT — run by effort and let the pace sit 15–20 s/km slower than usual. Do not chase last week’s numbers' } },
        },
      },

      /* Week 17 — parkrun PB (Sat). Wed easy 5 · Thu easy 4 + strides ·
         Fri no basketball (flag) · Sun easy 16 recovery (table).
         Tue 6 keeps the 40 km week honest around the hand-set days. */
      17: {
        label: 'PARKRUN 5K PB',
        days: {
          1: { run: { km: 6, title: 'Easy run', detail: 'Race week — keep it genuinely easy' } },
          2: { run: { km: 5, title: 'Easy 5', detail: 'Race week — nothing hard' } },
          3: { run: { km: 4, title: 'Easy 4 + strides', detail: '3–4 relaxed strides to stay sharp' } },
          5: { blocks: [
            { t: '07:30', end: '08:00', title: 'Wake · Anki · light breakfast', detail: '90 min before the race', cat: 'routine', quiet: true },
            { t: '08:15', end: '08:50', title: 'Travel + warm-up', detail: '2 km easy jog + 3–4 strides', cat: 'run', quiet: true },
            { t: '09:00', end: '09:25', title: 'PARKRUN 5K — all-out PB', detail: 'Evo SL · even splits, don’t sprint km 1', cat: 'run', doable: true, runKm: 5, shoe: 'Evo SL', estPace: '4:10' },
            { t: '09:25', end: '09:45', title: 'Cool-down jog', cat: 'run', quiet: true },
            { t: '10:00', end: '10:30', title: 'Shower + refuel', cat: 'routine', quiet: true },
            Object.assign({ t: '10:30', end: '12:00' }, UPPER_B),
            { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '16:30', title: 'Study', detail: 'Normal study afternoon — any subject, the slot is the commitment', cat: 'study', doable: true },
            { t: '16:30', end: '19:00', title: 'Free — social / hobbies', cat: 'free', quiet: true },
            { t: '19:00', end: '20:00', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '20:00', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
        },
      },

      /* Week 23 — Tue run opens the Pro 4 exchange window. */
      23: {
        label: 'Peak volume',
        days: {
          1: { run: { detailExtra: 'First 5 km are the Pro 4 fit-check — exchange window opens', shoe: 'Pro 4 (first 5 km) → Ghost' } },
        },
      },

      /* Week 24 — tune-up half (Sun). */
      24: {
        label: 'TUNE-UP HALF',
        days: {
          1: { run: { km: 6, title: 'Easy 6', detail: 'Tune-up week — easy only' } },
          2: { run: { km: 5, title: 'Easy 5 + strides', detail: 'A few relaxed strides' } },
          3: { noRun: true, note: 'REST — no run today (race Sunday)' },
          5: { blocks: [
            { t: '07:30', end: '08:00', title: 'Wake · Anki', cat: 'routine', quiet: true },
            { t: '08:00', end: '08:30', title: 'Breakfast', cat: 'meal', quiet: true },
            { t: '08:30', end: '09:00', title: 'Shakeout 3 km', detail: 'Ghost · very easy legs-loosener', cat: 'run', doable: true, runKm: 3, shoe: 'Ghost' },
            { t: '09:00', end: '09:15', title: 'Shower', cat: 'routine', quiet: true },
            { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '14:30', title: 'Race prep', detail: 'Kit, pacing plan, logistics for tomorrow', cat: 'routine', doable: true },
            { t: '14:30', end: '17:00', title: 'Feet up', cat: 'free', quiet: true },
            { t: '17:00', end: '18:00', title: 'Early carb dinner', cat: 'meal', quiet: true },
            { t: '18:00', end: '22:00', title: 'Quiet evening', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          6: { blocks: [
            { t: '07:00', end: '07:30', title: 'Wake · Anki · light breakfast', detail: '~90 min before the gun', cat: 'routine', quiet: true },
            { t: '08:00', end: '08:50', title: 'Travel + warm-up', detail: '2 km easy + strides', cat: 'run', quiet: true },
            { t: '09:00', end: '11:00', title: 'TUNE-UP HALF — ~21 km, raced honest', detail: 'Evo SL · this sets the marathon target: 1:52–1:55 → sub-4:00 on · ~2:00 → lock 4:10–4:15', cat: 'run', doable: true, runKm: 21.1, shoe: 'Evo SL' },
            { t: '11:00', end: '11:45', title: 'Refuel + shower', cat: 'routine', quiet: true },
            { t: '12:00', end: '17:00', title: 'Easy afternoon', detail: 'Recover — the number is in the bank', cat: 'free', quiet: true },
            { t: '17:00', end: '18:00', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '19:30', end: '21:00', title: 'Sunday reading catch-up', cat: 'reading', doable: true },
            { t: '21:00', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
        },
      },

      /* Week 25 Saturday — optional controlled Pro 4 parkrun. */
      25: {
        label: 'Cutback',
        days: {
          5: { run: { title: 'Optional Pro 4 parkrun — or easy buffer', detail: 'Controlled 80–90% for shoe familiarisation, NOT all-out — or just run it easy', shoe: 'Pro 4 (controlled) or Ghost' } },
        },
      },

      /* Weeks 26–27 — holiday template (off work Mon–Fri). Wake 08:00 ·
         run of the day ~09:30 (Mon: full rest, no run) · one light study
         block ~90 min · free evenings. The 18:30 dinner anchor stays.
         Upper A slides
         to late morning; Upper B falls on the rest-day Fridays. */
      26: {
        label: 'DRESS REHEARSAL',
        days: {
          0: { blocks: 'holidayMon' },
          1: { blocks: 'holidayTue' },
          2: { blocks: 'holidayWed' },
          3: { blocks: 'holidayThu' },
          4: { blocks: [
            { t: '08:30', end: '09:30', title: 'Christmas Day — wake easy', detail: 'No Anki guilt', cat: 'routine', quiet: true },
            { t: '09:30', end: '21:30', title: 'CHRISTMAS — full rest', detail: 'No run, no gym, no study. Eat well — the dress rehearsal is Sunday.', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read (if you fancy it)', cat: 'reading', quiet: true },
            { t: '22:30', end: '23:00', title: 'Lights out', cat: 'routine', quiet: true },
          ] },
        },
      },
      27: {
        label: 'PEAK LONG RUN',
        days: {
          0: { blocks: 'holidayMon' },
          1: { blocks: 'holidayTue' },
          2: { blocks: 'holidayWed' },
          3: { blocks: 'holidayThu' },
          4: { blocks: [
            { t: '08:00', end: '08:30', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '08:30', end: '21:30', title: 'New Year’s Day — REST', detail: 'Feet up. The peak 30 km is in two days.', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
        },
      },

      /* Week 30 — race week, day by day (§9). */
      30: {
        label: 'RACE WEEK',
        days: {
          0: { blocks: [
            { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '08:00', end: '15:00', title: 'College', cat: 'study', quiet: true },
            { t: '15:00', end: '16:00', title: 'Home + snack', cat: 'work', quiet: true },
            { t: '16:15', end: '16:50', title: 'Easy 5', detail: 'Ghost · 6:20–6:50/km · race week — float', cat: 'run', doable: true, runKm: 5, shoe: 'Ghost' },
            { t: '16:50', end: '17:05', title: 'Shower', cat: 'routine', quiet: true },
            { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '19:30', end: '22:00', title: 'Free evening — feet up', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          1: { blocks: [
            { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
            { t: '07:00', end: '12:00', title: 'Work', detail: 'Study rides the quiet spells', cat: 'work', quiet: true },
            { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
            { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
            { t: '17:10', end: '17:40', title: 'Easy 4', detail: 'Ghost · easy — NO gym tonight', cat: 'run', doable: true, runKm: 4, shoe: 'Ghost' },
            { t: '17:40', end: '17:55', title: 'Shower', cat: 'routine', quiet: true },
            { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '19:30', end: '21:00', title: 'Study — 1.5h', detail: 'The gym slot goes to study this week — NO gym', cat: 'study', doable: true },
            { t: '21:00', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          2: { blocks: [
            { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
            { t: '07:00', end: '12:00', title: 'Work', cat: 'work', quiet: true },
            { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
            { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
            { t: '17:10', end: '17:40', title: 'Easy 4 + strides', detail: 'Ghost · a few relaxed strides', cat: 'run', doable: true, runKm: 4, shoe: 'Ghost' },
            { t: '17:40', end: '17:55', title: 'Shower', cat: 'routine', quiet: true },
            { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '19:30', end: '20:30', title: 'Study — light', cat: 'study', doable: true },
            { t: '20:30', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          3: { blocks: [
            { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
            { t: '07:00', end: '12:00', title: 'Work', cat: 'work', quiet: true },
            { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
            { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
            { t: '17:10', end: '17:40', title: 'Shakeout 3–4 km — last run', detail: 'Pro 4 · easy, smile, done — last outing before the gun (§11)', cat: 'run', doable: true, runKm: 4, shoe: 'Pro 4' },
            { t: '17:40', end: '17:55', title: 'Shower', cat: 'routine', quiet: true },
            { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '19:30', end: '21:00', title: 'Protected free evening', cat: 'free', quiet: true },
            { t: '21:00', end: '22:00', title: 'Deep reading anchor', cat: 'reading', doable: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          4: { blocks: [
            { t: '05:30', end: '06:30', title: 'Wake · Anki · final pack', detail: 'Pro 4s, race kit, gels and number in HAND LUGGAGE — never in the hold', cat: 'routine', doable: true },
            { t: '06:30', end: '15:30', title: 'Fly to Cyprus ✈️', detail: 'UK → Larnaca (~4.5 h) then ~45 min transfer to Nicosia · Cyprus is UTC+2 · sip water the whole way, flying dehydrates', cat: 'routine', quiet: true },
            { t: '15:30', end: '17:00', title: 'Check in · legs up', detail: 'Unpack, hang the kit, find breakfast for Sunday', cat: 'free', quiet: true },
            { t: '17:00', end: '17:30', title: 'Shakeout walk', detail: '20 min easy on the legs — flush the flight out, see some daylight to shift the body clock', cat: 'free', quiet: true },
            { t: '18:30', end: '19:30', title: 'Dinner', detail: 'Familiar food — nothing adventurous from here', cat: 'meal', quiet: true },
            { t: '19:30', end: '21:30', title: 'Quiet evening', cat: 'free', quiet: true },
            { t: '21:30', end: '22:00', title: 'Read', cat: 'reading', doable: true },
            { t: '22:00', end: '23:00', title: 'Lights out — bank this one', detail: 'Two nights out matters more than the night before', cat: 'routine', quiet: true },
          ] },
          5: { blocks: [
            { t: '07:30', end: '08:00', title: 'Wake · Anki', cat: 'routine', quiet: true },
            { t: '08:00', end: '09:00', title: 'Big carb breakfast', cat: 'meal', quiet: true },
            { t: '09:30', end: '11:00', title: 'Number collection', detail: 'Expo and bib — then straight out. Do not spend the day on your feet sightseeing', cat: 'routine', doable: true },
            { t: '11:00', end: '11:25', title: '2 km leg-loosener + strides', detail: 'In full race kit — shoes, socks, shorts, watch. Last chance to find a problem', cat: 'run', doable: true, runKm: 2, shoe: 'Pro 4' },
            { t: '12:00', end: '13:00', title: 'Carb lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '16:30', title: 'Feet up', detail: 'Horizontal. Recce the start on a map, not on foot', cat: 'free', quiet: true },
            { t: '16:30', end: '17:30', title: 'Early carb dinner', detail: 'Eat early — you are up at 04:15', cat: 'meal', quiet: true },
            { t: '17:30', end: '18:30', title: 'Final kit layout', detail: 'Pro 4s, race socks, gels taped to the belt, vaseline, number pinned, TWO alarms (04:15) · lay it all out tonight', cat: 'routine', doable: true },
            { t: '18:30', end: '19:45', title: 'Wind down', cat: 'free', quiet: true },
            { t: '19:45', end: '20:15', title: 'Read', cat: 'reading', doable: true },
            { t: '20:15', end: '23:00', title: 'Lights out 20:15', detail: 'Brutally early — 20:15 here is 18:15 at home. If sleep will not come, lying still in the dark still counts', cat: 'routine', quiet: true },
          ] },
          6: { blocks: [
            { t: '04:15', end: '04:30', title: 'Alarm · first sips', detail: 'RACE DAY 🇨🇾 · water and a coffee, no rush', cat: 'routine', quiet: true },
            { t: '04:30', end: '05:00', title: 'Porridge + coffee', detail: '~2 h 15 before the gun · exactly what you have eaten before every long run · keep sipping water', cat: 'meal', quiet: true },
            { t: '05:00', end: '05:45', title: 'Kit on · toilet · gels', detail: 'Vaseline everywhere that rubs. Throwaway layer for the start — it is 6–10 °C and dark', cat: 'routine', quiet: true },
            { t: '05:45', end: '06:00', title: 'To Solomou Square', detail: 'Central start — walk it, it doubles as a warm-up', cat: 'routine', quiet: true },
            { t: '06:00', end: '06:20', title: 'Bag drop · toilet queue', detail: 'Queue early, queue twice', cat: 'routine', quiet: true },
            { t: '06:20', end: '06:40', title: 'Warm-up', detail: '1 km jog + 3–4 strides · you do not need much for a marathon', cat: 'run', quiet: true },
            { t: '06:45', end: '10:45', title: 'MARATHON — 42.2 km 🇨🇾', detail: 'Pro 4 · 5:41/km goal · NEGATIVE SPLIT — first half feels too easy · gel every 35–40 min · sunrise at 06:50, you run into it · flat course, but the Athalassa false flats are run by effort not pace · dress for the finish (low teens), not the start', cat: 'run', doable: true, runKm: 42.2, shoe: 'Pro 4', estPace: '5:41',
              table: { title: 'THE 4:00 PLAN — 5:41/km, negative split', cols: ['At', 'Clock', 'Cue'], rows: [
                ['5 km',  '28:25',   'settle — this MUST feel too easy'],
                ['10 km', '56:50',   'rhythm · first gel done, keep drinking'],
                ['Half',  '1:59:54', 'still holding back — the race has not started'],
                ['25 km', '2:22:05', 'now it starts · stay smooth'],
                ['30 km', '2:50:30', 'the real race · Athalassa by effort, not pace'],
                ['35 km', '3:18:55', 'spend everything you saved'],
                ['40 km', '3:47:20', 'count people down, one at a time'],
                ['42.2',  '3:59:49', 'Eleftheria Square — into the sunrise'],
              ] } },
            { t: '10:45', end: '11:45', title: 'Finish — food, warm kit, massage', detail: 'Free recovery massage at the finish — take it', cat: 'meal', quiet: true },
            { t: '11:45', end: '17:00', title: 'CELEBRATE ☀️', detail: 'You are a marathoner. In Cyprus. In January.', cat: 'free', quiet: true },
            { t: '17:00', end: '18:00', title: 'Eat again', cat: 'meal', quiet: true },
            { t: '18:00', end: '21:00', title: 'Evening — feet up', cat: 'free', quiet: true },
            { t: '21:00', end: '22:30', title: 'Lights out — you earned it', cat: 'routine', quiet: true },
          ] },
        },
      },
    },

    /* ---- Holiday day templates (Wks 26–27, referenced by name) ---- */
    namedTemplates: {
      holidayMon: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:00', end: '13:00', title: 'Free', detail: 'No run, no gym — holiday Monday is a full rest day', cat: 'free', quiet: true },
        { t: '13:00', end: '14:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '14:00', end: '15:30', title: 'Study — one light block', detail: '~90 min, that’s the lot', cat: 'study', doable: true },
        { t: '15:30', end: '18:30', title: 'Free', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      holidayTue: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:30', run: 'tue' },
        { after: true, end: '11:00', title: 'Free', cat: 'free', quiet: true },
        { t: '11:00', end: '12:00', title: 'Gym — Upper A (maintenance)', cat: 'gym', doable: true, gym: 'upper',
          detail: '3 reps in reserve — save the evening',
          plan: [
            { ex: 'Bench press',   sets: '2 × 6–8' },
            { ex: 'Barbell row',   sets: '2 × 8' },
            { ex: 'Weighted dips', sets: '2 × 8' },
            { ex: 'EZ bar curls',  sets: '2 × 10' },
          ] },
        { t: '13:00', end: '14:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '14:00', end: '15:30', title: 'Study — one light block', cat: 'study', doable: true },
        { t: '15:30', end: '18:30', title: 'Free', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      holidayWed: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:30', run: 'wed' },
        { after: true, end: '13:00', title: 'Free', cat: 'free', quiet: true },
        { t: '13:00', end: '14:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '14:00', end: '15:30', title: 'Study — one light block', cat: 'study', doable: true },
        { t: '15:30', end: '18:30', title: 'Free', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      holidayThu: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:30', run: 'thu' },
        { after: true, end: '13:00', title: 'Free', cat: 'free', quiet: true },
        { t: '13:00', end: '14:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '14:00', end: '15:30', title: 'Study — one light block', cat: 'study', doable: true },
        { t: '15:30', end: '18:30', title: 'Free', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'Protected free evening', cat: 'free', quiet: true },
        { t: '21:00', end: '22:00', title: 'Deep reading anchor', cat: 'reading', doable: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
    },
  },

  /* ------------------ BLOCK 2 · RECOVERY & RETURN ----------------------
     2 weeks post-race. A reverse taper of celebration, not training:
     days 1–3 no running (walk, eat, sleep, celebrate) · rest of week 1
     optional 2×20 min very easy · week 2 easy 4–5 km ×3 if legs feel
     normal · no hard running the full fortnight · gym returns light wk 2. */
  {
    id: 'recovery',
    name: 'Recovery & return',
    start: '2027-01-25',
    weeks: 2,
    phases: { taper: [1, 2] },   // rendered in taper tones
    weekTable: [
      { wk: 1, phase: 'taper', km: 0, lr: 0, wed: null, sun: null, notes: 'Days 1–3 nothing. Then optional 2×20 min very easy. Celebrate.' },
      { wk: 2, phase: 'taper', km: 14, lr: 0, wed: null, sun: null, notes: 'Easy 4–5 km ×3 if legs feel normal · gym returns light' },
    ],
    specialDistanceWeeks: [1, 2],
    templates: {
      0: [
        { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '08:00', end: '15:00', title: 'College', detail: 'Yes, the day after. Walk gently, tell everyone.', cat: 'study', quiet: true },
        { t: '15:00', end: '16:00', title: 'Home + snack', cat: 'work', quiet: true },
        { t: '16:00', end: '18:30', title: 'Walk · eat · rest', detail: 'No running. No guilt.', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner — eat big', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Celebrate / feet up', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      1: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', detail: 'Study / life admin rides the quiet spells — gently', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:10', end: '17:50', title: 'Wk 2 only: easy 4–5 km', detail: 'Ghost · truly easy — skip freely in week 1', cat: 'run', doable: true, runKm: 4, shoe: 'Ghost', recoveryWk2Run: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '20:30', title: 'Wk 2 only: Gym — Upper A (light)', cat: 'gym', doable: true, recoveryWk2Gym: true,
          detail: '~60% loads — just moving again',
          plan: [
            { ex: 'Bench press',    sets: '2 × 10' },
            { ex: 'Barbell row',    sets: '2 × 10' },
            { ex: 'Overhead press', sets: '2 × 10' },
          ] },
        { t: '20:30', end: '22:00', title: 'Free', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      2: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:00', end: '18:30', title: 'Walk · rest', detail: 'Still no running in days 1–3', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      3: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:10', end: '17:35', title: 'Optional 20 min very easy — or walk', detail: 'Ghost · week 1: optional only · week 2: easy 4–5 km', cat: 'run', doable: true, runKm: 3, shoe: 'Ghost' },
        { t: '17:35', end: '17:50', title: 'Shower', cat: 'routine', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'Protected free evening', cat: 'free', quiet: true },
        { t: '21:00', end: '22:00', title: 'Deep reading anchor', cat: 'reading', doable: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      4: [
        { t: '07:00', end: '07:30', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '07:30', end: '10:30', title: 'German active study — gentle return', cat: 'german', doable: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '14:00', title: 'Wk 2 only: Gym — Upper B (light)', cat: 'gym', doable: true, recoveryWk2Gym: true,
          detail: 'Light — a reverse taper, not training',
          plan: [
            { ex: 'Incline bench',  sets: '2 × 10' },
            { ex: 'Easy pull-ups',  sets: '2 sets' },
            { ex: 'Arms',           sets: '2 × 12' },
          ] },
        { t: '15:30', end: '19:00', title: 'Afternoon — out', cat: 'free', quiet: true },
        { t: '19:00', end: '22:00', title: 'Evening — out', detail: 'Basketball only if legs genuinely feel normal', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      5: [
        { t: '07:30', end: '08:00', title: 'Wake · Anki', cat: 'routine', quiet: true },
        { t: '08:00', end: '08:30', title: 'Breakfast', cat: 'meal', quiet: true },
        { t: '08:30', end: '09:00', title: 'Optional very easy 20 min — or walk', detail: 'Ghost · week 2: easy 4–5 km if legs feel normal', cat: 'run', doable: true, runKm: 3, shoe: 'Ghost' },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Free — social / hobbies', cat: 'free', quiet: true },
        { t: '19:00', end: '20:00', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '20:00', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      6: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', detail: 'Proper lie-in — no long run to fuel', cat: 'routine', quiet: true },
        { t: '09:00', end: '12:00', title: 'Long walk', detail: 'The Sunday slot, reclaimed', cat: 'free', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:30', end: '15:30', title: 'Study — light', cat: 'study', doable: true },
        { t: '17:00', end: '18:00', title: 'German media', cat: 'german', quiet: true },
        { t: '18:00', end: '18:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'Sunday reading catch-up', cat: 'reading', doable: true },
        { t: '21:00', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
    },
    specialWeeks: {},
    namedTemplates: {},
  },
  ],

  /* ====================================================================
     DEFAULT WEEK — the standing life template after the last block
     (v6.4 scaffold restored): 5-day gym split returns incl Lower B and
     Sunday full body · German active back to ~6h · lean bulk resumes ·
     running defaults to 3 easy runs/week as a hobby until a new goal.
     Defining the next goal = appending a new block object above.
     ==================================================================== */
  defaultWeek: {
    id: 'default',
    name: 'Standing week',
    note: 'No active block — v6.4 scaffold. 3 easy hobby runs · 5 gym sessions · lean bulk resumes. Next goal = a new block in data/plan.js.',
    templates: {
      0: [
        { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '08:00', end: '15:00', title: 'College', detail: 'Mondays — free periods = study', cat: 'study', quiet: true },
        { t: '15:00', end: '16:00', title: 'Home + snack', cat: 'work', quiet: true },
        { t: '17:00', end: '18:00', title: 'Gym — Lower A', cat: 'gym', doable: true,
          detail: 'The split is back',
          plan: [
            { ex: 'Squat',       sets: '4 × 6–8' },
            { ex: 'Leg press',   sets: '3 × 10' },
            { ex: 'Leg curl',    sets: '3 × 10' },
            { ex: 'Calf raises', sets: '4 × 12' },
          ] },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'German active study', cat: 'german', doable: true },
        { t: '21:00', end: '22:00', title: 'German media', cat: 'german', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      1: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', detail: 'Study rides the quiet spells', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:10', end: '17:45', title: 'Easy run — 5 km (hobby)', detail: 'Ghost · conversational', cat: 'run', doable: true, runKm: 5, shoe: 'Ghost' },
        { t: '17:45', end: '18:00', title: 'Shower', cat: 'routine', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '20:45', title: 'Gym — Upper A', cat: 'gym', doable: true,
          detail: 'Lean bulk pace',
          plan: [
            { ex: 'Bench press',    sets: '4 × 6–8' },
            { ex: 'Barbell row',    sets: '4 × 6–8' },
            { ex: 'Overhead press', sets: '3 × 8' },
            { ex: 'Weighted dips',  sets: '3 × 8–10' },
            { ex: 'EZ bar curls',   sets: '3 × 10–12' },
            { ex: 'Face pulls',     sets: '3 × 15' },
          ] },
        { t: '20:45', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      2: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:10', end: '17:50', title: 'Easy run — 6 km (hobby)', detail: 'Ghost · conversational', cat: 'run', doable: true, runKm: 6, shoe: 'Ghost' },
        { t: '17:50', end: '18:05', title: 'Shower', cat: 'routine', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'Study', cat: 'study', doable: true },
        { t: '21:00', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      3: [
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'Protected free evening', cat: 'free', quiet: true },
        { t: '21:00', end: '22:00', title: 'Deep reading anchor', cat: 'reading', doable: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      4: [
        { t: '07:00', end: '07:30', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '07:30', end: '12:00', title: 'German active study', detail: 'Back to the full ~4.5h block (~6h/wk active)', cat: 'german', doable: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '14:30', title: 'Gym — Upper B', cat: 'gym', doable: true,
          plan: [
            { ex: 'Incline bench',      sets: '4 × 8–10' },
            { ex: 'Pull-ups',           sets: '4 × max' },
            { ex: 'Lateral raises',     sets: '4 × 12–15' },
            { ex: 'Hammer curls',       sets: '3 × 10–12' },
            { ex: 'Rope pushdowns',     sets: '3 × 10–12' },
            { ex: 'Hanging leg raises', sets: '3 × 10–15' },
          ] },
        { t: '15:30', end: '19:00', title: 'Afternoon — out', cat: 'free', quiet: true },
        { t: '19:00', end: '20:00', title: 'Basketball', cat: 'xt', doable: true },
        { t: '20:00', end: '22:00', title: 'Evening — out', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      5: [
        { t: '07:30', end: '08:00', title: 'Wake · Anki', cat: 'routine', quiet: true },
        { t: '08:00', end: '08:30', title: 'Breakfast', cat: 'meal', quiet: true },
        { t: '09:00', end: '10:00', title: 'Gym — Lower B', cat: 'gym', doable: true,
          detail: 'Deadlifts are back',
          plan: [
            { ex: 'Deadlift',          sets: '4 × 5' },
            { ex: 'Romanian deadlift', sets: '3 × 8' },
            { ex: 'Walking lunges',    sets: '3 × 10/leg' },
            { ex: 'Calf raises',       sets: '4 × 15' },
          ] },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Study / projects', cat: 'study', doable: true },
        { t: '16:30', end: '19:00', title: 'Free — social / hobbies', cat: 'free', quiet: true },
        { t: '19:00', end: '20:00', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '20:00', end: '22:00', title: 'Free evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      6: [
        { t: '07:30', end: '08:15', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:00', end: '09:50', title: 'Easy run — 8 km (hobby)', detail: 'Ghost · conversational', cat: 'run', doable: true, runKm: 8, shoe: 'Ghost' },
        { t: '09:50', end: '10:05', title: 'Shower', cat: 'routine', quiet: true },
        { t: '10:30', end: '11:30', title: 'Gym — Full body', cat: 'gym', doable: true,
          plan: [
            { ex: 'Squat',        sets: '3 × 8' },
            { ex: 'Bench press',  sets: '3 × 8' },
            { ex: 'Barbell row',  sets: '3 × 8' },
            { ex: 'Press + arms', sets: 'to finish' },
          ] },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:30', end: '16:00', title: 'Free / projects', cat: 'free', quiet: true },
        { t: '17:00', end: '18:00', title: 'German media', cat: 'german', quiet: true },
        { t: '18:00', end: '18:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'Sunday reading catch-up', cat: 'reading', doable: true },
        { t: '21:00', end: '22:00', title: 'Wind down', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
    },
  },
};

/* Node (tests) + browser (script tag) */
if (typeof module !== 'undefined' && module.exports) module.exports = PLAN;
