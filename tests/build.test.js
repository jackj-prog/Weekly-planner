/* ==========================================================================
   Week OS — tests/build.test.js  (§15 definition of done)
   Run: node tests/build.test.js — exits non-zero on any failure.
   ========================================================================== */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const PLAN = require('../data/plan.js');
const DB = require('../js/day-builder.js');

let failures = 0;
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}
function section(name) { console.log('· ' + name); }

/* ---- 0. JS syntax: browser-only files can't be require()d ---- */
section('syntax check (node --check)');
for (const f of ['../js/app.js', '../sw.js', '../js/day-builder.js', '../data/plan.js']) {
  const p = path.join(__dirname, f);
  try {
    execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
    ok(true, f);
  } catch (e) {
    ok(false, f + ' failed syntax check: ' + e.message.split('\n')[0]);
  }
}

/* ---- 1. Build all 210 days of block one ---- */
section('210-day build: non-empty, ordered, in-range');
const START = PLAN.blocks[0].start;
for (let i = 0; i < 210; i++) {
  const iso = DB.addDays(START, i);
  const day = DB.buildDay(iso);
  ok(day.blocks.length > 0, iso + ' is empty');
  let prevStart = -1, prevEnd = 0;
  const ids = new Set();
  for (const b of day.blocks) {
    ok(b.startMin < b.endMin, iso + ' "' + b.title + '" start !< end');
    ok(b.startMin >= 0 && b.endMin <= 1439, iso + ' "' + b.title + '" outside 00:00–23:59');
    ok(b.startMin > prevStart, iso + ' "' + b.title + '" not strictly after previous start');
    ok(b.startMin >= prevEnd, iso + ' "' + b.title + '" overlaps previous block');
    ok(/^t\d{4}-[a-z]+$/.test(b.id) && !ids.has(b.id), iso + ' "' + b.title + '" id not time-stable/unique: ' + b.id);
    ids.add(b.id);
    prevStart = b.startMin; prevEnd = b.endMin;
  }
}

/* ---- 2. Distance splits: Tue+Wed+Thu+Sat+LR = weekly km (±1) ---- */
section('distance splits vs weekly km');
const specialKm = new Set(PLAN.blocks[0].specialDistanceWeeks);
for (const row of PLAN.blocks[0].weekTable) {
  if (specialKm.has(row.wk)) continue;
  const d = DB.distancesForWeek(row);
  const sum = d.tue + d.wed + d.thu + d.sat + d.long;
  ok(Math.abs(sum - row.km) <= 1, 'wk ' + row.wk + ': split sums ' + sum + ' vs ' + row.km);
  ok(d.sat === 0 || d.sat >= PLAN.split.minKm, 'wk ' + row.wk + ': Sat ' + d.sat + ' below minimum');
}

/* ---- 3. Date anchors ---- */
section('date anchors');
ok(DB.weekNumber('2026-07-01') === 1, '2026-07-01 should be week 1');
ok(DB.dayIndex('2026-07-01') === 2, '2026-07-01 should be day index 2');
ok(DB.weekNumber('2027-01-24') === 30, '2027-01-24 should be week 30');
ok(DB.dayIndex('2027-01-24') === 6, '2027-01-24 should be day index 6');

/* ---- 4. Special-week spot checks ---- */
section('special-week spot checks');
function dayOfWeek(wk, di) {
  return DB.buildDay(DB.addDays(START, (wk - 1) * 7 + di));
}
function hasBlock(day, re) {
  return day.blocks.some((b) => re.test(b.title) || re.test(b.detail) ||
    (b.plan || []).some((p) => re.test(p.ex + ' ' + p.sets)));
}
ok(hasBlock(dayOfWeek(8, 4), /2-MILE TIME TRIAL/i), 'wk 8 Fri should hold the 2-mile time trial');
ok(dayOfWeek(8, 4).run && dayOfWeek(8, 4).run.run.km === 3.2 && /Evo SL/.test(dayOfWeek(8, 4).run.run.shoe),
  'wk 8 TT is the tickable 3.2 km run in the Evo SL');
ok(hasBlock(dayOfWeek(8, 4), /Warm-up/) && hasBlock(dayOfWeek(8, 4), /Cool-down/),
  'wk 8 TT is bracketed by warm-up and cool-down');
ok(hasBlock(dayOfWeek(8, 4), /LANE 1/), 'wk 8 TT carries the track-lap guidance');
ok(dayOfWeek(8, 4).run.start === '16:30', 'wk 8 TT goes off at 16:30 on the track');
ok(dayOfWeek(8, 3).run && dayOfWeek(8, 3).run.run.km === 2 && /Shakeout/.test(dayOfWeek(8, 3).run.title),
  'wk 8 Thu is a priming shakeout, not full rest');
ok(dayOfWeek(8, 5).run === null, 'wk 8 Sat run is dropped after the all-out effort');
ok(dayOfWeek(8, 5).blocks.some((b) => /Upper B/.test(b.title)), 'wk 8 Sat keeps Upper B');
ok(dayOfWeek(8, 2).run.run.km === 2, 'wk 8 Wed trims to an easy 2 km');
ok(hasDoable(dayOfWeek(8, 4), /Basketball/i) && hasBlock(dayOfWeek(8, 4), /shooting only/i),
  'wk 8 Fri keeps basketball but drops it to shooting only');
ok(dayOfWeek(8, 4).blocks.some((b) => /German active/.test(b.title) && b.end === '12:00'),
  'wk 8 Friday keeps the full Base German block — the 16:30 gun allows it');
ok(/heavy for the first/.test(dayOfWeek(8, 6).run.detail),
  'wk 8 Sun long run warns the legs will be heavy post-TT');
ok(hasBlock(dayOfWeek(8, 1), /rehearsal/i) && dayOfWeek(8, 1).run && dayOfWeek(8, 1).run.run.km === 5,
  'wk 8 Tue is the 4×400 TT pacing rehearsal, 5 km total');
ok(/1:36/.test(dayOfWeek(8, 1).run.detail), 'the rehearsal names goal lap pace');
ok(/lap 6/i.test(dayOfWeek(8, 4).run.detail) && /1:36/.test(dayOfWeek(8, 4).run.detail),
  'the TT carries the lap script with the lap-6 decision point');
ok(/bail-out/i.test(dayOfWeek(8, 4).run.detail),
  'an ambitious script carries its own bail-out — a controlled 13:00 beats a blown 13:40');
/* The lap-6 decision has to name both branches and their numbers, or it is
   just an instruction to feel something. The 8:02 it keys off must stay the
   table's own lap-5 cumulative. */
{
  const d = dayOfWeek(8, 4).run.detail;
  const lap5 = dayOfWeek(8, 4).run.table.rows[4][2];
  ok(d.indexOf(lap5) >= 0, 'the branch point quotes the table’s lap-5 clock (' + lap5 + ')');
  ok(/CONTROLLED/.test(d) && /HANGING ON/.test(d), 'both branches are named, not just the good one');
  ok(/12:36/.test(d) && /12:54/.test(d), 'each branch carries the finish time it actually produces');
}
/* Thursday's 200s are the calibration backstop: reps with full recoveries
   drift quicker than goal pace, and a body calibrated to the wrong number
   opens too fast. 48 s per 200 must stay half the opening lap. */
{
  const thu = dayOfWeek(8, 3).run.detail;
  ok(/48\s*s/i.test(thu) && /200/.test(thu), 'wk 8 Thursday carries the goal-pace 200s');
  const lapSec = (String(dayOfWeek(8, 4).run.table.rows[0][1]).match(/(\d+):(\d{2})/) || [])
    .slice(1).reduce((a, b, i) => i === 0 ? +b * 60 : a + +b, 0);
  ok(lapSec === 97 && /1:36/.test(thu),
    'the 200s name the lap pace they are calibrating (48 s = 1:36 per 400)');
  ok(!/hard|all-out|race/i.test(thu.split('CONTROLLED')[0]),
    'Thursday is never framed as a hard session — it is a calibration');
}
/* The rehearsal must teach the pace the script actually opens at. These
   drifting apart is worse than either number being wrong on its own. */
{
  const lap = (s) => { const m = String(s).match(/(\d+):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const t = dayOfWeek(8, 4).run.table;
  const reh = (dayOfWeek(8, 1).run.detail.match(/(\d+:\d{2})/g) || []).map(lap);
  ok(reh.length >= 2 && lap(t.rows[0][1]) >= Math.min.apply(null, reh) &&
     lap(t.rows[0][1]) <= Math.max.apply(null, reh),
    'the pace lap 1 opens at sits inside the range Tuesday rehearses, got ' +
    lap(t.rows[0][1]) + ' vs ' + reh.join('-'));

  /* Walk EVERY cumulative, not just the decision row — the previous table
     had a wrong final row precisely because only row 6 was checked. */
  let acc = 0;
  t.rows.forEach((r, i) => {
    acc += lap(r[1]);
    ok(lap(r[2]) === acc, 'lap ' + (i + 1) + ' clock is cumulative: expected ' +
      Math.floor(acc / 60) + ':' + String(acc % 60).padStart(2, '0') + ', got ' + r[2]);
  });
  ok(t.rows.length === 8, 'the script covers all eight laps individually');
  /* Negative split is the whole point of the script, not a nicety. */
  const half = (from, to) => t.rows.slice(from, to).reduce((s, r) => s + lap(r[1]), 0);
  ok(half(4, 8) < half(0, 4), 'the script is a genuine negative split, got ' +
    half(0, 4) + 's then ' + half(4, 8) + 's');
  /* 8 laps is 3200 m; the 2-mile finish is ~18.7 m further on. */
  const twoMile = acc + 18.7 * (lap(t.rows[7][1]) / 400);
  ok(Math.abs(twoMile - 768) < 6, 'the script lands on the 12:48 target once lane 1’s extra 18 m is paid, got ' +
    twoMile.toFixed(1) + 's');
}
ok(DB.parsePace(dayOfWeek(8, 4).run.run.estPace) * 3.2187 < 790,
  'the TT log estimate is centred on the new target, not the old one');
ok(/peak HR/i.test(dayOfWeek(8, 4).run.detail), 'the TT prompts the max-HR capture from the final lap');
{
  let wk8 = 0;
  for (let i = 0; i < 7; i++) { const d = dayOfWeek(8, i); if (d.run) wk8 += d.run.run.km; }
  ok(Math.abs(wk8 - 23.2) < 0.01, 'wk 8 lands ~23.2 km with the rehearsal in, got ' + wk8);
}
/* Base rebalance (Aug 2026): long-run share capped in wks 7–13 —
   growth lands midweek, the long run holds. */
for (const wk of [7, 9, 10, 11, 12, 13]) {
  const row = PLAN.blocks[0].weekTable[wk - 1];
  ok(row.lr / row.km <= 0.53, 'wk ' + wk + ' long-run share ≤53% of weekly km, got ' +
    Math.round((row.lr / row.km) * 100) + '%');
}
ok(hasBlock(dayOfWeek(17, 5), /PARKRUN 5K/i), 'wk 17 Sat should hold the parkrun');
ok(hasBlock(dayOfWeek(24, 6), /TUNE-UP HALF/i), 'wk 24 Sun should hold the tune-up half');
ok(hasBlock(dayOfWeek(26, 4), /CHRISTMAS.*rest|full rest/i), 'wk 26 Fri should be Christmas rest');
ok(hasBlock(dayOfWeek(27, 4), /New Year|REST/), 'wk 27 Fri should be NYD rest');
ok(hasBlock(dayOfWeek(30, 6), /MARATHON/), 'wk 30 Sun should hold the race protocol');
/* Nicosia race specifics (§9) */
ok(PLAN.race.gun === '06:45' && /Nicosia/.test(PLAN.race.name), 'race is the Nicosia marathon, 06:45 gun');
ok(dayOfWeek(30, 6).run && dayOfWeek(30, 6).run.start === '06:45', 'wk 30 Sun gun goes at 06:45');
ok(hasBlock(dayOfWeek(30, 6), /04:15|Alarm/i), 'race morning starts with the 04:15 alarm');
ok(hasBlock(dayOfWeek(30, 6), /sunrise/i), 'race brief mentions running into the sunrise');
ok(hasBlock(dayOfWeek(30, 4), /Fly to Cyprus/i), 'wk 30 Fri is the travel day');
ok(hasBlock(dayOfWeek(30, 4), /HAND LUGGAGE/), 'travel day warns to carry race kit in hand luggage');
ok(hasBlock(dayOfWeek(30, 5), /Number collection/i), 'wk 30 Sat collects the number in Nicosia');
ok(dayOfWeek(30, 5).blocks.some((b) => /Lights out/.test(b.title) && b.start === '20:15'),
  'wk 30 Sat goes to bed at 20:15 for the 04:15 alarm');
ok(hasBlock(dayOfWeek(23, 1), /Pro 4 fit-check/i), 'wk 23 Tue run should mention the Pro 4 fit-check');
function hasDoable(day, re) {
  return day.blocks.some((b) => b.doable && re.test(b.title));
}
ok(!hasDoable(dayOfWeek(17, 4), /^Basketball/i), 'wk 17 Fri should have no basketball');
ok(!hasDoable(dayOfWeek(24, 4), /^Basketball/i), 'wk 24 Fri should have no basketball');
ok(!hasDoable(dayOfWeek(30, 4), /^Basketball/i), 'wk 30 Fri should have no basketball');
ok(hasDoable(dayOfWeek(15, 4), /^Basketball/i), 'wk 15 Fri should keep basketball');
ok(!hasBlock(dayOfWeek(24, 3), /Easy run/), 'wk 24 Thu should be a rest day');
ok(hasBlock(dayOfWeek(26, 6), /DRESS REHEARSAL/i), 'wk 26 Sun should be the dress rehearsal');
ok(hasBlock(dayOfWeek(27, 6), /PEAK 30/i), 'wk 27 Sun should be the peak long run');
ok(dayOfWeek(27, 6).run.run.km === 30, 'peak long run capped at 30 km (~3h20), not 32');

/* Hero run visible on run days */
section('run hero present');
ok(dayOfWeek(1, 2).run && dayOfWeek(1, 2).run.run.km > 0, 'wk 1 Wed should expose a hero run');
ok(dayOfWeek(20, 6).run && dayOfWeek(20, 6).run.run.km === 30, 'wk 20 Sun hero should be 30 km');
ok(dayOfWeek(1, 0).run === null, 'Monday should have no run');

/* Gels rule: from Wk 7 (10 Aug) on runs > 90 min — gut training starts
   with the first ~100-min long runs, not October (rule 4). */
ok(/Gel every/i.test(dayOfWeek(20, 6).run.detail), 'wk 20 long run should carry the gel rule');
ok(/Gel every/i.test(dayOfWeek(7, 6).run.detail), 'wk 7 long run (15 km ≈ 100 min) starts the gel practice');
ok(/Gel every/i.test(dayOfWeek(10, 6).run.detail), 'wk 10 long run carries the gel rule');
ok(!/Gel every/i.test(dayOfWeek(6, 6).run.detail), 'wk 6 long run predates the gel rule');
ok(!/Gel every/i.test(dayOfWeek(9, 3).run.detail), 'short Thursday runs never carry the gel rule');

/* The interval IS the carb rate, so the rule has to tier with duration:
   ~39 g/h is the learning dose, not a race rate (rule 4). Wk 14's 22 km
   is ~148 min (learning tier); wk 16's 26 km is ~176 min (race-rate
   practice tier). */
ok(/35–40 min/.test(dayOfWeek(14, 6).run.detail), 'wk 14 long run (~148 min) takes the 35–40 min learning dose');
ok(/every 30 min/i.test(dayOfWeek(16, 6).run.detail), 'wk 16 long run (~176 min) steps up to a gel every 30 min');
ok(/every 30 min/i.test(dayOfWeek(23, 6).run.detail), 'wk 23 peak long run practises the race carb rate');
ok(!/every 30 min/i.test(dayOfWeek(7, 6).run.detail), 'wk 7 long run stays on the learning dose');
/* Caffeine is the best-evidenced legal aid in the sport and the plan used
   to say only "coffee". It must carry a dose, a ceiling, and an
   instruction to rehearse — a dose met first on race morning is a gamble,
   not a marginal gain. */
{
  const c = PLAN.gels.caffeine || '';
  ok(/mg\/kg/.test(c), 'caffeine is prescribed per kilogram, not per mug');
  ok(/rehears/i.test(c) && /26/.test(c), 'it points at the Wk 26 dress rehearsal');
  ok(/6 mg\/kg/.test(c), 'the upper bound is stated — more is not better');
  ok(/CAFFEINE/.test(dayOfWeek(30, 6).blocks.find((b) => /Porridge/.test(b.title)).detail),
    'race morning names the dose rather than just "coffee"');
  const dr = dayOfWeek(26, 6).run.detail;
  ok(/REHEARSE THE WHOLE RACE MORNING/.test(dr), 'the dress rehearsal rehearses more than the legs');
  ok(/caffeine/i.test(dr) && /gel/i.test(dr) && /electrolyte/i.test(dr),
    'and names all three untested variables');
  ok(!/REHEARSE THE WHOLE RACE MORNING/.test(dayOfWeek(20, 6).run.detail),
    'an ordinary long run does not carry the dress-rehearsal note');
}

/* A rate is not a plan. "Every 35–40 min" asks you to do arithmetic at
   km 8 with a heart rate of 150; the card now names the count and the
   clock times instead. */
{
  const g = PLAN.gels;
  const sched = (wk) => (dayOfWeek(wk, 6).run.detail.match(/TODAY: (\d+) gels?, at ([^·]+)/) || []);
  [[9, 35], [14, 35], [16, 30], [20, 30], [23, 30]].forEach(([wk, iv]) => {
    const row = DB.weekRow(PLAN.blocks[0], wk);
    const dur = Math.ceil(row.lr * PLAN.pacing.long);
    const m = sched(wk);
    ok(m.length, 'wk ' + wk + ' long run carries a gel schedule');
    ok(Number(m[1]) === Math.floor(dur / iv),
      'wk ' + wk + ': ' + m[1] + ' gels for a ' + dur + ' min run at every ' + iv);
    const times = m[2].replace(/ and /g, ', ').replace(/ min/, '').split(',').map((x) => Number(x.trim()));
    ok(times.length === Number(m[1]), 'every gel in the count has a clock time');
    ok(times[times.length - 1] <= dur,
      'the last gel lands inside the run, not on the finish line (' +
      times[times.length - 1] + ' vs ' + dur + ' min)');
    ok(times.every((t, i) => i === 0 || t - times[i - 1] === iv), 'the times are evenly spaced');
  });
  /* The same formula must reproduce race day's stated nine. */
  ok(Math.floor(225 / 25) === 9, 'floor(225/25) is the 9 gels the race block names');
  ok(!/TODAY:/.test(dayOfWeek(6, 6).run.detail), 'a run under 90 min gets no schedule');
}

PLAN.gels.ladder.forEach((l) => {
  ok(Math.abs(Math.round((60 / l.every) * PLAN.gels.carbG) - l.rate) <= 1,
    'gel ladder arithmetic: every ' + l.every + ' min ≈ ' + l.rate + ' g/h');
});
ok(Math.abs(Math.round(225 / 25) - 9) === 0, 'a 3h45 race at a gel every 25 min is 9 gels');
ok(!/\b(mum|dad|nan|family)\b/i.test(PLAN.gels.sodiumNote + PLAN.gels.targetNote),
  'fuelling notes stay generic');

/* Phase deltas */
section('phase deltas');
function friGerman(wk) {
  const d = dayOfWeek(wk, 4);
  return d.blocks.find((b) => /German active/i.test(b.title));
}
ok(friGerman(5).end === '12:00', 'Base Fri German ends 12:00');
ok(friGerman(15).end === '11:30', 'Build Fri German ends 11:30');
ok(friGerman(23).end === '10:30', 'Wk 23 Fri German ends 10:30');
ok(hasBlock(dayOfWeek(3, 5), /Lower B/i), 'Wks 1–3 Sat holds Lower B (as lived)');
ok(hasBlock(dayOfWeek(5, 0), /Lower B/i), 'Wks 4–10 Mon holds Lower B (day after the long run)');
ok(!dayOfWeek(5, 5).blocks.some((b) => /Lower B|Deadlift/i.test(b.title)), 'Wks 4–10 Sat has no leg work — legs fresh for Sunday');
ok(hasBlock(dayOfWeek(11, 0), /Lower B \+ core\/calves \(maintenance\)/) && hasBlock(dayOfWeek(11, 0), /Deadlift 2 × 5/),
  'Wks 11–16 Mon drops Lower B to maintenance and absorbs the core/calf work');
ok(hasBlock(dayOfWeek(14, 0), /Legs microdose/) && hasBlock(dayOfWeek(14, 0), /Leg press 2 × 5–6/),
  'Wk 14 Mon holds the legs microdose');
/* Wk 17+ Monday is no longer the zero day (Sep 2026, athlete's call): the
   PULL session stays all block, but its leg work retires exactly where
   Lower B used to — §6's argument that calf work earns its place only while
   volume is LOW is unchanged, it now applies to two exercises rather than a
   whole session. */
ok(hasBlock(dayOfWeek(18, 0), /Legs microdose/), 'Wk 17+ Mon keeps the same Monday session');
/* The leg dose is now scaled by FATIGUE, not by the calendar — a live rule
   beats a scheduled retirement, because the thing that should govern it is
   how Sunday actually went. */
ok(!hasBlock(dayOfWeek(18, 0), /Romanian deadlift/i),
  'RDLs are excluded all block — eccentric hamstring and erector cost is wrong at 40–65 km/wk');
ok(hasBlock(dayOfWeek(18, 0), /Seated leg curl/),
  'the leg curl replaces the RDL: same hamstring strength, far cheaper');
ok(!hasBlock(dayOfWeek(12, 5), /Core \+ calves/i), 'Core + calves is OFF Saturday — calves must not load the day before the long run');
ok(!hasBlock(dayOfWeek(12, 1), /Core \+ calves|calf/i),
  'Wk 11+ Tue carries NO calf work — it sat ~20 h before the Wednesday tempo');
ok(dayOfWeek(12, 0).blocks.some((b) => (b.plan || []).some((p) => /Seated calf raises/.test(p.ex))),
  'the soleus work lives on Monday now, on day-after-long-run legs');
/* Tuesday lost its gym when push moved onto the quality day, and study took
   the slot back — so the evening now ends where the study block does. */
ok(dayOfWeek(12, 1).blocks.some((b) => /Wind down/.test(b.title) && b.start === '21:00'),
  'Wk 12+ Tuesday winds down at 21:00, off the back of study');
ok(dayOfWeek(12, 1).blocks.some((b) => b.cat === 'study' && b.start === '19:30' && b.end === '21:00'),
  'Wk 12+ Tuesday carries the study block that Wednesday gave up');
ok(!hasBlock(dayOfWeek(10, 1), /Core \+ calves/i), 'Core + calves does not start before Wk 11');
ok(!dayOfWeek(20, 5).blocks.some((b) => /calf|calves/i.test(b.title) || (b.plan || []).some((p) => /calf/i.test(p.ex))),
  'no calf work anywhere on Saturday in peak Build');
ok(!dayOfWeek(23, 1).blocks.some((b) => b.cat === 'gym'), 'Wk 23 Tue has no gym — push moved to Wednesday');
ok(hasBlock(dayOfWeek(23, 2), /maintenance/i), 'Wk 23 Wed push is maintenance');

/* gym programming — structured plans on the blocks */
ok(hasBlock(dayOfWeek(5, 1), /Bench press 4 × 6–8/), 'Upper A should carry the full prescription');
ok(hasBlock(dayOfWeek(5, 1), /Weighted dips 3 × 8–10/), 'Upper A should carry weighted dips');
ok(hasBlock(dayOfWeek(5, 1), /EZ bar curls 3 × 10–12/), 'Upper A should carry EZ bar curls');
ok(hasBlock(dayOfWeek(5, 1), /Face pulls 3 × 15/), 'Upper A should keep face pulls');
ok(hasBlock(dayOfWeek(5, 5), /Incline bench 4 × 8–10/), 'Upper B should carry the full prescription');
ok(hasBlock(dayOfWeek(5, 5), /Lateral raises 4 × 12–15/), 'Upper B should carry 4 sets of laterals');
ok(hasBlock(dayOfWeek(5, 5), /Hanging leg raises/), 'Upper B should carry the ab work');
/* Upper B: Fri in Wks 1–3 (as lived) → Sat 10:00 from Wk 4 */
ok(hasBlock(dayOfWeek(2, 4), /Incline bench/), 'Wks 1–3 Fri holds Upper B (as lived)');
ok(!dayOfWeek(5, 4).blocks.some((b) => b.cat === 'gym'), 'Wks 4+ Fri has no gym — Upper B moved to Saturday');
ok(hasBlock(dayOfWeek(17, 5), /Light upper/), 'wk17 parkrun Saturday keeps the light session after the PB');
ok(!hasBlock(dayOfWeek(24, 5), /Upper B/), 'wk24 Sat has no Upper B — half taper');
ok(hasBlock(dayOfWeek(23, 2), /Overhead press 2 × 8/), 'Wk 23 push maintenance keeps the overhead press');
ok(hasBlock(dayOfWeek(23, 5), /Arms superset/), 'Wk 23 Saturday maintenance keeps the arm work');
ok(hasBlock(dayOfWeek(23, 5), /Lateral raises 2 × 15/), 'Wk 23 Saturday maintenance keeps laterals');
ok(hasBlock(dayOfWeek(5, 0), /Deadlift 3 × 5/), 'Base Lower B should carry the prescription');
ok(hasBlock(dayOfWeek(5, 0), /Plank finisher/), 'Base Lower B should carry the core finisher');
ok(hasBlock(dayOfWeek(5, 1), /\+2\.5 kg/), 'Upper A should carry the progression rule');
ok(hasBlock(dayOfWeek(3, 0), /6 × 3 min rounds/), 'Wks 1–3 Mondays keep punchbag (as lived)');
ok(hasBlock(dayOfWeek(11, 0), /Plank 3 × 45s/), 'Wk 11 Monday carries the trunk prescription (as lived)');
ok(hasBlock(dayOfWeek(12, 0), /Ab wheel/) && hasBlock(dayOfWeek(12, 0), /Pallof press/),
  'Wk 12+ Monday carries anti-extension and anti-rotation core');
/* push:pull rebalance + calves-all-block (assessed from first principles) */
ok(hasBlock(dayOfWeek(5, 1), /Band pull-aparts 4 × 15–20/), 'Upper A should carry pull-aparts in the bench rests');
ok(hasBlock(dayOfWeek(5, 5), /Rear-delt flyes 3 × 12–15/), 'Upper B should carry rear-delt flyes');
ok(hasBlock(dayOfWeek(23, 0), /Rear-delt fly 2 × 15/), 'Wk 23 maintenance keeps rear delts — they cost nothing');
ok(hasBlock(dayOfWeek(12, 0), /Straight-leg calf raises 2 × 8–12/), 'Wk 12+ Monday carries straight-leg calf work');
ok(hasBlock(dayOfWeek(12, 0), /Seated calf raises 2 × 10–15/), 'Wk 12+ Monday carries the soleus work');
ok(hasBlock(dayOfWeek(11, 0), /Bent-knee calf raises/), 'Wk 11 Monday keeps the soleus work as lived');
/* the whole point: nothing loads the calves the day before the tempo */
for (const wk of [12, 14, 16]) {
  ok(!dayOfWeek(wk, 1).blocks.some((b) => (b.plan || []).some((p) => /calf/i.test(p.ex))),
    'wk ' + wk + ' Tuesday carries no calf work — Wednesday is the tempo');
}
ok(hasBlock(dayOfWeek(5, 0), /Calf raises 3 × 15/), 'Base Lower B still carries its calf raises');
/* The pressing session is Upper A on Tuesday up to Wk 11 and Push on
   Wednesday from Wk 12 — the maintenance swap must follow it across. */
ok(hasBlock(dayOfWeek(23, 2), /3 reps in reserve/), 'Wk 23 push should swap to the maintenance session');
ok(hasBlock(dayOfWeek(23, 2), /Bench press 2 × 5–8/), 'Wk 23 push plan should be the reduced sets');
ok(!hasBlock(dayOfWeek(23, 2), /Bench press 3 × 5–8/), 'Wk 23 push should not show the full-volume session');
{
  const gymBlocks = [];
  for (let i = 0; i < 210; i++) {
    for (const b of DB.buildDay(DB.addDays(START, i)).blocks) {
      if (b.cat === 'gym') gymBlocks.push(b);
    }
  }
  ok(gymBlocks.length > 0 && gymBlocks.every((b) => Array.isArray(b.plan) && b.plan.length >= 3),
    'every gym block in the block should carry a structured plan');
}
for (let i = 0; i < 210; i++) {
  const day = DB.buildDay(DB.addDays(START, i));
  for (const b of day.blocks) ok(!/\bNan\b/.test(b.title + ' ' + b.detail), day.iso + ' still mentions Nan: ' + b.title);
}
ok(!dayOfWeek(30, 1).blocks.some((b) => b.cat === 'gym'), 'Race week Tue should have no gym');
ok(!dayOfWeek(30, 5).blocks.some((b) => b.cat === 'gym'), 'Race week Sat should have no gym');

/* ---- 5. Post-block behaviour ---- */
section('post-block behaviour');
ok(DB.buildDay('2027-01-27').blockId === 'recovery', '2027-01-27 should resolve to the Recovery block');
ok(DB.buildDay('2027-03-01').blockId === 'default', '2027-03-01 should resolve to defaultWeek');
ok(DB.buildDay('2026-06-01').blockId === 'default', 'pre-block dates should resolve to defaultWeek');

section('no crash 2026-06-01 → 2027-12-31');
let iso = '2026-06-01';
let crashed = null;
while (iso <= '2027-12-31') {
  try {
    const day = DB.buildDay(iso);
    if (!day.blocks.length) { crashed = iso + ' empty'; break; }
  } catch (e) {
    crashed = iso + ': ' + e.message; break;
  }
  iso = DB.addDays(iso, 1);
}
ok(!crashed, 'crash/empty at ' + crashed);

/* ---- 6. Recovery block content ---- */
section('recovery block');
ok(!DB.buildDay('2027-01-26').blocks.some((b) => b.cat === 'run' && b.doable && /Wk 2 only/.test(b.title)),
  'recovery wk 1 Tue should hide the wk-2 run');
ok(DB.buildDay('2027-02-02').blocks.some((b) => b.cat === 'run'),
  'recovery wk 2 Tue should offer the easy run');

/* ---- 7. Adherence helpers ---- */
section('adherence');
{
  // fake ticks: every run in the first 10 days done
  const fakeDone = {};
  for (let i = 0; i < 10; i++) {
    const d = DB.buildDay(DB.addDays(START, i));
    if (d.run) fakeDone[d.iso] = { [d.run.id]: true };
  }
  const today10 = DB.addDays(START, 10);
  const a = DB.adherence((iso) => fakeDone[iso], () => null, today10);
  // wk1 runs: Tue 3, Wed 2, Thu 2, Sun 8 (Sat rest) · wk2 so far: Tue 3, Wed 3
  ok(a.runsDone === 6 && a.runsDue === 6, 'adherence: 6/6 runs, got ' + a.runsDone + '/' + a.runsDue);
  ok(a.kmDone === 21, 'adherence: 21 km banked, got ' + a.kmDone);
  ok(a.streak === 6 && a.bestStreak === 6, 'adherence: streak 6, got ' + a.streak);
  ok(a.weekKmDone[1] === 15, 'adherence: wk1 banked 15, got ' + a.weekKmDone[1]);
  ok(a.day === 11 && a.days === 210, 'adherence: day 11/210, got ' + a.day + '/' + a.days);

  // a silently missed past run resets the streak…
  const missed = Object.assign({}, fakeDone);
  delete missed[DB.addDays(START, 3)];              // Thu wk1 unticked
  const m = DB.adherence((iso) => missed[iso], () => null, today10);
  ok(m.streak === 3 && m.bestStreak === 3 && m.runsDue === 6 && m.runsDone === 5,
    'missed run: streak 3, 5/6 runs, got ' + m.streak + ', ' + m.runsDone + '/' + m.runsDue);

  // …but an explicit skip (niggle protocol) is excluded and keeps the streak
  const thuIso = DB.addDays(START, 3);
  const thuRun = DB.buildDay(thuIso).run;
  const sk = DB.adherence((iso) => missed[iso],
    (iso) => (iso === thuIso ? { [thuRun.id]: true } : null), today10);
  ok(sk.streak === 5 && sk.runsDue === 5 && sk.runsDone === 5,
    'skipped run: unbroken streak 5, 5/5 runs, got ' + sk.streak + ', ' + sk.runsDone + '/' + sk.runsDue);

  // pre-block and empty storage are zeroes, no crash
  const z = DB.adherence(() => null, () => null, '2026-06-01');
  ok(z.kmDone === 0 && z.streak === 0 && z.day === 0, 'pre-block adherence is zeroed');

  const wk = DB.weekKm((iso) => fakeDone[iso], START);
  ok(wk.planned === 15 && wk.done === 15, 'weekKm wk1: 15/15, got ' + wk.done + '/' + wk.planned);
}

/* ---- 6b. schedule refinements ---- */
section('schedule refinements');
ok(/4×20 s relaxed strides/.test(dayOfWeek(5, 3).run.detail), 'Thu easy runs carry strides');
/* The plyo micro-dose is OFF for the block (Sep 2026, athlete's call):
   Friday basketball already supplies jumps, landings, cuts and accelerations,
   so extra impact at 40–65 km/week is cost without benefit. Strides stay —
   they are running, not plyometrics. This is asserted, not merely absent,
   so nobody quietly reinstates it. */
ok(!/skipping|pogo/.test(dayOfWeek(5, 3).run.detail),
  'Thu easy runs carry no plyo dose — basketball supplies the impact');
ok(!/skipping|pogo/.test(dayOfWeek(5, 1).run.detail),
  'Tue easy runs carry no plyo dose — basketball supplies the impact');
ok(PLAN.runCues.tue === null || PLAN.runCues.tue === undefined,
  'the Tuesday plyo cue is retired at the data layer, not just unrendered');
for (const [wk, di] of [[5, 1], [12, 1], [12, 3], [20, 3], [27, 3]]) {
  ok(!/skipping|pogo/.test(dayOfWeek(wk, di).run.detail),
    'wk ' + wk + ' day ' + di + ' carries no plyo dose');
}
ok(!/relaxed strides/.test(dayOfWeek(5, 1).run.detail), 'Tue easy runs carry no strides');
ok(!/pogo|strides/.test(dayOfWeek(12, 5).run.detail), 'Sat buffer run stays plain — nothing before the long run');
ok(/headtorch/i.test(dayOfWeek(15, 2).run.detail), 'Oct Wed 17:10 carries the dark-kit note');
ok(/headtorch/i.test(dayOfWeek(15, 1).run.detail), 'Oct Tue 17:10 (work-day era) is dark');
ok(/headtorch/i.test(dayOfWeek(20, 1).run.detail), 'Nov Tue is dark');
ok(!/headtorch/i.test(dayOfWeek(8, 2).run.detail), 'Aug Wed is daylight');
ok(!/headtorch/i.test(dayOfWeek(26, 2).run.detail), 'holiday-week 09:30 runs are daylight');
ok(hasBlock(dayOfWeek(20, 5), /Carb-forward — 30 km tomorrow/), 'Sat dinner goes carb-forward before big long runs');
ok(!hasBlock(dayOfWeek(5, 5), /Carb-forward/), 'Base Sat dinner stays plain');
ok(!hasBlock(dayOfWeek(28, 5), /Carb-forward/), 'taper Sat (LR 18) stays plain');
{
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'make-ics.js')], { stdio: 'pipe' });
  const feed = path.join(__dirname, '..', 'training.ics');
  const txt = fs.readFileSync(feed, 'utf8');
  ok((txt.match(/BEGIN:VEVENT/g) || []).length > 250, 'calendar feed generates the full block');
  fs.unlinkSync(feed);
}

/* ---- 6c. scaffold eras (§16 answered) ---- */
section('scaffold eras');
{
  const hasRunAt = (day, hm) => day.blocks.some((b) => b.cat === 'run' && b.doable && b.start === hm);
  // Weeks 1–2: original — Tue college morning, run 16:15
  ok(hasBlock(dayOfWeek(1, 1), /College/), 'wk1 Tue is still a college day');
  ok(hasRunAt(dayOfWeek(1, 1), '16:15'), 'wk1 Tue run stays at 16:15');
  // Wk 3–11: Tuesday becomes a work day, run slides to 17:10
  ok(hasBlock(dayOfWeek(5, 1), /Work/), 'wk5 Tue is a work day (college era over)');
  ok(!hasBlock(dayOfWeek(5, 1), /College/), 'wk5 Tue no longer college');
  ok(hasRunAt(dayOfWeek(5, 1), '17:10'), 'wk5 Tue run moved to 17:10');
  ok(hasBlock(dayOfWeek(5, 1), /Upper A/), 'wk5 Tue keeps Upper A at 19:30');
  ok(hasBlock(dayOfWeek(5, 0), /Lower B/i), 'wk5 Mon carries Lower B (punchbag retired from Wk 4)');
  // Wk 12+: Monday becomes the college day
  ok(hasBlock(dayOfWeek(12, 0), /^College$/m ? /College/ : /College/), 'wk12 Mon is the college day');
  ok(hasBlock(dayOfWeek(12, 0), /College/) && hasBlock(dayOfWeek(12, 0), /Legs microdose · Pull · Core/),
    'wk12 Mon is a college day with the long gym session after');
  ok(hasBlock(dayOfWeek(18, 0), /Legs microdose · Pull · Core/) && hasBlock(dayOfWeek(18, 0), /calf raises/i),
    'wk18 Mon carries the SAME session — the leg dose is scaled by fatigue, not by the calendar');
  ok(dayOfWeek(12, 0).run === null, 'wk12 Mon still has no run');
  ok(hasBlock(dayOfWeek(12, 1), /Work/), 'wk12 Tue stays a work day');
  ok(hasRunAt(dayOfWeek(12, 1), '17:10'), 'wk12 Tue run still 17:10');
  // Special weeks still win over the scaffold
  ok(hasBlock(dayOfWeek(26, 0), /CHRISTMAS|full rest|holiday|Family/i) || dayOfWeek(26, 0).blocks.some((b) => /Punchbag/.test(b.title)),
    'wk26 Mon holiday template overrides the college scaffold');
  ok(hasBlock(dayOfWeek(24, 3), /REST/), 'wk24 Thu rest still applies over the scaffold');
  // Race week, recovery and the standing week live on the same era
  ok(hasBlock(dayOfWeek(30, 0), /College/) && dayOfWeek(30, 0).blocks.some((b) => /Easy 5/.test(b.title)),
    'wk30 race-week Monday is an college day with the easy 5');
  ok(hasBlock(dayOfWeek(30, 1), /Work/) && hasRunAt(dayOfWeek(30, 1), '17:10'),
    'wk30 race-week Tuesday is a work day, easy 4 at 17:10');
  ok(hasBlock(DB.buildDay('2027-01-25'), /College/),
    'recovery Monday (day after the race) is an college day');
  ok(hasBlock(DB.buildDay('2027-01-26'), /Work/),
    'recovery Tuesday is a work day');
  ok(hasBlock(DB.buildDay('2027-03-01'), /College/),
    'standing-week Monday stays the college day');
  ok(hasBlock(DB.buildDay('2027-03-02'), /Work/) && hasRunAt(DB.buildDay('2027-03-02'), '17:10'),
    'standing-week Tuesday is a work day, hobby run at 17:10');
}

/* ---- 7a2. Easy pace bands (§10) ----
   The band must progress, stay narrower than the old 30 s catch-all, and
   never creep close enough to MP that "easy" stops being easy. */
section('easy pace bands');
{
  const secs = (s) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
  const parse = (b) => b.split('–').map(secs);
  const bands = PLAN.easyBands;

  ok(bands.length >= 3, 'easy pace is phased, not one static band');
  ok(bands[0].fromWk === 1, 'bands start at week 1 so every week resolves');

  let prevFrom = 0, prevFast = 0, prevSlow = 0;
  for (const b of bands) {
    const [fast, slow] = parse(b.band);
    const [gFast, gSlow] = parse(b.good);
    ok(b.fromWk > prevFrom, 'band fromWk ascends at wk ' + b.fromWk);
    ok(slow - fast <= 25, 'band at wk ' + b.fromWk + ' is at most 25 s wide (was 30)');
    ok(gSlow - gFast <= 12, 'good-day window at wk ' + b.fromWk + ' is tight enough to inspect');
    ok(gFast >= fast && gSlow <= slow, 'good-day window sits inside the band at wk ' + b.fromWk);
    /* MP guard: easy must stay ≥ 30 s/km slower than the 5:41 goal MP,
       and ≥ 40 s/km slower than the 5:20 stretch MP is NOT required —
       a quicker easy pace is evidence MP has moved, not licence to race. */
    ok(fast - secs('5:20') >= 35, 'wk ' + b.fromWk + ' easy stays ≥35 s/km clear of goal MP 5:20');
    if (prevFast) {
      ok(fast <= prevFast && slow <= prevSlow, 'bands never get slower as fitness builds (wk ' + b.fromWk + ')');
    }
    prevFrom = b.fromWk; prevFast = fast; prevSlow = slow;
  }

  const first = parse(bands[0].band)[0];
  const last = parse(bands[bands.length - 1].band)[0];
  ok(first - last >= 8 && first - last <= 20,
    'easy pace shifts 8–20 s/km across the block — anchored to MP, not chasing it (got ' +
    (first - last) + ' s)');

  /* every week resolves, and the run cards carry that week's band */
  for (let wk = 1; wk <= 30; wk++) {
    const band = DB.easyBand(wk);
    ok(band && band.band && band.good, 'wk ' + wk + ' resolves an easy band');
  }
  const wk3Thu = dayOfWeek(3, 3).blocks.find((b) => /Easy run/.test(b.title));
  const wk22Thu = dayOfWeek(22, 3).blocks.find((b) => /Easy run/.test(b.title));
  ok(wk3Thu && wk3Thu.detail.includes(DB.easyBand(3).band),
    'wk 3 easy run card carries the wk 3 band');
  ok(wk22Thu && wk22Thu.detail.includes(DB.easyBand(22).band),
    'wk 22 easy run card carries the quicker late-Build band');
  ok(!wk3Thu.detail.includes(DB.easyBand(22).band),
    'the wk 3 card does NOT show a late-Build band');
  ok(wk3Thu.detail !== wk22Thu.detail, 'the run card actually changes across the block');

  ok(PLAN.benchmark && /Thursday/i.test(PLAN.benchmark.slot),
    'the benchmark run is named and repeatable');
  ok(PLAN.benchmark.conditions.length >= 4, 'benchmark conditions are specified');
  ok(/HR/.test(PLAN.benchmark.log), 'the benchmark logs HR, not just pace');
}

/* ---- 7a3. Run-log maths + key events + pacing tables (v3.0) ---- */
section('run-log maths · key events · pacing tables');
{
  /* EF: 13.07 km in 83:04 (4984 s) at 146 bpm ≈ 1.078 */
  const v = DB.ef(13.07, 4984, 146);
  ok(v && Math.abs(v - 1.078) < 0.005, 'EF maths: 13.07 km / 83:04 / 146 bpm ≈ 1.078, got ' + (v && v.toFixed(3)));
  ok(DB.ef(5, 1800, null) === null && DB.ef(0, 1800, 150) === null, 'EF guards against missing inputs');
  ok(DB.paceOf(13.07, 4984) === '6:21', 'pace formatting: 4984 s over 13.07 km = 6:21/km');
  ok(DB.paceOf(0, 100) === null, 'pace guards against zero distance');

  /* key events: ordered, well-formed, each lands on a real run day */
  ok(PLAN.keyEvents && PLAN.keyEvents.length === 5, 'five key events defined');
  for (const ev of PLAN.keyEvents) {
    const d = dayOfWeek(ev.wk, ev.di);
    ok(d.run && d.run.run.km > 0, 'key event "' + ev.label + '" lands on a day with a run');
  }
  const fromToday = DB.nextKeyEvent('2026-08-09');
  ok(fromToday && /2-MILE/.test(fromToday.label) && fromToday.days === 12,
    'from 9 Aug the next key event is the TT in 12 days, got ' + JSON.stringify(fromToday));
  const afterTT = DB.nextKeyEvent('2026-08-22');
  ok(afterTT && /PARKRUN/.test(afterTT.label), 'after the TT the next key event is the parkrun');
  const raceDay = DB.nextKeyEvent('2027-01-24');
  ok(raceDay && /MARATHON/.test(raceDay.label) && raceDay.days === 0, 'race day resolves to the marathon, 0 days out');
  ok(DB.nextKeyEvent('2027-01-25') === null, 'the day after the race there are no key events left');

  /* pacing tables ride the blocks as data */
  const tt = dayOfWeek(8, 4).run;
  ok(tt.table && tt.table.rows.length === 8 && /THE DECISION/.test(tt.table.rows[5][1]),
    'the TT carries its 8-row lap script with the lap-6 decision');
  const race = dayOfWeek(30, 6).run;
  ok(race.table && race.table.rows.length === 8, 'race day carries the 8-point split table');
  ok(race.table.rows.some((r) => r[0] === 'Half' && r[1] === '1:52:31'),
    'the 3:45 plan crosses halfway at 1:52:31');
  ok(race.table.rows.some((r) => /42\.2/.test(r[0]) && /3:45/.test(r[1])),
    'the 3:45 plan finishes on 3:45');
  ok(PLAN.race.goal === '3:45' && PLAN.race.goalPace === '5:20/km',
    'the race object carries the 3:45 target');
  ok(DB.parsePace('5:20') * 42.195 < 13510, 'MP 5:20 over 42.195 km does land inside 3:45');
  ok(!dayOfWeek(7, 6).run.table, 'ordinary runs carry no pacing table');
}

/* ---- 7a4. Log steppers: classification + estimates (v3.1) ---- */
section('run classification + log estimates');
{
  /* paceSpan widened 30 → 60 and hrStep dropped 2 → 1 in v4.40. Both were
     found by trying to log a real run: 5:50/km against a 6:23 estimate was
     outside the old ±30 span, and 151 bpm does not exist when the step is 2
     from an even centre. */
  ok(PLAN.logModel.paceSpan === 60 && PLAN.logModel.hrSpan === 20,
    'stepper spans are ±60 s/km and ±20 bpm');
  ok(PLAN.logModel.hrStep === 1,
    'HR steps 1 bpm — 2 makes odd values unreachable and adds ~1.3% error to EF');
  /* temperature: without it, every pace-at-HR comparison is a weather comparison */
  ok(PLAN.logModel.tempStep === 1 && PLAN.logModel.tempMin < 0 && PLAN.logModel.tempMax >= 35,
    'the log carries an air-temperature stepper across a usable range');
  ok(PLAN.benchmark.tempWarn === 18 && PLAN.benchmark.tempInvalid === 24,
    'the §10 heat thresholds are data the app can enforce, not just prose');
  ok(PLAN.benchmark.tempWarn < PLAN.benchmark.tempInvalid, 'warn threshold sits below the invalid one');
  /* heat correction, checked against the two real runs it was built for */
  ok(DB.adjustPace(392, 21) === 379 && DB.adjustPace(408, 28) === 379,
    '6 Aug (6:32 @21°) and 11 Aug (6:48 @28°) both correct to 6:19 — the gap was weather, not fitness');
  ok(DB.adjustPace(400, 15) === null && DB.adjustPace(400, 10) === null,
    'at or below the baseline there is no correction to make');
  ok(DB.adjustPace(400, null) === null && DB.adjustPace(0, 25) === null, 'guards on missing inputs');
  ok(DB.adjustPace(400, 30) < 400, 'heat correction always makes a hot run look quicker, never slower');
  /* quality runs are prescribed by effort — the 12 Aug tempo showed the
     4:00-derived pace band returns Z3, not Z4 */
  const tempo = dayOfWeek(7, 2).run;
  ok(/HEART RATE/.test(tempo.detail), 'the tempo card leads with heart rate, not pace');
  ok(/readout, not a target/.test(tempo.detail), 'the pace band is demoted to a readout');
  ok(!/Easy run/.test(tempo.title) && /Tempo/.test(tempo.title), 'wk 7 Wed is still the tempo session');
  /* MP is the exception: trained in Z3, raced by the clock */
  const mpLong = dayOfWeek(14, 6).run;
  ok(/MP segments 5:20/.test(mpLong.detail), 'MP segments name the 3:45 target pace');
  ok(/Z3/.test(mpLong.detail), 'MP segments carry the Z3 sanity check');
  ok(/too\s+slow/.test(mpLong.detail), 'the card says what a below-Z3 reading would mean');
  ok(!/HEART RATE/.test(mpLong.detail),
    'MP is NOT prescribed by HR — cardiac drift makes that wrong over marathon duration');
  ok(DB.runClass(dayOfWeek(8, 4).run) === 'race', 'the TT classifies as race');
  ok(DB.runClass(dayOfWeek(24, 6).run) === 'race', 'the tune-up half classifies as race, not long');
  ok(DB.runClass(dayOfWeek(8, 1).run) === 'quality', 'the 400s rehearsal classifies as quality');
  ok(DB.runClass(dayOfWeek(7, 2).run) === 'quality', 'wk 7 Wed tempo classifies as quality');
  ok(DB.runClass(dayOfWeek(7, 6).run) === 'long', 'wk 7 Sunday classifies as long');
  ok(DB.runClass(dayOfWeek(7, 1).run) === 'easy', 'wk 7 Tuesday classifies as easy');

  /* Buffer/shakeout runs are their own class — pooled with easy runs
     their Z1 efficiency reads as a fitness collapse that never happened. */
  ok(DB.runClass(dayOfWeek(7, 5).run) === 'recovery', 'the Saturday buffer run classifies as recovery');
  ok(DB.runClass(dayOfWeek(30, 3).run) === 'recovery', 'the race-week shakeout classifies as recovery');
  ok(DB.runClass(dayOfWeek(17, 6).run) === 'long', 'wk 17 "Long 16 — recovery" is still a long run, not a shakeout');
  {
    const est = DB.logEstimate(dayOfWeek(7, 5), []);
    const easyEst = DB.logEstimate(dayOfWeek(7, 1), []);
    ok(est.cls === 'recovery' && est.paceSec === easyEst.paceSec + PLAN.logModel.recoveryPaceAdd,
      'a recovery run opens its stepper slower than easy, not at easy pace');
    ok(est.hr === PLAN.logModel.fallbackHr.recovery,
      'a recovery run falls back to the recovery HR, not the easy one');
  }

  /* no history → phase band midpoint + fallback HR */
  const bare = DB.logEstimate(dayOfWeek(7, 6), []);
  ok(bare && bare.paceSec === 385 && bare.hr === PLAN.logModel.fallbackHr.long,
    'wk 7 long-run estimate with no history: band mid 6:23 snapped to 6:25, fallback HR — got ' +
    DB.fmtPaceSec(bare.paceSec) + '/' + bare.hr);
  ok(bare.paceMax - bare.paceMin === 120 && bare.hrMax - bare.hrMin === 40,
    'stepper bounds span ±60 s and ±20 bpm around the estimate');
  /* The stepper moves in fixed increments FROM the centre, so an unrounded
     centre makes half the plausible values unreachable — from 6:23 you can
     hit 5:53 or 5:48 but never 5:50. Every opening estimate must sit on the
     grid so every reachable value is a round number. */
  [1, 7, 14, 20, 24, 30].forEach((w) => {
    [1, 2, 3, 5, 6].forEach((di) => {
      const d = dayOfWeek(w, di);
      if (!d.run) return;
      const e = DB.logEstimate(d, []);
      /* Days with a declared target pace are exempt — that value is
         prescribed content and is deliberately left exactly as written. */
      if (!e || d.run.run.estPace) return;
      ok(e.paceSec % PLAN.logModel.paceStep === 0,
        'wk ' + w + ' day ' + di + ' estimate ' + DB.fmtPaceSec(e.paceSec) + ' sits on the ' +
        PLAN.logModel.paceStep + ' s step grid');
    });
  });

  /* history → median of the last three similar runs */
  const hist = [
    { iso: '2026-08-02', cls: 'long', paceSec: 395, hr: 147 },
    { iso: '2026-08-09', cls: 'long', paceSec: 383, hr: 146 },
    { iso: '2026-07-26', cls: 'long', paceSec: 374, hr: 150 },
    { iso: '2026-08-06', cls: 'easy', paceSec: 392, hr: 139 },
  ];
  const withHist = DB.logEstimate(dayOfWeek(9, 6), hist);
  ok(withHist.paceSec === 383 && withHist.hr === 147,
    'estimate centres on the median of the last 3 long runs — got ' +
    DB.fmtPaceSec(withHist.paceSec) + '/' + withHist.hr);

  /* race days centre on their declared target pace */
  const tt = DB.logEstimate(dayOfWeek(8, 4), hist);
  ok(tt.paceSec === 239 && tt.hr === PLAN.logModel.fallbackHr.race,
    'TT estimate centres on 3:59/km — the 12:48 target — with the race HR fallback');
  ok(DB.parsePace('6:35') === 395 && DB.fmtPaceSec(395) === '6:35', 'pace parse/format round-trips');
}

/* ---- 7a5. Skyline shape + verdicts (v3.2) ---- */
section('season shape + verdicts');
{
  const none = () => null;
  const shape = DB.seasonShape(none);
  ok(shape.length === 30, 'the skyline covers all 30 weeks');
  ok(shape.every((w) => w.banked === 0), 'no ticks → nothing banked');
  ok(shape[29].race === true && shape[29].km === 15, 'week 30 is the race week');
  ok(PLAN.keyEvents.every((ev) => shape[ev.wk - 1].key),
    'every key-event week is flagged on the skyline');
  ok(shape.filter((w) => w.key).length === 10,
    'the ten §7 KEY weeks are flagged (5 race days + the flagged build weeks)');
  ok(shape[22].km === 60, 'peak volume week 23 tops the skyline at 60');
  ok(shape.filter((w) => w.cutback).length >= 5, 'cutback weeks carried through');

  /* banked km: tick wk 1 Wednesday, expect its km banked in wk 1 */
  const wed1 = dayOfWeek(1, 2);
  const fakeDone = (iso) => (iso === wed1.iso ? { [wed1.run.id]: true } : null);
  const banked = DB.seasonShape(fakeDone);
  ok(banked[0].banked === wed1.run.run.km, 'ticking a run banks its km in the right week');

  /* verdicts */
  const hist = [
    { iso: '2026-07-26', cls: 'long', paceSec: 374, hr: 150, ef: 1.069 },
    { iso: '2026-08-02', cls: 'long', paceSec: 395, hr: 147, ef: 1.033 },
    { iso: '2026-08-05', cls: 'easy', paceSec: 373, hr: 143, ef: 1.123 },
    { iso: '2026-08-09', cls: 'long', paceSec: 381, hr: 146, ef: 1.078 },
  ];
  const v = DB.logVerdict(hist, '2026-08-09');
  ok(v && !v.first && v.dPace === 14 && v.dHr === -1,
    '9 Aug vs 2 Aug: 14 s/km quicker at −1 bpm — got ' + JSON.stringify(v));
  ok(v.best === true, '9 Aug is the block-best long-run EF in this history');
  const v2 = DB.logVerdict(hist, '2026-08-02');
  ok(v2 && v2.dPace === -21 && v2.best === false,
    '2 Aug reads honestly slower than 26 Jul, no best flag');
  const v3 = DB.logVerdict(hist, '2026-08-05');
  ok(v3 && v3.first === true && v3.best === true, 'first easy log is first + best');
  ok(DB.logVerdict(hist, '2026-01-01') === null, 'unknown date → no verdict');
}

/* ---- 7a6. Gym deload on cutback weeks (v3.3) ---- */
section('gym deload');
{
  /* The pressing session is Upper A on TUESDAY up to Wk 11 (as lived) and
     Push on WEDNESDAY from Wk 12, when the split was rebuilt and push moved
     onto the quality day. The deload rules are indifferent to which. */
  const upperA = (wk) => dayOfWeek(wk, wk >= 12 ? 2 : 1).blocks
    .find((b) => /Upper A|Gym — Push/.test(b.title));
  const setsOf = (b, ex) => (b.plan.find((p) => new RegExp(ex, 'i').test(p.ex)) || {}).sets;

  ok(!/deload/i.test(upperA(12).title) && setsOf(upperA(12), 'Bench') === '3 × 5–8 @ ~2 RIR',
    'wk 12 (not a cutback) keeps full sets');
  ok(/deload/i.test(upperA(13).title) && setsOf(upperA(13), 'Bench') === '2 × 5–8 @ ~2 RIR',
    'wk 13 cutback halves the sets, same rep range');
  ok(/deload/i.test(upperA(21).title), 'wk 21 cutback deloads');
  ok(!/deload/i.test(upperA(4).title),
    'wk 4 cutback does NOT deload — running is too small to warrant it before Wk 13');
  /* Wk 8 is the exception to "no deload before Wk 13": that rule is about
     running volume being small, and says nothing about a week holding the
     block's only maximal effort. Freshness for the TT outranks the build. */
  ok(/deload/i.test(upperA(8).title), 'wk 8 deloads despite predating the rule — it holds the 2-mile TT');
  ok(/deload/i.test(dayOfWeek(8, 5).blocks.find((b) => /Upper B/.test(b.title)).title),
    'wk 8 Saturday Upper B deloads too');
  ok(!/deload/i.test(upperA(4).title) && !/deload/i.test(upperA(9).title),
    'the wk 8 exception is one week only — wks 4 and 9 are unaffected');

  /* TT week carries no leg work at all. The clash is with TUESDAY's 4×400
     rehearsal ~20 h later, not with Friday. */
  const wk8Mon = dayOfWeek(8, 0);
  ok(!wk8Mon.blocks.some((b) => b.cat === 'gym'), 'wk 8 Monday has no gym at all');
  ok(!wk8Mon.blocks.some((b) => /calf|deadlift|step-up|squat/i.test(b.title + ' ' +
    (b.plan || []).map((p) => p.ex).join(' '))), 'wk 8 Monday carries no leg or calf loading');
  ok(wk8Mon.blocks.some((b) => /rest/i.test(b.title)), 'wk 8 Monday says plainly that it is a rest evening');
  ok(wk8Mon.blocks.some((b) => /Dinner/.test(b.title)) &&
     wk8Mon.blocks.some((b) => /German active/.test(b.title)) &&
     wk8Mon.blocks.some((b) => /Read/.test(b.title)),
    'dropping the gym leaves the rest of Monday intact — dinner, German, reading');
  ok(dayOfWeek(7, 0).blocks.some((b) => /Lower B/.test(b.title)) &&
     dayOfWeek(9, 0).blocks.some((b) => /Lower B/.test(b.title)),
    'Lower B returns either side of TT week — it is dropped, not retired early');
  ok(/maintenance/i.test(upperA(23).title) && !/deload/i.test(upperA(23).title),
    'from wk 23 maintenance already applies — never both labels');

  /* the load must never be cut — only the set count changes */
  const full = upperA(12).plan, del = upperA(13).plan;
  ok(full.length === del.length, 'deload keeps every exercise');
  ok(del.every((p, i) => p.sets.split('×')[1] === full[i].sets.split('×')[1]),
    'deload changes set count only — rep ranges (and therefore load) are untouched');
  ok(del.every((p) => Number(p.sets.split('×')[0]) >= PLAN.blocks[0].gymDeload.minSets),
    'no exercise drops below the 2-set floor');
  ok(/SAME weights/i.test(upperA(13).detail), 'the card says the weight does not drop');
}

/* ---- 7a7. Start-view shortcuts + today-at-a-glance ---- */
section('shortcut targets');
{
  const fs = require('fs');
  const mf = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.webmanifest'), 'utf8'));
  ok(Array.isArray(mf.shortcuts) && mf.shortcuts.length === 2, 'manifest declares two home-screen shortcuts');
  ok(mf.shortcuts.every((sc) => /^\.\/\?view=(week|plan)$/.test(sc.url)),
    'shortcut urls target views the app can actually open');
  ok(mf.shortcuts.every((sc) => sc.icons && sc.icons.length), 'each shortcut carries an icon');
  /* The icon (v4.94) is the day clock, drawn in the app's own palette: every
     hex it uses must be a value the stylesheet declares in :root. */
  const iconSvg = fs.readFileSync(path.join(__dirname, '../icons/icon.svg'), 'utf8');
  const rootCss = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
  const palette = new Set((rootCss.slice(rootCss.indexOf(':root {'), rootCss.indexOf('}', rootCss.indexOf(':root {'))).match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()));
  const foreign = [...new Set((iconSvg.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()))].filter((h) => !palette.has(h));
  ok(foreign.length === 0, 'the app icon paints only with palette colours' + (foreign.length ? ' — found ' + foreign.join(', ') : ''));
  ok(/id="hand"/.test(iconSvg) && /id="sky"/.test(iconSvg), 'the app icon is the day clock: sky ring and Breguet hand');
  ['icon-180.png', 'icon-512.png'].forEach((f) => ok(fs.statSync(path.join(__dirname, '../icons', f)).size > 4000, 'icons/' + f + ' is rendered'));
}

/* ---- 7a8. Basketball is training (v3.4) ---- */
section('basketball as training');
{
  const halves = (wk) => dayOfWeek(wk, 4).blocks.filter((b) => /^Basketball/.test(b.title));
  const h = halves(15);
  ok(h.length === 2, 'basketball renders as its two real halves, not one blended block');
  ok(h[0].start === '19:00' && h[0].end === '20:00' && /1v1/.test(h[0].title),
    'the 1v1 training hour runs 19:00–20:00');
  ok(h[1].start === '20:00' && h[1].end === '21:00' && /shooting/i.test(h[1].title),
    'the shooting hour runs 20:00–21:00');
  ok(h.every((b) => b.doable && b.cat === 'xt'), 'both halves stay tickable cross-training');
  ok(/500 kcal/.test(h[0].detail) && /350 kcal/.test(h[1].detail),
    'each half states its own energy cost, not a blended one');
  ok(/top-end/.test(h[0].detail) && /lateral/.test(h[0].detail),
    'the 1v1 half is credited with the top-end and lateral work');
  ok(/recovery/i.test(h[1].detail) && !/top-end/.test(h[1].detail),
    'the shooting half is described as recovery, never as training');
  /* the evening block must not collide with the longer session */
  const eve = dayOfWeek(15, 4).blocks.find((b) => /Evening — out/.test(b.title));
  ok(eve && eve.start === '21:00', 'the Friday evening block starts after basketball, not during it');
  /* still off on the five protected weeks — injury risk, not low value */
  for (const wk of [17, 24, 26, 27, 30]) {
    ok(!dayOfWeek(wk, 4).blocks.some((b) => b.doable && /^Basketball — (1v1|shooting)/.test(b.title)),
      'wk ' + wk + ' keeps both basketball halves off before its key day');
  }
  ok(/2 hr|2h/i.test(PLAN.loadBudget), 'the weekly load budget counts basketball');
  ok(PLAN.rules.some((r) => /two sessions, not one/i.test(r)),
    'rule 3 distinguishes the training half from the recovery half');
  ok(!PLAN.openQuestions.some((q) => /confirm the Friday/i.test(q)), 'the §16 basketball question is closed');
}

/* ---- 7a9. HR zones (v3.5) ---- */
section('hr zones');
{
  ok(PLAN.zoneModel && PLAN.zoneModel.zones.length === 5, 'five zones defined in the model');
  ok(/reserve|Karvonen/i.test(PLAN.zoneModel.method), 'the model is %HRR, not %max');
  /* the repo must never carry the athlete's own physiology */
  const planSrc = require('fs').readFileSync(path.join(__dirname, '../data/plan.js'), 'utf8');
  ok(!/restHr|restingHr|maxHr\s*:/.test(planSrc),
    'no personal resting/max HR value is committed to the repo');

  /* Round, textbook numbers — deliberately NOT the athlete's own. His
     resting and max HR are personal health data and live only in
     localStorage under `hr` (§4.10); the earlier version of this test
     had his real pair hardcoded, which put physiology in the repo by
     the back door. HRR here is a clean 140, so the maths is checkable
     by eye. */
  const z = DB.hrZones(50, 190);
  ok(z && z.length === 5, 'zones compute from a rest 50 / max 190 fixture');
  ok(z[0].lo === 120 && z[1].lo === 134 && z[1].hi === 148,
    'Karvonen maths: Z1 opens 120, Z2 runs 134–148, got ' + z[0].lo + '/' + z[1].lo + '–' + z[1].hi);
  ok(z[4].hi === 190, 'Z5 tops out at max HR');
  ok(z.every((x, i) => i === 0 || x.lo === z[i - 1].hi), 'zones are contiguous, no gaps or overlaps');

  ok(DB.zoneOf(140, 50, 190).name === 'Easy', '140 bpm on the fixture reads Z2 Easy');
  ok(DB.zoneOf(170, 50, 190).name === 'Threshold', '170 bpm on the fixture reads Z4 Threshold');
  ok(DB.zoneOf(180, 50, 190).name === 'VO2max', '180 bpm on the fixture reads Z5');
  ok(DB.zoneOf(110, 50, 190).z === 0, 'below Z1 is reported as below Z1, not clamped up');

  ok(DB.hrZones(50, 100) === null && DB.hrZones(0, 190) === null,
    'implausible inputs return null rather than nonsense zones');

  /* Aerobic decoupling. The first-half HR is derived, not asked for:
     average HR is time-weighted, so hr×sec = hr1×t1 + hr2×t2 pins it. */
  {
    /* An evenly-run 15 km: 6:38/km (398 s) flat, HR flat — nothing decouples. */
    const flat = DB.decoupling(15, 398 * 15, 150, 398, 150);
    ok(flat && Math.abs(flat.pct) < 0.01,
      'a run with identical halves decouples by 0%, got ' + (flat && flat.pct.toFixed(2)));
    ok(flat && Math.abs(flat.hr1 - 150) < 0.05, 'derived first-half HR matches when both halves are equal');

    /* Second half slower AND higher HR — both costs, compounding. */
    const drift = DB.decoupling(15, 5970, 150, 390, 153);
    ok(drift && drift.pct > 0, 'a fading second half decouples positively');
    ok(drift && Math.abs(drift.hr1 + 0 - ((150 * 5970 - 153 * (5970 - 390 * 7.5)) / (390 * 7.5))) < 0.06,
      'first-half HR is recovered exactly from the time-weighted average');

    /* Negative split in both pace and HR reads negative — the good kind. */
    const neg = DB.decoupling(15, 5970, 150, 405, 148);
    ok(neg && neg.pct < 0, 'a genuine negative split reads as negative decoupling');

    ok(DB.decoupling(15, 5970, 150, null, 152) === null, 'missing half data returns null, not a guess');
    ok(DB.decoupling(15, 5970, 150, 900, 152) === null,
      'a first half longer than the whole run returns null rather than a negative second half');

    const m = PLAN.decoupleModel;
    ok(DB.decoupleVerdict(m.good - 1).band === 'good', 'under the good threshold reads good');
    ok(DB.decoupleVerdict(m.good + 1).band === 'ok', 'between thresholds reads ok');
    ok(DB.decoupleVerdict(m.ok + 1).band === 'poor', 'over the upper threshold reads poor');
    ok(m.good < m.ok, 'decoupling thresholds are ordered');
  }

  /* Saturday is a RECOVERY run (Aug 2026). The plan used to prescribe Z2
     for the one session whose whole job is arriving fresh on Sunday, which
     contradicted rule 10. It must now name Z1, must NOT carry the easy
     band, and must still classify as recovery so its EF never pools with
     easy runs. */
  {
    const sat = dayOfWeek(9, 5);
    ok(/Recovery buffer run/.test(sat.run.title), 'the Saturday run is named a recovery run');
    ok(/\bZ1\b/.test(sat.run.detail), 'it prescribes Z1');
    ok(!/\bZ2\b/.test(sat.run.detail), 'and never Z2');
    ok(sat.run.detail.indexOf(DB.easyBand(9).band) === -1,
      'it carries no easy band — a Z1 run judged against a Z2 band is the same error as pooling their EF');
    ok(/rule 10|belongs to Sunday/i.test(sat.run.detail), 'and says why');
    ok(DB.runClass(sat.run) === 'recovery', 'it still classifies as recovery');
    /* the other easy days are untouched */
    [1, 3].forEach((di) => {
      ok(/\bZ2\b/.test(dayOfWeek(9, di).run.detail),
        'day ' + di + ' still prescribes Z2 — only Saturday changed');
    });
    ok(DB.runClass(dayOfWeek(9, 1).run) === 'easy', 'Tuesday is still an easy run');
  }

  /* bandPlace reads a logged easy run back against the band the card
     prescribed. §10 is explicit that the band describes rather than
     targets, so the fast side must ask about HR rather than praise, and
     the slow side must state rather than scold. */
  {
    const wk = 9;                                    // band 6:10–6:35, good 6:15–6:25
    const b = DB.easyBand(wk);
    ok(b.band === '6:10–6:35' && b.good === '6:15–6:25', 'wk 9 band is the one being tested');
    ok(DB.bandPlace(DB.parsePace('6:19'), wk).where === 'good', '6:19 is a clear-day pace');
    ok(DB.bandPlace(DB.parsePace('6:15'), wk).where === 'good', 'the good range is inclusive at the fast end');
    ok(DB.bandPlace(DB.parsePace('6:25'), wk).where === 'good', 'and at the slow end');
    ok(DB.bandPlace(DB.parsePace('6:12'), wk).where === 'sharp',
      'inside the band but QUICKER than good is called out as such, not flattened to "in band"');
    ok(/quicker/.test(DB.bandPlace(DB.parsePace('6:12'), wk).text), 'and says so in words');
    ok(DB.bandPlace(DB.parsePace('6:31'), wk).where === 'band', 'inside the band but slower than good reads "in band"');
    ok(DB.bandPlace(DB.parsePace('6:05'), wk).where === 'under', 'quicker than the band reads under');
    ok(DB.bandPlace(DB.parsePace('6:40'), wk).where === 'over', 'slower than the band reads over');
    ok(/HR was Z2/.test(DB.bandPlace(DB.parsePace('6:05'), wk).text),
      'the fast side asks about heart rate — running under the band at true Z2 is fine (§10)');
    ok(!/slow|lazy|should/i.test(DB.bandPlace(DB.parsePace('6:40'), wk).text),
      'the slow side states a fact and does not scold');
    ok(DB.bandPlace(0, wk) === null && DB.bandPlace(380, 0) !== undefined,
      'bad input returns null rather than a bogus placement');
    /* the band moves with the phase, so the same pace can change verdict */
    ok(DB.bandPlace(DB.parsePace('6:32'), 9).where === 'band' &&
       DB.bandPlace(DB.parsePace('6:32'), 25).where === 'over',
      '6:32 sits inside the Base band and outside the Build one — the bar moves with the phase');
  }

  /* trendPct must read the LINE, not the endpoints — the whole point is
     that a single flat opener or warm closer cannot set the headline. */
  {
    ok(Math.abs(DB.trendPct([1, 2, 3, 4, 5]) - 400) < 0.01,
      'a clean straight line reports its own rise, got ' + DB.trendPct([1, 2, 3, 4, 5]).toFixed(2));
    ok(Math.abs(DB.trendPct([2, 2, 2, 2])) < 0.01, 'a flat series trends 0%');
    ok(DB.trendPct([1]) === 0 && DB.trendPct([]) === 0, 'too few points trend 0, never NaN');
    /* one wild endpoint must not dominate */
    const clean = DB.trendPct([1.00, 1.02, 1.04, 1.06, 1.08]);
    const spiked = DB.trendPct([1.00, 1.02, 1.04, 1.06, 1.30]);
    ok(spiked > clean, 'an outlier last point does move the trend');
    /* Honest about the limit: least-squares still gives endpoints leverage,
       so this damps an outlier rather than rejecting it. Endpoint-only would
       read +30.0% here; the line reads less, but not dramatically less. */
    const endpointOnly = ((1.30 - 1.00) / 1.00) * 100;
    ok(spiked < endpointOnly, 'the line reads below the endpoint delta, got ' +
      spiked.toFixed(1) + '% vs ' + endpointOnly.toFixed(1) + '%');
    ok(DB.trendPct([1.1, 1.0, 0.9]) < 0, 'a falling series reports negative');
  }

  /* The shape rule exists because a correct weekly TOTAL can hide a badly
     shaped week — wk 10 banked 101% of its kilometres with the long run
     taking 71% of them against a planned 47%. */
  {
    const r = PLAN.shapeRule;
    ok(r && r.lrShareOverPts > 0 && r.lrShareOverPts <= 15,
      'the long-run share tolerance is a sane number of percentage points');
    ok(r.shortPct > 0 && r.shortPct < 1 && r.overPct > 1, 'short and over thresholds bracket 100%');
    ok(/long run/i.test(r.note) && /aerobic|easy days/i.test(r.note),
      'the note explains what a skewed week actually costs');
    ok(/injur/i.test(r.note), 'and names the risk it creates');

    /* the wk 10 case the rule was written from */
    const row = DB.weekRow(PLAN.blocks[0], 10);
    const sp = DB.distancesForWeek(row);
    const planTotal = sp.tue + sp.wed + sp.thu + sp.sat + sp.long;
    const sharePlan = (sp.long / planTotal) * 100;
    ok(Math.abs(sharePlan - 47.4) < 1, 'wk 10 plans the long run at ~47% of the week, got ' + sharePlan.toFixed(1));
    const actual = { tue: 5.02, wed: 3.231, thu: 0, sat: 2.818, long: 27.296 };
    const ranTotal = Object.values(actual).reduce((a, b) => a + b, 0);
    const shareRan = (actual.long / ranTotal) * 100;
    ok(shareRan - sharePlan >= r.lrShareOverPts,
      'the lived wk 10 trips the share test: ' + shareRan.toFixed(1) + '% vs ' + sharePlan.toFixed(1) + '%');
    ok(Math.abs(ranTotal / planTotal - 1) < 0.03,
      'while its TOTAL is within 3% of plan — which is the whole point of the rule');
    ok(actual.thu / sp.thu < r.shortPct && actual.long / sp.long > r.overPct,
      'and both a missed session and an oversized one are caught');

    /* §7 documents the rebalance this protects */
    [7, 9, 10, 12, 14, 16, 20].forEach((wk) => {
      const w = DB.weekRow(PLAN.blocks[0], wk);
      const s = DB.distancesForWeek(w);
      const share = (s.long / (s.tue + s.wed + s.thu + s.sat + s.long)) * 100;
      ok(share >= 40 && share <= 58,
        'wk ' + wk + ' plans the long run at a sane share of the week, got ' + share.toFixed(1) + '%');
    });
  }

  /* Rule 4 is the only rule in the block with a lead time measured in
     months, and it was the only one with no readback. Counting gels is not
     the point — the RATE is, because the interval IS the rate. */
  {
    const g = PLAN.gels;
    /* the two runs that motivated this: near-identical rate, doubled gels */
    const wk9 = DB.carbRate(1, 101);
    const wk10 = DB.carbRate(2, 189);
    ok(Math.abs(wk9.rate - 13.7) < 0.2, 'wk 9: 1 gel over 101 min is 13.7 g/h, got ' + wk9.rate.toFixed(1));
    ok(Math.abs(wk10.rate - 14.6) < 0.2, 'wk 10: 2 gels over 189 min is 14.6 g/h, got ' + wk10.rate.toFixed(1));
    ok(Math.abs(wk10.rate - wk9.rate) < 1.5,
      'doubling the gels while doubling the duration moves the RATE by almost nothing — the thing a gel COUNT hides');
    /* tier selection follows duration, not distance */
    ok(wk9.interval === g.interval && wk9.want === Math.floor(101 / g.interval),
      'a 101 min run sits in the learning tier');
    ok(wk10.interval === g.longInterval && wk10.want === Math.floor(189 / g.longInterval),
      'a 189 min run steps up to the every-30 tier, wanting ' + wk10.want + ' gels');
    ok(wk10.target > wk9.target, 'and the target rate rises with it');
    /* the race protocol must fall out of the same function */
    const race = DB.carbRate(9, 225);
    ok(Math.abs(race.rate - 55) < 1, 'nine gels over 225 min is the ~55 g/h the race block names, got ' + race.rate.toFixed(1));
    /* guards */
    ok(DB.carbRate(null, 189) === null && DB.carbRate(2, 0) === null, 'missing input returns null, not a bogus rate');
    ok(DB.carbRate(0, 189).rate === 0, 'zero gels is a real answer, not a missing one');
  }

  /* The long-run guard is the return rule moved to the moment of decision.
     Wk 10 (Sep 2026) is the case: a niggle stopped Wednesday's tempo and
     rule 5 took Thursday off — both correct — and then Sunday tried to
     make the difference up in one run, turning a well-managed interruption
     into a 67% long-run jump. */
  {
    const g = PLAN.longRunGuard;
    ok(g && g.shortPct > 0.5 && g.shortPct < 1, 'the guard fires on a genuinely short week, not a slightly imperfect one');
    ok(/not the week|shortfall/i.test(g.note), 'it names the specific temptation');
    ok(/injur/i.test(g.note), 'and why the long run is the worst place to look for missed km');
    ok(!/lazy|should have|failed/i.test(g.note), 'it advises without scolding');

    const sp = DB.distancesForWeek(DB.weekRow(PLAN.blocks[0], 10));
    const plannedBySun = sp.tue + sp.wed + sp.thu + sp.sat;
    const ranBySun = 5.02 + 3.231 + 0 + 2.818;
    ok(ranBySun < plannedBySun * g.shortPct,
      'wk 10 by Sunday was ' + ranBySun.toFixed(1) + ' of ' + plannedBySun + ' km — the guard would have fired');
    ok(Math.round((plannedBySun - ranBySun) * 10) / 10 === 8.9,
      'and named the 8.9 km shortfall it was tempting to add to the long run');

    /* the shape panel must not call a niggle-truncated session a failure */
    ok(/rule 5/i.test(PLAN.shapeRule.caveat), 'the shape panel credits rule 5 for a short session');
    ok(/not.*whether the decisions were right|does not know why|not pretend/i.test(
      PLAN.shapeRule.caveat + ' ' + PLAN.shapeRule.note),
      'and is explicit that it measures where the km went, not whether the calls were right');
  }

  /* The return rule advises after a lost week. It must never tell him to
     make the kilometres up, and must name the long run as the protected
     session — those are the two ways this advice goes wrong. */
  {
    const r = PLAN.returnRule;
    ok(r && r.shortfall > 0 && r.shortfall < 1, 'shortfall is a fraction of the planned week');
    ok(r.jumpRatio > 1, 'the jump ratio is a genuine increase');
    ok(/long run/i.test(r.note), 'the note protects the long run by name');
    ok(/not make up|do not make up/i.test(r.note), 'the note forbids chasing the missing kilometres');
    /* the guard itself: wk 8 planned 23, wk 9 plans 34 */
    const wk8 = DB.weekRow(PLAN.blocks[0], 8).km;
    const wk9 = DB.weekRow(PLAN.blocks[0], 9).km;
    const ran = 9.5;
    ok(ran < wk8 * r.shortfall && wk9 >= ran * r.jumpRatio,
      'a 9.5 km week 8 followed by the planned week 9 does trip the guard');
    ok(!(wk8 * 0.9 < wk8 * r.shortfall),
      'a week run at 90% of plan does NOT trip it — this fires on lost weeks, not imperfect ones');
  }

  /* The intensity target is the audit of rule 1, so it has to be honest
     about what it can and cannot see. */
  {
    /* The renderer substitutes bpm into bare "Z1".."Z5" tokens at paint time
     (§4.10 — numbers on the phone, never in the repo). That only works if
     the plan text keeps the tokens intact and standalone. */
  {
    const zoneToken = /\bZ[1-5]\b/;
    ok(zoneToken.test(PLAN.tempoPaceNote), 'the tempo note carries a bare zone token to expand');
    ok(zoneToken.test(DB.buildDay('2026-08-25').run.detail),
      'an easy run names its zone, so the renderer can fill in the bpm');
    const tempo = PLAN.paces.find((p) => /tempo|threshold/i.test(p.type));
    ok(zoneToken.test(tempo.pace),
      'the Paces card prescribes threshold by zone, not by the stale 4:00-goal band');
    ok(!/5:05|5:20 \/km/.test(tempo.pace),
      'the 5:05–5:20 band is gone — it was a minute per km off the measured threshold');
    /* And the substitution itself, mirrored here since app.js has no harness */
    const expand = (s, rest, max) => {
      const zs = DB.hrZones(rest, max);
      return String(s).replace(/\bZ([1-5])\b/g, (m0, n) =>
        zs[+n - 1] ? 'Z' + n + '\u00a0(' + zs[+n - 1].lo + '\u2060–\u2060' + zs[+n - 1].hi + ')' : m0);
    };
    ok(/'Z' \+ n \+ '\\u00a0\(' \+ z\.lo \+ '\\u2060–\\u2060' \+ z\.hi/.test(require('fs').readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8')),
      'the app expands zones with the same unbreakable joins as this mirror');
    ok(expand('Run at Z4 threshold', 50, 190) === 'Run at Z4\u00a0(162\u2060–\u2060176) threshold',
      'zone tokens expand to the fixture’s own bpm, got ' + expand('Run at Z4 threshold', 50, 190));
    ok(expand('the Z2 band', 50, 190).indexOf('(134\u2060–\u2060148)') > 0, 'Z2 expands to the right band');
    ok(expand('Zone 4 and AZ4B', 50, 190) === 'Zone 4 and AZ4B',
      'only standalone tokens expand — never a fragment inside another word');
  }

  /* The tempo readout must sit FASTER than the pace that produced the
     too-easy first tempo (4:31/km heat-corrected at Z3), or it invites the
     same mistake it exists to prevent. */
  {
    const n = PLAN.tempoPaceNote || '';
    const band = (n.match(/(\d):(\d{2})–(\d):(\d{2})\/km/) || []);
    ok(band.length === 5, 'the tempo note carries a pace band');
    const slow = +band[3] * 60 + +band[4];
    const fast = +band[1] * 60 + +band[2];
    /* The band is a CLEAR-DAY band, so it must bracket the heat-CORRECTED
       measurement, not the raw one. Reading a warm-day raw pace as though
       it were a clear-day pace is the exact mistake that produced a wrong
       revision on 26 Aug. */
    const measuredRaw = 284;                                  // 4:44/km, km 3–4
    const corrected = DB.adjustPace(measuredRaw, 25);         // at feels-like 25 °C
    ok(corrected === 268, 'the 26 Aug tempo corrects to 4:28/km, got ' + corrected);
    ok(fast <= corrected && slow >= corrected,
      'the clear-day band brackets the corrected measurement, got ' +
      DB.fmtPaceSec(fast) + '–' + DB.fmtPaceSec(slow) + ' vs ' + DB.fmtPaceSec(corrected));
    ok(slow < measuredRaw,
      'and the clear-day band is quicker than that warm-day raw pace, as it must be');
    ok(/measured/i.test(n), 'the note says the band is measured rather than derived');
    ok(/°C/.test(n) && /heat|above 15/i.test(n),
      'the note carries the heat rule — a slow tempo in the heat is the correction working');
    ok(/HEART RATE/.test(n) && /readout, not a target/.test(n),
      'the tempo note still leads with HR and refuses to make the pace a target');
  }

  const t = PLAN.intensityTarget;
    ok(t && t.easyPct >= 70 && t.easyPct <= 90, 'the easy-share target is a plausible polarised benchmark');
    ok(/average/i.test(t.note) && /understate/i.test(t.note),
      'the note admits average HR understates interval days rather than pretending to time-in-zone');
    ok(t.good && t.warn && t.good !== t.warn, 'both verdicts exist and differ');
    ok(/grey zone|easy means easy/i.test(t.warn), 'the warning names the actual failure mode');
  }

  /* Max HR scales every zone, and the two failure modes point opposite
     ways: age formulas read low, optical watches cadence-lock high. The
     guidance has to name both or it is only half a warning. */
  {
    const m = PLAN.zoneModel.measure || '';
    ok(/cadence/i.test(m) && /chest strap/i.test(m), 'max-HR guidance warns about cadence lock');
    ok(/estimate|formula/i.test(m), 'max-HR guidance warns against age estimates');
    ok(/above/i.test(m), 'max-HR guidance says a higher-than-stored max is normal, not an error');
  }

  /* And the guard that keeps it that way: every rest/max pair written
     into committed source must come from this allowlist, so a real
     measurement cannot be pasted in unnoticed by anyone — me included. */
  const ALLOWED = ['50/190', '50/100', '0/190'];
  const files = ['../data/plan.js', '../js/day-builder.js', '../js/app.js',
    '../js/ef-chart.js', '../js/run-progress.js', '../js/run-import.js', '../tests/run-import.test.js', '../js/run-stream.js', '../tests/run-stream.test.js', '../tests/build.test.js'];
  {
    /* The browser tool seeds localStorage directly, so its fixture is the
       place a real pair would most easily slip in. */
    const src = require('fs').readFileSync(path.join(__dirname, '../tools/interactions.js'), 'utf8');
    const pairs = [...src.matchAll(/rest:\s*(\d+),\s*max:\s*(\d+)/g)].map((m) => m[1] + '/' + m[2]);
    ok(pairs.length > 0 && pairs.every((p) => ['50/190', '53/190'].includes(p)), 'interactions.js uses fixture HR pairs only: ' + pairs.join(', '));
  }
  files.forEach((f) => {
    const src = require('fs').readFileSync(path.join(__dirname, f), 'utf8');
    const re = /(?:hrZones|zoneOf)\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const nums = m[1].split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
      if (nums.length < 2) continue;               // variables, not literals — fine
      const pair = nums.slice(-2).join('/');
      ok(ALLOWED.indexOf(pair) >= 0,
        'no real physiology in ' + f.replace('../', '') + ': rest/max ' + pair + ' is not an allowed fixture');
    }
  });

  /* The same rule, one layer out. tools/shoot.js runs a static server rooted
     at the repo, and .gitignore has no authority over a running server: an
     untracked PRIVATE.md sitting in this directory is still a file on disk
     that a GET can reach. The guard is an extension allowlist — the app only
     ever loads html/js/css/json/webmanifest/png/svg/woff2/ics, so anything
     else is a 404 before the path is even resolved. Assert against the real
     source, not against a copy of it, because a copy drifts. */
  for (const tool of ['shoot.js', 'interactions.js']) {
    const src = require('fs').readFileSync(path.join(__dirname, '../tools/' + tool), 'utf8');
    const mime = src.match(/const MIME = \{[\s\S]*?\n\};/);
    const deny = src.match(/const DENY = (\/.*\/[a-z]*);/);
    ok(!!mime && !!deny, tool + ' still declares a MIME allowlist and a DENY pattern');
    if (mime && deny) {
      // eslint-disable-next-line no-eval
      const MIME = eval('(' + mime[0].replace(/^const MIME = /, '').replace(/;$/, '') + ')');
      // eslint-disable-next-line no-eval
      const DENY = eval(deny[1]);
      ['.md', '.env', '.json5', '.txt', '.pem', '.key', ''].forEach((ext) => {
        ok(!Object.prototype.hasOwnProperty.call(MIME, ext),
          tool + ' will not serve "' + ext + '" — private notes stay off the wire');
      });
      ['.html', '.js', '.css', '.png', '.woff2', '.webmanifest'].forEach((ext) => {
        ok(Object.prototype.hasOwnProperty.call(MIME, ext), tool + ' still serves ' + ext);
      });
      ['.git/config', 'private/seed.json', 'a/private/x.png'].forEach((p) => {
        ok(DENY.test(p), tool + ' refuses ' + p);
      });
      ok(!DENY.test('js/app.js') && !DENY.test('index.html'), 'DENY does not block the app itself');
    }
  }
}

/* ---- 7c. Palette contrast: the app is read outdoors, in the dark, at 06:00
   ---- The v4.36 repaint shipped --t3 at 4.23:1 against paper, and --t3 sets
   the timeline TIMES at 11px — the smallest text in the app, where contrast
   matters most. Nothing caught it because nothing was looking. This reads the
   real tokens out of style.css and fails if any text-on-ground pair drops
   below WCAG AA, so no future repaint can quietly make the app unreadable
   in the conditions it is actually used in. ---- */
section('palette contrast (WCAG AA)');
{
  const css = require('fs').readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
  const grab = (block) => {
    const out = {};
    (block.match(/--[a-z0-9-]+:\s*#[0-9a-fA-F]{6}/g) || []).forEach((d) => {
      const [k, v] = d.split(/:\s*/);
      out[k.trim()] = v.trim();
    });
    return out;
  };
  const rootSrc = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const themes = [['root', grab(rootSrc)]];
  /* The app is dark-only since v4.38 and declares no light theme. If one is
     ever reintroduced, it gets held to the same floor automatically. */
  const darkAt = css.indexOf('@media (prefers-color-scheme: dark)');
  if (darkAt >= 0) themes.push(['dark', grab(css.slice(darkAt, css.indexOf('\n  }', darkAt)))]);
  ok(/color-scheme:\s*dark/.test(rootSrc) || darkAt >= 0,
    'the stylesheet declares its colour scheme, so form controls match the UI');

  const lum = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (hi + 0.05) / (lo + 0.05);
  };

  /* fg, bg — every pair where the app actually paints text on a ground */
  const PAIRS = [
    ['--text', '--paper'], ['--text', '--surface'],
    ['--t2', '--paper'], ['--t2', '--surface'],
    ['--t3', '--paper'], ['--t3', '--surface'],
    ['--accent', '--paper'], ['--accent', '--surface'],
    ['--chrome-text', '--chrome-bg'],
  ];
  const AA = 4.5;
  themes.forEach(([name, set]) => {
    ok(Object.keys(set).length > 10, name + ' palette parsed out of style.css');
    PAIRS.forEach(([f, b]) => {
      if (!set[f] || !set[b]) return ok(false, name + ' palette is missing ' + f + ' or ' + b);
      const r = ratio(set[f], set[b]);
      ok(r >= AA, name + ' ' + f + ' on ' + b + ' is ' + r.toFixed(2) + ':1 (needs ' + AA + ')');
    });
    /* Verdict colours are read on the raised run card and on cards. */
    ['--good', '--caution', '--poor', '--best'].forEach((f) => ['--hero-bg', '--surface'].forEach((b) => {
      if (!set[f]) return ok(false, name + ' palette is missing ' + f);
      const r = ratio(set[f], set[b]);
      ok(r >= AA, name + ' ' + f + ' on ' + b + ' is ' + r.toFixed(2) + ':1 (needs ' + AA + ')');
    }));
    /* Surfaces that paint white type on a filled ground. */
    ['--hero-bg', '--accent-fill'].forEach((b) => {
      const r = ratio('#ffffff', set[b]);
      ok(r >= AA, name + ' white on ' + b + ' is ' + r.toFixed(2) + ':1 (needs ' + AA + ')');
    });
    /* Phase chips: 10px bold mono on a phase fill. Small text on a coloured
       pill is the easiest thing in the app to get wrong, and it carries the
       week's phase — one of the few things read at a glance. */
    ['--phase-base', '--phase-build', '--phase-taper'].forEach((b) => {
      const r = ratio(set['--ink'], set[b]);
      ok(r >= AA, name + ' chip text on ' + b + ' is ' + r.toFixed(2) + ':1 (needs ' + AA + ')');
    });
  });

  /* The PWA's own chrome lives OUTSIDE the stylesheet — the status bar comes
     from index.html's theme-color and the launch splash from the manifest's
     background_color. Both had been stale across two repaints, so the app was
     still flashing a retired palette on every cold launch while every pixel it
     then drew was current. Colours that live outside the tokens are exactly
     the ones nobody remembers to change. */
  {
    const root = themes[0][1];
    const html = require('fs').readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const mani = JSON.parse(require('fs').readFileSync(path.join(__dirname, '../manifest.webmanifest'), 'utf8'));
    const appSrc = require('fs').readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
    const themeColors = [...html.matchAll(/<meta name="theme-color"[^>]*content="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]);
    ok(themeColors.length > 0, 'index.html declares a theme-color');
    const live = new Set(Object.values(root).map((v) => v.toLowerCase()));
    themeColors.forEach((c) => ok(live.has(c.toLowerCase()),
      'theme-color ' + c + ' is a current palette token, not a retired one'));
    ok(live.has(String(mani.theme_color).toLowerCase()),
      'manifest theme_color ' + mani.theme_color + ' is a current palette token');
    ok(live.has(String(mani.background_color).toLowerCase()),
      'manifest background_color ' + mani.background_color + ' is current — it is the launch splash');

    /* Hex written straight into a rule outlives the repaint that retired it:
       v4.68 still found a forest-era cream and a teal-era blue-grey on the
       run card. Outside :root only plain white and black may be literal. */
    const outside = css.slice(0, css.indexOf(':root {')) + css.slice(css.indexOf('}', css.indexOf(':root {')));
    const stray = [...new Set((outside.match(/#[0-9a-fA-F]{3,8}\b/g) || [])
      .filter((h) => !/^#(?:fff|ffffff|000|000000)$/i.test(h)))];
    ok(stray.length === 0, 'no colour lives outside :root in style.css' + (stray.length ? ' — found ' + stray.join(', ') : ''));

    /* Cinema (v4.69): light is the one red and white as tokens, and the
       launch title card must never cost the Today glance — Home Screen only,
       never under reduced motion, never in the way of a tap. */
    ['--glow-red', '--glow-red-soft', '--glow-white', '--glow-white-soft', '--grain'].forEach((t) =>
      ok(new RegExp(t + ':').test(rootSrc), 'cinema token ' + t + ' is declared in :root'));
    const cinema = css.slice(css.indexOf('CINEMA (v4.69)'));
    ok(cinema.length > 100 && !/rgba?\(/.test(cinema), 'the cinema layer paints only with tokens');
    const tcFn = appSrc.slice(appSrc.indexOf('function titleCard'), appSrc.indexOf('function titleCard') + 1400);
    const motionFn = (appSrc.match(/const motionOK = [^;]+;/) || [''])[0];
    ok(/display-mode: standalone/.test(tcFn) && /motionOK\(\)/.test(tcFn) && /prefers-reduced-motion: no-preference/.test(motionFn),
      'title card is gated to the installed app with motion allowed');
    const celebrateFn = appSrc.slice(appSrc.indexOf('function celebrate'), appSrc.indexOf('function celebrate') + 400);
    ok(/if \(!motionOK\(\)\) return;/.test(celebrateFn), 'earned moments never play under reduced motion');
    ok(/\.titlecard\s*\{[^}]*pointer-events:\s*none/.test(css) && /aria-hidden="true"/.test(appSrc.slice(appSrc.indexOf('function cinemaCard'), appSrc.indexOf('function cinemaCard') + 300)),
      'cinema cards never take a tap and stay out of the accessibility tree');
    ok(!/localStorage/.test(tcFn), 'title card plays on every launch — no once-a-day gate (user’s call, v4.69.1)');
    ok(/\.titlecard\s*\{[^}]*pointer-events:\s*none/.test(css), 'title card never takes a tap');
    /* Art (v4.72): the wheel and the sky are pictures with a spoken summary. */
    ok(/<figure class="daywheel[^"]*' \+ [^;]*role="img" aria-label=|<figure class="daywheel" role="img" aria-label=/.test(appSrc) && /<figure class="sky"[^>]*>' \+\s*'<svg viewBox="0 0 ' \+ W \+ ' ' \+ H \+ '" preserveAspectRatio="xMidYMid meet" role="img" aria-label=/.test(appSrc),
      'the day wheel and the night sky carry text alternatives');
    ok(/\.hero \.h-art \{[^}]*pointer-events:\s*none/.test(css), 'run card textures never take a tap');
    /* Book of Hours (v4.73): the Latin is plan content and lives in plan.js;
       every phase and post-race block has a motto, every moment an inscription. */
    const H = PLAN.hours || {};
    ok(['base', 'build', 'taper', 'race', 'recovery', 'standing'].every((k) => Array.isArray(H.mottos && H.mottos[k]) && H.mottos[k].length === 2),
      'every phase and block has a motto with its translation');
    ok(['marathon', 'race', 'longest', 'best', 'milestone'].every((k) => Array.isArray(H.earned && H.earned[k])), 'every earned moment has an inscription');
    ok((H.canonical || []).length === 8, 'the eight canonical hours mark the dial');
    ok(H.feasts && H.seal, 'the red-letter feasts and the seal legend are plan content');
    /* The user's steer (v4.75): a little Latin, never the focal point. */
    ok(!H.calendar && !H.epigraph && !(H.mottos && H.mottos.longRun), 'the Latin date, the epigraph and the Sunday motto stay retired');
    /* The real sky (v4.75): Nicosia's sun rises five minutes after the gun,
       and a winter sunset at home falls before the 17:10 run. */
    const race = DB.skyPlace(PLAN.race.date), rt = DB.sunTimes(PLAN.race.date, race.lat, race.lon, race.offsetMin);
    ok(race.away && Math.abs(rt.rise - DB.parseHM(PLAN.race.sunrise)) <= 4, 'race-morning sunrise in Nicosia time matches the plan (' + DB.fmtHM(rt.rise) + ')');
    const dec = DB.skyPlace('2026-12-21'), dt = DB.sunTimes('2026-12-21', dec.lat, dec.lon, dec.offsetMin);
    ok(dt.set < DB.parseHM('17:10') && dt.rise > DB.parseHM('07:30'), 'midwinter at home: sunset before the evening run (' + DB.fmtHM(dt.set) + ')');
    ok(Math.abs(DB.moonPhase('2027-01-22').phase - 0.5) < 0.03, 'full moon two nights before the race (22 Jan 2027)');
    ok(Math.abs(PLAN.sky.home.lat - 52) < 1 && Math.abs(PLAN.sky.home.lon + 1.5) < 1, 'home sky stays a generic point (§1)');
    /* The sky about the day (v4.76): each run against its own light. */
    const skyOf = (iso) => { const d = DB.buildDay(iso); return DB.runSky(iso, d.run.startMin, d.run.endMin, d.run.run.km); };
    const gun = skyOf(PLAN.race.date);
    ok(gun && gun.morning && gun.state === 'dawn' && gun.startLight === 'twi' && gun.lightKm === 2 && gun.place.name === 'Nicosia',
      'race morning: the gun goes in the twilight and the sun is up in km 2, in Nicosia time');
    const lateOct = skyOf('2026-10-27');   // the first evening run after the clocks go back
    ok(lateOct && !lateOct.morning && lateOct.state === 'dusk' && lateOct.darkKm >= 1 && lateOct.darkKm <= Math.ceil(DB.buildDay('2026-10-27').run.run.km) && lateOct.startLight === 'twi',
      'after the clocks change the 17:10 run starts in the dusk and goes dark by km ' + (lateOct && lateOct.darkKm));
    ok(skyOf('2026-11-12').state === 'dark', 'a November 17:10 run is dark the whole way');
    const julyRun = skyOf('2026-07-14');
    ok(julyRun.state === 'light' && julyRun.margin > 120, 'a July evening run finishes hours before sunset');
    const decLong = skyOf('2026-12-06');
    ok(decLong.morning && decLong.state === 'light' && decLong.margin > 0 && decLong.margin < 60, 'a December long run heads out just after sunrise');
    const nic = DB.skyPlace('2027-01-22');
    ok(DB.moonUp('2027-01-22', 0, nic) && !DB.moonUp('2027-01-22', 720, nic), 'the full moon is up at midnight, not at noon');
    ok(DB.moonUp(PLAN.race.date, DB.parseHM(PLAN.race.gun), DB.skyPlace(PLAN.race.date)), 'the waning moon is still up at the gun');
    const home = DB.skyPlace('2026-10-10');
    ok(!DB.moonUp('2026-10-10', 0, home), 'a new moon is not in the midnight sky');
    ok(DB.lightAt(rt, 720) === 'day' && DB.lightAt(rt, 0) === 'night' && DB.lightAt(rt, rt.rise - 5) === 'twi', 'light: day at noon, night at midnight, twilight before sunrise');
    let rising = true;
    for (let m = rt.dawn - 30; m < rt.rise + 60; m += 5) if (DB.lightLevel(rt, m + 5) < DB.lightLevel(rt, m)) rising = false;
    ok(rising && DB.lightLevel(rt, 0) === 0 && DB.lightLevel(rt, 720) === 1, 'the light level rises steadily through the dawn');
    ok(/runSkyHTML\(iso, r, skyKind\(r\)/.test(appSrc) && /rd\.run \? runSkyHTML\(PLAN\.race\.date/.test(appSrc),
      'the run card and the race card both carry the run against its sky');
    ok(/<figcaption class="rs-line">/.test(appSrc) && /<svg viewBox="0 0 ' \+ RS_W \+ ' ' \+ H \+ '" aria-hidden="true">/.test(appSrc), 'the sky ribbon is a picture; its meaning is plain text');
    ok(/skyGlyph\(day\.iso, nMin\)/.test(appSrc) && /skyKey\(day\.iso, nMin\)/.test(appSrc) && /skyKey\(iso, n\)/.test(appSrc),
      'the Now card shows the sky and redraws when the light changes');
    ok(/moonSVG\([^)]*DB\.moonPhase\(today\)/.test(tcFn), 'the launch card carries tonight’s real moon');
    const shootAt = css.indexOf('.sk-shoot { animation');
    const gateAt = css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', shootAt);
    ok(shootAt > 0 && gateAt > 0 && !css.slice(gateAt, shootAt).includes('\n}\n') && /\.sk-shoot \{[^}]*opacity: 0/.test(css),
      'shooting stars move only when motion is allowed, and are hidden otherwise');
    ok(!/Nicosia time'/.test(appSrc), 'the away place is named by plan data, not by app.js');
    /* The sun's arc (v4.77.2): zero at sunrise and sunset, highest at solar
       noon, a midsummer sun far above a midwinter one. */
    const altAt = (iso, which) => { const pl = DB.skyPlace(iso), st = DB.sunTimes(iso, pl.lat, pl.lon, pl.offsetMin);
      return DB.sunAltitude(iso, pl.lat, st, which === 'noon' ? (st.rise + st.set) / 2 : st[which]); };
    ok(Math.abs(altAt('2026-09-30', 'rise')) < 0.01 && Math.abs(altAt('2026-09-30', 'set')) < 0.3, 'the sun\u2019s arc meets the horizon at sunrise and sunset');
    ok(altAt('2026-06-21', 'noon') > 55 && altAt('2026-12-21', 'noon') < 20 && altAt('2026-09-30', 'noon') > 30,
      'the noon sun: high at midsummer, low at midwinter (' + altAt('2026-06-21', 'noon').toFixed(0) + '\u00b0 / ' + altAt('2026-12-21', 'noon').toFixed(0) + '\u00b0)');
    ok(/runSkyGeom\(iso, rs, a, b\)/.test(appSrc) && /rs-dome/.test(appSrc) && /rs-sunnow/.test(appSrc) && !/rs-frame/.test(appSrc),
      'the run card draws the day\u2019s sun arc, not a box');
    /* The uniqueness pass (v4.78). */
    ok(/flushSun\(b\.startMin\)/.test(appSrc) && /function sunRowHTML/.test(appSrc) && /function paintSpine/.test(appSrc),
      'the timeline keeps sunrise and sunset in order among its rows, and paints its spine in the light');
    ok(/class="d-moon"/.test(appSrc), 'the Week calendar keeps the moon beside each date');
    ok(/class="chap"/.test(appSrc) && /rc-list/.test(appSrc) && /counter\(rule, upper-roman\)/.test(css), 'Reference is a book: contents, numbered chapters, rules in numerals');
    ok(/class="focus-ex-num" aria-hidden="true">' \+ roman\(i \+ 1\)/.test(appSrc), 'gym focus carries each exercise\u2019s numeral, decorative');
    ok(/function zoneScaleHTML/.test(appSrc) && /zoneScaleHTML\(zones, hist\.length/.test(appSrc), 'Reference draws the zones as a staircase');
    ok(/class="odo-gauge" role="img" aria-label=/.test(appSrc) && /od-seg' \+ \(o\.done/.test(appSrc), 'the Pro 4 odometer is a dial with a text alternative');
    ok(/function recalRulerHTML/.test(appSrc) && /PLAN\.recalibrationAnchors \|\| \[\]\)\.map\(\(a\) =>/.test(appSrc), 'the tune-up ruler is drawn from the plan\u2019s own anchors, not restated');
    ok(!/wkp-tally/.test(appSrc) && !/wkp-track/.test(appSrc) && /' miss' : ''\) \+ '" data-date="/.test(appSrc), 'the week\u2019s distance is one figure: the tally\u2019s states moved onto its bars (v4.89)');
    ok(appSrc.indexOf("view.appendChild(days);\n    view.appendChild(profile);") > 0, 'the Week\u2019s days come before its figures');
    ok(/ef-fit/.test(appSrc) && /sxy \/ sxx/.test(appSrc), 'the efficiency chart draws its least-squares fit');
    ok(/function paceLadderHTML/.test(appSrc) && /paceLadderHTML\(bands, live\)/.test(appSrc), 'the easy bands are drawn as a ladder from PLAN.easyBands');
    ok(/ref-note no-init">Offline-first/.test(appSrc), 'the App chapter\u2019s readout carries no illuminated initial');
    ok(/\.ref-fold:not\(\.ref-fold \+ \.ref-fold\)/.test(css) && /\.ref-fold:last-of-type/.test(css), 'Reference\u2019s chapters are bound as one volume');
    ok(/' k-' \+ \(rc === 'quality' \|\| rc === 'race' \? 'hard'/.test(appSrc) && /\.wk-day\.k-hard/.test(css) && /\.wk-day\.no-run/.test(css),
      'the Week\u2019s day cards are lit by their run class, red only on the hard day');
    /* Emblems (v4.84): every activity category has its emblem, and every
       emblem the mapping can name is drawn. */
    const embBlock = appSrc.slice(appSrc.indexOf('const EMBLEMS = {'), appSrc.indexOf('function emblemKind'));
    const embKinds = (embBlock.match(/^\s{4}(\w+): '/gm) || []).map((m) => m.trim().replace(/: '$/, ''));
    const kindFn = appSrc.slice(appSrc.indexOf('function emblemKind'), appSrc.indexOf('function emblemSVG'));
    const named = [...new Set((kindFn.match(/'([a-z]+)'/g) || []).map((q) => q.replace(/'/g, '')).filter((k) => !['run', 'race', 'gym', 'xt', 'study', 'german', 'reading', 'meal', 'free', 'work'].includes(k)))];
    ok(named.length >= 12 && named.every((k) => embKinds.includes(k)), 'every emblem the mapping names is drawn (' + named.filter((k) => !embKinds.includes(k)).join(', ') + ')');
    ok(['run', 'gym', 'xt', 'study', 'german', 'reading', 'meal', 'free', 'work'].every((c) => kindFn.includes("case '" + c + "'")), 'every activity category has its emblem');
    ok(/<span class="c-emb/.test(appSrc) && /<span class="q-emb">/.test(appSrc) && /class="d-embs" aria-hidden="true"/.test(appSrc) && /focus-emb/.test(appSrc),
      'emblems mark the timeline, the Week\u2019s day cards and the focus screen');
    ok(/emblemSVG\(kind, cls\)[\s\S]{0,80}aria-hidden="true"/.test(appSrc), 'emblems are decorative and hidden from assistive technology');
    /* v4.85: Now/Next and the run card carry emblems; the shoes are plates
       whose counts come from the plan, not from names in the renderer. */
    ok(/class="nn-emb"/.test(appSrc) && /class="nn-nemb"/.test(appSrc) && /class="h-mark">' \+ emblemSVG\(emblemKind\(r\)\)/.test(appSrc),
      'Now, Next and the run card’s label carry their emblems');
    ok(/querySelector\('\.h-tagtxt'\)\.textContent = 'RUN LOGGED'/.test(appSrc), 'a logged run relabels its tag without disturbing the emblem');
    const shoeFn = appSrc.slice(appSrc.indexOf('function buildShoeSection'), appSrc.indexOf('function buildOdoSection'));
    ok(shoeFn.length > 0 && /PLAN\.shoes\.map/.test(shoeFn) && /DB\.pro4Status/.test(shoeFn) && !/Ghost|Evo|Pro 4/.test(shoeFn),
      'the shoe plates read every shoe from the plan and name none in code');
    /* v4.86: the Plan page's week explorer, the pace spectrum and the week
       in hours all read their numbers from the plan. */
    ok(/jd-'\+kind/.test(appSrc) && /\.journey-days button\.jd-long/.test(css) && /\.journey-days button\.jd-hard/.test(css),
      'the journey\u2019s week explorer lights each day by its run class');
    const specFn = appSrc.slice(appSrc.indexOf('function paceSpectrumHTML'), appSrc.indexOf('function buildEasyBandSection'));
    ok(/PLAN\.race\.goalPace/.test(specFn) && /PLAN\.race\.stretchPace/.test(specFn) && /DB\.easyBand/.test(specFn) && /PLAN\.tempoPaceNote/.test(specFn) && !/\b5:20\b|\b5:06\b|\b4:25\b/.test(specFn),
      'the pace spectrum reads every pace from the plan and hard-codes none');
    ok(/CLEAR day expect (\d:\d\d)\s*[–-]\s*(\d:\d\d)/.test(PLAN.tempoPaceNote), 'the tempo note still states a clear-day readout the spectrum can draw');
    ok(DB.parsePace(PLAN.race.goalPace.replace(/\/km$/, '')) > 0 && DB.parsePace(PLAN.race.stretchPace.replace(/\/km$/, '')) > 0, 'race and stretch paces parse for the spectrum');
    const hoursFn = appSrc.slice(appSrc.indexOf('function weekHoursHTML'), appSrc.indexOf('/* The block\u2019s paces on one line') > 0 ? appSrc.indexOf('/* The block\u2019s paces on one line') : appSrc.indexOf('function paceSpectrumHTML'));
    ok(/DB\.buildDay/.test(hoursFn) && /lights out/i.test(hoursFn) && /wake\|alarm/.test(hoursFn), 'the week in hours is built from the planned days, sleeping from lights out to waking');
    for (let i = 0; i < 210; i += 7) {
      const d = DB.buildDay(DB.addDays(PLAN.blocks[0].start, i));
      if (!d.blocks.some((b) => /lights out/i.test(b.title)) || !d.blocks.some((b) => /wake|alarm/i.test(b.title))) { ok(false, 'every Monday has a wake and a lights out (' + d.iso + ')'); break; }
    }
    /* v4.87 fixes */
    ok(/function runDayLabel/.test(appSrc) && /: runDayLabel\(iso\)\) \+ '<\/span><\/span>'/.test(appSrc) && /TOMORROW’S RUN/.test(appSrc) && /YESTERDAY’S RUN/.test(appSrc),
      'the run card names its own day instead of calling every run today\u2019s');
    ok(/\(iso > today \|\| unresolved\) && !isDone \? ''/.test(appSrc) && /iso > todayISO\(\) && !isDone \|\| opts\.slim \? '' : '<button class="tick/.test(appSrc), 'a future session cannot be ticked, though a ticked one can be undone');
    ok(appSrc.indexOf("if (isCurrent) {\n        flushSun(nMin + 1);") > appSrc.indexOf("const card = buildCard(b, done, iso, { current: isCurrent"), 'NOW is placed after the block it falls inside');
    ok(/grid-template-areas: "nav nav" "sub bb" "lbl bb"/.test(css), 'the countdown numeral has its own column in the header');
    /* v4.88: a quieter Today */
    ok(/slim: !!\(day\.run && b\.id === day\.run\.id\)/.test(appSrc) && /class="c-up"/.test(appSrc), 'the day\u2019s run appears once in full, once as a slim pointer');
    ok(appSrc.indexOf("view.appendChild(el(dayWheelHTML(day, done, iso, isToday, ovr)));") > appSrc.indexOf("view.appendChild(tl);"), 'the clock follows the timeline');
    ok(/c-late">· not ticked/.test(appSrc) && /\.tl-quiet\.past/.test(css), 'the past recedes and an unticked passed session says so');
    ok(!/<span>View session<\/span>/.test(appSrc), 'the gym card no longer offers the same session three ways');
    /* v4.90 */
    const tierFn = appSrc.slice(appSrc.indexOf('function shoeTier'), appSrc.indexOf('function sessionShapeHTML'));
    ok(tierFn.length > 0 && /PLAN\.shoes\.find/.test(tierFn) && !/Ghost|Evo|Pro 4/.test(tierFn), 'a shoe\u2019s tier comes from the plan\u2019s shoe list, not from names in code');
    const shapeFn = appSrc.slice(appSrc.indexOf('function sessionShapeHTML'), appSrc.indexOf('function runSkyHTML'));
    ok(/ss-jog/.test(shapeFn) && /DB\.mpShape/.test(shapeFn) && !/recover\w* (\d|of)/.test(shapeFn), 'the session shape draws reps and MP from the plan and invents no recovery length');
    ok(/\.rm \.mo-dark \{ fill: color-mix/.test(css), 'a rest day\u2019s moon keeps its earthshine');
    /* v4.91: the day clock */
    const dialFn = appSrc.slice(appSrc.indexOf('function dayWheelHTML'), appSrc.indexOf('/* ---- week-progress ring'));
    ok(/DB\.sunAltitude/.test(dialFn) && /conic-gradient/.test(dialFn), 'the dial\u2019s sky is shaded by the sun\u2019s real height');
    ok(/hg\.style\.transform = 'rotate\(' \+ handAngle\(n\)/.test(appSrc) && /transition: transform \.9s var\(--ease-spring\)/.test(css), 'each minute turns the hand with an eased rotation instead of redrawing it');
    ok(['--ease-out', '--ease-inout', '--ease-spring', '--ease-soft'].every((t) => new RegExp(t + ':').test(rootSrc)), 'the motion curves are tokens in :root');
    const clockCss = css.slice(css.indexOf('THE DAY CLOCK (v4.91)'));
    ok(!/#[0-9a-f]{3,6}\b/i.test(clockCss.replace(/#(?:fff|000)\b/gi, '').replace(/url\(#[\w-]+\)/g, '')) && (css.match(/\.dw-count \{/g) || []).length === 1, 'the clock has one stylesheet section, painted only with tokens');
    ok(/@keyframes dw-arc \{ from \{[^}]*opacity: 0/.test(css), 'a session arc is invisible until it starts to draw (no round-cap dot)');
    /* v4.92: the firmament */
    const skyFn = appSrc.slice(appSrc.indexOf('  function skyHTML(journey)'), appSrc.indexOf('  function buildTrainingJourney'));
    ok(/journey\.weeks\.forEach\(\(w, k\) => \{\s*const iso = DB\.addDays\(w\.start, 3\), mp = DB\.moonPhase\(iso\)/.test(skyFn), 'each week\u2019s moon is drawn at its real phase');
    ok(/Math\.min\(30, gain \* 3\.2\)/.test(skyFn), 'a comet\u2019s tail is as long as the gain over the previous longest run');
    const skyCss = css.slice(css.indexOf('THE FIRMAMENT OF THE BLOCK (v4.92)'));
    ok(skyCss.length > 100 && !/rgba?\(|#[0-9a-f]{3,6}\b/i.test(skyCss.replace(/url\(#[\w-]+\)/g, '')) && (css.match(/\.sk-sun \{/g) || []).length === 1, 'the sky has one stylesheet section, painted only with tokens');
    /* v4.93: one motion system */
    const afterRoot = css.slice(css.indexOf('}', css.indexOf(':root {')));
    ok(!/cubic-bezier\(/.test(afterRoot), 'every easing curve is a token — no stray cubic-bezier outside :root');
    const motionCss = css.slice(css.indexOf('MOTION SYSTEM (v4.93)'));
    const mGate = motionCss.indexOf('@media (prefers-reduced-motion: no-preference)');
    ok(mGate > 0 && motionCss.indexOf('@keyframes tick-on') > mGate && motionCss.indexOf('@keyframes sheet-up') > mGate && motionCss.indexOf('.view.slide-next') > mGate,
      'the motion system\u2019s animations all sit behind prefers-reduced-motion');
    ok(/!bd\.classList\.contains\('hidden'\) && motionOK\(\)/.test(appSrc), 'the sheet only waits for its closing animation when motion is welcome');
    ok(!/rgba\(22, ?36, ?42/.test(css), 'no colour from the retired teal palette survives in the sheet or toast');
    const shoeKm = {};
    for (let i = 0; i < 210; i++) { const d = DB.buildDay(DB.addDays(PLAN.blocks[0].start, i)); if (d.run) shoeKm[d.run.run.shoe] = (shoeKm[d.run.run.shoe] || 0) + d.run.run.km; }
    ok(PLAN.shoes.filter((s) => !/race/i.test(s.job)).every((s) => Object.keys(shoeKm).some((k) => s.shoe.endsWith(k) && shoeKm[k] > 100)),
      'every training shoe matches the runs the plan prescribes in it');
    ok(/function dressSheet/.test(appSrc) && /if \(open\) dressSheet\(\)/.test(appSrc), 'the More sheet is dressed as plates each time it opens');
    ok(/restMoonHTML\(iso\)/.test(appSrc) && !/class="rest-mark"/.test(appSrc), 'a rest day shows the night\u2019s moon, not a pause mark');
    ok(/focus-' \+ skyKind\(block\)/.test(appSrc) && /runSkyHTML\(iso, block, skyKind\(block\), 'f'/.test(appSrc), 'run focus is lit in the run\u2019s colour and shows the sun\u2019s arc');
    ok(['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'].every((n) => appSrc.includes("'" + n + "'")),
      'the moon has all eight of its names');
    /* The light of the week (v4.77): the moon keeps its real hours. */
    const circ = (a, b) => Math.abs(((((a - b) % 1440) + 1440 + 720) % 1440) - 720);
    const fullArc = DB.moonArc('2027-01-22', nic), newArc = DB.moonArc('2026-10-10', home);
    ok(circ(fullArc.transit, 0) < 60 && fullArc.semi > 360, 'a full moon is highest at midnight and up all night (' + DB.fmtHM(fullArc.transit) + ')');
    ok(circ(newArc.transit, 720) < 90, 'a new moon is highest around midday (' + DB.fmtHM(newArc.transit) + ')');
    ok(circ(fullArc.rise, (fullArc.transit - fullArc.semi + 1440) % 1440) <= 1 && DB.moonUp('2027-01-22', fullArc.transit, nic) &&
      !DB.moonUp('2027-01-22', (fullArc.transit + 720) % 1440, nic), 'moonrise, moonset and moonUp agree');
    ok(/let mAt = ma\.transit/.test(appSrc) && /pt\(mAt, RN\)/.test(appSrc) && /dw-moonarc/.test(appSrc), 'the dial puts the moon at its highest, with its arc from rise to set');
    ok(/Math\.abs\(d\) < 50\) mAt =/.test(appSrc), 'the dial never draws the moon on top of a sun mark');
    ok(/if \(total && got === total\) \{[^}]*dw-gloria|if \(total && got === total\) \{\s*let rays/.test(appSrc), 'the gloria is earned: only a finished day has one');
    ok(/view\.appendChild\(el\(weekLightHTML\(week7, day0\.week\)\)\)/.test(appSrc) && /<figure class="weeklight" role="img" aria-label=/.test(appSrc),
      'the Week view carries the light of the week, with a spoken summary');
    ok(/#view \.weeklight[',]/.test(appSrc) && /\.weeklight:not\(\.in\)/.test(css), 'the week figure waits to be scrolled to before it pours in');
    ok(!/Per aspera|Festina lente|Plus ultra|Nulla dies/.test(appSrc), 'no Latin lives in app.js (§2: rendering code carries no content)');
    ok(/--serif:/.test(rootSrc) && !/@font-face[^}]*Baskerville/.test(css), 'the serif is a system stack, no new font download');

    /* No zoom, ever — the owner's call (v4.92.1): "I should never have the
       need to zoom and I am constantly accidentally doing it". This reverses
       the earlier WCAG 1.4.4 guard on purpose: one user, one phone, and the
       app is laid out at 390px with no text below 11px. Guarded so it is
       not quietly undone. */
    const vp = (html.match(/<meta name="viewport"[^>]*content="([^"]+)"/) || [])[1] || '';
    ok(vp.length > 0, 'index.html declares a viewport');
    ok(/user-scalable\s*=\s*no/i.test(vp) && /maximum-scale\s*=\s*1\b/.test(vp), 'the viewport disables zoom (the owner\u2019s call)');
    ok(/viewport-fit=cover/.test(vp), 'viewport keeps viewport-fit=cover for the safe-area insets');
    ok(/touch-action:\s*pan-x pan-y/.test(css) && /\[data-nav\] \{ touch-action: manipulation; \}/.test(css), 'pinch and double-tap zoom are suppressed via touch-action on the page and every control');
    ok(/\['gesturestart', 'gesturechange', 'gestureend'\]/.test(appSrc) && /now - lastTapEnd < 320/.test(appSrc) && /visualViewport\.scale <= 1\.01/.test(appSrc),
      'Safari\u2019s pinch gesture, stray double taps and any leftover scale are all handled');
    ok(/input, select, textarea, \.xw-in, \.recal-in, \.data-box \{ font-size: 16px; \}/.test(css), 'form fields stay at 16px so focusing one never zooms the page');

    /* The update toast is the only signal that a new version exists. */
    ok(/id="toast"[^>]*(role="status"|aria-live)/.test(html),
      'the update toast is announced to assistive technology');

    /* aria-haspopup says a menu EXISTS; only aria-expanded says whether it is
       open right now. And the tab bar is position:fixed, so its place in the
       DOM is purely tab order — last meant twenty presses through a whole day
       before reaching primary navigation. */
    ok(/data-nav="more"[^>]*aria-expanded=/.test(html),
      'the More button declares aria-expanded');
    ok(html.indexOf('<nav class="tabbar"') < html.indexOf('<main'),
      'primary navigation precedes the day content in the DOM, so it is one tab away');
    ok(/aria-expanded/.test(appSrc) && /'Escape'/.test(appSrc),
      'the sheet toggles aria-expanded and closes on Escape');

    /* Hero contract (§4.2 + audit §5, §6, §19). These are source checks
       because the hero is browser-only; the rendered proof lives in
       tools/shoot.js. */
    ok(/<details class="h-guard"/.test(appSrc),
      'the long-run guard folds its reasoning away — open it pushed the log form off the fold');
    ok(/<b>PACE<\/b>/.test(appSrc),
      'the hero carries pace, which §4.2 requires visible without scrolling');
    ok(/h-zoneset/.test(appSrc) && /data-goto="ref"/.test(appSrc),
      'a hero with no stored zones routes to the zone editor rather than printing a bare "Z2"');

    /* 44px tap-target floor. A rendered audit needs a browser, which this
       suite deliberately does not have, so this asserts the rules exist —
       enough to catch someone tightening the padding back up. The rendered
       check lives in tools/shoot.js. */
    [['.tab', 'the tab bar'],
     ['.tl-card .c-actions button', 'block actions, two of which are the injury protocol'],
     ['.xw, .xw-in', 'gym weight fields, tapped one-handed between sets']].forEach(([sel, why]) => {
      const rule = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*min-height:\\s*(\\d+)px');
      const m = css.match(rule);
      ok(m && +m[1] >= 44, sel + ' keeps a 44px minimum — ' + why);
    });
  }
}

/* ---- 7b. Pro 4 odometer + run log ---- */
section('pro 4 odometer');
{
  const empty = DB.pro4Status(() => null, START);
  ok(empty.used === 0 && empty.toCome === 42 && empty.optional === 5,
    'untouched budget: 42 planned + 5 optional, got ' + empty.toCome + '+' + empty.optional);
  ok(empty.toCome + empty.optional <= empty.cap, 'planned outings fit the ≈50 km cap');
  ok(empty.outings.length === PLAN.pro4Outings.length &&
     empty.outings.every((o) => DB.buildDay(o.iso).run),
    'every outing lands on a day with a run');
  // tick the fit-check → 5 km used
  const fitIso = empty.outings[0].iso;
  const fitRun = DB.buildDay(fitIso).run;
  const t = DB.pro4Status((iso) => (iso === fitIso ? { [fitRun.id]: true } : null), DB.addDays(fitIso, 1));
  ok(t.used === 5 && t.toCome === 37, 'ticked fit-check: 5 used, 37 to come, got ' + t.used + '/' + t.toCome);
  ok(hasBlock(dayOfWeek(30, 3), /Pro 4/), 'race-week shakeout is a Pro 4 outing (§11)');
}

section('run log');
{
  let runDays = 0;
  for (let i = 0; i < 210; i++) if (DB.buildDay(DB.addDays(START, i)).run) runDays++;
  const log = DB.runLog(() => null, () => null, DB.addDays(START, 3));
  ok(log.length === runDays, 'log covers every planned run: ' + log.length + '/' + runDays);
  ok(log[0].state === 'missed' && log[log.length - 1].state === 'future',
    'states resolve past/future, got ' + log[0].state + '/' + log[log.length - 1].state);
  const day1 = DB.buildDay(DB.addDays(START, 1));
  const l2 = DB.runLog((iso) => (iso === day1.iso ? { [day1.run.id]: true } : null), () => null, DB.addDays(START, 3));
  ok(l2[0].state === 'done', 'ticked run logs as done');
  const l3 = DB.runLog(() => null, (iso) => (iso === day1.iso ? { [day1.run.id]: true } : null), DB.addDays(START, 3));
  ok(l3[0].state === 'skipped', 'skipped run logs as skipped');
}

/* ---- 8. .ics export ---- */
section('ics export');
{
  const ics = DB.buildICS('2026-06-29');
  ok(/^BEGIN:VCALENDAR\r\n/.test(ics) && /END:VCALENDAR\r\n$/.test(ics), 'calendar wrapper with CRLF');

  // event count must equal every doable training block across all blocks
  let expect = 0;
  const lastB = PLAN.blocks[PLAN.blocks.length - 1];
  const endISO = DB.addDays(lastB.start, lastB.weeks * 7 - 1);
  for (let iso = '2026-06-29'; iso <= endISO; iso = DB.addDays(iso, 1)) {
    for (const b of DB.buildDay(iso).blocks) {
      if (b.doable && (b.cat === 'run' || b.cat === 'gym' || b.cat === 'xt')) expect++;
    }
  }
  const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
  ok(events === expect && expect > 200, 'event count ' + events + ' matches training blocks ' + expect);

  const flat = ics.replace(/\r\n /g, '');            // unfold
  ok(flat.includes('DTSTART:20270124T064500') && flat.includes('DTEND:20270124T104500'),
    'race day event at 06:45–10:45');
  ok(/SUMMARY:MARATHON — 42\.2 km/.test(flat), 'race summary not doubled');
  ok(/SUMMARY:Easy run — \d+ km/.test(flat), 'run summaries carry distance');
  ok(flat.includes('drive over\\, no run-commute'), 'commas escaped');
  ok(flat.includes('Bench press 4 × 6–8\\nBand pull-aparts 4 × 15–20\\nBarbell row'), 'gym plan in description');
  ok((ics.match(/TRIGGER:-PT15M/g) || []).length === events, 'one 15-min alarm per event');

  const uids = [...flat.matchAll(/UID:([^\r\n]+)/g)].map((m) => m[1]);
  ok(new Set(uids).size === uids.length, 'UIDs unique (re-import safe)');

  let maxBytes = 0;
  for (const line of ics.split('\r\n')) maxBytes = Math.max(maxBytes, Buffer.byteLength(line, 'utf8'));
  ok(maxBytes <= 75, 'all lines folded to ≤75 octets (max ' + maxBytes + ')');

  ok((DB.buildICS('2028-01-01').match(/BEGIN:VEVENT/g) || []).length === 0, 'post-block export is empty');
  ok((DB.buildICS('2026-01-01').match(/BEGIN:VEVENT/g) || []).length === expect, 'pre-block export clamps to block start');
}

section('recorded distance precedence');
{
 const day = DB.buildDay('2026-09-08'), done = { [day.run.id]: true };
 ok(DB.recordedKm(day, done, null) === day.run.run.km, 'tick without log uses planned km');
 ok(DB.recordedKm(day, done, {sec: 2400, km: 8.2}) === 8.2, 'log wins without double counting tick');
 ok(DB.recordedKm(day, {}, null) === 0, 'unrecorded is zero known km');
 ok(DB.recordedKm(day, {}, {sec: 2400}) === day.run.run.km, 'old logs keep planned fallback');
 ok(DB.recordedKm(DB.buildDay('2026-09-14'), {}, {sec: 2400, km: 8.2}) === 8.2, 'unplanned log counts');
 ok(DB.recordedKm(day, {}, {sec: -1, km: 8.2}) === 0, 'invalid duration excluded');
}
section('maintenance instructions');
for (const wk of [23, 24, 28]) {
 const gym = dayOfWeek(wk, 0).blocks.find(b => b.cat === 'gym');
 ok(/altered running mechanics: skip the lower-body work/.test(gym.detail), 'wk ' + wk + ' retains the pain rule during maintenance');
 ok(gym.plan.length === 5 && gym.plan[0].sets === '1 × 5 @ 3 RIR', 'wk ' + wk + ' retains the authored reduced template');
}
section('the Kalendar (v5.4)');
{
 const z = PLAN.hours && PLAN.hours.zodiac;
 ok(Array.isArray(z) && z.length === 12 && z[0] === 'Aquarius' && z[9] === 'Scorpio', 'the Kalendar names the sign the sun enters each month');
}
section('gels as a schedule (rule 4)');
{
 const g = PLAN.gels;
 ok(new RegExp('every ' + g.raceInterval + ' min · ' + g.raceCount + ' gels', 'i').test(g.raceText), 'race gel numbers are the race text\u2019s own: ' + g.raceText);
 const race = DB.buildDay('2027-01-24').blocks.find(b => b.run && /MARATHON/.test(b.title));
 ok(race && race.run.gelsAt.length === 9 && race.run.gelsAt[8] === 225, 'race day carries nine gels, the last at 225 min');
 const sun = DB.buildDay('2026-10-04').run;
 ok(sun.run.gelsAt && sun.run.gelsAt.join() === '35,70,105,140' && /TODAY: 4 gels, at 35, 70, 105 and 140 min/.test(sun.detail), 'a long run\u2019s schedule matches its text');
 ok(!DB.buildDay('2026-10-01').run.run.gelsAt, 'an easy run has no gels');
}
section('leg dose (three-tier rule)');
{
 const d = PLAN.legDose;
 ok(d && Array.isArray(d.tiers) && d.tiers.map(t => t.id).join(',') === 'full,half,skip', 'the three tiers are data: full, half, skip');
 ok(d.tiers.every(t => t.label && t.rule), 'every tier carries a label and the rule in words');
 ok(/brutal Sunday/.test(d.tiers[1].rule) && /one-sided pain/.test(d.tiers[2].rule), 'the tiers say what §6 says');
 const src = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
 ok(/function dosedPlan/.test(src) && /o\.legs/.test(src), 'the choice lives in ovr-ISO beside skips, so backups carry it');
}
section('move rules and missed runs');
{
 const r = PLAN.moveRules, re = new RegExp(r.legPattern, 'i');
 ok(r.legDropFromDay === 3, 'late-week leg drop starts on Thursday');
 for (const wk of [12, 18, 23]) {
  const gym = dayOfWeek(wk, 0).blocks.find(b => b.cat === 'gym');
  const legs = gym.plan.filter(p => re.test(p.ex)).map(p => p.ex);
  ok(legs.length >= 2 && legs.some(x => /leg press/i.test(x)), 'wk ' + wk + ' Monday leg work is recognised: ' + legs.join(', '));
  ok(!gym.plan.some(p => re.test(p.ex) && /pull|row|curl(?!.*leg)|ab wheel|pallof|fly/i.test(p.ex) && !/leg curl/i.test(p.ex)), 'wk ' + wk + ' upper and core work is never dropped');
 }
 ok(!re.test('Hanging leg raises'), 'hanging leg raises are core, not leg work');
 ok(typeof PLAN.missedRun.note === 'string' && /not owed/.test(PLAN.missedRun.note), 'missed-run note present');
 ok(PLAN.longRunOver.overPct > 1 && PLAN.longRunOver.capMin === 200, 'long-run overshoot flags >10% over plan and the 3h20 cap (rule 9)');
 ok(PLAN.readiness.skipDelta >= 5 && PLAN.readiness.minReadings >= 3 && !/\b(4\d|5\d|6\d)\s*bpm/.test(PLAN.readiness.note), 'readiness rule is relative to your own usual and carries no personal HR');
}
section('marathon-pace check (§10)');
{
 const titles = {};
 for (let i = 0; i < 210; i++) { const d = DB.buildDay(DB.addDays(START, i)); if (d.run && DB.isMpSession(d.run.title)) titles[d.run.title] = d.week; }
 ok(Object.keys(titles).length >= 8, 'MP sessions found in the plan: ' + Object.keys(titles).length);
 const want = { 'Long 22 — last 6 @ MP': [6, 6], 'Long 26 — 2×5 @ MP': [10, null], 'Long 30 — 12 @ MP': [12, null],
   'DRESS REHEARSAL 26 km — last 14–16 @ MP (Pro 4)': [14, 14], 'Quality run — 5×3 min @ MP': [null, null] };
 for (const [t, [km, tail]] of Object.entries(want)) {
  ok(t in titles, 'plan still has "' + t + '"');
  ok(DB.mpSegmentKm(t) === km, t + ' → segment ' + km + ' km, got ' + DB.mpSegmentKm(t));
  ok(DB.mpTailKm(t) === tail, t + ' → tail ' + tail + ', got ' + DB.mpTailKm(t));
 }
 ok(!DB.isMpSession('Long 22 easy') && DB.mpSegmentKm('Long 22 easy') === null, 'easy long runs are not MP sessions');
 // Generic fixture zones (rest 50, max 190): Z3 is 72–80% HRR = 151–162.
 ok(DB.mpVerdict(140, 50, 190).key === 'below' && DB.mpVerdict(155, 50, 190).key === 'on' && DB.mpVerdict(170, 50, 190).key === 'above', 'zone verdicts follow §10');
 const whole = DB.ef(22, 7800, 148), easy = DB.easyPartEf(22, 7800, 148, 6, 1740, 152);
 ok(easy > 0 && easy < whole, 'easy-part EF excludes the faster MP segment');
 ok(DB.easyPartEf(22, 7800, 148, 21.8, 7700, 152) === null, 'a segment covering nearly the whole run yields no easy part');
 // Where the MP work sits, for the run card (read from the title, paced at the goal).
 const goal = String(PLAN.race.goalPace).replace(/\s*\/\s*km$/, '');
 const s1 = DB.mpShape('Long 22 — last 6 @ MP', 22);
 ok(s1 && s1.kind === 'tail' && s1.from === 17 && s1.fromLate === 17 && s1.pace === goal, 'last 6 of 22 starts at km 17 at goal pace');
 const s2 = DB.mpShape('DRESS REHEARSAL 26 km — last 14–16 @ MP (Pro 4)', 26);
 ok(s2 && s2.kind === 'tail' && s2.from === 11 && s2.fromLate === 13, 'last 14–16 of 26 starts at km 11–13');
 const s3 = DB.mpShape('Long 26 — 2×5 @ MP', 26);
 ok(s3 && s3.kind === 'reps' && s3.reps === 2 && s3.repKm === 5, '2×5 @ MP reads as reps');
 const s4 = DB.mpShape('Long 18 — mid 6–8 @ MP (Pro 4 sharpener)', 18);
 ok(s4 && s4.kind === 'block' && s4.lo === 6 && s4.hi === 8, 'mid 6–8 is a block with no fixed start');
 ok(DB.mpShape('Long 22 easy', 22) === null && DB.mpShape('Quality run — 5×3 min @ MP', 6) === null, 'no shape for easy runs or minute reps');
 // The MP prescription is data, and only titles with an MP segment carry it.
 for (let w = 14; w <= 29; w++) {
  const d = DB.buildDay(DB.addDays(START, (w - 1) * 7 + 6));
  if (!d.run || !/^Long|REHEARSAL|PEAK/.test(d.run.title)) continue;
  const mpText = /MP segments/.test(d.run.detail);
  ok(mpText === DB.isMpSession(d.run.title), 'Wk ' + w + ' ' + d.run.title + ': MP text ' + (mpText ? 'present' : 'absent'));
  if (mpText) ok(d.run.detail.includes('MP segments ' + PLAN.race.goalPace), 'Wk ' + w + ' MP text carries the goal pace');
 }
 ok(!/MP segments|5:20\/km/.test(require('fs').readFileSync(path.join(__dirname, '..', 'js', 'day-builder.js'), 'utf8')), 'day-builder.js carries no marathon pace of its own (§2)');
}
/* ---- result ---- */
// Chart geometry is part of correctness, not just appearance.
require('./ef-chart.test.js');
require('./run-progress.test.js');
require('./run-import.test.js');
require('./run-stream.test.js');
require('./time-input.test.js');
require('./training-journey.test.js');
require('./session-focus.test.js');
console.log('\n' + checks + ' checks, ' + failures + ' failure' + (failures === 1 ? '' : 's'));
process.exit(failures ? 1 : 0);
