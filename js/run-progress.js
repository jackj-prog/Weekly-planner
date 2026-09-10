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
    const longest = entries.length > 1 ? entries.reduce((a,b) => b.km>a.km ? b : a) : null;
    return { entries, bests, longest, runs: entries.length, weeks: weeks.size,
      km: Math.round(entries.reduce((sum,e) => sum+e.km,0)*1000)/1000 };
  }
  return { summarize };
}));
