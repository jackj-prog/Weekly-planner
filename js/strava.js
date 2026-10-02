/* Strava import (v5.12). The owner registers their own API application on
   strava.com and enters its ID and secret here once. Those, and the tokens
   Strava issues, live only in this phone's storage: never in the repo,
   never in a backup (the backup takes an allowlist of keys and `strava` is
   not on it), never sent anywhere but strava.com. A run comes in as a
   summary plus time, distance, heart rate and moving samples — never its
   route. Everything else in the app stays offline; only an import needs
   the network. */
(function (root) {
  'use strict';
  const KEY = 'strava', PENDING = 'strava-pending';
  const API = 'https://www.strava.com/api/v3', OAUTH = 'https://www.strava.com/oauth';
  const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];
  const SCOPE = 'read,activity:read_all';

  class StravaError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }

  /* ---- storage: this phone only ---- */
  const store = () => root.localStorage;
  function read(k) {
    try { const v = JSON.parse(store().getItem(k) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
  }
  function write(k, v) {
    try { if (v == null) store().removeItem(k); else store().setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function config() {
    const c = read(KEY);
    return c && /^\d{1,12}$/.test(String(c.id || '')) && typeof c.secret === 'string' && c.secret ? c : null;
  }
  const connected = () => { const c = config(); return !!(c && c.refresh); };
  function saveApp(id, secret) {
    id = String(id || '').trim(); secret = String(secret || '').trim();
    if (!/^\d{1,12}$/.test(id)) throw new StravaError('input', 'The Client ID is the number on your Strava API page.');
    if (!/^[A-Za-z0-9]{20,80}$/.test(secret)) throw new StravaError('input', 'The Client Secret is the long code under “Client Secret” (tap “show” on Strava).');
    const was = config();
    /* a different app invalidates the old tokens */
    const next = was && was.id === id && was.secret === secret ? was : { id, secret };
    if (!write(KEY, next)) throw new StravaError('storage', 'This phone refused to save it. Free some storage and try again.');
    return next;
  }
  function forget() {
    const c = config();
    write(KEY, null); write(PENDING, null);
    /* best effort: tell Strava too, so the app leaves your Strava settings */
    if (c && c.access && root.fetch) {
      root.fetch(OAUTH + '/deauthorize', { method: 'POST', body: new URLSearchParams({ access_token: c.access }) }).catch(() => {});
    }
  }

  /* ---- the connect round trip ---- */
  const redirectUri = () => new URL('./', root.location.href).href;
  function randomState() {
    const a = new Uint8Array(16);
    (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  function authorizeUrl() {
    const c = config();
    if (!c) throw new StravaError('input', 'Enter the Client ID and Client Secret first.');
    const st = randomState();
    write(PENDING, { state: st, at: Date.now() });
    return OAUTH + '/authorize?' + new URLSearchParams({
      client_id: c.id, response_type: 'code', redirect_uri: redirectUri(),
      approval_prompt: 'auto', scope: SCOPE, state: st,
    });
  }
  /* What Strava sent back in the address, if anything. */
  function callback(search) {
    const q = new URLSearchParams(search || '');
    if (!q.has('code') && !q.has('error')) return null;
    if (!q.has('state') && !q.has('scope') && !q.has('error')) return null;   // not ours
    return { code: q.get('code') || '', state: q.get('state') || '', scope: q.get('scope'), error: q.get('error') || '' };
  }
  /* Can this copy of the app finish the round trip by itself? Only if it
     started it: an iPhone may bring Strava's answer back in Safari, whose
     storage is not the Home Screen app's. Then the code is copied across. */
  function ownsCallback(cb) {
    const p = read(PENDING), c = config();
    return !!(cb && cb.code && c && p && p.state && p.state === cb.state && Date.now() - p.at < 3600000);
  }
  const grantsActivities = (scope) => scope == null || /\bactivity:read(_all)?\b/.test(scope);

  async function post(params) {
    let res;
    try { res = await root.fetch(OAUTH + '/token', { method: 'POST', body: new URLSearchParams(params) }); }
    catch (e) { throw new StravaError('network', 'Couldn’t reach Strava. Check the connection; if it keeps happening, Strava may not accept requests from this app.'); }
    const body = await res.json().catch(() => ({}));
    if (res.status === 400 || res.status === 401) throw new StravaError('auth', body && body.message === 'Bad Request'
      ? 'Strava refused the code or the app keys. Check the Client ID and Secret, then connect again — a code works once, for a few minutes.'
      : 'Strava refused the request (' + res.status + '). Check the Client ID and Secret, then connect again.');
    if (!res.ok || !body.access_token) throw new StravaError('http', 'Strava answered ' + res.status + '. Try again in a minute.');
    return body;
  }
  function keep(body, scope) {
    const c = config() || {};
    const next = Object.assign({}, c, { access: body.access_token, refresh: body.refresh_token || c.refresh, expires: +body.expires_at || 0 });
    if (scope !== undefined) next.scope = scope;
    if (!next.since) next.since = new Date().toISOString().slice(0, 10);
    if (!write(KEY, next)) throw new StravaError('storage', 'This phone refused to save the connection. Free some storage and try again.');
    return next;
  }
  async function exchange(code, scope) {
    const c = config();
    if (!c) throw new StravaError('input', 'Enter the Client ID and Client Secret first.');
    code = String(code || '').trim();
    if (!/^[A-Za-z0-9]{8,80}$/.test(code)) throw new StravaError('input', 'That doesn’t look like a code from Strava.');
    if (scope != null && !grantsActivities(scope)) {
      write(PENDING, null);
      throw new StravaError('scope', 'Strava didn’t share your activities. Connect again and leave “View data about your activities” ticked.');
    }
    const body = await post({ client_id: c.id, client_secret: c.secret, code, grant_type: 'authorization_code' });
    write(PENDING, null);
    return keep(body, scope == null ? null : scope);
  }
  async function token() {
    const c = config();
    if (!c || !c.refresh) throw new StravaError('auth', 'Strava isn’t connected on this phone. Connect it in Reference → Strava.');
    if (c.access && c.expires * 1000 > Date.now() + 120000) return c.access;
    const body = await post({ client_id: c.id, client_secret: c.secret, grant_type: 'refresh_token', refresh_token: c.refresh });
    return keep(body).access;
  }
  async function api(path, retried) {
    const access = await token();
    let res;
    try { res = await root.fetch(API + path, { headers: { Authorization: 'Bearer ' + access } }); }
    catch (e) { throw new StravaError('network', 'Couldn’t reach Strava. Check the connection; if it keeps happening, Strava may not accept requests from this app.'); }
    if (res.status === 401 && !retried) {
      const c = config(); if (c) { c.expires = 0; write(KEY, c); }
      return api(path, true);
    }
    if (res.status === 401) throw new StravaError('auth', 'Strava no longer accepts this connection. Connect again in Reference → Strava.');
    if (res.status === 403) throw new StravaError('scope', 'Strava didn’t share your activities. Connect again and leave “View data about your activities” ticked.');
    if (res.status === 404) return null;
    if (res.status === 429) throw new StravaError('rate', 'Strava’s request limit is reached. Try again in 15 minutes.');
    if (!res.ok) throw new StravaError('http', 'Strava answered ' + res.status + '. Try again in a minute.');
    return res.json();
  }

  /* ---- runs ---- */
  const localDate = (s) => String(s || '').slice(0, 10);
  /* The runs that started on a local calendar date, earliest first. */
  async function runsOn(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const after = Math.floor(new Date(y, m - 1, d).getTime() / 1000) - 1;
    const before = Math.floor(new Date(y, m - 1, d + 1).getTime() / 1000);
    const list = await api('/athlete/activities?' + new URLSearchParams({ after, before, per_page: 30 }));
    return (Array.isArray(list) ? list : [])
      .filter((a) => a && RUN_TYPES.includes(a.sport_type || a.type) && localDate(a.start_date_local) === iso && a.distance > 0 && a.moving_time > 0)
      .sort((a, b) => String(a.start_date_local).localeCompare(String(b.start_date_local)))
      .map(brief);
  }
  function brief(a) {
    return { id: a.id, name: String(a.name || 'Run').slice(0, 80), start: String(a.start_date_local || '').slice(11, 16),
      date: localDate(a.start_date_local), km: a.distance / 1000, sec: a.moving_time,
      hr: a.has_heartrate && a.average_heartrate > 0 ? a.average_heartrate : null, manual: !!a.manual };
  }
  const series = (streams, key) => {
    if (Array.isArray(streams)) { const s = streams.find((x) => x && x.type === key); return s && Array.isArray(s.data) ? s.data : null; }
    return streams && streams[key] && Array.isArray(streams[key].data) ? streams[key].data : null;
  };
  /* Strava's numbers are the ones the owner sees there — distance, moving
     time, average HR — so those fill the form. The samples, put on moving
     time (a stop or an auto-pause drops out, as Strava itself does), give
     the halves, the HR distribution and a "last N @ MP" finish. */
  function fromStreams(run, streams, opts) {
    const values = { km: Math.round(run.km * 100) / 100, sec: Math.round(run.sec) };
    values.paceSec = values.sec / values.km;
    if (run.hr) values.hr = Math.round(run.hr);
    const warnings = [];
    let stream = null;
    const t = series(streams, 'time'), dist = series(streams, 'distance'), hr = series(streams, 'heartrate'), mov = series(streams, 'moving');
    if (t && dist && t.length === dist.length && t.length > 10 && root.RunStream) {
      const pts = [{ time: 0, distance: 0, hr: hr ? hr[0] : null }];
      let clock = 0, metres = 0;
      for (let i = 1; i < t.length; i++) {
        const dt = t[i] - t[i - 1], dd = dist[i] - dist[i - 1];
        if (!(dt > 0) || !(dd >= 0) || dt > 30 || (mov && mov[i] === false)) continue;
        clock += dt; metres += dd;
        pts.push({ time: clock * 1000, distance: metres, hr: hr && Number.isFinite(hr[i]) ? hr[i] : null });
      }
      try {
        const s = root.RunStream.summarize([pts], 'Strava', { tailKm: opts && opts.tailKm, moving: true });
        stream = s.stream;
        if (s.values.mpPaceSec) { values.mpKm = s.values.mpKm; values.mpPaceSec = s.values.mpPaceSec; values.mpHr = s.values.mpHr; }
        s.warnings.forEach((w) => warnings.push(w));
      } catch (e) { warnings.push('Strava’s samples for this run couldn’t be read; the summary is imported without the half-run analysis.'); }
    } else {
      warnings.push(run.manual ? 'A manual entry on Strava has no samples, so there is no half-run analysis.' : 'Strava has no samples for this run, so there is no half-run analysis.');
    }
    if (!values.hr) warnings.push('No heart rate on Strava for this run.');
    return { values, stream, warnings, date: run.date, source: 'Strava', name: run.name };
  }
  async function importRun(run, opts) {
    const streams = run.manual ? null : await api('/activities/' + encodeURIComponent(run.id) + '/streams?' +
      new URLSearchParams({ keys: 'time,distance,heartrate,moving', key_by_type: 'true' }));
    return fromStreams(run, streams, opts);
  }

  const api$ = { KEY, PENDING, StravaError, config, connected, saveApp, forget, redirectUri, authorizeUrl, callback,
    ownsCallback, exchange, token, runsOn, importRun, fromStreams, brief };
  if (typeof module !== 'undefined' && module.exports) module.exports = api$;
  else root.Strava = api$;
}(typeof window !== 'undefined' ? window : globalThis));
