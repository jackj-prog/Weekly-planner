/* ==========================================================================
   Week OS — tools/make-icons.js  (dev-time only, not shipped)
   Renders icons/icon.svg → icons/icon-180.png + icons/icon-512.png using
   headless Chromium via Playwright (globally installed in the dev env;
   the app itself stays dependency-free).
   Run: node tools/make-icons.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

let chromium, launchOpts = {};
for (const mod of ['playwright', '/opt/node22/lib/node_modules/playwright', 'playwright-core']) {
  try { ({ chromium } = require(mod)); break; } catch (e) { /* try the next */ }
}
if (!chromium) {
  console.error('playwright not found — install it (dev-only) or export the SVG by hand.');
  process.exit(1);
}
/* playwright-core ships no browser: use the preinstalled one when present */
const exe = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if (fs.existsSync(exe)) launchOpts = { executablePath: exe, args: ['--no-sandbox'] };

const ICONS = path.join(__dirname, '..', 'icons');
const svg = fs.readFileSync(path.join(ICONS, 'icon.svg'), 'utf8');

(async () => {
  const browser = await chromium.launch(launchOpts);
  for (const size of [180, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      '<!DOCTYPE html><html><head><style>*{margin:0}svg{display:block}</style></head><body>' +
      svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ') +
      '</body></html>'
    );
    await page.waitForTimeout(120);
    const file = path.join(ICONS, 'icon-' + size + '.png');
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote ' + file);
    await page.close();
  }
  await browser.close();
})();
