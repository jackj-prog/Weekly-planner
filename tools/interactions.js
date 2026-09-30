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
  if (view === 'plan') { await page.click('[data-nav="more"]'); await page.click('[data-nav="plan"]'); }
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
  check(!(await t.page.$('.hero button.h-tick')), 'v4.95: no second Mark done beside “Ran as planned”');
  await t.page.click('[data-missed="skip"]');
  check((await t.json('ovr-2026-09-27')).skip['t0830-run'] === true, 'Didn’t happen stores a skip');
  check(await t.page.isVisible('.hero.skipped'), 'hero shows the skipped state');
  await t.page.click('[data-missed="unskip"]');
  check(!(await t.json('ovr-2026-09-27')).skip['t0830-run'], 'Undo clears the skip');
  await t.page.click('[data-missed="done"]');
  check((await t.json('done-2026-09-27'))['t0830-run'] === true, 'Ran as planned ticks the run');
  check(await t.page.isVisible('.hero button.h-tick.on'), 'once answered, the corner tick returns as Done');
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

  /* today is the target day: from v4.87 a session on a future date cannot be ticked */
  const r = await open('2026-10-02', '07:00', SEED);
  await r.page.click('.day-nav [data-d="1"]');
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
  check((await t.page.$$('.daywheel .dw-canon')).length === 8 && /XXIX · IX · MMXXVI/.test((await t.page.textContent('.daywheel .dw-motto')) || ''),
    'the dial carries the canonical hours and the date in numerals');
  check(/sunrise 07:0\d · sunset 18:[45]\d/.test(await text(t.page, '.dw-sunline')) && (await t.page.$$('.daywheel .dw-sun')).length === 2 &&
    !!(await t.page.$('.daywheel .dw-moon')) && (await t.page.$$('.daywheel .dw-star')).length > 8, 'the dial draws the real sky: sun, moon, stars');
  // v4.76: the run against its sky, and the Now card wearing the light outside
  check(/^Sunset 18:[45]\d\s· /.test(await text(t.page, '.hero .runsky .rs-line')) && !!(await t.page.$('.hero .runsky .rs-dome')) &&
    (await t.page.$$('.hero .runsky .rs-hour')).length === 2 && !!(await t.page.$('.hero .rs-sunnow:not(.below)')),
    'the run card draws the day\u2019s sun arc, sunrise and sunset, and the sun riding it now');
  check(!!(await t.page.$('.nownext.sky-day .nn-sky.day')) && !(await t.page.$('.nownext .nn-stars')), 'by day the Now card shows the sun and no stars');
  check(!!(await t.page.$('.daywheel .dw-moonarc')) && !(await t.page.$('.daywheel .dw-gloria')), 'the dial draws the moon\u2019s arc; an unfinished day has no gloria');
  await t.ctx.close();
  // v4.77: a finished day earns the gloria; the Week view carries the light of the week
  t = await open('2026-10-06', '22:10', Object.assign({}, SEED, { 'done-2026-10-06': { 't1710-run': true, 't1930-study': true, 't2200-reading': true } }));
  check(/complete/.test(await t.page.getAttribute('.daywheel', 'class')) && !!(await t.page.$('.daywheel .dw-gloria')), 'a finished day earns the gloria');
  await t.ctx.close();
  // v4.78: the timeline keeps the sun's hours; the week keeps the moon; Reference is a book
  t = await open('2026-10-01', '12:00', SEED);
  const sunRows = await t.page.$$eval('.tl .tl-sun', (ns) => ns.map((n) => n.textContent));
  check(sunRows.length === 2 && /^Sunrise 07:0\d\s· first light 06:3\d$/.test(sunRows[0]) && /^Sunset 18:4\d\s· dark by 19:1\d$/.test(sunRows[1]),
    'the timeline carries sunrise and sunset in their places: ' + sunRows.join(' | '));
  check(/linear-gradient/.test(await t.page.$eval('.tl', (n) => n.style.getPropertyValue('--spine'))), 'the timeline spine is painted in the day\u2019s light');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'week');
  check((await t.page.$$('.wk-days .wk-day .d-moon')).length === 7, 'every day of the week keeps its moon');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'ref');
  const contents = await t.page.$$eval('.ref-index .rc-list button', (ns) => ns.map((n) => n.textContent));
  check(contents.length === (await t.page.$$('.ref-fold')).length && contents.length >= 10 && /^IPaces$/.test(contents[0]) && /^XII/.test(contents[11] || ''),
    'Reference opens on a contents page, one numbered entry per chapter');
  await t.page.click('.ref-index [data-ref-target="ref-fuel"]');
  check(await t.page.$eval('#ref-fuel', (n) => n.open) && /^VIII$/.test(await text(t.page, '#ref-fuel > summary .chap')), 'a contents entry opens its numbered chapter');
  noErrors(t, 'reference book');
  await t.ctx.close();
  // v4.79: the More sheet's plates, a rest day's moon, the focus stage
  t = await open('2026-10-02', '12:00', SEED);
  check(/^(New moon|Waxing crescent|First quarter|Waxing gibbous|Full moon|Waning gibbous|Last quarter|Waning crescent)$/.test(await text(t.page, '.resthero .rest-moon small')),
    'a rest day carries the night\u2019s moon, named: ' + await text(t.page, '.resthero .rest-moon small'));
  await t.page.click('[data-nav="more"]');
  check(/Your training journey\s*[\d.]+ km · \d+ runs recorded/.test(await text(t.page, '.sheet-item[data-nav="plan"]')) && !!(await t.page.$('.sheet-item[data-nav="ref"] .sp-init')),
    'the More sheet opens on two illustrated plates with the real totals');
  await t.page.click('.sheet-item[data-nav="ref"]');
  check(!!(await t.page.$('.ref-index')), 'the Reference plate still opens Reference');
  noErrors(t, 'plates');
  await t.ctx.close();
  t = await open('2026-09-30', '16:55', SEED);
  await t.page.click('.hero .session-focus-open');
  check(/focus-hard/.test(await t.page.getAttribute('.session-focus', 'class')) && !!(await t.page.$('.session-focus .runsky .rs-sunnow')),
    'a hard session\u2019s focus is lit red and carries the sun\u2019s arc');
  await t.ctx.close();
  t = await open('2026-10-05', '16:40', SEED);
  await t.page.click('.tl-card .session-focus-open'); await t.page.click('.focus-jump'); await t.page.click('.focus-ex-nav [data-step="1"]');
  check((await text(t.page, '.focus-ex-num')) === 'II' && (await t.page.$$('.focus-ex-progress i.past')).length === 1, 'gym focus numbers each exercise in numerals and lights the ones behind it');
  await t.ctx.close();
  // v4.80: Reference instruments
  t = await open('2026-10-01', '12:00', SEED, 'ref');
  check((await t.page.$$('#ref-zones .zscale .zs')).length === 5 && /^\d+ bpm · \d+ \w+$/.test(await text(t.page, '#ref-zones .zs-pt')),
    'the zones are drawn as a staircase with the last run pinned to its heartbeat');
  check((await t.page.$$('#ref-pro-4-odometer .od-seg')).length === 5 && !!(await t.page.$('#ref-pro-4-odometer .od-needle')) && !(await t.page.$('#ref-pro-4-odometer .odo')),
    'the Pro 4 odometer is a dial with every outing laid on it');
  await t.ctx.close();
  // v4.81: the week's tally, the tune-up ruler, the efficiency charts
  t = await open('2026-10-01', '12:00', SEED, 'week');
  const bars = await t.page.$$eval('.week-profile .profile-day:not(.rest)', (ns) => ns.map((n) => n.className));
  check(bars.length === 5 && bars.some((c) => /\bhard\b/.test(c)) && bars.some((c) => /\blong\b/.test(c)) && /\/ \d+ km recorded/.test(await text(t.page, '.week-profile h2')),
    'one distance figure carries the week: each run in its class, recorded against planned (v4.89)');
  await t.ctx.close();
  t = await open('2026-12-14', '12:00', Object.assign({}, SEED, { recal: '1:48:30' }), 'ref');
  check((await t.page.$$('.recal-ruler .rr-band')).length === 3 && !!(await t.page.$('.recal-ruler .rr-band.goal')) && !!(await t.page.$('.recal-ruler .rr-dot')),
    'the tune-up ruler lays the plan\u2019s anchors on a time scale and pins the saved result');
  check(!!(await t.page.$('#ref-log .ef-chart .ef-fit')) && !!(await t.page.$('#ref-log .ef-chart .ef-area')), 'the efficiency charts draw their fitted line and the ground beneath');
  noErrors(t, 'polish pass');
  await t.ctx.close();
  // v4.82: the easy-pace ladder
  t = await open('2026-10-01', '12:00', SEED, 'ref');
  check((await t.page.$$('#ref-easy-pace-by-phase .pl-band')).length === 5 && (await t.page.$$('#ref-easy-pace-by-phase .pl-good.now')).length === 1 &&
    /your last \d easy · \d:\d\d/.test(await text(t.page, '#ref-easy-pace-by-phase .pl-cap')), 'the easy bands are a ladder with this phase lit and your recent easy runs ruled across');
  await t.ctx.close();
  // v4.83: the week's days lit by their run
  t = await open('2026-10-01', '12:00', SEED, 'week');
  check((await t.page.$$('.wk-days .wk-day.k-hard')).length === 1 && (await t.page.$$('.wk-days .wk-day.k-long')).length === 1 &&
    (await t.page.$$('.wk-days .wk-day.no-run')).length === 2, 'the week\u2019s day cards carry their run\u2019s class, and rest days recede');
  await t.ctx.close();
  // v4.84: emblems
  t = await open('2026-10-05', '12:00', SEED);
  check((await t.page.$$('.tl .tl-card')).length === (await t.page.$$('.tl .tl-card .c-emb svg')).length &&
    (await t.page.$$('.tl .tl-quiet')).length === (await t.page.$$('.tl .tl-quiet .q-emb svg')).length &&
    (await t.page.$$('.daywheel figcaption .lg-e svg')).length >= 2, 'every timeline row and the clock\u2019s legend carry an emblem');
  await t.ctx.close();
  t = await open('2027-01-24', '05:30', SEED);
  check(!!(await t.page.$('.tl-card .c-emb.race')), 'race day\u2019s marathon carries the red laurel');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'week');
  check((await t.page.$$('.wk-days .wk-day .d-embs')).length === 7, 'every day card carries its sessions as emblems');
  await t.ctx.close();
  // v4.85: now and next by emblem, the run card's mark, the shoes as plates
  t = await open('2026-09-30', '17:30', SEED);
  check(!!(await t.page.$('.nownext .nn-title .nn-emb svg')) && !!(await t.page.$('.nownext .nn-next .nn-nemb svg')), 'Now and Next carry their activities’ emblems');
  check(!!(await t.page.$('.hero .h-tag .h-mark svg')) && /TODAY’S RUN/.test(await text(t.page, '.hero .h-tagtxt')), 'the run card’s label carries its emblem');
  await t.ctx.close();
  t = await open('2026-09-24', '20:00', SEED);
  check((await text(t.page, '.hero .h-tagtxt')) === 'RUN LOGGED' && !!(await t.page.$('.hero .h-mark svg')), 'a logged run relabels its card and keeps the emblem');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'ref');
  const plates = await t.page.$$eval('#ref-shoes .shoe-plate', (ns) => ns.map((n) => ({ cls: n.className, num: n.querySelector('.sp-num').textContent })));
  check(plates.length === 3 && plates.filter((p) => /t-race/.test(p.cls)).length === 1 && /^\d+ of \d+ km banked · \d+ runs$/.test(plates[0].num) &&
    /km before the gun/.test(plates[2].num), 'the shoes are plates, each counting what the block asks of it: ' + plates.map((p) => p.num).join(' | '));
  noErrors(t, 'shoe plates');
  await t.ctx.close();
  // v4.87: the run card names its day, the future cannot be ticked, NOW follows its block, the header never collides
  t = await open('2026-10-07', '16:40', SEED);
  check((await text(t.page, '.hero .h-tagtxt')) === 'TODAY’S RUN', 'today\u2019s run is today\u2019s');
  check(await t.page.evaluate(() => { const n = document.querySelector('.tl-now'); const p = n && n.previousElementSibling; return !!(p && p.classList.contains('current')); }),
    'NOW sits after the block it falls inside');
  check(!!(await t.page.$('.hero .h-rhr.add.mini')), 'an unanswered resting-HR prompt is one quiet line after noon');
  check(/this week/.test(await text(t.page, '.timeline-head .wkring')), 'the ring beside Your day says it is the week\u2019s km');
  check(await t.page.evaluate(() => { const a = document.querySelector('.day-head h1').getBoundingClientRect(), b = document.querySelector('.day-head .bb').getBoundingClientRect(), c = document.querySelector('.day-head .sub').getBoundingClientRect();
    const hit = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom; return !hit(a, b) && !hit(c, b); }), 'the countdown numeral touches neither the date nor the chips');
  await t.page.click('.day-nav .nav[data-d="1"]');
  check((await text(t.page, '.hero .h-tagtxt')) === 'TOMORROW’S RUN' && !(await t.page.$('.hero button.h-tick')) && (await t.page.$$('.tl-card .tick')).length === 0,
    'tomorrow\u2019s run is named for tomorrow and cannot be ticked yet');
  await t.page.click('.day-nav .nav[data-d="-1"]'); await t.page.click('.day-nav .nav[data-d="-1"]');
  check((await text(t.page, '.hero .h-tagtxt')) === 'YESTERDAY’S RUN' && (await t.page.$$('.tl-card .tick')).length > 0, 'yesterday\u2019s run is named and can still be ticked');
  noErrors(t, 'v4.87 fixes');
  await t.ctx.close();
  t = await open('2027-01-24', '05:00', SEED);
  check(await t.page.evaluate(() => { const a = document.querySelector('.day-head h1').getBoundingClientRect(), b = document.querySelector('.day-head .bb').getBoundingClientRect(), l = document.querySelector('.day-head .day-label');
    const hit = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom; return !hit(a, b) && !(l && hit(l.getBoundingClientRect(), b)); }), 'race day\u2019s 42.2 clears the date and the week\u2019s label');
  await t.ctx.close();
  // v4.88: a quieter Today
  t = await open('2026-10-07', '19:45', SEED);
  const run = await t.page.$('.tl-card.slim');
  check(!!run && !(await run.$('.tick')) && !!(await run.$('.more-btn')) && /Tempo 25\smin/.test(await run.textContent()), 'the day\u2019s run is a slim row that keeps its ⋯ and leaves the tick to the run card');
  await t.page.click('.tl-card.slim .c-up');
  check(await t.page.evaluate(() => Math.abs(document.querySelector('.hero').getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().height) < 30), 'the slim row\u2019s button returns to the run card');
  check((await t.page.$$('.tl-card .c-cat')).length === 0, 'no category labels where the emblem and colour already say it');
  const gym = await t.page.$('.tl-card:has-text("Gym — Push")');
  check((await gym.$$('.session-focus-open')).length === 1 && !/View session/.test(await gym.textContent()), 'one way into the gym session, beside its list');
  check(await t.page.evaluate(() => { const c = document.querySelector('.tl-card:not(.slim)'), k = c.querySelector('.tick'); return k.getBoundingClientRect().top - c.getBoundingClientRect().top < 30; }), 'the tick sits in the card\u2019s corner');
  check(/past/.test(await t.page.getAttribute('.tl-quiet:has-text("Dinner")', 'class')) && !/past/.test(await t.page.getAttribute('.tl-quiet:has-text("Wind down")', 'class')), 'what has passed recedes; what is to come does not');
  check(await t.page.evaluate(() => { const tl = document.querySelector('.tl'); return !!(tl.nextElementSibling && tl.nextElementSibling.classList.contains('daywheel')); }), 'the clock follows the timeline');
  noErrors(t, 'quieter Today');
  await t.ctx.close();
  t = await open('2026-10-09', '13:00', SEED);
  check(/not ticked/.test(await text(t.page, '.tl-card:has-text("German active study") .c-time')), 'a passed session that was not ticked says so');
  await t.ctx.close();
  // v4.89: the week, days first
  t = await open('2026-10-09', '12:00', SEED, 'week');
  check(await t.page.evaluate(() => { const d = document.querySelector('.wk-days'), p = document.querySelector('.week-profile'); return !!(d && p && (d.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)); }),
    'the seven days come before the distance figure');
  check(!(await t.page.$('.wkp-tally')) && (await t.page.$$('.week-profile .profile-day.miss')).length >= 1, 'the tally\u2019s states live on the distance bars; a passed unrecorded run reads missed');
  check(!!(await t.page.$('.journey.line .journey-link')) && !(await t.page.$('.journey h2')) && /weeks · .* km · \d+ runs logged/.test(await text(t.page, '.journey.line')), 'the block\u2019s totals are one line');
  await t.page.click('.journey.line .journey-link');
  check(!!(await t.page.$('.training-journey')), 'that line opens the training journey');
  noErrors(t, 'week days first');
  await t.ctx.close();
  // v4.90: the session's shape, the shoe's tier, the prescribed heart rate
  t = await open('2026-09-30', '16:00', SEED);
  check((await t.page.$$('.hero .sess-shape.q .ss-seg.hard')).length === 5 && (await t.page.$$('.hero .sess-shape.q .ss-jog')).length === 4 &&
    /^10′ easy · 5 × 3′ Z4, jog between · easy to 6\skm$/.test(await text(t.page, '.hero .sess-shape figcaption')), 'a quality run shows its shape: warm-up, five reps, jogs between, the rest easy');
  check(!!(await t.page.$('.hero .h-shoe.t-quality .h-shoe-e svg')), 'the shoe wears its tier on the run card');
  await t.ctx.close();
  t = await open('2026-10-11', '07:00', SEED);
  check(!!(await t.page.$('.hero .sess-shape.l .ss-seg.mp')) && !(await t.page.$('.hero .sess-shape figcaption')), 'an MP long run shows its kilometres, its words left to the MP line');
  await t.page.click('.hero .session-focus-open');
  check(/km 1–18 easy · km 19–24 at MP 5:20/.test(await text(t.page, '.session-focus .sess-shape figcaption')) && /^Z2.*MP in Z3/.test(await text(t.page, '.session-focus .focus-hr strong')),
    'focus carries the shape in words and the heart rate the run is prescribed by');
  noErrors(t, 'session shape');
  await t.ctx.close();
  t = await open('2026-10-08', '12:00', SEED);
  check(!(await t.page.$('.hero .sess-shape')), 'an easy run has no shape to draw');
  await t.ctx.close();
  // v4.91: the day clock as a statement piece
  t = await open('2026-10-07', '16:40', SEED);
  const dial = await t.page.evaluate(() => {
    const w = document.querySelector('.daywheel'), hg = w.querySelector('.dw-handg');
    const sky = w.querySelector('.dw-skyring');
    return { emb: w.querySelectorAll('.dw-emb').length, arcs: w.querySelectorAll('.dw-s:not(.off)').length, lights: w.querySelectorAll('.dw-light').length,
      rot: hg && hg.style.transform, sky: sky && getComputedStyle(sky).backgroundImage, live: w.classList.contains('live'), sec: !!w.querySelector('.dw-sec'),
      ticks: w.querySelectorAll('.dw-tick').length, count: (w.querySelector('.dw-count') || {}).textContent };
  });
  check(dial.emb === 3 && dial.arcs === 3 && dial.lights === 3 && dial.count === '0/3', 'every session is on the track with its emblem, and has its own light: ' + JSON.stringify(dial));
  check(/^rotate\(250(\.00)?deg\)$/.test(dial.rot) && dial.live && dial.sec, 'the hand is turned to now (16:40 = 250°), and the live dial carries the minute\u2019s comet');
  check(/conic-gradient/.test(dial.sky) && dial.ticks === 96, 'the sky is shaded round the dial by the sun, inside a quarter-hour minute track');
  await t.page.evaluate(() => { window.__mins = 1; });
  noErrors(t, 'day clock');
  await t.ctx.close();
  t = await open('2026-10-06', '22:10', Object.assign({}, SEED, { 'done-2026-10-06': { 't1710-run': true, 't1930-study': true, 't2200-reading': true } }));
  check((await t.page.$$('.daywheel .dw-light.lit')).length === 3 && (await t.page.$$('.daywheel .dw-emb.done')).length === 3, 'a finished day lights every light and fills every emblem');
  await t.ctx.close();
  t = await open('2026-10-07', '12:00', SEED); await t.page.click('.day-nav .nav[data-d="1"]');
  check(!(await t.page.$('.daywheel .dw-handg')) && !(await t.page.$('.daywheel.live')), 'another day\u2019s dial has no hand and is not live');
  await t.ctx.close();
  // v4.92: the firmament of the block
  t = await open('2026-10-01', '12:00', Object.assign({}, SEED, { 'runlog-2026-09-13': { sec: 7400, hr: 148, km: 19 }, 'runlog-2026-09-06': { sec: 7000, hr: 147, km: 18 } }), 'plan');
  const fm = await t.page.evaluate(() => { const q = (s) => document.querySelectorAll('.sky ' + s).length;
    return { moons: q('.sk-mo'), stars: q('.sk-star'), long: q('.sk-star.long'), spikes: q('.sk-spike'), lines: q('.sk-line'), veil: q('.sk-veil'), field: q('.sk-f'), way: q('.sk-wd'), ahead: q('.sk-ahead') }; });
  check(fm.moons === 30 && fm.field >= 100 && fm.way >= 200, 'the sky carries a moon for every week and a Milky Way of its own stars: ' + JSON.stringify(fm));
  check(fm.long >= 2 && fm.spikes >= fm.long && fm.lines >= 1, 'the long runs shine with diffraction spikes and are joined as a constellation');
  check(fm.veil === 1 && fm.ahead > 0, 'the future beyond NOW is veiled, its planned runs faint');
  noErrors(t, 'firmament');
  await t.ctx.close();
  // v4.93: the sheet opens and closes cleanly
  t = await open('2026-10-01', '12:00', SEED);
  await t.page.click('[data-nav="more"]');
  check(!(await t.page.$eval('#sheet-backdrop', (n) => n.classList.contains('hidden'))), 'the More sheet opens');
  await t.page.click('.sheet-cancel'); await t.page.waitForTimeout(320);
  check(await t.page.$eval('#sheet-backdrop', (n) => n.classList.contains('hidden') && !n.classList.contains('closing')), 'the More sheet closes fully after its animation');
  noErrors(t, 'sheet motion');
  await t.ctx.close();
  // v4.86: the journey's week explorer, the pace spectrum, the week in hours
  t = await open('2026-10-01', '12:00', SEED, 'plan');
  const jd = await t.page.$$eval('.journey-days button', (ns) => ns.map((n) => n.className));
  check(jd.length === 7 && jd.filter((c) => /jd-hard/.test(c)).length === 1 && jd.filter((c) => /jd-long/.test(c)).length === 1 && jd.some((c) => /jd-rest/.test(c)),
    'the journey’s week explorer lights the hard day red, the long run white, and rests the rest: ' + jd.join(' | '));
  check((await t.page.$$('.journey-days .jd-emb svg')).length + (await t.page.$$('.journey-days .jd-moon')).length === 7, 'every explorer day carries an emblem or the night’s moon');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'ref');
  check(!!(await t.page.$('#ref-paces .pace-spectrum .ps-easy')) && !!(await t.page.$('#ref-paces .pace-spectrum .ps-mp')) && /easy → MP/.test(await text(t.page, '#ref-paces .pace-spectrum')),
    'the paces sit on one line, easy to threshold, with the gap to marathon pace measured');
  const wh = await t.page.$$eval('.week-hours .wh-sleep', (ns) => ns.length);
  check(wh >= 7 && (await t.page.$$('.week-hours .wh-d.now')).length === 1 && /sleep \d+(\.5)?h/.test(await text(t.page, '.week-hours .wh-legend')),
    'this week, hour by hour: seven days of blocks, nights dark, today marked, the hours totalled');
  noErrors(t, 'v4.86 figures');
  await t.ctx.close();
  t = await open('2026-12-25', '12:00', SEED);
  check((await text(t.page, '.daywheel .dw-count')) === 'REST' && !/0\/0/.test(await text(t.page, '.daywheel')), 'a day with nothing to tick reads REST, not 0/0');
  await t.ctx.close();
  t = await open('2026-11-11', '12:00', SEED, 'week');
  check((await t.page.$$('.weeklight .wl-col')).length === 7 && (await t.page.$$('.weeklight .wl-moon')).length === 7 &&
    (await t.page.$$('.weeklight .wl-run')).length === (await t.page.$$('.profile-day:not(.rest)')).length, 'the light of the week: seven skies, seven moons, every run placed');
  check(/^Sunset 16:\d\d on Monday, 16:\d\d by Sunday · \d of \d runs finish after sunset$/.test(await text(t.page, '.weeklight .wl-line')),
    'the week says how its light is changing: ' + await text(t.page, '.weeklight .wl-line'));
  check(!!(await t.page.$('.weeklight .wl-frame.today')) && !!(await t.page.$('.weeklight .wl-now')), 'today\u2019s column is ringed, with now on it');
  noErrors(t, 'week light');
  await t.ctx.close();
  t = await open('2026-10-27', '17:00', SEED);
  check(/^Sunset 16:4\d\s· starts in the dusk, dark by km\s\d/.test(await text(t.page, '.hero .runsky .rs-line')),
    'after the clocks change the run starts in the dusk: ' + await text(t.page, '.hero .runsky .rs-line'));
  check(!!(await t.page.$('.nownext.sky-twi .nn-sky.twi')), 'in the twilight the Now card shows the sun on the horizon');
  await t.ctx.close();
  t = await open('2026-09-29', '12:00', SEED, 'ref');
  check(/^Sunrise 06:5\d\s· starts in the twilight, sun up by km\s2\s· Nicosia time$/.test(await text(t.page, '.race-card .rs-line')),
    'the race card shows race morning against its sunrise, in Nicosia time');
  noErrors(t, 'race card sky');
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
  // v4.74–75: feasts, the rose window, the seal, red-letter days, the race-morning sky
  t = await open('2026-10-07', '12:00', SEED);
  check(!(await t.page.$('.hodie')), 'an ordinary day carries no feast line');
  await t.ctx.close();
  t = await open('2027-01-20', '12:00', SEED);
  check(/Red-letter day · St Sebastian/.test(await text(t.page, '.hodie .feast')), 'race-week Wednesday: St Sebastian, in English');
  await t.ctx.close();
  t = await open('2027-01-24', '05:30', SEED);
  check(/sunrise 06:5\d .* Nicosia time/.test(await text(t.page, '.dw-sunline')), 'race morning is drawn in Nicosia time, sunrise just after the gun');
  check(!(await t.page.$('.hero .h-rhr')), 'race morning does not ask for a resting HR');
  check(/sun up by km\s2/.test(await text(t.page, '.hero .runsky .rs-line')) && !!(await t.page.$('.hero .runsky .rs-moon')),
    'race morning: the gun in the twilight under the waning moon, the sun up in km 2');
  check(!!(await t.page.$('.nownext.sky-night .nn-sky.night .g-moon')) && (await t.page.$$('.nownext .nn-stars circle')).length >= 10,
    'before dawn the Now card is night: the moon and stars');
  await t.ctx.close();
  t = await open('2026-09-21', '12:00', SEED);
  check(!(await t.page.$('.previously .seal')), 'a week with a missed run is not sealed');
  await t.ctx.close();
  t = await open('2026-09-21', '12:00', Object.assign({}, SEED, { 'runlog-2026-09-16': { sec: 2300, hr: 160, km: 7 } }));
  check(!!(await t.page.$('.previously .seal')) && /sealed/.test(await t.page.getAttribute('.previously .seal', 'aria-label')), 'a week with every run done is sealed');
  await t.ctx.close();
  t = await open('2026-10-24', '07:00', SEED);
  check(/red-letter/.test(await t.page.getAttribute('.hero', 'class')) && /RED-LETTER DAY/.test(await text(t.page, '.hero .h-tag')), 'the parkrun is a red-letter day');
  await t.ctx.close();
  t = await open('2026-09-20', '20:00', SEED);
  await t.page.click('.recap-share');
  await t.page.waitForSelector('.card-ov[open] img', { timeout: 5000 });
  check(((await t.page.getAttribute('.card-ov img', 'src')) || '').length > 50000, 'run poster renders on the device');
  noErrors(t, 'poster');
  await t.ctx.close();
  // v4.95: audit polish
  t = await open('2026-10-01', '17:40', SEED);
  const gaps = await t.page.$$eval('.daywheel .dw-emb circle', (cs) => {
    const p = cs.map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')]), out = [];
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) out.push(Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]));
    return out;
  });
  check(gaps.length >= 3 && Math.min(...gaps) >= 19, 'back-to-back sessions keep their roundels apart on the clock: min ' + Math.min(...gaps).toFixed(1));
  const rows = await t.page.$$eval('.tl-quiet', (ns) => ns.map((n) => ({ h: n.getBoundingClientRect().height, d: !!n.querySelector('.anchor-detail') })));
  const hd = rows.filter((r) => r.d).map((r) => r.h), hp = rows.filter((r) => !r.d).map((r) => r.h);
  check(hd.length && hp.length && Math.max(...hd) - Math.min(...hp) <= 2, 'a quiet row with a disclosure is no taller than one without: ' + hd.join(',') + ' vs ' + hp.join(','));
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'ref');
  const xs = await t.page.$$eval('.ref-fold > summary h2', (ns) => ns.map((n) => Math.round(n.getBoundingClientRect().left)));
  check(xs.length >= 10 && new Set(xs).size === 1, 'Reference’s chapter titles share one left edge: ' + [...new Set(xs)].join(','));
  await t.ctx.close();
  // v4.96: typography — separators stay with the word before, items hold together
  t = await open('2026-10-05', '15:30', SEED);
  const gt = await t.page.$eval('.tl-card .c-title', (n) => n.textContent).catch(() => '');
  check(/Gym — Legs microdose · Pull · Core/.test(gt), 'a title’s separators are glued to the word before: ' + JSON.stringify(gt));
  check(await t.page.$eval('.tl-card .c-title', (n) => getComputedStyle(n).textWrap === 'balance' || getComputedStyle(n).textWrapStyle === 'balance'), 'card titles wrap in balanced lines');
  await t.ctx.close();
  t = await open('2026-10-02', '12:00', SEED, 'week');
  check(/Basketball 1v1 \+ shooting/.test(await text(t.page, '.wk-day.today .d-extras .xb:last-child')), 'a week card’s extras hold together item by item');
  check(/5×3 min @ threshold/.test(await t.page.$eval('.wk-day:nth-of-type(3) .d-run', (n) => n.textContent)), 'a number keeps its unit and @ keeps its object');
  // v4.97: last week's shortfall is one line above the days, its reasoning behind Why
  const jump = await t.page.$eval('.wk-jump', (n) => ({ tag: n.tagName, open: n.open, sum: n.querySelector('summary').textContent }));
  check(jump.tag === 'DETAILS' && !jump.open && /^Week 13 recorded 17 of 35 km \(49%\) · this week plans 42, 2\.5× thatWhy$/.test(jump.sum.replace(/\s+/g, ' ')),
    'the load-jump note is a closed one-liner: ' + jump.sum);
  await t.page.click('.wk-jump summary'); await t.page.click('.wk-day.today');
  await t.page.click('[data-nav="week"]');
  check(await t.page.$eval('.wk-jump', (n) => n.open), 'its Why stays open across a re-render');
  await t.ctx.close();
  // v4.98: the Training log's runs are a ledger, one ruled line each
  t = await open('2026-10-01', '12:00', SEED, 'ref');
  const lg = await t.page.$$eval('#ref-log .ledger tbody tr', (rs) => rs.map((r) => ({ c: r.className, cells: r.children.length, mark: !!r.querySelector('.lg-mark svg') })));
  check(lg.length === 6 && lg.every((r) => r.cells === 5 && r.mark) && lg.filter((r) => r.c === 'lg-long').length === 1,
    'recent runs sit in a five-column ledger, each marked by class: ' + lg.map((r) => r.c).join(' '));
  check(/^RUN ?KM ?PACE ?HR ?EF$/i.test((await text(t.page, '#ref-log .ledger thead')).trim()), 'the ledger is headed Run · km · Pace · HR · EF');
  check(!(await t.page.$('.run-entry')), 'the old stacked run cards are gone');
  await t.page.evaluate(() => document.querySelectorAll('details.ref-fold').forEach((d) => { d.open = true; }));
  const inits = await t.page.$$eval('.ref-card + .ref-note:not(.no-init), .shoe-plates + .ref-note:not(.no-init)', (ns) =>
    ns.map((n) => { const f = n.firstChild; return f && f.nodeType === 3 ? f.textContent.trim().slice(0, 12) : '<' + (f && f.nodeName) + '>'; }));
  const bad = inits.filter((x) => !/^[A-Z][a-z]/.test(x));
  check(inits.length >= 3 && bad.length === 0, 'an illuminated initial only ever opens a word, never a label or an abbreviation: ' + inits.join(' | '));
  await t.ctx.close();
  // v5.0: the three-tier leg rule as a choice on Monday's session
  t = await open('2026-10-05', '16:35', SEED);
  await t.page.click('.tl-card .session-focus-open');
  const tiers = await t.page.$$eval('.session-focus .dose-opt input', (ns) => ns.map((n) => n.value + (n.checked ? '*' : '')));
  check(tiers.join(',') === 'full*,half,skip', 'Monday offers Normal · Halve · Upper only, Normal chosen: ' + tiers.join(','));
  await t.page.click('.dose-opt.d-half');
  const ovrH = await t.json('ovr-2026-10-05');
  check(Object.values(ovrH.legs || {})[0] === 'half' && /^1 × 5–6/.test(await text(t.page, '.session-focus .focus-sets')), 'Halve is stored for the date and takes the leg press to one set');
  await t.page.click('.dose-opt.d-skip');
  check(/^EXERCISE 1 \/ 6$/.test(await text(t.page, '.session-focus .focus-eyebrow')) && /Pull-ups/.test(await text(t.page, '.session-focus .focus-ex-name')),
    'Upper only leaves six exercises, starting with pull-ups');
  await t.page.click('.focus-close'); await t.page.waitForTimeout(100);
  check(/upper only/.test(await text(t.page, '.tl-card .session-plan summary')) && (await t.page.$$('.tl-card .c-plan .xr.drop')).length === 4,
    'the card says upper only and marks the four leg movements not today');
  await t.page.click('.tl-card .session-focus-open'); await t.page.click('.dose-opt.d-full');
  check(!Object.keys((await t.json('ovr-2026-10-05')).legs || {}).length, 'Normal clears the choice');
  noErrors(t, 'leg dose');
  await t.ctx.close();
  t = await open('2026-11-30', '16:35', SEED);
  await t.page.click('.tl-card .session-focus-open');
  check((await t.page.$$eval('.session-focus .dose-opt input', (ns) => ns.map((n) => n.value))).join(',') === 'full,skip', 'maintenance legs (one set already) offer Normal · Upper only');
  await t.ctx.close();
  t = await open('2026-10-07', '19:35', SEED);
  await t.page.click('.tl-card:has-text("Push") .session-focus-open');
  check(!(await t.page.$('.session-focus .dose')), 'a session without leg work has no dose to choose');
  await t.ctx.close();
  // v5.0.4: the journey opens on facts, not a sentiment
  t = await open('2026-10-01', '12:00', SEED, 'plan');
  const story = await text(t.page, '.journey-story');
  check(/^\d+ weeks? running · longest 21 km · last 4 weeks [\d.]+ of [\d.]+ km a week$/.test(story.trim()) && !/leaves a mark/.test(story), 'the journey says weeks run, longest, and the last four weeks against plan: ' + story);
  await t.ctx.close();
  // v5.0.3: after lights out and before the day starts, Now says night
  t = await open('2026-10-01', '23:30', SEED);
  check(/^Night$/.test((await text(t.page, '.nownext .nn-title')).trim()) && /Sleep · up at 07:00/.test(await text(t.page, '.nownext .nn-time')) &&
    !/Nothing else scheduled/.test(await text(t.page, '.nownext')), 'late evening reads Night, up at Friday’s 07:00');
  await t.ctx.close();
  t = await open('2026-10-02', '00:40', SEED);
  check(/Sleep · up at 07:00/.test(await text(t.page, '.nownext .nn-time')) && /Wake/.test(await text(t.page, '.nownext .nn-next')), 'small hours read Night, next the wake-up');
  await t.ctx.close();
  // v5.0.2: the recap reads plainly and editing is secondary
  t = await open('2026-09-24', '20:00', SEED);
  check(!/logged distance/.test(await text(t.page, '.recap-subtitle')) && /Your log so far/.test(await text(t.page, '.recap-total')), 'the recap says what it means: ' + await text(t.page, '.recap-total'));
  check(await t.page.$eval('.hero.has-recap .runlogger > .h-log.logged', (n) => getComputedStyle(n).backgroundColor === 'rgba(0, 0, 0, 0)'), 'Edit run is an outline once the run is in');
  await t.ctx.close();
  // v5.0.1: the log form asks for gels and the half split only on long runs
  t = await open('2026-10-01', '18:10', SEED);
  await t.page.click('button.h-log'); await t.page.click('.log-extra > summary');
  const vis = async () => t.page.evaluate(() => ({ gels: !!document.querySelector('[data-log-field="gels"]').offsetParent, half: !!(document.querySelector('[data-log-field="hr2"]') || {}).offsetParent }));
  let v = await vis();
  check(!v.gels && !v.half, 'an easy run is not asked for gels or a half-by-half split');
  await t.page.selectOption('.log-class', 'long'); v = await vis();
  check(v.gels && v.half, 'choosing Long brings both back');
  await t.page.selectOption('.log-class', 'race'); v = await vis();
  check(v.gels && !v.half, 'a race asks for gels, not decoupling');
  await t.ctx.close();
  // v4.99: an overdue backup gets one quiet line at the foot of the Week
  t = await open('2026-10-01', '12:00', SEED, 'week');
  check(!(await t.page.$('.bk-nudge')), 'no backup nudge while there is little to lose');
  await t.ctx.close();
  const many = Object.assign({}, SEED, { 'done-2026-09-21': { a: true }, 'done-2026-09-22': { a: true }, 'done-2026-09-23': { a: true }, 'done-2026-09-24': { a: true } });
  t = await open('2026-10-01', '12:00', many, 'week');
  check(/Never backed up\. This phone holds the only copy of 11 entries/.test(await text(t.page, '.bk-nudge')), 'an unbacked phone is told what it holds: ' + await text(t.page, '.bk-nudge'));
  await t.page.click('.bk-nudge button'); await t.page.waitForTimeout(250);
  const copied = await t.page.evaluate(() => ({ at: localStorage.getItem('backup-at'), done: !!document.querySelector('.bk-nudge.done'),
    box: (document.querySelector('#ref-data .data-box:not(.hidden)') || {}).value || '' }));
  check(copied.at === '2026-10-01' && (copied.done || /"app":"week-os"/.test(copied.box)), 'Copy backup copies (or falls back to the Data chapter’s text box) and records the date');
  noErrors(t, 'backup nudge');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', Object.assign({}, many, { 'backup-at': '2026-09-28' }), 'week');
  check(!(await t.page.$('.bk-nudge')), 'a recent backup quiets the nudge');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'plan');
  check(!/data\/plan\.js/.test(await text(t.page, '#view')) && !!(await t.page.$('.journey-all .journey-coda')), 'the Plan’s coda sits with the recovery rows and names no file');
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
