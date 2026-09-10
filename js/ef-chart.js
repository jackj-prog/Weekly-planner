/* Presentation maths only. No training thresholds or storage. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EFChart = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function chart(history) {
    const valid = history.filter(p => Number.isFinite(p.ef) && p.ef > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.iso) && Number.isFinite(Date.parse(p.iso)))
      .slice().sort((a, b) => a.iso.localeCompare(b.iso));
    if (valid.length < 2) return null;
    // Reference stays fixed as the last-12 window moves. Removing/editing the
    // first eligible log can change it; its date and raw EF are always shown.
    const reference = valid[0];
    const recent = valid.slice(-12);
    const start = Date.parse(recent[0].iso), end = Date.parse(recent[recent.length - 1].iso);
    if (end <= start) return null;
    const values = recent.map(p => ({ ...p, pct: (p.ef / reference.ef - 1) * 100,
      t: (Date.parse(p.iso) - start) / (end - start) }));
    // At least +/-10%; expand in 5-point steps, with room around endpoints.
    // Never fit a tiny wobble to the chart's entire height.
    const extent = Math.max(10, Math.ceil((Math.max(...values.map(p => Math.abs(p.pct))) + 1) / 5) * 5);
    const left = 48, right = 326, top = 18, bottom = 158;
    const points = values.map(p => ({ ...p, x: left + p.t * (right - left),
      y: bottom - (p.pct + extent) / (2 * extent) * (bottom - top) }));
    const meanX = values.reduce((s,p) => s+p.t,0)/values.length;
    const meanY = values.reduce((s,p) => s+p.pct,0)/values.length;
    const den = values.reduce((s,p) => s+(p.t-meanX)**2,0);
    const change = den ? values.reduce((s,p) => s+(p.t-meanX)*(p.pct-meanY),0)/den : 0;
    return { reference, points, extent, change, width: 340, height: 194,
      ticks: [extent, extent/2, 0, -extent/2, -extent].map(value => ({value,
        y: bottom - (value+extent)/(2*extent)*(bottom-top)})) };
  }
  return { chart };
}));
