'use strict';
const assert=require('node:assert/strict');
const {summarize}=require('../js/run-progress.js');
const a={iso:'2026-09-01',km:5,sec:1800},b={iso:'2026-09-03',km:5,sec:1700};
let s=summarize([a,b], '2026-09-10');
assert.equal(s.km,10);assert.equal(s.runs,2);assert.equal(s.weeks,1);
assert.equal(s.bests[0].iso,b.iso);assert.equal(s.bests[0].compared,2);
assert.equal(summarize([a], '2026-09-10').bests.length,0);
assert.equal(summarize([a], '2026-09-10').longest,null);
assert.equal(summarize([a,{...b,sec:1800}], '2026-09-10').bests[0].iso,a.iso);
s=summarize([a,b,{iso:'2026-09-08',km:10,sec:3000},{iso:'2026-09-09',km:4.999,sec:1200}], '2026-09-10');
assert.equal(s.bests.length,1);assert.equal(s.bests[0].km,5);
assert.equal(s.longest.km,10);assert.equal(s.weeks,2);
assert.equal(s.km,24.999); // No fabricated 5 km split from the 10 km run.
assert.equal(summarize([a,b],a.iso).runs,1);
assert.equal(summarize([a,{...a,sec:1600}], '2026-09-10').runs,1);
assert.equal(summarize([{...a,km:NaN},{...b,sec:-1}], '2026-09-10').runs,0);
assert.deepEqual(summarize([], '2026-09-10').bests,[]);
console.log('Run progress: exact-distance bests, ties, single logs, totals, weeks, future/invalid logs and duplicates passed');
