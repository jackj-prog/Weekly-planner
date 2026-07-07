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
  for (const b of day.blocks) {
    ok(b.startMin < b.endMin, iso + ' "' + b.title + '" start !< end');
    ok(b.startMin >= 0 && b.endMin <= 1439, iso + ' "' + b.title + '" outside 00:00–23:59');
    ok(b.startMin > prevStart, iso + ' "' + b.title + '" not strictly after previous start');
    ok(b.startMin >= prevEnd, iso + ' "' + b.title + '" overlaps previous block');
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
ok(hasBlock(dayOfWeek(5, 4), /Incline bench 4 × 8–10/), 'Upper B should carry the full prescription');
ok(hasBlock(dayOfWeek(5, 5), /Deadlift 3 × 5/), 'Base Lower B should carry the prescription');
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
  ok(flat.includes('Drive over\\, no run-commute'), 'commas escaped');
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
