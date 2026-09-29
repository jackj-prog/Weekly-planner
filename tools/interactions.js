/* ==========================================================================
   Week OS — tools/interactions.js  (development only, never shipped)
   Drives the real app in headless Chromium and checks what the buttons
   actually store: the missed-run question, skips, moves to any day, the
   morning resting-HR check, "leave out of trends", backup round trips, the
   marathon-pace check (manual and from a TCX finish), moved runs taking a
   rest day's run card, the resting-HR trend, a render sweep over every day
   of the block, and an offline reload.

   Unit tests (tests/*.js) cover the pure modules. This covers the wiring
   between them and localStorage, which only a browser can. It is NOT iPhone
   verification: it is Chromium at 390×844 (see docs/device-checklist.md).

   Every number in the fixture below is INVENTED. Real physiology never
   enters this repo (CLAUDE.md §4.10); resting/max HR here are 50/190 and
   53/190, which are fixtures, not a person.

   Needs playwright-core outside the repo, like tools/shoot.js:
       NODE_PATH=<dir>/node_modules node tools/interactions.js
       node tools/interactions.js --quick       (skip the 234-day sweep)
   A browser is found automatically, or set WEEKOS_CHROME=/path/to/chrome.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const TZ = 'Europe/London';
const QUICK = process.argv.includes('--quick');
const DB = require('../js/day-builder.js');

/* ---- static server: the same allowlist rules as tools/shoot.js ---- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ics': 'text/calendar',
};
const DENY = /(^|[/\\])\.git([/\\]|$)|(^|[/\\])private([/\\]|$)/i;
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';
      const safe = path.normalize(rel).replace(/^([/\\])+/, '');
      const file = path.join(ROOT, safe);
      if (DENY.test(safe) || !Object.prototype.hasOwnProperty.call(MIME, path.extname(file)) ||
          !file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function findBrowser() {
  if (process.env.WEEKOS_CHROME) return process.env.WEEKOS_CHROME;
  const found = [];
  const pw = '/opt/pw-browsers';
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw).filter((n) => n.startsWith('chromium')).sort().reverse()) {
      found.push(path.join(pw, d, 'chrome-linux/chrome'), path.join(pw, d, 'chrome-linux/headless_shell'));
    }
  }
  found.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return found.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

/* ---- the instant, in the app's timezone (same maths as shoot.js) ---- */
function zoneOffset(ms) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))
    .reduce((o, x) => (o[x.type] = x.value, o), {});
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
}
function epochFor(iso, hhmm) {
  const [Y, M, D] = iso.split('-').map(Number), [h, m] = hhmm.split(':').map(Number);
  const naive = Date.UTC(Y, M - 1, D, h, m);
  let ms = naive - zoneOffset(naive);
  const o = zoneOffset(ms);
  if (naive - o !== ms) ms = naive - o;
  return ms;
}

/* ---- invented fixture ---- */
const SEED = {
  hr: { rest: 50, max: 190, at: '2026-09-01' },
  'runlog-2026-09-15': { sec: 2800, hr: 145, km: 7 },
  'runlog-2026-09-17': { sec: 2050, hr: 140, km: 5 },
  'runlog-2026-09-20': { sec: 7700, hr: 150, km: 21 },
  'runlog-2026-09-22': { sec: 2330, hr: 146, km: 6 },
  'runlog-2026-09-23': { sec: 2380, hr: 147, km: 6 },
  'runlog-2026-09-24': { sec: 1950, hr: 144, km: 5 },
};

let browser, server, passes = 0, fails = 0;
function check(cond, msg) { if (cond) passes++; else { fails++; console.log('  FAIL: ' + msg); } }
async function open(date, time, seed, view) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    timezoneId: TZ, locale: 'en-GB' });
  await ctx.addInitScript(({ epoch, seed }) => {
    const Real = Date, skew = epoch - Real.now();
    function Fake(...a) {
      if (!new.target) return new Real(Real.now() + skew).toString();
      return a.length === 0 ? new Real(Real.now() + skew) : new Real(...a);
    }
    Fake.prototype = Real.prototype; Fake.now = () => Real.now() + skew; Fake.parse = Real.parse; Fake.UTC = Real.UTC;
    window.Date = Fake;
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      sessionStorage.setItem('seeded', '1');
    }
    window.confirm = () => true;
  }, { epoch: epochFor(date, time), seed });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/index.html', { waitUntil: 'networkidle' });
  if (view === 'week') await page.click('[data-nav="week"]');
  if (view === 'ref') { await page.click('[data-nav="more"]'); await page.click('[data-nav="ref"]'); }
  await page.waitForTimeout(200);
  const ls = (k) => page.evaluate((key) => localStorage.getItem(key), k);
  const json = async (k) => JSON.parse(await ls(k) || 'null');
  return { page, ctx, errors, ls, json };
}
const text = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ');
const noErrors = (t, what) => check(t.errors.length === 0, what + ' — console errors: ' + t.errors.join(' | '));

async function missedRun() {
  console.log('· missed-run question and skips');
  let t = await open('2026-09-27', '18:00', SEED);
  check(await t.page.isVisible('.h-missed [data-missed="skip"]'), 'question shown after the window');
  await t.page.click('[data-missed="skip"]');
  check((await t.json('ovr-2026-09-27')).skip['t0830-run'] === true, 'Didn’t happen stores a skip');
  check(await t.page.isVisible('.hero.skipped'), 'hero shows the skipped state');
  await t.page.click('[data-missed="unskip"]');
  check(!(await t.json('ovr-2026-09-27')).skip['t0830-run'], 'Undo clears the skip');
  await t.page.click('[data-missed="done"]');
  check((await t.json('done-2026-09-27'))['t0830-run'] === true, 'Ran as planned ticks the run');
  noErrors(t, 'missed-run');
  await t.ctx.close();
  t = await open('2026-09-27', '09:00', SEED);
  check(!(await t.page.isVisible('.h-missed')), 'no question inside the window');
  await t.ctx.close();
}

async function moves() {
  console.log('· move to any day');
  const t = await open('2026-09-28', '12:00', SEED);
  const gym = '.tl-card:has-text("Legs microdose")';
  await t.page.click(gym + ' .more-btn'); await t.page.click('[data-act="movepick"]');
  const targets = await t.page.$$eval('[data-move-to]', (bs) => bs.map((b) => b.dataset.moveTo));
  check(targets.length === 6 && !targets.includes('2026-09-28'), 'six other days offered');
  check(/upper \+ core only/.test(await text(t.page, '[data-move-to="2026-10-01"]')), 'Thursday warns legs drop');
  await t.page.click('[data-move-to="2026-10-01"]');
  check((await t.json('ovr-2026-09-28')).moved['t1630-gym'] === '2026-10-01', 'target date stored');
  check((await t.json('movein-2026-10-01')).length === 1, 'moved-in item written');
  check(/moved to Thu 1 Oct/.test(await text(t.page, '.moved-tag')), 'source names the day');
  await t.page.click('.tl-card.skipped .more-btn');
  check(!(await t.json('ovr-2026-09-28')).moved['t1630-gym'] && (await t.json('movein-2026-10-01')).length === 0, 'undo clears both days');
  noErrors(t, 'moves');
  await t.ctx.close();

  const r = await open('2026-10-01', '12:00', SEED);
  await r.page.click('.day-nav [data-d="1"]'); await r.page.click('.day-nav [data-d="1"]');
  await r.page.click('.tl-card:has-text("Recovery buffer run") .more-btn'); await r.page.click('[data-act="movepick"]');
  check(/has Easy run/.test(await text(r.page, '[data-move-to="2026-10-01"]')) && /one run log/.test(await text(r.page, '.c-move .mv-runlog')),
    'run-on-run move names the clash and warns once');
  await r.page.click('[data-move-to="2026-10-02"]');
  await r.page.click('.day-nav [data-d="-1"]');
  check(/Moved from 3 Oct/.test(await text(r.page, '.hero .h-state')), 'moved run takes the rest day’s hero');
  await r.page.click('.hero .h-tick');
  check((await r.json('done-2026-10-02'))['mv-2026-10-03-t0830-run'] === true, 'hero tick marks the moved item');
  noErrors(r, 'moved run');
  await r.ctx.close();
}

async function restingHr() {
  console.log('· morning resting HR and trend');
  let t = await open('2026-09-29', '12:00', SEED);
  await t.page.click('.h-rhr.add'); await t.page.click('[data-rhr="1"]'); await t.page.click('[data-rhr="1"]'); await t.page.click('[data-rhr="save"]');
  check((await t.json('rhr-2026-09-29')).bpm === 52, 'reading saved from the zones’ resting HR + 2');
  await t.ctx.close();
  const seed = { ...SEED, hr: { rest: 53, max: 190, at: '2026-09-01' } };
  [52, 51, 52, 50, 50, 49, 49, 48, 48, 47, 48, 47, 46, 47].forEach((v, i) => {
    seed['rhr-' + DB.addDays('2026-09-16', i)] = { bpm: v };
  });
  t = await open('2026-09-29', '12:00', seed, 'ref');
  await t.page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  check(/Your usual now: 49/.test(await text(t.page, '.rhr-trend')), 'usual is the 14-day median');
  await t.page.click('[data-hz="rhr"]');
  const hr = await t.json('hr');
  check(hr.rest === 49 && hr.max === 190, 'update rewrites resting HR only');
  noErrors(t, 'resting HR');
  await t.ctx.close();
  t = await open('2026-09-29', '12:00', { ...seed, hr: { rest: 50, max: 190, at: '2026-09-01' } }, 'ref');
  await t.page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  check(!(await t.page.isVisible('[data-hz="rhr"]')), 'no offer within 1 bpm');
  await t.ctx.close();
}

async function trendsAndBackup() {
  console.log('· leave out of trends, backup round trip');
  let t = await open('2026-09-20', '19:00', SEED);
  await t.page.click('.runlogger .h-log');
  if (!(await t.page.$eval('.log-extra', (e) => e.open))) await t.page.click('.log-extra summary');
  await t.page.check('.log-x'); await t.page.click('.rl-save');
  check((await t.json('runlog-2026-09-20')).x === true, 'flag stored');
  await t.page.click('.runlogger .h-log');
  if (!(await t.page.$eval('.log-extra', (e) => e.open))) await t.page.click('.log-extra summary');
  await t.page.uncheck('.log-x'); await t.page.click('.rl-save');
  check(!('x' in (await t.json('runlog-2026-09-20'))), 'flag removed');
  noErrors(t, 'trends flag');
  await t.ctx.close();
  t = await open('2026-09-29', '12:00', { ...SEED, 'rhr-2026-09-28': { bpm: 51 } }, 'ref');
  await t.page.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); try { Object.defineProperty(navigator, 'clipboard', { value: undefined }); } catch (e) { /* fine */ } });
  await t.page.click('[data-io="export"]');
  const blob = await t.page.$eval('textarea', (x) => x.value).catch(() => '');
  check(/rhr-2026-09-28/.test(blob), 'backup includes resting-HR readings');
  await t.page.evaluate(() => localStorage.removeItem('rhr-2026-09-28'));
  await t.page.click('[data-io="restore"]');
  const box = await t.page.$('textarea:not(.hidden)');
  if (box) { await box.fill(blob); await t.page.click('[data-io="restore"]'); }
  check((await t.json('rhr-2026-09-28') || {}).bpm === 51, 'restore brings them back');
  await t.ctx.close();
}

function tcx() {
  const pts = [];
  let t = Date.parse('2026-10-04T07:30:00Z'), dist = 0;
  const push = (hr) => pts.push('<Trackpoint><Time>' + new Date(t).toISOString() + '</Time><DistanceMeters>' +
    dist.toFixed(1) + '</DistanceMeters><HeartRateBpm><Value>' + hr + '</Value></HeartRateBpm></Trackpoint>');
  push(145);
  while (dist < 16000) { t += 10000; dist += 10000 / 355; push(145); }
  while (dist < 22000) { t += 10000; dist += 10000 / 280; push(158); }
  return '<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">' +
    '<Activities><Activity Sport="Running"><Lap><Track>' + pts.join('') + '</Track></Lap></Activity></Activities></TrainingCenterDatabase>';
}
async function marathonPace() {
  console.log('· marathon-pace check');
  let t = await open('2026-10-04', '13:00', SEED);
  check(/5:20 · km 17–22/.test(await text(t.page, '.hero .h-mp')), 'run card shows where the MP finish starts');
  await t.page.click('.runlogger .h-log');
  check(await t.page.isVisible('[data-log-field="mpPaceSec"]'), 'MP fields on an MP day');
  check((await t.page.inputValue('[data-log-field="mpKm"]')) === '6', 'MP km from the session title');
  const fill = async (k, v) => { await t.page.fill('[data-log-field="' + k + '"]', v); await t.page.dispatchEvent('[data-log-field="' + k + '"]', 'change'); };
  await fill('km', '22'); await fill('sec', '2:08:00'); await fill('hr', '147'); await fill('mpPaceSec', '4:45'); await fill('mpHr', '156');
  await t.page.click('.rl-save');
  const e = await t.json('runlog-2026-10-04');
  check(e.mpKm === 6 && e.mpPaceSec === 285 && e.mpHr === 156, 'MP fields saved');
  check(/NEW LONGEST RUN/.test(await text(t.page, '.titlecard.earned')), 'a new longest run earns its moment on first save');
  check(/Z3/.test(await text(t.page, '.h-dc.mp')), 'readback places MP HR in Z3');
  check(!(await t.page.isVisible('.h-dc:has-text("decoupling")')), 'no decoupling on an MP run');
  noErrors(t, 'MP manual');
  await t.ctx.close();
  t = await open('2026-10-04', '13:00', SEED);
  await t.page.click('.runlogger .h-log');
  await t.page.setInputFiles('.log-file', { name: 'run.tcx', mimeType: 'application/xml', buffer: Buffer.from(tcx()) });
  await t.page.waitForTimeout(300);
  check(/Marathon-pace finish · 6 km · 4:40\/km · 158 bpm/.test(await text(t.page, '.log-preview')), 'TCX finish read');
  await t.page.click('.log-use'); await t.page.click('.rl-save');
  check((await t.json('runlog-2026-10-04')).mpHr === 158, 'imported MP saved');
  noErrors(t, 'MP import');
  await t.ctx.close();
}

async function weekShape() {
  console.log('· week shape panel');
  // Wk 12 (14–20 Sep, 43 km: Tue 7 · Wed 7 · Thu 5 · Sat 3 · Long 21), invented logs.
  const wk = (extra) => Object.assign({}, SEED, { 'runlog-2026-09-16': { sec: 2300, hr: 160, km: 7 } }, extra);
  const openWk12 = async (seed) => {
    const t = await open('2026-09-21', '12:00', seed, 'week');
    await t.page.click('[aria-label*="revious week"]'); await t.page.waitForTimeout(150);
    return t;
  };
  let t = await openWk12(wk({ 'runlog-2026-09-19': { sec: 700, hr: 130, km: 1.5 } }));
  check(!(await t.page.$('.wk-shape')), 'a short Saturday buffer alone raises no shape panel (rule 10)');
  await t.ctx.close();
  t = await openWk12(wk({ 'runlog-2026-09-17': { sec: 800, hr: 140, km: 2 } }));
  check(/held/.test(await t.page.getAttribute('.wk-shape', 'class')) && /held its planned share/.test(await text(t.page, '.wk-shape')),
    'one short weekday with the long run on share → quiet panel, no skew story');
  await t.ctx.close();
  t = await openWk12(wk({ 'runlog-2026-09-15': { sec: 600, hr: 140, km: 1.5 }, 'runlog-2026-09-16': { sec: 600, hr: 150, km: 2 }, 'runlog-2026-09-20': { sec: 9000, hr: 150, km: 26 } }));
  check(!/held/.test(await t.page.getAttribute('.wk-shape', 'class')) && /but the long run took/.test(await text(t.page, '.wk-shape')),
    'a long run carrying the week keeps the skew panel');
  noErrors(t, 'week shape');
  await t.ctx.close();
  const noLong = wk({});
  delete noLong['runlog-2026-09-20'];
  t = await openWk12(noLong);
  const lrText = await text(t.page, '.wk-shape');
  check(!/held/.test(await t.page.getAttribute('.wk-shape', 'class')) && /long run came in at 0 of 21 km/.test(lrText) && !/held its planned share/.test(lrText),
    'a missing long run gets its own note, never "held its share"');
  await t.ctx.close();
}

async function cinema() {
  console.log('· billboard, key days, title card gate');
  let t = await open('2026-10-04', '07:40', SEED);
  check((await text(t.page, '.bb-num')) === '112', 'billboard numeral is the days to the gun');
  check((await t.page.getAttribute('.bb', 'aria-hidden')) === 'true', 'billboard is decorative');
  check(/light-long/.test(await t.page.getAttribute('.day-head', 'class')) && /cls-long/.test(await t.page.getAttribute('.hero', 'class')), 'long run lights the head and the card white');
  check(!(await t.page.$('.titlecard')), 'no title card in a browser tab');
  await t.ctx.close();
  t = await open('2027-01-24', '05:10', SEED);
  check((await text(t.page, '.bb-num')) === '42.2', 'race morning billboard is the distance');
  await t.ctx.close();
  t = await open('2027-02-10', '12:00', SEED);
  check(!(await t.page.$('.bb')), 'no countdown once the race is past');
  await t.ctx.close();
  t = await open('2026-09-29', '12:00', SEED);
  await t.page.click('[data-nav="more"]'); await t.page.click('[data-nav="plan"]'); await t.page.waitForTimeout(150);
  check((await t.page.$$('.wall .wl-cols .wl')).length === 210, 'the wall draws all 210 days');
  check((await t.page.$$('.sky .sk-star')).length >= 6 && !!(await t.page.$('.sky .sk-sun')), 'the night sky draws recorded runs as stars and the race as a sunrise');
  check(/RUNS SO FAR/.test(await text(t.page, '.wall-head')), 'the wall counts runs so far');
  check((await text(t.page, '.journey-event.next .journey-event-index')) === 'II', 'key days are numbered in Roman numerals');
  const next = await t.page.$$('.journey-event.next');
  check(next.length === 1 && /PARKRUN/.test(await next[0].textContent()), 'exactly one key day lit: the next one');
  noErrors(t, 'cinema');
  await t.ctx.close();
  // v4.70: NEXT counts down; Monday opens with last week; the poster renders
  t = await open('2026-09-29', '16:50', SEED);
  check((await text(t.page, '.nn-in')) === 'in 20 min', 'NEXT line counts down to the run');
  check(/sessions, 0 done; run at 17:10/.test(await t.page.getAttribute('.daywheel', 'aria-label')) && !!(await t.page.$('.daywheel .dw-hand')),
    'the day wheel summarises the day and points at now');
  check((await t.page.$$('.daywheel .dw-canon')).length === 8 && /Per aspera ad astra/.test((await t.page.textContent('.daywheel .dw-motto')) || ''),
    'the dial carries the canonical hours and the Build motto');
  await t.ctx.close();
  t = await open('2026-09-21', '12:00', SEED);
  const prev = await text(t.page, '.previously');
  check(/PREVIOUSLY · WEEK 12/.test(prev) && /3 of 5 runs · long run banked/.test(prev), 'Monday shows last week: ' + prev.slice(0, 80));
  await t.page.click('.pv-open'); await t.page.waitForTimeout(150);
  check(/Week 12/.test(await text(t.page, '.wk-head h1')), 'Previously opens that week');
  await t.ctx.close();
  t = await open('2026-09-22', '12:00', SEED);
  check(!(await t.page.$('.previously')), 'Previously is a Monday card only');
  await t.ctx.close();
  t = await open('2026-09-20', '20:00', SEED);
  await t.page.click('.recap-share');
  await t.page.waitForSelector('.card-ov[open] img', { timeout: 5000 });
  check(((await t.page.getAttribute('.card-ov img', 'src')) || '').length > 50000, 'run poster renders on the device');
  noErrors(t, 'poster');
  await t.ctx.close();
}

async function sweep() {
  if (QUICK) { console.log('· render sweep skipped (--quick)'); return; }
  console.log('· render sweep: 234 days, 34 weeks, Plan, Reference');
  const t = await open('2026-06-22', '17:30', SEED);
  for (let i = 0; i < 234; i++) await t.page.click('.day-nav [data-d="1"]');
  await t.page.click('[data-nav="week"]');
  for (let i = 0; i < 34; i++) await t.page.click('[data-d="7"]');
  await t.page.click('[data-nav="more"]'); await t.page.click('[data-nav="plan"]');
  await t.page.click('[data-nav="more"]'); await t.page.click('[data-nav="ref"]');
  await t.page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  noErrors(t, 'sweep');
  await t.ctx.close();
}

async function offline() {
  console.log('· offline reload');
  const t = await open('2026-10-04', '09:00', {});
  check(await t.page.evaluate(async () => !!(await navigator.serviceWorker.ready).active), 'service worker active');
  await t.page.waitForTimeout(800);
  await t.ctx.setOffline(true);
  await t.page.reload({ waitUntil: 'load' });
  check(await t.page.isVisible('.hero'), 'Today renders offline');
  await t.ctx.close();
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright-core')); } catch (e) {
    console.error('interactions: playwright-core is not installed (see the header).'); process.exit(1);
  }
  const exe = findBrowser();
  if (!exe) { console.error('interactions: no Chromium found; set WEEKOS_CHROME.'); process.exit(1); }
  browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  server = await serve();
  try {
    for (const run of [missedRun, moves, restingHr, trendsAndBackup, marathonPace, weekShape, cinema, sweep, offline]) await run();
  } catch (e) { fails++; console.error(e); }
  await browser.close(); server.close();
  console.log('\n' + passes + ' passed, ' + fails + ' failed · Chromium mobile viewport, not a physical iPhone');
  process.exitCode = fails ? 1 : 0;
})();
