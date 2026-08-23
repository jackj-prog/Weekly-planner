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
ok(hasBlock(dayOfWeek(14, 0), /Lower B \+ core\/calves \(maintenance\)/), 'Wk 14 Mon still holds the maintenance leg session');
ok(!dayOfWeek(18, 0).blocks.some((b) => b.cat === 'gym' || b.cat === 'xt'), 'Wk 17+ Mon is the true zero day');
ok(!hasBlock(dayOfWeek(12, 5), /Core \+ calves/i), 'Core + calves is OFF Saturday — calves must not load the day before the long run');
ok(!hasBlock(dayOfWeek(12, 1), /Core \+ calves|calf/i),
  'Wk 11+ Tue carries NO calf work — it sat ~20 h before the Wednesday tempo');
ok(dayOfWeek(12, 0).blocks.some((b) => (b.plan || []).some((p) => /Bent-knee calf/.test(p.ex))),
  'the soleus work lives on Monday now, on day-after-long-run legs');
ok(dayOfWeek(12, 1).blocks.some((b) => /Wind down/.test(b.title) && b.start === '20:45'),
  'Tuesday now ends at 20:45, not 21:10');
ok(!hasBlock(dayOfWeek(10, 1), /Core \+ calves/i), 'Core + calves does not start before Wk 11');
ok(!dayOfWeek(20, 5).blocks.some((b) => /calf|calves/i.test(b.title) || (b.plan || []).some((p) => /calf/i.test(p.ex))),
  'no calf work anywhere on Saturday in peak Build');
ok(hasBlock(dayOfWeek(23, 1), /maintenance/i), 'Wk 23 Tue gym should be maintenance');

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
ok(hasBlock(dayOfWeek(17, 5), /Upper B/), 'wk17 parkrun Saturday keeps Upper B after the PB');
ok(!hasBlock(dayOfWeek(24, 5), /Upper B/), 'wk24 Sat has no Upper B — half taper');
ok(hasBlock(dayOfWeek(23, 1), /Weighted dips 2 × 8/), 'Wk 23 maintenance keeps dips');
ok(hasBlock(dayOfWeek(23, 1), /EZ bar curls 2 × 10/), 'Wk 23 maintenance keeps curls');
ok(hasBlock(dayOfWeek(23, 5), /Lateral raises 2 × 12/), 'Wk 23 Upper B maintenance keeps laterals');
ok(hasBlock(dayOfWeek(5, 0), /Deadlift 3 × 5/), 'Base Lower B should carry the prescription');
ok(hasBlock(dayOfWeek(5, 0), /Plank finisher/), 'Base Lower B should carry the core finisher');
ok(hasBlock(dayOfWeek(5, 1), /\+2\.5 kg/), 'Upper A should carry the progression rule');
ok(hasBlock(dayOfWeek(3, 0), /6 × 3 min rounds/), 'Wks 1–3 Mondays keep punchbag (as lived)');
ok(hasBlock(dayOfWeek(12, 0), /Plank 3 × 45s/), 'Wk 11+ Monday carries the trunk prescription');
/* push:pull rebalance + calves-all-block (assessed from first principles) */
ok(hasBlock(dayOfWeek(5, 1), /Band pull-aparts 4 × 15–20/), 'Upper A should carry pull-aparts in the bench rests');
ok(hasBlock(dayOfWeek(5, 5), /Rear-delt flyes 3 × 12–15/), 'Upper B should carry rear-delt flyes');
ok(hasBlock(dayOfWeek(23, 1), /Band pull-aparts 2 × 15/), 'Wk 23 maintenance keeps pull-aparts');
ok(hasBlock(dayOfWeek(23, 5), /Rear-delt flyes 2 × 12/), 'Wk 23 Upper B maintenance keeps rear delts');
ok(hasBlock(dayOfWeek(12, 0), /Straight-leg calf raises 2 × 15/), 'Wk 11+ Monday carries straight-leg calf work');
ok(hasBlock(dayOfWeek(12, 0), /Bent-knee calf raises/), 'Wk 11+ Monday carries the soleus work');
/* the whole point: nothing loads the calves the day before the tempo */
for (const wk of [12, 14, 16]) {
  ok(!dayOfWeek(wk, 1).blocks.some((b) => (b.plan || []).some((p) => /calf/i.test(p.ex))),
    'wk ' + wk + ' Tuesday carries no calf work — Wednesday is the tempo');
}
ok(hasBlock(dayOfWeek(5, 0), /Calf raises 3 × 15/), 'Base Lower B still carries its calf raises');
ok(hasBlock(dayOfWeek(23, 1), /3 reps in reserve/), 'Wk 23 Upper A should swap to the maintenance session');
ok(hasBlock(dayOfWeek(23, 1), /Bench press 2 × 6–8/), 'Wk 23 Upper A plan should be the reduced sets');
ok(!hasBlock(dayOfWeek(23, 1), /Bench press 4 × 6–8/), 'Wk 23 Upper A should not show the full-volume session');
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
ok(/2×15 pogo hops/.test(dayOfWeek(5, 3).run.detail), 'Thu easy runs start with pogo hops');
ok(/2×15 pogo hops/.test(dayOfWeek(5, 1).run.detail), 'Tue easy runs start with pogo hops');
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
  ok(hasBlock(dayOfWeek(12, 0), /College/) && hasBlock(dayOfWeek(12, 0), /Lower B \+ core\/calves/),
    'wk12 Mon is a college day with maintenance legs after');
  ok(hasBlock(dayOfWeek(18, 0), /zero day/i) && !dayOfWeek(18, 0).blocks.some((b) => b.cat === 'gym' || b.cat === 'xt'),
    'wk18 Mon is the zero day — no gym, no punchbag');
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
  ok(PLAN.logModel.paceSpan === 30 && PLAN.logModel.hrSpan === 20,
    'stepper spans are the agreed ±30 s/km and ±20 bpm');
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
  ok(bare && bare.paceSec === 383 && bare.hr === PLAN.logModel.fallbackHr.long,
    'wk 7 long-run estimate with no history: band mid 6:23, fallback HR — got ' +
    DB.fmtPaceSec(bare.paceSec) + '/' + bare.hr);
  ok(bare.paceMax - bare.paceMin === 60 && bare.hrMax - bare.hrMin === 40,
    'stepper bounds span exactly ±30 s and ±20 bpm around the estimate');

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
  const upperA = (wk) => dayOfWeek(wk, 1).blocks.find((b) => /Upper A/.test(b.title));
  const setsOf = (b, ex) => (b.plan.find((p) => new RegExp(ex, 'i').test(p.ex)) || {}).sets;

  ok(!/deload/i.test(upperA(12).title) && setsOf(upperA(12), 'Bench') === '4 × 6–8',
    'wk 12 (not a cutback) keeps full sets');
  ok(/deload/i.test(upperA(13).title) && setsOf(upperA(13), 'Bench') === '2 × 6–8',
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

  /* The intensity target is the audit of rule 1, so it has to be honest
     about what it can and cannot see. */
  {
    /* The tempo readout must sit FASTER than the pace that produced the
     too-easy first tempo (4:31/km heat-corrected at Z3), or it invites the
     same mistake it exists to prevent. */
  {
    const n = PLAN.tempoPaceNote || '';
    const band = (n.match(/(\d):(\d{2})–(\d):(\d{2})\/km/) || []);
    ok(band.length === 5, 'the tempo note carries a pace band');
    const slow = +band[3] * 60 + +band[4];
    ok(slow < 271, 'the tempo band’s slow end is quicker than the 4:31/km that read Z3, got ' +
      Math.floor(slow / 60) + ':' + String(slow % 60).padStart(2, '0'));
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
  const files = ['../data/plan.js', '../js/day-builder.js', '../js/app.js', '../tests/build.test.js'];
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

/* ---- result ---- */
console.log('\n' + checks + ' checks, ' + failures + ' failure' + (failures === 1 ? '' : 's'));
process.exit(failures ? 1 : 0);
