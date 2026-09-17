'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const DB = require('../js/day-builder');
const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
// Execute the actual pure render helpers without booting the DOM/router.
const helper = name => {
  const match = source.match(new RegExp('  function ' + name + '\\([^]*?\\n  \\}'));
  assert.ok(match, name + ' must remain covered if moved');
  return vm.runInNewContext('(' + match[0] + ')', {DB});
};
const parseHalf = helper('parseHalf'), fmtPace = helper('fmtPace'), fmtClock = helper('fmtClock');
assert.equal(parseHalf('1:50'), 6600);
assert.equal(parseHalf('1:50:30'), 6630);
for (const bad of ['1:60', '1:99:00', '1:20:60', '1:20:99', '1:', '1:2', '1:20:']) assert.equal(parseHalf(bad), null, bad);
assert.equal(fmtPace(239.49), '3:59/km');
assert.equal(fmtPace(239.5), '4:00/km');
assert.equal(fmtPace(299.99), '5:00/km');
assert.equal(fmtClock(14387), '4:00');
console.log('Time input: invalid clocks rejected; pace and hour rounding carry correctly');
