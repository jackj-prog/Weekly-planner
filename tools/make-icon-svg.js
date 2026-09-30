/* ==========================================================================
   Week OS — tools/make-icon-svg.js  (dev-time only, not shipped)
   Generates icons/icon.svg, the app icon: the day clock as the app's face.
   Geometry is computed (ticks, stars, tracery, the hand at 17:10), so it
   stays exact; colours are palette values only. Then render the PNGs with
   node tools/make-icons.js.
   Run: node tools/make-icon-svg.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const C = 512, f = (n) => +n.toFixed(1);
const ang = (m) => (m / 1440) * 2 * Math.PI - Math.PI / 2;           // midnight at the top
const P = (m, r) => [C + r * Math.cos(ang(m)), C + r * Math.sin(ang(m))];
const pt = (m, r) => P(m, r).map(f).join(' ');
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const RS_IN = 262, RS_OUT = 362, R_BEZ = 452;
let s = '';
s += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <!-- Week OS app icon (v4.94): the day clock as the app's face.
       An astronomical dial for one day, midnight at the top and noon at the
       bottom: the night sky above with its stars and the moon, daylight
       below, the sun on the evening horizon, the rose window at the heart,
       and the one red hand pointing at the evening run. Palette tokens only
       (paper #141414, surface #1f1f1f, line #333, text #fff, accent #ff3b45).
       Full bleed: iOS masks apple-touch-icon to its own superellipse.
       Generated geometry; rendered to PNG by tools/make-icons.js. -->
  <defs>
    <radialGradient id="ground" cx=".5" cy=".46" r=".62">
      <stop offset="0" stop-color="#262626"/><stop offset=".55" stop-color="#141414"/><stop offset="1" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000"/><stop offset=".44" stop-color="#000000"/>
      <stop offset=".53" stop-color="#333333"/><stop offset=".75" stop-color="#8c8c8c"/><stop offset="1" stop-color="#d9d9d9"/>
    </linearGradient>
    <radialGradient id="noon" cx=".5" cy="1" r=".6">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="#ffffff" stop-opacity=".5"/><stop offset=".4" stop-color="#ffffff" stop-opacity=".12"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <radialGradient id="ember"><stop offset="0" stop-color="#ff3b45" stop-opacity=".32"/><stop offset="1" stop-color="#ff3b45" stop-opacity="0"/></radialGradient>
    <mask id="ring"><circle cx="${C}" cy="${C}" r="${RS_OUT}" fill="#fff"/><circle cx="${C}" cy="${C}" r="${RS_IN}" fill="#000"/></mask>
  </defs>
  <rect width="1024" height="1024" fill="url(#ground)"/>
`;
/* bezel: a quarter-hour minute track, hours heavier, every three hours bold */
s += `  <circle cx="${C}" cy="${C}" r="${R_BEZ + 16}" fill="none" stroke="#333333" stroke-width="3"/>\n  <g stroke-linecap="round">\n`;
for (let q = 0; q < 96; q++) {
  const m = q * 15, major = q % 12 === 0, hr = q % 4 === 0;
  s += `    <path d="M${pt(m, major ? R_BEZ - 44 : hr ? R_BEZ - 22 : R_BEZ - 10)} L${pt(m, R_BEZ + 6)}" stroke="${major ? '#ffffff' : hr ? '#b3b3b3' : '#8c8c8c'}" stroke-width="${major ? 15 : hr ? 7 : 3.5}" stroke-opacity="${major ? 1 : hr ? .9 : .55}"/>\n`;
}
s += '  </g>\n';
/* the sky ring: night above, daylight below, lit at noon */
s += `  <g mask="url(#ring)">
    <rect x="${C - RS_OUT}" y="${C - RS_OUT}" width="${RS_OUT * 2}" height="${RS_OUT * 2}" fill="url(#sky)"/>
    <rect x="${C - RS_OUT}" y="${C}" width="${RS_OUT * 2}" height="${RS_OUT}" fill="url(#noon)"/>
`;
/* stars in the night half only */
for (let k = 0; k < 46; k++) {
  const m = (19.4 + rnd() * 9.4) * 60 % 1440, r = RS_IN + 12 + rnd() * (RS_OUT - RS_IN - 24), [x, y] = P(m, r);
  const b = rnd();
  s += `    <circle cx="${f(x)}" cy="${f(y)}" r="${b > .86 ? 5.5 : b > .5 ? 3.4 : 2.2}" fill="#ffffff" fill-opacity="${b > .5 ? .95 : .55}"/>\n`;
}
/* two bright stars with four-point sparkle */
for (const [m, r] of [[23.2 * 60, 330], [2.3 * 60, 300]]) {
  const [x, y] = P(m, r), L = 20, w = 3.2;
  s += `    <path d="M${f(x - L)} ${f(y)} L${f(x)} ${f(y - w)} L${f(x + L)} ${f(y)} L${f(x)} ${f(y + w)} Z M${f(x)} ${f(y - L)} L${f(x + w)} ${f(y)} L${f(x)} ${f(y + L)} L${f(x - w)} ${f(y)} Z" fill="#ffffff"/>\n`;
  s += `    <circle cx="${f(x)}" cy="${f(y)}" r="4.5" fill="#ffffff"/>\n`;
}
s += '  </g>\n';
/* ring edges, and the horizon hairlines at sunrise and sunset */
s += `  <circle cx="${C}" cy="${C}" r="${RS_OUT}" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="3"/>
  <circle cx="${C}" cy="${C}" r="${RS_IN}" fill="none" stroke="#ffffff" stroke-opacity=".16" stroke-width="3"/>
`;
for (const m of [6.6 * 60, 18.6 * 60]) s += `  <path d="M${pt(m, RS_IN)} L${pt(m, RS_OUT)}" stroke="#ffffff" stroke-opacity=".5" stroke-width="3" stroke-dasharray="4 7"/>\n`;
/* the moon, a waxing crescent high in the night */
{ const [mx, my] = P(1.2 * 60, (RS_IN + RS_OUT) / 2); const r = 26;
  s += `  <mask id="crescent"><circle cx="${f(mx)}" cy="${f(my)}" r="${r}" fill="#fff"/><circle cx="${f(mx - r * 0.55)}" cy="${f(my - r * 0.22)}" r="${r * 0.92}" fill="#000"/></mask>\n`;
  s += `  <circle cx="${f(mx)}" cy="${f(my)}" r="${r * 2.6}" fill="url(#halo)" opacity=".55"/>\n`;
  s += `  <circle cx="${f(mx)}" cy="${f(my)}" r="${r}" fill="#ffffff" mask="url(#crescent)"/>\n`; }
/* the sun on the evening horizon */
{ const [sx, sy] = P(18.6 * 60, (RS_IN + RS_OUT) / 2); let rays = '';
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, r0 = 30, r1 = k % 2 ? 42 : 52;
    rays += `M${f(sx + r0 * Math.cos(a))} ${f(sy + r0 * Math.sin(a))} L${f(sx + r1 * Math.cos(a))} ${f(sy + r1 * Math.sin(a))} `; }
  s += `  <circle cx="${f(sx)}" cy="${f(sy)}" r="74" fill="url(#halo)" opacity=".8"/>\n  <path d="${rays}" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>\n  <circle cx="${f(sx)}" cy="${f(sy)}" r="21" fill="#ffffff"/>\n`; }
/* the ring of lights: one per session, three of four done */
{ const R = 222, n = 4, gap = 9; for (let k = 0; k < n; k++) {
  const a = (k * 360 / n + gap / 2) * 4 + 3 * 60, z = ((k + 1) * 360 / n - gap / 2) * 4 + 3 * 60;
  s += `  <path d="M${pt(a, R)} A${R} ${R} 0 0 1 ${pt(z, R)}" fill="none" stroke="#ffffff" stroke-opacity="${k < 3 ? 1 : .16}" stroke-width="10" stroke-linecap="round"/>\n`; } }
/* the medallion: rose-window tracery */
s += `  <circle cx="${C}" cy="${C}" r="190" fill="#141414" stroke="#ffffff" stroke-opacity=".28" stroke-width="3"/>\n  <g fill="none" stroke="#ffffff" stroke-opacity=".13" stroke-width="3">\n    <circle cx="${C}" cy="${C}" r="176"/><circle cx="${C}" cy="${C}" r="64"/>\n`;
for (let k = 0; k < 12; k++) { const [px, py] = P(k * 120, 118); s += `    <circle cx="${f(px)}" cy="${f(py)}" r="52"/>\n    <path d="M${pt(k * 120 + 60, 64)} L${pt(k * 120 + 60, 176)}"/>\n`; }
s += '  </g>\n';
/* the hand: Breguet — shaft, hollow moon ring framing the sky, tapered point.
   It points at 17:10, the evening run. */
{ const m = 17 * 60 + 10, deg = (m / 1440) * 360;
  s += `  <circle cx="${f(P(m, 312)[0])}" cy="${f(P(m, 312)[1])}" r="96" fill="url(#ember)"/>\n`;
  s += `  <g id="hand" transform="rotate(${f(deg)} ${C} ${C})" fill="#ff3b45" stroke="#ff3b45" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${C} ${C + 40} L${C} ${C - 280}" fill="none" stroke-width="19"/>
    <circle cx="${C}" cy="${C - 312}" r="31" fill="none" stroke-width="16"/>
    <path d="M${C} ${C - 344} L${C} ${C - 356}" fill="none" stroke-width="19"/>
    <path d="M${C - 16} ${C - 352} L${C} ${C - 456} L${C + 16} ${C - 352} Z" stroke-width="5"/>
  </g>
  <circle cx="${C}" cy="${C}" r="34" fill="#ff3b45"/>
  <circle cx="${C}" cy="${C}" r="12" fill="#141414"/>
`; }
s += '</svg>\n';
const out = require('path').join(__dirname, '..', 'icons', 'icon.svg');
fs.writeFileSync(out, s);
console.log('wrote ' + out + ' (' + s.length + ' bytes)');
