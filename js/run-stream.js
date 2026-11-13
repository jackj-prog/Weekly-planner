/* Activity files stay on this device. Persist summaries, never routes or XML. */
(function (root) {
  'use strict';
  const finite = n => Number.isFinite(n);
  function metres(a, b) {
    if (![a.lat, a.lon, b.lat, b.lon].every(finite) || Math.abs(a.lat) > 90 || Math.abs(b.lat) > 90 || Math.abs(a.lon) > 180 || Math.abs(b.lon) > 180) return null;
    const rad = Math.PI / 180, dy = (b.lat-a.lat)*rad, dx = (b.lon-a.lon)*rad;
    const h = Math.sin(dy/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dx/2)**2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
  }
  /* The n non-overlapping windows of L grid steps with the largest total
     score, in order: most[a] is the best k windows can do when all start
     at or after a. Ties go to the earlier window. */
  function pickWindows(S, L, n, score) {
    let prev = new Float64Array(S + 2);
    const takes = [];
    for (let k = 1; k <= n; k++) {
      const cur = new Float64Array(S + 2).fill(-Infinity), take = new Uint8Array(S + 2);
      for (let a = S - k * L; a >= 0; a--) {
        const here = score(a) + prev[a + L];
        if (here >= cur[a + 1]) { cur[a] = here; take[a] = 1; } else cur[a] = cur[a + 1];
      }
      takes.push(take); prev = cur;
    }
    const starts = [];
    let a = 0;
    for (let k = n; k >= 1; k--) {
      const take = takes[k - 1];
      while (a <= S - k * L && !take[a]) a++;
      starts.push(a); a += L;
    }
    return starts;
  }
  /* A marathon-pace block that is not a finish (v5.23): "12 @ MP" mid-run,
     "2×5 @ MP", "mid 6–8 @ MP". The same search on a 10-metre grid of
     distance: the n windows of `km` that take the least time. A range
     ("6–8") is read as the longest length whose fastest window is within
     `tolSec` s/km of the shortest's, so the extra kilometres count only
     if they were run at the pace. Null unless the block stands out from
     the rest of the run. Returns where it sat, its time and its average
     heart rate (time-weighted, as an average heart rate is). */
  const STEP_M = 10;
  function findBlock(intervals, totalM, spec) {
    const n = Math.round(spec.n), S = Math.floor(totalM / STEP_M + 1e-6);
    if (!(n > 0 && n <= 10 && spec.km >= 1 && S <= 100000)) return null;
    const ct = new Float64Array(S + 1), cb = new Float64Array(S + 1), ch = new Float64Array(S + 1);
    let t = 0, m = 0, beats = 0, cov = 0, g = 1;
    for (const iv of intervals) {
      if (iv.metres > 0) for (; g <= S && g * STEP_M <= m + iv.metres + 1e-9; g++) {
        const f = Math.min(1, (g * STEP_M - m) / iv.metres);
        ct[g] = t + iv.sec * f; cb[g] = beats + (iv.hr || 0) * iv.sec * f; ch[g] = cov + (iv.hr ? iv.sec * f : 0);
      }
      t += iv.sec; m += iv.metres; beats += (iv.hr || 0) * iv.sec; cov += iv.hr ? iv.sec : 0;
    }
    for (; g <= S; g++) { ct[g] = t; cb[g] = beats; ch[g] = cov; }
    const read = (km) => {
      const L = Math.round(km * 1000 / STEP_M);
      if (!(n * L < S)) return null;
      const starts = pickWindows(S, L, n, (a) => ct[a] - ct[a + L]);
      let sec = 0, bt = 0, hs = 0;
      for (const a of starts) { sec += ct[a + L] - ct[a]; bt += cb[a + L] - cb[a]; hs += ch[a + L] - ch[a]; }
      return sec > 0 ? { km: n * km, sec, paceSec: sec / (n * km), hr: hs >= sec * 0.95 ? bt / hs : null, fromKm: starts[0] * STEP_M / 1000, L, starts } : null;
    };
    let best = read(spec.km);
    if (!best) return null;
    for (let km = Math.floor(spec.kmMax || 0); n === 1 && km > spec.km; km--) {
      const longer = read(km);
      if (longer && longer.paceSec <= best.paceSec + (spec.tolSec || 0)) { best = longer; break; }
    }
    const restSec = ct[S] - best.sec, restM = S * STEP_M - best.km * 1000;
    if (restSec >= 60 && restM > 0 && spec.standOut > 0 && best.paceSec > (restSec / (restM / 1000)) * (1 - spec.standOut)) return null;
    return { km: best.km, sec: best.sec, paceSec: best.paceSec, hr: best.hr, fromKm: best.fromKm };
  }
  /* The reps of a session by time (v5.22): the n non-overlapping windows of
     `sec` seconds that cover the most ground, taken in order on a
     one-second grid of the track's own clock. Each rep keeps its distance
     (and its first half's) and each half's average heart rate — a summary,
     never the trace. An empty list means the track was read and the reps
     were not there: they must stand out from the rest of the run, or an
     abandoned session's "fastest 2 × 15 min" would be read back as reps. */
  function findReps(intervals, total, spec) {
    const n = Math.round(spec.n), L = Math.round(spec.sec), S = Math.floor(total + 1e-6);
    if (!(n > 0 && n <= 20 && L >= 30 && L % 2 === 0 && n * L <= S && S <= 86400)) return [];
    const cd = new Float64Array(S + 1), cb = new Float64Array(S + 1), ch = new Float64Array(S + 1);
    let t = 0, m = 0, beats = 0, cov = 0, s = 1;
    for (const iv of intervals) {
      const t1 = t + iv.sec;
      for (; s <= S && s <= t1 + 1e-9; s++) {
        const f = Math.min(1, (s - t) / iv.sec);
        cd[s] = m + iv.metres * f; cb[s] = beats + (iv.hr || 0) * iv.sec * f; ch[s] = cov + (iv.hr ? iv.sec * f : 0);
      }
      t = t1; m += iv.metres; beats += (iv.hr || 0) * iv.sec; cov += iv.hr ? iv.sec : 0;
    }
    for (; s <= S; s++) { cd[s] = m; cb[s] = beats; ch[s] = cov; }
    const starts = pickWindows(S, L, n, (a) => cd[a + L] - cd[a]);
    const list = [], h = L / 2;
    const hrOver = (a, b) => (ch[b] - ch[a] >= (b - a) * 0.9 ? (cb[b] - cb[a]) / (ch[b] - ch[a]) : null);
    let repM = 0;
    for (const a of starts) {
      const dm = cd[a + L] - cd[a];
      if (!(dm > 0)) return [];
      const r1 = hrOver(a, a + h), r2 = hrOver(a + h, a + L);
      list.push({ at: a, km: Math.round(dm) / 1000, km1: Math.round(cd[a + h] - cd[a]) / 1000,
        hr1: r1 == null ? null : Math.round(r1 * 10) / 10, hr2: r2 == null ? null : Math.round(r2 * 10) / 10 });
      repM += dm;
    }
    const restSec = S - n * L, restM = cd[S] - repM;
    if (restSec >= 60 && restM > 0 && spec.standOut > 0 && (n * L) / repM > (restSec / restM) * (1 - spec.standOut)) return [];
    return list;
  }
  function summarize(segments, source, opts) {
    const intervals = [], warnings = [];
    let sec = 0, distance = 0, gaps = 0, missingHR = 0, breaks = 0, blips = 0;
    const histogram = new Map();
    for (const points of segments) {
      for (let i=1; i<points.length; i++) {
        const a=points[i-1], b=points[i], dt=(b.time-a.time)/1000;
        if (!finite(dt) || dt <= 0 || dt > 86400) { gaps++; breaks++; continue; }
        let dm = finite(a.distance) && finite(b.distance) ? b.distance-a.distance : metres(a,b);
        if (!finite(dm) || dm < 0 || dm/dt > 15) { gaps++; blips++; dm=0; }
        const hr = finite(a.hr) && a.hr > 0 && a.hr <= 300 && dt <= 30 ? Math.round(a.hr) : null;
        if (hr) histogram.set(hr,(histogram.get(hr)||0)+dt); else missingHR += dt;
        if (dt > 30) { gaps++; breaks++; }
        intervals.push({start:distance,metres:dm,sec:dt,hr});
        distance+=dm; sec+=dt;
      }
    }
    if (!(distance > 0 && sec > 0 && distance <= 1000000 && sec <= 604800)) throw new Error('No usable timed distance in this file. Export a recorded activity, not a route.');
    const hrSeconds = Array.from(histogram.entries()).sort((a,b)=>a[0]-b[0]);
    const hrTime = sec-missingHR;
    const avg = hrTime ? hrSeconds.reduce((n,[hr,time])=>n+hr*time,0)/hrTime : null;
    const halves = [{metres:0,sec:0,beats:0},{metres:0,sec:0,beats:0}];
    intervals.forEach(i=>{
      const fraction = i.metres ? Math.max(0,Math.min(1,(distance/2-i.start)/i.metres)) : i.start < distance/2 ? 1 : 0;
      [fraction,1-fraction].forEach((f,n)=>{halves[n].metres+=i.metres*f;halves[n].sec+=i.sec*f;halves[n].beats+=(i.hr||0)*i.sec*f;});
    });
    const complete = !gaps && segments.length === 1 && missingHR < .001;
    const ef = halves.map(h=>h.beats ? h.metres*60/h.beats : null);
    const decPct = complete && ef[0] && ef[1] ? (1-ef[1]/ef[0])*100 : null;
    const splitSec = !gaps && segments.length === 1 ? halves[1].sec-halves[0].sec : null;
    /* The final N km, for a "last N @ MP" long run (PLAN.mpCheck). Only on a
       clean single track: a pause or gap makes "the last N km" ambiguous. */
    let tail = null;
    const tailKm = opts && opts.tailKm;
    if (tailKm > 0 && !gaps && segments.length === 1 && distance > tailKm * 1000 + 500) {
      let m = 0, s = 0, beats = 0, hrSec = 0;
      for (let k = intervals.length - 1; k >= 0 && m < tailKm * 1000; k--) {
        const iv = intervals[k], need = tailKm * 1000 - m;
        const f = iv.metres > need ? need / iv.metres : 1;
        m += iv.metres * f; s += iv.sec * f;
        if (iv.hr) { beats += iv.hr * iv.sec * f; hrSec += iv.sec * f; }
      }
      if (s > 0 && hrSec >= s * 0.95) tail = { km: m / 1000, sec: s, hr: beats / hrSec, paceSec: s / (m / 1000) };
    }
    if (tailKm > 0 && !tail) warnings.push('The final ' + tailKm + ' km could not be read cleanly from this track; enter the MP segment by hand if you have it.');
    /* each full kilometre's time (v5.23): a race's pacing is read from these.
       They are the track's own kilometres, good against each other whatever
       the watch's distance is worth against the course. */
    let kmSec = null;
    if (!breaks && blips <= 3 && segments.length === 1 && distance >= 1000 && distance <= 200000) {
      kmSec = [];
      let m0 = 0, t0 = 0, mark = 1000, last = 0;
      for (const iv of intervals) {
        while (iv.metres > 0 && mark <= m0 + iv.metres + 1e-9) {
          const at = t0 + iv.sec * Math.min(1, (mark - m0) / iv.metres);
          kmSec.push(Math.round((at - last) * 10) / 10); last = at; mark += 1000;
        }
        m0 += iv.metres; t0 += iv.sec;
      }
    }
    /* an MP block that is not a finish (v5.23): found wherever it sits */
    const wantBlock = opts && opts.mpBlock;
    let block = null;
    if (!tail && wantBlock && wantBlock.n > 0 && wantBlock.km > 0) {
      block = !breaks && blips <= 3 && segments.length === 1 ? findBlock(intervals, distance, wantBlock) : null;
      if (!block || !block.hr) {
        block = null;
        warnings.push('The ' + (wantBlock.n > 1 ? wantBlock.n + ' × ' : '') + wantBlock.km + ' km at marathon pace could not be told apart from the rest of this track; enter the MP segment by hand if you have it.');
      }
    }
    /* the reps a session by time asks for (v5.22). A break in the clock or a
       pause split across segments leaves no single clock to find them on;
       a stray GPS sample or two (its metres dropped) does not spoil a rep */
    let reps = null;
    const want = opts && opts.reps;
    if (want && want.n > 0 && want.sec > 0) {
      reps = { n: want.n, sec: want.sec, list: !breaks && blips <= 3 && segments.length === 1 ? findReps(intervals, sec, want) : [] };
      if (!reps.list.length) warnings.push('The ' + (want.n > 1 ? want.n + ' × ' : '') + Math.round(want.sec / 60) + ' min could not be told apart from the rest of this track, so the reps are not read back.');
    }
    if (source === 'GPX') warnings.push('Distance is estimated from GPS points; it may differ from your watch.');
    /* a moving-time series (Strava's, v5.12) has its stops taken out already */
    if (!(opts && opts.moving)) warnings.push('Track time includes recorded stops within each segment. Check it against your moving time; editing distance, time or HR removes stream analysis.');
    if (gaps) warnings.push('Gaps or invalid samples found. No half-run comparison is reported.');
    if (segments.length > 1) warnings.push('Separate tracks are not joined across pauses; no half-run comparison is reported.');
    if (missingHR) warnings.push(Math.round(missingHR) + ' seconds have no usable HR. Missing time is excluded from measured zones.');
    const values = {km: Math.round(distance)/1000,sec,paceSec:sec/(distance/1000),hr:complete ? Math.round(avg) : null};
    if (tail) { values.mpKm = Math.round(tail.km * 100) / 100; values.mpPaceSec = Math.round(tail.paceSec); values.mpHr = Math.round(tail.hr); }
    else if (block) { values.mpKm = block.km; values.mpPaceSec = Math.round(block.paceSec); values.mpHr = Math.round(block.hr); values.mpFromKm = Math.round(block.fromKm * 10) / 10; }
    return { values,
      stream: Object.assign({source,hrSeconds,coveredSec:hrTime,sec,decPct,splitSec,halves:halves.map(h=>({sec:h.sec,km:h.metres/1000,hr:h.sec?h.beats/h.sec:null}))}, reps ? {reps} : {}, kmSec && kmSec.length ? {kmSec} : {}), warnings };
  }
  function parseXML(text, opts) {
    if (text.length > 20*1024*1024) throw new Error('Choose an activity file smaller than 20 MB.');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('This XML contains an unsupported document declaration.');
    const doc = new DOMParser().parseFromString(text,'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This file is not valid GPX/TCX XML.');
    const rootName=doc.documentElement.localName;
    const source=rootName==='gpx'?'GPX':rootName==='TrainingCenterDatabase'?'TCX':null;
    if (!source) throw new Error('Choose a GPX or TCX activity file.');
    const all=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
    const val=(node,name)=>{const x=all(node,name)[0]; return x ? x.textContent.trim() : null;};
    const num=x=>x != null && x!=='' && finite(Number(x)) ? Number(x) : null;
    const activities=all(doc,source==='GPX'?'trk':'Activity');
    if (activities.length!==1) throw new Error('Export one activity per file; multiple activities are not combined.');
    const groups=all(activities[0],source==='GPX'?'trkseg':'Track');
    let count=0, firstTime=null;
    const segments=groups.map(group=>all(group,source==='GPX'?'trkpt':'Trackpoint').map(p=>{
      if (++count>100000) throw new Error('This file has too many points; export a single activity.');
      const time=Date.parse(val(p,source==='GPX'?'time':'Time'));
      if (firstTime===null && finite(time)) firstTime=time;
      const hrNode=all(p,'HeartRateBpm')[0];
      return { time, distance:num(val(p,'DistanceMeters')),
        lat:num(source==='GPX'?p.getAttribute('lat'):val(p,'LatitudeDegrees')),
        lon:num(source==='GPX'?p.getAttribute('lon'):val(p,'LongitudeDegrees')),
        hr:num(source==='GPX'?val(p,'hr'):hrNode?val(hrNode,'Value'):null) };
    }));
    const result=summarize(segments,source,opts);
    if (firstTime!==null) {const d=new Date(firstTime);result.date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    return result;
  }
  const api={metres,summarize,parseXML,findReps,findBlock};
  if (typeof module!=='undefined' && module.exports) module.exports=api; else root.RunStream=api;
}(typeof window!=='undefined'?window:globalThis));
