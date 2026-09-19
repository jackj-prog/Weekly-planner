'use strict';
const assert = require('assert/strict');
const { parseText, duration } = require('../js/run-import');
// Entirely invented inputs: exercise formats, not personal activity records.
let v = parseText('distance=8000m moving=2880s avg_pace=6:00/km HR_avg=139.6 temp=12').values;
assert.deepEqual(v, { km: 8, sec: 2880, paceSec: 360, hr: 140, temp: 12 });
v = parseText('HR: 143\nTime: 1:04:00\nDistance: 10 km').values;
assert.equal(v.km, 10); assert.equal(v.sec, 3840); assert.equal(v.temp, undefined);
assert.equal(parseText('distance 8,25 km pace 6:00/km').values.km, 8.25);
assert.equal(parseText('distance 8,000m pace 6:00/km').values.km, 8);
assert.equal(parseText('distance 5mi time 45:00').values.km, 8.04672);
assert.equal(parseText('temp: 50 F').values.temp, 10);
assert.equal(parseText('temperature=-3 C').values.temp, -3);
assert.equal(parseText('moving=30:00 pace=6:00/km').values.km, 5);
assert.equal(parseText('distance=8km time=48:00 pace=5:00/km').warnings.length, 1);
assert.equal(parseText('distance=8km time=48:00 pace=5:00/km').values.paceSec, 360);
assert.equal(parseText('notes with no measurements').warnings.length, 1);
assert.equal(parseText('HR=999 distance=0km').values.hr, undefined);
assert.equal(duration('1:60:00'), null); assert.equal(duration('45:59'), 2759);
assert.equal(duration('1:02:03'), 3723); assert.equal(duration('-25'), null);
for (const bad of ['1:', ':30', '1::30', '1:2', '1:02:', '1:02.5', '1:2e1', '1: 2', '1:99:00', '1:20:60']) assert.equal(duration(bad), null, bad);
assert.equal(duration('3600.5s'), 3600.5);
for (const text of ['elapsed time=55:00 moving=48:00 distance=8km', 'distance=8km moving_time=48:00 elapsed time=55:00', 'time=55:00 moving duration=2880s distance=8km']) {
  assert.equal(parseText(text).values.sec,2880,text);
  assert.equal(parseText(text).values.paceSec,360,text);
}
assert.match(parseText('distance=8km elapsed time=55:00').warnings.join(' '), /include stops/);
for (const unit of ['/mi', 'min/mi', 'per mile']) {
  const imported = parseText('distance=5mi pace=8:00 '+unit);
  assert.equal(imported.values.sec,2400,unit);
  assert.ok(Math.abs(imported.values.paceSec-480/1.609344)<1e-9,unit);
}
for (const input of ['distance=-8km', '-8 km', 'distance=−8km', 'distance=1001km']) {
  const parsed = parseText(input+' moving=48:00 pace=6:00/km');
  assert.equal(parsed.values.km,undefined,input);
  assert.match(parsed.warnings.join(' '),/distance is invalid/);
}
for (const bad of ['1:02:03:04', '1:', '1:60:00', '-2880s']) {
  const parsed = parseText('distance=8km moving='+bad+' pace=6:00/km');
  assert.equal(parsed.values.sec,undefined,bad);
  assert.match(parsed.warnings.join(' '),/time is invalid/);
}
assert.equal(parseText('distance=1001km pace=6:00/km').values.sec,undefined);
assert.equal(parseText('distance=8km pace=6:00/furlong').values.sec,undefined);
assert.equal(parseText('distance=8km pace=6:00:30').values.sec,undefined);
console.log('Run import: units, clock formats, missing values, inconsistencies and invalid inputs passed');
