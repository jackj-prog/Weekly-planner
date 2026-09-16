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
  function summarize(segments, source) {
    const intervals = [], warnings = [];
    let sec = 0, distance = 0, gaps = 0, missingHR = 0;
    const histogram = new Map();
    for (const points of segments) {
      for (let i=1; i<points.length; i++) {
        const a=points[i-1], b=points[i], dt=(b.time-a.time)/1000;
        if (!finite(dt) || dt <= 0 || dt > 86400) { gaps++; continue; }
        let dm = finite(a.distance) && finite(b.distance) ? b.distance-a.distance : metres(a,b);
        if (!finite(dm) || dm < 0 || dm/dt > 15) { gaps++; dm=0; }
        const hr = finite(a.hr) && a.hr > 0 && a.hr <= 300 && dt <= 30 ? Math.round(a.hr) : null;
        if (hr) histogram.set(hr,(histogram.get(hr)||0)+dt); else missingHR += dt;
        if (dt > 30) gaps++;
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
    if (source === 'GPX') warnings.push('Distance is estimated from GPS points; it may differ from your watch.');
    warnings.push('Track time includes recorded stops within each segment. Check it against your moving time; editing distance, time or HR removes stream analysis.');
    if (gaps) warnings.push('Gaps or invalid samples found. No half-run comparison is reported.');
    if (segments.length > 1) warnings.push('Separate tracks are not joined across pauses; no half-run comparison is reported.');
    if (missingHR) warnings.push(Math.round(missingHR) + ' seconds have no usable HR. Missing time is excluded from measured zones.');
    return { values: {km: Math.round(distance)/1000,sec,paceSec:sec/(distance/1000),hr:complete ? Math.round(avg) : null},
      stream: {source,hrSeconds,coveredSec:hrTime,sec,decPct,splitSec,halves:halves.map(h=>({sec:h.sec,km:h.metres/1000,hr:h.sec?h.beats/h.sec:null}))}, warnings };
  }
  function parseXML(text) {
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
    const result=summarize(segments,source);
    if (firstTime!==null) {const d=new Date(firstTime);result.date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
    return result;
  }
  const api={metres,summarize,parseXML};
  if (typeof module!=='undefined' && module.exports) module.exports=api; else root.RunStream=api;
}(typeof window!=='undefined'?window:globalThis));
