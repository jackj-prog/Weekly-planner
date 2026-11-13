'use strict';
const assert = require('assert/strict');
const S = require('../js/run-stream');
const origin = Date.parse('2026-09-16T12:00:00Z');
const points = [];
for (let i=0;i<=114;i++) points.push({time:origin+i*10000,distance:i<=60?i*2000/60:2000+(i-60)*2000/54,hr:i<60?140:160});
const r = S.summarize([points],'TCX');
assert.equal(r.values.km,4); assert.equal(r.values.sec,1140);
assert.equal(r.values.hr,149);
assert.deepEqual(r.stream.hrSeconds,[[140,600],[160,540]]);
assert.ok(Math.abs(r.stream.splitSec+60)<1e-8);
assert.ok(Math.abs(r.stream.decPct-(1-(2000*60/(160*540))/(2000*60/(140*600)))*100)<1e-8);
assert.equal(r.stream.coveredSec,1140);
const missing=points.map((p,i)=>({...p,hr:i===5?null:p.hr}));
const partial=S.summarize([missing],'TCX');
assert.equal(partial.values.hr,null); assert.equal(partial.stream.coveredSec,1130); assert.equal(partial.stream.decPct,null);
const gap=points.map((p,i)=>({...p,time:p.time+(i>=10?60000:0)}));
assert.equal(S.summarize([gap],'TCX').stream.decPct,null);
assert.equal(S.summarize([points.slice(0,61),points.slice(60)],'TCX').stream.splitSec,null);
const reset=points.map((p,i)=>({...p,distance:i>=60?p.distance-2000:p.distance}));
assert.equal(S.summarize([reset],'TCX').stream.decPct,null);
assert.throws(()=>S.summarize([[{time:0,distance:0},{time:1000,distance:500}]],'TCX'),/No usable/);
assert.equal(S.metres({lat:null,lon:0},{lat:0,lon:0}),null);
assert.ok(Math.abs(S.metres({lat:0,lon:0},{lat:0,lon:.001})-111.1949)<.01);
// Tail of a "last N @ MP" run: the final 2 km of this 4 km track ran at 160 bpm.
const tailed = S.summarize([points],'TCX',{tailKm:1.4});
assert.ok(Math.abs(tailed.values.mpKm-1.4)<0.01); assert.equal(tailed.values.mpHr,160);
assert.ok(Math.abs(tailed.values.mpPaceSec-(540/2)*1)<2, 'tail pace from the final km: '+tailed.values.mpPaceSec);
assert.equal(S.summarize([gap],'TCX',{tailKm:1}).values.mpHr,undefined);
assert.ok(S.summarize([gap],'TCX',{tailKm:1}).warnings.some(w=>/final 1 km/.test(w)));
assert.equal(S.summarize([points],'TCX').values.mpHr,undefined);
console.log('Run stream: time weighting, equal-distance halves, missing HR, gaps, resets, segments and GPS distance passed');
// The reps of a session by time (v5.22): the n windows that cover the most ground, in order.
const synth = (parts) => { const pts=[{time:0,distance:0,hr:120}]; let t=0,d=0; for (const [sec,pace,h0,h1] of parts) for (let i=1;i<=sec;i++){ t++; d+=1000/pace; pts.push({time:t*1000,distance:d,hr:h0+(h1-h0)*Math.min(1,i/120)}); } return pts; };
const tempo = synth([[600,360,120,140],[900,260,140,175],[180,420,175,150],[900,270,150,177],[480,370,177,145]]);
const two = S.summarize([tempo],'Strava',{moving:true,reps:{n:2,sec:900,standOut:.1}}).stream.reps;
assert.equal(two.n,2); assert.equal(two.sec,900); assert.equal(two.list.length,2);
assert.deepEqual(two.list.map(r=>r.at),[600,1680]);
assert.deepEqual(two.list.map(r=>Math.round(900/r.km)),[260,270]);
assert.ok(two.list[0].hr2>two.list[0].hr1 && Math.round(two.list[0].hr2)===175,'a rep keeps each half’s heart rate: '+JSON.stringify(two.list[0]));
assert.ok(Math.abs(two.list[0].km1*2-two.list[0].km)<0.002);
assert.deepEqual(Object.keys(two.list[0]).sort(),['at','hr1','hr2','km','km1'],'a rep is a summary, never the trace');
// one continuous tempo; six short reps keep their order
assert.deepEqual(S.summarize([synth([[600,360,120,140],[1500,262,140,172],[600,370,172,140]])],'Strava',{moving:true,reps:{n:1,sec:1500,standOut:.1}}).stream.reps.list.map(r=>[r.at,Math.round(1500/r.km)]),[[600,262]]);
const sixParts=[[600,360,120,140]]; for (let i=0;i<6;i++) sixParts.push([180,255+i,150,170+i],[90,420,170,150]); sixParts.push([600,370,170,140]);
assert.deepEqual(S.summarize([synth(sixParts)],'Strava',{moving:true,reps:{n:6,sec:180,standOut:.1}}).stream.reps.list.map(r=>Math.round(180/r.km)),[255,256,257,258,259,260]);
// an abandoned session has no reps: its fastest 2 × 15 min do not stand out
const flat = S.summarize([synth([[3000,360,120,140]])],'Strava',{moving:true,reps:{n:2,sec:900,standOut:.1}});
assert.deepEqual(flat.stream.reps,{n:2,sec:900,list:[]}); assert.ok(flat.warnings.some(w=>/2 × 15 min could not be told apart/.test(w)));
// too short a run, a break in the clock, or two segments: looked for, not found
assert.deepEqual(S.summarize([synth([[600,300,120,150]])],'Strava',{moving:true,reps:{n:2,sec:900,standOut:.1}}).stream.reps.list,[]);
const broken = tempo.map((p,i)=>({...p,time:p.time+(i>=700?90000:0)}));
assert.deepEqual(S.summarize([broken],'TCX',{reps:{n:2,sec:900,standOut:.1}}).stream.reps.list,[]);
assert.deepEqual(S.summarize([tempo.slice(0,1500),tempo.slice(1499)],'TCX',{reps:{n:2,sec:900,standOut:.1}}).stream.reps.list,[]);
// one stray GPS sample does not spoil a rep (its metres are dropped); a noisy track does
const blip = tempo.map((p,i)=>({...p,distance:p.distance+(i>=800?40:0)}));
assert.equal(S.summarize([blip],'Strava',{moving:true,reps:{n:2,sec:900,standOut:.1}}).stream.reps.list.length,2);
const noisy = tempo.map((p,i)=>({...p,distance:p.distance+40*Math.min(5,Math.floor(i/400))}));
assert.deepEqual(S.summarize([noisy],'Strava',{moving:true,reps:{n:2,sec:900,standOut:.1}}).stream.reps.list,[]);
// not asked for, not stored
assert.equal(S.summarize([tempo],'Strava',{moving:true}).stream.reps,undefined);
