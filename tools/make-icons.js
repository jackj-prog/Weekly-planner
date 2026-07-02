/* ==========================================================================
   Week OS — tools/make-icons.js  (dev-time only, not shipped)
   Generates icons/icon-180.png and icons/icon-512.png with zero deps:
   raw RGBA buffer → PNG via zlib. Design: ink field, three phase bars
   (base/build/taper) and the accent dot — the race at the end of taper.
   Run: node tools/make-icons.js
   ========================================================================== */
'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
const INK = hex('#16242a');
const BASE = hex('#6f8c63');
const BUILD = hex('#436883');
const TAPER = hex('#c5872f');
const ACCENT = hex('#d6492e');

/* CRC32 (PNG chunk checksums) */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;                            // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* capsule (rounded horizontal bar) coverage with 1px soft edge */
function capsuleDist(px, py, x0, x1, cy, r) {
  const cx = Math.max(x0 + r, Math.min(px, x1 - r));
  return Math.hypot(px - cx, py - cy) - r;
}
function circleDist(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function drawIcon(size) {
  const s = size / 512;                                // design space: 512
  const rgba = Buffer.alloc(size * size * 4);
  const shapes = [
    { kind: 'bar', x0: 88, x1: 288, cy: 164, r: 30, color: BASE },
    { kind: 'bar', x0: 88, x1: 424, cy: 256, r: 30, color: BUILD },
    { kind: 'bar', x0: 88, x1: 232, cy: 348, r: 30, color: TAPER },
    { kind: 'dot', cx: 388, cy: 348, r: 38, color: ACCENT },
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b] = INK;
      const px = (x + 0.5) / s, py = (y + 0.5) / s;
      for (const sh of shapes) {
        const d = sh.kind === 'bar'
          ? capsuleDist(px, py, sh.x0, sh.x1, sh.cy, sh.r)
          : circleDist(px, py, sh.cx, sh.cy, sh.r);
        const a = Math.max(0, Math.min(1, 0.5 - d * s));  // soft 1px edge
        if (a > 0) {
          r = r + (sh.color[0] - r) * a;
          g = g + (sh.color[1] - g) * a;
          b = b + (sh.color[2] - b) * a;
        }
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r); rgba[i + 1] = Math.round(g); rgba[i + 2] = Math.round(b); rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, rgba);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [180, 512]) {
  const file = path.join(outDir, 'icon-' + size + '.png');
  fs.writeFileSync(file, drawIcon(size));
  console.log('wrote ' + file);
}
