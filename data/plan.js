/* ==========================================================================
   Week OS — data/plan.js
   THE single source of routine content. Rendering code contains zero plan
   content; the day-builder reads only from this module.

   Amending the plan = editing this file, never surgery on app logic.
   (One change per prompt → edit here → run tests → bump SW version → ship.)
   ========================================================================== */

const PLAN = {

  /* ---- Race & targets (§1, §10) ------------------------------------- */
  race: {
    name: 'Marathon',
    date: '2027-01-24',          // Sun 24 Jan 2027
    gun: '09:00',
    goal: '4:00',
    goalPace: '5:41/km',
    stretch: 'sub-3:45',
    stretchPace: '5:20/km',
  },

  /* ---- Paces (§10) --------------------------------------------------- */
  paces: [
    { type: 'Easy / long-run base',        pace: '6:20–6:50 /km' },
    { type: 'Marathon pace (4:00 goal)',   pace: '5:41 /km' },
    { type: 'Tempo / threshold',           pace: '5:05–5:20 /km' },
    { type: 'Stretch MP (sub-3:45 bet)',   pace: '5:20 /km' },
  ],
  recalibration:
    'The Week 24 half sets the real target: 1:52–1:55 → sub-4:00 is on · ' +
    '~2:00 → lock 4:10–4:15 and run it smart. Race-day pacing is a negative ' +
    'split — first half slightly easier than goal.',

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

  /* ---- Rules of the block (§12) --------------------------------------- */
  rules: [
    'Easy means easy — conversational, or you’re stealing from Wednesday and Sunday.',
    'Cutback weeks are training. No junk km because the number looks small.',
    'Basketball flexes first: skip whenever legs are cooked; already OFF on weeks 17, 24, 26, 27, 30.',
    'Fuelling is a skill: gels every 35–40 min on every run over 90 min from October. Race day rehearses something practised.',
    'Niggle protocol: anything sharp or one-sided = 2 days off running before it becomes 2 weeks. The plan survives missed days, not a stress injury.',
    'Sleep is where training sticks: 22:30 lights out is part of the plan.',
    'The December tune-up sets the race pace — ambition doesn’t.',
  ],

  /* ---- Weekly load budget (§5) ---------------------------------------- */
  loadBudget:
    'Work 25.5h · college 7.5h · OU ~12h · German ~16–17h total (only ' +
    '~4–5.5h active; rest is passive/media/Anki) · gym 2–2.5h · running ' +
    'per plan · reading 6h (~200 pages/week).',

  /* ---- Open questions (§16 — surfaced in Reference, never guessed) ---- */
  openQuestions: [
    'Tuesdays after ~September 2026: HNC ends; does Tuesday become a work day? Daytime scaffold for Wks ~12+ needs confirming (college template kept until answered).',
    'Basketball: confirm Friday ~19:00 from Mum’s is right (time/place).',
    'Ticked-history export (JSON) — v1 or later?',
  ],

  /* ---- Scheduling constants (§6, §8) ----------------------------------
     paceMinPerKm: run duration = km × pace, then +15 min shower after
     every run. split: Wed/Tue/Thu shares of (weekly − LR), min 2 km each;
     Sat takes the remainder; Sat < 2 → folded into Tue, Sat = 0 (full
     rest before the long run). */
  pacing: { easy: 6.6, quality: 6.1, long: 6.75, showerMin: 15 },
  split:  { wed: 0.32, tue: 0.30, thu: 0.24, minKm: 2 },

  /* Gels rule (§12 rule 4): every 35–40 min on runs > 90 min, from October. */
  gels: { fromDate: '2026-10-01', minRunMin: 90, text: 'Gel every 35–40 min' },

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
      { wk: 7,  phase: 'base',  km: 27, lr: 15, wed: 'Tempo 10 min steady', sun: 'Long 15 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'First tempo' },
      { wk: 8,  phase: 'base',  km: 21, lr: 11, wed: 'Easy',           sun: 'Long 11 easy', wedShoe: 'Ghost',  lrShoe: 'Ghost', cutback: true },
      { wk: 9,  phase: 'base',  km: 29, lr: 16, wed: 'Tempo 15 min',   sun: 'Long 16 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost' },
      { wk: 10, phase: 'base',  km: 33, lr: 18, wed: 'Tempo 20 min',   sun: 'Long 18 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'Base complete' },
      { wk: 11, phase: 'build', km: 36, lr: 19, wed: 'Tempo 2×10 min @ threshold', sun: 'Long 19 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'Build begins' },
      { wk: 12, phase: 'build', km: 40, lr: 21, wed: 'Tempo 25 min continuous',    sun: 'Long 21 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost' },
      { wk: 13, phase: 'build', km: 32, lr: 16, wed: 'Easy + strides', sun: 'Long 16 easy', wedShoe: 'Evo SL', lrShoe: 'Ghost', cutback: true },
      { wk: 14, phase: 'build', km: 42, lr: 22, wed: '5×3 min @ threshold', sun: 'Long 22 — last 6 @ MP', wedShoe: 'Evo SL', lrShoe: 'Evo SL', notes: 'First MP work; OU modules start' },
      { wk: 15, phase: 'build', km: 46, lr: 24, wed: 'Tempo 25 min',   sun: 'Long 24 — last 6 @ MP',  wedShoe: 'Evo SL', lrShoe: 'Evo SL' },
      { wk: 16, phase: 'build', km: 50, lr: 26, wed: '4×5 min @ threshold', sun: 'Long 26 — last 8 @ MP', wedShoe: 'Evo SL', lrShoe: 'Evo SL' },
      { wk: 17, phase: 'build', km: 40, lr: 16, wed: 'Easy 5 (race week)', sun: 'Long 16 easy — recovery', wedShoe: 'Ghost', lrShoe: 'Ghost', cutback: true, key: true, noBasketball: true, notes: 'PARKRUN 5K PB Sat' },
      { wk: 18, phase: 'build', km: 50, lr: 26, wed: 'Tempo 30 min',   sun: 'Long 26 — 2×5 @ MP',     wedShoe: 'Evo SL', lrShoe: 'Evo SL' },
      { wk: 19, phase: 'build', km: 54, lr: 28, wed: '6×3 min @ threshold', sun: 'Long 28 — last 10 @ MP', wedShoe: 'Evo SL', lrShoe: 'Evo SL' },
      { wk: 20, phase: 'build', km: 58, lr: 30, wed: 'Tempo 2×15 min', sun: 'Long 30 — 12 @ MP',      wedShoe: 'Evo SL', lrShoe: 'Evo SL', key: true, notes: 'First 30 km' },
      { wk: 21, phase: 'build', km: 46, lr: 22, wed: 'Easy + strides', sun: 'Long 22 easy',           wedShoe: 'Evo SL', lrShoe: 'Ghost', cutback: true },
      { wk: 22, phase: 'build', km: 56, lr: 28, wed: 'Tempo 30 min',   sun: 'Long 28 — last 10 @ MP', wedShoe: 'Evo SL', lrShoe: 'Evo SL', key: true, notes: 'Racer arrives, keep boxed' },
      { wk: 23, phase: 'build', km: 60, lr: 30, wed: 'Tempo 2×15 min', sun: 'Long 30 — last 12 @ MP (Evo SL)', wedShoe: 'Evo SL', lrShoe: 'Evo SL', key: true, notes: 'Peak volume · Pro 4 fit-check Tue' },
      { wk: 24, phase: 'build', km: 48, lr: 21, wed: null, sun: null,  key: true, noBasketball: true, notes: 'TUNE-UP half (see §9)' },
      { wk: 25, phase: 'build', km: 46, lr: 22, wed: 'Easy',           sun: 'Long 22 easy',           wedShoe: 'Ghost',  lrShoe: 'Ghost', cutback: true, notes: 'Optional Pro 4 parkrun Sat (controlled)' },
      { wk: 26, phase: 'build', km: 56, lr: 26, wed: 'Tempo 20 min',   sun: 'DRESS REHEARSAL 26 km — last 14–16 @ MP (Pro 4)', wedShoe: 'Evo SL', lrShoe: 'Pro 4', key: true, offWork: true, noBasketball: true, notes: 'Off work · Christmas Fri' },
      { wk: 27, phase: 'build', km: 58, lr: 32, wed: 'Easy + strides', sun: 'PEAK 32 km easy/steady (Evo SL)', wedShoe: 'Evo SL', lrShoe: 'Evo SL', key: true, offWork: true, noBasketball: true, notes: 'Off work · NYD Fri' },
      { wk: 28, phase: 'taper', km: 40, lr: 18, wed: 'Easy + strides', sun: 'Long 18 — mid 6–8 @ MP (Pro 4 sharpener)', wedShoe: 'Evo SL', lrShoe: 'Pro 4', key: true, notes: 'Taper begins' },
      { wk: 29, phase: 'taper', km: 28, lr: 13, wed: '5×3 min @ MP',   sun: 'Long 13 easy',           wedShoe: 'Evo SL', lrShoe: 'Ghost', notes: 'Fresh is the goal' },
      { wk: 30, phase: 'taper', km: 15, lr: 42.2, wed: null, sun: null, race: true, key: true, noBasketball: true, notes: 'RACE WEEK (see §9)' },
    ],

    /* Weeks whose run distances are hand-set by §9, excluded from the
       algorithm split test. (26–27 keep algorithmic distances — only the
       day scaffold goes on holiday.) */
    specialDistanceWeeks: [17, 24, 30],

    /* ---- Phase deltas (§6) ---- */
    friGermanEnd: [
      { fromWk: 1,  end: '12:00' },   // Base
      { fromWk: 11, end: '11:30' },   // Build
      { fromWk: 23, end: '10:30' },   // Wk 23+ and Taper
    ],
    satGym: [
      { fromWk: 1,  mins: 50, title: 'Gym — Lower B (light–moderate)', detail: 'Deadlift 3×5 @ RPE 7 · RDL 3×8 light · step-ups 2×10/leg · calf raises 3×15 — Base only, never grind: the long run owns tomorrow' },
      { fromWk: 11, mins: 20, title: 'Core + mobility (optional)',     detail: 'Plank 3×45s · side plank 2×30s/side · dead bugs 3×10 · glute bridges 2×15 · calves + hips stretch — Lower B retired, running owns the legs' },
    ],
    gymMaintenanceFromWk: 23,   // both upper sessions → maintenance (reduced sets, keep the strength)
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
        { t: '17:00', end: '17:30', title: 'Punchbag', detail: '30 min cross-training — Monday has no run', cat: 'xt', doable: true },
        { t: '17:30', end: '18:30', title: 'Shower + snack', cat: 'routine', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', detail: 'Family anchor — never scheduled over', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'German active study', detail: 'Grammar / writing', cat: 'german', doable: true },
        { t: '21:00', end: '22:00', title: 'German media', detail: 'TV / film in German (passive)', cat: 'german', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],

      /* Tuesday — easy run + Upper A */
      1: [
        { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', detail: 'Lie-in vs work days · 15 min Anki', cat: 'routine', quiet: true },
        { t: '07:45', end: '08:00', title: 'Commute', detail: 'German podcasts', cat: 'work', quiet: true },
        { t: '08:00', end: '15:00', title: 'College', detail: 'Incl ~3h flexible OU/HNC study periods', cat: 'study', quiet: true },
        { t: '15:00', end: '16:00', title: 'Commute + snack', detail: 'Home ~16:00', cat: 'work', quiet: true },
        { t: '16:15', run: 'tue' },
        { after: true, end: '18:30', title: 'OU study', detail: 'Until dinner', cat: 'study', doable: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '20:45', title: 'Gym — Upper A', detail: 'Bench 4×6–8 · row 4×6–8 · OHP 3×8 · face pulls 3×15 — drive over, no run-commute', maintDetail: 'Bench 2×6–8 · row 2×8 · OHP 2×8 — 3 reps in reserve, keep the strength', cat: 'gym', doable: true, gym: 'upper' },
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
        { t: '19:30', end: '21:00', title: 'OU study', detail: 'Moved into the old gym slot', cat: 'study', doable: true },
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
        { t: '19:30', end: '21:00', title: 'Protected free evening', detail: 'The release valve — flex ≤1h to OU only on deadline weeks', cat: 'free', quiet: true },
        { t: '21:00', end: '22:00', title: 'Deep reading anchor', cat: 'reading', doable: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],

      /* Friday — German + Upper B + Mum's + basketball. No run. */
      4: [
        { t: '07:00', end: '07:30', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '07:30', end: '12:00', title: 'German active study', detail: 'The deep German block — end time set by phase', cat: 'german', doable: true, friGerman: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '14:30', title: 'Gym — Upper B', detail: 'Incline bench 4×8–10 · pull-ups 4×max · lateral raises 3×12 · curls 3×12 + pushdowns 3×12 — on the commute', maintDetail: 'Incline 2×8 · pull-ups 2×(max−3) · one arm superset — in and out, the race is the priority', cat: 'gym', doable: true, gym: 'upper' },
        { t: '15:30', end: '19:00', title: 'Mum’s — family', detail: 'Family time through the evening', cat: 'free', quiet: true },
        { t: '19:00', end: '20:00', title: 'Basketball', detail: 'Cross-training — flexes first: skip whenever legs are cooked', cat: 'xt', doable: true, basketball: true },
        { t: '20:00', end: '22:00', title: 'Evening at Mum’s', cat: 'free', quiet: true },
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
        { t: '13:00', end: '16:30', title: 'OU / HNC study', cat: 'study', doable: true },
        { t: '16:30', end: '19:00', title: 'Free — social / hobbies', cat: 'free', quiet: true },
        { t: '19:00', end: '20:00', title: 'Dinner', cat: 'meal', quiet: true },
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
        { t: '13:30', end: '16:30', title: 'OU study', detail: 'Start shifts later after the biggest runs · end 16:30', cat: 'study', doable: true },
        { t: '17:00', end: '18:00', title: 'German media', detail: 'Film / series in German (passive)', cat: 'german', quiet: true },
        { t: '18:00', end: '18:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '18:30', end: '19:30', title: 'Free', cat: 'free', quiet: true },
        { t: '19:30', end: '21:00', title: 'Sunday reading catch-up', cat: 'reading', doable: true },
        { t: '21:00', end: '22:00', title: 'Wind down', detail: 'Reading IS wind down', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
    },

    /* ---- Special weeks & templates (§9) — override the standard day ----
       Per week: days[dayIndex] with either
         run: {...}   patch the day's run (km/title/detail/shoe/pace)
         noRun: true  remove run + shower
         noGym: true  remove gym blocks
         blocks: []   full replacement day                                 */
    specialWeeks: {

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
            { t: '09:00', end: '09:25', title: 'PARKRUN 5K — all-out PB', detail: 'Evo SL · even splits, don’t sprint km 1', cat: 'run', doable: true, runKm: 5, shoe: 'Evo SL' },
            { t: '09:25', end: '09:45', title: 'Cool-down jog', cat: 'run', quiet: true },
            { t: '10:00', end: '10:30', title: 'Shower + refuel', cat: 'routine', quiet: true },
            { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '16:30', title: 'OU / HNC study', detail: 'Normal study afternoon', cat: 'study', doable: true },
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
            { t: '12:00', end: '17:00', title: 'Easy family afternoon', detail: 'Recover — the number is in the bank', cat: 'free', quiet: true },
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
         run of the day ~09:30 (Mon: punchbag, no run) · one light OU
         block ~90 min · family evenings. The 18:30 dinner anchor stays.
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
            { t: '09:30', end: '21:30', title: 'CHRISTMAS — full rest, family', detail: 'No run, no gym, no study. Eat well — the dress rehearsal is Sunday.', cat: 'free', quiet: true },
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
            { t: '08:30', end: '21:30', title: 'New Year’s Day — REST', detail: 'Feet up, family. Peak 32 km is in two days.', cat: 'free', quiet: true },
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
            { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
            { t: '07:00', end: '12:00', title: 'Work', cat: 'work', quiet: true },
            { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
            { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
            { t: '17:10', end: '17:45', title: 'Easy 5', detail: 'Ghost · 6:20–6:50/km · race week — float', cat: 'run', doable: true, runKm: 5, shoe: 'Ghost' },
            { t: '17:45', end: '18:00', title: 'Shower', cat: 'routine', quiet: true },
            { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '19:30', end: '22:00', title: 'Free evening — feet up', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          1: { blocks: [
            { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '08:00', end: '15:00', title: 'Normal daytime', detail: 'College/day scaffold — see open question §16', cat: 'study', quiet: true },
            { t: '15:00', end: '16:00', title: 'Home + snack', cat: 'work', quiet: true },
            { t: '16:15', end: '16:45', title: 'Easy 4', detail: 'Ghost · easy — NO gym tonight', cat: 'run', doable: true, runKm: 4, shoe: 'Ghost' },
            { t: '16:45', end: '17:00', title: 'Shower', cat: 'routine', quiet: true },
            { t: '17:00', end: '18:30', title: 'OU study — 1.5h', cat: 'study', doable: true },
            { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '19:30', end: '22:00', title: 'Free evening — NO gym', cat: 'free', quiet: true },
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
            { t: '19:30', end: '20:30', title: 'OU — light', cat: 'study', doable: true },
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
            { t: '17:10', end: '17:40', title: 'Shakeout 3–4 km — last run', detail: 'Ghost · easy, smile, done', cat: 'run', doable: true, runKm: 4, shoe: 'Ghost' },
            { t: '17:40', end: '17:55', title: 'Shower', cat: 'routine', quiet: true },
            { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
            { t: '19:30', end: '21:00', title: 'Protected free evening', cat: 'free', quiet: true },
            { t: '21:00', end: '22:00', title: 'Deep reading anchor', cat: 'reading', doable: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          4: { blocks: [
            { t: '07:00', end: '07:30', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
            { t: '07:30', end: '12:00', title: 'Rest the brain', detail: 'No German block this week', cat: 'free', quiet: true },
            { t: '12:00', end: '12:45', title: 'Lunch', cat: 'meal', quiet: true },
            { t: '12:45', end: '14:30', title: 'Kit prep + logistics', detail: 'Number, gels, drop bag, route', cat: 'routine', doable: true },
            { t: '15:30', end: '19:00', title: 'Mum’s — family', detail: 'NO basketball — race Sunday', cat: 'free', quiet: true },
            { t: '19:00', end: '22:00', title: 'Quiet evening at Mum’s', cat: 'free', quiet: true },
            { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
            { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
          ] },
          5: { blocks: [
            { t: '07:30', end: '08:00', title: 'Wake · Anki', cat: 'routine', quiet: true },
            { t: '08:00', end: '09:00', title: 'Big carb breakfast', cat: 'meal', quiet: true },
            { t: '09:30', end: '09:50', title: 'Optional 2 km leg-loosener', detail: 'Or full rest — nothing to gain today', cat: 'run', doable: true, runKm: 2, shoe: 'Ghost' },
            { t: '12:00', end: '13:00', title: 'Carb lunch', cat: 'meal', quiet: true },
            { t: '13:00', end: '17:00', title: 'Feet up', cat: 'free', quiet: true },
            { t: '17:00', end: '18:00', title: 'Early carb dinner', cat: 'meal', quiet: true },
            { t: '18:00', end: '19:00', title: 'Final kit layout', detail: 'Pro 4s, race socks, gels, vaseline, alarm', cat: 'routine', doable: true },
            { t: '19:00', end: '21:30', title: 'Wind down early', cat: 'free', quiet: true },
            { t: '21:30', end: '22:00', title: 'Read', cat: 'reading', doable: true },
            { t: '22:00', end: '23:00', title: 'Lights out 22:00', cat: 'routine', quiet: true },
          ] },
          6: { blocks: [
            { t: '06:00', end: '06:45', title: 'Wake — porridge + coffee', detail: '3h before the gun · keep sipping water', cat: 'meal', quiet: true },
            { t: '07:00', end: '08:00', title: 'Travel', detail: 'Warm layers', cat: 'routine', quiet: true },
            { t: '08:00', end: '08:50', title: 'Bag drop · toilet queue · warm-up', detail: '1 km jog + strides', cat: 'routine', quiet: true },
            { t: '09:00', end: '13:00', title: 'MARATHON — 42.2 km', detail: 'Pro 4 · 5:41/km goal · negative split · gel every 35–40 min', cat: 'run', doable: true, runKm: 42.2, shoe: 'Pro 4' },
            { t: '13:00', end: '14:00', title: 'Finish — food, warm kit', cat: 'meal', quiet: true },
            { t: '14:00', end: '19:00', title: 'CELEBRATE', detail: 'You are a marathoner', cat: 'free', quiet: true },
            { t: '19:00', end: '20:00', title: 'Eat again', cat: 'meal', quiet: true },
            { t: '20:00', end: '21:30', title: 'Early night', cat: 'free', quiet: true },
            { t: '21:30', end: '22:30', title: 'Lights out — you earned it', cat: 'routine', quiet: true },
          ] },
        },
      },
    },

    /* ---- Holiday day templates (Wks 26–27, referenced by name) ---- */
    namedTemplates: {
      holidayMon: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:30', end: '10:00', title: 'Punchbag', detail: '30 min — Monday has no run, holiday or not', cat: 'xt', doable: true },
        { t: '10:00', end: '10:30', title: 'Shower', cat: 'routine', quiet: true },
        { t: '10:30', end: '13:00', title: 'Family / free', cat: 'free', quiet: true },
        { t: '13:00', end: '14:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '14:00', end: '15:30', title: 'OU — one light block', detail: '~90 min, that’s the lot', cat: 'study', doable: true },
        { t: '15:30', end: '18:30', title: 'Family / free', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Family evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      holidayTue: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:30', run: 'tue' },
        { after: true, end: '11:00', title: 'Free', cat: 'free', quiet: true },
        { t: '11:00', end: '12:00', title: 'Gym — Upper A (maintenance)', detail: 'Bench 2×6–8 · row 2×8 · OHP 2×8 — 3 reps in reserve, save the evening for family', cat: 'gym', doable: true, gym: 'upper' },
        { t: '13:00', end: '14:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '14:00', end: '15:30', title: 'OU — one light block', cat: 'study', doable: true },
        { t: '15:30', end: '18:30', title: 'Family / free', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Family evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      holidayWed: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:30', run: 'wed' },
        { after: true, end: '13:00', title: 'Family / free', cat: 'free', quiet: true },
        { t: '13:00', end: '14:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '14:00', end: '15:30', title: 'OU — one light block', cat: 'study', doable: true },
        { t: '15:30', end: '18:30', title: 'Family / free', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Family evening', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      holidayThu: [
        { t: '08:00', end: '08:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:30', run: 'thu' },
        { after: true, end: '13:00', title: 'Family / free', cat: 'free', quiet: true },
        { t: '13:00', end: '14:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '14:00', end: '15:30', title: 'OU — one light block', cat: 'study', doable: true },
        { t: '15:30', end: '18:30', title: 'Family / free', cat: 'free', quiet: true },
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
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', detail: 'Yes, the day after. Walk gently, tell everyone.', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch — eat big', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:00', end: '18:30', title: 'Walk · eat · rest', detail: 'No running. No guilt.', cat: 'free', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '22:00', title: 'Celebrate / feet up', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      1: [
        { t: '07:30', end: '08:15', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:00', end: '12:00', title: 'OU / life admin — gentle', cat: 'study', doable: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:00', title: 'Walk + free', detail: 'Wk 2: easy 4–5 km if legs feel normal', cat: 'free', quiet: true },
        { t: '16:15', end: '17:00', title: 'Wk 2 only: easy 4–5 km', detail: 'Ghost · truly easy — skip freely in week 1', cat: 'run', doable: true, runKm: 4, shoe: 'Ghost', recoveryWk2Run: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '20:30', title: 'Wk 2 only: Gym — Upper A (light)', detail: 'Bench 2×10 · row 2×10 · OHP 2×10 @ ~60% — just moving again', cat: 'gym', doable: true, recoveryWk2Gym: true },
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
        { t: '13:00', end: '14:00', title: 'Wk 2 only: Gym — Upper B (light)', detail: 'Incline 2×10 · easy pull-ups 2 sets · arms 2×12 — light', cat: 'gym', doable: true, recoveryWk2Gym: true },
        { t: '15:30', end: '19:00', title: 'Mum’s — family', cat: 'free', quiet: true },
        { t: '19:00', end: '22:00', title: 'Evening at Mum’s', detail: 'Basketball only if legs genuinely feel normal', cat: 'free', quiet: true },
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
        { t: '09:00', end: '12:00', title: 'Long walk / family', detail: 'The Sunday slot, reclaimed', cat: 'free', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:30', end: '15:30', title: 'OU study — light', cat: 'study', doable: true },
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
        { t: '06:00', end: '06:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '06:45', end: '07:00', title: 'Commute', cat: 'work', quiet: true },
        { t: '07:00', end: '12:00', title: 'Work', cat: 'work', quiet: true },
        { t: '12:00', end: '13:00', title: 'Lunch', cat: 'meal', quiet: true },
        { t: '13:00', end: '16:30', title: 'Work', cat: 'work', quiet: true },
        { t: '16:30', end: '17:00', title: 'Commute home', cat: 'work', quiet: true },
        { t: '17:00', end: '18:00', title: 'Gym — Lower A', detail: 'Squat 4×6–8 · leg press 3×10 · leg curl 3×10 · calf raises 4×12 — the split is back', cat: 'gym', doable: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '21:00', title: 'German active study', cat: 'german', doable: true },
        { t: '21:00', end: '22:00', title: 'German media', cat: 'german', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      1: [
        { t: '06:45', end: '07:45', title: 'Wake · Anki · breakfast', cat: 'routine', quiet: true },
        { t: '09:00', end: '15:00', title: 'Self-study / OU day', detail: 'Post-HNC Tuesday — confirm scaffold (§16)', cat: 'study', doable: true },
        { t: '16:15', end: '16:50', title: 'Easy run — 5 km (hobby)', detail: 'Ghost · conversational', cat: 'run', doable: true, runKm: 5, shoe: 'Ghost' },
        { t: '16:50', end: '17:05', title: 'Shower', cat: 'routine', quiet: true },
        { t: '18:30', end: '19:30', title: 'Dinner', cat: 'meal', quiet: true },
        { t: '19:30', end: '20:45', title: 'Gym — Upper A', detail: 'Bench 4×6–8 · row 4×6–8 · OHP 3×8 · face pulls 3×15 — lean bulk pace', cat: 'gym', doable: true },
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
        { t: '19:30', end: '21:00', title: 'OU study', cat: 'study', doable: true },
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
        { t: '13:00', end: '14:30', title: 'Gym — Upper B', detail: 'Incline bench 4×8–10 · pull-ups 4×max · lateral raises 3×12 · arms superset 3×12', cat: 'gym', doable: true },
        { t: '15:30', end: '19:00', title: 'Mum’s — family', cat: 'free', quiet: true },
        { t: '19:00', end: '20:00', title: 'Basketball', cat: 'xt', doable: true },
        { t: '20:00', end: '22:00', title: 'Evening at Mum’s', cat: 'free', quiet: true },
        { t: '22:00', end: '22:30', title: 'Read', cat: 'reading', doable: true },
        { t: '22:30', end: '23:00', title: 'Lights out 22:30', cat: 'routine', quiet: true },
      ],
      5: [
        { t: '07:30', end: '08:00', title: 'Wake · Anki', cat: 'routine', quiet: true },
        { t: '08:00', end: '08:30', title: 'Breakfast', cat: 'meal', quiet: true },
        { t: '09:00', end: '10:00', title: 'Gym — Lower B', detail: 'Deadlift 4×5 · RDL 3×8 · walking lunges 3×10/leg · calf raises 4×15 — deadlifts are back', cat: 'gym', doable: true },
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
        { t: '10:30', end: '11:30', title: 'Gym — Full body', detail: 'Squat 3×8 · bench 3×8 · row 3×8 · press + arms to finish', cat: 'gym', doable: true },
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
