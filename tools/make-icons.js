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

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  try {
    ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
  } catch (e2) {
    console.error('playwright not found — install it (dev-only) or export the SVG by hand.');
    process.exit(1);
  }
}

const ICONS = path.join(__dirname, '..', 'icons');
const svg = fs.readFileSync(path.join(ICONS, 'icon.svg'), 'utf8');

(async () => {
  const browser = await chromium.launch();
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
