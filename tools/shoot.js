/* ==========================================================================
   Week OS — tools/shoot.js  (development only, never shipped to the phone)
   Renders the app in headless Chromium at iPhone size and writes a PNG, so a
   layout change can be SEEN before it is pushed. Every layout bug caught
   during v4.2–v4.23 was caught this way: clipped fuelling notes, a temp chip
   overflowing its row, "in band" reading neutral when the pace beat a clear
   day. None of them fail a unit test — they only look wrong.

   THIS IS NOT iPhone VERIFICATION. It is Chromium at 390×844. Safari-only
   behaviour — standalone launch, safe-area insets, iOS storage eviction —
   is unreachable from a Linux box and belongs to docs/device-checklist.md.
   Label output "mobile viewport", never "tested on iPhone".

   The APP still has zero dependencies (CLAUDE.md §2). This tool has one, and
   it is not declared anywhere: install it yourself, outside the repo.
       npm i -g playwright-core          (or: npm i playwright-core in /tmp)
   A browser is found automatically, or point at one:
       WEEKOS_CHROME=/path/to/chrome node tools/shoot.js
   On Windows, Chrome or Microsoft Edge is found in system/per-user installs.
   PowerShell with an external playwright-core install:
       $env:NODE_PATH = 'C:\path\to\external\node_modules'
       node tools/shoot.js --date=2026-09-14 --view=today

   Run:
       node tools/shoot.js                                  → today, Today view
       node tools/shoot.js --date=2026-09-14                → that date
       node tools/shoot.js --date=2027-01-24 --time=06:30   → race morning
       node tools/shoot.js --view=ref --full                → whole Reference
       node tools/shoot.js --seed=tools/seed.example.json   → with logged runs

   Flags: --date=ISO · --time=HH:MM · --view=today|week|plan|ref
          --scrollto=selector (align below the sticky header; wait for reveals)
          --theme=light|dark · --reduced (prefers-reduced-motion)
          --out=path.png · --full (full page, not just the fold)
          --seed=file.json (localStorage contents, see seed.example.json)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const TZ = 'Europe/London';                 // the app is local-time; pin it

/* ---- args ---- */
const args = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const view = args.view || 'today';
const time = args.time || '17:30';
const date = args.date || new Date().toISOString().slice(0, 10);
const out = path.resolve(args.out || path.join(__dirname, '..', 'shot-' + view + '-' + date + '.png'));
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('--date must be YYYY-MM-DD, got: ' + date);
if (!/^\d{2}:\d{2}$/.test(time)) fail('--time must be HH:MM, got: ' + time);
if (!['today', 'week', 'plan', 'ref'].includes(view)) fail('--view must be today|week|plan|ref');
if (args.scrollto !== undefined && (typeof args.scrollto !== 'string' || !args.scrollto.trim())) fail('--scrollto requires a CSS selector');
if (args.theme && !['light', 'dark'].includes(args.theme)) fail('--theme must be light|dark');

function fail(msg) { console.error('shoot: ' + msg); process.exit(1); }

/* ---- the fixed instant, in the app's timezone, not the container's ----
   The container is UTC; the phone is not. Without this a screenshot taken
   for 17:10 renders the 18:10 blocks in summer and nobody notices. */
function zoneOffset(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).reduce((o, p) => (o[p.type] = p.value, o), {});
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second) - utcMs;
}
function epochFor(iso, hhmm) {
  const [Y, M, D] = iso.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  const naive = Date.UTC(Y, M - 1, D, h, m);
  let ms = naive - zoneOffset(naive);
  const o = zoneOffset(ms);                 // second pass settles DST edges
  if (naive - o !== ms) ms = naive - o;
  return ms;
}

/* ---- browser ---- */
function findBrowser() {
  if (process.env.WEEKOS_CHROME) return process.env.WEEKOS_CHROME;
  const fixed = [
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  if (process.platform === 'win32') {
    // Edge ships on Windows even when Chrome is absent. Use the same
    // Chromium driver; screenshots are still mobile viewport checks.
    for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      fixed.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      fixed.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  }
  const pw = '/opt/pw-browsers';            // Playwright's own download dir
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw).filter((n) => n.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        fixed.unshift(path.join(pw, d, rel));
      }
    }
  }
  return fixed.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

/* ---- static server: file:// blocks localStorage and service workers ---- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ics': 'text/calendar',
};
/* Serve ONLY what the app itself loads. A .gitignore keeps a file out of a
   commit; it does nothing to stop a static server rooted at the repo from
   handing it to anyone who asks. PRIVATE.md sits in this directory by design
   (see .gitignore), so the extension allowlist below is what actually keeps
   it off the wire — an unknown extension is a 404, and .git is refused
   outright. Verified: GET /PRIVATE.md returns 404. */
const DENY = /(^|[/\\])\.git([/\\]|$)|(^|[/\\])private([/\\]|$)/i;
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';
      const safe = path.normalize(rel).replace(/^([/\\])+/, '');
      const file = path.join(ROOT, safe);
      if (DENY.test(safe) || !Object.prototype.hasOwnProperty.call(MIME, path.extname(file))) {
        res.writeHead(404); return res.end('not found');
      }
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright-core')); } catch (e) {
    fail('playwright-core is not installed.\n' +
      '  npm i -g playwright-core       (or npm i playwright-core in a scratch dir\n' +
      '                                  and run with NODE_PATH=<that>/node_modules)');
  }
  const exe = findBrowser();
  if (!exe) {
    fail('no Chromium found. Install one, or point at it:\n' +
      '  WEEKOS_CHROME=/path/to/chrome node tools/shoot.js');
  }

  const server = await serve();
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
    timezoneId: TZ, locale: 'en-GB',
    colorScheme: args.theme || 'light', reducedMotion: args.reduced ? 'reduce' : 'no-preference',
    /* Real physiology never enters this repo (CLAUDE.md §4.10) — this is a
       fixture, and tests/build.test.js keeps an allowlist that enforces it. */
    userAgent: 'Mozilla/5.0 (Linux; Chromium) WeekOS-shoot',
  });

  const epoch = epochFor(date, time);
  const seed = args.seed ? JSON.parse(fs.readFileSync(path.resolve(args.seed), 'utf8')) : {};
  /* Default the HR fixture only when the seed says nothing about it. An
     explicit `"hr": null` means "leave storage empty", which is the only way
     to capture the first-run state — and that state is where two of the
     audit's findings live, so it has to be reachable. */
  if (!Object.prototype.hasOwnProperty.call(seed, 'hr')) seed.hr = { rest: 50, max: 190, at: date };

  await ctx.addInitScript(({ epoch, seed }) => {
    const Real = Date;
    const skew = epoch - Real.now();
    function Fake(...a) {
      if (!new.target) return new Real(Real.now() + skew).toString();
      return a.length === 0 ? new Real(Real.now() + skew) : new Real(...a);
    }
    Fake.prototype = Real.prototype;
    Fake.now = () => Real.now() + skew;
    Fake.parse = Real.parse;
    Fake.UTC = Real.UTC;
    window.Date = Fake;
    try {
      for (const [k, v] of Object.entries(seed)) {
        if (v === null) continue;                 // explicit "leave this unset"
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    } catch (e) { /* private mode — the app copes, so does this */ }
  }, { epoch, seed });

  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(String(e)));

  await page.goto(url, { waitUntil: 'networkidle' });
  if (view === 'week') {
    await page.click('[data-nav="week"]');
  } else if (view === 'plan' || view === 'ref') {
    await page.click('[data-nav="more"]');
    await page.click('[data-nav="' + view + '"]');
  }
  await page.waitForTimeout(400);           // fonts settle, sparklines paint
  await page.evaluate(() => document.fonts.ready);
  if (args.scrollto) {
    const target = page.locator(args.scrollto).first();
    await target.waitFor({ state: 'visible', timeout: 5000 });
    await target.evaluate((node) => {
      const header = document.querySelector('.topbar');
      const inset = (header ? header.getBoundingClientRect().height : 0) + 16;
      window.scrollTo({ top: Math.max(0, node.getBoundingClientRect().top + window.scrollY - inset), behavior: 'instant' });
    });
    await page.waitForTimeout(800);         // scroll-triggered reveal finishes
  }
  await page.screenshot({ path: out, fullPage: !!args.full });

  await browser.close();
  server.close();

  console.log('wrote ' + out + '  —  ' + view + ' · ' + date + ' ' + time + ' ' + TZ +
    (args.full ? ' · full page' : ' · 390×844 fold') +
    (args.scrollto ? ' · section ' + args.scrollto : '') + ' · mobile viewport');
  if (problems.length) {
    console.log('\n' + problems.length + ' console error(s) — these are real, fix them:');
    problems.forEach((p) => console.log('  · ' + p));
    process.exitCode = 1;
  }
})().catch((e) => { console.error(e); process.exit(1); });
