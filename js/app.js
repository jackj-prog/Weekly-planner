/* ==========================================================================
   Week OS — js/app.js
   Rendering + interaction only. All routine content comes from PLAN via
   DayBuilder; this file contains zero plan content.
   ========================================================================== */
(function () {
  'use strict';

  const APP_VERSION = '4.39.0';
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
  function moveToTomorrow(iso, block) {
    const o = getOvr(iso);
    o.moved[block.id] = true;
    writeJSON(ovrKey(iso), o);
    const tmr = DB.addDays(iso, 1);
    const list = getMoveIn(tmr);
    list.push({ id: 'mv-' + iso + '-' + block.id, srcId: block.id, fromIso: iso, title: block.title, detail: block.detail, plan: block.plan || null, cat: block.cat });
    writeJSON(moveKey(tmr), list);
  }
  function undoMove(iso, id) {
    const o = getOvr(iso);
    delete o.moved[id];
    writeJSON(ovrKey(iso), o);
    const tmr = DB.addDays(iso, 1);
    writeJSON(moveKey(tmr), getMoveIn(tmr).filter((m) => !(m.srcId === id && m.fromIso === iso)));
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
    const head = el(
      '<div class="day-head"><div class="day-nav">' +
      '<button class="nav" data-d="-1" aria-label="Previous day">‹</button>' +
      '<h1>' + esc(fmtDate(iso)) + '</h1>' +
      '<button class="nav" data-d="1" aria-label="Next day">›</button></div>' +
      '<div class="sub"><span>' + weekBit + '</span>' + chips.join('') +
      (day.label ? '<span>' + esc(day.label) + '</span>' : '') +
      '</div></div>'
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
    if (day.run) {
      view.appendChild(buildHero(day, done, iso, just));
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
      view.appendChild(rest);
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
    nowKey = day.iso + '|' + (cur ? cur.id : '-') + '|' + (next[0] ? next[0].id : '-');
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
  /* History feed for the estimate model: every logged run, classified. */
  function runLogHistory() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^runlog-(\d{4}-\d{2}-\d{2})$/);
      if (!m) continue;
      const e = readJSON(k, null);
      if (!e || !e.sec) continue;
      const day = DB.buildDay(m[1]);
      if (!day.run) continue;
      const km = e.km || day.run.run.km;
      if (!(km > 0)) continue;
      out.push({
        iso: m[1], km, sec: e.sec, cls: DB.runClass(day.run), paceSec: Math.round(e.sec / km),
        hr: e.hr || null, ef: e.hr ? DB.ef(km, e.sec, e.hr) : null,
        temp: e.temp == null ? null : e.temp,
      });
    }
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
      '<details class="record-method"><summary>What counts as a best?</summary><p>Whole runs at the exact same distance, using the saved distance ' +
      'or the planned distance when no override is saved. At least two logs are needed. Ties keep the earlier record. ' +
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
    let logHTML = '';
    if (editing && state.runLogDraft) {
      const d = state.runLogDraft;
      const totalSec = Math.round(d.paceSec * km);
      const st = (kind, label, val, canDown, canUp) =>
        '<div class="st-f"><i class="st-l">' + label + '</i>' +
        '<div class="st"><button class="st-b" data-st="' + kind + '" data-d="-1"' + (canDown ? '' : ' disabled') +
        ' aria-label="Decrease ' + label + '">−</button>' +
        '<span class="st-v">' + val + '</span>' +
        '<button class="st-b" data-st="' + kind + '" data-d="1"' + (canUp ? '' : ' disabled') +
        ' aria-label="Increase ' + label + '">+</button></div></div>';
      /* Long runs get the two extra numbers that turn a logged run into a
         decoupling reading. Optional everywhere else — a 4 km Thursday has
         no meaningful halves. */
      const dec = d.halfPaceSec
        ? DB.decoupling(km, totalSec, d.hr, d.halfPaceSec, d.hr2) : null;
      const dv = dec ? DB.decoupleVerdict(dec.pct) : null;
      logHTML = '<div class="h-log form" role="group" aria-label="Log this run">' +
        st('pace', 'PACE', DB.fmtPaceSec(d.paceSec) + '<small>/km</small>', d.paceSec > d.paceMin, d.paceSec < d.paceMax) +
        st('hr', 'AVG HR', d.hr + '<small>bpm</small>', d.hr > d.hrMin, d.hr < d.hrMax) +
        (d.halfPaceSec
          ? st('half', '1ST-HALF PACE', DB.fmtPaceSec(d.halfPaceSec) + '<small>/km</small>',
              d.halfPaceSec > d.halfMin, d.halfPaceSec < d.halfMax) +
            st('hr2', '2ND-HALF HR', d.hr2 + '<small>bpm</small>', d.hr2 > d.hr2Min, d.hr2 < d.hr2Max)
          : '') +
        (d.gels == null
          ? '<div class="st-wide">' + st('temp', 'FEELS LIKE', d.temp + '°',
              d.temp > PLAN.logModel.tempMin, d.temp < PLAN.logModel.tempMax) + '</div>'
          : st('temp', 'FEELS LIKE', d.temp + '°',
              d.temp > PLAN.logModel.tempMin, d.temp < PLAN.logModel.tempMax) +
            st('gels', 'GELS', d.gels + '<small>taken</small>', d.gels > 0, d.gels < 12)) +
        '<div class="st-total">= ' + fmtDur(totalSec) + ' for ' + kmTxt + ' km' +
        (d.temp >= PLAN.benchmark.tempInvalid
          ? ' · <b>too hot to benchmark</b>'
          : d.temp >= PLAN.benchmark.tempWarn ? ' · warm — read pace generously' : '') +
        (dv ? '<br><b class="dc ' + dv.band + '">decoupling ' + dec.pct.toFixed(1) + '%</b> · ' +
          esc(dv.text) : '') + '</div>' +
        '<div class="st-act"><button class="rl-save">Save</button>' +
        '<button class="rl-x" aria-label="Cancel">✕</button></div></div>';
    } else if (logged) {
      logHTML = '<button class="h-log logged" aria-label="Edit run log">' + logged + '</button>';
      /* Decoupling is the long run's headline, not EF — it is the number
         that says whether the base carried the distance. */
      const cr = DB.carbRate(e.gels, e.sec / 60);
      if (cr) {
        const band = cr.pct >= 90 ? 'good' : cr.pct >= 60 ? 'ok' : 'poor';
        logHTML += '<div class="h-dc ' + band + '"><b>' + cr.rate.toFixed(0) +
          ' g/h</b> carbs · ' + cr.gels + ' of ' + cr.want + ' gels for ' +
          Math.round(e.sec / 60) + ' min · target ' + cr.target.toFixed(0) + ' g/h</div>';
      }
      const dec = DB.decoupling(e.km || km, e.sec, e.hr, e.halfPaceSec, e.hr2);
      const dv = dec ? DB.decoupleVerdict(dec.pct) : null;
      if (dv) {
        logHTML += '<div class="h-dc ' + dv.band + '"><b>' + dec.pct.toFixed(1) +
          '%</b> decoupling · ' + esc(dv.text) + '</div>';
      }
      const v = DB.logVerdict(runLogHistory(), iso);
      if (v) {
        const cls = DB.runClass(r);
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
        logHTML += '<div class="h-verdict' + (v.best ? ' best' : '') + '">' +
          '<span>' + esc(line) + '</span>' +
          '<button class="h-share" aria-label="Share run card">⤴</button></div>';
      }
      logHTML += earnedHTML(iso);
    } else if (canLog) {
      logHTML = '<button class="h-log" aria-label="Log this run">Log this run <span aria-hidden="true">↗</span><small>Time · heart rate · conditions</small></button>';
    }
    // Distance and shoe already have dedicated fields. Split the remaining
    // source text at its own separators without rewriting any prescription.
    const prefix = kmTxt + ' km · ' + r.run.shoe + ' · ';
    const detail = r.detail.startsWith(prefix) ? r.detail.slice(prefix.length) : r.detail;

    const hero = el(
      '<section class="hero' + (isRace ? ' race' : '') + (isDone ? ' done' : '') + (just === r.id ? ' just' : '') + '">' +
      '<div class="h-top"><div class="h-tag">' + (isRace ? 'RACE DAY' : 'TODAY’S RUN') +
      '<span class="h-state">' + (isDone ? 'Completed' : logged ? 'Run logged' : iso < todayISO() ? 'Not marked done' : 'Scheduled · ' + r.start) + '</span></div>' +
      '<button class="h-tick' + (isDone ? ' on' : '') + '" aria-pressed="' + isDone + '" aria-label="' +
      (isDone ? 'Mark run not done' : 'Mark run done') + '"><span aria-hidden="true">✓</span> ' + (isDone ? 'Done' : 'Mark done') + '</button></div>' +
      (just === r.id && isDone ? '<div class="completion-note" role="status">✓ Run banked</div>' : '') +
      '<div class="h-row"><div class="h-km">' + kmTxt + '<small>km</small></div>' +
      '<div class="h-session">' + esc(r.title) + '</div></div>' +
      '<div class="h-meta"><span><b>SHOE</b>' + esc(r.run.shoe) + '</span><span><b>WINDOW</b>' + r.start + '–' + r.end + '</span></div>' +
      '<div class="h-detail">' + detailHTML(detail, iso + '|hero', false) + '</div>' +
      (longRunGuard(iso, day) || '') +
      paceTableHTML(r.table) +
      logHTML + '</section>'
    );
    hero.querySelector('.h-tick').addEventListener('click', () => {
      if (!done[r.id]) state.justTicked = r.id;   // animate on tick-on only
      toggleDone(iso, r.id);
      render();
    });
    const logBtn = hero.querySelector('.h-log:not(.form)');
    if (logBtn) logBtn.addEventListener('click', () => {
      /* centre the steppers on what was logged, else the estimate */
      const hist = runLogHistory();
      const est = DB.logEstimate(day, hist);
      const centrePace = e.sec ? Math.round(e.sec / (e.km || km)) : est.paceSec;
      const centreHr = e.hr || est.hr;
      const lastTemp = hist.filter((x) => x.temp != null).pop();
      state.runLogEdit = iso;
      state.runLogDraft = {
        paceSec: centrePace, hr: centreHr,
        temp: e.temp != null ? e.temp : (lastTemp ? lastTemp.temp : PLAN.logModel.tempDefault),
        paceMin: centrePace - PLAN.logModel.paceSpan, paceMax: centrePace + PLAN.logModel.paceSpan,
        hrMin: centreHr - PLAN.logModel.hrSpan, hrMax: centreHr + PLAN.logModel.hrSpan,
      };
      /* Long runs open the decoupling pair, centred on the run's own
         averages — an evenly-run long run needs no adjustment at all. */
      if (DB.runClass(r) === 'long') {
        const d0 = state.runLogDraft;
        const durMin = Math.round((e.sec || centrePace * km) / 60);
        if (iso >= PLAN.gels.fromDate && durMin > PLAN.gels.minRunMin) {
          d0.gels = e.gels != null ? e.gels : 0;
        }
        const h = e.halfPaceSec || centrePace;
        const h2 = e.hr2 || centreHr;
        d0.halfPaceSec = h; d0.hr2 = h2;
        d0.halfMin = h - PLAN.logModel.halfPaceSpan; d0.halfMax = h + PLAN.logModel.halfPaceSpan;
        d0.hr2Min = h2 - PLAN.logModel.halfHrSpan; d0.hr2Max = h2 + PLAN.logModel.halfHrSpan;
      }
      render();
    });
    hero.querySelectorAll('.st-b').forEach((btn) => btn.addEventListener('click', () => {
      const d = state.runLogDraft;
      const dir = Number(btn.getAttribute('data-d'));
      const kind = btn.getAttribute('data-st');
      const m = PLAN.logModel;
      if (kind === 'pace') {
        d.paceSec = Math.min(d.paceMax, Math.max(d.paceMin, d.paceSec + dir * m.paceStep));
      } else if (kind === 'temp') {
        d.temp = Math.min(m.tempMax, Math.max(m.tempMin, d.temp + dir * m.tempStep));
      } else if (kind === 'half') {
        d.halfPaceSec = Math.min(d.halfMax, Math.max(d.halfMin, d.halfPaceSec + dir * m.halfPaceStep));
      } else if (kind === 'gels') {
        d.gels = Math.min(12, Math.max(0, d.gels + dir));
      } else if (kind === 'hr2') {
        d.hr2 = Math.min(d.hr2Max, Math.max(d.hr2Min, d.hr2 + dir * m.hrStep));
      } else {
        d.hr = Math.min(d.hrMax, Math.max(d.hrMin, d.hr + dir * m.hrStep));
      }
      render();
    }));
    const saveBtn = hero.querySelector('.rl-save');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const d = state.runLogDraft;
      saveRunLogEntry(iso, {
        sec: Math.round(d.paceSec * km), hr: d.hr, km: null, temp: d.temp,
        halfPaceSec: d.halfPaceSec || null, hr2: d.hr2 || null,
        gels: d.gels == null ? null : d.gels,
      });
      state.runLogEdit = null; state.runLogDraft = null;
      render();
    });
    const xBtn = hero.querySelector('.rl-x');
    if (xBtn) xBtn.addEventListener('click', () => { state.runLogEdit = null; state.runLogDraft = null; render(); });
    const shareBtn = hero.querySelector('.h-share');
    if (shareBtn) shareBtn.addEventListener('click', () => shareRunCard(day, iso));
    return hero;
  }
  function fmtDur(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }

  /* ---- shareable run card: 1080×1350, drawn on-device, no network ----
     Brand tokens are the LOCKED §3 identity, not the live theme, so the
     card looks the same shared from light or dark. */
  const CARD = {
    ink: '#16242a', paper: '#eef0ea', accent: '#d6492e',
    phase: { base: '#6f8c63', build: '#436883', taper: '#c5872f' },
  };
  function shareRunCard(day, iso) {
    const r = day.run;
    const e = getRunLogEntry(iso);
    if (!r || !e) return;
    const km = e.km || r.run.km;
    const pace = DB.paceOf(km, e.sec);
    const efv = e.hr ? DB.ef(km, e.sec, e.hr) : null;
    const ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    ready.then(() => {
      const c = document.createElement('canvas');
      c.width = 1080; c.height = 1350;
      const x = c.getContext('2d');
      const phase = CARD.phase[day.phase] || CARD.accent;
      x.fillStyle = CARD.ink; x.fillRect(0, 0, 1080, 1350);
      const grad = x.createRadialGradient(540, -80, 60, 540, -80, 900);
      grad.addColorStop(0, phase + '55'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = grad; x.fillRect(0, 0, 1080, 1350);
      x.fillStyle = phase; x.fillRect(0, 1330, 1080, 20);
      const mono = '"Space Mono", Menlo, monospace';
      const disp = '"Archivo", "Arial Black", sans-serif';
      x.textBaseline = 'alphabetic';
      /* wordmark + week */
      x.font = '900 64px ' + disp;
      x.fillStyle = CARD.paper; x.fillText('WEEK', 72, 118);
      x.fillStyle = CARD.accent; x.fillText('OS', 72 + x.measureText('WEEK').width, 118);
      x.font = '700 34px ' + mono; x.fillStyle = CARD.paper; x.textAlign = 'right';
      x.fillText('WK ' + day.week + '/30 · ' + String(day.phase || '').toUpperCase(), 1008, 112);
      x.textAlign = 'left';
      /* date + session */
      x.font = '700 40px ' + mono; x.globalAlpha = 0.7;
      x.fillText(fmtDate(iso).toUpperCase(), 72, 240); x.globalAlpha = 1;
      /* the number */
      x.font = '900 330px ' + disp;
      const kmTxt = km === Math.round(km) ? String(km) : km.toFixed(1);
      x.fillText(kmTxt, 60, 560);
      const bigW = measure(x, '900 330px ' + disp, kmTxt);
      x.font = '900 90px ' + disp; x.globalAlpha = 0.85;
      x.fillText('km', 78 + bigW, 560);
      x.globalAlpha = 1;
      x.font = '800 64px ' + disp;
      wrapText(x, r.title, 72, 680, 936, 74);
      /* stats */
      x.font = '700 44px ' + mono; x.fillStyle = CARD.paper;
      const stats = [pace + '/km', e.hr ? e.hr + ' bpm' : null, efv ? 'EF ' + efv.toFixed(3) : null]
        .filter(Boolean).join(' · ');
      x.fillText(stats, 72, 850);
      /* countdown footer */
      const cd = DB.raceCountdown(iso);
      x.font = '700 40px ' + mono; x.globalAlpha = 0.75;
      x.fillText(('' + PLAN.race.name).toUpperCase(), 72, 1180);
      x.globalAlpha = 1;
      x.font = '900 84px ' + disp; x.fillStyle = CARD.accent;
      x.fillText(cd.past ? 'MARATHONER' : cd.weeks + 'w ' + cd.rem + 'd to the gun', 72, 1280);
      const blob2file = (blob) => new File([blob], 'week-os-run.png', { type: 'image/png' });
      c.toBlob((blob) => {
        if (!blob) return;
        const file = blob2file(blob);
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          navigator.share({ files: [file] }).catch(() => showCardOverlay(c));
        } else {
          showCardOverlay(c);
        }
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
      '<div class="card-ov" role="dialog" aria-label="Run card">' +
      '<img alt="Run card — long-press to save">' +
      '<div class="card-note">Long-press the card to save or share it</div>' +
      '<button class="card-x">Close</button></div>'
    );
    ov.querySelector('img').src = canvas.toDataURL('image/png');
    ov.querySelector('.card-x').addEventListener('click', () => ov.remove());
    document.body.appendChild(ov);
  }

  /* ---- week-progress ring: banked vs planned run km this week ---- */
  function weekRingHTML(iso) {
    const wk = DB.weekKm(getDone, mondayOf(iso));
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
    const card = el(
      '<div class="tl-card' + (isDone ? ' done' : '') + (opts.skipped ? ' skipped' : '') + (opts.current ? ' current' : '') + (opts.just ? ' just' : '') + '" style="--cat:' + cat + '">' +
      '<div class="c-main">' +
      '<div class="c-time">' + b.start + (b.end && b.end !== b.start ? '–' + b.end : '') +
      (opts.current ? ' <span class="nowflag">· NOW</span>' : '') + '</div>' +
      '<div class="c-title">' + esc(b.title) + '</div>' +
      '<div class="c-detail">' + detailHTML(b.detail, iso + '|' + b.id, false) + '</div>' +
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
        return '<div class="xr"><span class="xn">' + esc(p.ex) + '</span>' +
          '<span class="xs">' + esc(p.sets) + '</span>' + w + '</div>';
      }).join('') + '</div></details>' : '') +
      '<div class="c-cat">' + esc(b.cat) + (opts.skipped ? ' · skipped' : '') +
      (opts.moved ? ' · moved from ' + esc(fmtShort(opts.moved.fromIso)) : '') + '</div>' +
      (opts.just && isDone && (b.cat !== 'run' || opts.moved) ? '<div class="completion-note" role="status">✓ Session banked</div>' : '') +
      (expanded ? '<div class="c-actions">' +
        (opts.skipped ? '<button data-act="unskip">Unskip</button>' : '<button data-act="skip">Skip</button>') +
        (opts.moved ? '<button data-act="return">Return to ' + esc(fmtShort(opts.moved.fromIso)) + '</button>'
                    : '<button data-act="move">Move to tomorrow</button>') +
        (b.cat === 'run' && !opts.moved
          ? '<button data-act="niggle">Niggle — rest 2 days</button>' +
            '<button data-act="illweek">Ill — rest to Sunday</button>'
          : '') +
        '</div>' : '') +
      '</div>' +
      '<div class="c-side">' +
      '<button class="tick' + (isDone ? ' on' : '') + '" aria-pressed="' + isDone + '" aria-label="' + (isDone ? 'Mark not done: ' : 'Mark done: ') + esc(b.title) + '">✓ <span>' + (isDone ? 'Done' : 'Mark done') + '</span></button>' +
      '<button class="more-btn" aria-label="Actions">⋯</button>' +
      '</div></div>'
    );
    card.querySelector('.tick').addEventListener('click', () => {
      if (!isDone) state.justTicked = b.id;       // animate on tick-on only
      toggleDone(iso, b.id);
      render();
    });
    card.querySelector('.more-btn').addEventListener('click', () => {
      state.expanded = expanded ? null : b.id;
      render();
    });
    card.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'skip') setSkip(iso, b.id, true);
      if (act === 'unskip') setSkip(iso, b.id, false);
      if (act === 'move') moveToTomorrow(iso, b);
      if (act === 'return') returnMoved(iso, b.id);
      if (act === 'niggle') skipRunDays(iso, 2);
      if (act === 'illweek') skipRunDays(iso, 7 - DB.dayIndex(iso));
      state.expanded = null;
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

  function attachUndoMove(iso, b) {
    const cat = CAT_VAR[b.cat] || CAT_VAR.routine;
    const card = el(
      '<div class="tl-card skipped" style="--cat:' + cat + '">' +
      '<div class="c-main"><div class="c-time">' + b.start + '–' + b.end + '</div>' +
      '<div class="c-title">' + esc(b.title) + '</div>' +
      '<div class="moved-tag">→ moved to tomorrow</div></div>' +
      '<div class="c-side"><button class="more-btn" aria-label="Undo move">↩</button></div></div>'
    );
    card.querySelector('.more-btn').addEventListener('click', () => { undoMove(iso, b.id); render(); });
    return card;
  }

  /* The skyline: all 30 weeks as one shape — planned km as phase-coloured
     bars, banked km filled inside them, key days flagged, race starred. */
  function buildSkyline(curWeek) {
    const shape = DB.seasonShape(getDone);
    const maxKm = Math.max.apply(null, shape.map((w) => w.km));
    const W = 360, H = 118, base = 100, top = 14;
    const slot = W / shape.length, barW = slot * 0.72;
    const y = (km) => base - (km / maxKm) * (base - top);
    let svg = '';
    for (let i = 0; i < shape.length; i++) {
      const wkr = shape[i];
      const xPos = i * slot + (slot - barW) / 2;
      const h = base - y(wkr.km);
      const cur = wkr.wk === curWeek;
      const past = curWeek != null && wkr.wk < curWeek;
      const op = cur ? 1 : past ? 0.9 : wkr.cutback ? 0.32 : 0.5;
      svg += '<rect x="' + xPos.toFixed(1) + '" y="' + y(wkr.km).toFixed(1) +
        '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="1.6" fill="var(--phase-' + wkr.phase + ')" opacity="' + op + '"/>';
      if (wkr.banked > 0) {
        svg += '<rect x="' + xPos.toFixed(1) + '" y="' + y(Math.min(wkr.banked, wkr.km)).toFixed(1) +
          '" width="' + barW.toFixed(1) + '" height="' + (base - y(Math.min(wkr.banked, wkr.km))).toFixed(1) +
          '" rx="1.6" fill="var(--text)" opacity="0.38"/>';
      }
      if (wkr.race) {
        svg += '<text x="' + (xPos + barW / 2).toFixed(1) + '" y="' + (y(42.2) - 6).toFixed(1) +
          '" text-anchor="middle" font-size="11" fill="var(--accent)">★</text>' +
          '<rect x="' + xPos.toFixed(1) + '" y="' + y(42.2).toFixed(1) + '" width="' + barW.toFixed(1) +
          '" height="' + (base - y(42.2)).toFixed(1) + '" rx="1.6" fill="var(--accent)" opacity="0.85"/>';
      } else if (wkr.key) {
        svg += '<circle cx="' + (xPos + barW / 2).toFixed(1) + '" cy="' + (y(wkr.km) - 5).toFixed(1) +
          '" r="2" fill="var(--accent)"/>';
      }
      if (cur) {
        svg += '<rect x="' + (xPos - 2).toFixed(1) + '" y="' + (y(wkr.km) - 2).toFixed(1) +
          '" width="' + (barW + 4).toFixed(1) + '" height="' + (h + 4).toFixed(1) +
          '" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.6"/>' +
          '<text x="' + (xPos + barW / 2).toFixed(1) + '" y="' + (y(wkr.km) - 8).toFixed(1) +
          '" text-anchor="middle" font-size="9" font-weight="700" fill="var(--accent)" ' +
          'font-family="Space Mono, monospace">WK' + wkr.wk + '</text>';
      }
    }
    svg += '<line x1="0" y1="' + (base + 0.5) + '" x2="' + W + '" y2="' + (base + 0.5) +
      '" stroke="var(--line)" stroke-width="1"/>';
    const banked = shape.reduce((a, w) => a + w.banked, 0);
    const total = shape.reduce((a, w) => a + w.km, 0);
    const fmt = (n) => (n === Math.round(n) ? n : n.toFixed(1));
    return el(
      '<div class="skyline" role="img" aria-label="30 weeks of training: bars are planned km, ' +
      'filled portions are km already run, the star is race day">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + svg + '</svg>' +
      '<div class="sky-cap"><span>base → build → taper · • key days · ★ the gun</span>' +
      '<span class="v">' + fmt(banked) + ' / ' + total + ' km</span></div></div>'
    );
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
    const monday = DB.addDays(iso, -day.dayIndex);
    const split = DB.distancesForWeek(day.row);
    const byDay = { 1: split.tue, 2: split.wed, 3: split.thu, 5: split.sat };
    let plannedSoFar = 0, ranSoFar = 0;
    Object.keys(byDay).forEach((di) => {
      const d = DB.addDays(monday, Number(di));
      if (d >= iso) return;
      plannedSoFar += byDay[di];
      const e = getRunLogEntry(d);
      if (e && e.sec) ranSoFar += e.km || (DB.buildDay(d).run ? DB.buildDay(d).run.run.km : 0);
    });
    if (!(plannedSoFar > 0) || ranSoFar >= plannedSoFar * g.shortPct) return null;
    const short = Math.round((plannedSoFar - ranSoFar) * 10) / 10;
    return '<div class="h-guard"><b>' + (Math.round(ranSoFar * 10) / 10) + ' of ' +
      plannedSoFar + ' km this week so far — ' + short + ' km behind.</b> ' +
      esc(g.note) + '</div>';
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
      { di: 1, name: 'Tue', plan: split.tue },
      { di: 2, name: 'Wed', plan: split.wed },
      { di: 3, name: 'Thu', plan: split.thu },
      { di: 5, name: 'Sat', plan: split.sat },
      { di: 6, name: 'Long', plan: split.long },
    ].filter((s) => s.plan > 0);
    let ranTotal = 0, planTotal = 0, lrRan = 0;
    slots.forEach((s) => {
      const iso = DB.addDays(anchor, s.di);
      const e = getRunLogEntry(iso);
      const day = DB.buildDay(iso);
      s.ran = e && e.sec ? (e.km || (day.run ? day.run.run.km : 0)) : 0;
      s.pct = s.plan ? s.ran / s.plan : 0;
      ranTotal += s.ran; planTotal += s.plan;
      if (s.di === 6) lrRan = s.ran;
    });
    if (!(ranTotal > 0)) return null;
    const shareRan = (lrRan / ranTotal) * 100;
    const sharePlan = (split.long / planTotal) * 100;
    const skewed = shareRan - sharePlan >= r.lrShareOverPts;
    const off = slots.filter((s) => s.pct < r.shortPct || s.pct > r.overPct);
    if (!skewed && !off.length) return null;

    const chips = slots.map((s) => {
      const cls = s.pct < r.shortPct ? ' short' : s.pct > r.overPct ? ' over' : '';
      return '<span class="shp' + cls + '"><i>' + s.name + '</i>' +
        (Math.round(s.ran * 10) / 10) + '<small>/' + s.plan + '</small></span>';
    }).join('');
    return el(
      '<div class="wk-shape"><b>Right total, wrong shape.</b> ' +
      (Math.round(ranTotal * 10) / 10) + ' of ' + planTotal + ' km banked' +
      (skewed ? ', but the long run took <b>' + Math.round(shareRan) +
        '%</b> of the week against a planned ' + Math.round(sharePlan) + '%' : '') + '.' +
      '<div class="shp-row">' + chips + '</div>' +
      '<div class="shp-note">' + esc(r.note) + '</div>' +
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
    const ran = loggedKm(prev);
    if (!(ran > 0)) return null;                 // nothing logged ≠ nothing run
    if (ran >= prevRow.km * r.shortfall) return null;
    if (day0.row.km < ran * r.jumpRatio) return null;
    const pct = Math.round((ran / prevRow.km) * 100);
    return el(
      '<div class="wk-jump"><b>Coming off a short week.</b> Week ' + (day0.week - 1) +
      ' logged <b>' + (Math.round(ran * 10) / 10) + ' of ' + prevRow.km + ' km</b> (' + pct +
      '%). This week plans ' + day0.row.km + ' — about ' +
      (Math.round((day0.row.km / ran) * 10) / 10) + '× what you actually ran.<br>' +
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
      '<div class="wk-head"><button class="nav" data-d="-7" aria-label="Previous week">‹</button>' +
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
      const km = DB.weekKm(getDone, anchor);
      if (km.planned > 0) {
        const fmt = (n) => (n === Math.round(n) ? n : n.toFixed(1));
        const pct = Math.min(100, (km.done / km.planned) * 100).toFixed(1);
        view.appendChild(el(
          '<div class="wkp" role="img" aria-label="' + fmt(km.done) + ' of ' + fmt(km.planned) + ' km banked">' +
          '<div class="wkp-label">✓ <b>' + fmt(km.done) + '</b> of ' + fmt(km.planned) + ' km banked</div>' +
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
      const doables = day.blocks.filter((b) => b.doable);
      const doneCount = doables.filter((b) => done[b.id]).length;
      const d = DB.parseLocalDate(iso);

      let cls = 'wk-day' + (iso === real ? ' today' : iso < real ? ' past' : '');
      let runHtml, barHtml = '';
      if (day.run) {
        const km = day.run.run.km;
        cls += ' has-run' + (km === maxKm ? ' lr' : '');
        barHtml = '<i class="d-bar' + (done[day.run.id] ? ' done' : '') +
          '" style="width:' + ((km / maxKm) * 100).toFixed(1) + '%"></i>';
        runHtml = {
          run: '<div class="d-run">' + esc(day.run.title) + '</div>' +
            '<div class="d-extras">' + esc(day.run.run.shoe) + extraBits(day) + '</div>',
          km: (km === Math.round(km) ? km : km.toFixed(1)) + '<small>km</small>',
        };
      } else {
        runHtml = {
          run: '<div class="d-run rest">No run</div><div class="d-extras">' + (extraBits(day).replace(/^ · /, '') || 'recovery') + '</div>',
          km: '—',
        };
      }

      const row = el(
        '<button class="' + cls + '"' + (iso === real ? ' aria-current="date"' : '') + '>' +
        '<span class="d-date"><b>' + DAY_SHORT[i] + '</b><span>' + d.getDate() + '</span></span>' +
        '<span class="d-main">' + runHtml.run + '</span>' +
        '<span class="d-right"><span class="d-km">' + runHtml.km + '</span>' +
        '<span class="d-done' + (doables.length && doneCount === doables.length ? ' all' : '') + '">' +
        (iso <= real && doables.length ? '<br>' + doneCount + '/' + doables.length : '') + '</span></span>' +
        barHtml +
        '</button>'
      );
      row.addEventListener('click', () => { state.view = 'today'; state.dateISO = iso; window.scrollTo(0, 0); render(); });
      days.appendChild(row);
    }
    Array.prototype.forEach.call(days.children, (c, i) => c.style.setProperty('--i', i));
    view.appendChild(days);
  }

  function extraBits(day) {
    const bits = day.blocks
      .filter((b) => b.doable && b.cat !== 'run' && b.cat !== 'reading' && b.cat !== 'study')
      .map((b) => b.title.replace(/ *[—·(].*$/, '').trim());
    return bits.length ? ' · ' + esc(bits.join(' · ')) : '';
  }

  /* ================= plan view ================= */
  function renderPlan() {
    const view = document.getElementById('view');
    view.innerHTML = '';
    const block = PLAN.blocks[0];
    const today = todayISO();
    const cur = DB.resolveBlock(today);

    view.appendChild(el(
      '<div class="plan-head"><h1>The 30-week block</h1>' +
      '<div class="wk-sub">' + fmtShort(block.start) + ' → race ' + fmtShort(PLAN.race.date) + ' · gun ' + esc(PLAN.race.gun) + '</div></div>'
    ));
    view.appendChild(buildSkyline(cur.week));

    /* adherence so far — the block talks back */
    const adh = DB.adherence(getDone, (iso) => getOvr(iso).skip, today);
    const fmt = (n) => (n === Math.round(n) ? n : n.toFixed(1));
    if (adh.day > 0) {
      view.appendChild(el(
        '<div class="stats" role="group" aria-label="Block progress so far">' +
        '<div class="stat"><b>' + adh.day + '<small>/' + adh.days + '</small></b><span>day</span></div>' +
        '<div class="stat"><b>' + fmt(adh.kmDone) + '<small>/' + fmt(adh.kmDue) + '</small></b><span>km banked</span></div>' +
        '<div class="stat"><b>' + adh.runsDone + '<small>/' + adh.runsDue + '</small></b><span>runs</span></div>' +
        '<div class="stat"><b>' + adh.streak + (adh.bestStreak > adh.streak ? '<small>best ' + adh.bestStreak + '</small>' : '') + '</b><span>run streak</span></div>' +
        '</div>'
      ));
      /* phase strip: base 10 · build 17 · taper 3 wks, marker = today.
         Identity is order + labels, never colour alone (muted brand tokens). */
      const pct = Math.min(100, (adh.day / adh.days) * 100).toFixed(1);
      view.appendChild(el(
        '<div class="blockbar" role="img" aria-label="Day ' + adh.day + ' of ' + adh.days + ' — base, build, taper">' +
        '<i class="bb-base" style="flex-grow:10"></i>' +
        '<i class="bb-build" style="flex-grow:17"></i>' +
        '<i class="bb-taper" style="flex-grow:3"></i>' +
        '<span class="bb-mark" style="left:' + pct + '%"></span></div>'
      ));
      /* every planned run in the block, one dot each */
      const log = DB.runLog(getDone, (iso) => getOvr(iso).skip, today);
      const doneN = log.filter((r) => r.state === 'done').length;
      view.appendChild(el(
        '<div class="runlog" role="img" aria-label="' + doneN + ' of ' + log.length + ' runs done">' +
        log.map((r) =>
          '<i class="rl rl-' + r.state + ' ph-' + esc(r.phase) + '" title="' + r.iso + ' · ' + r.km + ' km"></i>'
        ).join('') + '</div>'
      ));
    }

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
    view.appendChild(rows);
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
      if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' }); }
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
  }

  /* ---- tune-up recalibrator (§10, advisory — the plan file stays canonical) ---- */
  function parseHalf(s) {
    const m = String(s).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const sec = (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
    return sec >= 4200 && sec <= 12000 ? sec : null;      // 1:10–3:20 sanity band
  }
  function fmtClock(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h + ':' + String(m).padStart(2, '0');
  }
  function fmtPace(secPerKm) {
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return m + ':' + String(s).padStart(2, '0') + '/km';
  }
  function recalVerdict(halfSec) {
    const riegel = halfSec * Math.pow(2, 1.06);           // T×(42.195/21.0975)^1.06
    let verdict;
    if (halfSec <= 115 * 60) {
      verdict = 'Sub-4:00 is ON — lock MP 5:41/km.' +
        (halfSec <= 112 * 60 ? ' The 3:45 stretch bet is in play — decide with a cool head.' : '');
    } else if (halfSec >= 120 * 60) {
      verdict = 'Lock 4:10–4:15 and run it smart — MP 5:55–6:02/km.';
    } else {
      verdict = 'Between the §10 anchors — aim ~4:05 (MP ~5:48/km) and decide in the final weeks.';
    }
    return esc(verdict) +
      '<br>Riegel projection: <b>' + esc(fmtClock(riegel)) + '</b> (' + esc(fmtPace(riegel / 42.195)) + ')' +
      '<br>To lock a new target in, amend data/plan.js — the plan stays canonical.';
  }
  function buildRecalSection() {
    const saved = readJSONSafeString('recal');
    const wrap = el(
      '<div class="ref"><h2>Tune-up recalibrator</h2><div class="ref-card data-card">' +
      '<div class="ref-note">After the Week-24 half (Sun 13 Dec), enter your time. §10 sets the target — ambition doesn’t.</div>' +
      '<div class="data-actions"><input class="recal-in" inputmode="numeric" ' +
      'placeholder="1:54:30" value="' + esc(saved) + '" aria-label="Half marathon time"> ' +
      '<button data-io="recal">Set target</button></div>' +
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
      try { localStorage.setItem('recal', input.value.trim()); } catch (e) { /* fine */ }
      show(input.value.trim());
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
      const cls = day.run ? DB.runClass(day.run) : 'easy';
      const dec = DB.decoupling(km, e.sec, e.hr, e.halfPaceSec, e.hr2);
      entries.push({
        iso: m[1], km, cls, sec: e.sec, dec: dec ? dec.pct : null,
        pace: DB.paceOf(km, e.sec),
        hr: e.hr || null,
        ef: e.hr ? DB.ef(km, e.sec, e.hr) : null,
        hard: cls === 'quality' || cls === 'race',
        temp: e.temp == null ? null : e.temp,
        tooHot: e.temp != null && e.temp >= PLAN.benchmark.tempInvalid,
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
    function sparkFor(cls, label) {
      const eligible = entries.filter(e => e.cls === cls && !e.tooHot && e.iso <= todayISO());
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
    /* The only real audit of rule 1: where the running actually sits. One
       stacked bar, weighted by TIME rather than by run count, because four
       easy kilometres and a 30 km long run are not one vote each. */
    spark += (function () {
      const hr = readJSON('hr', null);
      if (!hr || !hr.rest || !hr.max) return '';
      const zs = DB.hrZones(hr.rest, hr.max);
      if (!zs) return '';
      const secs = [0, 0, 0, 0, 0];
      let total = 0;
      entries.forEach((e) => {
        if (!e.hr || !e.sec) return;
        const z = DB.zoneOf(e.hr, hr.rest, hr.max);
        secs[z && z.z ? z.z - 1 : 0] += e.sec;   /* below Z1 counts as Z1 */
        total += e.sec;
      });
      if (!total) return '';
      const t = PLAN.intensityTarget;
      const easy = ((secs[0] + secs[1]) / total) * 100;
      const tone = ['var(--phase-base)', 'var(--phase-base)', 'var(--phase-taper)',
        'var(--accent)', 'var(--accent)'];
      const segs = secs.map((s, i) => s
        ? '<i style="width:' + ((s / total) * 100).toFixed(2) + '%;background:' + tone[i] +
          (i === 1 || i === 4 ? ';opacity:.72' : '') + '" title="Z' + (i + 1) + '"></i>'
        : '').join('');
      const key = secs.map((s, i) => s
        ? '<span><i style="background:' + tone[i] + (i === 1 || i === 4 ? ';opacity:.72' : '') +
          '"></i>Z' + (i + 1) + ' ' + Math.round((s / total) * 100) + '%</span>'
        : '').join('');
      const ok = easy >= t.easyPct;
      return '<div class="dist"><div class="dc-h">Where the running sits · by time</div>' +
        '<div class="dist-bar">' + segs + '</div>' +
        '<div class="dist-key">' + key + '</div>' +
        '<div class="dist-v ' + (ok ? 'good' : 'warn') + '"><b>' + Math.round(easy) +
        '%</b> at Z2 or easier · target ' + t.easyPct + '%+ — ' + esc(ok ? t.good : t.warn) +
        '</div></div>';
    }());
    /* Decoupling gets a ladder rather than a sparkline: the threshold is
       the point, not the shape. Falling numbers are the base arriving. */
    const decPts = entries.filter((e) => e.dec != null).slice(-6);
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
    const rows = entries.slice(-10).reverse().map((e) =>
      '<article class="run-entry"><div class="run-entry-head"><b>' + esc(fmtShort(e.iso)) +
      (e.hard ? ' <i class="dot" style="background:var(--accent)" title="hard session"></i>' : '') +
      '</b><span>' + e.km + ' km</span>' +
      (e.temp != null ? ' <i class="tmp' + (e.tooHot ? ' hot' : '') + '">' + e.temp + '°</i>' : '') +
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
      recent +
      '<div class="ref-note">' + esc(PLAN.zoneModel.method) + '. ' +
      esc(PLAN.zoneModel.note) + (hr && hr.at ? ' Set ' + esc(fmtShort(hr.at)) + '.' : '') +
      '</div>' +
      '<div class="ref-note"><b>Setting max HR.</b> ' + esc(PLAN.zoneModel.measure) + '</div></div>'
    );
    wrap.querySelectorAll('[data-hz]').forEach((btn) => btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-hz');
      if (k === 'edit') { state.hrEdit = true; state.hrDraft = { rest: rest || 50, max: max || 195 }; }
      else if (k === 'cancel') { state.hrEdit = false; state.hrDraft = null; }
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
  const STORE_KEY = /^(?:(?:done|ovr|movein|runlog)-\d{4}-\d{2}-\d{2}|wt-[a-z0-9-]+|recal|hr)$/;

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
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nav = btn.getAttribute('data-nav');
      const backdrop = document.getElementById('sheet-backdrop');
      if (nav === 'more') { backdrop.classList.remove('hidden'); return; }
      backdrop.classList.add('hidden');
      if (nav === 'close') return;
      if (nav === 'today') { state.dateISO = todayISO(); state.expanded = null; }
      if (nav === 'week') state.weekAnchor = mondayOf(state.dateISO || todayISO());
      state.view = nav;
      window.scrollTo(0, 0);
      render();
    });
  });
  document.getElementById('sheet-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  /* ---- minute tick: full render only when the NOW block changes ---- */
  let lastISO = todayISO();
  function refreshClock() {
    if (document.hidden) return;
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
    const key = iso + '|' + (cur ? cur.id : '-') + '|' + (nxt ? nxt.id : '-');
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

  render();
})();
