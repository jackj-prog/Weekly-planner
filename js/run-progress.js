/* Facts from saved whole-run logs; never infer race or segment performances. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RunProgress = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function summarize(history, today) {
    const byDate = new Map();
    history.forEach(e => {
      if (e.iso <= today && /^\d{4}-\d{2}-\d{2}$/.test(e.iso) && Number.isFinite(Date.parse(e.iso)) &&
          Number.isFinite(e.km) && e.km > 0 && Number.isFinite(e.sec) && e.sec > 0) byDate.set(e.iso, e);
    });
    const entries = Array.from(byDate.values()).sort((a,b) => a.iso.localeCompare(b.iso));
    const weeks = new Set(entries.map(e => {
      const d = new Date(e.iso + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+6)%7);
      return d.toISOString().slice(0,10);
    }));
    const groups = new Map();
    entries.forEach(e => {
      if (e.estimatedKm === true) return;
      // Exact whole-run distance. No extrapolation or rounding a
      // near-distance run into a standard-distance record.
      const key = String(e.km);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    });
    const bests = [];
    groups.forEach(group => {
      if (group.length < 2) return; // One observation is a baseline, not a PB.
      const best = group.reduce((a,b) => b.sec < a.sec ? b : a);
      bests.push({ ...best, compared: group.length });
    });
    bests.sort((a,b) => b.iso.localeCompare(a.iso) || a.km-b.km);
    const eligible = entries.filter(e => e.estimatedKm !== true);
    const longest = eligible.length > 1 ? eligible.reduce((a,b) => b.km>a.km ? b : a) : null;
    return { entries, bests, longest, runs: entries.length, weeks: weeks.size,
      km: Math.round(entries.reduce((sum,e) => sum+e.km,0)*1000)/1000 };
  }
  /* A saved whole run as it stood on its date, never compared with later logs.
     history: [{iso, km, sec, cls?, hr?, estimatedKm?}], one whole run per date.
     Last valid duplicate wins, matching summarize. Missing/invalid/future
     selections return null; inputs are not mutated.

     current/previous are input entries; previous is the latest of the same
     classified effort. deltaPaceSec = previous sec/km - current sec/km
     (positive = quicker); deltaHr = current - previous, or null if missing.
     Neither delta is a fitness judgement or rounded before comparison.
     best = {run, previous, count, gainSec}, only for a strict improvement on
     the earlier fastest whole run at exactly this distance. count includes
     current. longest = {run, previous, previousKm, gainKm}, also strict.
     Both need an earlier eligible observation; estimatedKm:true entries
     cannot establish records or their baselines.
     totalKm/runCount include estimates through current, with estimatedCount
     for disclosure. totalKm rounds to 0.001 km; milestone is the highest
     100 km boundary crossed by current, or null, computed before rounding. */
  function debrief(history, iso, today) {
    const validDate = value => typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + 'T12:00:00Z')) &&
      new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
    if (!validDate(iso) || !validDate(today) || iso > today) return null;
    const byDate = new Map();
    (Array.isArray(history) ? history : []).forEach(e => {
      if (e && validDate(e.iso) && e.iso <= iso &&
          Number.isFinite(e.km) && e.km > 0 && Number.isFinite(e.sec) && e.sec > 0) {
        byDate.set(e.iso, e);
      }
    });
    const current = byDate.get(iso);
    if (!current) return null;
    const entries = Array.from(byDate.values()).sort((a, b) => a.iso.localeCompare(b.iso));
    const earlier = entries.slice(0, -1);
    const previous = typeof current.cls === 'string' && current.cls.trim() && current.cls !== 'unclassified'
      ? earlier.slice().reverse().find(e => e.cls === current.cls) || null : null;
    const deltaPaceSec = previous ? previous.sec / previous.km - current.sec / current.km : null;
    const deltaHr = previous && Number.isFinite(previous.hr) && previous.hr > 0 &&
      Number.isFinite(current.hr) && current.hr > 0 ? current.hr - previous.hr : null;
    const eligible = earlier.filter(e => e.estimatedKm !== true);
    let best = null, longest = null;
    if (current.estimatedKm !== true && eligible.length) {
      const sameDistance = eligible.filter(e => e.km === current.km);
      const fastest = sameDistance.reduce((a, b) => !a || b.sec < a.sec ? b : a, null);
      if (fastest && current.sec < fastest.sec) {
        best = {run: current, previous: fastest, count: sameDistance.length + 1, gainSec: fastest.sec - current.sec};
      }
      const farthest = eligible.reduce((a, b) => b.km > a.km ? b : a);
      if (current.km > farthest.km) {
        longest = {run: current, previous: farthest, previousKm: farthest.km, gainKm: current.km - farthest.km};
      }
    }
    const priorKm = earlier.reduce((sum, e) => sum + e.km, 0);
    const total = priorKm + current.km;
    // The tiny tolerance avoids decimal addition missing an exact boundary;
    // display rounding must not turn 99.9999 km into a 100 km milestone.
    const boundary = value => Math.floor((value + 1e-9) / 100) * 100;
    const crossed = boundary(total);
    return {current, previous, deltaPaceSec, deltaHr, best, longest,
      totalKm: Math.round(total * 1000) / 1000, runCount: entries.length,
      milestone: crossed > boundary(priorKm) ? crossed : null,
      estimatedCount: entries.filter(e => e.estimatedKm === true).length};
  }
  return { summarize, debrief };
}));
