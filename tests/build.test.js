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
ok(hasBlock(dayOfWeek(17, 5), /PARKRUN 5K/i), 'wk 17 Sat should hold the parkrun');
ok(hasBlock(dayOfWeek(24, 6), /TUNE-UP HALF/i), 'wk 24 Sun should hold the tune-up half');
ok(hasBlock(dayOfWeek(26, 4), /CHRISTMAS.*rest|full rest/i), 'wk 26 Fri should be Christmas rest');
ok(hasBlock(dayOfWeek(27, 4), /New Year|REST/), 'wk 27 Fri should be NYD rest');
ok(hasBlock(dayOfWeek(30, 6), /MARATHON/), 'wk 30 Sun should hold the race protocol');
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
ok(hasBlock(dayOfWeek(27, 6), /PEAK 32/i), 'wk 27 Sun should be the peak long run');

/* Hero run visible on run days */
section('run hero present');
ok(dayOfWeek(1, 2).run && dayOfWeek(1, 2).run.run.km > 0, 'wk 1 Wed should expose a hero run');
ok(dayOfWeek(20, 6).run && dayOfWeek(20, 6).run.run.km === 30, 'wk 20 Sun hero should be 30 km');
ok(dayOfWeek(1, 0).run === null, 'Monday should have no run');

/* Gels rule: from October on runs > 90 min */
ok(/Gel every/i.test(dayOfWeek(20, 6).run.detail), 'wk 20 long run should carry the gel rule');
ok(!/Gel every/i.test(dayOfWeek(10, 6).run.detail), 'wk 10 (Sep) long run should not carry the gel rule');

/* Phase deltas */
section('phase deltas');
function friGerman(wk) {
  const d = dayOfWeek(wk, 4);
  return d.blocks.find((b) => /German active/i.test(b.title));
}
ok(friGerman(5).end === '12:00', 'Base Fri German ends 12:00');
ok(friGerman(15).end === '11:30', 'Build Fri German ends 11:30');
ok(friGerman(23).end === '10:30', 'Wk 23 Fri German ends 10:30');
ok(hasBlock(dayOfWeek(5, 5), /Lower B/i), 'Base Sat should hold Lower B');
ok(hasBlock(dayOfWeek(12, 5), /Core \+ mobility/i), 'Wk 11+ Sat should hold optional core');
ok(hasBlock(dayOfWeek(23, 1), /maintenance/i), 'Wk 23 Tue gym should be maintenance');

/* gym programming — structured plans on the blocks */
ok(hasBlock(dayOfWeek(5, 1), /Bench press 4 × 6–8/), 'Upper A should carry the full prescription');
ok(hasBlock(dayOfWeek(5, 1), /Weighted dips 3 × 8–10/), 'Upper A should carry weighted dips');
ok(hasBlock(dayOfWeek(5, 1), /EZ bar curls 3 × 10–12/), 'Upper A should carry EZ bar curls');
ok(hasBlock(dayOfWeek(5, 1), /Face pulls 3 × 15/), 'Upper A should keep face pulls');
ok(hasBlock(dayOfWeek(5, 4), /Incline bench 4 × 8–10/), 'Upper B should carry the full prescription');
ok(hasBlock(dayOfWeek(5, 4), /Lateral raises 4 × 12–15/), 'Upper B should carry 4 sets of laterals');
ok(hasBlock(dayOfWeek(5, 4), /Hanging leg raises/), 'Upper B should carry the ab work');
ok(hasBlock(dayOfWeek(23, 1), /Weighted dips 2 × 8/), 'Wk 23 maintenance keeps dips');
ok(hasBlock(dayOfWeek(23, 1), /EZ bar curls 2 × 10/), 'Wk 23 maintenance keeps curls');
ok(hasBlock(dayOfWeek(23, 4), /Lateral raises 2 × 12/), 'Wk 23 Upper B maintenance keeps laterals');
ok(hasBlock(dayOfWeek(5, 5), /Deadlift 3 × 5/), 'Base Lower B should carry the prescription');
ok(hasBlock(dayOfWeek(5, 5), /Plank finisher/), 'Base Lower B should carry the core finisher');
ok(hasBlock(dayOfWeek(5, 1), /\+2\.5 kg/), 'Upper A should carry the progression rule');
ok(hasBlock(dayOfWeek(5, 0), /6 × 3 min rounds/), 'Punchbag should carry its round structure');
ok(hasBlock(dayOfWeek(12, 5), /Plank 3 × 45s/), 'Wk 11+ core session should carry the prescription');
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
ok(!/relaxed strides/.test(dayOfWeek(5, 1).run.detail), 'Tue easy runs stay plain');
ok(/headtorch/i.test(dayOfWeek(15, 2).run.detail), 'Oct Wed 17:10 carries the dark-kit note');
ok(/headtorch/i.test(dayOfWeek(15, 1).run.detail), 'Oct Tue 17:10 (post-HNC) is dark');
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
  ok(hasBlock(dayOfWeek(5, 1), /Work/), 'wk5 Tue is a work day (HNC done)');
  ok(!hasBlock(dayOfWeek(5, 1), /College/), 'wk5 Tue no longer college');
  ok(hasRunAt(dayOfWeek(5, 1), '17:10'), 'wk5 Tue run moved to 17:10');
  ok(hasBlock(dayOfWeek(5, 1), /Upper A/), 'wk5 Tue keeps Upper A at 19:30');
  ok(hasBlock(dayOfWeek(5, 0), /Punchbag/), 'wk5 Mon still the recovery day (no college yet)');
  // Wk 12+: Monday becomes the HND college day
  ok(hasBlock(dayOfWeek(12, 0), /College — HND/), 'wk12 Mon is the HND college day');
  ok(hasBlock(dayOfWeek(12, 0), /Punchbag/), 'wk12 Mon keeps punchbag in the evening');
  ok(dayOfWeek(12, 0).run === null, 'wk12 Mon still has no run');
  ok(hasBlock(dayOfWeek(12, 1), /Work/), 'wk12 Tue stays a work day');
  ok(hasRunAt(dayOfWeek(12, 1), '17:10'), 'wk12 Tue run still 17:10');
  // Special weeks still win over the scaffold
  ok(hasBlock(dayOfWeek(26, 0), /CHRISTMAS|full rest|holiday|Family/i) || dayOfWeek(26, 0).blocks.some((b) => /Punchbag/.test(b.title)),
    'wk26 Mon holiday template overrides the HND scaffold');
  ok(hasBlock(dayOfWeek(24, 3), /REST/), 'wk24 Thu rest still applies over the scaffold');
  // Race week, recovery and the standing week live on the same era
  ok(hasBlock(dayOfWeek(30, 0), /College — HND/) && dayOfWeek(30, 0).blocks.some((b) => /Easy 5/.test(b.title)),
    'wk30 race-week Monday is an HND college day with the easy 5');
  ok(hasBlock(dayOfWeek(30, 1), /Work/) && hasRunAt(dayOfWeek(30, 1), '17:10'),
    'wk30 race-week Tuesday is a work day, easy 4 at 17:10');
  ok(hasBlock(DB.buildDay('2027-01-25'), /College — HND/),
    'recovery Monday (day after the race) is an HND college day');
  ok(hasBlock(DB.buildDay('2027-01-26'), /Work/),
    'recovery Tuesday is a work day');
  ok(hasBlock(DB.buildDay('2027-03-01'), /College — HND/),
    'standing-week Monday stays the HND college day');
  ok(hasBlock(DB.buildDay('2027-03-02'), /Work/) && hasRunAt(DB.buildDay('2027-03-02'), '17:10'),
    'standing-week Tuesday is a work day, hobby run at 17:10');
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
  ok(flat.includes('DTSTART:20270124T090000') && flat.includes('DTEND:20270124T130000'),
    'race day event at 09:00–13:00');
  ok(/SUMMARY:MARATHON — 42\.2 km/.test(flat), 'race summary not doubled');
  ok(/SUMMARY:Easy run — \d+ km/.test(flat), 'run summaries carry distance');
  ok(flat.includes('drive over\\, no run-commute'), 'commas escaped');
  ok(flat.includes('Bench press 4 × 6–8\\nBarbell row'), 'gym plan in description');
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
