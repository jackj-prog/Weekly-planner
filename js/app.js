/* ==========================================================================
   Week OS — js/app.js
   Rendering + interaction only. All routine content comes from PLAN via
   DayBuilder; this file contains zero plan content.
   ========================================================================== */
(function () {
  'use strict';

  const APP_VERSION = '4.69.0';
  const DB = window.DayBuilder;

  const CAT_VAR = {
    run: 'var(--cat-run)', xt: 'var(--cat-xt)', gym: 'var(--cat-gym)',
    study: 'var(--cat-study)', german: 'var(--cat-german)', work: 'var(--cat-work)',
    meal: 'var(--cat-meal)', free: 'var(--cat-free)', reading: 'var(--cat-reading)',
    routine: 'var(--cat-routine)',
  };
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DAY_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Home-screen shortcuts land on a view directly (manifest `shortcuts`,
     ?view=week|plan|ref). Anything else falls through to today. */
  function startView() {
    const m = /[?&]view=(week|plan|ref)\b/.exec(location.search || '');
    return m ? m[1] : 'today';
  }

  /* ---- state ---- */
  const state = {
    view: startView(),
    dateISO: todayISO(),
    weekAnchor: null,          // Monday ISO shown in week view
    expanded: null,            // block id with actions open
    wtEdit: null,              // { block, ex } — weight input open on that row
    runLogEdit: null,          // ISO date with the run-log form open
    runLogDraft: null,         // { paceSec, hr, bounds } while the steppers are open
    hrEdit: false, hrDraft: null,  // resting/max HR steppers on Reference
    movePick: null,            // block id with the move-to-day picker open
    rhrDraft: null,            // morning resting HR being entered on the hero
  };
  let nowKey = '';             // today's current|next block ids — minute tick
                               // re-renders only when this changes
  let lastViewKey = '';        // view identity — fade only on real navigation

  function fmtLeft(mins) {
    if (mins >= 60) return Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm left';
    return mins + ' min left';
  }
  function fmtGap(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return (h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm') + ' open';
  }

  /* Minutes after a run's window closes before the hero stops calling it
     scheduled and asks whether it happened. */
  const MISSED_GRACE_MIN = 60;
  function todayISO() { return DB.toISO(new Date()); }
  function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function mondayOf(iso) { return DB.addDays(iso, -DB.dayIndex(iso)); }

  /* ---- storage (localStorage, keyed per ISO date) ---- */
  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(fallback)) return Array.isArray(v) ? v : fallback;
      return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* full/blocked */ }
  }
  const doneKey = (iso) => 'done-' + iso;
  const ovrKey = (iso) => 'ovr-' + iso;
  const moveKey = (iso) => 'movein-' + iso;
  const getDone = (iso) => readJSON(doneKey(iso), {});
  const getMoveIn = (iso) => readJSON(moveKey(iso), []);
  function getOvr(iso) {
    const o = readJSON(ovrKey(iso), {});
    if (!o.skip || typeof o.skip !== 'object') o.skip = {};
    if (!o.moved || typeof o.moved !== 'object') o.moved = {};
    return o;
  }

  function toggleDone(iso, id) {
    const d = getDone(iso);
    if (d[id]) delete d[id]; else d[id] = true;
    writeJSON(doneKey(iso), d);
  }
  function setSkip(iso, id, on) {
    const o = getOvr(iso);
    if (on) o.skip[id] = true; else delete o.skip[id];
    writeJSON(ovrKey(iso), o);
  }
  /* A move records its target date in ovr-ISO.moved[id]. Moves made before
     v4.58 stored `true` and always meant tomorrow, so that still reads as
     tomorrow: no migration, no change to the storage keys. */
  function movedTarget(iso, o, id) {
    const t = o.moved[id];
    return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : DB.addDays(iso, 1);
  }
  function moveBlock(iso, block, target) {
    const o = getOvr(iso);
    if (o.moved[block.id]) undoMove(iso, block.id);
    const fresh = getOvr(iso);
    fresh.moved[block.id] = target;
    writeJSON(ovrKey(iso), fresh);
    const list = getMoveIn(target).filter((m) => !(m.srcId === block.id && m.fromIso === iso));
    list.push({ id: 'mv-' + iso + '-' + block.id, srcId: block.id, fromIso: iso, title: block.title, detail: block.detail, plan: block.plan || null, cat: block.cat,
      run: block.run || null, table: block.table || null, start: block.start || null, end: block.end || null });
    writeJSON(moveKey(target), list);
  }
  /* A run moved onto a day with no planned run takes that day's hero, so the
     day reads as a run day rather than "No run". Built only from the moved
     item's own facts; items moved before v4.66 carry no run facts and stay
     timeline cards. */
  function movedInRun(iso) {
    const m = getMoveIn(iso).find((x) => x.cat === 'run' && x.run && x.run.km > 0 && x.start && x.end);
    if (!m) return null;
    return { id: m.id, title: m.title, detail: m.detail || '', cat: 'run', doable: true, run: m.run, table: m.table || null,
      start: m.start, end: m.end, startMin: DB.parseHM(m.start), endMin: DB.parseHM(m.end), movedFrom: m.fromIso };
  }
  function undoMove(iso, id) {
    const o = getOvr(iso);
    const target = movedTarget(iso, o, id);
    delete o.moved[id];
    writeJSON(ovrKey(iso), o);
    writeJSON(moveKey(target), getMoveIn(target).filter((m) => !(m.srcId === id && m.fromIso === iso)));
  }
  /* Leg work that lands too close to the long run is dropped, not moved
     with the session (PLAN.moveRules). Only inside the marathon block, where
     there is a Sunday long run to protect. */
  function legDropFor(block, targetIso) {
    const r = PLAN.moveRules;
    if (!r || block.cat !== 'gym' || !block.plan) return false;
    const day = DB.buildDay(targetIso);
    if (day.blockId !== 'marathon' || day.dayIndex < r.legDropFromDay) return false;
    const re = new RegExp(r.legPattern, 'i');
    return block.plan.some((p) => re.test(p.ex));
  }
  /* The other six days of this block's Monday–Sunday week, each with what
     is already there of the same kind, so a move shows its clash first. */
  function moveTargets(iso, block) {
    const monday = mondayOf(iso), out = [];
    for (let i = 0; i < 7; i++) {
      const d = DB.addDays(monday, i);
      if (d === iso) continue;
      const day = DB.buildDay(d), ovr = getOvr(d);
      const same = day.blocks.filter((x) => x.doable && x.cat === block.cat && !ovr.skip[x.id] && !ovr.moved[x.id]).map((x) => x.title)
        .concat(getMoveIn(d).filter((m) => m.cat === block.cat && m.srcId !== block.id).map((m) => m.title));
      out.push({ iso: d, label: DAY_SHORT[i].charAt(0) + DAY_SHORT[i].slice(1).toLowerCase() + ' ' + Number(d.slice(8)),
        clash: same.length ? 'has ' + same.join(' + ') + (block.cat === 'run' ? ' · one run log per day' : '') : '', legDrop: legDropFor(block, d) });
    }
    return out;
  }
  function returnMoved(iso, movedId) {
    const item = getMoveIn(iso).find((m) => m.id === movedId);
    if (item) undoMove(item.fromIso, item.srcId);
  }

  /* ---- gym weight memory: the +2.5 kg rule needs to know last week ---- */
  function exKey(ex) {
    return 'wt-' + String(ex).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function lastWeight(key) {
    const arr = readJSON(key, []);
    return arr.length ? arr[arr.length - 1] : null;
  }
  function saveWeight(key, iso, kg) {
    const arr = readJSON(key, []).filter((e) => e && e.d !== iso);
    arr.push({ d: iso, kg });
    writeJSON(key, arr.slice(-20));
  }
  function fmtKg(kg) {
    return (kg === Math.round(kg) ? kg : kg.toFixed(1)) + 'kg';
  }

  /* ---- id migration: v2.6 moved tick ids from 'b{i}-{title-slug}' to
     't{HHMM}-{cat}' so plan amendments stop orphaning history. Remaps
     every stored entry once (and again after restoring an old backup —
     it's idempotent: already-new ids pass through untouched). ---- */
  function migrateIds() {
    const legacySlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    const maps = {};
    const mapFor = (iso) => {
      if (!maps[iso]) {
        const m = {};
        DB.buildDay(iso).blocks.forEach((b, i) => { m['b' + i + '-' + legacySlug(b.title)] = b.id; });
        maps[iso] = m;
      }
      return maps[iso];
    };
    const remapId = (id) => {
      const mv = id.match(/^mv-(\d{4}-\d{2}-\d{2})-(.+)$/);   // ticks on moved-in blocks
      if (mv) return 'mv-' + mv[1] + '-' + (mapFor(mv[1])[mv[2]] || mv[2]);
      return id;
    };
    const remapObj = (obj, m) => {
      const out = {};
      for (const k of Object.keys(obj)) out[m[remapId(k)] || remapId(k)] = obj[k];
      return out;
    };
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) {
      const m = k.match(/^(done|ovr|movein)-(\d{4}-\d{2}-\d{2})$/);
      if (!m) continue;
      try {
        if (m[1] === 'done') {
          writeJSON(k, remapObj(getDone(m[2]), mapFor(m[2])));
        } else if (m[1] === 'ovr') {
          const o = getOvr(m[2]);
          o.skip = remapObj(o.skip, mapFor(m[2]));
          o.moved = remapObj(o.moved, mapFor(m[2]));
          writeJSON(k, o);
        } else {
          const list = getMoveIn(m[2]);
          list.forEach((it) => {
            if (!it || !it.fromIso || !it.srcId) return;
            const nid = mapFor(it.fromIso)[it.srcId];
            if (nid) { it.srcId = nid; it.id = 'mv-' + it.fromIso + '-' + nid; }
          });
          writeJSON(k, list);
        }
      } catch (e) { /* leave that entry as it was */ }
    }
  }
  try {
    if (localStorage.getItem('schema-v') !== '2') {
      migrateIds();
      localStorage.setItem('schema-v', '2');
    }
  } catch (e) { /* storage blocked — nothing to migrate */ }

  /* ---- illness mode: rule 5, one tap instead of N ---- */
  function skipRunDays(fromIso, days) {
    for (let i = 0; i < days; i++) {
      const d = DB.addDays(fromIso, i);
      const day = DB.buildDay(d);
      if (day.run) setSkip(d, day.run.id, true);
    }
  }

  /* ---- tiny html helpers ---- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function fmtDate(iso) {
    const d = DB.parseLocalDate(iso);
    return DAY_NAMES[DB.dayIndex(iso)] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  /* Zone NAMES are prescription and live in the plan file; the bpm behind
     them are personal health data and live only on this phone (§4.10). So
     the data says "Z4" and the renderer fills in "Z4 169–184" at paint
     time — the numbers are everywhere in the app and nowhere in the repo.
     Any future plan text mentioning a zone gets this for free. */
  function withZones(text) {
    const hr = readJSON('hr', null);
    if (!hr || !hr.rest || !hr.max) return String(text);
    const zs = DB.hrZones(hr.rest, hr.max);
    if (!zs) return String(text);
    return String(text).replace(/\bZ([1-5])\b/g, (m0, n) => {
      const z = zs[Number(n) - 1];
      return z ? 'Z' + n + ' (' + z.lo + '–' + z.hi + ')' : m0;
    });
  }

  function fmtShort(iso) {
    const d = DB.parseLocalDate(iso);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  /* ================= header ================= */
  const PHASE_TONE = { base: 'var(--phase-base)', build: 'var(--phase-build)', taper: 'var(--phase-taper)' };
  function renderHeader() {
    const iso = todayISO();
    const day = DB.buildDay(iso);
    /* the whole app takes on the current phase's colour (§3 tokens) */
    document.documentElement.style.setProperty('--phase-accent', PHASE_TONE[day.phase] || 'var(--accent)');
    document.body.dataset.phase = day.phase || 'none';
    const wkEl = document.getElementById('hdr-week');
    if (day.blockId === 'marathon') {
      wkEl.innerHTML = 'WK <span class="ph-' + esc(day.phase) + '">' + day.week + '/30</span>';
    } else if (day.blockId === 'recovery') {
      wkEl.textContent = 'RECOVERY W' + day.week;
    } else {
      wkEl.textContent = 'STANDING WEEK';
    }
    const cd = DB.raceCountdown(iso);
    const cdEl = document.getElementById('hdr-count');
    if (cd.past) {
      cdEl.innerHTML = '<b>DONE</b> ' + PLAN.race.date.slice(0, 4) + '<small>marathoner</small>';
    } else if (cd.days === 0) {
      cdEl.innerHTML = '<b>RACE DAY</b><small>gun ' + esc(PLAN.race.gun) + '</small>';
    } else if (cd.weeks === 0) {
      cdEl.innerHTML = '<b>' + cd.rem + ' DAY' + (cd.rem === 1 ? '' : 'S') + '</b><small>to the gun</small>';
    } else {
      cdEl.innerHTML = '<b>' + cd.weeks + 'w ' + cd.rem + 'd</b><small>to the gun</small>';
    }
  }

  /* ================= today (day) view ================= */
  function renderToday() {
    const iso = state.dateISO;
    const real = todayISO();
    const isToday = iso === real;
    const day = DB.buildDay(iso);
    const done = getDone(iso);
    const ovr = getOvr(iso);
    const movedIn = getMoveIn(iso);
    const just = state.justTicked;         // animate only the block just ticked
    state.justTicked = null;
    const view = document.getElementById('view');
    view.innerHTML = '';

    if (!isToday) {
      const back = el('<button class="notday">Viewing <b>' + esc(fmtDate(iso)) + '</b> · back to today</button>');
      back.addEventListener('click', () => { state.dateISO = real; render(); });
      view.appendChild(back);
    }

    /* -- day header -- */
    const chips = [];
    if (day.phase) chips.push('<span class="chip ' + esc(day.phase) + '">' + esc(day.phase) + '</span>');
    if (day.row && day.row.cutback) chips.push('<span class="chip mut">cutback</span>');
    if (day.row && day.row.key) chips.push('<span class="chip hot">key</span>');
    /* next decisive moment, always one glance away (§4.7 extended) */
    if (isToday) {
      const ev = DB.nextKeyEvent(iso);
      if (ev && ev.days > 0 && day.blockId === 'marathon') {
        chips.push('<span class="chip ev">' + esc(ev.label) + ' · ' + ev.days + 'd</span>');
      } else if (ev && ev.days === 0) {
        chips.push('<span class="chip hot">' + esc(ev.label) + ' — TODAY</span>');
      }
    }
    const weekBit = day.blockId === 'marathon' ? 'WK ' + day.week + ' · DAY ' + (day.dayIndex + 1) + '/7'
      : day.blockId === 'recovery' ? 'RECOVERY · WK ' + day.week : 'STANDING WEEK';
    /* The billboard: the countdown as a Top-10 numeral behind the date, and
       a stage light that follows the day's run (red only on a hard one, §3).
       Decorative: the top bar already carries the countdown for everyone. */
    const cd = day.blockId === 'marathon' ? DB.raceCountdown(iso) : null;
    const raceDay = cd && cd.days === 0 && day.run;
    const bb = !cd || cd.past ? ''
      : '<span class="bb" aria-hidden="true"><span class="bb-num">' + (raceDay ? esc(String(day.run.run.km)) : cd.days) +
        '</span><span class="bb-cap">' + (raceDay ? 'KM · TODAY' : cd.days === 1 ? 'DAY TO THE GUN' : 'DAYS TO THE GUN') + '</span></span>';
    const light = day.run ? DB.runClass(day.run) : 'rest';
    const head = el(
      '<div class="day-head light-' + esc(light) + '">' + bb + '<div class="day-nav">' +
      '<button class="nav" data-d="-1" aria-label="Previous day">‹</button>' +
      '<h1>' + esc(fmtDate(iso)) + '</h1>' +
      '<button class="nav" data-d="1" aria-label="Next day">›</button></div>' +
      '<div class="sub"><span>' + weekBit + '</span>' + chips.join('') +
      '</div>' + (day.label ? '<p class="day-label"><span>Week ' + day.week + '</span> ' + esc(day.label) + '</p>' : '') + '</div>'
    );
    head.querySelectorAll('.nav').forEach((btn) => btn.addEventListener('click', () => {
      state.dateISO = DB.addDays(iso, Number(btn.getAttribute('data-d')));
      state.expanded = null;
      render();
    }));
    view.appendChild(head);

    /* -- now / next (real today only) -- */
    if (isToday) view.appendChild(buildNowNext(day));

    /* -- run hero -- */
    const movedRun = day.run ? null : movedInRun(iso);
    if (day.run || movedRun) {
      view.appendChild(buildHero(movedRun ? { ...day, run: movedRun } : day, done, iso, just));
    } else {
      const restBlock = day.blocks.find((b) => /no run|rest/i.test(b.title));
      let nextRun = null;
      for (let offset = 1; offset <= 14 && !nextRun; offset++) {
        const nextDay = DB.buildDay(DB.addDays(iso, offset));
        if (nextDay.run) nextRun = nextDay;
      }
      const rest = el('<section class="resthero" aria-label="No run scheduled">' +
        '<div class="rest-kicker"><span>OFF THE RUN</span><span class="rest-mark" aria-hidden="true"></span></div>' +
        '<h2>No run.<br>Still on plan.</h2>' +
        (restBlock ? detailHTML(restBlock.title + (restBlock.detail ? ' · ' + restBlock.detail : ''), iso + '|rest', false) : '') +
        (nextRun ? '<button class="rest-next"><span><small>Next planned run · ' + esc(fmtShort(nextRun.iso)) + '</small>' +
          '<strong>' + esc(nextRun.run.title) + '</strong></span><span class="rest-distance">' +
          nextRun.run.run.km + '<small>km ↗</small></span></button>' :
          '<p class="rest-note">Your other activities are below.</p>') + '</section>');
      if (nextRun) rest.querySelector('.rest-next').addEventListener('click', () => {
        state.dateISO = nextRun.iso; state.expanded = null; render();
      });
      const recap = window.RunProgress.debrief(runLogHistory(), iso, todayISO());
      if (recap && state.runLogEdit !== iso) {
        const result = el('<section class="hero has-recap unplanned-recap" aria-label="Logged run"></section>');
        const planned = el('<details class="recap-plan"><summary>View rest-day plan</summary></details>');
        planned.appendChild(rest);
        result.append(buildRunRecap(day, iso, recap), planned, buildRunLogger(day, iso, true));
        view.appendChild(result);
      } else {
        view.appendChild(rest);
        if (iso <= todayISO()) view.appendChild(buildRunLogger(day, iso));
      }
    }

    view.appendChild(el('<div class="timeline-head"><h2>Your day</h2>' +
      (day.blockId === 'marathon' ? weekRingHTML(iso) : '') + '</div>'));
    /* -- timeline -- */
    const tl = el('<div class="tl"></div>');
    const nMin = nowMin();
    let nowPlaced = !isToday;

    movedIn.forEach((m) => {
      const card = buildCard({
        id: m.id, title: m.title, detail: m.detail, plan: m.plan || null, cat: m.cat,
        start: '·', end: '', doable: true,
      }, done, iso, { moved: m, just: just === m.id });
      tl.appendChild(card);
    });

    let prevEnd = null;
    for (const b of day.blocks) {
      if (prevEnd !== null && b.startMin - prevEnd >= 40) {
        tl.appendChild(el('<div class="tl-gap">' + fmtGap(b.startMin - prevEnd) + '</div>'));
      }
      prevEnd = b.endMin;
      if (!nowPlaced && nMin < b.startMin) {
        tl.appendChild(el('<div class="tl-now">NOW ' + DB.fmtHM(nMin) + '</div>'));
        nowPlaced = true;
      }
      const isCurrent = isToday && nMin >= b.startMin && nMin < b.endMin;
      if (isCurrent) {
        tl.appendChild(el('<div class="tl-now">NOW ' + DB.fmtHM(nMin) + '</div>'));
        nowPlaced = true;
      }

      if (b.quiet && !b.doable) {
        const q = el(
          '<div class="tl-quiet' + (isCurrent ? ' current' : '') + '">' +
          '<span class="t">' + b.start + '–' + b.end + '</span>' +
          '<div class="quiet-main">' + (b.detail ? '<details class="anchor-detail" data-disclosure="' + esc(iso + '|' + b.id) + '"' +
          (openDetails.has(iso + '|' + b.id) ? ' open' : '') + '><summary>' + esc(b.title) + '</summary>' +
          '<div class="detail-body">' + esc(withZones(b.detail)) + '</div></details>' : esc(b.title)) + '</div></div>'
        );
        tl.appendChild(q);
      } else {
        tl.appendChild(buildCard(b, done, iso, { current: isCurrent, skipped: !!ovr.skip[b.id], moved: null, movedOut: !!ovr.moved[b.id], just: just === b.id }));
      }
    }
    if (!nowPlaced) tl.appendChild(el('<div class="tl-now">NOW ' + DB.fmtHM(nMin) + '</div>'));
    /* stagger index → cascading entrance (CSS, motion-gated) */
    Array.prototype.forEach.call(tl.children, (c, i) => c.style.setProperty('--i', i));
    view.appendChild(tl);

    /* weight input just opened — put the cursor in it */
    const wi = view.querySelector('.xw-in');
    if (wi) { wi.focus(); wi.select(); }
  }

  // Show one intact source clause; keep the remaining source text on tap.
  function detailHTML(text, key, quiet) {
    if (!text) return '';
    const parts = withZones(text).split(' · ');
    const preview = parts[0].length <= 110 && !quiet ? parts.shift() : '';
    if (!parts.length) return '<p class="operative">' + esc(preview) + '</p>';
    return '<details class="session-detail" data-disclosure="' + esc(key) + '"' +
      (openDetails.has(key) ? ' open' : '') + '><summary>' +
      (preview ? '<span>' + esc(preview) + '</span>' : '') +
      '<small>' + (preview ? 'Details' : 'Session details') + '</small></summary>' +
      '<div class="detail-body">' + parts.map(p => '<p>' + esc(p) + '</p>').join('') + '</div></details>';
  }

  function buildNowNext(day) {
    const nMin = nowMin();
    const cur = day.blocks.find((b) => nMin >= b.startMin && nMin < b.endMin);
    const next = day.blocks.filter((b) => b.startMin > nMin).slice(0, 2);
    nowKey = day.iso + '|' + (cur ? cur.id : '-') + '|' + (next[0] ? next[0].id : '-') +
      (day.run && nMin > day.run.endMin + MISSED_GRACE_MIN ? '|late' : '');
    let html = '<section class="nownext" aria-label="Now and next"><div class="nn-current">' +
      '<div class="nn-clock"><span>NOW</span><time class="live-clock">' + DB.fmtHM(nMin) + '</time></div><div class="nn-main">';
    if (cur) {
      const pct = Math.round(((nMin - cur.startMin) / (cur.endMin - cur.startMin)) * 100);
      html += '<div class="nn-title">' + esc(cur.title) + '</div>' +
        '<div class="nn-time">' + cur.start + '–' + cur.end +
        ' · <span class="nn-left">' + fmtLeft(cur.endMin - nMin) + '</span>' +
        '</div></div><button class="nn-jump" aria-label="Go to current activity">↓</button></div>' +
        '<div class="nn-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
    } else {
      html += '<div class="nn-title">Off the clock</div><div class="nn-time">Space between activities</div></div>' +
        '<button class="nn-jump" aria-label="Go to current time">↓</button></div>' +
        '<div class="nn-bar" aria-hidden="true"><i style="width:0%"></i></div>';
    }
    if (next.length) {
      html += '<div class="nn-next"><span class="nn-label">NEXT</span><span class="t">' + next[0].start + '</span><span>' + esc(next[0].title) + '</span></div>';
    } else {
      html += '<div class="nn-next"><span class="nn-label">NEXT</span><span>Nothing else scheduled today.</span></div>';
    }
    /* evening onwards, look ahead — lay the kit out tonight */
    if (!next.length || nMin >= 21 * 60) {
      const tmr = DB.buildDay(DB.addDays(day.iso, 1));
      const line = tmr.run
        ? tmr.run.start + ' · ' + tmr.run.title + ' — ' +
          (tmr.run.run.km === Math.round(tmr.run.run.km) ? tmr.run.run.km : tmr.run.run.km.toFixed(1)) +
          ' km · ' + tmr.run.run.shoe
        : 'No run — recovery day';
      html += '<div class="nn-tmrw"><span class="t">TMRW</span><span>' + esc(line) + '</span></div>';
    }
    const rail = el(html + '</section>');
    rail.querySelector('.nn-jump').addEventListener('click', () => {
      const target = document.querySelector('.tl-now');
      if (!target) return;
      const inset = document.querySelector('.topbar').getBoundingClientRect().height + 16;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - inset, behavior: 'auto' });
    });
    return rail;
  }

  /* Structured pacing table (TT lap script, race splits) — renders on any
     block carrying `table` data. Content stays in plan.js. */
  function paceTableHTML(t) {
    if (!t || !t.rows) return '';
    return '<div class="ptable">' +
      (t.title ? '<div class="pt-title">' + esc(t.title) + '</div>' : '') +
      '<table>' +
      (t.cols ? '<thead><tr>' + t.cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead>' : '') +
      '<tbody>' + t.rows.map((row) =>
        '<tr>' + row.map((c, i) => '<td' + (i === 0 ? ' class="pt-k"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>'
      ).join('') + '</tbody></table></div>';
  }

  /* ---- run log: time + HR in two taps; the app does the maths ---- */
  const logKey = (iso) => 'runlog-' + iso;
  const getRunLogEntry = (iso) => readJSON(logKey(iso), null);
  function saveRunLogEntry(iso, entry) { writeJSON(logKey(iso), entry); }
  /* EF that is comparable across a class. A long run with an MP segment
     (PLAN.mpCheck) is only comparable through its easy part; without the
     segment logged its whole-run EF is not, so it is left out (null). */
  function trendEf(day, km, e) {
    if (!e.hr) return null;
    if (!(day.run && DB.isMpSession(day.run.title))) return DB.ef(km, e.sec, e.hr);
    const mpKm = e.mpKm || DB.mpSegmentKm(day.run.title);
    return e.mpPaceSec && e.mpHr && mpKm ? DB.easyPartEf(km, e.sec, e.hr, mpKm, e.mpPaceSec * mpKm, e.mpHr) : null;
  }
  function mpCheckHTML(day, e) {
    if (!day.run || !DB.isMpSession(day.run.title) || !(e.mpHr > 0) || !(e.mpPaceSec > 0)) return '';
    const h = readJSON('hr', null);
    const v = h ? DB.mpVerdict(e.mpHr, h.rest, h.max) : null;
    const goal = DB.parsePace(String(PLAN.race.goalPace).replace(/\/km$/, ''));
    const diff = goal ? Math.round(e.mpPaceSec - goal) : null;
    const km = e.mpKm || DB.mpSegmentKm(day.run.title);
    const band = !v ? 'mpb' : v.key === 'on' ? 'good' : v.key === 'below' ? 'mpb' : 'poor';
    return '<div class="h-dc mp ' + band + '"><b>' + (v ? 'Z' + v.z : 'MP') + '</b> marathon pace' + (km ? ' · ' + km + ' km' : '') +
      ' at ' + DB.fmtPaceSec(Math.round(e.mpPaceSec)) + '/km · ' + e.mpHr + ' bpm' +
      (diff != null && Math.abs(diff) >= 3 ? ' · ' + Math.abs(diff) + ' s/km ' + (diff < 0 ? 'faster' : 'slower') + ' than the prescribed ' + esc(PLAN.race.goalPace) : '') +
      '<span>' + esc(v ? v.text : 'Set your HR zones on Reference to place this in a zone.') + ' ' + esc(PLAN.mpCheck.note) + '</span></div>';
  }
  /* History feed for the estimate model: every logged run, classified. */
  function runLogHistory() {
    const out = [];
    try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^runlog-(\d{4}-\d{2}-\d{2})$/);
      if (!m) continue;
      const e = readJSON(k, null);
      if (!e || !e.sec) continue;
      const day = DB.buildDay(m[1]);
      const km = e.km || (day.run ? day.run.run.km : 0);
      if (!(km > 0)) continue;
      out.push({
        iso: m[1], km, sec: e.sec, estimatedKm: !(Number.isFinite(e.km) && e.km > 0), cls: e.cls || (day.run ? DB.runClass(day.run) : 'unclassified'), paceSec: Math.round(e.sec / km),
        hr: e.hr || null, ef: trendEf(day, km, e),
        mp: !!(day.run && DB.isMpSession(day.run.title)),
        temp: e.temp == null ? null : e.temp, x: e.x === true,
      });
    }
    } catch (e) { return []; } // Storage can be denied even while enumerating.
    out.sort((a, b) => (a.iso < b.iso ? -1 : 1));
    return out;
  }
  function savedProgress() {
    return window.RunProgress.summarize(runLogHistory(), todayISO());
  }
  function recordTime(seconds) {
    const s = Math.round(seconds), h = Math.floor(s / 3600);
    return (h ? h + ':' : '') + String(Math.floor(s / 60) % (h ? 60 : 100000)).padStart(h ? 2 : 1, '0') +
      ':' + String(s % 60).padStart(2, '0');
  }
  function loggedDistance(km) {
    // Exact whole-run records must not round 9.999 km into a 10 km claim.
    return km.toLocaleString('en-GB', { maximumFractionDigits: 20 });
  }
  function earnedHTML(iso) {
    const p = savedProgress();
    const best = p.bests.find(e => e.iso === iso);
    const longest = p.longest && p.longest.iso === iso ? p.longest : null;
    if (!best && !longest) return '';
    return '<div class="earned"><span class="earned-star" aria-hidden="true">★</span><div><small>' +
      (best ? 'Fastest logged ' + best.km + ' km' : 'Longest logged run') + '</small><strong>' +
      (best ? recordTime(best.sec) : longest.km + ' km') + '</strong>' +
      (best ? '<span>Best of ' + best.compared + ' runs at this distance</span>' : '') + '</div></div>';
  }
  function recordsHTML(progress) {
    if (!progress.bests.length) return '';
    return '<section class="records"><h3>Your logged bests</h3>' + progress.bests.slice(0,3).map(r =>
      '<article class="record"><div><span>Fastest logged ' + r.km + ' km</span><small>' + esc(r.iso) +
      ' · ' + r.compared + ' runs compared</small></div><b>' + recordTime(r.sec) + '</b></article>').join('') +
      '<details class="record-method"><summary>What counts as a best?</summary><p>Races and time trials only, as whole runs at the exact same explicitly saved distance. Easy, long and quality runs are never ranked by time: an easy run is not a performance (rule 1). ' +
      'Logs using a planned-distance fallback do not establish records. At least two logs are needed. Ties keep the earlier record. ' +
      'These are bests in this log; no splits or Strava records are inferred.</p></details></section>';
  }
  function buildJourney() {
    const block = PLAN.blocks[0], today = todayISO();
    let elapsed = 0;
    const segments = block.weekTable.map(row => {
      const dates = DB.weekDates(block, row.wk);
      const past = dates.end < today, current = dates.start <= today && today <= dates.end;
      if (past) elapsed++;
      return '<i class="journey-week' + (past ? ' elapsed' : '') + (current ? ' current' : '') +
        '" style="--phase:var(--phase-' + esc(row.phase) + ')" title="Week ' + row.wk +
        (current ? ' · current' : past ? ' · elapsed' : ' · ahead') + '"></i>';
    }).join('');
    const p = savedProgress();
    const wrap = el('<section class="journey"><div class="journey-heading"><h2>The work adds up</h2>' +
      '<button class="journey-link" aria-label="Open the full training plan">↗</button></div>' +
      '<div class="journey-caption"><b>' + elapsed + '<span> / ' + block.weeks + '</span></b> weeks elapsed</div>' +
      '<div class="journey-track" role="img" aria-label="' + elapsed + ' of ' + block.weeks +
      ' weeks elapsed; outlined segment is this week">' + segments + '</div>' +
      '<div class="journey-legend"><span>Base</span><span>Build</span><span>Taper</span></div>' +
      '<div class="journey-stats"><div><b>' + p.km.toLocaleString('en-GB',{maximumFractionDigits:1}) +
      '</b><span>km logged</span></div><div><b>' + p.runs + '</b><span>runs logged</span></div><div><b>' + p.weeks +
      '</b><span>weeks logged</span></div></div>' +
      (p.runs ? '<p>Every saved run contributes. Weeks logged count weeks with at least one run.</p>' :
        '<p>Your first saved run starts these counters. Use Log this run after your session.</p>') + '</section>');
    wrap.querySelector('.journey-link').addEventListener('click', () => {
      state.view = 'plan'; window.scrollTo(0,0); render();
    });
    return wrap;
  }

  function fmtEf(v) { return v == null ? '—' : v.toFixed(3); }
  function loggedLineHTML(iso, plannedKm) {
    const e = getRunLogEntry(iso);
    if (!e) return null;
    const km = e.km || plannedKm;
    const pace = DB.paceOf(km, e.sec);
    const efv = e.hr ? DB.ef(km, e.sec, e.hr) : null;
    return '<span class="lg-pace">' + esc(pace || '—') + '/km</span>' +
      (e.hr ? ' · ' + e.hr + ' bpm · <b>EF ' + fmtEf(efv) + '</b>' : '') +
      (e.km && e.km !== plannedKm ? ' · ' + e.km + ' km' : '');
  }

  function streamReadingHTML(stream) {
    const split = stream.splitSec;
    return '<details class="record-method"><summary>Imported track analysis</summary><p>' + esc(stream.source) +
      ' · ' + Math.round(stream.coveredSec/60) + ' min with HR samples.</p>' +
      (Number.isFinite(split) ? '<p>Equal-distance halves: second half ' + (Math.abs(split)<1 ? 'matched the first.' : recordTime(Math.abs(split)) + (split<0 ? ' faster (negative split).' : ' slower.')) + '</p>' : '<p>Half-run comparison unavailable for this track.</p>') +
      '<p>Track time includes recorded stops. GPS, terrain and missing samples affect comparisons. Only summaries are saved; the route stays out of storage.</p></details>';
  }
  /* Said on the run itself, the day it happens: a long run well past its
     planned distance or rule 9's time cap, and the share of the week it has
     taken so far (PLAN.longRunOver). */
  function longRunOverHTML(day, iso, r) {
    const g = PLAN.longRunOver;
    if (!g || !day.run || day.blockId !== 'marathon' || !day.row || r.estimatedKm) return '';
    if (DB.runClass(day.run) !== 'long') return '';
    const plan = day.run.run.km, over = r.km > plan * g.overPct, capped = r.sec > g.capMin * 60;
    if (!over && !capped) return '';
    const monday = DB.addDays(iso, -day.dayIndex);
    let week = 0;
    for (let i = 0; i < 7; i++) {
      const d = DB.addDays(monday, i);
      if (d > iso) break;
      week += DB.recordedKm(DB.buildDay(d), getDone(d), getRunLogEntry(d));
    }
    const split = DB.distancesForWeek(day.row);
    const planShare = Math.round((split.long / day.row.km) * 100);
    const share = week > 0 ? Math.round((r.km / week) * 100) : null;
    const pct = Math.round((r.km / plan - 1) * 100);
    return '<div class="recap-flag" role="note"><p><b>' + loggedDistance(r.km) + ' km against ' + plan + ' planned' +
      (over ? ' · +' + pct + '%' : '') + '.</b> ' +
      (share != null ? 'It carried ' + share + '% of the week so far; the plan gives the long run ' + planShare + '%. ' : '') +
      '</p><p>' + esc(g.note) + (capped ? ' ' + esc(g.capNote) : '') + '</p></div>';
  }

  function buildRunRecap(day, iso, report) {
    const r = report.current;
    const hrLabel = value => Number.isFinite(value) && value > 0 ? String(value) : '—';
    const fmt = loggedDistance;
    const pace = DB.paceOf(r.km, r.sec);
    const awards = [];
    if (report.best) awards.push({ label: 'Fastest logged ' + fmt(r.km) + ' km', value: recordTime(r.sec),
      detail: recordTime(report.best.gainSec) + ' quicker than your previous best on ' + fmtShort(report.best.previous.iso) + '.' });
    if (report.longest) awards.push({ label: 'Longest logged run', value: fmt(r.km) + ' km',
      detail: fmt(Number(report.longest.gainKm.toPrecision(12))) + ' km beyond your previous longest on ' + fmtShort(report.longest.previous.iso) + '.' });
    if (report.milestone) awards.push({ label: 'Distance milestone', value: fmt(report.milestone) + ' km',
      detail: 'This run reached a new mark in your log.' });
    let comparison = '';
    if (report.previous) {
      const prev = report.previous;
      const delta = Math.round(Math.abs(report.deltaPaceSec));
      const paceText = delta === 0 ? 'Same pace to the second' : delta + ' s/km ' + (report.deltaPaceSec > 0 ? 'quicker' : 'slower');
      const hrText = report.deltaHr == null ? 'HR comparison unavailable' : report.deltaHr === 0 ? 'Same average HR' : Math.abs(report.deltaHr) + ' bpm ' + (report.deltaHr > 0 ? 'higher' : 'lower');
      comparison = '<details class="recap-compare"><summary><span>Compared with your last ' + esc(r.cls) + ' run</span><span aria-hidden="true">+</span></summary>' +
        '<div class="recap-deltas"><div><b>' + esc(paceText) + '</b><span>' + esc(hrText) + '</span></div></div>' +
        '<table><caption>' + esc(fmtShort(prev.iso)) + ' → ' + esc(fmtShort(iso)) + '</caption><thead><tr><th>Saved values</th><th>Previous</th><th>This run</th></tr></thead><tbody>' +
        '<tr><th>Distance</th><td>' + fmt(prev.km) + ' km</td><td>' + fmt(r.km) + ' km</td></tr>' +
        '<tr><th>Pace</th><td>' + DB.paceOf(prev.km, prev.sec) + '</td><td>' + pace + '</td></tr>' +
        '<tr><th>Average HR</th><td>' + hrLabel(prev.hr) + '</td><td>' + hrLabel(r.hr) + '</td></tr></tbody></table>' +
        '<p>Pace is per km; HR is bpm. Distance, route, effort and weather can differ. This comparison is not a fitness verdict.' +
        (r.estimatedKm || prev.estimatedKm ? ' At least one distance comes from the plan.' : '') + '</p></details>';
    }
    const wrap = el('<section class="run-recap" aria-label="Saved run recap"><div class="recap-intro"><h2 tabindex="-1">' +
      (report.runCount === 1 ? 'The first one, saved.' : 'That’s in the bank.') + '</h2><span>RUN ' + String(report.runCount).padStart(2, '0') + '</span></div>' +
      '<div class="recap-distance"><strong>' + fmt(r.km) + '</strong><span>km</span></div>' +
      '<p class="recap-subtitle">' + esc(day.run ? day.run.title : 'Unplanned run') +
      (r.estimatedKm ? ' · distance from plan' : ' · logged distance') + '</p>' +
      '<div class="recap-metrics"><div><span>TIME</span><b>' + recordTime(r.sec) + '</b></div><div><span>PACE / KM</span><b>' + pace + '</b></div><div><span>AVG HR</span><b>' + hrLabel(r.hr) + '</b></div></div>' +
      longRunOverHTML(day, iso, r) +
      awards.map(a => '<article class="recap-award"><span class="recap-seal" aria-hidden="true">✦</span><div><h3>' + esc(a.label) + '</h3><strong>' + esc(a.value) + '</strong><p>' + esc(a.detail) + '</p></div></article>').join('') +
      (report.runCount === 1 ? '<p class="recap-baseline">Your history starts here. Future runs build the comparison.</p>' : '') +
      '<div class="recap-total"><span>Your log to this run</span><p><b>' + fmt(report.totalKm) + '</b> km <span>across ' + report.runCount + (report.runCount === 1 ? ' run' : ' runs') + '</span></p>' +
      (report.estimatedCount ? '<small>Includes ' + report.estimatedCount + ' ' + (report.estimatedCount === 1 ? 'distance' : 'distances') + ' from the plan.</small>' : '') + '</div>' +
      comparison + '<details class="recap-method"><summary>What this recap counts</summary><p>Saved whole runs through ' + esc(fmtShort(iso)) +
      '. Records use explicitly saved distances and earlier logs only. First observations and ties do not earn a new best; segment times are never inferred.' +
      (report.estimatedCount ? ' Totals include ' + report.estimatedCount + ' ' + (report.estimatedCount === 1 ? 'log' : 'logs') + ' whose distance comes from the plan.' : '') +
      ' Editing or deleting a log updates these figures.</p></details></section>');
    return wrap;
  }


  function buildRunLogger(day, iso, hasRecap) {
    const plannedKm = day.run ? day.run.run.km : 0;
    const saved = getRunLogEntry(iso);
    const editing = state.runLogEdit === iso && state.runLogDraft;
    const wrap = el('<section class="runlogger" aria-label="Run log"></section>');
    if (!editing) {
      if (iso > todayISO()) return wrap;
      wrap.innerHTML = '<button class="h-log' + (saved ? ' logged' : '') + '">' +
        (saved ? (hasRecap ? 'Edit run <span aria-hidden="true">↗</span>' : loggedLineHTML(iso, plannedKm)) : day.run
          ? 'Log this run <span aria-hidden="true">↗</span><small>Paste your run or enter the numbers</small>'
          : 'Ran today? Add a run <span aria-hidden="true">↗</span><small>Record what happened, even on a rest day</small>') + '</button>' +
        (saved && !hasRecap ? earnedHTML(iso) : '');
      if (saved) {
        const e = saved, km = plannedKm, r = day.run;
        let logHTML = '';
      /* Decoupling is the long run's headline, not EF — it is the number
         that says whether the base carried the distance. */
      const cr = DB.carbRate(e.gels, e.sec / 60);
      if (cr) {
        const band = cr.pct >= 90 ? 'good' : cr.pct >= 60 ? 'ok' : 'poor';
        logHTML += '<div class="h-dc ' + band + '"><b>' + cr.rate.toFixed(0) +
          ' g/h</b> carbs · ' + cr.gels + ' of ' + cr.want + ' gels for ' +
          Math.round(e.sec / 60) + ' min · target ' + cr.target.toFixed(0) + ' g/h</div>';
      }
      const dec = e.stream ? (Number.isFinite(e.stream.decPct) ? {pct:e.stream.decPct} : null) : DB.decoupling(e.km || km, e.sec, e.hr, e.halfPaceSec, e.hr2);
      const dv = dec ? DB.decoupleVerdict(dec.pct) : null;
      logHTML += mpCheckHTML(day, e);
      if (dv && (e.cls || (r ? DB.runClass(r) : 'unclassified')) === 'long' && !(r && DB.isMpSession(r.title))) {
        logHTML += '<div class="h-dc ' + dv.band + '"><b>' + dec.pct.toFixed(1) +
          '%</b> decoupling · ' + esc(dv.text) + '</div>';
      }
      const v = (e.cls || (r ? DB.runClass(r) : 'unclassified')) === 'unclassified' ? null : DB.logVerdict(runLogHistory().filter(run => run.iso <= iso && (!run.x || run.iso === iso) &&
        (run.iso === iso || run.mp === !!(r && DB.isMpSession(r.title)))), iso);
      if (v) {
        const cls = e.cls || (r ? DB.runClass(r) : 'unclassified');
        let line;
        if (v.first) {
          line = 'First logged ' + cls + ' run of the block';
        } else {
          const q = v.dPace >= 0;
          line = (q ? '▲ ' : '▼ ') + Math.abs(v.dPace) + ' s/km ' + (q ? 'quicker' : 'slower') +
            (v.dHr != null ? ' · ' + (v.dHr <= 0 ? '' : '+') + v.dHr + ' bpm' : '') +
            ' vs last ' + cls;
        }
        if (v.best) line += ' · ★ block-best EF';
        /* Read the run back against the band the card prescribed. Uses the
           heat-corrected pace when a temperature was logged — comparing a
           warm run to the band is really comparing the weather to it. */
        if (cls === 'easy' && e.sec) {
          const raw = Math.round(e.sec / (e.km || km));
          const bp = DB.bandPlace(DB.adjustPace(raw, e.temp) || raw, day.week);
          if (bp) line += ' · ' + bp.text;
        }
        logHTML += hasRecap ? '<details class="recap-method recap-readback"><summary>Training readback</summary><p>' + esc(line) + '</p></details>' : '<div class="h-verdict' + (v.best ? ' best' : '') + '">' +
          '<span>' + esc(line) + '</span>' +
          '<button class="h-share" aria-label="Share run card">⤴</button></div>';
      }

        if (e.stream) logHTML += streamReadingHTML(e.stream);
        wrap.insertAdjacentHTML('beforeend', logHTML);
        const share = wrap.querySelector('.h-share');
        if (share && day.run) share.addEventListener('click', () => shareRunCard(day, iso));
        else if (share) share.remove();
        if (hasRecap) {
          const receipt = el('<button class="recap-share">Share run receipt <span aria-hidden="true">↗</span></button>');
          receipt.addEventListener('click', () => shareRunCard(day, iso));
          wrap.appendChild(receipt);
        }
      }
      wrap.querySelector('button').addEventListener('click', () => {
        const e = saved || {}, estimate = DB.logEstimate(day, runLogHistory().filter(run => !run.x));
        const km = e.km || plannedKm || null;
        const sec = e.sec || (km && estimate ? Math.round(km * estimate.paceSec) : null);
        state.runLogEdit = iso;
        state.runLogDraft = {
          km, sec, paceSec: sec && km ? sec / km : null, hr: e.hr || null,
          temp: e.temp == null ? null : e.temp, gels: e.gels == null ? null : e.gels,
          halfPaceSec: e.halfPaceSec || null, hr2: e.hr2 || null,
          cls: e.cls || (day.run ? DB.runClass(day.run) : 'unclassified'), stream: e.stream || null, x: e.x === true,
          mpKm: e.mpKm || (day.run ? DB.mpSegmentKm(day.run.title) : null), mpPaceSec: e.mpPaceSec || null, mpHr: e.mpHr || null,
          paste: '', preview: null, note: saved ? 'Saved values. Change only what needs correcting.' :
            plannedKm ? 'Distance and time start from the plan. Replace them with your actual run.' : 'Enter actual distance and time. HR and conditions are optional.',
        };
        render();
        const editor = view.querySelector('.runlogger .h-log.form');
        if (editor) editor.scrollIntoView({ block: 'start' });
      });
      return wrap;
    }
    const d = state.runLogDraft;
    const field = (key, label, value, inputmode, unit, step) => '<label class="log-field"><span>' + label + '</span>' +
      '<span class="log-control">' + (step ? '<button type="button" data-log-step="' + key + '" data-dir="-1" aria-label="Decrease ' + label + '">−</button>' : '') +
      '<input data-log-field="' + key + '" aria-label="' + label + '" inputmode="' + inputmode + '" value="' + esc(value == null ? '' : value) + '" placeholder="—">' +
      '<small>' + unit + '</small>' + (step ? '<button type="button" data-log-step="' + key + '" data-dir="1" aria-label="Increase ' + label + '">+</button>' : '') + '</span></label>';
    const clock = n => n ? recordTime(n) : '';
    const classes = ['unclassified', 'recovery', 'easy', 'long', 'quality', 'race'];
    const isMpDay = !!(day.run && DB.isMpSession(day.run.title));
    const p = d.preview;
    const found = p && p.values;
    wrap.innerHTML = '<div class="h-log form"><div class="log-heading"><h3>Log your run</h3><button class="rl-x" aria-label="Cancel run edit">✕</button></div>' +
      '<p class="log-note">' + esc(d.note) + '</p>' +
      '<details class="log-import"' + (d.paste || p ? ' open' : '') + '><summary>Paste or import a run</summary>' +
      '<label for="run-paste">Distance, moving time, average HR and conditions</label>' +
      '<textarea id="run-paste" rows="3" placeholder="distance=8km moving=48:00 HR_avg=140">' + esc(d.paste) + '</textarea>' +
      '<button class="log-parse">Preview values</button>' +
      '<label class="log-file-label">Or import a GPX / TCX activity<input class="log-file" type="file" accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml"></label>' +
      (p ? '<div class="log-preview" role="status"><b>Found' + (p.date ? ' · ' + esc(p.date) : '') + '</b><p>' +
        [found.km ? Number(found.km.toFixed(3)) + ' km' : 'No distance', found.sec ? clock(found.sec) : 'No time',
          found.hr ? found.hr + ' bpm' : 'No HR', found.temp != null ? found.temp + '°C' : 'No temperature'].map(esc).join(' · ') +
        '</p>' + (found.mpPaceSec ? '<p>Marathon-pace finish · ' + esc(found.mpKm + ' km · ' + DB.fmtPaceSec(found.mpPaceSec) + '/km · ' + found.mpHr + ' bpm') + '</p>' : '') + p.warnings.map(w => '<p>' + esc(w) + '</p>').join('') +
        (p.date && p.date !== iso ? '<p>Open ' + esc(p.date) + ' before importing this activity. No values have been saved.</p>' : Object.keys(found).length ? '<button class="log-use">Use these values</button>' : '') + '</div>' : '') + '</details>' +
      field('km', 'Distance', d.km, 'decimal', 'km', true) +
      field('sec', d.stream ? 'Track time' : 'Moving time', clock(d.sec), 'text', 'h:mm:ss', false) +
      field('paceSec', 'Pace', clock(d.paceSec), 'text', '/km', true) +
      field('hr', 'Average HR', d.hr, 'numeric', 'bpm', true) +
      '<label class="log-field">Run type<select class="log-class" aria-label="Run type">' + classes.map(c =>
        '<option value="' + c + '"' + (c === d.cls ? ' selected' : '') + '>' + (c === 'unclassified' ? 'Not classified' : c[0].toUpperCase() + c.slice(1)) + '</option>').join('') + '</select></label>' +
      '<details class="log-extra"' + (d.extraOpen || (isMpDay && d.extraOpen !== false) ? ' open' : '') + '><summary>' + (isMpDay ? 'Marathon-pace segment, conditions &amp; more' : 'Conditions &amp; optional measurements') + '</summary>' +
      field('temp', 'Feels like', d.temp, 'decimal', '°C', true) + field('gels', 'Gels taken', d.gels, 'numeric', 'gels', true) +
      (isMpDay ? '<p class="log-note">Marathon-pace segment: its distance, pace and average HR only. The app places the HR in your zones (§10). A track import fills a “last N @ MP” finish for you.</p>' +
        field('mpKm', 'MP distance', d.mpKm, 'decimal', 'km', true) +
        field('mpPaceSec', 'MP pace', clock(d.mpPaceSec), 'text', '/km', true) +
        field('mpHr', 'MP average HR', d.mpHr, 'numeric', 'bpm', true) :
      '<p class="log-note">For a decoupling estimate, enter measured first-half pace and second-half HR. Leave blank if unavailable.</p>' +
      (d.stream ? '<p class="log-note">Half-run analysis uses the imported track when coverage permits. Gaps leave it unavailable.</p>' :
      field('halfPaceSec', 'First-half pace', clock(d.halfPaceSec), 'text', '/km', true) +
      field('hr2', 'Second-half HR', d.hr2, 'numeric', 'bpm', true))) +
      '<label class="log-exclude"><input type="checkbox" class="log-x"' + (d.x ? ' checked' : '') + '>' +
      '<span><b>Leave out of trends</b><small>Lost, hilly, ill, hungover or a different route. The run still counts for distance; it just isn\u2019t compared.</small></span></label>' +
      '</details>' +
      '<p class="log-error" role="alert">' + esc(d.error || '') + '</p>' +
      '<button class="rl-save">Save run</button>' +
      (saved ? '<button class="log-delete">Delete this log</button>' : '') + '</div>';
    const remember = () => {
      d.paste = wrap.querySelector('#run-paste').value;
      d.extraOpen = wrap.querySelector('.log-extra').open;
    };
    wrap.querySelector('#run-paste').addEventListener('input', remember);
    wrap.querySelector('.log-extra').addEventListener('toggle', remember);
    const setField = (key, value) => {
      if (d[key] !== value && ['km','sec','paceSec','hr'].includes(key) && d.stream) {
        d.stream = null; d.note = 'Measurements edited. Import the file again to restore stream analysis.';
      }
      d[key] = value;
      if (key === 'paceSec' && d.km && value) d.sec = Math.round(value * d.km);
      else if ((key === 'sec' || key === 'km') && d.sec && d.km) d.paceSec = d.sec / d.km;
      d.error = '';
    };
    const readField = (input) => {
      const key = input.dataset.logField, raw = input.value.trim();
      const n = raw === '' ? null : /sec/i.test(key) ? window.RunImport.duration(raw) : Number(raw.replace(',', '.'));
      if (raw && (n == null || !Number.isFinite(n) || (key !== 'temp' && n <= 0 && key !== 'gels') || (key === 'gels' && (n < 0 || !Number.isInteger(n))))) {
        input.setCustomValidity('Check this value.');
        d.error = 'Check ' + input.getAttribute('aria-label').toLowerCase() + '.';
        return false;
      }
      input.setCustomValidity('');
      setField(key, n); return true;
    };
    wrap.querySelectorAll('[data-log-field]').forEach(input => input.addEventListener('change', () => {
      remember(); if (readField(input)) {
        // Refresh dependent numbers without removing the control under the finger.
        for (const key of ['sec', 'paceSec']) if (input.dataset.logField !== key) wrap.querySelector('[data-log-field="' + key + '"]').value = clock(d[key]);
      }
      wrap.querySelector('.log-error').textContent = d.error;
    }));
    wrap.querySelectorAll('[data-log-step]').forEach(btn => btn.addEventListener('click', () => {
      remember();
      const key = btn.dataset.logStep, dir = +btn.dataset.dir;
      const steps = { km: .1, paceSec: PLAN.logModel.paceStep, hr: PLAN.logModel.hrStep,
        halfPaceSec: PLAN.logModel.halfPaceStep, hr2: PLAN.logModel.hrStep, temp: PLAN.logModel.tempStep, gels: 1,
        mpKm: .5, mpPaceSec: PLAN.logModel.halfPaceStep, mpHr: PLAN.logModel.hrStep };
      /* An empty stepper starts from something sensible, never from zero:
         a pace field from the run's own pace (MP from the prescribed MP),
         an HR field from the run's HR or the estimate. */
      const goalPace = DB.parsePace(String(PLAN.race.goalPace).replace(/\/km$/, ''));
      const estHr = () => d.hr || (DB.logEstimate(day, runLogHistory().filter(run => !run.x)) || {}).hr || 1;
      const current = d[key] != null ? d[key] : key === 'temp' ? PLAN.logModel.tempDefault
        : key === 'hr' || key === 'hr2' || key === 'mpHr' ? estHr()
        : key === 'halfPaceSec' ? Math.round(d.paceSec || 0)
        : key === 'mpPaceSec' ? goalPace || Math.round(d.paceSec || 0)
        : key === 'mpKm' ? (day.run ? DB.mpSegmentKm(day.run.title) : 0) || 0 : 0;
      const value = Math.round((current + dir * steps[key]) * 1000) / 1000;
      setField(key, Math.max(key === 'temp' ? -60 : key === 'gels' ? 0 : steps[key], value));
      render();
    }));
    wrap.querySelector('.log-class').addEventListener('change', e => { d.cls = e.target.value; });
    wrap.querySelector('.log-x').addEventListener('change', e => { d.x = e.target.checked; remember(); });
    wrap.querySelector('.log-parse').addEventListener('click', () => { remember(); d.preview = window.RunImport.parseText(d.paste); render(); });
    wrap.querySelector('.log-file').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      remember(); d.note = 'Reading activity on this device…';
      wrap.querySelector('.log-note').textContent = d.note;
      try {
        if (file.size > 20*1024*1024) throw new Error('Choose an activity file smaller than 20 MB.');
        const parsed = window.RunStream.parseXML(await file.text(), { tailKm: day.run ? DB.mpTailKm(day.run.title) : null });
        if (state.runLogDraft !== d || state.runLogEdit !== iso) return;
        d.preview = parsed;
        d.note = 'File read locally. Review the date and measurements before using them.';
      } catch (error) {
        if (state.runLogDraft !== d || state.runLogEdit !== iso) return;
        d.preview = { values: {}, warnings: [error.message] };
      }
      d.paste = ''; render();
    });
    const use = wrap.querySelector('.log-use');
    if (use) use.addEventListener('click', () => {
      const v = d.preview.values;
      // Missing observations must not become the plan or an earlier run's weather.
      d.km = v.km || null; d.sec = v.sec || null; d.paceSec = v.paceSec || null;
      d.hr = v.hr || null; d.temp = v.temp == null ? null : v.temp;
      d.halfPaceSec = d.hr2 = null; d.stream = d.preview.stream || null;
      if (v.mpPaceSec) { d.mpKm = v.mpKm; d.mpPaceSec = v.mpPaceSec; d.mpHr = v.mpHr; }
      d.preview = null; d.paste = ''; d.note = 'Imported into the form. Check the numbers, then Save run.';
      render();
    });
    wrap.querySelector('.rl-x').addEventListener('click', () => { state.runLogEdit = null; state.runLogDraft = null; render(); });
    wrap.querySelector('.rl-save').addEventListener('click', () => {
      if (wrap.querySelector('input:invalid') || d.error || !(d.km > 0 && d.km <= 1000 && d.sec > 0 && d.sec <= 604800) ||
          (d.hr != null && (d.hr < 1 || d.hr > 300)) || (d.temp != null && (d.temp < -60 || d.temp > 65)) ||
          (d.mpHr != null && (d.mpHr < 1 || d.mpHr > 300)) || (d.mpPaceSec != null && (d.mpPaceSec < 120 || d.mpPaceSec > 900)) ||
          (d.mpKm != null && d.mpPaceSec != null && !(d.mpKm > 0 && d.mpKm < d.km))) {
        wrap.querySelector('.log-error').textContent = d.error || 'Enter a valid distance and moving time; check HR and temperature if supplied.'; return;
      }
      const entry = { ...(saved || {}), sec: d.sec, hr: d.hr == null ? null : Math.round(d.hr),
        km: d.km, temp: d.temp, cls: d.cls,
        halfPaceSec: d.halfPaceSec, hr2: d.hr2, gels: d.gels, stream: d.stream || null };
      if (d.x) entry.x = true; else delete entry.x;
      if (isMpDay && d.mpPaceSec && d.mpHr) { entry.mpKm = d.mpKm; entry.mpPaceSec = Math.round(d.mpPaceSec); entry.mpHr = Math.round(d.mpHr); }
      else { delete entry.mpKm; delete entry.mpPaceSec; delete entry.mpHr; }
      try { localStorage.setItem(logKey(iso), JSON.stringify(entry)); }
      catch (e) { wrap.querySelector('.log-error').textContent = 'Could not save on this device. Keep this form open and free some storage, then try again.'; return; }
      state.runLogEdit = null; state.runLogDraft = null; render();
      const recapHeading = view.querySelector('.run-recap h2');
      if (recapHeading) { recapHeading.focus({ preventScroll: true }); recapHeading.scrollIntoView({ block: 'start' }); }
    });
    const del = wrap.querySelector('.log-delete');
    if (del) del.addEventListener('click', () => {
      if (!window.confirm('Delete this run log? The planned session and completion tick stay unchanged.')) return;
      try { localStorage.removeItem(logKey(iso)); } catch (e) { return; }
      state.runLogEdit = null; state.runLogDraft = null; render();
    });
    return wrap;
  }

  /* Session focus is a view of the authored block, never a workout tracker.
     The native dialog traps focus; its controls reuse existing storage keys. */
  let focusedSession = null;
  function focusWindow(b, iso, today, minute) {
    if (iso !== today) return iso < today ? 'Scheduled window ended' : 'Scheduled for ' + fmtShort(iso);
    if (minute < b.startMin) return 'Starts in ' + (b.startMin - minute) + ' min';
    if (minute >= b.endMin) return 'Scheduled window ended';
    return fmtLeft(b.endMin - minute) + ' in scheduled window';
  }
  function focusBrief(text) {
    const clauses = String(text || '').split(' · ');
    // The source marks conditional instructions with uppercase headings.
    // Preserve their first complete sentence; leave rationale in disclosure.
    const rules = clauses.filter((s, i) => i > 0 && /^[A-Z][A-Z -]{4,}[^:]*:/.test(s));
    return { intro: clauses[0], rules: rules.map(s => s.split(/\.\s/)[0]) };
  }
  function refreshFocusClock() {
    if (!focusedSession) return;
    const { dialog, block, iso } = focusedSession;
    dialog.querySelector('.focus-clock').textContent = focusWindow(block, iso, todayISO(), nowMin());
  }
  function openSessionFocus(block, iso, trigger) {
    if (focusedSession) return;
    const exercises = block.cat === 'gym' && block.plan ? block.plan : [];
    const dialog = el('<dialog class="session-focus' + (exercises.length ? ' is-gym' : '') + '" aria-labelledby="focus-title">' +
      '<div class="focus-shell"><header class="focus-header"><span>SESSION FOCUS</span><button class="focus-back" hidden>← Session brief</button>' +
      '<button class="focus-close" aria-label="Close session focus" autofocus>✕</button></header>' +
      '<div class="focus-scroll"><p class="focus-date">' + esc(DAY_NAMES[DB.dayIndex(iso)] + ' · ' + fmtShort(iso)) + '</p>' +
      '<h1 id="focus-title">' + esc(block.title) + '</h1>' +
      '<div class="focus-window"><span>' + esc(block.start + '–' + block.end) + '</span><p class="focus-clock"></p></div>' +
      '<div class="focus-content"></div>' +
      '<details class="focus-notes"><summary>Session instructions</summary><p>' + esc(withZones(block.detail)) + '</p>' + paceTableHTML(block.table) + '</details>' +
      '</div><footer class="focus-footer"><p class="focus-status" role="status"></p>' +
      '<button class="focus-done"></button>' + (block.run && iso <= todayISO() ? '<button class="focus-log">Log run →</button>' : '') + '</footer></div></dialog>');
    const scrollY = window.scrollY;
    const oldStyle = document.body.getAttribute('style');
    focusedSession = { dialog, block, iso, index: 0 };
    document.body.appendChild(dialog);
    // Fixed-body locking also covers standalone Safari; restore the exact scroll.
    Object.assign(document.body.style, { position: 'fixed', top: -scrollY + 'px', width: '100%' });
    const status = dialog.querySelector('.focus-status');
    const doneBtn = dialog.querySelector('.focus-done');
    const canComplete = () => iso <= todayISO() && !getOvr(iso).skip[block.id] && !getOvr(iso).moved[block.id];
    const paintDone = () => {
      const done = !!getDone(iso)[block.id];
      dialog.classList.toggle('is-banked', done);
      doneBtn.textContent = done ? '✓ Session banked · Undo' : 'Mark session done';
      doneBtn.setAttribute('aria-pressed', String(done));
      doneBtn.disabled = !canComplete();
      status.textContent = done ? 'Saved to your day.' : iso > todayISO() ? 'Preview your upcoming session.' : !canComplete() ? 'This session is skipped or moved.' : 'Mark done when you have finished.';
    };
    const paintExercise = (moveFocus) => {
      const i = focusedSession.index, p = exercises[i], key = exKey(p.ex), last = lastWeight(key);
      const content = dialog.querySelector('.focus-content');
      content.innerHTML = '<div class="focus-ex-progress" aria-hidden="true">' + exercises.map((_, n) => '<i class="' + (n === i ? 'selected' : '') + '"></i>').join('') + '</div>' +
        '<p class="focus-eyebrow">EXERCISE ' + (i + 1) + ' / ' + exercises.length + '</p>' +
        '<h2 class="focus-ex-name" tabindex="-1">' + esc(p.ex) + '</h2><p class="focus-sets">' + esc(p.sets) + '</p>' +
        '<form class="focus-weight"><label for="focus-kg">Working weight <span>kg</span></label>' +
        '<div><input id="focus-kg" inputmode="decimal" autocomplete="off" value="' + (last ? esc(String(last.kg)) : '') + '" placeholder="—"' + (iso > todayISO() ? ' disabled' : '') + '>' +
        '<button type="submit"' + (iso > todayISO() ? ' disabled' : '') + '>Save</button></div>' +
        '<p class="focus-weight-note" role="status">' + (last ? 'Last saved: ' + esc(fmtKg(last.kg) + ' · ' + fmtShort(last.d)) : 'No weight saved for this exercise yet.') + '</p></form>' +
        '<nav class="focus-ex-nav" aria-label="Exercises"><button data-step="-1"' + (i === 0 ? ' disabled' : '') + '>← Previous</button><button data-step="1"' + (i === exercises.length - 1 ? ' disabled' : '') + '>Next →</button></nav>' +
        (i < exercises.length - 1 ? '<p class="focus-up-next"><span>UP NEXT</span>' + esc(exercises[i + 1].ex) + '</p>' : '<p class="focus-up-next">Last exercise in this session.</p>');
      content.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => {
        dialog.classList.add('focus-working');
        dialog.querySelector('.focus-back').hidden = false;
        focusedSession.index += Number(btn.dataset.step);
        paintExercise(true);
      }));
      content.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        if (iso > todayISO()) return;
        const raw = content.querySelector('input').value.trim().replace(',', '.');
        const kg = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
        const note = content.querySelector('.focus-weight-note');
        if (!Number.isFinite(kg) || kg <= 0 || kg >= 500) {
          note.textContent = 'Enter a weight above 0 and below 500 kg.';
          content.querySelector('input').setAttribute('aria-invalid', 'true');
          return;
        }
        saveWeight(key, iso, kg);
        const saved = lastWeight(key);
        note.textContent = saved && saved.d === iso && saved.kg === kg ? 'Saved · ' + fmtKg(kg) : 'Could not save. Check device storage and try again.';
        content.querySelector('input').removeAttribute('aria-invalid');
        content.querySelector('input').blur();
      });
      if (moveFocus) {
        const heading = content.querySelector('h2');
        heading.focus({ preventScroll: true });
        heading.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    };
    if (exercises.length) {
      const notes = dialog.querySelector('.focus-notes');
      const brief = focusBrief(block.detail);
      const intro = el('<div class="focus-brief"><p>' + esc(withZones(brief.intro)) + '</p>' +
        brief.rules.map(s => '<p class="focus-rule">' + esc(withZones(s)) + '</p>').join('') +
        '<button class="focus-jump">Go to exercises ↓</button></div>');
      const content = dialog.querySelector('.focus-content');
      content.before(intro, notes);
      notes.querySelector('summary').textContent = 'Full session instructions';
      intro.querySelector('button').addEventListener('click', () => {
        dialog.classList.add('focus-working');
        dialog.querySelector('.focus-back').hidden = false;
        const heading = content.querySelector('h2');
        heading.focus({ preventScroll: true });
        heading.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      paintExercise(false);
    }
    else if (block.run) {
      const pace = (block.detail.match(/\d{1,2}:\d{2}(?:\s*–\s*\d{1,2}:\d{2})?\s*\/\s*km/) || [])[0];
      const prefix = block.run.km + ' km · ' + block.run.shoe + ' · ';
      let detail = block.detail.startsWith(prefix) ? block.detail.slice(prefix.length) : block.detail;
      if (detail.startsWith(block.run.shoe + ' · ')) detail = detail.slice(block.run.shoe.length + 3);
      dialog.querySelector('.focus-notes').remove();
      dialog.querySelector('.focus-content').innerHTML = '<div class="focus-distance">' + esc(String(block.run.km)) + '<span>km</span></div>' +
        '<div class="focus-run-facts">' + (pace ? '<div class="focus-pace"><span>PACE</span><strong>' + esc(pace) + '</strong></div>' : '') +
        '<div><span>SHOE</span><strong>' + esc(block.run.shoe) + '</strong></div></div>' +
        '<div class="focus-run-brief">' + detailHTML(detail, iso + '|focus', false) + paceTableHTML(block.table) + '</div>';
    }
    doneBtn.addEventListener('click', () => {
      if (!canComplete()) return;
      const before = !!getDone(iso)[block.id];
      toggleDone(iso, block.id);
      paintDone();
      if (!!getDone(iso)[block.id] === before) status.textContent = 'Could not save. Check device storage and try again.';
    });
    let logAfterClose = false;
    dialog.querySelector('.focus-back').addEventListener('click', () => {
      dialog.classList.remove('focus-working');
      dialog.querySelector('.focus-back').hidden = true;
      dialog.querySelector('.focus-scroll').scrollTop = 0;
      dialog.querySelector('.focus-jump').focus({ preventScroll: true });
    });
    const logBtn = dialog.querySelector('.focus-log');
    if (logBtn) logBtn.addEventListener('click', () => { logAfterClose = true; dialog.close(); });
    dialog.querySelector('.focus-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      focusedSession = null;
      dialog.remove();
      if (oldStyle === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', oldStyle);
      render();
      window.scrollTo(0, scrollY);
      // Rendering replaces the opener. Restore its new counterpart by block id.
      const opener = Array.from(document.querySelectorAll('[data-focus-id]')).find(n => n.dataset.focusId === block.id);
      if (opener) opener.focus({ preventScroll: true }); else if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
      if (logAfterClose) {
        state.view = 'today'; state.dateISO = iso;
        render();
        const edit = document.querySelector('.runlogger button.h-log');
        if (edit) edit.click();
        const form = document.querySelector('.runlogger .h-log.form');
        if (form) { form.scrollIntoView({ block: 'start' }); const input = form.querySelector('input'); if (input) input.focus({ preventScroll: true }); }
      }
    }, { once: true });
    paintDone();
    refreshFocusClock();
    dialog.showModal();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }


  /* ---- morning resting HR (PLAN.readiness) — personal, localStorage only ---- */
  const rhrKey = (iso) => 'rhr-' + iso;
  function rhrReading(iso) { const v = readJSON(rhrKey(iso), null); return v && Number.isFinite(v.bpm) ? v.bpm : null; }
  function rhrUsual(iso) {
    const g = PLAN.readiness, vals = [];
    for (let i = 1; i <= g.baselineDays; i++) { const v = rhrReading(DB.addDays(iso, -i)); if (v != null) vals.push(v); }
    if (vals.length < g.minReadings) return null;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  }
  function readinessHTML(iso) {
    const g = PLAN.readiness;
    if (!g) return '';
    const bpm = rhrReading(iso), usual = rhrUsual(iso);
    if (state.rhrDraft != null) {
      return '<div class="h-rhr editing" role="group" aria-label="Morning resting heart rate"><span class="h-rhr-l">Morning resting HR</span>' +
        '<span class="h-rhr-ctl"><button data-rhr="-1" aria-label="Lower resting HR">−</button><b>' + state.rhrDraft + '</b><small>bpm</small>' +
        '<button data-rhr="1" aria-label="Higher resting HR">+</button></span><button class="h-rhr-save" data-rhr="save">Save</button></div>';
    }
    if (bpm == null) return '<button class="h-rhr add" data-rhr="open">Add this morning’s resting HR <small>optional · compares it with your usual</small></button>';
    const delta = usual == null ? null : bpm - usual;
    const high = delta != null && delta >= g.skipDelta;
    return '<div class="h-rhr' + (high ? ' high' : '') + '"><button class="h-rhr-read" data-rhr="open" aria-label="Edit morning resting HR">' +
      '<span>Morning resting HR <b>' + bpm + '</b></span><small>' +
      (delta == null ? 'Your usual appears after ' + g.minReadings + ' mornings' : (delta > 0 ? '+' : delta < 0 ? '−' : '±') + Math.abs(delta) + ' vs your usual ' + usual) +
      '</small></button>' + (high ? '<p><b>Easy or skip today.</b> ' + esc(g.note) + '</p>' : '') + '</div>';
  }

  /* The distance arrives rather than appears: a half-second count on the
     first showing of each date's run per app open, never on re-renders.
     Only when the system allows motion; the markup holds the final figure. */
  const countedUp = new Set();
  function countUp(node, km, iso) {
    if (!node || countedUp.has(iso) || !(km > 0)) return;
    countedUp.add(iso);
    if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    const txt = node.firstChild;
    if (!txt || txt.nodeType !== 3) return;
    const final = txt.nodeValue, dec = final.includes('.') ? 1 : 0, t0 = performance.now(), dur = 520;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      txt.nodeValue = p < 1 ? (km * (1 - Math.pow(1 - p, 3))).toFixed(dec) : final;
      if (p < 1 && node.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function buildHero(day, done, iso, just) {
    const r = day.run;
    const isRace = /marathon/i.test(r.title) || (day.row && day.row.race && day.dayIndex === 6);
    const km = r.run.km;
    const kmTxt = km === Math.round(km) ? String(km) : km.toFixed(1);
    const isDone = !!done[r.id];
    const canLog = iso <= todayISO();
    const logged = loggedLineHTML(iso, km);
    const editing = state.runLogEdit === iso;
    const e = getRunLogEntry(iso) || {};
    // Distance and shoe already have dedicated fields. Split the remaining
    // source text at its own separators without rewriting any prescription.
    const prefix = kmTxt + ' km · ' + r.run.shoe + ' · ';
    const detail = r.detail.startsWith(prefix) ? r.detail.slice(prefix.length) : r.detail;

    /* §4.2 wants distance, session, shoe AND pace without scrolling. Pace had
       slipped behind the Details tap. The band is already authored per run in
       data/plan.js, so lift it out of the prescription rather than restating
       it here — render code carries no plan content (§2). A recovery run
       genuinely has no pace target (rule 10: Z1, HR decides), so it simply
       gets no cell rather than an invented one. */
    const paceTxt = (r.detail.match(/\d{1,2}:\d{2}\s*–\s*\d{1,2}:\d{2}\s*\/\s*km/) ||
                     r.detail.match(/\d{1,2}:\d{2}\s*\/\s*km/) || [])[0];
    const paceCell = paceTxt
      ? '<span><b>PACE</b>' + esc(paceTxt.replace(/\s*\/\s*km/, '')) + '</span>' : '';
    /* A long run with marathon-pace work has two paces, and the second one
       comes with a place: "last 6" of 22 is km 17 onward. Worked out from
       the title so the switch point is on the card, not arithmetic at km 15. */
    const mp = DB.mpShape(r.title, km);
    const mpWhere = !mp ? ''
      : mp.kind === 'reps' ? mp.reps + ' × ' + mp.repKm + ' km'
      : mp.kind === 'tail' ? (mp.from === mp.fromLate ? 'km ' + mp.from + '–' + kmTxt : 'from km ' + mp.from + '–' + mp.fromLate)
      : (mp.lo === mp.hi ? mp.lo : mp.lo + '–' + mp.hi) + ' km';
    const mpCell = mp ? '<span class="h-mp"><b>MARATHON PACE</b>' + esc(mp.pace + ' · ' + mpWhere) + '</span>' : '';

    /* Zones are the plan's whole prescription mechanism, and on a fresh
       install — which includes every Home Screen install, since those get
       their own storage container — the hero can only say a bare "Z2". Route
       there from the one screen where the number is missed. */
    /* A run whose window has passed with nothing recorded is a question, not
       a schedule. Left alone, the card said "Scheduled · 08:30" at 18:00 and
       offered only "Mark done", so the honest answer (it did not happen) took
       a trip to the timeline's ⋯ menu. Ask directly, and make "skipped" a
       visible state with the plan's own reason why the km are not owed. */
    const ovrHero = getOvr(iso);
    const isSkipped = !!ovrHero.skip[r.id];
    const isMovedOut = !!ovrHero.moved[r.id];
    const today = todayISO();
    const windowPassed = iso < today || (iso === today && nowMin() > r.endMin + MISSED_GRACE_MIN);
    const unresolved = !isDone && !(e.sec > 0) && !isSkipped && !isMovedOut && windowPassed;
    const missedNote = (PLAN.missedRun && PLAN.missedRun.note) || '';
    const missedHTML = unresolved
      ? '<div class="h-missed" role="group" aria-label="Did this run happen?"><p><b>Did it happen?</b> ' +
        (iso < today ? 'Nothing is recorded for this run.' : 'The ' + esc(r.start) + ' window has passed and nothing is recorded yet.') +
        '</p><div class="h-missed-acts"><button data-missed="log">Log it</button>' +
        '<button data-missed="done">Ran as planned</button><button data-missed="skip">Didn’t happen</button></div></div>'
      : isSkipped
        ? '<div class="h-missed is-skipped" role="status"><p><b>Skipped.</b> ' + esc(missedNote) + '</p>' +
          '<div class="h-missed-acts"><button data-missed="unskip">Undo skip</button></div></div>'
        : '';

    const hrSet = (() => { const h = readJSON('hr', null); return !!(h && h.rest && h.max); })();
    const zonePrompt = (!hrSet && /\bZ[1-5]\b/.test(r.detail))
      ? '<button class="h-zoneset" data-goto="ref">Zones not set — add your resting and max HR</button>'
      : '';

    const hero = el(
      '<section class="hero cls-' + esc(DB.runClass(r)) + (isRace ? ' race' : '') + (isDone ? ' done' : '') + (isSkipped ? ' skipped' : '') + (just === r.id ? ' just' : '') + '">' +
      '<div class="h-top"><div class="h-tag">' + (isRace ? 'RACE DAY' : 'TODAY’S RUN') +
      '<span class="h-state">' + (isDone ? 'Completed' : logged ? 'Run logged' : isSkipped ? 'Skipped' : isMovedOut ? 'Moved to ' + movedLabel(iso, r.id) :
        unresolved ? (iso < today ? 'Not recorded' : 'Window passed · not recorded') :
        (r.movedFrom ? 'Moved from ' + fmtShort(r.movedFrom) + ' · ' : 'Scheduled · ') + r.start) + '</span></div>' +
      '<button class="h-tick' + (isDone ? ' on' : '') + '" aria-pressed="' + isDone + '" aria-label="' +
      (isDone ? 'Mark run not done' : 'Mark run done') + '"><span aria-hidden="true">✓</span> ' + (isDone ? 'Done' : 'Mark done') + '</button></div>' +
      (just === r.id && isDone ? '<i class="h-sweep" aria-hidden="true"></i><div class="completion-note" role="status">✓ Run banked</div>' : '') +
      missedHTML +
      (iso === today && !isDone && !(e.sec > 0) && !isSkipped && !isMovedOut ? readinessHTML(iso) : '') +
      '<div class="h-row"><div class="h-km">' + kmTxt + '<small>km</small></div>' +
      '<div class="h-session">' + esc(r.title) + '</div></div>' +
      '<div class="h-meta"><span><b>SHOE</b>' + esc(r.run.shoe) + '</span>' + paceCell + mpCell +
      '<span><b>WINDOW</b>' + r.start + '–' + r.end + '</span></div>' +
      '<div class="h-detail">' + detailHTML(detail, iso + '|hero', false) + '</div>' +
      zonePrompt +
      (longRunGuard(iso, day) || '') +
      '<button class="session-focus-open" data-focus-id="' + esc(r.id) + '">Focus session <span aria-hidden="true">↗</span></button>' +
      paceTableHTML(r.table) +
      '</section>'
    );
    hero.querySelector('.h-tick').addEventListener('click', () => {
      if (!done[r.id]) state.justTicked = r.id;   // animate on tick-on only
      if (!done[r.id] && isSkipped) setSkip(iso, r.id, false);   // done wins over skipped
      toggleDone(iso, r.id);
      render();
    });
    hero.querySelectorAll('[data-rhr]').forEach((btn) => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-rhr');
      if (act === 'open') {
        const h = readJSON('hr', null);
        state.rhrDraft = rhrReading(iso) || rhrUsual(iso) || (h && h.rest) || 50;
      } else if (act === 'save') {
        writeJSON(rhrKey(iso), { bpm: state.rhrDraft });
        state.rhrDraft = null;
      } else {
        state.rhrDraft = Math.max(25, Math.min(120, state.rhrDraft + Number(act)));
      }
      render();
    }));
    hero.querySelectorAll('[data-missed]').forEach((btn) => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-missed');
      if (act === 'log') { const logBtn = hero.querySelector('.runlogger .h-log'); if (logBtn) logBtn.click(); return; }
      if (act === 'done') { state.justTicked = r.id; toggleDone(iso, r.id); }
      if (act === 'skip') setSkip(iso, r.id, true);
      if (act === 'unskip') setSkip(iso, r.id, false);
      render();
    }));
    const zoneBtn = hero.querySelector('[data-goto="ref"]');
    if (zoneBtn) zoneBtn.addEventListener('click', () => {
      state.view = 'ref';
      window.scrollTo(0, 0);
      render();
      view.querySelector('[data-ref-target="ref-zones"]').click();
    });
    hero.querySelector('.session-focus-open').addEventListener('click', e => openSessionFocus(r, iso, e.currentTarget));
    countUp(hero.querySelector('.h-km'), km, iso);
    const recap = window.RunProgress.debrief(runLogHistory(), iso, todayISO());
    if (recap && !editing) {
      hero.classList.add('has-recap');
      const top = hero.querySelector('.h-top');
      top.querySelector('.h-tag').firstChild.textContent = 'RUN LOGGED';
      top.querySelector('.h-state').textContent = fmtShort(iso);
      const planned = el('<details class="recap-plan" data-disclosure="' + iso + '|recap-plan"' + (openDetails.has(iso + '|recap-plan') ? ' open' : '') + '><summary>View planned session <span>' + kmTxt + ' km</span></summary><div></div></details>');
      Array.from(hero.children).filter(n => n !== top).forEach(n => planned.querySelector('div').appendChild(n));
      hero.append(buildRunRecap(day, iso, recap), planned);
    }
    hero.appendChild(buildRunLogger(day, iso, !!recap));
    return hero;
  }
  function fmtDur(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }

  /* A shareable receipt rendered entirely on this device, from live tokens. */
  function shareRunCard(day, iso) {
    const report = window.RunProgress.debrief(runLogHistory(), iso, todayISO());
    if (!report) return;
    const e = report.current;
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(() => {
      const styles = getComputedStyle(document.documentElement);
      const token = name => styles.getPropertyValue(name).trim();
      const ink = token('--paper'), text = token('--text'), muted = token('--t2');
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
      const x = canvas.getContext('2d');
      const display = '"Archivo", sans-serif', mono = '"Space Mono", monospace', body = '"Inter", sans-serif';
      const write = (value, px, family, weight, left, top, color) => {
        x.font = weight + ' ' + px + 'px ' + family; x.fillStyle = color || text; x.fillText(String(value), left, top);
      };
      x.fillStyle = ink; x.fillRect(0, 0, 1080, 1350);
      x.fillStyle = token('--surface'); x.fillRect(36, 36, 1008, 1278);
      write('WEEK', 52, display, 900, 72, 125);
      write('OS', 52, display, 900, 72 + x.measureText('WEEK').width, 125, token('--accent'));
      x.textAlign = 'right'; write('RUN ' + String(report.runCount).padStart(2, '0'), 28, mono, 400, 1008, 118, muted); x.textAlign = 'left';
      write(fmtDate(iso), 30, body, 400, 72, 210, muted);
      const km = loggedDistance(e.km);
      let size = 260;
      while (measure(x, '900 ' + size + 'px ' + display, km) > 790 && size > 100) size -= 4;
      write(km, size, display, 900, 62, 480);
      const numberWidth = x.measureText(km).width;
      write('km', 58, mono, 400, 80 + numberWidth, 480, muted);
      write(e.estimatedKm ? 'Distance from plan' : 'Logged distance', 25, body, 400, 72, 535, muted);
      x.font = '800 48px ' + display; x.fillStyle = text;
      wrapText(x, day.run ? day.run.title : 'Unplanned run', 72, 620, 920, 57);
      x.strokeStyle = token('--line'); x.lineWidth = 2; x.beginPath(); x.moveTo(72, 790); x.lineTo(1008, 790); x.stroke();
      const values = [['TIME',recordTime(e.sec)],['PACE / KM',DB.paceOf(e.km,e.sec)],['AVG HR',e.hr || '—']];
      values.forEach((v,i) => { write(v[0],22,mono,400,72+i*320,845,muted); write(v[1],42,mono,400,72+i*320,912); });
      const label = report.best ? 'Fastest logged ' + km + ' km' : report.longest ? 'Longest logged run' : report.milestone ? report.milestone + ' km milestone' : 'Your log, to this run';
      const detail = report.best ? recordTime(report.best.gainSec) + ' quicker than your previous best' : report.longest ? '+' + loggedDistance(Number(report.longest.gainKm.toPrecision(12))) + ' km beyond your previous longest' : loggedDistance(report.totalKm) + ' km across ' + report.runCount + ' saved runs';
      write(label, 36, display, 800, 72, 1040);
      write(detail, 27, body, 400, 72, 1092, muted);
      x.setLineDash([8,8]); x.beginPath(); x.moveTo(72,1150); x.lineTo(1008,1150); x.stroke(); x.setLineDash([]);
      write('THAT’S IN THE BANK.', 34, display, 900, 72, 1220);
      write('Whole-run log · ' + iso + (report.estimatedCount ? ' · includes plan-distance estimates' : ''), 22, body, 400, 72, 1270, muted);
      canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], 'week-os-run-' + iso + '.png', {type:'image/png'});
        if (navigator.canShare && navigator.canShare({files:[file]}) && navigator.share) {
          navigator.share({files:[file]}).catch(() => showCardOverlay(canvas));
        } else showCardOverlay(canvas);
      }, 'image/png');
    });
  }

  function measure(x, font, text) {
    const prev = x.font; x.font = font;
    const w = x.measureText(text).width; x.font = prev;
    return w;
  }
  function wrapText(x, text, left, top, maxW, lineH) {
    const words = String(text).split(' ');
    let line = '', y = top;
    for (const w of words) {
      const probe = line ? line + ' ' + w : w;
      if (x.measureText(probe).width > maxW && line) {
        x.fillText(line, left, y); line = w; y += lineH;
      } else line = probe;
    }
    if (line) x.fillText(line, left, y);
  }
  function showCardOverlay(canvas) {
    const ov = el(
      '<dialog class="card-ov" aria-label="Run receipt">' +
      '<img alt="Run card — long-press to save">' +
      '<div class="card-note">Long-press the card to save or share it</div>' +
      '<div class="card-actions"><a class="card-save" download="week-os-run.png">Save image</a><button class="card-x" autofocus>Close</button></div></dialog>'
    );
    ov.querySelector('img').src = canvas.toDataURL('image/png');
    ov.querySelector('.card-save').href = ov.querySelector('img').src;
    ov.querySelector('.card-x').addEventListener('click', () => ov.close());
    ov.addEventListener('close', () => ov.remove(), {once:true});
    document.body.appendChild(ov);
    ov.showModal();
  }

  /* ---- week-progress ring: banked vs planned run km this week ---- */
  function weekRingHTML(iso) {
    const wk = DB.weekKm(getDone, mondayOf(iso), getRunLogEntry);
    if (!wk.planned) return '';
    const pct = Math.min(1, wk.done / wk.planned);
    const C = 2 * Math.PI * 13;
    const fmt = (n) => (n === Math.round(n) ? n : n.toFixed(1));
    return '<span class="wkring" role="img" aria-label="' + fmt(wk.done) + ' of ' +
      fmt(wk.planned) + ' km run this week">' +
      '<svg viewBox="0 0 32 32"><circle class="rg-bg" cx="16" cy="16" r="13"/>' +
      '<circle class="rg-fg" cx="16" cy="16" r="13" stroke-dasharray="' + C.toFixed(1) +
      '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '"/></svg>' +
      '<span class="rg-t"><b>' + fmt(wk.done) + '</b>/' + fmt(wk.planned) + ' km</span></span>';
  }

  function buildCard(b, done, iso, opts) {
    opts = opts || {};
    const isDone = !!done[b.id];
    const cat = CAT_VAR[b.cat] || CAT_VAR.routine;
    if (opts.movedOut) return attachUndoMove(iso, b);
    const expanded = state.expanded === b.id;
    const legDrop = !!(opts.moved && legDropFor(b, iso));
    const legRe = legDrop ? new RegExp(PLAN.moveRules.legPattern, 'i') : null;
    const card = el(
      '<div class="tl-card' + (isDone ? ' done' : '') + (opts.skipped ? ' skipped' : '') + (opts.current ? ' current' : '') + (opts.just ? ' just' : '') + '" style="--cat:' + cat + '">' +
      '<div class="c-main">' +
      '<div class="c-time">' + b.start + (b.end && b.end !== b.start ? '–' + b.end : '') +
      (opts.current ? ' <span class="nowflag">· NOW</span>' : '') + '</div>' +
      '<div class="c-title">' + esc(b.title) + '</div>' +
      '<div class="c-detail">' + detailHTML(b.detail, iso + '|' + b.id, false) + '</div>' +
      (legDrop ? '<div class="mv-note">' + esc(PLAN.moveRules.legNote) + '</div>' : '') +
      (b.table ? paceTableHTML(b.table) : '') +
      (b.plan ? '<details class="session-plan" data-disclosure="' + esc(iso + '|' + b.id + '|plan') + '"' + (openDetails.has(iso + '|' + b.id + '|plan') ? ' open' : '') + '><summary>' + b.plan.length + ' exercises <span>View session</span></summary><div class="c-plan">' + b.plan.map((p) => {
        let w = '';
        if (b.cat === 'gym') {
          const key = exKey(p.ex);
          const last = lastWeight(key);
          const editing = state.wtEdit && state.wtEdit.block === b.id && state.wtEdit.ex === key;
          w = editing
            ? '<input class="xw-in" inputmode="decimal" data-ex="' + key + '" value="' +
              (last ? last.kg : '') + '" aria-label="Weight for ' + esc(p.ex) + '">'
            : '<button class="xw' + (last && last.d === iso ? ' logged' : '') + '" data-ex="' + key +
              '" title="' + (last ? 'last logged ' + last.d : 'log weight') + '">' +
              (last ? fmtKg(last.kg) : '· kg') + '</button>';
        }
        if (legRe && legRe.test(p.ex)) {
          return '<div class="xr drop"><span class="xn">' + esc(p.ex) + '</span><span class="xs">drop this week</span></div>';
        }
        return '<div class="xr"><span class="xn">' + esc(p.ex) + '</span>' +
          '<span class="xs">' + esc(p.sets) + '</span>' + w + '</div>';
      }).join('') + '</div></details>' : '') +
      (b.cat === 'gym' && b.plan && !opts.moved && !opts.skipped ? '<button class="session-focus-open" data-focus-id="' + esc(b.id) + '">Focus session <span aria-hidden="true">↗</span></button>' : '') +
      '<div class="c-cat">' + esc(b.cat) + (opts.skipped ? ' · skipped' : '') +
      (opts.moved ? ' · moved from ' + esc(fmtShort(opts.moved.fromIso)) : '') + '</div>' +
      (opts.just && isDone && (b.cat !== 'run' || opts.moved) ? '<div class="completion-note" role="status">✓ Session banked</div>' : '') +
      (expanded ? '<div class="c-actions">' +
        (opts.skipped ? '<button data-act="unskip">Unskip</button>' : '<button data-act="skip">Skip</button>') +
        (opts.moved ? '<button data-act="return">Return to ' + esc(fmtShort(opts.moved.fromIso)) + '</button>'
                    : '<button data-act="movepick" aria-expanded="' + (state.movePick === b.id) + '">Move to…</button>') +
        (b.cat === 'run' && !opts.moved
          ? '<button data-act="niggle">Niggle — rest 2 days</button>' +
            '<button data-act="illweek">Ill — rest to Sunday</button>'
          : '') +
        '</div>' +
        (state.movePick === b.id && !opts.moved ? '<div class="c-move" role="group" aria-label="Move ' + esc(b.title) + ' to">' +
          moveTargets(iso, b).map((t) => '<button data-move-to="' + t.iso + '"><b>' + esc(t.label) + '</b>' +
            (t.clash ? '<small>' + esc(t.clash) + '</small>' : '<small>free</small>') +
            (t.legDrop ? '<small class="mv-warn">upper + core only</small>' : '') + '</button>').join('') + '</div>' : '') : '') +
      '</div>' +
      '<div class="c-side">' +
      '<button class="tick' + (isDone ? ' on' : '') + '" aria-pressed="' + isDone + '" aria-label="' + (isDone ? 'Mark not done: ' : 'Mark done: ') + esc(b.title) + '">✓ <span>' + (isDone ? 'Done' : 'Mark done') + '</span></button>' +
      '<button class="more-btn" aria-label="Actions">⋯</button>' +
      '</div></div>'
    );
    const focusBtn = card.querySelector('.session-focus-open');
    if (focusBtn) focusBtn.addEventListener('click', () => openSessionFocus(b, iso, focusBtn));
    card.querySelector('.tick').addEventListener('click', () => {
      if (!isDone) state.justTicked = b.id;       // animate on tick-on only
      toggleDone(iso, b.id);
      render();
    });
    card.querySelector('.more-btn').addEventListener('click', () => {
      state.expanded = expanded ? null : b.id;
      state.movePick = null;
      render();
    });
    card.querySelectorAll('[data-move-to]').forEach((btn) => btn.addEventListener('click', () => {
      moveBlock(iso, b, btn.getAttribute('data-move-to'));
      state.expanded = null; state.movePick = null;
      render();
    }));
    card.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'skip') setSkip(iso, b.id, true);
      if (act === 'unskip') setSkip(iso, b.id, false);
      if (act === 'movepick') { state.movePick = state.movePick === b.id ? null : b.id; render(); return; }
      if (act === 'return') returnMoved(iso, b.id);
      if (act === 'niggle') skipRunDays(iso, 2);
      if (act === 'illweek') skipRunDays(iso, 7 - DB.dayIndex(iso));
      state.expanded = null; state.movePick = null;
      render();
    }));
    card.querySelectorAll('.xw').forEach((btn) => btn.addEventListener('click', () => {
      state.wtEdit = { block: b.id, ex: btn.getAttribute('data-ex') };
      render();
    }));
    card.querySelectorAll('.xw-in').forEach((inp) => {
      let doneWith = false;
      const commit = () => {
        if (doneWith) return;
        doneWith = true;
        const v = parseFloat(String(inp.value).replace(',', '.'));
        if (isFinite(v) && v > 0 && v < 500) saveWeight(inp.getAttribute('data-ex'), iso, v);
        state.wtEdit = null;
        render();
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { doneWith = true; state.wtEdit = null; render(); }
      });
      inp.addEventListener('blur', commit);
    });
    return card;
  }

  function movedLabel(iso, id) {
    const t = movedTarget(iso, getOvr(iso), id);
    const di = DB.dayIndex(t);
    return t === DB.addDays(iso, 1) ? 'tomorrow' : DAY_SHORT[di].charAt(0) + DAY_SHORT[di].slice(1).toLowerCase() + ' ' + fmtShort(t);
  }
  function attachUndoMove(iso, b) {
    const cat = CAT_VAR[b.cat] || CAT_VAR.routine;
    const card = el(
      '<div class="tl-card skipped" style="--cat:' + cat + '">' +
      '<div class="c-main"><div class="c-time">' + b.start + '–' + b.end + '</div>' +
      '<div class="c-title">' + esc(b.title) + '</div>' +
      '<div class="moved-tag">→ moved to ' + esc(movedLabel(iso, b.id)) + '</div></div>' +
      '<div class="c-side"><button class="more-btn" aria-label="Undo move">↩</button></div></div>'
    );
    card.querySelector('.more-btn').addEventListener('click', () => { undoMove(iso, b.id); render(); });
    return card;
  }

  /* The skyline: all 30 weeks as one shape — planned km as phase-coloured
     bars, banked km filled inside them, key days flagged, race starred. */
  function buildTrainingJourney(journey) {
    const weeks = journey.weeks, block = PLAN.blocks[0], today = todayISO();
    const current = weeks.find(w=>w.start<=today && today<=w.end);
    const initial = state.journeyWeek || (current ? current.wk : today<block.start ? 1 : weeks.length);
    const fmt = n => Number(n.toFixed(1));
    const max = Math.ceil(Math.max(...weeks.map(w=>Math.max(w.planned,w.recorded)))/10)*10;
    const W=360, left=28, right=352, base=160, top=24, slot=(right-left)/weeks.length;
    const x = i => left+(i+.5)*slot, y = km => base-km/max*(base-top);
    let chart='';
    for(const n of [0,max/2,max]) chart+='<line x1="'+left+'" x2="'+right+'" y1="'+y(n)+'" y2="'+y(n)+'" class="journey-grid"/><text x="20" y="'+(y(n)+3)+'" text-anchor="end">'+n+'</text>';
    weeks.forEach((w,i)=>{
      chart+='<rect x="'+(x(i)-3.8)+'" y="'+y(w.planned)+'" width="7.6" height="'+(base-y(w.planned))+'" rx="2" class="journey-plan-bar"/>';
      if(w.recorded>0) chart+='<rect x="'+(x(i)-2.1)+'" y="'+y(w.recorded)+'" width="4.2" height="'+(base-y(w.recorded))+'" rx="1.5" class="journey-record-bar"/>';
      if((PLAN.keyEvents||[]).some(e=>e.wk===w.wk)) chart+='<circle cx="'+x(i)+'" cy="'+(y(Math.max(w.planned,w.recorded))-7)+'" r="2.5" class="journey-key-dot"/>';
    });
    chart+='<g class="journey-cursor"><line x1="0" x2="0" y1="12" y2="170"/><path d="M-4 7 L4 7 L0 12 Z"/></g>';
    const root=el('<section class="training-journey"><div class="journey-intro"><div class="journey-kicker">YOUR TRAINING JOURNEY</div>'+
      '<h1>Built one run<br>at a time.</h1><div class="journey-totals"><div><b>'+fmt(journey.recorded)+'</b><span>km recorded</span></div><div><b>'+journey.runs+'</b><span>runs recorded</span></div></div>'+
      '<p class="journey-story">'+(journey.runs ? journey.activeWeeks+' weeks with recorded runs. Each one leaves a mark.' : 'Your first recorded run starts the story. The road ahead is already here.')+'</p>'+
      '<div class="journey-calendar"><span>'+journey.elapsedWeeks+' / '+weeks.length+' weeks elapsed</span><span>'+esc(fmtShort(PLAN.race.date))+' · '+esc(PLAN.race.city||'Race day')+'</span></div></div>'+
      '<div class="journey-landscape"><div class="journey-chart-label"><b>The shape of the block</b><span>km / week</span></div>'+
      '<svg viewBox="0 0 '+W+' 180" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Scheduled and recorded weekly kilometres on a shared scale">'+chart+'</svg>'+
      '<div class="journey-legend"><span><i></i>Scheduled</span><span><i></i>Recorded</span><span><i></i>Key day</span></div>'+
      '<div class="journey-phases">'+Object.entries(block.phases).map(([name,range])=>'<button data-journey-week="'+range[0]+'">'+esc(name)+'</button>').join('')+'</div>'+
      '<div class="journey-scrub"><button data-journey-step="-1" aria-label="Previous journey week">‹</button><label><span class="journey-range-label">Explore the weeks</span><input type="range" min="1" max="'+weeks.length+'" step="1" value="'+initial+'" aria-label="Explore training week"></label><button data-journey-step="1" aria-label="Next journey week">›</button></div>'+
      '<div class="journey-selected"></div></div><details class="journey-method"><summary>Where these numbers come from</summary><p>Scheduled kilometres come from the resolved daily sessions, including race day. Recorded kilometres use saved run distance, or scheduled distance for a completion tick or older log without a distance. Future entries are excluded. Weeks elapsed measures calendar time, not completed training.</p></details></section>');
    const range=root.querySelector('input[type="range"]');
    function paint(value) {
      const week=weeks[Math.max(0,Math.min(weeks.length-1,Number(value)-1))]; state.journeyWeek=week.wk;
      range.value=week.wk; range.setAttribute('aria-valuetext','Week '+week.wk+', '+week.phase+', '+fmt(week.planned)+' km scheduled, '+fmt(week.recorded)+' km recorded');
      root.querySelector('.journey-cursor').setAttribute('transform','translate('+x(week.wk-1)+' 0)');
      root.querySelectorAll('[data-journey-step]').forEach(b=>b.disabled=Number(b.dataset.journeyStep)<0?week.wk===1:week.wk===weeks.length);
      root.querySelectorAll('[data-journey-week]').forEach(b=>b.classList.toggle('active',block.weekTable[Number(b.dataset.journeyWeek)-1].phase===week.phase));
      const dailyMax=Math.max(...week.days.map(d=>Math.max(d.planned,d.recorded)),1);
      root.querySelector('.journey-selected').innerHTML='<div class="journey-week-head"><div><span>WEEK</span><h2>'+String(week.wk).padStart(2,'0')+'</h2></div><div><b>'+esc(week.phase)+(week.cutback?' · cutback':'')+'</b><span>'+esc(fmtShort(week.start))+' – '+esc(fmtShort(week.end))+'</span>'+(current&&current.wk===week.wk?'<strong>You are here</strong>':'')+'</div></div>'+
        '<div class="journey-week-numbers"><div><b>'+fmt(week.planned)+'</b><span>km scheduled</span></div><div><b>'+fmt(week.recorded)+'</b><span>km recorded</span></div><div><b>'+fmt(week.longest)+'</b><span>longest run · km</span></div></div>'+
        '<div class="journey-days" aria-label="Open a day">'+week.days.map((d,i)=>'<button data-journey-day="'+d.iso+'" aria-label="'+DAY_NAMES[i]+', '+(d.title?esc(d.title)+', '+fmt(d.planned)+' km':'no run scheduled')+', '+fmt(d.recorded)+' km recorded"><span>'+DAY_SHORT[i].slice(0,1)+'</span><span class="journey-day-plot"><i style="height:'+d.planned/dailyMax*100+'%" class="'+(d.cls==='quality'||d.cls==='race'?'hard':'')+'"></i>'+(d.recorded?'<em style="height:'+d.recorded/dailyMax*100+'%"></em>':'')+'</span><b>'+ (d.planned?fmt(d.planned):'–')+'</b></button>').join('')+'</div>'+
        '<button class="journey-open" data-journey-open="'+week.start+'">Open week '+week.wk+' <span aria-hidden="true">↗</span></button>';
    }
    range.addEventListener('input',()=>paint(range.value));
    root.addEventListener('click',event=>{
      const button=event.target.closest('button'); if(!button)return;
      if(button.dataset.journeyStep) paint(state.journeyWeek+Number(button.dataset.journeyStep));
      if(button.dataset.journeyWeek) paint(button.dataset.journeyWeek);
      if(button.dataset.journeyDay || button.dataset.journeyOpen) {
        if(button.dataset.journeyDay) {state.dateISO=button.dataset.journeyDay;state.view='today';}
        else {state.weekAnchor=button.dataset.journeyOpen;state.view='week';}
        window.scrollTo(0,0);render();
      }
    });
    paint(initial); return root;
  }

  function buildLandmarks(journey) {
    const today=todayISO();
    let nextMarked=false;   // the first key day still ahead is lit; the rest stay outlined
    const root=el('<section class="journey-landmarks"><div class="journey-section-title"><h2>The days that count</h2><span>KEY DAYS</span></div>'+ (PLAN.keyEvents||[]).map((e,i)=>{
      const week=journey.weeks[e.wk-1], day=week.days[e.di], delta=DB.daysBetween(today,day.iso);
      const status=day.recorded>0?'Recorded':delta<0?'Past · not recorded':delta===0?'Today':delta+' days away';
      const next=delta>=0&&!nextMarked; if(next)nextMarked=true;
      return '<button class="journey-event'+(delta>=0?' ahead':'')+(next?' next':'')+'" data-event-day="'+day.iso+'"><span class="journey-event-index" aria-hidden="true">'+(i+1)+'</span><span><small>WEEK '+e.wk+' · '+esc(fmtShort(day.iso))+'</small><b>'+esc(e.label)+'</b><em>'+status+'</em></span><span aria-hidden="true">↗</span></button>';
    }).join('')+'</section>');
    root.addEventListener('click',event=>{const b=event.target.closest('[data-event-day]');if(!b)return;state.dateISO=b.dataset.eventDay;state.view='today';window.scrollTo(0,0);render();});return root;
  }


  /* ================= week view ================= */
  /* The long-run morning is where a short week becomes a big jump. Shown
     BEFORE the run, on the card, only when the week to date is genuinely
     behind and the run has not been logged yet — advice has to arrive
     while it can still change something. */
  function longRunGuard(iso, day) {
    const g = PLAN.longRunGuard;
    if (!g || !day.row || day.blockId !== 'marathon') return null;
    if (!day.run || DB.runClass(day.run) !== 'long') return null;
    if (getRunLogEntry(iso)) return null;                 // already run
    if (iso > todayISO() || getDone(iso)[day.run.id]) return null;
    const monday = DB.addDays(iso, -day.dayIndex);
    let plannedSoFar = 0, ranSoFar = 0, estimated = 0, unknown = 0;
    for (let i = 0; i < day.dayIndex; i++) {
      const d = DB.addDays(monday, i), built = DB.buildDay(d), e = getRunLogEntry(d), done = getDone(d);
      const plan = built.run ? built.run.run.km : 0;
      plannedSoFar += plan;
      ranSoFar += DB.recordedKm(built, done, e);
      if (plan && !(e && e.sec > 0)) {
        if (done[built.run.id]) estimated++;
        else unknown++;
      }
    }
    if (!(plannedSoFar > 0) || ranSoFar >= plannedSoFar * g.shortPct) return null;
    const headline = ranSoFar === 0
      ? 'Earlier runs this week are not recorded yet.'
      : (Math.round(ranSoFar * 10) / 10) + ' km recorded against ' + plannedSoFar + ' km scheduled before today.';
    /* The headline is the fact; the reasoning goes behind the same disclosure
       everything else uses. Rendered open it is seven lines of body copy in
       the hero, on the morning of the longest run of the week, and it pushed
       the log form below the fold. */
    const key = iso + '|guard';
    return '<details class="h-guard" data-disclosure="' + esc(key) + '"' +
      (openDetails.has(key) ? ' open' : '') + '><summary><b>' +
      esc(headline) + '</b><small>Why</small></summary>' +
      '<div class="detail-body"><p>' + (unknown ? unknown + ' scheduled runs have neither a log nor a completion tick. Not recorded does not mean not done. ' : '') +
      (estimated ? 'Planned distance used for ' + estimated + ' completed runs without logs. ' : '') + '</p><p>' + esc(g.note) + '</p></div></details>';
  }

  /* Week SHAPE, not week total. The banked figure answers "did I run the
     kilometres"; this answers "did I run the week". They can disagree
     completely — see PLAN.shapeRule. Reports only once the week is done. */
  function weekShapeNote(anchor, day0) {
    const r = PLAN.shapeRule;
    if (!r || day0.blockId !== 'marathon' || !day0.row) return null;
    if (DB.addDays(anchor, 6) > todayISO()) return null;      // week still running
    const split = DB.distancesForWeek(day0.row);
    const slots = [
      { di: 1, key: 'tue', name: 'Tue', plan: split.tue },
      { di: 2, key: 'wed', name: 'Wed', plan: split.wed },
      { di: 3, key: 'thu', name: 'Thu', plan: split.thu },
      { di: 5, key: 'sat', name: 'Sat', plan: split.sat },
      { di: 6, key: 'long', name: 'Long', plan: split.long },
    ].filter((s) => s.plan > 0);
    const exempt = r.shortExempt || [];
    const isShort = (s) => s.pct < r.shortPct && !exempt.includes(s.key);
    let ranTotal = 0, planTotal = 0, lrRan = 0;
    slots.forEach((s) => {
      const iso = DB.addDays(anchor, s.di);
      const e = getRunLogEntry(iso);
      const day = DB.buildDay(iso);
      s.ran = DB.recordedKm(day, getDone(iso), e);
      s.pct = s.plan ? s.ran / s.plan : 0;
      ranTotal += s.ran; planTotal += s.plan;
      if (s.di === 6) lrRan = s.ran;
    });
    if (!(ranTotal > 0)) return null;
    const shareRan = (lrRan / ranTotal) * 100;
    const sharePlan = (split.long / planTotal) * 100;
    const skewed = shareRan - sharePlan >= r.lrShareOverPts;
    const off = slots.filter((s) => isShort(s) || s.pct > r.overPct);
    if (!skewed && !off.length) return null;

    const chips = slots.map((s) => {
      const cls = isShort(s) ? ' short' : s.pct > r.overPct ? ' over' : '';
      return '<span class="shp' + cls + '"><i>' + s.name + '</i>' +
        (Math.round(s.ran * 10) / 10) + '<small>/' + s.plan + '</small></span>';
    }).join('');
    /* Three different weeks: the long run carried it (skewed), the long run
       itself came in short, or the shape held and one session was off.
       Red is for the first two; the third is a quieter note. */
    const lr = slots.find((s) => s.key === 'long');
    const lrShort = !skewed && lr && isShort(lr) && r.lrShortNote;
    const held = !skewed && !lrShort && r.offNote;
    const fmt = (n) => Math.round(n * 10) / 10;
    return el(
      '<div class="wk-shape' + (held ? ' held' : '') + '"><b>Recorded week shape.</b> ' +
      fmt(ranTotal) + ' of ' + planTotal + ' km banked' +
      (skewed ? ', but the long run took <b>' + Math.round(shareRan) +
          '%</b> of the week against a planned ' + Math.round(sharePlan) + '%'
        : lrShort ? '; the long run came in at <b>' + fmt(lr.ran) + ' of ' + lr.plan + ' km</b>'
        : held ? '; the long run took ' + Math.round(shareRan) + '% against a planned ' + Math.round(sharePlan) + '%' : '') + '.' +
      '<div class="shp-row">' + chips + '</div>' +
      '<div class="shp-note">' + esc(lrShort ? r.lrShortNote : held ? r.offNote : r.note) + '</div>' +
      (r.caveat ? '<div class="shp-note shp-caveat">' + esc(r.caveat) + '</div>' : '') +
      '</div>'
    );
  }

  /* Kilometres actually logged in the seven days from `from`. */
  function loggedKm(from) {
    let km = 0;
    for (let i = 0; i < 7; i++) {
      const iso = DB.addDays(from, i);
      const e = getRunLogEntry(iso);
      if (!e || !e.sec) continue;
      const day = DB.buildDay(iso);
      km += e.km || (day.run ? day.run.run.km : 0);
    }
    return km;
  }

  /* Advisory: this week's plan against last week's REALITY, not last
     week's plan. Fires only inside the marathon block, only once there is
     a previous week to compare, and never mutates anything. */
  function loadJumpNote(anchor, day0) {
    const r = PLAN.returnRule;
    if (!r || day0.blockId !== 'marathon' || day0.week < 2) return null;
    const prev = DB.addDays(anchor, -7);
    const prevRow = DB.weekRow(PLAN.blocks[0], day0.week - 1);
    if (!prevRow) return null;
    const ran = DB.weekKm(getDone, prev, getRunLogEntry).done;
    if (!(ran > 0)) return null;                 // nothing logged ≠ nothing run
    if (ran >= prevRow.km * r.shortfall) return null;
    if (day0.row.km < ran * r.jumpRatio) return null;
    const pct = Math.round((ran / prevRow.km) * 100);
    return el(
      '<div class="wk-jump"><b>Last week’s recorded distance.</b> Week ' + (day0.week - 1) +
      ' records <b>' + (Math.round(ran * 10) / 10) + ' of ' + prevRow.km + ' km</b> (' + pct +
      '%). This week plans ' + day0.row.km + ' — about ' +
      (Math.round((day0.row.km / ran) * 10) / 10) + '× the recorded distance. Missing logs or ticks may understate it.<br>' +
      esc(r.note) + '</div>'
    );
  }

  function renderWeek() {
    const anchor = state.weekAnchor || mondayOf(todayISO());
    state.weekAnchor = anchor;
    const day0 = DB.buildDay(anchor);
    /* the aura follows the week being browsed — page into Build, the app turns blue */
    document.documentElement.style.setProperty('--phase-accent', PHASE_TONE[day0.phase] || 'var(--accent)');
    document.body.dataset.phase = day0.phase || 'none';
    const view = document.getElementById('view');
    view.innerHTML = '';

    let title, sub = '', note = '';
    if (day0.blockId === 'marathon') {
      title = 'Week ' + day0.week;
      const chips = ['<span class="chip ' + esc(day0.phase) + '">' + esc(day0.phase) + '</span>'];
      if (day0.row.cutback) chips.push('<span class="chip mut">cutback</span>');
      if (day0.row.key) chips.push('<span class="chip hot">key</span>');
      sub = fmtShort(anchor) + ' – ' + fmtShort(DB.addDays(anchor, 6)) + ' ' + chips.join('');
      note = day0.label || '';
    } else if (day0.blockId === 'recovery') {
      title = 'Recovery — week ' + day0.week;
      sub = fmtShort(anchor) + ' – ' + fmtShort(DB.addDays(anchor, 6));
      note = day0.row && day0.row.notes ? day0.row.notes : '';
    } else {
      title = 'Standing week';
      sub = fmtShort(anchor) + ' – ' + fmtShort(DB.addDays(anchor, 6));
      note = PLAN.defaultWeek.note;
    }

    const head = el(
      '<div class="wk-head' + (day0.row && day0.row.key ? ' key' : '') + '">' +
      (day0.blockId === 'marathon' ? '<span class="wk-num" aria-hidden="true">' + day0.week + '</span>' : '') +
      '<button class="nav" data-d="-7" aria-label="Previous week">‹</button>' +
      '<h1>' + esc(title) + '</h1>' +
      '<button class="nav" data-d="7" aria-label="Next week">›</button></div>'
    );
    head.querySelectorAll('.nav').forEach((btn) => btn.addEventListener('click', () => {
      state.weekAnchor = DB.addDays(anchor, Number(btn.getAttribute('data-d')));
      render();
    }));
    view.appendChild(head);
    view.appendChild(el('<div class="wk-sub">' + sub + '</div>'));
    if (note) view.appendChild(el('<div class="wk-note">' + esc(note) + '</div>'));
    const jump = loadJumpNote(anchor, day0);
    if (jump) view.appendChild(jump);
    const shape = weekShapeNote(anchor, day0);
    if (shape) view.appendChild(shape);

    /* banked km — only once the week has started */
    if (anchor <= todayISO()) {
      const km = DB.weekKm(getDone, anchor, getRunLogEntry);
      if (km.planned > 0) {
        const fmt = (n) => (n === Math.round(n) ? n : n.toFixed(1));
        const pct = Math.min(100, (km.done / km.planned) * 100).toFixed(1);
        view.appendChild(el(
          '<div class="wkp" role="img" aria-label="' + fmt(km.done) + ' of ' + fmt(km.planned) + ' km banked">' +
          '<div class="wkp-label">✓ <b>' + fmt(km.done) + '</b> of ' + fmt(km.planned) + ' km recorded</div><p class="log-note">Logged distance, or planned distance for runs ticked done.</p>' +
          '<div class="wkp-track"><i style="width:' + pct + '%"></i></div></div>'
        ));
      }
    }

    /* seven days, run distances as the anchors — rows double as a bar chart */
    const real = todayISO();
    const week7 = [];
    for (let i = 0; i < 7; i++) week7.push(DB.buildDay(DB.addDays(anchor, i)));
    const maxKm = Math.max(1, ...week7.map((dd) => (dd.run ? dd.run.run.km : 0)));

    // The existing daily plan, drawn on one common scale. Completion marks
    // are separate from bar height: ticking a run does not change its plan.
    const totalKm = week7.reduce((n, d) => n + (d.run ? d.run.run.km : 0), 0);
    const profile = el('<section class="week-profile" aria-label="Planned daily distances">' +
      '<div class="profile-head"><div><span class="profile-label">DISTANCE PROFILE</span>' +
      '<h2>' + (Math.round(totalKm * 10) / 10) + '<small> km planned</small></h2></div>' +
      '<span class="profile-count">' + week7.filter((d) => d.run).length + ' run days</span></div>' +
      '<div class="profile-bars">' + week7.map((d, i) => {
        const km = d.run ? d.run.run.km : 0;
        const banked = d.run && !!getDone(d.iso)[d.run.id];
        const cls = d.run ? DB.runClass(d.run) : 'rest';
        const kind = cls === 'race' || cls === 'quality' ? 'hard' : cls === 'long' ? 'long' : cls === 'rest' ? 'rest' : 'easy';
        return '<button class="profile-day ' + kind + '" data-date="' + d.iso + '"' +
          (d.iso === real ? ' aria-current="date"' : '') + ' aria-label="' + esc(fmtDate(d.iso) +
          ': ' + (d.run ? km + ' km, ' + d.run.title : 'No run') + (banked ? ', completed' : '')) + '">' +
          '<span class="profile-track"><i style="height:' + (km / maxKm * 100).toFixed(1) + '%"></i></span>' +
          '<b class="profile-km">' + (km || '—') + '</b><span class="profile-date">' + DAY_SHORT[i] + '</span>' +
          '<span class="profile-state">' + (banked ? '✓' : km ? '' : 'rest') + '</span></button>';
      }).join('') + '</div><div class="profile-legend"><span>Easy / recovery</span><span>Quality / race</span><span>Long</span>' +
      '<span>✓ completed</span></div></section>');
    profile.querySelectorAll('[data-date]').forEach((button) => button.addEventListener('click', () => {
      state.view = 'today'; state.dateISO = button.dataset.date; state.expanded = null;
      window.scrollTo(0, 0); render();
    }));
    view.insertBefore(profile, view.children[2] || null);
    if (day0.blockId === 'marathon') profile.after(buildJourney());

    const days = el('<div class="wk-days"></div>');
    for (let i = 0; i < 7; i++) {
      const iso = DB.addDays(anchor, i);
      const day = week7[i];
      const done = getDone(iso);
      /* What actually happened, not just the plan: a logged run counts as
         done, skipped and moved-out sessions leave the count, moved-in ones
         join it. */
      const ovr = getOvr(iso), log = getRunLogEntry(iso), movedIn = getMoveIn(iso);
      const runLogged = !!(log && log.sec > 0);
      const doables = day.blocks.filter((b) => b.doable && !ovr.skip[b.id] && !ovr.moved[b.id]);
      const isDoneBlock = (b) => !!done[b.id] || (day.run && b.id === day.run.id && runLogged);
      const doneCount = doables.filter(isDoneBlock).length + movedIn.filter((m) => done[m.id]).length;
      const dueCount = doables.length + movedIn.length;
      const d = DB.parseLocalDate(iso);
      const fmtKmS = (k) => (Math.round(k * 10) / 10).toString();
      const st = [];
      if (day.run) {
        const rid = day.run.id;
        if (runLogged || done[rid]) st.push('<span class="d-st ok">✓ ' + fmtKmS(DB.recordedKm(day, done, log)) + ' km' + (runLogged ? '' : ' · ticked') + '</span>');
        else if (ovr.skip[rid]) st.push('<span class="d-st off">skipped</span>');
        else if (ovr.moved[rid]) st.push('<span class="d-st mv">→ ' + esc(movedLabel(iso, rid)) + '</span>');
        else if (iso < real) st.push('<span class="d-st off">not recorded</span>');
      } else if (runLogged) {
        st.push('<span class="d-st ok">✓ ' + fmtKmS(DB.recordedKm(day, done, log)) + ' km unplanned</span>');
      }
      day.blocks.filter((b) => b.doable && b.cat !== 'run' && (ovr.skip[b.id] || ovr.moved[b.id])).forEach((b) => {
        const head = esc(b.title.replace(/ *[—·(].*$/, '').trim());
        st.push(ovr.moved[b.id] ? '<span class="d-st mv">' + head + ' → ' + esc(movedLabel(iso, b.id).replace(/ \d+ \w+$/, '')) + '</span>'
          : '<span class="d-st off">' + head + ' skipped</span>');
      });
      movedIn.forEach((m) => {
        const from = DB.dayIndex(m.fromIso);
        st.push('<span class="d-st mv">+ ' + esc(m.title.replace(/ *[—·(].*$/, '').trim()) + ' from ' + DAY_SHORT[from].charAt(0) + DAY_SHORT[from].slice(1).toLowerCase() + '</span>');
      });
      const statusHtml = st.length ? '<div class="d-status">' + st.join('') + '</div>' : '';

      let cls = 'wk-day' + (iso === real ? ' today' : iso < real ? ' past' : '');
      let runHtml, barHtml = '';
      if (day.run) {
        const km = day.run.run.km;
        cls += ' has-run' + (km === maxKm ? ' lr' : '');
        barHtml = '<i class="d-bar' + (done[day.run.id] || runLogged ? ' done' : ovr.skip[day.run.id] || ovr.moved[day.run.id] ? ' off' : '') +
          '" style="width:' + ((km / maxKm) * 100).toFixed(1) + '%"></i>';
        runHtml = {
          run: '<div class="d-run">' + esc(day.run.title) + '</div>' +
            '<div class="d-extras">' + esc(day.run.run.shoe) + extraBits(day, ovr) + '</div>' + statusHtml,
          km: (km === Math.round(km) ? km : km.toFixed(1)) + '<small>km</small>',
        };
      } else {
        runHtml = {
          run: '<div class="d-run rest">No run</div><div class="d-extras">' + (extraBits(day, ovr).replace(/^ · /, '') || 'recovery') + '</div>' + statusHtml,
          km: '—',
        };
      }

      const row = el(
        '<button class="' + cls + '"' + (iso === real ? ' aria-current="date"' : '') + '>' +
        '<span class="d-date"><b>' + DAY_SHORT[i] + '</b><span>' + d.getDate() + '</span></span>' +
        '<span class="d-main">' + runHtml.run + '</span>' +
        '<span class="d-right"><span class="d-km">' + runHtml.km + '</span>' +
        '<span class="d-done' + (dueCount && doneCount === dueCount ? ' all' : '') + '">' +
        (iso <= real && dueCount ? '<br>' + doneCount + '/' + dueCount : '') + '</span></span>' +
        barHtml +
        '</button>'
      );
      row.addEventListener('click', () => { state.view = 'today'; state.dateISO = iso; window.scrollTo(0, 0); render(); });
      days.appendChild(row);
    }
    Array.prototype.forEach.call(days.children, (c, i) => c.style.setProperty('--i', i));
    view.appendChild(days);
  }

  function extraBits(day, ovr) {
    const bits = day.blocks
      .filter((b) => b.doable && b.cat !== 'run' && b.cat !== 'reading' && b.cat !== 'study' &&
        !(ovr && (ovr.skip[b.id] || ovr.moved[b.id])))
      .map((b) => ({ head: b.title.replace(/ *[—·(].*$/, '').trim(), tail: (b.title.match(/—\s*(.+)$/) || [])[1] || '' }));
    /* Two sessions that share a name (Basketball — 1v1, Basketball —
       shooting) read as one line with both halves, not a duplicate. */
    const out = [];
    bits.forEach((x) => {
      const same = bits.filter((y) => y.head === x.head);
      if (same.length < 2) { out.push(x.head); return; }
      if (same[0] !== x) return;
      out.push((x.head + ' ' + same.map((y) => y.tail).filter(Boolean).join(' + ')).trim());
    });
    return out.length ? ' · ' + esc(out.join(' · ')) : '';
  }

  /* ================= plan view ================= */
  function renderPlan() {
    const view = document.getElementById('view');
    view.innerHTML = '';
    const block = PLAN.blocks[0];
    const today = todayISO();
    const cur = DB.resolveBlock(today);

    const journey = DB.trainingJourney(getDone,getRunLogEntry,today);
    const adh = {weekKmDone:Object.fromEntries(journey.weeks.map(w=>[w.wk,w.recorded]))};
    const fmt = n => Number(n.toFixed(1));
    view.appendChild(buildTrainingJourney(journey));
    view.appendChild(buildLandmarks(journey));

    const rows = el('<div class="plan-rows"></div>');
    const PHASE = { base: 'var(--phase-base)', build: 'var(--phase-build)', taper: 'var(--phase-taper)' };
    const maxKm = Math.max(...block.weekTable.map((r) => r.km));
    let lastPhase = '';
    for (const row of block.weekTable) {
      /* phase headers turn the list into a season board */
      if (row.phase !== lastPhase) {
        lastPhase = row.phase;
        const span = block.weekTable.filter((r) => r.phase === row.phase);
        rows.appendChild(el(
          '<div class="p-phasehead" style="--pc:' + PHASE[row.phase] + '"><b>' + esc(row.phase) + '</b>' +
          '<span>wks ' + span[0].wk + '–' + span[span.length - 1].wk + '</span></div>'
        ));
      }
      const dates = DB.weekDates(block, row.wk);
      const isNow = cur.block && cur.block.id === 'marathon' && cur.week === row.wk;
      const isPast = dates.end < today;
      const flags = [
        row.cutback ? 'CUTBACK' : '', row.key ? 'KEY' : '', row.race ? 'RACE' : '',
        row.noBasketball && !row.race ? 'NO BBALL' : '', row.offWork ? 'OFF WORK' : '',
      ].filter(Boolean).join(' · ');
      const sess = row.race ? 'Race week — see the day plans'
        : (row.wed || row.sun) ? esc((row.wed || '—') + ' / ' + (row.sun || '—'))
        : esc(row.notes || '');
      /* per-week load bar: stacked, the rows read as the block's mountain profile */
      const banked = adh.weekKmDone[row.wk] || 0;
      const loadHtml = '<span class="p-load" style="width:' + ((row.km / maxKm) * 100).toFixed(1) +
        '%;--pc:' + PHASE[row.phase] + '"><i style="width:' +
        (row.km ? Math.min(100, (banked / row.km) * 100).toFixed(1) : 0) + '%"></i></span>';
      const r = el(
        '<button class="plan-row' + (isNow ? ' now' : isPast ? ' past' : '') + (row.race ? ' race' : '') + '">' +
        '<span class="p-wk">' + row.wk + '</span>' +
        '<span class="p-bar" style="background:' + PHASE[row.phase] + '"></span>' +
        '<span class="p-main"><span class="p-dates">' + fmtShort(dates.start) + '–' + fmtShort(dates.end) + '</span>' +
        '<span class="p-sess">' + sess + '</span>' +
        (flags ? '<span class="p-flags">' + flags + '</span>' : '') +
        (row.notes && !row.race ? '<span class="p-dates">' + esc(row.notes) + '</span>' : '') + '</span>' +
        '<span class="p-km"><b>' + row.km + '</b>km<small>LR ' + row.lr + '</small>' +
        (adh.weekKmDone[row.wk] ? '<small class="p-done">✓ ' + fmt(adh.weekKmDone[row.wk]) + '</small>' : '') +
        '</span>' + loadHtml + '</button>'
      );
      r.addEventListener('click', () => {
        state.view = 'week';
        state.weekAnchor = dates.start;
        window.scrollTo(0, 0);
        render();
      });
      rows.appendChild(r);
    }

    /* the recovery fortnight rides at the bottom of the board */
    const rec = PLAN.blocks.find((b) => b.id === 'recovery');
    if (rec) {
      rows.appendChild(el(
        '<div class="p-phasehead" style="--pc:' + PHASE.taper + '"><b>' + esc(rec.name) + '</b>' +
        '<span>' + rec.weeks + ' wks post-race</span></div>'
      ));
      for (const row of rec.weekTable) {
        const dates = DB.weekDates(rec, row.wk);
        const isNow = cur.block && cur.block.id === 'recovery' && cur.week === row.wk;
        const r = el(
          '<button class="plan-row rec' + (isNow ? ' now' : dates.end < today ? ' past' : '') + '">' +
          '<span class="p-wk">R' + row.wk + '</span>' +
          '<span class="p-bar" style="background:' + PHASE.taper + '"></span>' +
          '<span class="p-main"><span class="p-dates">' + fmtShort(dates.start) + '–' + fmtShort(dates.end) + '</span>' +
          '<span class="p-sess">' + esc(row.notes || '') + '</span></span>' +
          '<span class="p-km"><b>' + row.km + '</b>km</span>' +
          '<span class="p-load" style="width:' + ((row.km / maxKm) * 100).toFixed(1) + '%;--pc:' + PHASE.taper + '"></span>' +
          '</button>'
        );
        r.addEventListener('click', () => {
          state.view = 'week';
          state.weekAnchor = dates.start;
          window.scrollTo(0, 0);
          render();
        });
        rows.appendChild(r);
      }
    }

    Array.prototype.forEach.call(rows.children, (c, i) => c.style.setProperty('--i', i));
    const archive = el('<details class="journey-all"><summary>All weeks & recovery <span>View the full programme</span></summary></details>');
    archive.appendChild(rows); view.appendChild(archive);
    view.appendChild(el('<div class="ref-note">After the fortnight the standing week takes over — until the next block is written into data/plan.js.</div>'));
  }

  /* ================= reference view ================= */
  function renderRef() {
    const view = document.getElementById('view');
    view.innerHTML = '';
    const refRow = (k, v) => '<div class="ref-row pace-row' + (/^\d+:\d+\s*\/km$/.test(v) ? ' numeric' : '') +
      '"><span>' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';
    const section = (id, node) => { node.id = id; node.tabIndex = -1; return node; };
    /* the race gets a statement card, not a table */
    const cd = DB.raceCountdown(todayISO());
    const cdBit = cd.past ? 'DONE — MARATHONER'
      : cd.days === 0 ? 'RACE DAY'
      : cd.weeks === 0 ? cd.rem + ' DAY' + (cd.rem === 1 ? '' : 'S') + ' TO THE GUN'
      : cd.weeks + 'W ' + cd.rem + 'D TO THE GUN';
    view.appendChild(el('<div class="ref ref-heading" id="ref-top"><h1>Reference</h1><p>Your training field guide</p></div>'));
    const index = el('<nav class="ref-index" aria-label="Reference sections">' +
      [['paces', 'Paces'], ['zones', 'HR zones'], ['log', 'Run log'], ['fuel', 'Fuelling'], ['app', 'App status'], ['data', 'Backup']]
        .map(([id, label]) => '<button data-ref-target="ref-' + id + '">' + label + '<span aria-hidden="true">↗</span></button>').join('') + '</nav>');
    index.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ref-target]');
      if (!button) return;
      const target = document.getElementById(button.dataset.refTarget);
      if (target) {
        if (target.tagName === 'DETAILS') target.open = true;
        (target.querySelector('summary') || target).focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' });
      }
    });
    view.appendChild(index);
    view.appendChild(el(
      '<div class="race-card">' +
      '<div class="rc-kicker">🇨🇾 ' + esc(PLAN.race.name) + '</div>' +
      '<div class="rc-where">' + esc(fmtDate(PLAN.race.date)) + ' · gun ' + esc(PLAN.race.gun) +
      (PLAN.race.city ? ' · ' + esc(PLAN.race.city) : '') + '</div>' +
      '<div class="rc-goal">' + esc(PLAN.race.goal) + '<small>' + esc(PLAN.race.goalPace) + '</small></div>' +
      '<div class="rc-meta"><span>Stretch bet ' + esc(PLAN.race.stretch) + ' · ' + esc(PLAN.race.stretchPace) + '</span>' +
      '<span class="rc-cd">' + esc(cdBit) + '</span></div>' +
      '</div>'
    ));
    if (PLAN.race.course || PLAN.race.conditions) {
      view.appendChild(el(
        '<details class="ref ref-course"><summary>Course & conditions</summary>' +
        (PLAN.race.course ? '<div class="ref-note">' + esc(PLAN.race.course) + '</div>' : '') +
        (PLAN.race.conditions ? '<div class="ref-note">' + esc(PLAN.race.conditions) + '</div>' : '') +
        '</details>'
      ));
    }
    view.appendChild(el(
      '<div class="ref" id="ref-paces" tabindex="-1">' +
      '<h2>Paces</h2><div class="ref-card pace-card">' +
      PLAN.paces.map((p) => refRow(p.type, withZones(p.pace))).join('') + '</div>' +
      '<div class="ref-note">' + esc(PLAN.recalibration) + '</div>' +
      '</div>'
    ));
    view.appendChild(buildEasyBandSection());
    view.appendChild(section('ref-zones', buildZoneSection()));
    view.appendChild(section('ref-log', buildTrainingLogSection()));
    view.appendChild(buildRecalSection());
    /* shoes wear their tier: easy / quality / race */
    const shoeTone = (job) => /race/i.test(job) ? 'var(--accent)'
      : /quality|MP/i.test(job) ? 'var(--phase-build)' : 'var(--cat-run)';
    view.appendChild(el(
      '<div class="ref">' +
      '<h2>Shoes</h2><div class="ref-card">' +
      PLAN.shoes.map((s) =>
        '<div class="ref-row"><span><i class="dot" style="background:' + shoeTone(s.job) + '"></i>' +
        esc(s.shoe + ' · ' + s.size) + '</span><span class="v">' + esc(s.job) + '</span></div>').join('') + '</div>' +
      '<div class="ref-note">' + esc(PLAN.pro4Budget) + '</div>' +
      '</div>'
    ));
    view.appendChild(buildOdoSection());
    view.appendChild(section('ref-fuel', buildFuelSection()));
    view.appendChild(el(
      '<div class="ref">' +
      '<h2>Rules of the block</h2><ol class="ref-list">' +
      PLAN.rules.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ol>' +
      '<h2>Weekly load budget</h2><div class="ref-note">' + esc(PLAN.loadBudget) + '</div>' +
      '<h2>Open questions</h2><ul class="ref-list qs">' +
      PLAN.openQuestions.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>' +
      '</div>'
    ));
    view.appendChild(section('ref-app', buildDiagSection()));
    view.appendChild(buildCalendarSection());
    view.appendChild(section('ref-data', buildDataSection()));
    view.querySelectorAll('[id^="ref-"]:not(#ref-top)').forEach((target) => {
      const back = el('<button class="ref-back">↑ Reference sections</button>');
      back.addEventListener('click', () => { index.scrollIntoView({ block: 'start' }); index.querySelector('button').focus({ preventScroll: true }); });
      target.appendChild(back);
    });
    // Move live nodes into native disclosures so their existing controls keep
    // their event handlers. Every section remains reachable from the index.
    Array.from(view.children).filter(node => node.matches('div.ref:not(.ref-heading)')).forEach(node => {
      const heading = node.querySelector('h2'); if (!heading) return;
      const title = heading.textContent;
      const id = node.id || 'ref-' + title.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      const fold = el('<details class="ref-fold" id="' + esc(id) + '" data-disclosure="' + esc(id) +
        '"><summary><h2>' + esc(title) + '</h2><span aria-hidden="true">+</span></summary></details>');
      fold.open = openDetails.has(id);
      node.removeAttribute('id'); node.removeAttribute('tabindex'); heading.remove();
      node.before(fold); fold.appendChild(node);
    });
  }

  /* ---- tune-up recalibrator (§10, advisory — the plan file stays canonical) ---- */
  function parseHalf(s) {
    const m = String(s).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m || +m[2] >= 60 || +(m[3] || 0) >= 60) return null;
    const sec = (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
    return sec >= 4200 && sec <= 12000 ? sec : null;      // 1:10–3:20 sanity band
  }
  function fmtClock(sec) {
    /* Round to whole minutes FIRST, then split. Rounding the remainder on
       its own lets it reach 60 and print an hour that does not exist: a 1:55
       half projected 3:59:47, which came out as "3:60". */
    const mins = Math.round(sec / 60);
    return Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0');
  }
  function fmtPace(secPerKm) {
    return DB.fmtPaceSec(Math.round(secPerKm)) + '/km';
  }
  function recalVerdict(halfSec) {
    const riegel = halfSec * Math.pow(2, 1.06);           // T×(42.195/21.0975)^1.06
    return '<p>Compare your result with the plan’s reference anchors:</p>' +
      '<div class="recal-anchors">' + PLAN.recalibrationAnchors.map(a =>
        '<div class="ref-row"><span>' + esc(a.half) + '</span><span class="v">' + esc(a.target) + '</span></div>').join('') + '</div>' +
      '<p>' + esc(PLAN.recalibration) + '</p>' +
      '<p>Riegel model projection: <b>' + esc(fmtClock(riegel)) + '</b> (' + esc(fmtPace(riegel / 42.195)) + '). ' +
      'A model estimate, not an automatic race target.</p>' +
      '<p>No additional bands are defined between or beyond these anchors. Your training plan has not changed.</p>';
  }

  function buildRecalSection() {
    const saved = readJSONSafeString('recal');
    const wrap = el(
      '<div class="ref"><h2>Tune-up recalibrator</h2><div class="ref-card data-card">' +
      '<div class="ref-note">After the Week-24 half (Sun 13 Dec), enter your time. §10 sets the target — ambition doesn’t.</div>' +
      '<div class="data-actions"><input class="recal-in" inputmode="numeric" ' +
      'placeholder="1:54:30" value="' + esc(saved) + '" aria-label="Half marathon time"> ' +
      '<button data-io="recal">Compare time</button></div>' +
      '<div class="data-msg recal-out" role="status"></div></div></div>'
    );
    const input = wrap.querySelector('.recal-in');
    const out = wrap.querySelector('.recal-out');
    const show = (raw) => {
      const sec = parseHalf(raw);
      if (!sec) { out.textContent = raw ? 'Time reads as h:mm or h:mm:ss — e.g. 1:54:30.' : ''; return; }
      out.innerHTML = recalVerdict(sec);
    };
    wrap.querySelector('[data-io="recal"]').addEventListener('click', () => {
      const raw = input.value.trim();
      if (!raw || parseHalf(raw)) {
        try { localStorage.setItem('recal', raw); } catch (e) { /* fine */ }
      }
      show(raw);
    });
    if (saved) show(saved);
    return wrap;
  }
  function readJSONSafeString(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  /* ---- Pro 4 odometer (§11) ---- */
  /* Easy pace is the block's slowest-moving progress signal — a static
     band would hide it. Marks the live phase and names the benchmark. */
  function buildEasyBandSection() {
    const wk = DB.weekNumber(todayISO());
    const live = DB.easyBand(wk);
    const bands = PLAN.easyBands;
    const rows = bands.map((b, i) => {
      const to = i + 1 < bands.length ? bands[i + 1].fromWk - 1 : 30;
      const span = b.fromWk === to ? 'Wk ' + b.fromWk : 'Wk ' + b.fromWk + '–' + to;
      const now = b === live;
      return '<div class="ref-row' + (now ? ' is-now' : '') + '">' +
        '<span>' + (now ? '<i class="dot" style="background:var(--accent)"></i>' : '') +
        esc(span) + '</span>' +
        '<span class="v">' + esc(b.band) + ' · good day <b>' + esc(b.good) + '</b></span></div>';
    }).join('');
    const bm = PLAN.benchmark;
    return el(
      '<div class="ref"><h2>Easy pace by phase</h2><div class="ref-card">' + rows + '</div>' +
      '<div class="ref-note"><b>Now (Wk ' + wk + '):</b> band ' + esc(live.band) +
      '/km · a clear, 7/10 day should return <b>' + esc(live.good) + '</b>. ' + esc(live.note) + '</div>' +
      '<div class="ref-note"><b>Benchmark:</b> ' + esc(bm.slot) + '. ' + esc(bm.log) + '<br>' +
      bm.conditions.map((c) => '· ' + esc(c)).join('<br>') + '</div>' +
      '<div class="ref-note">' + esc(bm.expect) + '</div></div>'
    );
  }

  /* Fuelling maths (§12 rule 4). The gel interval IS the carb rate, and
     that arithmetic is the whole point — "every 35–40 min" sounds like a
     rule but is really a number, and that number is too small for a
     3h45 race. Shown as a ladder with this week's long run placed on it. */
  function buildFuelSection() {
    const g = PLAN.gels;
    const wk = DB.weekNumber(todayISO());
    const row = DB.weekRow(PLAN.blocks[0], wk);
    const lrMin = row && row.lr ? Math.round(row.lr * PLAN.pacing.long) : 0;
    /* which tier this week's long run falls in — the one to rehearse */
    const liveEvery = lrMin > g.longRunMin ? 30 : lrMin > g.minRunMin ? 35 : 0;
    /* Widest rate in the ladder sets the bar scale, so the rows read as a
       ladder at a glance rather than as five numbers. */
    const maxRate = Math.max.apply(null, g.ladder.map((l) => l.rate));
    const rows = g.ladder.map((l) => {
      const now = l.every === liveEvery;
      const race = /RACE/.test(l.note);
      return '<div class="frow' + (now ? ' is-now' : '') + (race ? ' is-race' : '') + '">' +
        '<span class="fi">every ' + l.every + ' min</span>' +
        '<span class="fr">' + l.rate + ' g/h</span>' +
        '<span class="fbar"><i style="width:' + Math.round((l.rate / maxRate) * 100) + '%"></i></span>' +
        '<span class="fn">' + esc(l.note) + '</span></div>';
    }).join('');
    const live = lrMin
      ? '<b>Wk ' + wk + ':</b> the long run is ~' + lrMin + ' min, so ' +
        (liveEvery ? 'take a gel every ' + (liveEvery === 35 ? '35–40' : '30') + ' min.'
                   : 'it is under 90 min — no gels needed, but drink.')
      : '<b>Wk ' + wk + ':</b> no long run this week.';
    return el(
      '<div class="ref"><h2>Fuelling</h2>' +
      '<div class="ref-note">One ' + g.gelG + ' g gel = <b>' + g.carbG + ' g carbs</b> · ' +
      g.kcal + ' kcal · ' + g.sodiumMg + ' mg sodium. So the interval you choose ' +
      '<i>is</i> the carb rate:</div>' +
      '<div class="ref-card fuel">' + rows + '</div>' +
      '<div class="ref-note">' + live + '</div>' +
      '<div class="ref-note">' + esc(g.targetNote) + '</div>' +
      '<div class="ref-note"><b>Salt is the gap.</b> ' + esc(g.sodiumNote) + '</div>' +
      (g.caffeine ? '<div class="ref-note"><b>Caffeine.</b> ' + esc(g.caffeine) + '</div>' : '') +
      '</div>'
    );
  }

  /* The app closes the loop: it prescribes the runs AND reads them back.
     EF (m/min ÷ HR) rising at easy effort = the aerobic base building —
     the one number the whole block is trying to move. */
  function buildTrainingLogSection() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^runlog-(\d{4}-\d{2}-\d{2})$/);
      if (!m) continue;
      const e = readJSON(k, null);
      if (!e || !e.sec) continue;
      const day = DB.buildDay(m[1]);
      const km = e.km || (day.run ? day.run.run.km : 0);
      if (!(km > 0)) continue;
      const cls = e.cls || (day.run ? DB.runClass(day.run) : 'unclassified');
      const isMp = !!(day.run && DB.isMpSession(day.run.title));
      /* A fast finish makes second-half EF meaningless, so MP runs report
         the MP check instead of decoupling (PLAN.mpCheck). */
      const dec = isMp ? null : e.stream ? (Number.isFinite(e.stream.decPct) ? {pct:e.stream.decPct} : null) : DB.decoupling(km, e.sec, e.hr, e.halfPaceSec, e.hr2);
      entries.push({
        iso: m[1], km, cls, sec: e.sec, dec: dec ? dec.pct : null, stream: e.stream || null,
        pace: DB.paceOf(km, e.sec),
        hr: e.hr || null,
        ef: e.hr ? DB.ef(km, e.sec, e.hr) : null,
        efTrend: trendEf(day, km, e), mp: isMp, day,
        mpKm: e.mpKm || null, mpPaceSec: e.mpPaceSec || null, mpHr: e.mpHr || null,
        hard: cls === 'quality' || cls === 'race',
        temp: e.temp == null ? null : e.temp,
        tooHot: e.temp != null && e.temp >= PLAN.benchmark.tempInvalid,
        x: e.x === true,
        adj: (function () {
          const a = DB.adjustPace(Math.round(e.sec / km), e.temp);
          return a ? DB.fmtPaceSec(a) : null;
        }()),
      });
    }
    entries.sort((a, b) => (a.iso < b.iso ? -1 : 1));
    if (!entries.length) {
      return el(
        '<div class="ref"><h2>Training log</h2>' +
        '<div class="ref-note">Nothing logged yet. After a run, tap <b>Log this run</b> on ' +
        'the run card — the app computes pace and EF (metres per minute ÷ heart rate) and ' +
        'trends it here. EF rising while easy runs stay easy is the block working.</div></div>'
      );
    }
    /* EF is only comparable WITHIN an effort class. A Z1 buffer run and a
       30 km long run and a 4 km easy run produce three different numbers
       for reasons that have nothing to do with fitness, so one pooled
       line would read as noise — or worse, as a collapse on any week
       that happened to end with a shakeout. One trend per class. */
    /* EF translated into the unit a runner thinks in: pace at the heart rate
       these runs are usually done at (the median of the window), at the
       start and end of the fitted line. Same data, same fit, no new claim. */
    function paceAtHrHTML(chart) {
      const pts = chart.points;
      if (pts.length < 4) return '';
      const hrs = pts.map(p => p.hr).filter(h => Number.isFinite(h) && h > 0).sort((a, b) => a - b);
      if (hrs.length < 4) return '';
      const hr = Math.round(hrs[Math.floor(hrs.length / 2)]);
      const mx = pts.reduce((a, p) => a + p.t, 0) / pts.length, my = pts.reduce((a, p) => a + p.pct, 0) / pts.length;
      const efAt = t => chart.reference.ef * (1 + (my + chart.change * (t - mx)) / 100);
      const paceAt = ef => DB.fmtPaceSec(Math.round(60000 / (ef * hr)));
      return '<p class="ef-pace">At your usual <b>' + hr + ' bpm</b>: about <b>' + paceAt(efAt(0)) + '</b> → <b>' + paceAt(efAt(1)) +
        '/km</b> across these runs, read off the fitted line.</p>';
    }
    function sparkFor(cls, label) {
      const eligible = entries.filter(e => e.cls === cls && !e.tooHot && !e.x && e.iso <= todayISO() && e.efTrend != null)
        .map(e => ({ ...e, ef: e.efTrend }));
      const chart = window.EFChart.chart(eligible);
      if (!chart) return '';
      const signed = n => (n > 0 ? '+' : '') + n.toFixed(1) + '%';
      const date = iso => Number(iso.slice(8)) + ' ' + MONTHS[Number(iso.slice(5,7))-1];
      const pts = chart.points;
      const status = pts.length < 4 ? 'Building a picture' : Math.abs(chart.change) < 2
        ? 'Holding steady' : chart.change > 0 ? 'Efficiency trending up' : 'Efficiency trending down';
      const ticks = chart.ticks.map(t => '<line x1="48" x2="326" y1="' + t.y + '" y2="' + t.y + '" class="' +
        (t.value === 0 ? 'ef-reference' : 'ef-grid') + '"/><text x="40" y="' + (t.y+4) +
        '" text-anchor="end">' + (t.value > 0 ? '+' : '') + t.value + '%</text>').join('');
      const dots = pts.map(p => '<circle cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) +
        '" r="3"><title>' + p.iso + ': EF ' + p.ef.toFixed(3) + ', ' + signed(p.pct) + '</title></circle>').join('');
      const rows = pts.map(p => '<tr><td>' + esc(p.iso) + '</td><td>' + p.ef.toFixed(3) +
        '</td><td>' + signed(p.pct) + '</td></tr>').join('');
      return '<figure class="ef-chart"><figcaption><span class="ef-kind">' + label +
        ' run efficiency</span><strong>' + status + '</strong></figcaption>' +
        '<svg viewBox="0 0 340 194" width="340" height="194" role="img" aria-label="' +
        esc(label + ' run EF relative to ' + chart.reference.iso + '. Scale minus ' + chart.extent +
        ' to plus ' + chart.extent + ' percent. ' + pts.length + ' runs. Fitted change ' + signed(chart.change)) + '">' +
        ticks + '<polyline points="' + pts.map(p => p.x.toFixed(2)+','+p.y.toFixed(2)).join(' ') + '"/>' + dots +
        '<text x="48" y="184">' + date(pts[0].iso) + '</text><text x="326" y="184" text-anchor="end">' +
        date(pts[pts.length-1].iso) + '</text></svg>' +
        '<div class="ef-reading"><b>' + signed(chart.change) + '</b><span>Fitted change · last ' + pts.length +
        ' runs' + (pts.length < 4 ? '<br>Too few runs to call a trend' : '') + '</span></div>' +
        paceAtHrHTML(chart) +
        '<p class="ef-explain">Reference: EF ' + chart.reference.ef.toFixed(3) + ' on ' + esc(chart.reference.iso) +
        '. Higher means more speed per heartbeat.</p>' +
        '<details class="ef-data"><summary>Values &amp; comparison</summary><p>The line joins recorded runs, spaced by date. ' +
        'Fitted change uses every point across this period, relative to the reference. The scale stays at least ±10% and expands in 5-point steps. ' +
        'The first eligible log is the reference; editing or deleting it changes the comparison. ' +
        'Heat-flagged runs are excluded. Temperature, terrain and effort still affect EF; missing temperatures are unverified. ' +
        'This is an efficiency signal, not proof of a fitness change.</p>' +
        '<table><thead><tr><th>Date</th><th>EF</th><th>vs reference</th></tr></thead><tbody>' + rows + '</tbody></table></details></figure>';
    }
    let spark = recordsHTML(savedProgress()) + sparkFor('easy', 'easy') + sparkFor('long', 'long');
    /* Measured samples and whole-run estimates never share a denominator. */
    spark += (function () {
      const hr = readJSON('hr', null);
      if (!hr || !DB.hrZones(hr.rest, hr.max)) return '';
      const measured = [0,0,0,0,0], estimated = [0,0,0,0,0];
      let uncovered = 0;
      entries.forEach(e => {
        if (e.iso > todayISO()) return;
        if (e.stream && Array.isArray(e.stream.hrSeconds)) {
          let covered = 0;
          e.stream.hrSeconds.forEach(pair => {
            if (!Array.isArray(pair) || !Number.isFinite(pair[0]) || pair[0] <= 0 || pair[0] > 300 || !Number.isFinite(pair[1]) || pair[1] <= 0) return;
            const z = DB.zoneOf(pair[0], hr.rest, hr.max);
            measured[z && z.z ? z.z-1 : 0] += pair[1]; covered += pair[1];
          });
          uncovered += Math.max(0,e.sec-covered);
        } else if (e.hr && e.sec) {
          const z = DB.zoneOf(e.hr,hr.rest,hr.max);
          estimated[z && z.z ? z.z-1 : 0] += e.sec;
        }
      });
      const bar = (secs, title, note) => {
        const total = secs.reduce((a,b)=>a+b,0); if (!total) return '';
        const tone = ['var(--phase-base)','var(--phase-build)','var(--phase-taper)','var(--accent)','var(--accent)'];
        const easy = (secs[0]+secs[1])/total*100;
        return '<div class="dist"><div class="dc-h">' + title + '</div><div class="dist-bar">' +
          secs.map((v,i)=>v ? '<i style="width:'+(v/total*100).toFixed(2)+'%;background:'+tone[i]+'"></i>' : '').join('') +
          '</div><div class="dist-key">' + secs.map((v,i)=>v ? '<span>Z'+(i+1)+' '+Math.round(v/total*100)+'% · '+Math.round(v/60)+' min</span>' : '').join('') +
          '</div><p class="log-note">'+Math.round(easy)+'% at Z2 or easier · plan target '+PLAN.intensityTarget.easyPct+'%+</p><p class="log-note">'+note+'</p></div>';
      };
      return bar(measured,'Time in zones · imported HR samples',
        'Time-weighted recorded samples, using your current zones. Each reading holds until the next sample (at most 30 seconds). '+Math.round(uncovered/60)+' min without usable HR excluded.') +
        bar(estimated,'Run intensity · average-HR estimate',
          'Each whole run is grouped by average HR. This cannot detect harder segments inside a run and is separate from measured time in zones.');
    }());    /* Decoupling gets a ladder rather than a sparkline: the threshold is
       the point, not the shape. Falling numbers are the base arriving. */
    const decPts = entries.filter((e) => e.dec != null && e.cls === 'long' && !e.x && e.iso <= todayISO()).slice(-6);
    if (decPts.length) {
      const m = PLAN.decoupleModel;
      spark += '<div class="dc-list"><div class="dc-h">Aerobic decoupling · long runs</div>' +
        decPts.reverse().map((p) => {
          const v = DB.decoupleVerdict(p.dec);
          return '<div class="dc-r"><span>' + fmtShort(p.iso) + ' · ' + p.km + ' km</span>' +
            '<b class="dc ' + v.band + '">' + p.dec.toFixed(1) + '%</b></div>';
        }).join('') +
        '<div class="dc-k">under ' + m.good + '% sound · to ' + m.ok + '% at the edge · over that, read the day</div></div>';
    }
    const mpPts = entries.filter((e) => e.mp && e.mpHr && e.mpPaceSec && e.iso <= todayISO()).slice(-6);
    if (mpPts.length) {
      const h = readJSON('hr', null);
      spark += '<div class="dc-list mp-list"><div class="dc-h">Marathon-pace checks · §10</div>' +
        mpPts.slice().reverse().map((p) => {
          const v = h ? DB.mpVerdict(p.mpHr, h.rest, h.max) : null;
          const band = !v ? 'mpb' : v.key === 'on' ? 'good' : v.key === 'below' ? 'mpb' : 'poor';
          return '<div class="dc-r"><span>' + fmtShort(p.iso) + ' · ' + (p.mpKm || '') + (p.mpKm ? ' km · ' : '') +
            DB.fmtPaceSec(Math.round(p.mpPaceSec)) + '/km · ' + p.mpHr + ' bpm</span>' +
            '<b class="dc ' + band + '">' + (v ? 'Z' + v.z : '—') + '</b></div>';
        }).join('') +
        '<div class="dc-k">below Z3: the prescribed pace is too slow · Z3: it fits · Z4: too fast for this stage</div></div>';
    }
    const rows = entries.slice(-10).reverse().map((e) =>
      '<article class="run-entry"><div class="run-entry-head"><b>' + esc(fmtShort(e.iso)) +
      (e.hard ? ' <i class="dot" style="background:var(--accent)" title="hard session"></i>' : '') +
      '</b><span>' + e.km + ' km</span>' +
      (e.temp != null ? ' <i class="tmp' + (e.tooHot ? ' hot' : '') + '">' + e.temp + '°</i>' : '') +
      (e.x ? ' <i class="tmp xout">not in trends</i>' : '') +
      (e.mp ? ' <i class="tmp xout">MP' + (e.mpHr ? ' logged' : ' · easy part not logged') + '</i>' : '') +
      '</div><div class="run-entry-metrics"><span><small>Pace /km</small>' + esc(e.pace || '—') +
      (e.adj ? '<i class="adj">→ ' + esc(e.adj) + '</i>' : '') + '</span>' +
      '<span><small>Avg HR</small>' + (e.hr || '—') + '</span>' +
      '<span><small>EF</small><b>' + fmtEf(e.ef) + '</b></span></div></article>'
    ).join('');
    return el(
      '<div class="ref"><h2>Training log</h2>' + spark +
      '<div class="ref-card">' + rows + '</div>' +
      '<div class="ref-note">EF = metres per minute ÷ avg HR — bold number, higher is fitter. ' +
      'Compare like with like: easy runs against easy runs (hard days are dotted), and mind ' +
      'heat — EF reads low above ~18 °C. Rising EF at the same easy effort is exactly what ' +
      'the §10 bands are waiting for.</div>' +
      '<div class="ref-note">The <b>→ pace</b> beside a warm run is what it would have been at ' +
      PLAN.benchmark.tempBaseline + ' °C (~0.55%/°C). An estimate for comparing like with like — ' +
      'the logged number is always what you actually ran.</div>' +
      '<div class="ref-note"><b>Where the running sits</b> is the audit of rule 1. ' +
      esc(PLAN.intensityTarget.note) + '</div>' +
      '<div class="ref-note"><b>Decoupling</b> is the better long-run number, and the reason ' +
      'the log asks for a first-half pace and a second-half HR. ' + esc(PLAN.decoupleModel.note) +
      '</div></div>'
    );
  }

  /* ---- HR zones: personal numbers stay on the phone, never in the repo.
     Two steppers (rest, max) recompute the whole table live. ---- */
  const getHR = () => readJSON('hr', null);
  function buildZoneSection() {
    const hr = getHR();
    const editing = state.hrEdit;
    const rest = editing ? state.hrDraft.rest : (hr && hr.rest);
    const max = editing ? state.hrDraft.max : (hr && hr.max);
    const zones = DB.hrZones(rest, max);

    if (!zones && !editing) {
      const wrap = el(
        '<div class="ref"><h2>Heart-rate zones</h2>' +
        '<div class="ref-note">Not set. Zones need two numbers: your resting HR ' +
        'and your true max. They stay on this phone — health data never goes in the repo.</div>' +
        '<div class="data-actions"><button data-hr="edit">Set zones</button></div></div>'
      );
      wrap.querySelector('[data-hr="edit"]').addEventListener('click', () => {
        state.hrEdit = true; state.hrDraft = { rest: 50, max: 195 }; render();
      });
      return wrap;
    }

    const st = (kind, val, unit) =>
      '<div class="st"><button class="st-b" data-hz="' + kind + '" data-d="-1" aria-label="Decrease ' + kind + '">−</button>' +
      '<span class="st-v">' + val + '<small>' + unit + '</small></span>' +
      '<button class="st-b" data-hz="' + kind + '" data-d="1" aria-label="Increase ' + kind + '">+</button></div>';

    const rows = (zones || []).map((z) =>
      '<div class="zrow"><span class="zk">Z' + z.z + '</span>' +
      '<span class="zn">' + esc(z.name) + '</span>' +
      '<span class="zb">' + z.lo + '–' + z.hi + '</span></div>' +
      '<div class="zuse">' + esc(z.use) + '</div>').join('');

    /* the most recent logged run, placed in its zone — the loop, closed */
    let recent = '';
    const hist = runLogHistory().filter((e) => e.hr);
    if (zones && hist.length) {
      const last = hist[hist.length - 1];
      const z = DB.zoneOf(last.hr, rest, max);
      if (z) {
        recent = '<div class="ref-note"><b>Last logged run:</b> ' + esc(fmtShort(last.iso)) +
          ' at ' + last.hr + ' bpm → <b>' + esc(z.name) + '</b> (' +
          Math.round(((last.hr - rest) / (max - rest)) * 100) + '% HRR).</div>';
      }
    }

    /* Morning resting HR trend (rhr-ISO, from the run card). Zones are only
       as current as the resting HR they use, and a falling resting HR (more
       fitness, a habit dropped) quietly shifts every zone. Offer the update;
       never make it silently. */
    let rhrBlock = '';
    const series = [];
    for (let i = 27; i >= 0; i--) { const d = DB.addDays(todayISO(), -i), v = rhrReading(d); if (v != null) series.push({ i: 27 - i, iso: d, bpm: v }); }
    const recentVals = series.filter((p) => p.i >= 14).map((p) => p.bpm).sort((a, b) => a - b);
    if (series.length >= PLAN.readiness.minReadings && !editing) {
      const usual = recentVals.length >= PLAN.readiness.minReadings ? recentVals[Math.floor(recentVals.length / 2)] : null;
      const lo = Math.min(...series.map((p) => p.bpm)) - 2, hi = Math.max(...series.map((p) => p.bpm)) + 2;
      const X = (i) => 8 + i * (284 / 27), Y = (b) => 52 - (b - lo) / (hi - lo) * 44;
      rhrBlock = '<div class="rhr-trend"><div class="rhr-h"><b>Morning resting HR</b><span>last 28 days · ' + series.length + ' readings · ' + Math.min(...series.map((p) => p.bpm)) + '–' + Math.max(...series.map((p) => p.bpm)) + ' bpm</span></div>' +
        '<svg viewBox="0 0 300 60" role="img" aria-label="Morning resting heart rate, ' + series.length + ' readings from ' + series[0].bpm + ' to ' + series[series.length - 1].bpm + ' bpm">' +
        '<polyline points="' + series.map((p) => X(p.i).toFixed(1) + ',' + Y(p.bpm).toFixed(1)).join(' ') + '"/>' +
        series.map((p) => '<circle cx="' + X(p.i).toFixed(1) + '" cy="' + Y(p.bpm).toFixed(1) + '" r="3"><title>' + p.iso + ': ' + p.bpm + ' bpm</title></circle>').join('') +
        '</svg>' +
        (usual != null ? '<p>Your usual now: <b>' + usual + '</b> (median of the last 14 days). Zones use <b>' + (hr ? hr.rest : '—') + '</b>.</p>' : '') +
        (usual != null && hr && hr.max && Math.abs(usual - hr.rest) >= 2
          ? '<button class="zedit" data-hz="rhr" data-v="' + usual + '">Use ' + usual + ' as resting HR</button>' : '') + '</div>';
    }

    const wrap = el(
      '<div class="ref"><h2>Heart-rate zones</h2>' +
      (editing
        ? '<div class="hz-form">' + st('rest', rest, 'rest') + st('max', max, 'max') +
          '<div class="st-act"><button class="rl-save" data-hz="save">Save</button>' +
          '<button class="rl-x" data-hz="cancel">✕</button></div></div>'
        : '<div class="ref-row"><span>Resting ' + rest + ' · Max ' + max +
          ' · HRR ' + (max - rest) + '</span>' +
          '<span class="v"><button class="zedit" data-hz="edit">Edit</button></span></div>') +
      '<div class="ref-card ztable">' + rows + '</div>' +
      recent + rhrBlock +
      '<div class="ref-note">' + esc(PLAN.zoneModel.method) + '. ' +
      esc(PLAN.zoneModel.note) + (hr && hr.at ? ' Set ' + esc(fmtShort(hr.at)) + '.' : '') +
      '</div>' +
      '<div class="ref-note"><b>Setting max HR.</b> ' + esc(PLAN.zoneModel.measure) + '</div></div>'
    );
    wrap.querySelectorAll('[data-hz]').forEach((btn) => btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-hz');
      if (k === 'edit') { state.hrEdit = true; state.hrDraft = { rest: rest || 50, max: max || 195 }; }
      else if (k === 'cancel') { state.hrEdit = false; state.hrDraft = null; }
      else if (k === 'rhr') { writeJSON('hr', { rest: Number(btn.getAttribute('data-v')), max: hr.max, at: todayISO() }); }
      else if (k === 'save') {
        writeJSON('hr', { rest: state.hrDraft.rest, max: state.hrDraft.max, at: todayISO() });
        state.hrEdit = false; state.hrDraft = null;
      } else {
        const d = Number(btn.getAttribute('data-d'));
        if (k === 'rest') state.hrDraft.rest = Math.min(90, Math.max(30, state.hrDraft.rest + d));
        if (k === 'max') state.hrDraft.max = Math.min(230, Math.max(150, state.hrDraft.max + d));
      }
      render();
    }));
    return wrap;
  }

  function buildOdoSection() {
    const p4 = DB.pro4Status(getDone, todayISO());
    const fmt = (n) => (n === Math.round(n) ? n : n.toFixed(1));
    const usedPct = Math.min(100, (p4.used / p4.cap) * 100);
    const planPct = Math.min(100 - usedPct, (p4.toCome / p4.cap) * 100);
    const rows = p4.outings.map((o) =>
      '<div class="ref-row"><span>Wk ' + o.wk + ' · ' + esc(o.label) +
      (o.optional ? ' (optional)' : '') + '</span>' +
      '<span class="v">' + (o.done ? '✓ ' : '') + o.km + ' km</span></div>').join('');
    return el(
      '<div class="ref"><h2>Pro 4 odometer</h2><div class="ref-card">' + rows + '</div>' +
      '<div class="odo" role="img" aria-label="' + fmt(p4.used) + ' km used, ' + fmt(p4.toCome) +
      ' to come, of about ' + p4.cap + '">' +
      '<i class="odo-used" style="width:' + usedPct + '%"></i>' +
      '<i class="odo-plan" style="width:' + planPct + '%"></i></div>' +
      '<div class="ref-note">Used ' + fmt(p4.used) + ' km · to come ' + fmt(p4.toCome) +
      (p4.optional ? ' (+' + p4.optional + ' optional)' : '') + ' · cap ≈' + p4.cap +
      ' km. Every unplanned km is bounce borrowed from mile 22.</div></div>'
    );
  }

  /* ---- .ics reminders: native calendar with zero backend ----
     iOS reliably offers "Add to Calendar" when you OPEN a real .ics URL;
     it mishandles blob: URLs (shows raw text) and often hides Calendar
     from the Web Share sheet. So on the hosted site the primary action
     is a plain link to the CI-generated training.ics. The blob export
     is only the offline / file:// fallback. */
  function buildCalendarSection() {
    const hosted = /^https?:/.test(location.protocol);
    const base = location.href.replace(/[^/]*(?:[?#].*)?$/, '');
    const webcal = hosted ? base.replace(/^https?:/, 'webcal:') + 'training.ics' : null;
    const wrap = el(
      '<div class="ref"><h2>Reminders</h2><div class="ref-card data-card">' +
      (hosted
        ? '<a class="cta cta-primary" href="' + esc(webcal) + '">Subscribe — auto-updating</a>' +
          '<div class="ref-note">Best option: the calendar refreshes itself whenever the plan changes. ' +
          'iPhone → “Subscribe”.</div>' +
          '<a class="cta cta-ghost" href="training.ics" target="_blank" rel="noopener" download="week-os-training.ics">Add once (import .ics)</a>' +
          '<div class="ref-note">A one-off snapshot — the whole block with 15-minute alerts.</div>'
        : '<div class="ref-note">Every run, gym session and cross-training block with 15-minute ' +
          'alerts. Open Week OS online to subscribe to a live, auto-updating calendar.</div>' +
          '<div class="data-actions"><button data-io="ics">Download .ics</button></div>') +
      '<div class="data-msg" role="status"></div></div></div>'
    );
    const btn = wrap.querySelector('[data-io="ics"]');
    if (btn) {
      const msg = wrap.querySelector('.data-msg');
      btn.addEventListener('click', () => {
        const ics = DB.buildICS(todayISO());
        const n = (ics.match(/BEGIN:VEVENT/g) || []).length;
        if (!n) { msg.textContent = 'No upcoming sessions — the block is over.'; return; }
        downloadICS(ics, n, msg);
      });
    }
    return wrap;
  }

  function downloadICS(ics, n, msg) {
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'week-os-training.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    msg.textContent = n + ' sessions exported — open week-os-training.ics to add them.';
  }

  /* ---- diagnostics: the app says what it knows, because nothing else can ----
     Remote Web Inspector needs Safari on macOS. From Windows the phone can be
     watched but not debugged, so docs/device-checklist.md leans on these five
     rows to tell an install apart from an update, and a cached shell apart
     from a lucky network. Every value is read defensively: this pane must
     render on the first offline launch, in private mode, and in any browser
     that supports none of these APIs. */
  function buildDiagSection() {
    const wrap = el(
      '<div class="ref"><h2>App</h2><div class="ref-card">' +
      '<div class="ref-row"><span>Version</span><span class="v">v' + APP_VERSION + '</span></div>' +
      '<div class="ref-row"><span>Service worker</span><span class="v" data-diag="sw">checking…</span></div>' +
      '<div class="ref-row"><span>Cache</span><span class="v" data-diag="cache">checking…</span></div>' +
      '<div class="ref-row"><span>Display</span><span class="v" data-diag="mode">—</span></div>' +
      '<div class="ref-row"><span>Storage used</span><span class="v" data-diag="store">—</span></div>' +
      '</div><div class="ref-note">Offline-first · plan lives in data/plan.js · ' +
      'after a deploy this should read the new version and <b>controlling</b>.</div></div>'
    );
    const set = (k, txt) => {
      const n = wrap.querySelector('[data-diag="' + k + '"]');
      if (n) n.textContent = txt;
    };

    /* standalone: iOS uses a non-standard flag, everyone else the media query */
    let mode = 'browser tab';
    try {
      if (navigator.standalone === true) mode = 'standalone';
      else if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) mode = 'standalone';
    } catch (e) { mode = 'unknown'; }
    set('mode', mode);

    if (!('serviceWorker' in navigator)) {
      set('sw', 'unsupported');
      set('cache', 'unsupported');
    } else {
      /* controller present = this page is being served by a worker, which is
         the only state that means the app will open offline. */
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return set('sw', 'not registered');
        if (reg.waiting) return set('sw', 'update waiting');
        if (reg.installing) return set('sw', 'installing');
        set('sw', navigator.serviceWorker.controller ? 'controlling' : 'registered');
      }).catch(() => set('sw', 'unknown'));
    }

    if (window.caches && caches.keys) {
      caches.keys()
        .then((keys) => {
          const mine = keys.filter((k) => k.indexOf('week-os') === 0);
          set('cache', mine.length ? mine.join(' · ') : 'none yet');
        })
        .catch(() => set('cache', 'unknown'));
    } else if ('serviceWorker' in navigator) {
      set('cache', 'unavailable');
    }

    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate()
        .then((e) => set('store', e && e.usage ? (e.usage / 1048576).toFixed(1) + ' MB' : '—'))
        .catch(() => set('store', '—'));
    } else {
      set('store', 'unreported');
    }
    return wrap;
  }

  /* ---- backup / restore (ticks, skips, moves, gym weights, tune-up time) ---- */
  const STORE_KEY = /^(?:(?:done|ovr|movein|runlog|rhr)-\d{4}-\d{2}-\d{2}|wt-[a-z0-9-]+|recal|hr)$/;

  function buildDataSection() {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      if (STORE_KEY.test(localStorage.key(i))) count++;
    }
    /* freshness: this phone holds the only copy of the ticks */
    const bAt = readJSONSafeString('backup-at');
    let bNote = 'Never backed up.';
    let stale = count > 0;
    if (bAt) {
      const days = Math.max(0, Math.round(
        (DB.parseLocalDate(todayISO()) - DB.parseLocalDate(bAt)) / 86400000));
      bNote = days === 0 ? 'Backed up today.'
        : 'Last backup ' + days + ' day' + (days === 1 ? '' : 's') + ' ago.';
      stale = days > 21;
    }
    const wrap = el(
      '<div class="ref"><h2>Data</h2><div class="ref-card data-card">' +
      '<div class="ref-note">' + count + ' entr' + (count === 1 ? 'y' : 'ies') +
      ' stored on this phone (ticks, skips, gym weights, run log, HR zones, tune-up time). Backups are a JSON blob — paste one into Notes now and again.</div>' +
      '<div class="ref-note backup-note' + (stale ? ' stale' : '') + '">' + bNote +
      (stale ? ' This phone holds the only copy.' : '') + '</div>' +
      '<div class="data-actions">' +
      '<button data-io="export">Copy backup</button>' +
      '<button data-io="restore">Restore…</button></div>' +
      '<textarea class="data-box hidden" rows="4" aria-label="Backup JSON" ' +
      'placeholder="Paste a backup here, then tap Restore again"></textarea>' +
      '<div class="data-msg" role="status"></div></div></div>'
    );
    const box = wrap.querySelector('.data-box');
    const msg = wrap.querySelector('.data-msg');

    wrap.querySelector('[data-io="export"]').addEventListener('click', () => {
      const entries = {};
      let n = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (STORE_KEY.test(k)) { entries[k] = localStorage.getItem(k); n++; }
      }
      const blob = JSON.stringify({ app: 'week-os', exportedAt: new Date().toISOString(), entries });
      try { localStorage.setItem('backup-at', todayISO()); } catch (e) { /* fine */ }
      const fallback = () => {
        box.classList.remove('hidden');
        box.value = blob;
        box.select();
        msg.textContent = 'Clipboard blocked — copy the text above by hand.';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(blob)
          .then(() => { msg.textContent = 'Backup copied — ' + n + ' entries. Paste it somewhere safe.'; })
          .catch(fallback);
      } else fallback();
    });

    wrap.querySelector('[data-io="restore"]').addEventListener('click', () => {
      if (box.classList.contains('hidden')) {
        box.classList.remove('hidden');
        box.value = '';
        box.focus();
        msg.textContent = 'Paste a backup, then tap Restore again.';
        return;
      }
      try {
        const parsed = JSON.parse(box.value);
        const entries = parsed && parsed.entries;
        if (!entries || typeof entries !== 'object') throw new Error('no entries');
        let n = 0;
        for (const k of Object.keys(entries)) {
          if (!STORE_KEY.test(k) || typeof entries[k] !== 'string') continue;
          if (k === 'recal') {               // stored as a raw h:mm:ss string, not JSON
            if (parseHalf(entries[k])) { localStorage.setItem(k, entries[k]); n++; }
            continue;
          }
          try {
            JSON.parse(entries[k]);          // each entry must be valid JSON
            localStorage.setItem(k, entries[k]);
            n++;
          } catch (bad) { /* skip the corrupt entry, keep the rest */ }
        }
        migrateIds();                      // old backups carry pre-v2.6 ids
        msg.textContent = 'Restored ' + n + ' entr' + (n === 1 ? 'y' : 'ies') + '.';
        box.classList.add('hidden');
      } catch (e) {
        msg.textContent = 'That doesn’t look like a Week OS backup — nothing changed.';
      }
    });
    return wrap;
  }

  /* ================= router ================= */
  const openDetails = new Set();

  function render() {
    document.querySelectorAll('details[data-disclosure]').forEach(node => {
      if (node.open) openDetails.add(node.dataset.disclosure);
      else openDetails.delete(node.dataset.disclosure);
    });
    renderHeader();
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-nav') === state.view ||
        (t.getAttribute('data-nav') === 'more' && (state.view === 'plan' || state.view === 'ref')));
    });
    if (state.view === 'today') renderToday();
    else if (state.view === 'week') renderWeek();
    else if (state.view === 'plan') renderPlan();
    else renderRef();

    /* stagger the view's sections so arrival cascades everywhere */
    const vc = document.getElementById('view');
    Array.prototype.forEach.call(vc.children, (c, i) => c.style.setProperty('--i', i));

    /* fade content in on real navigation only — never on tick re-renders */
    const viewKey = state.view + '|' +
      (state.view === 'today' ? state.dateISO : state.view === 'week' ? state.weekAnchor : '');
    if (viewKey !== lastViewKey) {
      lastViewKey = viewKey;
      const v = document.getElementById('view');
      v.classList.remove('anim');
      void v.offsetWidth;                          // restart the animation
      v.classList.add('anim');
    }
  }

  /* ---- navigation ---- */
  /* The sheet's open state has to be announced, not just drawn: aria-haspopup
     says a menu exists, only aria-expanded says whether it is currently open. */
  function setSheet(open) {
    document.getElementById('sheet-backdrop').classList.toggle('hidden', !open);
    const more = document.querySelector('[data-nav="more"]');
    if (more) more.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nav = btn.getAttribute('data-nav');
      if (nav === 'more') { setSheet(true); return; }
      setSheet(false);
      if (nav === 'close') return;
      if (nav === 'today') { state.dateISO = todayISO(); state.expanded = null; }
      if (nav === 'week') state.weekAnchor = mondayOf(state.dateISO || todayISO());
      state.view = nav;
      window.scrollTo(0, 0);
      render();
    });
  });
  document.getElementById('sheet-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) setSheet(false);
  });
  /* Escape closes it, which a menu is expected to do and a keyboard user
     will reach for before hunting the Close item. */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const backdrop = document.getElementById('sheet-backdrop');
    if (backdrop && !backdrop.classList.contains('hidden')) {
      setSheet(false);
      const more = document.querySelector('[data-nav="more"]');
      if (more) more.focus();
    }
  });

  /* ---- minute tick: full render only when the NOW block changes ---- */
  let lastISO = todayISO();
  function refreshClock() {
    if (document.hidden) return;
    refreshFocusClock();
    const iso = todayISO();
    if (iso !== lastISO) {           // midnight rollover
      if (state.dateISO === lastISO) state.dateISO = iso;
      lastISO = iso;
      render();
      return;
    }
    if (state.view !== 'today' || state.dateISO !== iso) return;
    const day = DB.buildDay(iso);
    const n = nowMin();
    const cur = day.blocks.find((b) => n >= b.startMin && n < b.endMin);
    const nxt = day.blocks.find((b) => b.startMin > n);
    const late = day.run && n > day.run.endMin + MISSED_GRACE_MIN ? '|late' : '';
    const key = iso + '|' + (cur ? cur.id : '-') + '|' + (nxt ? nxt.id : '-') + late;
    if (key !== nowKey) { render(); return; }
    /* same block — just move the needle */
    const bar = document.querySelector('.nn-bar i');
    if (bar && cur) {
      bar.style.width = Math.round(((n - cur.startMin) / (cur.endMin - cur.startMin)) * 100) + '%';
    }
    const left = document.querySelector('.nn-left');
    if (left && cur) left.textContent = fmtLeft(cur.endMin - n);
    const clock = document.querySelector('.live-clock');
    if (clock) clock.textContent = DB.fmtHM(n);
    const line = document.querySelector('.tl-now');
    if (line) line.textContent = 'NOW ' + DB.fmtHM(n);
  }
  setInterval(refreshClock, 60000);
  document.addEventListener('visibilitychange', refreshClock);
  window.addEventListener('pageshow', refreshClock);

  /* ---- swipe: left/right moves a day (Today) or a week (Week) ---- */
  let swipeX = null, swipeY = null;
  // The owner wants an app-sized viewport, including Safari's gesture path.
  // A pinch must neither scale the page nor turn into a day/week swipe.
  const stopScale = e => {
    swipeX = swipeY = null;
    if (e.cancelable) e.preventDefault();
  };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
    document.addEventListener(type, stopScale, { passive: false });
  });
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { stopScale(e); return; }
    swipeX = e.touches[0].clientX;
    swipeY = e.touches[0].clientY;
  }, { passive: false });
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) stopScale(e);
  }, { passive: false });
  document.addEventListener('touchcancel', () => { swipeX = swipeY = null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (focusedSession || document.querySelector('.card-ov[open]')) { swipeX = swipeY = null; return; }
    if (e.touches.length || !e.changedTouches.length) { swipeX = swipeY = null; return; }
    if (swipeX === null) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    const dy = e.changedTouches[0].clientY - swipeY;
    swipeX = swipeY = null;
    if (Math.abs(dx) < 64 || Math.abs(dy) > 48) return;
    const dir = dx < 0 ? 1 : -1;
    if (state.view === 'today') {
      state.dateISO = DB.addDays(state.dateISO, dir);
      state.expanded = null;
      render();
    } else if (state.view === 'week') {
      state.weekAnchor = DB.addDays(state.weekAnchor || mondayOf(todayISO()), dir * 7);
      render();
    }
  }, { passive: true });

  /* ---- service worker + update toast ---- */
  if ('serviceWorker' in navigator) {
    let updateAccepted = false;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const offer = (worker) => {
        document.getElementById('toast').classList.remove('hidden');
        document.getElementById('toast-reload').onclick = () => {
          updateAccepted = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        };
      };
      /* update already downloaded on a previous visit */
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
        });
      });
    }).catch(() => { /* offline first load — fine */ });
    /* Reload only when an UPDATE takes over. The first-ever visit also
       fires controllerchange (clients.claim()) — reloading then would
       yank the app out from under the user seconds after install. */
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !(hadController || updateAccepted)) return;
      reloading = true;
      location.reload();
    });
  }

  /* ---- title card: the installed app's launch, once a day ----
     A second of cinema on the first Home Screen open of the day: the
     wordmark, the week, the days to the gun. It never blocks — taps pass
     straight through to Today underneath, which is already drawn — and it
     is skipped in a browser tab and whenever the system asks for reduced
     motion. `titlecard-at` is a per-device convenience, like `backup-at`. */
  function titleCard() {
    const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
    const standalone = navigator.standalone === true || mm('(display-mode: standalone)');
    if (!standalone || !mm('(prefers-reduced-motion: no-preference)')) return;
    const today = todayISO();
    try {
      if (localStorage.getItem('titlecard-at') === today) return;
      localStorage.setItem('titlecard-at', today);
    } catch (e) { return; }
    const day = DB.buildDay(today), cd = DB.raceCountdown(today);
    const line = day.blockId === 'marathon'
      ? 'WEEK ' + day.week + ' · ' + (cd.days === 0 ? 'RACE DAY' : cd.days + (cd.days === 1 ? ' DAY' : ' DAYS') + ' TO THE GUN')
      : day.blockId === 'recovery' ? 'RECOVERY · WEEK ' + day.week : 'STANDING WEEK';
    const card = el('<div class="titlecard" aria-hidden="true"><div class="tc-ribbons">' + '<i></i>'.repeat(9) +
      '</div><div class="tc-mark">WEEK<b>OS</b></div><div class="tc-line">' + esc(line) + '</div></div>');
    document.body.appendChild(card);
    const bye = () => card.remove();
    card.addEventListener('animationend', (e) => { if (e.target === card) bye(); });
    setTimeout(bye, 2400);   // in case the animation never runs
  }

  render();
  titleCard();
})();
