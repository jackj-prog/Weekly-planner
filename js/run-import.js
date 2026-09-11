/* Local run input. No network, prescription, or athlete-specific defaults. */
(function (root) {
  'use strict';
  function duration(value) {
    const s = String(value).trim();
    if (/^\d+(?:\.\d+)?\s*s?$/i.test(s)) return Number(s.replace(/s/i, '')) || null;
    const p = s.split(':').map(Number);
    if (p.length < 2 || p.length > 3 || p.some(n => !Number.isFinite(n) || n < 0) ||
        p.slice(1).some(n => n >= 60)) return null;
    return p.reduce((a, n) => a * 60 + n, 0) || null;
  }
  function parseText(raw) {
    const text = String(raw).replace(/\r/g, '').replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1').replace(/(\d),(?=\d)/g, '$1.');
    const result = {}, warnings = [];
    const find = pattern => (text.match(pattern) || [])[1];
    const distance = text.match(/\b(?:distance|dist)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(km|kilomet(?:er|re)s?|m|met(?:er|re)s?|mi|miles?)\b/i) ||
      text.match(/\b(\d+(?:\.\d+)?)\s*(km|kilomet(?:er|re)s?|miles?|mi)\b(?!\s*\/)/i);
    if (distance) result.km = +distance[1] * (/^mi/i.test(distance[2]) ? 1.609344 : /^m(?:$|et)/i.test(distance[2]) ? .001 : 1);
    const time = find(/\b(?:moving(?:[ _-]*(?:time|duration))?|duration|time)\s*[:=]?\s*(\d+:\d{2}(?::\d{2})?|\d+(?:\.\d+)?\s*s)\b/i);
    if (time) result.sec = duration(time);
    const pace = find(/\b(?:avg[ _-]*pace|average[ _-]*pace|pace)\s*[:=]?\s*(\d+:\d{2})\s*(?:\/\s*km|min\s*\/\s*km)?/i);
    if (pace) result.paceSec = duration(pace);
    const hr = find(/\b(?:HR[ _-]*avg|avg[ _-]*HR|average[ _-]*(?:HR|heart[ _-]*rate)|avg[ _-]*heart[ _-]*rate|HR)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (hr) result.hr = Math.round(+hr);
    const temp = text.match(/\b(?:feels[ _-]*like|temperature|temp)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*°?\s*([CF])?\b/i);
    if (temp) result.temp = temp[2] && temp[2].toUpperCase() === 'F' ? Math.round((+temp[1] - 32) * 5 / 9 * 10) / 10 : +temp[1];
    if (result.km && result.sec) {
      const computed = result.sec / result.km;
      if (result.paceSec && Math.abs(computed - result.paceSec) > 2) warnings.push('Time and distance disagree with the pasted pace; using time ÷ distance.');
      result.paceSec = computed;
    } else if (result.km && result.paceSec) result.sec = Math.round(result.km * result.paceSec);
    else if (result.sec && result.paceSec) { result.km = result.sec / result.paceSec; warnings.push('Distance calculated from time and pace.'); }
    if (!(result.km > 0) || result.km > 1000) delete result.km;
    if (!(result.sec > 0) || result.sec > 604800) delete result.sec;
    if (!(result.paceSec > 0)) delete result.paceSec;
    if (!(result.hr > 0) || result.hr > 300) delete result.hr;
    if (result.temp != null && (result.temp < -60 || result.temp > 65)) delete result.temp;
    if (!Object.keys(result).length) warnings.push('No run values found. Try labelled distance, moving time, average HR or temperature.');
    return { values: result, warnings };
  }
  const api = { duration, parseText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RunImport = api;
}(typeof window !== 'undefined' ? window : globalThis));
