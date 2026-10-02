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
const RELEASE = { ver: null, mark: null };
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
      /* the update check deploys a "new release" by rewriting the service
         worker's version and marking app.js; HTTP caching is on, as on Pages */
      if (RELEASE.ver && (safe === 'sw.js' || safe === 'js/app.js')) {
        let body = fs.readFileSync(file, 'utf8');
        if (safe === 'sw.js') body = body.replace(/const CACHE_VERSION = '[^']+'/, "const CACHE_VERSION = '" + RELEASE.ver + "'");
        else body += '\n;window.__build = ' + JSON.stringify(RELEASE.mark) + ';';
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)], 'Cache-Control': 'max-age=600' }); return res.end(body);
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
  const [Y, M, D] = iso.split('-').map(Number), [h, m, sec] = hhmm.split(':').map(Number);
  const naive = Date.UTC(Y, M - 1, D, h, m, sec || 0);
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
    /* window.__skew lets a check move the clock on (time away from the app) */
    const Real = Date;
    window.__skew = epoch - Real.now();
    function Fake(...a) {
      if (!new.target) return new Real(Real.now() + window.__skew).toString();
      return a.length === 0 ? new Real(Real.now() + window.__skew) : new Real(...a);
    }
    Fake.prototype = Real.prototype; Fake.now = () => Real.now() + window.__skew; Fake.parse = Real.parse; Fake.UTC = Real.UTC;
    window.Date = Fake;
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    window.__away = (ms) => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.__skew += ms; hidden = false; document.dispatchEvent(new Event('visibilitychange')); };
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
  check(await text(t.page, '.hero .h-missed p') === 'Did it happen?' && /Window passed · not recorded/.test(await text(t.page, '.hero .h-state')),
    'v5.11.3: the state line says the window passed; the question does not say it again');
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
  check(await t.page.evaluate(() => { const r = document.querySelector('.hero .h-acts'); if (!r) return false; const [a, b] = r.children;
    return r.children.length === 2 && a.matches('.session-focus-open') && b.matches('.h-log') && Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) < 1; }),
    'before the log, Focus and Log stand side by side at the card’s foot');
  await t.page.click('.runlogger .h-log');
  check(!!(await t.page.$('.runlogger > .h-log.form')) && !(await t.page.$('.h-acts .h-log.form')), 'the log form opens full width, never inside the action row');
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
  check(!(await t.page.$('.bb')), 'one countdown: no Today numeral 112 days out — the top bar carries it');
  check(/16w 0d/.test(await text(t.page, '#hdr-count')), 'the top bar keeps the countdown');
  check(/light-long/.test(await t.page.getAttribute('.day-head', 'class')) && /cls-long/.test(await t.page.getAttribute('.hero', 'class')), 'long run lights the head and the card white');
  check(!(await t.page.$('.titlecard')), 'no title card in a browser tab');
  await t.ctx.close();
  t = await open('2026-12-27', '12:00', SEED);
  check((await text(t.page, '.bb-num')) === '28' && !!(await t.page.$('.bb .bb-wreath')), 'the numeral stands over the wreath from 28 days out');
  check((await t.page.getAttribute('.bb', 'aria-hidden')) === 'true', 'billboard is decorative');
  check(await t.page.evaluate(() => { const a = document.querySelector('.day-head h1').getBoundingClientRect(), b = document.querySelector('.day-head .bb').getBoundingClientRect(), c = document.querySelector('.day-head .sub').getBoundingClientRect();
    const hit = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom; return !hit(a, b) && !hit(c, b); }), 'the countdown numeral touches neither the date nor the chips');
  await t.ctx.close();
  t = await open('2026-10-01', '07:20', SEED);
  check(/^\+ This morning’s resting HR/.test(await text(t.page, '.hero .h-rhr.add.mini.am')), 'before noon the resting-HR prompt is a pill, never a card in the run’s hierarchy');
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
  const contents = await t.page.$$eval('.ref-book > .ref-fold > summary', (ns) => ns.map((n) => n.textContent.replace(/\s+/g, '')));
  check(contents.length === (await t.page.$$('.ref-fold')).length && contents.length >= 10 && /^IPaces\+$/.test(contents[0]) && /^XII/.test(contents[11] || ''),
    'Reference opens on a contents page, one numbered entry per chapter: ' + contents[0]);
  check(!(await t.page.$('.ref-index')) && /^Contents$/.test(await text(t.page, '.ref-book > .rc-h')), 'one list of chapters, headed Contents — no second copy above it');
  await t.page.click('#ref-fuel > summary');
  check(await t.page.$eval('#ref-fuel', (n) => n.open) && /^VIII$/.test(await text(t.page, '#ref-fuel > summary .chap')), 'a contents entry opens its numbered chapter');
  await t.page.click('#ref-fuel .ref-back');
  check(await t.page.evaluate(() => Math.abs(document.getElementById('ref-contents').getBoundingClientRect().top) < 140), 'a chapter’s "↑ Contents" returns to the contents page');
  const nativeMarks = async (pg) => pg.evaluate(() => [...document.querySelectorAll('details > summary')].filter((s) => {
    const cs = getComputedStyle(s); return cs.display === 'list-item' && cs.listStyleType !== 'none'; }).map((s) => s.parentElement.className));
  const marks = [...await nativeMarks(t.page)];
  for (const v of ['plan', 'week']) { if (v === 'plan') { await t.page.click('[data-nav="more"]'); await t.page.click('.sheet-item[data-nav="plan"]'); } else await t.page.click('[data-nav="week"]');
    await t.page.waitForTimeout(150); marks.push(...await nativeMarks(t.page)); }
  check(!marks.length, 'every fold opens on the one "+" mark, none on the browser’s ▶: ' + marks.join(', '));
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
  check(!!(await t.page.$('.ref-book')), 'the Reference plate still opens Reference');
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
  check(/^\+ Morning resting HR/.test(await text(t.page, '.hero .h-rhr.add')), 'after noon the pill asks for the morning’s reading by name');
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
  check(!!(await t.page.$('.journey.line .journey-link')) && !(await t.page.$('.journey h2')) && /weeks · .* km · \d+ runs recorded/.test(await text(t.page, '.journey.line')), 'the block\u2019s totals are one line');
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
  check(/km 1–18 easy · km 19–24 at MP 5:20/.test(await text(t.page, '.session-focus .sess-shape figcaption')) && /^Easy Z2.*MP Z3/.test((await t.page.$$eval('.session-focus .focus-hr strong', (ns) => ns.map((n) => n.textContent.replace(/\s+/g, ' ')))).join(' ')),
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
  // v5.7: Focus opens with its emblem drawn by the pen, stroke by stroke
  t = await open('2026-10-04', '07:45', SEED);
  await t.page.click('.hero .session-focus-open');
  const ink = await t.page.$$eval('.session-focus .focus-emb.ink .emb path', (ns) => ns.map((n) => n.getAttribute('pathLength') + n.getAttribute('style')));
  check(ink.length === 3 && ink.every((x, k) => x === '1--p:' + k), 'each stroke of the emblem is numbered for the pen: ' + ink.join(' | '));
  await t.ctx.close();
  // v5.8.3: a session moved in keeps its hours and its place in the day
  t = await open('2026-10-01', '12:00', SEED);
  await t.page.click('.day-nav [data-d="-1"]');
  await t.page.click('.tl-card:has-text("Push") .more-btn'); await t.page.click('[data-act="movepick"]'); await t.page.click('[data-move-to="2026-10-01"]');
  await t.page.click('.day-nav [data-d="1"]');
  const order = await t.page.$$eval('.tl > *', (ns) => ns.map((n) => (n.querySelector('.c-time, .t') || {}).textContent || '').filter(Boolean).map((x) => x.slice(0, 5)));
  const pi = order.indexOf('19:30');
  check(pi > 0 && order.slice(0, pi).every((x) => x <= '19:30') && /^19:30–20:20/.test(await text(t.page, '.tl-card:has-text("Push") .c-time')),
    'the moved Push sits at 19:30 in the day\u2019s order, not at the head of the timeline: ' + order.join(' '));
  check((await t.page.$$('.daywheel .dw-emb')).length === 4 && /\/4/.test(await text(t.page, '.daywheel .dw-count')), 'the clock counts the moved session among the day\u2019s four');
  noErrors(t, 'moved in order');
  await t.ctx.close();
  // v5.8.1: narrow screens, and the Kalendar's light at a solstice
  t = await open('2026-10-04', '07:45', SEED);
  await t.page.setViewportSize({ width: 320, height: 700 }); await t.page.waitForTimeout(150);
  const clip = await t.page.$$eval('.hero .h-meta > span', (ns) => ns.filter((n) => n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > document.documentElement.clientWidth).length);
  check(clip === 0, 'at 320px the run card\u2019s ruled line wraps instead of clipping its figures');
  await t.ctx.close();
  t = await open('2026-12-01', '12:00', SEED);
  await t.page.click('[data-nav="more"]'); await t.page.click('.sheet-item[data-nav="kal"]');
  check(/shortest day the 21st, 7h\s\d\dm/.test(await text(t.page, '.kl-light')), 'December names the shortest day: ' + await text(t.page, '.kl-light'));
  await t.page.click('.kl-head .nav[data-m="1"]');
  check(/days lengthen by (\d+h\s\d\dm|\d+\smin)$/.test(await text(t.page, '.kl-light')), 'January says the days lengthen');
  await t.ctx.close();
  // v5.8: the countdown wreath — a candle each Sunday for four, the red one at the gun
  const wreath = async (date, time) => { const tt = await open(date, time, SEED);
    const r = await tt.page.evaluate(() => { const w = document.querySelector('.day-head .bb-wreath'); return w && { on: w.querySelectorAll('.wr-candle.on:not(.centre)').length, centre: !!w.querySelector('.wr-candle.centre.on') }; });
    await tt.ctx.close(); return r; };
  const w0 = await wreath('2026-12-26', '12:00'), w1 = await wreath('2026-12-27', '12:00'), w3 = await wreath('2027-01-12', '12:00'),
    w4 = await wreath('2027-01-24', '06:00'), w5 = await wreath('2027-01-24', '07:30');
  check(w0 === null && w1.on === 1 && w3.on === 3 && !w3.centre, 'the wreath appears on the first of the four Sundays and lights a candle each Sunday: ' + JSON.stringify([w0, w1, w3]));
  check(w4.on === 4 && !w4.centre && w5.centre, 'on race morning the red centre candle is lit at the gun');
  // v5.7: the gel candle burns down through the run
  const candle = async (time) => { const tt = await open('2026-10-04', time, SEED); await tt.page.click('.hero .session-focus-open');
    const r = await tt.page.evaluate(() => { const c = document.querySelector('.session-focus .gel-candle');
      return { cls: c.getAttribute('class'), past: c.querySelectorAll('.gc-ring.past').length, next: (c.querySelector('.gc-ring.next') || {}).dataset ? c.querySelector('.gc-ring.next').dataset.k : null,
        line: document.querySelector('.session-focus .gc-next').textContent, spent: Number(c.querySelector('.gc-spent').getAttribute('height')) }; });
    await tt.ctx.close(); return r; };
  const cb = await candle('08:00'), cd = await candle('09:52'), ca = await candle('11:30');
  check(/before/.test(cb.cls) && cb.past === 0 && cb.spent <= 1, 'before the run the candle stands whole and unlit');
  check(/during/.test(cd.cls) && cd.past === 2 && cd.next === '2' && cd.line === 'Gel III in 23 min' && cd.spent > 50, 'mid-run it has burnt past two rings and names the next gel: ' + JSON.stringify(cd));
  check(/after/.test(ca.cls) && ca.past === 4 && ca.line === '', 'after the run it is burnt down');
  // v5.6: the seal is stamped onto the run card the moment the week is sealed
  const wk12 = Object.assign({}, SEED, { 'runlog-2026-09-16': { sec: 2300, hr: 160, km: 7 } });
  delete wk12['runlog-2026-09-20'];
  t = await open('2026-09-20', '22:00', wk12);
  check(!(await t.page.$('.hero .seal')), 'no seal while the long run is outstanding');
  await t.page.click('[data-missed="done"]');
  check(!!(await t.page.$('.hero .seal.stamp')) && /Week 12 sealed/.test(await text(t.page, '.hero [role="status"].sr')), 'banking the long run seals the week and stamps the card');
  await t.page.click('.day-nav [data-d="-1"]'); await t.page.click('.day-nav [data-d="1"]');
  check(!(await t.page.$('.hero .seal.stamp')), 'the stamp is a moment, not a fixture: coming back, the card is clean');
  noErrors(t, 'seal stamp');
  await t.ctx.close();
  // v5.5: replay the block — the sky's arrival on a slow clock, counted beneath it
  t = await open('2026-10-01', '12:00', SEED, 'plan');
  await t.page.click('.sky .sk-play');
  await t.page.waitForTimeout(1500);
  const rp = await t.page.evaluate(() => { const f = document.querySelector('.sky'), st = f.querySelectorAll('.sk-star');
    const late = Array.from(st).find((s) => parseFloat(s.style.getPropertyValue('--t')) > 0.35);
    return { on: f.classList.contains('replay'), cap: f.querySelector('.sk-capt').textContent, lateName: late && getComputedStyle(late).animationName, nowf: f.style.getPropertyValue('--nowf') }; });
  check(rp.on && /^\d+ \w{3} · [\d.]+ km · \d+ runs$/.test(rp.cap) && rp.lateName === 'rp-pop' && Number(rp.nowf) > 0.3,
    'Replay re-runs the sky on its own keyframes and counts the block up beneath it: ' + JSON.stringify(rp));
  await t.page.waitForTimeout(6200);
  check(/^1 Oct · [\d.]+ km · \d+ runs$/.test(await text(t.page, '.sky .sk-capt')), 'the count ends on today');
  noErrors(t, 'replay');
  await t.ctx.close();
  // v5.4: the Kalendar — the month on one page
  t = await open('2026-10-01', '12:00', SEED);
  await t.page.click('[data-nav="more"]'); await t.page.click('.sheet-item[data-nav="kal"]');
  const kal = await t.page.evaluate(() => ({ rows: document.querySelectorAll('.kl-row').length, today: (document.querySelector('.kl-row.today .kl-d') || {}).textContent,
    red: Array.from(document.querySelectorAll('.kl-row.red')).map((r) => r.querySelector('.kl-d').textContent + ' ' + r.querySelector('.kl-n').textContent),
    moons: document.querySelectorAll('.kl-m svg').length, quarters: document.querySelectorAll('.kl-tymp .kt-moon.q').length, arch: document.querySelectorAll('.kl-tymp .kt-moon').length,
    sign: (document.querySelector('.kt-sign.enter') || {}).textContent, light: (document.querySelector('.kl-light') || {}).textContent,
    rays: document.querySelectorAll('.kl-tymp .kt-ray').length, key: document.querySelectorAll('.kl-tymp .kt-key').length, hand: !!document.querySelector('.kl-tymp .kt-hand'),
    names: Array.from(document.querySelectorAll('.kl-row .kl-n')).slice(0, 7).map((n) => n.textContent.replace(/\u2060/g, '').replace(/\s+/g, ' ')), title: document.querySelector('.kl-title .sr').textContent }));
  check(kal.rows === 31 && kal.today === '1' && kal.title === 'October 2026' && /Scorpio/.test(kal.sign) && /^The sun enters Scorpio on the 23rd · /.test(kal.light), 'October on one page, today ringed, the sun entering Scorpio on the 23rd: ' + JSON.stringify(kal));
  check(kal.red.join() === '24 PARKRUN 5K PB' && kal.moons === 31 && kal.arch === 31 && kal.quarters >= 3 && kal.quarters <= 5, 'the parkrun is the month\u2019s red-letter day, and every night has its moon, the quarters marked on the arch');
  check(kal.rays === 22 && kal.key === 1 && kal.hand && kal.names.join('|') === 'Easy||Recovery|Long 22 — last 6 @ MP||Easy|Tempo 25 min', 'each run is a ray from the sun, the key day starred, the hand at today, and each day named: ' + kal.names.join('|'));
  await t.page.click('.kl-head .nav[data-m="-1"]');
  const sep = await t.page.evaluate(() => ({ rows: document.querySelectorAll('.kl-row').length, got: document.querySelectorAll('.kl-row.got').length, miss: document.querySelectorAll('.kl-row.miss').length,
    lit: document.querySelectorAll('.kl-tymp .kt-ray.got').length, dashed: document.querySelectorAll('.kl-tymp .kt-ray.miss').length, tally: document.querySelector('.kl-tally').textContent }));
  check(sep.rows === 30 && sep.got >= 5 && sep.lit === sep.got && sep.dashed === sep.miss && /km recorded · \d+ of \d+ runs$/.test(sep.tally), 'September shows what was banked against what was asked, in the rays and the rows alike: ' + JSON.stringify(sep));
  const wks = await t.page.$$eval('.kl-wk', (ns) => ns.map((n) => n.textContent));
  check(wks.length === 5 && /^Week X[\d.]+ of 38 km$/.test(wks[0]) && /^Week XIV/.test(wks[4]), 'each week of the month is ruled off with its number and km: ' + wks.join(' | '));
  await t.page.click('.kl-row[aria-label^="Sunday 20 September"]');
  check(/Sunday 20 Sep/.test(await text(t.page, '.day-head h1')), 'a day opens on a tap');
  await t.page.click('[data-nav="more"]'); await t.page.click('.sheet-item[data-nav="kal"]');
  for (let k = 0; k < 4; k++) await t.page.click('.kl-head .nav[data-m="-1"]');
  const seen = [];
  for (let k = 0; k < 9; k++) { seen.push(await t.page.$eval('.kl-title .sr', (n) => n.textContent)); await t.page.click('.kl-head .nav[data-m="1"]'); }
  check(seen[0] === 'June 2026' && seen[8] === 'February 2027', 'every month from June to February renders: ' + seen.join(', '));
  noErrors(t, 'kalendar');
  await t.ctx.close();
  // v5.3: the sundial behind the Now card — the shadow where the real sun puts it
  const dialAt = async (time) => { const tt = await open('2026-10-01', time, SEED);
    const r = await tt.page.evaluate(() => { const d = document.querySelector('.nownext .nn-dial'); if (!d) return null;
      const sh = d.querySelector('.nd-shadow'), m = (sh.getAttribute('transform') || '').match(/rotate\((-?[\d.]+)/);
      return { lit: d.classList.contains('sunlit'), ang: m ? Number(m[1]) : null, lines: d.querySelectorAll('.nd-nums text').length }; });
    await tt.ctx.close(); return r; };
  const am = await dialAt('08:30'), pm = await dialAt('16:55'), nt = await dialAt('21:30');
  check(am && am.lit && am.ang < -40 && pm.lit && pm.ang > 40 && am.lines === 3, 'morning shadow falls west, afternoon east: ' + JSON.stringify([am, pm]));
  check(nt && !nt.lit && nt.ang == null, 'after sunset the dial casts no shadow');
  // v5.9.3: in its own window the run is under way, not scheduled
  { const lv = await open('2026-10-01', '17:20', SEED);
    check((await text(lv.page, '.hero .h-state')) === 'Under way · until 17:43', 'during its window the run card says it is under way: ' + await text(lv.page, '.hero .h-state'));
    await lv.ctx.close(); }
  // v5.10.2: a run moved within its week is banked once, where it was done, in every view
  { const MV = { 'ovr-2026-09-29': { skip: {}, moved: { 't1710-run': '2026-10-02' } },
      'movein-2026-10-02': [{ id: 'mv-2026-09-29-t1710-run', srcId: 't1710-run', fromIso: '2026-09-29', title: 'Easy run', detail: '', cat: 'run', run: { km: 6, shoe: 'Ghost' }, start: '17:10', end: '17:50' }],
      'done-2026-09-30': { 't1710-run': true }, 'done-2026-10-01': { 't1710-run': true }, 'done-2026-10-03': { 't0830-run': true }, 'done-2026-10-04': { 't0830-run': true } };
    const mv = await open('2026-10-02', '17:30', MV);
    await mv.page.click('.hero .h-tick');
    await mv.page.click('[data-nav="week"]');
    const wkv = await mv.page.evaluate(() => ({ head: document.querySelector('.profile-head h2').textContent.replace(/\s+/g, ' '),
      tue: document.querySelector('.profile-day[data-date="2026-09-29"]').className, fri: document.querySelector('.profile-day[data-date="2026-10-02"]').className,
      friSt: document.querySelectorAll('.wk-day')[4].querySelector('.d-status').textContent }));
    /* 17 = Wed 6 + Thu 5 + the moved run 6; Saturday's and Sunday's ticks in
       the seed are dated after this "today" and are banked nowhere yet (v5.11.1) */
    check(/^17 \/ 42 km recorded$/.test(wkv.head) && /\boff\b/.test(wkv.tue) && !/miss/.test(wkv.tue) && /\blit\b/.test(wkv.fri) && /✓ 6 km · ticked/.test(wkv.friSt),
      'a moved run ticked on its new day is banked there: the week, the bars and the day card agree: ' + JSON.stringify(wkv));
    await mv.page.click('[data-nav="more"]'); await mv.page.click('.sheet-item[data-nav="kal"]');
    check(/\bgot\b/.test(await mv.page.$eval('.kl-row[aria-label^="Friday 2 October"]', (n) => n.className)) && /Easy · from Tue/.test(await text(mv.page, '.kl-row[aria-label^="Friday 2 October"] .kl-n')),
      'the Kalendar shows the moved run on the day it was run');
    await mv.ctx.close();
    /* the next Monday: the week is sealed and Previously counts five of five, no extra, no miss */
    const mon = await open('2026-10-05', '09:00', Object.assign({}, MV, { 'done-2026-10-02': { 'mv-2026-09-29-t1710-run': true } }));
    const pv = await text(mon.page, '.previously');
    check(/5 of 5 runs/.test(pv) && !/extra/.test(pv) && (await mon.page.$$('.previously .pv-day.miss')).length === 0, 'Previously counts the moved run as one of the week\u2019s runs: ' + pv.slice(0, 120));
    await mon.page.click('.pv-open');
    check(!!(await mon.page.$('.week-profile .seal')), 'a week whose moved run was done elsewhere in the week is still sealed');
    await mon.page.click('[data-nav="more"]'); await mon.page.click('.sheet-item[data-nav="plan"]');
    const wall = await mon.page.$$eval('.wall-grid .wl-col', (cols) => [cols[13].children[1].className, cols[13].children[4].className]);
    check(/drop/.test(wall[0]) && /ran easy/.test(wall[1]), 'the block wall reads the old day as moved and the new day as run: ' + wall.join(' | '));
    await mon.page.click('.journey-open');
    check(/^Week 15/.test(await text(mon.page, '#view h1')) && /week/i.test(await text(mon.page, '.tab.active')), 'Open week from the journey lands on that week');
    noErrors(mon, 'moved runs banked');
    await mon.ctx.close(); }
  // v5.10.2: the clock turns on the minute, and a refused save says so
  { const ck = await open('2026-10-01', '12:00:57', SEED);
    check((await text(ck.page, '.live-clock')) === '12:00', 'the clock opens on the minute it is');
    await ck.page.waitForTimeout(4500);
    check((await text(ck.page, '.live-clock')) === '12:01' && /NOW 12:01/.test(await text(ck.page, '.tl-now')), 'NOW turns over on the minute, not a minute after launch: ' + await text(ck.page, '.live-clock'));
    await ck.page.evaluate(() => { Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; });
    await ck.page.click('.tl-card:has-text("Read") .tick').catch(() => {});
    await ck.page.click('.hero .h-tick').catch(() => {});
    check(/refused to save/.test(await text(ck.page, '.store-warn')), 'a save the phone refuses is announced, not silently lost');
    await ck.ctx.close(); }
  // v5.10.2: coming back on a new day opens on that day's Today; a day turning in front of you moves nothing
  { const rt = await open('2026-10-01', '23:59', SEED);
    await rt.page.evaluate(() => { window.__skew += 90000; document.dispatchEvent(new Event('visibilitychange')); });
    check(/Friday 2 Oct/.test(await text(rt.page, '.day-head h1')), 'Today follows midnight while the app is open on today');
    await rt.page.click('.day-nav [data-d="-2"], .day-nav [data-d="-1"]'); await rt.page.click('.day-nav [data-d="-1"]');
    await rt.page.click('[data-nav="week"]');
    await rt.page.evaluate(() => window.__away(3 * 86400000));
    check(/Monday 5 Oct/.test(await text(rt.page, '.day-head h1')) && /today/i.test(await text(rt.page, '.tab.active')), 'back on a new day, the app opens on Today, not the page it was left on');
    noErrors(rt, 'return on a new day');
    await rt.ctx.close(); }
  // v5.2: the growing border — flowers for done sessions, buds for missed
  t = await open('2026-09-29', '22:40', Object.assign({}, SEED, { 'done-2026-09-29': { 't1930-study': true }, 'runlog-2026-09-29': { sec: 2665, hr: 145, km: 7.32 } }));
  const vn = await t.page.evaluate(() => { const v = document.querySelector('.tl > .vine'); return v && { flowers: v.querySelectorAll('.vn-flower').length, buds: v.querySelectorAll('.vn-bud').length, fin: !!v.querySelector('.vn-fin'), bloom: v.querySelectorAll('.bloom').length }; });
  check(vn && vn.flowers === 2 && vn.buds === 1 && !vn.fin && vn.bloom === 0, 'the vine flowers for the run and study, keeps a bud for the unticked read, no flourish yet: ' + JSON.stringify(vn));
  // v5.9: the vine is the spine — lit by the day, cut round every emblem, nothing drawn for what is still to come
  const vs = await t.page.evaluate(() => { const tl = document.querySelector('.tl'), v = tl.querySelector(':scope > .vine');
    const holes = v.querySelectorAll('mask circle, mask rect').length - 1, embs = tl.querySelectorAll('.c-emb, .q-emb, .tl-sunglyph').length;
    return { vined: tl.classList.contains('vined') && getComputedStyle(tl, '::before').display === 'none', lit: /url\(#vn\d+g\)/.test(v.getAttribute('style') || ''),
      masked: !!v.querySelector('g[mask] > .vn-stem'), holes, embs, leaves: v.querySelectorAll('.vn-leaf').length }; });
  check(vs.vined && vs.lit && vs.masked && vs.holes >= vs.embs + 2 && vs.leaves > 2, 'the vine replaces the spine, carries the day’s light and is cut round every emblem and rose: ' + JSON.stringify(vs));
  const ahead = await open('2026-09-29', '09:00', SEED);
  check((await ahead.page.$$('.tl > .vine .vn-bud, .tl > .vine .vn-flower, .tl > .vine .vn-twig')).length === 0 && !!(await ahead.page.$('.tl > .vine .vn-stem')), 'a morning with nothing done or missed draws the stem alone');
  await ahead.ctx.close();
  await t.page.click('.tl-card:has-text("Read") .tick');
  const vn2 = await t.page.evaluate(() => { const v = document.querySelector('.tl > .vine'); return { flowers: v.querySelectorAll('.vn-flower').length, bloom: v.querySelectorAll('.vn-flower.bloom').length, fin: !!v.querySelector('.vn-fin.new') }; });
  check(vn2.flowers === 3 && vn2.bloom === 1 && vn2.fin, 'ticking the last session opens its flower and ends the vine in a flourish: ' + JSON.stringify(vn2));
  await t.page.click('.day-nav [data-d="1"]'); await t.page.click('.day-nav [data-d="-1"]');
  check((await t.page.$$('.tl > .vine .vn-flower')).length === 3 && (await t.page.$$('.tl > .vine .bloom, .tl > .vine .vn-fin.new')).length === 0, 'coming back to the day shows the flowers open, without opening them again');
  noErrors(t, 'growing border');
  await t.ctx.close();
  // v5.1: the session as a stained-glass window — dark before, lit when done
  t = await open('2026-10-07', '17:50', SEED);
  check(!!(await t.page.$('.hero .sess-shape svg.sg')) && !(await t.page.$('.hero .sess-shape svg.sg.lit')) && (await t.page.$$('.hero .sg .sg-pane')).length >= 20,
    'before the run the window is glazed but dark');
  await t.page.click('.hero button.h-tick');
  check(!!(await t.page.$('.hero .sess-shape svg.sg.lit.lighting')), 'ticking the run done floods the window with light');
  await t.page.click('.tl-card .tick').catch(() => {});
  check(!(await t.page.$('.hero .sg.lighting')), 'the light floods in once, not on the next re-render');
  noErrors(t, 'stained glass');
  await t.ctx.close();
  t = await open('2026-09-30', '20:00', Object.assign({}, SEED, { 'runlog-2026-09-30': { sec: 2700, hr: 150, km: 7 } }));
  check(!!(await t.page.$('.run-recap .sess-shape svg.sg.lit')) && !(await t.page.$('.run-recap .sg.lighting')), 'a logged run\u2019s recap carries its window, lit');
  await t.ctx.close();
  // v5.0.11: Previously counts a run on an unplanned day
  t = await open('2026-09-28', '12:00', Object.assign({}, SEED, { 'runlog-2026-09-25': { sec: 1200, hr: 140, km: 3 } }));
  check(/\d of 5 runs \+ 1 extra ·/.test(await text(t.page, '.previously .pv-line')), 'an unplanned Friday run is counted as extra: ' + await text(t.page, '.previously .pv-line'));
  await t.ctx.close();
  // v5.0.10: Now and Next say how far the run is
  t = await open('2026-10-01', '16:55', SEED);
  check(/Easy run · 5\u00a0km/.test(await t.page.$eval('.nownext .nn-next', (n) => n.textContent)), 'Next names the run’s distance');
  await t.ctx.close();
  t = await open('2026-10-01', '17:20', SEED);
  check(/17:10–17:43 · 5\u00a0km · 23 min left/.test(await t.page.$eval('.nownext .nn-time', (n) => n.textContent)), 'Now, mid-run, reads window · distance · time left');
  await t.ctx.close();
  t = await open('2026-10-04', '08:20', SEED);
  check(!/km/.test(await t.page.$eval('.nownext .nn-next', (n) => n.textContent)), 'a title that already says 22 is not told again');
  await t.ctx.close();
  // v5.0.9: the Paces card — units small, "see below" a way there
  t = await open('2026-10-01', '12:00', SEED, 'ref');
  await t.page.evaluate(() => { document.getElementById('ref-paces').open = true; });
  check(/^5:20\/km$/.test((await text(t.page, '#ref-paces .pace-row.numeric .v')).trim()) && !!(await t.page.$('#ref-paces .pace-row.numeric .v small.u')), 'a pace reads 5:20 with its unit set small');
  await t.page.click('#ref-paces .ref-jump'); await t.page.waitForTimeout(150);
  check(await t.page.evaluate(() => { const d = document.getElementById('ref-easy-pace-by-phase'); return !!(d && d.open); }), '"Easy pace by phase ↓" opens that chapter');
  noErrors(t, 'paces card');
  await t.ctx.close();
  // v5.0.8: the load-jump note waits for last week to finish
  t = await open('2026-10-01', '12:00', SEED, 'week');
  await t.page.click('.wk-head .nav[data-d="7"]');
  check(/Week 15/.test(await text(t.page, '.wk-head h1')) && !(await t.page.$('.wk-jump')), 'next week, viewed mid-week, is not measured against an unfinished week');
  await t.ctx.close();
  // v5.0.6: the gel schedule is on the run card, in clock times
  t = await open('2026-10-04', '07:45', SEED);
  check((await text(t.page, '.hero .h-gels')).replace(/\s+/g, '') === 'GELS·4I09:05II09:40III10:15IV10:50', 'Sunday’s card lists four gels at their clock times: ' + await text(t.page, '.hero .h-gels'));
  await t.ctx.close();
  t = await open('2027-01-24', '05:10', SEED);
  check((await t.page.$$('.hero .h-gels .g-times i')).length === 9 && /IX\s*10:30/.test(await text(t.page, '.hero .h-gels')), 'race morning lists nine gels, the last at 10:30');
  await t.ctx.close();
  t = await open('2026-10-04', '07:45', SEED);
  await t.page.click('.hero .session-focus-open');
  check((await t.page.$$('.session-focus .focus-gels .g-times i')).length === 4, 'Focus carries the same four gel times');
  check(/Z3\u00a0\(\d+\u2060–\u2060\d+\)/.test((await t.page.$$eval('.session-focus .focus-hr strong', (ns) => ns.map((n) => n.textContent))).join(' ')), 'a zone and its range are joined so they never break apart');
  await t.ctx.close();
  // v5.0.5: an empty device mid-block says why and offers the restore
  t = await open('2026-10-01', '12:00', {}, 'week');
  check(/No history on this device/.test(await text(t.page, '.bk-nudge.restore')), 'an empty device explains its blank week');
  await t.page.click('.bk-nudge.restore button'); await t.page.waitForTimeout(200);
  check(await t.page.evaluate(() => { const d = document.getElementById('ref-data'); return !!(d && d.open && !d.querySelector('.data-box').classList.contains('hidden')); }),
    'Restore opens Reference → Data with the paste box ready');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'week');
  check(!(await t.page.$('.bk-nudge.restore')), 'a device with history is not asked to restore');
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
  check(await t.page.$eval('.hero.has-recap .runlogger .h-acts > .h-log.logged', (n) => getComputedStyle(n).backgroundColor === 'rgba(0, 0, 0, 0)'), 'Edit run is an outline once the run is in');
  check(await t.page.evaluate(() => { const h = document.querySelector('.hero.has-recap'); const list = h.querySelectorAll('.recap-list'); const acts = h.querySelector('.runlogger .h-acts');
    return list.length === 1 && [...list[0].children].every((n) => n.tagName === 'DETAILS') && list[0].children.length >= 2 && !!acts.querySelector('.recap-share') &&
      !h.querySelector(':scope > .recap-plan') && [...h.querySelectorAll('details > summary')].every((s) => getComputedStyle(s).listStyleType === 'none' || getComputedStyle(s).display !== 'list-item'); }),
    'a logged card reads as one ruled list of folds and one action row, every fold on the same mark');
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

/* v5.11.1: the layouts and states the app supports beyond the 390px design
   width — Display Zoom and the SE (320), Safari's aA page zoom (260), a
   turned phone (844×390), malformed or future-dated data. */
async function layouts() {
  console.log('· layouts: 320 / 260 / landscape, odd data');
  const noSideways = async (pg) => pg.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);
  for (const [w, h] of [[320, 568], [260, 562]]) {
    const t = await open('2026-10-01', '07:20', SEED);
    await t.page.setViewportSize({ width: w, height: h }); await t.page.waitForTimeout(150);
    const bad = [];
    if (!(await noSideways(t.page))) bad.push('today');
    const clear = await t.page.evaluate(() => { const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return !hit(r('.day-head h1'), r('.day-nav .nav[data-d="1"]')) && !hit(r('.day-head h1'), r('.day-nav .nav[data-d="-1"]')) && !hit(r('.nownext .nn-title'), r('.nownext .nn-jump')); });
    check(clear, w + 'px: the date and the Now title never run under ‹ › or ↓');
    await t.page.click('[data-nav="week"]'); await t.page.waitForTimeout(150);
    if (!(await noSideways(t.page))) bad.push('week');
    check(await t.page.evaluate(() => { const d = [...document.querySelectorAll('.profile-day')].map((x) => x.getBoundingClientRect()); return d.every((r, i) => i === 0 || r.left >= d[i - 1].right - 1); }),
      w + 'px: the profile’s seven days never overlap a neighbour');
    for (const v of ['plan', 'kal', 'ref']) {
      await t.page.click('[data-nav="more"]'); await t.page.waitForTimeout(250); await t.page.click('.sheet-item[data-nav="' + v + '"]'); await t.page.waitForTimeout(150);
      if (v === 'ref') await t.page.evaluate(() => document.querySelectorAll('.ref-fold').forEach((d) => { d.open = true; }));
      if (v === 'plan') await t.page.click('.journey-all > summary');
      if (!(await noSideways(t.page))) bad.push(v);
    }
    check(!bad.length, w + 'px: no view scrolls sideways (Today, Week, Plan with the archive open, Kalendar, Reference with every chapter open) ' + bad.join(' '));
    await t.ctx.close();
  }
  let t = await open('2027-01-23', '20:30', SEED);
  await t.page.setViewportSize({ width: 320, height: 568 }); await t.page.waitForTimeout(150);
  check(await t.page.evaluate(() => [...document.querySelectorAll('.tl-sun span')].every((s) => s.scrollWidth <= s.clientWidth + 1 && getComputedStyle(s).textOverflow !== 'ellipsis')),
    'the sun’s line wraps at 320px rather than cutting "· Nicosia time"');
  const tm = await text(t.page, '.nn-tmrw');
  check((tm.match(/42\.2/g) || []).length === 1 && /Pro 4/.test(tm), 'race eve: tomorrow’s line names the distance once: ' + tm);
  await t.ctx.close();
  t = await open('2026-10-03', '21:30', SEED);
  const tl = await text(t.page, '.nn-tmrw');
  check((tl.match(/\b22\b/g) || []).length === 1 && /Evo SL/.test(tl), 'Saturday night: "Long 22 — last 6 @ MP" is not given its 22 km twice: ' + tl);
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'plan');
  await t.page.click('.journey-all > summary');
  check(await t.page.evaluate(() => [...document.querySelectorAll('.plan-row .p-sess')].every((s) => s.scrollWidth <= s.clientWidth + 1)), 'the 30-week archive shows every session in full');
  await t.ctx.close();
  t = await open('2026-10-05', '16:45', SEED);
  check(await t.page.evaluate(() => { const s = document.querySelector('.c-sess .session-plan > summary').getBoundingClientRect(), b = document.querySelector('.c-sess .session-focus-open').getBoundingClientRect(); return s.right <= b.left + 1; }),
    'the gym card’s list and its Focus button never share a tap');
  // landscape: the session keeps a usable window between Focus's header and footer
  await t.page.setViewportSize({ width: 844, height: 390 }); await t.page.waitForTimeout(150);
  await t.page.click('.tl-card .session-focus-open'); await t.page.waitForTimeout(300);
  check(await t.page.evaluate(() => document.querySelector('.focus-scroll').getBoundingClientRect().height >= 200), 'turned to landscape, Focus leaves the session at least 200px');
  await t.page.click('.focus-close');
  // the notch: safe-area insets reach every bar (wired through --sal/--sar; the real insets need a device)
  check(await t.page.evaluate(() => { document.documentElement.style.setProperty('--sal', '47px'); document.documentElement.style.setProperty('--sar', '47px');
    const px = (s, p) => parseFloat(getComputedStyle(document.querySelector(s))[p]);
    return px('.topbar', 'paddingLeft') >= 47 && px('.tabbar', 'paddingRight') >= 47 && px('.view', 'paddingLeft') >= 47; }), 'side safe-area insets pad the top bar, tab bar and page');
  await t.ctx.close();
  // malformed and future-dated data
  t = await open('2026-10-01', '12:00', { ...SEED, 'backup-at': '"not a date"', 'runlog-2026-10-03': { sec: 1800, hr: 140, km: 5 } }, 'week');
  const wkHead = parseFloat((await text(t.page, '.week-profile h2')).split('/')[0]);
  const ring = async () => { await t.page.click('[data-nav="today"]'); await t.page.waitForTimeout(100); return (await text(t.page, '.timeline-head .rg-t')).split('/')[0]; };
  const r = await ring();
  await t.page.click('[data-nav="more"]'); await t.page.waitForTimeout(250); await t.page.click('.sheet-item[data-nav="plan"]'); await t.page.waitForTimeout(200);
  const planned = await t.page.$$eval('.journey-week-numbers b', (n) => n[1].textContent);
  check(parseFloat(r) === parseFloat(planned) && wkHead === parseFloat(r) && parseFloat(r) === 0, 'a log dated after today is banked nowhere yet: Today ' + r + ' = Week ' + wkHead + ' = Plan ' + planned);
  await t.page.click('[data-nav="more"]'); await t.page.waitForTimeout(250); await t.page.click('.sheet-item[data-nav="ref"]'); await t.page.waitForTimeout(150);
  await t.page.evaluate(() => document.querySelectorAll('.ref-fold').forEach((d) => { d.open = true; }));
  const note = await text(t.page, '.backup-note');
  check(!/NaN/.test(note) && /Never backed up/.test(note), 'a malformed backup date reads as never backed up: ' + note);
  noErrors(t, 'layouts');
  await t.ctx.close();
}

/* v5.11.2: the app as one piece — what one view says, the next agrees with */
async function coherence() {
  console.log('· coherence: run card, look-back, totals, earned moments');
  let t = await open('2026-10-01', '17:20', SEED);
  check(!(await t.page.$('.hero .h-rhr')), 'once the run is under way the card carries no morning prompt');
  await t.ctx.close();
  t = await open('2026-10-01', '20:00', SEED);
  check(!!(await t.page.$('.hero .h-missed')) && !(await t.page.$('.hero .h-rhr')), '"Did it happen?" stands alone, without the resting-HR pill beside it');
  await t.ctx.close();
  t = await open('2026-10-01', '17:20', { ...SEED, 'rhr-2026-10-01': { bpm: 52 } });
  check(!!(await t.page.$('.hero .h-rhr-read')), 'a reading already taken still shows during the run');
  for (let k = 0; k < 4; k++) { await t.page.click('.day-nav .nav[data-d="1"]'); await t.page.waitForTimeout(80); }
  check(/Monday 5 Oct/.test(await text(t.page, '.day-head h1')) && !(await t.page.$('.previously')), 'previewing next Monday gives no verdict on a week that is not over');
  await t.ctx.close();
  t = await open('2026-10-05', '09:00', SEED);
  check(!!(await t.page.$('.previously')), 'on the Monday itself, the week is looked back on');
  await t.ctx.close();
  // the Week's one line and the journey it opens give the same totals, ticked runs included
  t = await open('2026-10-01', '12:00', { ...SEED, 'done-2026-09-29': { 't1710-run': true } }, 'week');
  const line = (await text(t.page, '.journey.line')).replace(/\s+/g, ' ');
  await t.page.click('.journey.line .journey-link'); await t.page.waitForTimeout(200);
  const tot = await t.page.$$eval('.journey-totals b', (b) => b.map((x) => x.textContent));
  check(line.includes(tot[0] + ' km') && line.includes(tot[1] + ' runs recorded'), 'the Week’s line says what the journey says: ' + line + ' | ' + tot.join(' / '));
  await t.ctx.close();
  // an overshot long run is flagged, never celebrated; the longest is still recorded, plainly
  t = await open('2026-10-04', '13:00', SEED);
  await t.page.click('.runlogger .h-log');
  for (const [k, v] of [['km', '27'], ['sec', '3:02:00'], ['hr', '148']]) { await t.page.fill('[data-log-field="' + k + '"]', v); await t.page.dispatchEvent('[data-log-field="' + k + '"]', 'change'); }
  await t.page.click('.rl-save'); await t.page.waitForTimeout(300);
  check(!(await t.page.$('.titlecard.earned')) && !!(await t.page.$('.recap-flag')) && /Longest logged run/.test(await text(t.page, '.run-recap')),
    'a long run 23% over plan gets the warning and the record, not the fanfare');
  check(/^\d+(\.\d)?$/.test((await text(t.page, '.recap-total b')).replace(/,/g, '')), 'the log’s total reads to one decimal, as every other total does');
  noErrors(t, 'coherence');
  await t.ctx.close();
}

/* v5.13 (visual batch 1): the ordinary day leads — titles without tiles, a
   hairline jump that still takes a 44px finger, one bright chip, the easy
   day's engraved plate, and the run before the morning's question. */
async function batchOne() {
  console.log('· visual batch 1: running heads, jump, chips, plate, run first');
  let t = await open('2026-10-01', '07:40', SEED);
  const v = await t.page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s)), box = (s) => document.querySelector(s).getBoundingClientRect();
    const nav = box('.day-nav .nav[data-d="1"]'), j = box('.nownext .nn-jump');
    /* a point just outside the 40px ring, still inside the 44px target */
    const edge = document.elementFromPoint(j.right + 1.5, j.top + j.height / 2);
    const hero = document.querySelector('.hero'), kids = [...hero.children];
    return { navBg: cs('.day-nav .nav').backgroundColor, navBd: cs('.day-nav .nav').borderTopColor, navW: Math.round(nav.width), navH: Math.round(nav.height),
      jumpEdge: !!(edge && edge.closest('.nn-jump')), phaseBg: cs('.day-head .chip.build').backgroundColor, evBg: cs('.day-head .chip.ev').backgroundColor,
      plate: !!hero.querySelector('.h-art svg.h-plate'), rhrAfterMeta: kids.indexOf(hero.querySelector('.h-rhr')) > kids.indexOf(hero.querySelector('.h-meta')),
      kmAboveRhr: box('.hero .h-km').bottom < box('.hero .h-rhr').top };
  });
  check(/rgba\(0, 0, 0, 0\)|transparent/.test(v.navBg) && /rgba\(0, 0, 0, 0\)|transparent/.test(v.navBd) && v.navW >= 44 && v.navH >= 44, 'the day’s chevrons have no tile and keep a 44px target: ' + JSON.stringify([v.navBg, v.navW, v.navH]));
  check(v.jumpEdge, 'the Now card’s hairline jump still answers a finger just outside its ring');
  check(/rgba\(0, 0, 0, 0\)/.test(v.phaseBg) && !/rgba\(0, 0, 0, 0\)/.test(v.evBg), 'the phase chip is an outline; the key-date chip keeps its fill');
  check(v.plate, 'an easy day’s card carries the engraved plate');
  check(v.rhrAfterMeta && v.kmAboveRhr, 'the run comes first: the morning’s resting-HR pill sits under the ruled line');
  noErrors(t, 'batch one (easy day)');
  await t.ctx.close();
  t = await open('2026-09-30', '12:00', SEED);
  check(!(await t.page.$('.hero .h-art svg.h-plate')), 'a quality day keeps its own art, not the plate');
  await t.ctx.close();
  t = await open('2026-10-01', '12:00', SEED, 'week');
  check(await t.page.evaluate(() => /rgba\(0, 0, 0, 0\)/.test(getComputedStyle(document.querySelector('.wk-head .nav')).backgroundColor)), 'the Week’s chevrons have no tile either');
  noErrors(t, 'batch one (week)');
  await t.ctx.close();
}

/* v5.12: Strava, against a fake strava.com (invented runs, invented keys):
   connect through the approval round trip, import a day's run into the form
   and save it, choose between two runs, say so when Strava can't be reached,
   hand a code across when another copy of the app started the round trip,
   keep the keys out of backups, and disconnect. */
async function strava() {
  console.log('· Strava import (fake Strava)');
  const SECRET = 'a1'.repeat(20), fake = { calls: [], fail: false, token: null, auth: null };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' };
  const json = (r, body) => r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  const run = (id, iso, hm, km, sec, hr, name) => ({ id, name, sport_type: 'Run', start_date_local: iso + 'T' + hm + ':00Z', distance: km * 1000, moving_time: sec, has_heartrate: true, average_heartrate: hr });
  const runs = [run(7, '2026-10-01', '17:12', 5.21, 1980, 143.4, 'Evening Run'), run(8, '2026-09-30', '06:40', 3.1, 1200, 139, 'Morning shakeout'),
    run(9, '2026-09-30', '17:15', 7.42, 2460, 151, 'Threshold'), { id: 10, name: 'Ride', sport_type: 'Ride', start_date_local: '2026-10-01T08:00:00Z', distance: 20000, moving_time: 3600 }];
  const streams = (id) => { const r = runs.find((x) => x.id === id), n = Math.round(r.moving_time / 5), t = [], d = [], h = [];
    for (let i = 0; i <= n; i++) { t.push(i * 5); d.push(Math.round(r.distance * i / n * 10) / 10); h.push(i < n / 2 ? 140 : 146); }
    return { time: { data: t }, distance: { data: d }, heartrate: { data: h }, moving: { data: t.map(() => true) } }; };
  const route = async (r) => {
    const req = r.request(), u = new URL(req.url());
    fake.calls.push(req.method() + ' ' + u.pathname);
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (fake.fail && u.pathname.startsWith('/api/')) return r.abort('internetdisconnected');
    if (u.pathname === '/oauth/authorize') {
      const back = new URL(u.searchParams.get('redirect_uri'));
      back.search = new URLSearchParams({ state: u.searchParams.get('state'), code: 'fakecode123', scope: 'read,activity:read_all' }).toString();
      return r.fulfill({ status: 302, headers: { Location: back.href } });
    }
    if (u.pathname === '/oauth/token') { fake.token = new URLSearchParams(req.postData() || ''); return json(r, { access_token: 'acc', refresh_token: 'ref', expires_at: 4102444800 }); }
    if (u.pathname === '/oauth/deauthorize') return json(r, {});
    if (u.pathname === '/api/v3/athlete/activities') { fake.auth = req.headers().authorization; return json(r, runs); }
    const m = u.pathname.match(/^\/api\/v3\/activities\/(\d+)\/streams$/);
    if (m) return json(r, streams(+m[1]));
    return r.fulfill({ status: 404, headers: cors, body: '{}' });
  };
  let t = await open('2026-10-01', '20:00', SEED, 'ref');
  await t.ctx.route('https://www.strava.com/**', route);
  await t.page.click('#ref-strava > summary');
  check(/callback domain 127\.0\.0\.1/.test(await text(t.page, '#ref-strava')), 'setup names this site as the callback domain');
  check(await t.page.isVisible('[data-sv-in="id"]') && await t.page.$eval('[data-sv-in="secret"]', (i) => i.type === 'password'),
    'before connecting: the app’s ID, and its secret in a password field');
  await t.page.fill('[data-sv-in="id"]', '12345');
  await t.page.fill('[data-sv-in="secret"]', SECRET);
  await Promise.all([t.page.waitForNavigation({ waitUntil: 'networkidle' }), t.page.click('[data-sv="connect"]')]);
  await t.page.waitForFunction(() => (JSON.parse(localStorage.getItem('strava') || '{}').access === 'acc'), null, { timeout: 5000 }).catch(() => {});
  const kept = await t.json('strava');
  check(kept && kept.access === 'acc' && kept.refresh === 'ref' && kept.scope === 'read,activity:read_all' && !kept.athlete,
    'the round trip ends connected, with the tokens kept on this phone and nothing about the athlete');
  check(fake.token && fake.token.get('grant_type') === 'authorization_code' && fake.token.get('code') === 'fakecode123' && fake.token.get('client_secret') === SECRET,
    'the code is exchanged with the owner’s own keys');
  check(await t.page.evaluate(() => location.search === '' && !/code=/.test(location.href)), 'the code is taken out of the address at once');
  await t.page.waitForTimeout(200);
  check(await t.page.evaluate(() => document.getElementById('ref-strava').open) && /Connected/.test(await text(t.page, '#ref-strava')), 'it lands on the Strava chapter, saying Connected');
  // the keys never travel in a backup
  await t.page.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); try { Object.defineProperty(navigator, 'clipboard', { value: undefined }); } catch (e) { /* fine */ } });
  await t.page.click('[data-io="export"]');
  const blob = await t.page.$eval('.data-box', (b) => b.value).catch(() => '');
  check(/runlog-/.test(blob) && !blob.includes(SECRET) && !/"strava/.test(blob) && !/"acc"/.test(blob), 'a backup carries the runs but never the Strava keys or tokens');
  // import the day's run
  await t.page.click('[data-nav="today"]'); await t.page.waitForTimeout(200);
  check(/Import from Strava or enter the numbers/.test(await text(t.page, '.hero .h-log')), 'once connected, the run card says it can import from Strava');
  await t.page.click('.hero .h-log');
  await t.page.click('.log-sv-go');
  await t.page.waitForFunction(() => /Imported from Strava/.test((document.querySelector('.runlogger .log-note') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const vals = await t.page.evaluate(() => ['km', 'sec', 'hr'].map((k) => document.querySelector('[data-log-field="' + k + '"]').value));
  check(vals.join('|') === '5.21|33:00|143', 'Strava’s distance, moving time and average HR fill the form: ' + vals.join(' · '));
  check(fake.auth === 'Bearer acc' && fake.calls.includes('GET /api/v3/activities/7/streams') && !fake.calls.some((c) => /\/activities\/10\//.test(c)),
    'the day’s run is read with the token; the ride beside it is not');
  check(/Moving time/.test(await text(t.page, '.runlogger')), 'the time field says moving time, not track time');
  await t.page.click('.rl-save');
  const saved = await t.json('runlog-2026-10-01');
  check(saved && saved.km === 5.21 && saved.sec === 1980 && saved.hr === 143 && saved.stream && saved.stream.source === 'Strava' && Number.isFinite(saved.stream.decPct),
    'saving keeps Strava’s numbers and the samples’ analysis: ' + JSON.stringify(saved && { km: saved.km, sec: saved.sec, hr: saved.hr, src: saved.stream && saved.stream.source }));
  check(!JSON.stringify(saved).includes('latlng') && !('lat' in (saved || {})), 'no route is stored');
  // two runs on one day: choose
  await t.page.click('.day-nav .nav[data-d="-1"]'); await t.page.waitForTimeout(200);
  await t.page.click('.hero .h-log'); await t.page.click('.log-sv-go');
  await t.page.waitForSelector('.log-sv-pick', { timeout: 5000 }).catch(() => {});
  const picks = await t.page.$$eval('.log-sv-pick', (bs) => bs.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
  check(picks.length === 2 && /^06:40 · Morning shakeout/.test(picks[0]) && /^17:15 · Threshold/.test(picks[1]), 'two runs that day are offered by start time: ' + picks.join(' | '));
  await t.page.click('.log-sv-pick[data-i="1"]');
  await t.page.waitForFunction(() => /Imported from Strava · Threshold/.test((document.querySelector('.runlogger .log-note') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(await t.page.$eval('[data-log-field="km"]', (i) => i.value) === '7.42', 'the chosen run fills the form');
  await t.page.click('.rl-x');
  // Strava out of reach: said plainly, nothing changed
  fake.fail = true;
  await t.page.click('.hero .h-log'); await t.page.click('.log-sv-go');
  await t.page.waitForFunction(() => /Couldn’t reach Strava/.test((document.querySelector('.runlogger .log-note') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(/Couldn’t reach Strava/.test(await text(t.page, '.runlogger .log-note')) && !(await t.json('runlog-2026-09-30')), 'an unreachable Strava is said plainly and nothing is saved');
  await t.page.click('.rl-x'); fake.fail = false;
  // disconnect
  await t.page.click('[data-nav="more"]'); await t.page.click('[data-nav="ref"]');
  await t.page.evaluate(() => { const s = document.getElementById('ref-strava'); s.open = true; s.scrollIntoView(); });
  await t.page.click('[data-sv="forget"]'); await t.page.waitForTimeout(200);
  check(!(await t.ls('strava')) && fake.calls.includes('POST /oauth/deauthorize') && /Disconnected/.test(await text(t.page, '#ref-strava')), 'Disconnect removes the keys and tokens and tells Strava');
  noErrors(t, 'strava');
  await t.ctx.close();
  // Strava's answer opened in a copy of the app that didn't start it (Safari, not the Home Screen app)
  t = await open('2026-10-01', '12:00', SEED);
  await t.page.goto('http://127.0.0.1:' + server.address().port + '/index.html?state=elsewhere&code=handoff99&scope=read,activity:read_all', { waitUntil: 'networkidle' });
  check(await t.page.evaluate(() => location.search === '' && document.getElementById('ref-strava').open) && /handoff99/.test(await text(t.page, '.sv-code')) &&
    !(await t.page.$('[data-sv="here"]')), 'a code this copy cannot finish is shown to copy across, and taken out of the address');
  await t.page.goto('http://127.0.0.1:' + server.address().port + '/index.html?state=x&error=access_denied', { waitUntil: 'networkidle' });
  check(/cancelled/.test(await text(t.page, '#ref-strava')) && !(await t.ls('strava')), 'a refusal on Strava changes nothing');
  check(/^IPaces\+$/.test((await t.page.$$eval('.ref-fold > summary', (s) => s.map((x) => x.textContent.trim())))[0]) &&
    /^XIIIStrava/.test((await t.page.$$eval('.ref-fold > summary', (s) => s.map((x) => x.textContent.trim()))).pop()), 'Strava is chapter XIII');
  noErrors(t, 'strava hand-off');
  await t.ctx.close();
}

/* v5.11.3: a release arrives — the toast offers it, the page keeps its
   release until the tap, then reloads into the new one; the old cache goes,
   ticks and logs stay, and the new release opens offline. Pages caches
   app.js for ten minutes; the new worker must precache past that (F5). */
async function update() {
  console.log('· update flow');
  RELEASE.ver = 'week-os-vTEST-A'; RELEASE.mark = 'A';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: TZ, locale: 'en-GB' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(600);
    check(await page.evaluate(() => performance.getEntriesByType('navigation')[0].type === 'navigate'), 'the first install never reloads the page under the user');
    await page.evaluate(() => { localStorage.setItem('done-2026-10-01', JSON.stringify({ 't1710-run': true })); localStorage.setItem('runlog-2026-09-30', JSON.stringify({ sec: 2700, hr: 150, km: 7 })); });
    await page.reload({ waitUntil: 'networkidle' });
    check(await page.evaluate(() => !!navigator.serviceWorker.controller) && await page.evaluate(() => document.getElementById('toast').classList.contains('hidden')), 'controlled on the second visit, and no toast without a release');
    RELEASE.ver = 'week-os-vTEST-B'; RELEASE.mark = 'B';
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('hidden'), null, { timeout: 15000 }).catch(() => {});
    check(/Updated/.test(await text(page, '#toast')) && await page.evaluate(() => window.__build === 'A'), 'a new release offers "Updated · Reload" and the page keeps its own release until the tap');
    await page.waitForTimeout(700);   // the toast rises in at 96% scale
    const rh = await page.$eval('#toast-reload', (b) => Math.round(b.getBoundingClientRect().height));
    check(rh >= 44, 'Reload is a full-height target: ' + rh + 'px');
    const nav = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
    await page.click('#toast-reload'); await nav; await page.waitForTimeout(500);
    check(await page.evaluate(() => window.__build === 'B'), 'Reload brings in the new release, though the old app.js sat in the HTTP cache');
    check(JSON.stringify(await page.evaluate(() => caches.keys())) === '["week-os-vTEST-B"]', 'the old release’s cache is deleted');
    check(await page.evaluate(() => !!localStorage.getItem('done-2026-10-01') && JSON.parse(localStorage.getItem('runlog-2026-09-30')).km === 7), 'ticks and logs survive the update');
    await ctx.setOffline(true); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    check(await page.isVisible('.nownext') && await page.evaluate(() => window.__build === 'B'), 'offline, the new release opens from its cache');
    check(!errors.length, 'no page errors in the update flow ' + errors.join(' | '));
  } finally { RELEASE.ver = null; await ctx.close(); }
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
    for (const run of [missedRun, moves, restingHr, trendsAndBackup, marathonPace, weekShape, cinema, layouts, coherence, batchOne, strava, update, sweep, offline]) await run();
  } catch (e) { fails++; console.error(e); }
  await browser.close(); server.close();
  console.log('\n' + passes + ' passed, ' + fails + ' failed · Chromium mobile viewport, not a physical iPhone');
  process.exitCode = fails ? 1 : 0;
})();
