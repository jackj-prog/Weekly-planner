/* ==========================================================================
   Week OS — tools/make-ics.js  (runs in CI on every deploy)
   Generates training.ics at the repo root so GitHub Pages serves it as a
   live calendar feed: subscribe once via webcal:// and every plan change
   flows to the phone automatically. Covers the whole block so the feed is
   deterministic regardless of deploy date (UIDs are stable).
   Run: node tools/make-ics.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const PLAN = require('../data/plan.js');
const DB = require('../js/day-builder.js');

const ics = DB.buildICS(PLAN.blocks[0].start);
const out = path.join(__dirname, '..', 'training.ics');
fs.writeFileSync(out, ics);
console.log('wrote ' + out + ' — ' + (ics.match(/BEGIN:VEVENT/g) || []).length + ' events');
