'use strict';
/* Strava import (v5.12) against a fake Strava. Invented fixture only. */
const assert = require('assert/strict');

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.location = { href: 'https://example.github.io/week-os/index.html' };
globalThis.RunStream = require('../js/run-stream');
let calls = [], answer = () => ({ status: 500, body: {} });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init: init || {} });
  const a = answer(String(url), init || {});
  if (a === 'offline') throw new TypeError('Failed to fetch');
  return { status: a.status, ok: a.status >= 200 && a.status < 300, json: async () => a.body };
};
const S = require('../js/strava');
const run = async (p) => { try { return await p; } catch (e) { return e; } };

module.exports = (async () => {
  // the callback in the address: ours, an error, or nothing to do with Strava
  assert.deepEqual(S.callback('?state=ab&code=c0de1234&scope=read,activity:read_all'), { code: 'c0de1234', state: 'ab', scope: 'read,activity:read_all', error: '' });
  assert.equal(S.callback('?error=access_denied&state=ab').error, 'access_denied');
  assert.equal(S.callback('?view=week'), null);
  assert.equal(S.callback('?code=x'), null, 'a bare code without state or scope is not Strava’s answer');

  // app keys: validated, kept on this device only
  assert.throws(() => S.saveApp('abc', 'f'.repeat(40)), /Client ID/);
  assert.throws(() => S.saveApp('12345', 'short'), /Client Secret/);
  S.saveApp(' 12345 ', 'f'.repeat(40));
  assert.deepEqual(JSON.parse(mem.get('strava')), { id: '12345', secret: 'f'.repeat(40) });
  assert.equal(S.connected(), false);

  // the authorize address carries the app's own redirect and a one-off state
  const url = new URL(S.authorizeUrl());
  assert.equal(url.origin + url.pathname, 'https://www.strava.com/oauth/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.github.io/week-os/');
  assert.equal(url.searchParams.get('scope'), 'read,activity:read_all');
  const st = url.searchParams.get('state');
  assert.ok(/^[0-9a-f]{32}$/.test(st));
  assert.equal(S.ownsCallback({ code: 'c0de1234', state: st }), true);
  assert.equal(S.ownsCallback({ code: 'c0de1234', state: 'other' }), false, 'a code another copy of the app started is not finished here');

  // a refused scope never reaches the token endpoint
  calls = [];
  const noScope = await run(S.exchange('c0de1234', 'read'));
  assert.equal(noScope.kind, 'scope'); assert.equal(calls.length, 0);

  // the exchange: form-encoded, with the secret; tokens kept
  const now = Math.floor(Date.now() / 1000);
  answer = () => ({ status: 200, body: { access_token: 'acc1', refresh_token: 'ref1', expires_at: now + 21600, athlete: { firstname: 'x' } } });
  calls = [];
  await S.exchange('c0de1234', 'read,activity:read_all');
  assert.equal(calls[0].url, 'https://www.strava.com/oauth/token');
  const sent = new URLSearchParams(calls[0].init.body);
  assert.equal(sent.get('grant_type'), 'authorization_code'); assert.equal(sent.get('client_secret'), 'f'.repeat(40));
  const kept = JSON.parse(mem.get('strava'));
  assert.equal(kept.access, 'acc1'); assert.equal(kept.refresh, 'ref1'); assert.equal(kept.scope, 'read,activity:read_all');
  assert.equal(kept.athlete, undefined, 'nothing about the athlete is stored');
  assert.equal(mem.has('strava-pending'), false);
  assert.equal(S.connected(), true);

  // an expired token is refreshed before the call, and the new one kept
  kept.expires = now - 10; mem.set('strava', JSON.stringify(kept));
  answer = (u) => u.includes('/oauth/token') ? { status: 200, body: { access_token: 'acc2', refresh_token: 'ref2', expires_at: now + 21600 } } : { status: 200, body: [] };
  calls = [];
  assert.deepEqual(await S.runsOn('2026-10-01'), []);
  assert.equal(new URLSearchParams(calls[0].init.body).get('grant_type'), 'refresh_token');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer acc2');
  assert.equal(JSON.parse(mem.get('strava')).refresh, 'ref2');

  // the day's window is the local calendar day; only runs started on it
  const q = new URL(calls[1].url).searchParams;
  assert.equal(+q.get('before') - +q.get('after'), 86401);
  answer = () => ({ status: 200, body: [
    { id: 1, name: 'Ride', sport_type: 'Ride', start_date_local: '2026-10-01T07:00:00Z', distance: 20000, moving_time: 3600 },
    { id: 3, name: 'Evening Run', sport_type: 'Run', start_date_local: '2026-10-01T17:12:00Z', distance: 5040.2, moving_time: 1900, has_heartrate: true, average_heartrate: 141.6 },
    { id: 2, name: 'Morning Run', type: 'Run', start_date_local: '2026-10-01T06:40:00Z', distance: 3000, moving_time: 1140, has_heartrate: false },
    { id: 4, name: 'Late', sport_type: 'Run', start_date_local: '2026-10-02T00:10:00Z', distance: 3000, moving_time: 1140 },
  ] });
  const runs = await S.runsOn('2026-10-01');
  assert.deepEqual(runs.map((r) => r.id), [2, 3], 'runs only, that day only, earliest first');
  assert.equal(runs[1].start, '17:12'); assert.equal(runs[1].hr, 141.6); assert.equal(runs[0].hr, null);

  // errors say what to do
  answer = () => 'offline';
  assert.equal((await run(S.runsOn('2026-10-01'))).kind, 'network');
  answer = () => ({ status: 429, body: {} });
  assert.equal((await run(S.runsOn('2026-10-01'))).kind, 'rate');
  answer = (u) => u.includes('/oauth/token') ? { status: 200, body: { access_token: 'acc3', refresh_token: 'ref3', expires_at: now + 21600 } } : { status: 401, body: {} };
  calls = [];
  const revoked = await run(S.runsOn('2026-10-01'));
  assert.equal(revoked.kind, 'auth');
  assert.equal(calls.filter((c) => c.url.includes('/oauth/token')).length, 1, 'one refresh, then it says so');

  // samples onto moving time: a stop drops out; Strava's own numbers fill the form
  const t = [], dist = [], hr = [], moving = [];
  let clock = 0, m = 0;
  for (let i = 0; i <= 400; i++) {
    if (i === 200) { clock += 90; }                       // a 90 s pause at a crossing (auto-pause: no samples)
    t.push(clock); dist.push(m); hr.push(i < 200 ? 140 : 150); moving.push(true);
    clock += 5; m += 12.5;                                 // 2.5 m/s
  }
  const streams = { time: { data: t }, distance: { data: dist }, heartrate: { data: hr }, moving: { data: moving } };
  const brief = { id: 9, name: 'Tempo', date: '2026-10-01', km: 5.0123, sec: 2000, hr: 145.4, manual: false };
  const pv = S.fromStreams(brief, streams, { tailKm: 1 });
  assert.equal(pv.source, 'Strava'); assert.equal(pv.date, '2026-10-01');
  assert.deepEqual([pv.values.km, pv.values.sec, pv.values.hr], [5.01, 2000, 145]);
  assert.equal(pv.stream.source, 'Strava');
  assert.equal(pv.stream.sec, 1995, 'moving time only: the interval spanning the pause drops out whole');
  assert.ok(Number.isFinite(pv.stream.decPct) && pv.stream.decPct > 0, 'a pause no longer voids the half-run comparison');
  assert.equal(pv.values.mpHr, 150); assert.ok(Math.abs(pv.values.mpKm - 1) < 0.01);
  assert.ok(!pv.warnings.some((w) => /Track time includes/.test(w)));
  // a manual entry: the summary alone
  const manual = S.fromStreams(Object.assign({}, brief, { manual: true, hr: null }), null, {});
  assert.equal(manual.stream, null); assert.ok(manual.warnings.some((w) => /manual/.test(w))); assert.ok(manual.warnings.some((w) => /No heart rate/.test(w)));
  // the array form of the streams answer reads the same
  const asArray = Object.keys(streams).map((k) => ({ type: k, data: streams[k].data }));
  assert.equal(S.fromStreams(brief, asArray, {}).stream.sec, 1995);

  // disconnect removes keys and tokens and tells Strava
  calls = []; answer = () => ({ status: 200, body: {} });
  S.forget();
  assert.equal(mem.has('strava'), false); assert.equal(S.connected(), false);
  assert.ok(calls.some((c) => c.url.endsWith('/oauth/deauthorize')));

  console.log('Strava: callback, keys on device, scope guard, exchange, refresh, day window, errors, moving-time samples, disconnect passed');
})();
if (require.main === module) module.exports.catch((e) => { console.error(e); process.exit(1); });
