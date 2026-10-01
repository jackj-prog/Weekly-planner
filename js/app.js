/* ==========================================================================
   Week OS — js/app.js
   Rendering + interaction only. All routine content comes from PLAN via
   DayBuilder; this file contains zero plan content.
   ========================================================================== */
(function () {
  'use strict';

  const APP_VERSION = '5.1.0';
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
  function fmtIn(mins) {
    if (mins >= 60) return 'in ' + Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm';
    return 'in ' + mins + ' min';
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
    if (!o.legs || typeof o.legs !== 'object' || Array.isArray(o.legs)) o.legs = {};
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
  /* The three-tier leg rule (PLAN.legDose, §6): which tiers a session can
     take, the one chosen for this date, and the exercise list it leaves.
     'half' takes each leg movement to one set; 'skip' drops them. */
  function legTiers(block) {
    const r = PLAN.moveRules, d = PLAN.legDose;
    if (!r || !d || block.cat !== 'gym' || !block.plan) return [];
    const re = new RegExp(r.legPattern, 'i');
    const legs = block.plan.filter((p) => re.test(p.ex));
    if (!legs.length) return [];
    const halvable = legs.some((p) => { const m = String(p.sets).match(/^(\d+)\s*×/); return m && +m[1] > 1; });
    return d.tiers.filter((t) => t.id !== 'half' || halvable);
  }
  function legDose(iso, block) {
    const v = getOvr(iso).legs[block.id];
    return legTiers(block).some((t) => t.id === v) ? v : 'full';
  }
  function setLegDose(iso, id, v) {
    const o = getOvr(iso);
    if (v === 'full') delete o.legs[id]; else o.legs[id] = v;
    writeJSON(ovrKey(iso), o);
  }
  function dosedPlan(iso, block) {
    const dose = legDose(iso, block);
    if (dose === 'full') return block.plan.map((p) => Object.assign({}, p));
    const re = new RegExp(PLAN.moveRules.legPattern, 'i');
    return block.plan.map((p) => {
      if (!re.test(p.ex)) return Object.assign({}, p);
      if (dose === 'skip') return Object.assign({}, p, { off: true });
      return Object.assign({}, p, { sets: String(p.sets).replace(/^\d+\s*×/, '1 ×'), halved: true });
    });
  }

  /* The other six days of this block's Monday–Sunday week, each with what
     is already there of the same kind, so a move shows its clash first. */
  function moveTargets(iso, block) {
    const monday = mondayOf(iso), out = [];
    for (let i = 0; i < 7; i++) {
      const d = DB.addDays(monday, i);
      if (d === iso) continue;
      const day = DB.buildDay(d), ovr = getOvr(d);
      const head = (t) => String(t).replace(/ +[—·(].*$/, '').trim();
      const same = day.blocks.filter((x) => x.doable && x.cat === block.cat && !ovr.skip[x.id] && !ovr.moved[x.id]).map((x) => head(x.title))
        .concat(getMoveIn(d).filter((m) => m.cat === block.cat && m.srcId !== block.id).map((m) => head(m.title)));
      out.push({ iso: d, label: DAY_SHORT[i].charAt(0) + DAY_SHORT[i].slice(1).toLowerCase() + ' ' + Number(d.slice(8)),
        clash: same.length ? 'has ' + same.join(' + ') : '', legDrop: legDropFor(block, d) });
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
  /* a separator stays with the word before it, so a wrapped title never
     opens its second line on a bare "·" or "—" (v4.96) */
  function glue(html) {
    return String(html).replace(/ ([·—]) /g, '\u00a0$1 ')
      .replace(/(\d) (min|km|s|h|bpm)\b/g, '$1\u00a0$2')      // 5×3 min, 22 km: a number keeps its unit
      .replace(/ @ /g, ' @\u00a0');                           // @ MP, @ threshold: the mark keeps its object
  }
  function tt(s) { return glue(esc(s)); }
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
      /* a zone and its range never break apart ("Z3 (154– / 169)") (v5.0.7) */
      return z ? 'Z' + n + '\u00a0(' + z.lo + '\u2060–\u2060' + z.hi + ')' : m0;
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
    if (day.phase) chips.push('<span class="chip ' + esc(day.phase) + '">' + esc(day.blockId === 'recovery' ? 'recovery' : day.phase) + '</span>');
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
      '</div>' + (day.label ? '<p class="day-label">' + (day.week != null ? '<span>Week ' + day.week + '</span> ' : '') + esc(day.label) + '</p>' : '') + '</div>'
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
        '<span class="rest-wm" aria-hidden="true">REST</span>' +
        '<div class="rest-kicker"><span>OFF THE RUN</span>' + restMoonHTML(iso) + '</div>' +
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

    const previously = buildPreviously(iso, day);
    if (previously) view.appendChild(previously);

    const feast = feastOn(iso);
    if (feast) view.appendChild(el('<p class="hodie"><span class="feast">Red-letter day · ' + esc(feast) + '</span></p>'));

    view.appendChild(el('<div class="timeline-head"><h2>Your day</h2>' +
      (day.blockId === 'marathon' ? weekRingHTML(iso) : '') + '</div>'));
    /* -- timeline -- (the clock follows it, v4.88) */
    const tl = el('<div class="tl"></div>');
    const nMin = nowMin();
    let nowPlaced = !isToday;

    movedIn.forEach((m) => {
      const card = buildCard({
        id: m.id, title: m.title, detail: m.detail, plan: m.plan || null, cat: m.cat, run: m.run || null,
        start: '·', end: '', doable: true,
      }, done, iso, { moved: m, just: just === m.id, slim: !!(movedRun && m.id === movedRun.id) });
      tl.appendChild(card);
    });

    /* The sun keeps its own hours in the timeline (v4.78): sunrise and
       sunset sit in their places among the day's rows, and the spine takes
       the real light — bright through the day, dim through the night. */
    const skyPl = DB.skyPlace(iso), skySt = skyPl ? DB.sunTimes(iso, skyPl.lat, skyPl.lon, skyPl.offsetMin) : null;
    const sunRows = skySt && skySt.rise != null && skySt.set != null
      ? [{ m: skySt.rise, kind: 'rise' }, { m: skySt.set, kind: 'set' }] : [];
    const flushSun = (limit) => {
      while (sunRows.length && sunRows[0].m < limit) {
        const r = sunRows.shift();
        tl.appendChild(el(sunRowHTML(r.kind, skySt, skyPl, r.m))); }
    };
    const nowRow = () => el('<div class="tl-now" data-m="' + nMin + '">NOW ' + DB.fmtHM(nMin) + '</div>');
    let prevEnd = null;
    for (const b of day.blocks) {
      if (prevEnd !== null && b.startMin - prevEnd >= 40) {
        flushSun(prevEnd + 1);
        tl.appendChild(el('<div class="tl-gap" data-m="' + prevEnd + '">' + fmtGap(b.startMin - prevEnd) + '</div>'));
      }
      prevEnd = b.endMin;
      if (!nowPlaced && nMin < b.startMin) {
        flushSun(nMin + 1);
        tl.appendChild(nowRow());
        nowPlaced = true;
      }
      flushSun(b.startMin);
      const isCurrent = isToday && nMin >= b.startMin && nMin < b.endMin;

      const isPast = isToday && b.endMin <= nMin;
      if (b.quiet && !b.doable) {
        const q = el(
          '<div class="tl-quiet' + (isCurrent ? ' current' : '') + (isPast ? ' past' : '') + '" style="--cat:' + (CAT_VAR[b.cat] || CAT_VAR.routine) + '">' +
          '<span class="q-emb">' + emblemSVG(emblemKind(b)) + '</span>' +
          '<span class="t">' + b.start + '–' + b.end + '</span>' +
          '<div class="quiet-main">' + (b.detail ? '<details class="anchor-detail" data-disclosure="' + esc(iso + '|' + b.id) + '"' +
          (openDetails.has(iso + '|' + b.id) ? ' open' : '') + '><summary>' + tt(b.title) + '</summary>' +
          '<div class="detail-body">' + esc(withZones(b.detail)) + '</div></details>' : tt(b.title)) + '</div></div>'
        );
        q.dataset.m = b.startMin;
        tl.appendChild(q);
      } else {
        const card = buildCard(b, done, iso, { current: isCurrent, past: isPast, skipped: !!ovr.skip[b.id], moved: null, movedOut: !!ovr.moved[b.id], just: just === b.id,
          slim: !!(day.run && b.id === day.run.id) });
        card.dataset.m = b.startMin;
        tl.appendChild(card);
      }
      /* NOW falls inside the current block, so it follows that block's
         start rather than sitting above it as if it had not begun (v4.87) */
      if (isCurrent) {
        flushSun(nMin + 1);
        tl.appendChild(nowRow());
        nowPlaced = true;
      }
    }
    if (!nowPlaced) { flushSun(nMin + 1); tl.appendChild(nowRow()); }
    flushSun(Infinity);
    /* stagger index → cascading entrance (CSS, motion-gated) */
    Array.prototype.forEach.call(tl.children, (c, i) => c.style.setProperty('--i', i));
    view.appendChild(tl);
    view.appendChild(el(dayWheelHTML(day, done, iso, isToday, ovr)));
    if (skySt && skySt.rise != null) {
      paintSpine(tl, skySt);
      if ('ResizeObserver' in window) new ResizeObserver(() => paintSpine(tl, skySt)).observe(tl);
    }

    /* weight input just opened — put the cursor in it */
    const wi = view.querySelector('.xw-in');
    if (wi) { wi.focus(); wi.select(); }
  }

  /* the moon's phase by name, from DB.moonPhase */
  function moonName(mp) {
    const p = mp.phase;
    return p < 0.03 || p > 0.97 ? 'New moon' : p < 0.22 ? 'Waxing crescent' : p < 0.28 ? 'First quarter'
      : p < 0.47 ? 'Waxing gibbous' : p < 0.53 ? 'Full moon' : p < 0.72 ? 'Waning gibbous' : p < 0.78 ? 'Last quarter' : 'Waning crescent';
  }
  /* A rest day's emblem (v4.79): the night's real moon, named, where a
     generic pause mark used to sit. Rest is what the night is for. */
  function restMoonHTML(iso) {
    const mp = DB.moonPhase(iso);
    return '<span class="rest-moon"><svg viewBox="0 0 48 48" aria-hidden="true">' + moonSVG(24, 24, 15, mp, 'rm') + '</svg>' +
      '<small>' + esc(moonName(mp)) + '</small></span>';
  }
  /* a sunrise or sunset row for the timeline: the sun on the spine, the
     time, and the edge of the light that matters (first light, full dark) */
  function sunRowHTML(kind, st, place, m) {
    const rise = kind === 'rise';
    const text = rise ? 'Sunrise ' + DB.fmtHM(st.rise) + (st.dawn != null ? '\u00a0· first light ' + DB.fmtHM(st.dawn) : '')
      : 'Sunset ' + DB.fmtHM(st.set) + (st.dusk != null ? '\u00a0· dark by ' + DB.fmtHM(st.dusk) : '');
    let rays = '';
    for (let k = 1; k < 6; k++) {
      const t = Math.PI + k * Math.PI / 6;
      rays += 'M' + (8 + 5.2 * Math.cos(t)).toFixed(1) + ' ' + (9 + 5.2 * Math.sin(t)).toFixed(1) + ' L' + (8 + 7.6 * Math.cos(t)).toFixed(1) + ' ' + (9 + 7.6 * Math.sin(t)).toFixed(1) + ' ';
    }
    return '<div class="tl-sun ' + kind + '" data-m="' + m + '"><svg class="tl-sunglyph" viewBox="0 0 16 12" aria-hidden="true">' +
      '<path class="r" d="' + rays + '"/><path class="d" d="M4.6 9 A3.4 3.4 0 0 1 11.4 9 Z"/><path class="h" d="M0 9.5 L16 9.5"/></svg>' +
      '<span>' + esc(text + placeTime(place)) + '</span></div>';
  }
  /* the timeline's spine in the real light: each row's own minute sets
     its brightness, and the gradient runs between them */
  function paintSpine(tl, st) {
    const H = tl.offsetHeight;
    if (!H || H < 40) return;
    const stops = [];
    Array.prototype.forEach.call(tl.children, (c) => {
      const m = Number(c.dataset.m);
      if (c.dataset.m == null || !Number.isFinite(m)) return;
      const y = c.offsetTop + 12, L = DB.lightLevel(st, m);
      stops.push('color-mix(in srgb, var(--t2) ' + Math.round(L * 78) + '%, var(--line)) ' + Math.max(0, Math.min(100, (y - 10) / (H - 20) * 100)).toFixed(1) + '%');
    });
    if (stops.length > 1) tl.style.setProperty('--spine', 'linear-gradient(180deg, ' + stops.join(', ') + ')');
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

  const nnKm = (k) => String(Math.round(k * 10) / 10);
  function buildNowNext(day) {
    const nMin = nowMin();
    const cur = day.blocks.find((b) => nMin >= b.startMin && nMin < b.endMin);
    const next = day.blocks.filter((b) => b.startMin > nMin).slice(0, 2);
    nowKey = day.iso + '|' + (cur ? cur.id : '-') + '|' + (next[0] ? next[0].id : '-') +
      (day.run && nMin > day.run.endMin + MISSED_GRACE_MIN ? '|late' : '') + skyKey(day.iso, nMin);
    const sky = skyNow(day.iso, nMin).light;
    let html = '<section class="nownext sky-' + sky + '" aria-label="Now and next">' + nnStarsHTML(day.iso, nMin) + '<div class="nn-current">' +
      '<div class="nn-clock"><span>NOW' + skyGlyph(day.iso, nMin) + '</span><time class="live-clock">' + DB.fmtHM(nMin) + '</time></div><div class="nn-main">';
    if (cur) {
      const pct = Math.round(((nMin - cur.startMin) / (cur.endMin - cur.startMin)) * 100);
      html += '<div class="nn-title"><span class="nn-emb" style="color:' + emblemTone(cur) + '">' + emblemSVG(emblemKind(cur)) + '</span>' + tt(cur.title) + '</div>' +
        '<div class="nn-time">' + cur.start + '–' + cur.end + (cur.run && !new RegExp('\\b' + cur.run.km + '\\b').test(cur.title) ? ' · ' + nnKm(cur.run.km) + '\u00a0km' : '') +
        ' · <span class="nn-left">' + fmtLeft(cur.endMin - nMin) + '</span>' +
        '</div></div><button class="nn-jump" aria-label="Go to current activity">↓</button></div>' +
        '<div class="nn-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
    } else {
      /* after lights out, or before the day's first block, it is night — not
         "space between activities" (v5.0.3): say so, and when the day starts */
      const first = day.blocks[0], last = day.blocks[day.blocks.length - 1];
      const before = first && nMin < first.startMin, after = last && nMin >= last.endMin;
      if (before || after) {
        const wake = before ? first : DB.buildDay(DB.addDays(day.iso, 1)).blocks[0];
        html += '<div class="nn-title"><span class="nn-emb" style="color:var(--t2)">' + emblemSVG('moon') + '</span>Night</div>' +
          '<div class="nn-time">' + (wake ? 'Sleep · up at ' + wake.start : 'Sleep') + '</div></div>' +
          '<button class="nn-jump" aria-label="Go to current time">↓</button></div>';
      } else {
        html += '<div class="nn-title">Off the clock</div><div class="nn-time">Space between activities</div></div>' +
          '<button class="nn-jump" aria-label="Go to current time">↓</button></div>' +
          '<div class="nn-bar" aria-hidden="true"><i style="width:0%"></i></div>';
      }
    }
    if (next.length) {
      html += '<div class="nn-next"><span class="nn-label">NEXT</span><span class="t">' + next[0].start + '</span><span>' +
        '<span class="nn-nemb" style="color:' + emblemTone(next[0]) + '">' + emblemSVG(emblemKind(next[0])) + '</span>' + tt(next[0].title) +
        (next[0].run && !new RegExp('\\b' + next[0].run.km + '\\b').test(next[0].title) ? ' <span class="nn-km">· ' + nnKm(next[0].run.km) + '\u00a0km</span>' : '') +
        ' <span class="nn-in">' + fmtIn(next[0].startMin - nMin) + '</span></span></div>';
    } else if (!(day.blocks.length && nMin >= day.blocks[day.blocks.length - 1].endMin)) {
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
    /* The block's totals live on the Plan page's journey; here they are one
       line that leads there (v4.89), over the thirty weeks in miniature. */
    const wrap = el('<section class="journey line"><button class="journey-link" aria-label="Open your training journey: ' + elapsed + ' of ' + block.weeks +
      ' weeks elapsed, ' + p.km.toLocaleString('en-GB',{maximumFractionDigits:1}) + ' km and ' + p.runs + ' runs logged">' +
      '<span class="journey-track" aria-hidden="true">' + segments + '</span>' +
      '<span class="jl-text"><b>' + elapsed + '</b>/' + block.weeks + ' weeks · <b>' + p.km.toLocaleString('en-GB',{maximumFractionDigits:1}) +
      '</b> km · <b>' + p.runs + '</b> runs logged</span><span class="jl-go" aria-hidden="true">↗</span></button></section>');
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
    const lit = state.justLit === iso; state.justLit = null;
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
      '<p class="recap-subtitle">' + tt(day.run ? day.run.title : 'Unplanned run') +
      (r.estimatedKm ? ' · distance from plan' : '') + '</p>' +
      '<div class="recap-metrics"><div><span>TIME</span><b>' + recordTime(r.sec) + '</b></div><div><span>PACE / KM</span><b>' + pace + '</b></div><div><span>AVG HR</span><b>' + hrLabel(r.hr) + '</b></div></div>' +
      /* the session's window, lit now that it is done — flooding in on the save itself (v5.1) */
      (day.run ? sessionShapeHTML(day.run, day.run.run.km, true, { lit: true, lighting: lit }) : '') +
      longRunOverHTML(day, iso, r) +
      awards.map(a => '<article class="recap-award"><span class="recap-seal" aria-hidden="true">✦</span><div><h3>' + esc(a.label) + '</h3><strong>' + esc(a.value) + '</strong><p>' + esc(a.detail) + '</p></div></article>').join('') +
      (report.runCount === 1 ? '<p class="recap-baseline">Your history starts here. Future runs build the comparison.</p>' : '') +
      '<div class="recap-total"><span>Your log so far</span><p><b>' + fmt(report.totalKm) + '</b> km <span>across ' + report.runCount + (report.runCount === 1 ? ' run' : ' runs') + '</span></p>' +
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
    const has = (v) => v != null && v !== '' && v !== 0;
    const longish = (c) => c === 'long' || c === 'race';
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
      field('temp', 'Feels like', d.temp, 'decimal', '°C', true) +
      /* gels and the half-by-half split only mean something on a long run:
         a 5 km easy run is not asked for them (v5.0.1). They show for Long
         or Race, or whenever they already hold a value */
      '<div class="log-when-long"' + (longish(d.cls) || has(d.gels) ? '' : ' hidden') + '>' + field('gels', 'Gels taken', d.gels, 'numeric', 'gels', true) + '</div>' +
      (isMpDay ? '<p class="log-note">Marathon-pace segment: its distance, pace and average HR only. The app places the HR in your zones (§10). A track import fills a “last N @ MP” finish for you.</p>' +
        field('mpKm', 'MP distance', d.mpKm, 'decimal', 'km', true) +
        field('mpPaceSec', 'MP pace', clock(d.mpPaceSec), 'text', '/km', true) +
        field('mpHr', 'MP average HR', d.mpHr, 'numeric', 'bpm', true) :
      '<div class="log-when-long" data-long-only' + (d.cls === 'long' || has(d.halfPaceSec) || has(d.hr2) ? '' : ' hidden') + '>' +
      '<p class="log-note">For a decoupling estimate, enter measured first-half pace and second-half HR. Leave blank if unavailable.</p>' +
      (d.stream ? '<p class="log-note">Half-run analysis uses the imported track when coverage permits. Gaps leave it unavailable.</p>' :
      field('halfPaceSec', 'First-half pace', clock(d.halfPaceSec), 'text', '/km', true) +
      field('hr2', 'Second-half HR', d.hr2, 'numeric', 'bpm', true)) + '</div>') +
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
    wrap.querySelector('.log-class').addEventListener('change', e => {
      d.cls = e.target.value;
      wrap.querySelectorAll('.log-when-long').forEach((g) => {
        const filled = Array.from(g.querySelectorAll('input')).some((i) => i.value.trim() !== '');
        g.hidden = !(filled || (g.hasAttribute('data-long-only') ? d.cls === 'long' : longish(d.cls)));
      });
    });
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
      state.runLogEdit = null; state.runLogDraft = null;
      if (!saved || !(saved.sec > 0)) state.justLit = iso;   // the window floods with light on the first save
      render();
      if (!saved || !(saved.sec > 0)) celebrate(iso, day);   // first save only, never on edits
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
    let exercises = block.cat === 'gym' && block.plan ? dosedPlan(iso, block).filter((p) => !p.off) : [];
    const dialog = el('<dialog class="session-focus' + (exercises.length ? ' is-gym' : '') + (block.run ? ' focus-' + skyKind(block) : '') + '" aria-labelledby="focus-title">' +
      '<div class="focus-shell"><header class="focus-header"><span>SESSION FOCUS</span><button class="focus-back" hidden>← Session brief</button>' +
      '<button class="focus-close" aria-label="Close session focus" autofocus>✕</button></header>' +
      '<div class="focus-scroll"><span class="focus-emb' + (emblemKind(block) === 'laurel' ? ' race' : '') + '" style="--cat:' + (CAT_VAR[block.cat] || CAT_VAR.routine) + '">' + emblemSVG(emblemKind(block)) + '</span>' +
      '<p class="focus-date">' + esc(DAY_NAMES[DB.dayIndex(iso)] + ' · ' + fmtShort(iso)) + '</p>' +
      '<h1 id="focus-title">' + tt(block.title) + '</h1>' +
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
      content.innerHTML = '<div class="focus-ex-progress" aria-hidden="true">' + exercises.map((_, n) => '<i class="' + (n === i ? 'selected' : n < i ? 'past' : '') + '"></i>').join('') + '</div>' +
        /* the exercise's number, huge and outlined behind its name (v4.79.1) */
        '<span class="focus-ex-num" aria-hidden="true">' + roman(i + 1) + '</span>' +
        '<p class="focus-eyebrow">EXERCISE ' + (i + 1) + ' / ' + exercises.length + '</p>' +
        '<h2 class="focus-ex-name" tabindex="-1">' + esc(p.ex) + '</h2><p class="focus-sets">' + esc(p.sets) + (p.halved ? ' <em class="dose-tag">halved</em>' : '') + '</p>' +
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
      /* a session with leg work offers the three-tier rule as a choice
         rather than three paragraphs to apply in your head (v5.0) */
      const tiers = legTiers(block), cur = legDose(iso, block);
      const intro = el('<div class="focus-brief"><p>' + esc(withZones(brief.intro)) + '</p>' +
        (tiers.length
          ? '<fieldset class="dose"><legend>Leg dose today</legend>' + tiers.map((t) =>
              '<label class="dose-opt d-' + t.id + '"><input type="radio" name="dose" value="' + t.id + '"' + (t.id === cur ? ' checked' : '') + '>' +
              '<span><b>' + esc(t.label) + '</b><small>' + esc(t.rule) + '</small></span></label>').join('') + '</fieldset>'
          : brief.rules.map(s => '<p class="focus-rule">' + esc(withZones(s)) + '</p>').join('')) +
        '<button class="focus-jump">Go to exercises ↓</button></div>');
      intro.querySelectorAll('input[name="dose"]').forEach((r) => r.addEventListener('change', () => {
        setLegDose(iso, block.id, r.value);
        exercises = dosedPlan(iso, block).filter((p) => !p.off);
        focusedSession.index = 0;
        paintExercise(false);
      }));
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
        '<div class="focus-shoe t-' + shoeTier(block.run.shoe) + '"><span>SHOE</span><strong><i class="h-shoe-e">' + emblemSVG(shoeTier(block.run.shoe) === 'race' ? 'laurel' : 'foot') + '</i>' + esc(block.run.shoe) + '</strong></div>' +
        /* the heart rate the run is prescribed by, from the zone model and
           the athlete's own zones when set (v4.90) */
        (() => { const c = DB.runClass(block), mp = /@\s*MP/.test(block.title);
          const z = c === 'race' ? null : c === 'long' ? (mp ? 'Z2 · MP in Z3' : 'Z2') : c === 'quality' ? (mp ? 'Z3' : 'Z4') : c === 'recovery' ? 'Z1' : 'Z2';
          return z ? '<div class="focus-hr"><span>HEART RATE</span><strong>' + esc(withZones(z)) + '</strong></div>' : ''; })() +
        '</div>' + sessionShapeHTML(block, block.run.km, false, { lit: !!getDone(iso)[block.id] || (getRunLogEntry(iso) || {}).sec > 0 }) +
        (block.run.gelsAt && block.run.gelsAt.length ? '<div class="focus-gels"><span>GELS · ' + block.run.gelsAt.length + '</span><div class="g-times">' +
          block.run.gelsAt.map((m, k) => '<i><small>' + roman(k + 1) + '</small>' + DB.fmtHM((block.startMin + m) % 1440) + '</i>').join('') + '</div></div>' : '') +
        runSkyHTML(iso, block, skyKind(block), 'f', iso === todayISO() ? nowMin() : null) +
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
    /* The morning's question belongs to the morning (v4.87): after noon an
       unanswered prompt shrinks to one quiet line instead of pushing the
       run's numbers down the card for the rest of the day. */
    if (bpm == null) return nowMin() < 12 * 60 || iso !== todayISO()
      ? '<button class="h-rhr add" data-rhr="open">Add this morning’s resting HR <small>optional · compares it with your usual</small></button>'
      : '<button class="h-rhr add mini" data-rhr="open">+ Morning resting HR <small>optional</small></button>';
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

  /* The run card names its own day (v4.87): it said "TODAY'S RUN" on
     every date, including tomorrow's and last Tuesday's. */
  function runDayLabel(iso) {
    const t = todayISO();
    if (iso === t) return 'TODAY’S RUN';
    if (iso === DB.addDays(t, 1)) return 'TOMORROW’S RUN';
    if (iso === DB.addDays(t, -1)) return 'YESTERDAY’S RUN';
    return DAY_NAMES[DB.dayIndex(iso)].toUpperCase() + '’S RUN';
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
    let detail = r.detail.startsWith(prefix) ? r.detail.slice(prefix.length) : r.detail;
    if (detail.startsWith(r.run.shoe + ' · ')) detail = detail.slice(r.run.shoe.length + 3);

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
    /* rule 4: the rate as today's schedule, in clock times (v5.0.6) */
    const gAt = r.run.gelsAt;
    const gelCell = gAt && gAt.length ? '<span class="h-mp h-gels"><b>GELS · ' + gAt.length + '</b><span class="g-times">' +
      gAt.map((m, k) => '<i><small>' + roman(k + 1) + '</small>' + DB.fmtHM((r.startMin + m) % 1440) + '</i>').join('') + '</span></span>' : '';

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

    /* Red-letter days: a Book of Hours printed its feasts in red, which is
       where the phrase comes from. The block's key days are its feasts. */
    const redLetter = !isRace && !r.movedFrom && (PLAN.keyEvents || []).some((k) =>
      DB.addDays(PLAN.blocks[0].start, (k.wk - 1) * 7 + k.di) === iso);
    const hero = el(
      '<section class="hero cls-' + esc(DB.runClass(r)) + (isRace ? ' race' : '') + (redLetter ? ' red-letter' : '') + (isDone ? ' done' : '') + (isSkipped ? ' skipped' : '') + (just === r.id ? ' just' : '') + '">' +
      '<i class="h-art" aria-hidden="true"></i>' +
      '<div class="h-top"><div class="h-tag"><span class="h-mark">' + emblemSVG(emblemKind(r)) +
      '<span class="h-tagtxt">' + (isRace ? 'RACE DAY' : redLetter ? 'RED-LETTER DAY' : runDayLabel(iso)) + '</span></span>' +
      '<span class="h-state">' + (isDone ? 'Completed' : logged ? 'Run logged' : isSkipped ? 'Skipped' : isMovedOut ? 'Moved to ' + movedLabel(iso, r.id) :
        unresolved ? (iso < today ? 'Not recorded' : 'Window passed · not recorded') :
        (r.movedFrom ? 'Moved from ' + fmtShort(r.movedFrom) + ' · ' : 'Scheduled · ') + r.start) + '</span></div>' +
      /* A saved log already counts as done everywhere else (week status,
         totals, the wall), so a logged run shows that instead of offering a
         tick that would change nothing. */
      (e.sec > 0 && !isDone ? '<span class="h-tick on is-logged" role="status"><span aria-hidden="true">✓</span> Logged</span>'
        /* an unresolved run asks "did it happen?" with its own "ran as
           planned" — a second Mark done in the corner said the same (v4.95) */
        : (iso > today || unresolved) && !isDone ? ''
        : '<button class="h-tick' + (isDone ? ' on' : '') + '" aria-pressed="' + isDone + '" aria-label="' +
      (isDone ? 'Mark run not done' : 'Mark run done') + '"><span aria-hidden="true">✓</span> ' + (isDone ? 'Done' : 'Mark done') + '</button>') + '</div>' +
      (just === r.id && isDone ? '<i class="h-sweep" aria-hidden="true"></i><div class="completion-note" role="status">✓ Run banked</div>' : '') +
      missedHTML +
      /* not on race morning: nerves lift the reading and the call is made (v5.0.1) */
      (iso === today && !isRace && !isDone && !(e.sec > 0) && !isSkipped && !isMovedOut ? readinessHTML(iso) : '') +
      '<div class="h-row"><div class="h-km">' + kmTxt + '<small>km</small></div>' +
      '<div class="h-session">' + tt(r.title) + '</div></div>' +
      '<div class="h-meta"><span class="h-shoe t-' + shoeTier(r.run.shoe) + '"><b>SHOE</b><i class="h-shoe-e">' + emblemSVG(shoeTier(r.run.shoe) === 'race' ? 'laurel' : 'foot') + '</i>' + esc(r.run.shoe) + '</span>' + paceCell +
      '<span><b>WINDOW</b>' + r.start + '–' + r.end + '</span>' + mpCell + gelCell + '</div>' +
      sessionShapeHTML(r, km, true, { lit: isDone || e.sec > 0, lighting: just === r.id && isDone }) +
      runSkyHTML(iso, r, skyKind(r), 'h', iso === today ? nowMin() : null) +
      '<div class="h-detail">' + detailHTML(detail, iso + '|hero', false) + '</div>' +
      zonePrompt +
      (longRunGuard(iso, day) || '') +
      '<button class="session-focus-open" data-focus-id="' + esc(r.id) + '">Focus session <span aria-hidden="true">↗</span></button>' +
      paceTableHTML(r.table) +
      '</section>'
    );
    const tickBtn = hero.querySelector('button.h-tick');
    if (tickBtn) tickBtn.addEventListener('click', () => {
      const ticking = !done[r.id];
      if (ticking) state.justTicked = r.id;   // animate on tick-on only
      if (ticking && isSkipped) setSkip(iso, r.id, false);   // done wins over skipped
      toggleDone(iso, r.id);
      render();
      if (ticking && isRace && /MARATHON/.test(r.title) && !(e.sec > 0)) celebrate(iso, day);
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
      top.querySelector('.h-tagtxt').textContent = 'RUN LOGGED';
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

  /* A shareable poster rendered entirely on this device, from live tokens,
     in the run card's own light (v4.70): a stage light by class of run (red
     only when it was hard, §3), the days to the gun on that date as a giant
     outlined numeral, the distance as the headline, the block as a progress
     bar, and film grain over the lot. */
  function shareRunCard(day, iso) {
    const report = window.RunProgress.debrief(runLogHistory(), iso, todayISO());
    if (!report) return;
    const e = report.current;
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(() => {
      const styles = getComputedStyle(document.documentElement);
      const token = name => styles.getPropertyValue(name).trim();
      const rgba = (hex, a) => {
        const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
        return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
      };
      const ink = token('--paper'), text = token('--text'), muted = token('--t2'), faint = token('--t3');
      const line = token('--line'), red = token('--accent'), redFill = token('--accent-fill');
      const W = 1080, H = 1350, L = 72, R = 1008;
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const x = canvas.getContext('2d');
      const display = '"Archivo", sans-serif', mono = '"Space Mono", monospace', body = '"Inter", sans-serif';
      const write = (value, px, family, weight, left, top, color) => {
        x.font = weight + ' ' + px + 'px ' + family; x.fillStyle = color || text; x.fillText(String(value), left, top);
      };
      const cls = day.run ? DB.runClass(day.run) : 'easy';
      const hard = cls === 'quality' || cls === 'race';
      const glow = hard ? redFill : text;

      // ground and stage light
      x.fillStyle = ink; x.fillRect(0, 0, W, H);
      const light = (cx, cy, r, color) => {
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, color); g.addColorStop(1, rgba(ink, 0));
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      };
      light(W, 0, 950, hard ? rgba(redFill, .5) : cls === 'long' ? rgba(text, .17) : rgba(text, .08));
      if (hard) light(0, H, 760, rgba(redFill, .2));

      // the countdown on the day of the run, huge and outlined
      const cd = DB.raceCountdown(iso);
      if (day.blockId === 'marathon' && cd.days > 0) {
        x.font = '900 430px ' + display; x.textAlign = 'right'; x.lineWidth = 3.5;
        x.strokeStyle = hard ? rgba(red, .32) : rgba(text, .11);
        x.strokeText(String(cd.days), W + 24, 530);
        x.textAlign = 'left';
      }

      write('WEEK', 52, display, 900, L, 125);
      write('OS', 52, display, 900, L + x.measureText('WEEK').width, 125, red);
      x.textAlign = 'right'; write('RUN ' + String(report.runCount).padStart(2, '0'), 28, mono, 400, R, 118, muted); x.textAlign = 'left';
      write(fmtDate(iso), 30, body, 400, L, 200, muted);

      // the distance: gradient-lit, with its own glow
      const km = loggedDistance(e.km);
      let size = 290;
      while (measure(x, '900 ' + size + 'px ' + display, km) > 800 && size > 100) size -= 4;
      const shade = x.createLinearGradient(0, 500 - size * 0.72, 0, 500);
      shade.addColorStop(0, text); shade.addColorStop(1, rgba(text, .7));
      x.save(); x.shadowColor = rgba(glow, hard ? .5 : .2); x.shadowBlur = 70;
      x.font = '900 ' + size + 'px ' + display; x.fillStyle = shade; x.fillText(km, L - 10, 500);
      x.restore();
      x.font = '900 ' + size + 'px ' + display;
      const numberWidth = x.measureText(km).width;
      write('km', 58, mono, 400, L + 8 + numberWidth, 500, muted);
      write(e.estimatedKm ? 'Distance from plan' : 'Logged distance', 25, body, 400, L, 556, muted);
      x.font = '800 50px ' + display; x.fillStyle = text;
      wrapText(x, day.run ? day.run.title : 'Unplanned run', L, 640, 900, 58);

      x.strokeStyle = line; x.lineWidth = 2; x.beginPath(); x.moveTo(L, 790); x.lineTo(R, 790); x.stroke();
      const values = [['TIME', recordTime(e.sec)], ['PACE / KM', DB.paceOf(e.km, e.sec)], ['AVG HR', e.hr || '—']];
      values.forEach((v, i) => { write(v[0], 22, mono, 400, L + i * 320, 845, muted); write(v[1], 44, mono, 400, L + i * 320, 914); });

      const label = report.best ? 'Fastest logged ' + km + ' km' : report.longest ? 'Longest logged run' : report.milestone ? report.milestone + ' km milestone' : 'Your log, to this run';
      const detail = report.best ? recordTime(report.best.gainSec) + ' quicker than your previous best' : report.longest ? '+' + loggedDistance(Number(report.longest.gainKm.toPrecision(12))) + ' km beyond your previous longest' : loggedDistance(report.totalKm) + ' km across ' + report.runCount + ' saved runs';
      write(label, 38, display, 800, L, 1012);
      write(detail, 27, body, 400, L, 1060, muted);

      // the block as a progress bar, lit at the leading edge
      if (day.blockId === 'marathon') {
        const weeks = (PLAN.blocks[0] && PLAN.blocks[0].weeks) || 30, frac = Math.min(1, day.week / weeks);
        write('WEEK ' + day.week + ' OF ' + weeks, 22, mono, 400, L, 1150, muted);
        x.textAlign = 'right';
        write(cd.days > 0 ? cd.days + (cd.days === 1 ? ' DAY' : ' DAYS') + ' TO THE GUN' : 'RACE DAY', 22, mono, 400, R, 1150, cd.days > 0 ? muted : red);
        x.textAlign = 'left';
        const bx = L, by = 1178, bw = R - L, end = bx + bw * frac;
        x.fillStyle = line; x.beginPath(); x.roundRect(bx, by, bw, 6, 3); x.fill();
        x.save(); x.shadowColor = rgba(redFill, .7); x.shadowBlur = 18;
        x.fillStyle = red; x.beginPath(); x.roundRect(bx, by, Math.max(6, end - bx), 6, 3); x.fill();
        x.beginPath(); x.arc(end, by + 3, 12, 0, Math.PI * 2); x.fill();
        x.restore();
      }

      write('THAT’S IN THE BANK.', 36, display, 900, L, 1262);
      x.textAlign = 'right';
      write((String(PLAN.race.city).split(',')[0] + ' · ' + fmtShort(PLAN.race.date)).toUpperCase(), 22, mono, 400, R, 1258, faint);
      x.textAlign = 'left';
      write('Whole-run log · ' + iso + (report.estimatedCount ? ' · includes plan-distance estimates' : ''), 20, body, 400, L, 1308, faint);

      // film grain over everything, as on the card
      const grain = document.createElement('canvas'); grain.width = grain.height = 180;
      const gx = grain.getContext('2d'), img = gx.createImageData(180, 180);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.random() * 20;
      }
      gx.putImageData(img, 0, 0);
      x.fillStyle = x.createPattern(grain, 'repeat'); x.fillRect(0, 0, W, H);

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

  /* ---- the wax seal (v4.74): a week where every planned run happened ----
     Each planned run recorded at a real share of its distance
     (shapeRule.shortPct); a dropped Saturday buffer is rule 10, not a miss.
     Only for weeks that have ended or whose runs are all done. */
  function weekSealed(anchor) {
    const d0 = DB.buildDay(anchor);
    if (d0.blockId !== 'marathon') return false;
    const r = PLAN.shapeRule || {}, exempt = r.shortExempt || [], today = todayISO();
    let runs = 0;
    for (let i = 0; i < 7; i++) {
      const iso = DB.addDays(anchor, i), day = DB.buildDay(iso);
      if (!day.run) continue;
      if (i === 5 && exempt.includes('sat')) continue;
      const plan = day.run.run.km, got = iso <= today ? DB.recordedKm(day, getDone(iso), getRunLogEntry(iso)) : 0;
      if (!(got >= plan * (r.shortPct || 0.6))) return false;
      runs++;
    }
    return runs > 0;
  }
  function sealHTML(week) {
    const legend = (PLAN.hours && PLAN.hours.seal) || '';
    // a wax edge: a circle pushed in and out a little, the same way every time
    let edge = '';
    for (let k = 0; k <= 36; k++) {
      const a = (k / 36) * Math.PI * 2, rr = 44 + (k % 3 === 0 ? 2.4 : k % 2 ? -1.2 : 0.6);
      edge += (k ? ' L' : 'M') + (50 + rr * Math.cos(a)).toFixed(1) + ' ' + (50 + rr * Math.sin(a)).toFixed(1);
    }
    return '<span class="seal" role="img" aria-label="Week ' + week + ' sealed: every planned run happened">' +
      '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="sl-wax" d="' + edge + ' Z"/>' +
      '<circle class="sl-ring" cx="50" cy="50" r="35"/><circle class="sl-ring" cx="50" cy="50" r="24"/>' +
      '<path id="sl-arc-' + week + '" d="M50 20 A30 30 0 1 1 49.9 20" fill="none"/>' +
      '<text class="sl-legend"><textPath href="#sl-arc-' + week + '" textLength="186" lengthAdjust="spacing">' + esc(legend.toUpperCase().replace(/U/g, 'V')) + ' · ' + roman(week) + ' ·</textPath></text>' +
      '<text class="sl-num" x="50" y="58">' + roman(week) + '</text></svg></span>';
  }

  /* ---- "Previously": Monday opens with last week in one card ----
     Planned against recorded, day by day, drawn as ghost bars (the plan)
     with the recorded distance filled in, in the distance profile's
     colours (red hard, white long, grey easy). Honest both ways: a full
     week says so, a missed long run says so. Mondays only, marathon weeks
     only, plus the Monday after race week. */
  function buildPreviously(iso, day) {
    if (day.dayIndex !== 0) return null;
    const anchor = DB.addDays(iso, -7), d0 = DB.buildDay(anchor);
    if (d0.blockId !== 'marathon') return null;
    const fmt = (n) => String(Math.round(n * 10) / 10);
    let planned = 0, recorded = 0, runs = 0, ran = 0, extra = 0, top = 1;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const di = DB.addDays(anchor, i), dd = DB.buildDay(di);
      const plan = dd.run ? dd.run.run.km : 0;
      const got = DB.recordedKm(dd, getDone(di), getRunLogEntry(di));
      planned += plan; recorded += got; top = Math.max(top, plan, got);
      if (plan) { runs++; if (got > 0) ran++; } else if (got > 0) extra++;
      const cls = dd.run ? DB.runClass(dd.run) : 'rest';
      days.push({ plan, got, kind: cls === 'quality' || cls === 'race' ? 'hard' : cls === 'long' ? 'long' : 'easy', cls });
    }
    const last = days[6];
    const lrName = last.cls === 'race' ? 'the race' : 'long run';
    const lrLine = !last.plan ? '' : last.got >= last.plan * 0.9 ? lrName + ' banked'
      : last.got > 0 ? lrName + ' ' + fmt(last.got) + ' of ' + last.plan + ' km' : lrName + ' not recorded';
    const all = runs && ran === runs && recorded >= planned * 0.9;
    // A dropped Saturday buffer is rule 10 working, not a miss (PLAN.shapeRule).
    const exempt = ((PLAN.shapeRule && PLAN.shapeRule.shortExempt) || []).includes('sat');
    const bars = days.map((d, i) =>
      '<span class="pv-day ' + d.kind + (d.plan && !d.got && !(exempt && i === 5) ? ' miss' : '') + '"><span class="pv-track">' +
      (d.plan ? '<i class="pv-plan" style="height:' + (d.plan / top * 100).toFixed(1) + '%"></i>' : '') +
      (d.got ? '<i class="pv-got" style="height:' + (Math.min(d.got, top) / top * 100).toFixed(1) + '%"></i>' : '') +
      '</span><b>' + DAY_SHORT[i].slice(0, 1) + '</b></span>').join('');
    const card = el('<section class="previously' + (all ? ' full' : '') + '" aria-label="Last week">' +
      (weekSealed(anchor) ? sealHTML(d0.week) : '<span class="pv-num" aria-hidden="true">' + roman(d0.week) + '</span>') +
      '<div class="pv-kicker">PREVIOUSLY · WEEK ' + d0.week + '</div>' +
      '<div class="pv-km"><b>' + fmt(recorded) + '</b> of ' + fmt(planned) + ' km</div>' +
      /* a run on an unplanned day counts in the km, so the tally says so (v5.0.11) */
      '<div class="pv-line">' + ran + ' of ' + runs + ' runs' + (extra ? ' + ' + extra + ' extra' : '') + ' · ' +
      (all ? '<em>every run banked</em>' : esc(lrLine)) + '</div>' +
      '<div class="pv-bars" aria-hidden="true">' + bars + '</div>' +
      '<button class="pv-open">Open week ' + d0.week + ' <span aria-hidden="true">↗</span></button></section>');
    card.querySelector('.pv-open').addEventListener('click', () => {
      state.view = 'week'; state.weekAnchor = anchor; window.scrollTo(0, 0); render();
    });
    return card;
  }

  /* ---- the day wheel (v4.72): today as a 24-hour dial ----
     Midnight at the top. The scaffold (quiet blocks) is a thin inner ring;
     the sessions are the thick outer ring in their category colours, the run
     lit white when it is the long run and red when it is hard (§3). What is
     done burns bright, what is pending sits dim, what is skipped or moved is
     dashed. The night between lights out and waking is a dark band with a
     few stars, and on today a red hand points at NOW. The centre counts the
     day's sessions done. A picture with a spoken summary, not a control. */
  function roman(n) {
    let out = '', v = Math.floor(n);
    [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
      .forEach(([k, r]) => { while (v >= k) { out += r; v -= k; } });
    return out;
  }
  /* The day's motto from PLAN.hours: the marathon and the two post-race
     blocks are their own thing, otherwise the phase's. */
  function mottoFor(day) {
    const m = PLAN.hours && PLAN.hours.mottos;
    if (!m) return null;
    if (day.run && DB.runClass(day.run) === 'race' && /MARATHON/.test(day.run.title)) return m.race;
    if (day.blockId === 'recovery') return m.recovery;
    if (day.blockId !== 'marathon') return m.standing;
    return m[day.phase] || null;
  }
  /* A red-letter feast that falls on this date (PLAN.hours.feasts). */
  function feastOn(iso) {
    return ((PLAN.hours && PLAN.hours.feasts) || {})[iso.slice(5)] || '';
  }
  /* The moon at a phase (DB.moonPhase): the lit limb and the terminator
     ellipse, over a dark disc. */
  function moonSVG(cx, cy, r, mp, cls) {
    const p = mp.phase, rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
    const limb = mp.waxing ? 1 : 0, term = mp.waxing ? (p < 0.25 ? 0 : 1) : (p < 0.75 ? 0 : 1);
    const top = cx.toFixed(1) + ' ' + (cy - r).toFixed(1), bot = cx.toFixed(1) + ' ' + (cy + r).toFixed(1);
    return '<g class="' + cls + '"><circle class="mo-dark" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r + '"/>' +
      (mp.lit > 0.02 ? '<path class="mo-lit" d="M' + top + ' A' + r + ' ' + r + ' 0 0 ' + limb + ' ' + bot + ' A' + rx.toFixed(2) + ' ' + r + ' 0 0 ' + term + ' ' + top + ' Z"/>' : '') + '</g>';
  }
  /* A deterministic 0–1 value per key for the art: FNV-1a, then a murmur
     finaliser, because keys that differ only in their last character must
     still land far apart (stars clumped into strokes without it). */
  function artSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  /* The clock's geometry (v4.91): a 360-unit square, midnight at the top. */
  const WHEEL_C = 180;
  function wheelPt(m, r) {
    const a = (m / 1440) * 2 * Math.PI - Math.PI / 2;
    return [WHEEL_C + r * Math.cos(a), WHEEL_C + r * Math.sin(a)];
  }
  /* The hand is drawn pointing at midnight and turned to the minute, so a
     new minute is a rotation the browser can ease, not a redraw. Its form
     is Breguet's: a fine shaft, a hollow moon ring that frames the sky at
     this moment, and a tapered point on the minute track. */
  function handAngle(n) { return (n / 1440) * 360; }
  function handSVG() {
    const C = WHEEL_C;
    return '<path class="dw-hand" d="M' + C + ' ' + (C - 60) + ' L' + C + ' ' + (C - 112.5) + ' M' + C + ' ' + (C - 125.5) + ' L' + C + ' ' + (C - 128) + '"/>' +
      '<circle class="dw-pomme" cx="' + C + '" cy="' + (C - 119) + '" r="6.5"/>' +
      '<path class="dw-point" d="M' + (C - 1.6) + ' ' + (C - 128) + ' L' + C + ' ' + (C - 156) + ' L' + (C + 1.6) + ' ' + (C - 128) + ' Z"/>';
  }
  /* ' · <place> time' while the sky is drawn from the race trip (PLAN.sky.away) */
  function placeTime(place) {
    return place && place.away && place.name ? '\u00a0· ' + place.name + ' time' : '';
  }

  /* ---- the run against the sky (v4.76) ----
     A ribbon of the real sky across the run's window, from the same almanac
     as the clock: night, twilight and day for the date and place, the sun
     on the horizon where it rises or sets, stars in the dark, the moon when
     it is up, and the run drawn across it in its own colour. The line
     underneath says what the light means for the run. */
  function runSkyLine(rs) {
    let s;
    if (rs.state === 'dark') s = 'dark the whole way';
    else if (rs.morning) {
      s = rs.state === 'light'
        ? (rs.margin <= 2 ? 'out as it rises' : rs.margin < 30 ? 'out ' + rs.margin + ' min after it' : 'daylight all the way')
        : (rs.startLight === 'twi' ? 'starts in the twilight' : 'starts in the dark') + (rs.lightKm ? ', sun up by km\u00a0' + rs.lightKm : '');
    } else {
      s = rs.state === 'light'
        ? (rs.margin <= 2 ? 'back as it sets' : rs.margin < 60 ? 'back ' + rs.margin + ' min before it' : 'daylight all the way')
        : (rs.startLight === 'day' ? 'into the dusk' : 'starts in the dusk') + (rs.darkKm ? ', dark by km\u00a0' + rs.darkKm : '');
    }
    return (rs.morning ? 'Sunrise ' : 'Sunset ') + DB.fmtHM(rs.event) + '\u00a0· ' + s + placeTime(rs.place);
  }
  /* how bright to paint the sky at a minute: the twilight ramp, plus the
     sun's height — brightest at solar noon, so a day is a curve, not a slab */
  function skyGlow(st, m) {
    const L = DB.lightLevel(st, m);
    const h = st && st.rise != null && st.set != null && m > st.rise && m < st.set ? Math.sin(Math.PI * (m - st.rise) / (st.set - st.rise)) : 0;
    return 0.02 + 0.15 * L + 0.17 * h;
  }
  /* ---- the sun's arc over the run (v4.77.2) ----
     Redrawn after the user's note that the ribbon "just doesn't look
     great": a flat grey box with a bar floating in it read as a progress
     bar, not a sky. Now it is the day's real sun: its arc from sunrise to
     sunset (height from DB.sunAltitude, on one scale for the whole year,
     so a December sun barely clears the horizon), a faint dome of daylight
     under it, the times where it meets the horizon, stars and the moon only
     in the dark. The run is lit on the arc at its own time and in its own
     colour (red hard, white long); a run in the dark sits on the dotted
     part below the horizon. On today, the sun itself rides the arc. */
  const RS_W = 320, RS_TOP = 6, RS_HZ = 44, RS_FLOOR = 8;
  /* the run's colour on the ribbon: red when hard, white when long (§3) */
  function skyKind(run) {
    const c = DB.runClass(run);
    return c === 'race' ? 'race' : c === 'quality' ? 'hard' : c === 'long' ? 'long' : 'easy';
  }
  function runSkyGeom(iso, rs, a, b) {
    const X = (m) => ((m - a) / (b - a)) * RS_W;
    const alt = (m) => DB.sunAltitude(iso, rs.place.lat, rs.st, m);
    const noonAlt = alt((rs.st.rise + rs.st.set) / 2);
    const kY = (RS_HZ - RS_TOP - 4) / Math.max(noonAlt, 40);
    const Y = (m) => { const h = alt(m); return h >= 0 ? RS_HZ - h * kY : Math.min(RS_HZ + RS_FLOOR, RS_HZ - h * kY * 0.6); };
    return { X, Y, alt, kY };
  }
  /* A shoe's tier, from the plan's own shoe list (v4.90): the run's shoe
     is matched by the end of a listed shoe's name ("Evo SL" of "Adidas Evo
     SL"), and its job says the tier — race red, quality white, easy grey. */
  function shoeTier(name) {
    const str = String(name || '');
    const s = PLAN.shoes.find((x) => { const w = x.shoe.split(' '); for (let k = 1; k <= w.length; k++) if (str.startsWith(w.slice(-k).join(' '))) return true; return false; });
    return !s ? 'easy' : /race/i.test(s.job) ? 'race' : /quality|MP/i.test(s.job) ? 'quality' : 'easy';
  }

  /* The session's shape (v4.90), drawn only from what the plan states.
     A quality run: the warm-up and every rep to one scale in minutes, the
     jogs between reps as dots because the plan does not set their length,
     and the rest of the window easy. A long run with marathon pace: its
     kilometres to scale, easy in white and the MP stretch in red, a range
     ("last 14–16") drawn solid for the certain part and faint for the
     rest. Anything the title does not describe gets no bar at all. */
  function sessionShapeHTML(r, kmTotal, quiet, opts) {
    opts = opts || {};
    const t = String(r.title || ''), d = String(r.detail || '');
    const cls = DB.runClass(r);
    const fmt = (n) => (n === Math.round(n) ? String(n) : n.toFixed(1));
    const segs = [];
    let cap = '', kind = '';
    if (cls === 'quality') {
      const rep = t.match(/(\d+)\s*[×x]\s*(\d+)\s*min/) || (t.match(/Tempo\s+(\d+)\s*min/) ? [null, '1', t.match(/Tempo\s+(\d+)\s*min/)[1]] : null);
      if (!rep) return '';
      const n = Number(rep[1]), min = Number(rep[2]);
      const wuM = d.match(/warm up (\d+) min/i), wu = wuM ? Number(wuM[1]) : 0;
      const zone = /@\s*MP/.test(t) ? 'MP' : 'Z4';
      const rest = Math.max(0, (r.endMin - r.startMin) - wu - n * min);
      if (wu) segs.push({ k: 'easy', u: wu });
      for (let j = 0; j < n; j++) { if (j) segs.push({ k: 'jog' }); segs.push({ k: 'hard', u: min }); }
      if (rest > 0) segs.push({ k: 'easy', u: rest });
      cap = (wu ? wu + '′ easy · ' : '') + (n > 1 ? n + ' × ' + min + '′ ' + zone + ', jog between' : min + '′ ' + zone) + ' · easy to ' + fmt(kmTotal) + '\u00a0km';
      kind = 'q';
    } else {
      const mp = DB.mpShape(t, kmTotal);
      if (!mp) return '';
      if (mp.kind === 'tail') {
        const firm = kmTotal - mp.fromLate + 1, soft = mp.fromLate - mp.from;
        segs.push({ k: 'long', u: mp.from - 1 });
        if (soft) segs.push({ k: 'mp soft', u: soft });
        segs.push({ k: 'mp', u: firm });
        cap = 'km 1–' + (mp.from - 1) + ' easy · ' + (soft ? 'MP from km ' + mp.from + '–' + mp.fromLate : 'km ' + mp.from + '–' + fmt(kmTotal) + ' at MP') + ' ' + mp.pace;
      } else if (mp.kind === 'block') {
        const side = (kmTotal - mp.hi) / 2, soft = mp.hi - mp.lo;
        segs.push({ k: 'long', u: side });
        if (soft) segs.push({ k: 'mp soft', u: soft / 2 });
        segs.push({ k: 'mp', u: mp.lo });
        if (soft) segs.push({ k: 'mp soft', u: soft / 2 });
        segs.push({ k: 'long', u: side });
        cap = (mp.lo === mp.hi ? mp.lo : mp.lo + '–' + mp.hi) + ' km at MP ' + mp.pace + ', mid-run';
      } else {
        const easy = (kmTotal - mp.reps * mp.repKm) / (mp.reps + 1);
        if (!(easy > 0)) return '';
        for (let j = 0; j < mp.reps; j++) segs.push({ k: 'long', u: easy }, { k: 'mp', u: mp.repKm });
        segs.push({ k: 'long', u: easy });
        cap = mp.reps + ' × ' + mp.repKm + ' km at MP ' + mp.pace + ' within ' + fmt(kmTotal) + ', spacing yours';
      }
      kind = 'l';
      quiet = quiet && !opts.caption;   // on the run card the MP line above already says this in words
    }
    return '<figure class="sess-shape ' + kind + '" role="img" aria-label="' + esc('Session shape: ' + cap) + '">' +
      glassWindowHTML(segs, opts) + (quiet && kind === 'l' ? '' : '<figcaption>' + esc(cap) + '</figcaption>') + '</figure>';
  }

  /* The session as a stained-glass window (v5.1): a row of lancets with
     stone mullions, each segment glazed in its class — easy grey, long
     white, the hard reps and marathon pace in red glass, an uncertain
     range ("last 14–16") half-glazed. A jog of unstated length is a stone
     pier with an oculus. Before the run the glass is dark, with nothing
     behind it; once the run is done the light comes through, and on the
     moment it is done it floods in pane by pane, left to right, once. */
  let glassSeq = 0;
  function glassWindowHTML(segs, opts) {
    const id = 'sg' + (++glassSeq);
    const W = 320, H = 62, TOP = 3, B = H - 8, GAP = 2.2, JOG = 9;
    const jogs = segs.filter((g) => g.k === 'jog').length;
    const U = segs.reduce((n, g) => n + (g.u || 0), 0);
    if (!(U > 0)) return '';
    const scale0 = (W - jogs * JOG) / U;
    segs.forEach((g) => { if (g.k !== 'jog') g.n = Math.max(1, Math.round(g.u * scale0 / 11)); });
    const panes = segs.reduce((n, g) => n + (g.n || 0), 0);
    const scale = (W - jogs * JOG - (panes - 1 - jogs) * GAP) / U;
    const f = (v) => v.toFixed(2);
    let x = 0, k = 0, body = '', prevJog = true;
    segs.forEach((g) => {
      if (g.k === 'jog') {
        body += '<g class="ss-jog"><rect class="sg-pier" x="' + f(x + 1.5) + '" y="' + (TOP + 10) + '" width="' + f(JOG - 3) + '" height="' + (B - TOP - 10) + '" rx="1"/>' +
          '<circle class="sg-oculus" cx="' + f(x + JOG / 2) + '" cy="' + (TOP + 5) + '" r="2.6"/></g>';
        x += JOG; prevJog = true; return;
      }
      if (!prevJog) x += GAP;
      const w = g.u * scale / g.n;
      let glass = '';
      for (let j = 0; j < g.n; j++) {
        if (j) x += GAP;
        const s = TOP + 0.866 * w;
        const dd = 'M' + f(x) + ' ' + B + ' L' + f(x) + ' ' + f(s) + ' A' + f(w) + ' ' + f(w) + ' 0 0 1 ' + f(x + w / 2) + ' ' + TOP +
          ' A' + f(w) + ' ' + f(w) + ' 0 0 1 ' + f(x + w) + ' ' + f(s) + ' L' + f(x + w) + ' ' + B + ' Z';
        glass += '<path class="sg-pane" style="--k:' + (k++) + '" d="' + dd + '"/><path class="sg-quarry" d="' + dd + '" fill="url(#' + id + 'q)"/>' +
          '<path class="sg-light" d="' + dd + '" fill="url(#' + id + 'l)"/>';
        x += w;
      }
      body += '<g class="ss-seg ' + g.k + '"' + (/hard|mp/.test(g.k) && !/soft/.test(g.k) && opts.lit ? ' filter="url(#' + id + 'g)"' : '') + '>' + glass + '</g>';
      prevJog = false;
    });
    return '<svg class="sg' + (opts.lit ? ' lit' : '') + (opts.lit && opts.lighting ? ' lighting' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<defs><pattern id="' + id + 'q" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V5 M0 0 H5"/></pattern>' +
      '<linearGradient id="' + id + 'l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sg-l0"/><stop offset=".55" class="sg-l1"/></linearGradient>' +
      '<filter id="' + id + 'g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      body + '<rect class="sg-sill" x="0" y="' + (B + 1.5) + '" width="' + W + '" height="3" rx="1.5"/></svg>';
  }

  function runSkyHTML(iso, run, cls, key, nowAt) {
    if (!run || run.startMin == null || !(run.endMin > run.startMin)) return '';
    const rs = DB.runSky(iso, run.startMin, run.endMin, run.run ? run.run.km : 0);
    if (!rs) return '';
    // the whole day of light, and the run, with a margin of night either side
    const a = Math.max(0, Math.min(rs.st.rise, run.startMin) - 90), b = Math.min(1439, Math.max(rs.st.set, run.endMin) + 90);
    const { X, Y, kY } = runSkyGeom(iso, rs, a, b);
    const f1 = (v) => v.toFixed(1);
    const uid = 'rs' + key + iso.replace(/-/g, '');
    const seedOf = (k) => artSeed(iso + ':rs:' + k);
    const pathOf = (from, to, step) => {
      let d = '';
      for (let m = from; ; m += step) { const t = Math.min(m, to); d += (d ? ' L' : 'M') + f1(X(t)) + ' ' + f1(Y(t)); if (t >= to) break; }
      return d;
    };
    const rx = X(rs.st.rise), sxs = X(rs.st.set);
    // night deepens either side of the day, strongest at the horizon
    let stops = '';
    for (let k = 0; k <= 40; k++) {
      const L = DB.lightLevel(rs.st, a + (b - a) * k / 40);
      stops += '<stop offset="' + (k / 40).toFixed(3) + '" class="rs-n" style="stop-opacity:' + (0.45 * (1 - L)).toFixed(3) + '"/>';
    }
    let sky = '<rect x="0" y="0" width="' + RS_W + '" height="' + RS_HZ + '" fill="url(#' + uid + 'g)"/>' +
      '<ellipse class="rs-glow" cx="' + f1(rx) + '" cy="' + RS_HZ + '" rx="46" ry="26" fill="url(#' + uid + 'h)"/>' +
      '<ellipse class="rs-glow" cx="' + f1(sxs) + '" cy="' + RS_HZ + '" rx="46" ry="26" fill="url(#' + uid + 'h)"/>';
    let night = '';
    for (let k = 0; k < 36; k++) {
      const m = a + (b - a) * seedOf(k);
      if (DB.lightLevel(rs.st, m) > 0.12) continue;
      night += '<circle class="rs-star' + (seedOf(k + 't') > 0.6 ? ' tw' : '') + '" style="--d:' + (seedOf(k + 'd') * 4).toFixed(2) +
        's" cx="' + f1(X(m)) + '" cy="' + f1(RS_TOP - 2 + seedOf(k + 'y') * (RS_HZ - RS_TOP - 8)) + '" r="' + (0.45 + seedOf(k + 's') * 0.6).toFixed(2) + '"/>';
    }
    // the moon, at its phase, over the darkest stretch it is up for
    const up = [];
    for (let m = a; m <= b; m += 5) if (DB.lightLevel(rs.st, m) < 0.2 && DB.moonUp(iso, m, rs.place)) up.push(m);
    if (up.length >= 4) night += moonSVG(Math.max(10, Math.min(RS_W - 10, X(up[Math.floor(up.length / 2)]))), RS_TOP + 4, 3.8, DB.moonPhase(iso), 'rs-moon');
    // the dome of daylight under the sun's arc
    const dome = pathOf(rs.st.rise, rs.st.set, 4) + ' Z';
    const arc = pathOf(a, b, 4);
    // where the arc meets the horizon: a tick and the time
    const edge = (x, m) => '<path class="rs-tick" d="M' + f1(x) + ' ' + (RS_HZ - 2) + ' L' + f1(x) + ' ' + (RS_HZ + 3) + '"/>' +
      '<text class="rs-hour" x="' + f1(Math.max(14, Math.min(RS_W - 14, x))) + '" y="' + (RS_HZ + RS_FLOOR + 9) + '">' + DB.fmtHM(m) + '</text>';
    // the run, lit on the arc, with its span marked on the horizon beneath
    const s0 = run.startMin, s1 = run.endMin;
    const runD = pathOf(s0, s1, 2);
    const runX0 = X(s0), runX1 = Math.max(X(s1), X(s0) + 3);
    const short = runX1 - runX0 < 8, mid = (s0 + s1) / 2;
    const runPath = '<path class="rs-curtain" d="' + runD + ' L' + f1(runX1) + ' ' + RS_HZ + ' L' + f1(runX0) + ' ' + RS_HZ + ' Z"/>' +
      (short ? '' : '<path class="rs-run" pathLength="1" d="' + runD + '"/>') +
      (short ? '<circle class="rs-cap end dot" cx="' + f1(X(mid)) + '" cy="' + f1(Y(mid)) + '" r="3.2"/>'
        : '<circle class="rs-cap" cx="' + f1(X(s0)) + '" cy="' + f1(Y(s0)) + '" r="2.3"/>' +
          '<circle class="rs-cap end" cx="' + f1(X(s1)) + '" cy="' + f1(Y(s1)) + '" r="2.3"/>');
    const nowOn = nowAt != null, nowIn = nowOn && nowAt >= a && nowAt <= b;
    const nowMark = nowOn ? '<g class="rs-nowg"' + (nowIn ? '' : ' style="display:none"') + '>' + runSkyNow(nowIn ? nowAt : a, X, Y, iso, rs) + '</g>' : '';
    const H = RS_HZ + RS_FLOOR + 12;
    return '<figure class="runsky rs-' + cls + (rs.morning ? ' rise' : ' set') + '" data-iso="' + iso + '" data-a="' + a + '" data-b="' + b + '"' + (nowOn ? ' data-now' : '') + '>' +
      '<svg viewBox="0 0 ' + RS_W + ' ' + H + '" aria-hidden="true"><defs>' +
      '<linearGradient id="' + uid + 'g">' + stops + '</linearGradient>' +
      '<radialGradient id="' + uid + 'h"><stop offset="0" class="rs-glow-a"/><stop offset="1" class="rs-glow-b"/></radialGradient>' +
      '<linearGradient id="' + uid + 'd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="rs-dome-a"/><stop offset="1" class="rs-dome-b"/></linearGradient>' +
      '<linearGradient id="' + uid + 'v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff"/></linearGradient>' +
      '<linearGradient id="' + uid + 'e"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".12" stop-color="#fff"/><stop offset=".88" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<mask id="' + uid + 'm" maskUnits="userSpaceOnUse" x="0" y="0" width="' + RS_W + '" height="' + RS_HZ + '"><rect x="0" y="0" width="' + RS_W + '" height="' + RS_HZ + '" fill="url(#' + uid + 'v)"/></mask>' +
      '<mask id="' + uid + 'x" maskUnits="userSpaceOnUse" x="0" y="-10" width="' + RS_W + '" height="' + (H + 10) + '"><rect x="0" y="-10" width="' + RS_W + '" height="' + (H + 10) + '" fill="url(#' + uid + 'e)"/></mask>' +
      '<clipPath id="' + uid + 'a"><rect x="0" y="-10" width="' + RS_W + '" height="' + (RS_HZ + 10) + '"/></clipPath>' +
      '<clipPath id="' + uid + 'b"><rect x="0" y="' + RS_HZ + '" width="' + RS_W + '" height="' + (RS_FLOOR + 4) + '"/></clipPath></defs>' +
      '<g mask="url(#' + uid + 'x)"><g class="rs-sky" mask="url(#' + uid + 'm)">' + sky + '</g>' + night +
      '<path class="rs-dome" d="' + dome + '" fill="url(#' + uid + 'd)"/>' +
      '<path class="rs-hz" d="M0 ' + RS_HZ + ' L' + RS_W + ' ' + RS_HZ + '"/>' +
      '<path class="rs-path" clip-path="url(#' + uid + 'a)" d="' + arc + '"/>' +
      '<path class="rs-path below" clip-path="url(#' + uid + 'b)" d="' + arc + '"/></g>' +
      edge(rx, rs.st.rise) + edge(sxs, rs.st.set) + runPath + nowMark + '</svg>' +
      '<figcaption class="rs-line">' + esc(runSkyLine(rs)) + '</figcaption></figure>';
  }
  /* on today the sun itself rides the arc; after dark, a faint mark on
     the dotted path below the horizon */
  function runSkyNow(n, X, Y, iso, rs) {
    const up = DB.sunAltitude(iso, rs.place.lat, rs.st, n) >= 0;
    return '<circle class="rs-sunnow' + (up ? '' : ' below') + '" cx="' + X(n).toFixed(1) + '" cy="' + Y(n).toFixed(1) + '" r="' + (up ? 4.6 : 2.4) + '"/>';
  }
  function refreshRunSky(n) {
    document.querySelectorAll('.runsky[data-now]').forEach((f) => {
      const g = f.querySelector('.rs-nowg');
      if (!g) return;
      const iso = f.dataset.iso, a = Number(f.dataset.a), b = Number(f.dataset.b);
      const place = DB.skyPlace(iso), st = place && DB.sunTimes(iso, place.lat, place.lon, place.offsetMin);
      if (!st || st.rise == null) return;
      const rs = { place, st };
      const { X, Y } = runSkyGeom(iso, rs, a, b);
      const on = n >= a && n <= b;
      g.style.display = on ? '' : 'none';
      if (on) g.innerHTML = runSkyNow(n, X, Y, iso, rs);
    });
  }

  /* The sky at a minute, for the Now card: the light, and whether the
     moon is up. */
  function skyNow(iso, n) {
    const place = DB.skyPlace(iso);
    const st = place ? DB.sunTimes(iso, place.lat, place.lon, place.offsetMin) : null;
    const light = st ? DB.lightAt(st, n) : 'day';
    return { light, moon: light !== 'day' && !!place && DB.moonUp(iso, n, place) };
  }
  /* part of the Now card's render key, so it redraws as the light changes */
  function skyKey(iso, n) { const s = skyNow(iso, n); return '|' + s.light + (s.moon ? 'm' : ''); }
  /* …as a glyph: the sun by day, the sun on the horizon in twilight, the
     moon at its phase when it is up at night, otherwise a star. */
  function skyGlyph(iso, n) {
    const s = skyNow(iso, n);
    let g = '';
    if (s.light === 'day') {
      for (let k = 0; k < 8; k++) {
        const t = k * Math.PI / 4;
        g += 'M' + (12 + 6.5 * Math.cos(t)).toFixed(1) + ' ' + (12 + 6.5 * Math.sin(t)).toFixed(1) + ' L' + (12 + 9.5 * Math.cos(t)).toFixed(1) + ' ' + (12 + 9.5 * Math.sin(t)).toFixed(1) + ' ';
      }
      g = '<path class="g-ray" d="' + g + '"/><circle class="g-sun" cx="12" cy="12" r="4.2"/>';
    } else if (s.light === 'twi') {
      for (let k = 1; k < 6; k++) {
        const t = Math.PI + k * Math.PI / 6;
        g += 'M' + (12 + 7 * Math.cos(t)).toFixed(1) + ' ' + (16 + 7 * Math.sin(t)).toFixed(1) + ' L' + (12 + 10 * Math.cos(t)).toFixed(1) + ' ' + (16 + 10 * Math.sin(t)).toFixed(1) + ' ';
      }
      g = '<path class="g-ray" d="' + g + '"/><path class="g-sun" d="M7 16 A5 5 0 0 1 17 16 Z"/><path class="g-hz" d="M2 16.5 L22 16.5"/>';
    } else if (s.moon) {
      g = moonSVG(12, 12, 7.5, DB.moonPhase(iso), 'g-moon');
    } else {
      g = '<path class="g-star" d="M12 3 L13.6 10.4 L21 12 L13.6 13.6 L12 21 L10.4 13.6 L3 12 L10.4 10.4 Z"/>';
    }
    return '<svg class="nn-sky ' + s.light + '" viewBox="0 0 24 24" aria-hidden="true">' + g + '</svg>';
  }
  /* a few fixed stars behind the Now card after dark — still, not twinkling:
     the card is data, and only the art moves */
  function nnStarsHTML(iso, n) {
    const light = skyNow(iso, n).light;
    if (light === 'day') return '';
    let s = '';
    for (let k = 0; k < (light === 'night' ? 22 : 8); k++) {
      const x = artSeed(iso + ':nn:' + k) * 360, y = artSeed(iso + ':nn:' + k + 'y') * 130;
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (0.5 + artSeed(iso + ':nn:' + k + 'r') * 0.8).toFixed(2) + '"/>';
    }
    return '<svg class="nn-stars" viewBox="0 0 360 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + s + '</svg>';
  }
  /* ---- the day clock (v4.91): a statement piece ----
     An astronomical watch face for one day, read from the outside in:
       · the canonical hours engraved round the rim, the clock hours and a
         quarter-hour minute track on the bezel;
       · the real sky as a ring, shaded continuously by the sun's actual
         height (DB.sunAltitude), with twilight, stars in the dark, the sun
         at its rising and setting and the moon at its highest, its path
         from moonrise to moonset dotted outside;
       · the day's sessions on their own track, each wearing its emblem,
         and the fixed life of the day as a hairline inside it;
       · a ring of lights, one per session, lit as each is done;
       · a medallion of rose-window tracery holding the count, the date
         engraved beneath it, a gloria when the day is complete.
     Today, a Breguet hand points at now and a small comet circles the
     medallion once a minute. Every mark is data or its frame. */
  function dayWheelHTML(day, done, iso, isToday, ovr) {
    const blocks = day.blocks.filter((b) => b.endMin > b.startMin);
    if (!blocks.length) return '<span hidden></span>';
    const C = WHEEL_C, RN = 119, RS_IN = 107, RS_OUT = 131, R_S = 94, R_Q = 81, R_P = 71, R_M = 62;
    const ang = (m) => (m / 1440) * 2 * Math.PI - Math.PI / 2;
    const pt = (m, r) => (C + r * Math.cos(ang(m))).toFixed(2) + ' ' + (C + r * Math.sin(ang(m))).toFixed(2);
    const xy = (m, r) => pt(m, r).split(' ').map(Number);
    const arc = (a, b, r, sweep) => {
      if (b <= a) b += 1440;
      return 'M' + pt(a, r) + ' A' + r + ' ' + r + ' 0 ' + (b - a > 720 ? 1 : 0) + ' ' + (sweep === 0 ? 0 : 1) + ' ' + pt(b, r);
    };
    const off = (b) => !!(ovr && (ovr.skip[b.id] || ovr.moved[b.id]));
    const n = isToday ? nowMin() : null;

    /* the bezel: the minute track, quarter hours to the hour to every three */
    let bezel = '<circle class="dw-bez" cx="' + C + '" cy="' + C + '" r="157"/><circle class="dw-bez in" cx="' + C + '" cy="' + C + '" r="143.5"/>';
    for (let q = 0; q < 96; q++) {
      const m = q * 15, hr = q % 4 === 0, major = q % 12 === 0;
      bezel += '<path class="dw-tick' + (major ? ' major' : hr ? ' hr' : '') + '" d="M' + pt(m, major ? 147.5 : hr ? 150 : 152.8) + ' L' + pt(m, 157) + '"/>';
    }
    for (let h = 0; h < 24; h += 3) {
      const [x, y] = xy(h * 60, 140.5);
      bezel += '<text class="dw-hour" x="' + x.toFixed(1) + '" y="' + (y + 2.6).toFixed(1) + '">' + String(h).padStart(2, '0') + '</text>';
    }
    /* the canonical hours engraved round the rim: the upper names ride an
       arc over the top, the lower ones an arc under the bottom, so every
       name stands the right way up */
    const canon = ((PLAN.hours && PLAN.hours.canonical) || []).reduce((o, [h, nm]) => (o[h] = nm, o), {});
    const upA = 16.5 * 60, upB = 7.5 * 60 + 1440, loA = 7.5 * 60, loB = 16.5 * 60;
    let labels = '<path id="dw-up" d="' + arc(upA, upB % 1440, 165) + '" fill="none"/>' +
      '<path id="dw-lo" d="M' + pt(loB, 172.5) + ' A172.5 172.5 0 0 0 ' + pt(loA, 172.5) + '" fill="none"/>';
    Object.keys(canon).forEach((h) => {
      const m = Number(h) * 60;
      const upper = m >= upA || m <= loA;
      const frac = upper ? (((m - upA) + 1440) % 1440) / (upB - upA) : (loB - m) / (loB - loA);
      labels += '<text class="dw-canon"><textPath href="#dw-' + (upper ? 'up' : 'lo') + '" startOffset="' + (frac * 100).toFixed(2) + '%">' + esc(canon[h]) + '</textPath></text>';
    });

    /* the sky ring: a conic gradient sampled from the sun's height every
       ten minutes, masked to the ring behind the drawing */
    let sky = '', skyBg = '', sunLine = '', moonLit = null;
    const place = DB.skyPlace(iso);
    const st = place ? DB.sunTimes(iso, place.lat, place.lon, place.offsetMin) : null;
    if (st && st.rise != null && st.set != null) {
      const noonAlt = DB.sunAltitude(iso, place.lat, st, (st.rise + st.set) / 2) || 1;
      const level = (m) => {
        const alt = DB.sunAltitude(iso, place.lat, st, m);
        if (alt != null && alt >= 0) return 0.45 + 0.55 * Math.min(1, alt / noonAlt);
        return 0.9 * DB.lightLevel(st, m);
      };
      const stops = [];
      let last = -1;
      for (let m = 0; m <= 1440; m += 10) {
        const L = Math.round(level(m % 1440) * 50) / 50;
        if (L !== last || m === 1440) { stops.push('color-mix(in srgb, var(--sky-d) ' + Math.round(L * 100) + '%, var(--chrome-bg)) ' + (m / 4).toFixed(1) + 'deg'); last = L; }
      }
      skyBg = '<div class="dw-skyring" aria-hidden="true" style="background: conic-gradient(' + stops.join(', ') + ')"></div>';
      const dawn = st.dawn != null ? st.dawn : st.rise, dusk = st.dusk != null ? st.dusk : st.set;
      const nightLen = ((dawn - dusk) + 1440) % 1440;
      const seedOf = (k) => artSeed(iso + ':' + k);
      /* the stars, in the dark only: bright ones, faint dust, a few that twinkle */
      const nStars = Math.round(nightLen / 22);
      for (let k = 0; k < nStars; k++) {
        const m = (dusk + nightLen * (0.03 + 0.94 * seedOf(k))) % 1440, r = RS_IN + 3 + (RS_OUT - RS_IN - 6) * seedOf(k + 'r');
        const [x, y] = xy(m, r), big = seedOf(k + 's');
        sky += '<circle class="dw-star' + (big > 0.62 ? ' tw' : '') + (big < 0.35 ? ' dust' : '') + '" style="--d:' + (seedOf(k + 'd') * 5).toFixed(2) + 's" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) +
          '" r="' + (big < 0.35 ? 0.45 : 0.6 + big * 0.9).toFixed(2) + '"/>';
      }
      /* the horizon, where the sun meets it: a hairline across the ring */
      [st.rise, st.set].forEach((m) => { sky += '<path class="dw-horizon" d="M' + pt(m, RS_IN) + ' L' + pt(m, RS_OUT) + '"/>'; });
      /* the moon where it really is, its path dotted outside the ring */
      const mp = DB.moonPhase(iso), ma = DB.moonArc(iso, place);
      if (ma.semi > 20 && ma.semi < 700) sky += '<path class="dw-moonarc" pathLength="1" d="' + arc(ma.rise, ma.set, 133.8) + '"/>';
      let mAt = ma.transit;
      [st.rise, st.set].forEach((sm) => {
        const d = ((((mAt - sm) % 1440) + 1440 + 720) % 1440) - 720;
        if (Math.abs(d) < 50) mAt = (sm + (d < 0 ? -50 : 50) + 1440) % 1440;
      });
      const [mx, my] = pt(mAt, RN).split(' ').map(Number);
      sky += '<g class="dw-moonwrap"><circle class="dw-moonhalo" fill="url(#dw-halo)" cx="' + mx + '" cy="' + my + '" r="' + (13 + 6 * mp.lit).toFixed(1) + '"/>' + moonSVG(mx, my, 6.8, mp, 'dw-moon') + '</g>';
      moonLit = Math.round(mp.lit * 100);
      /* the sun at its rising and its setting, a half disc on the horizon */
      [st.rise, st.set].forEach((m) => {
        const [sx, sy] = xy(m, RN);
        let rays = '';
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6, r0 = k % 2 ? 5.4 : 5.2, r1 = k % 2 ? 7.4 : 9;
          rays += 'M' + (sx + r0 * Math.cos(a)).toFixed(2) + ' ' + (sy + r0 * Math.sin(a)).toFixed(2) + ' L' + (sx + r1 * Math.cos(a)).toFixed(2) + ' ' + (sy + r1 * Math.sin(a)).toFixed(2) + ' ';
        }
        sky += '<g class="dw-sun"><circle class="dw-sunglow" fill="url(#dw-halo)" cx="' + sx + '" cy="' + sy + '" r="15"/><path d="' + rays + '"/><circle cx="' + sx + '" cy="' + sy + '" r="3.4"/></g>';
      });
      sunLine = 'sunrise ' + DB.fmtHM(st.rise) + ' · sunset ' + DB.fmtHM(st.set) + placeTime(place);
    } else {
      skyBg = '<div class="dw-skyring" aria-hidden="true" style="background: color-mix(in srgb, var(--sky-d) 60%, var(--chrome-bg))"></div>';
    }

    /* the sessions on their track, each with its emblem; the fixed life of
       the day as a hairline inside */
    let track = '<circle class="dw-groove" cx="' + C + '" cy="' + C + '" r="' + R_S + '"/>', fixed = '', embs = '';
    let total = 0, got = 0, runAt = '';
    const sessions = [], emb = [];
    blocks.forEach((b) => {
      const a = b.startMin + 2, z = Math.max(a + 3, b.endMin - 2);
      if (b.doable) {
        const isRun = day.run && b.id === day.run.id;
        const rc = isRun ? DB.runClass(day.run) : '';
        const colour = isRun ? (rc === 'quality' || rc === 'race' ? 'var(--accent)' : rc === 'long' ? 'var(--text)' : 'var(--cat-run)') : (CAT_VAR[b.cat] || 'var(--t2)');
        const isDone = !!done[b.id] || (isRun && (getRunLogEntry(iso) || {}).sec > 0);
        if (!off(b)) { total++; if (isDone) got++; sessions.push({ colour, isDone }); }
        if (isRun) runAt = b.start;
        const k = (b.startMin / 1440).toFixed(3);
        track += '<path class="dw-s' + (isDone ? ' done' : '') + (off(b) ? ' off' : '') + (isRun ? ' run' : '') + (isToday && n >= b.startMin && n < b.endMin ? ' now' : '') +
          '" d="' + arc(a, z, R_S) + '"' + (off(b) ? '' : ' pathLength="1"') + ' style="stroke:' + colour + ';--k:' + k + '"/>';
        emb.push({ m: (b.startMin + b.endMin) / 2, kind: isRun && rc === 'race' ? 'laurel' : emblemKind(b),
          cls: (isDone ? ' done' : '') + (off(b) ? ' off' : ''), style: '--c:' + colour + ';--k:' + k });
      } else if (!/lights out|sleep/i.test(b.title)) {
        fixed += '<path class="dw-q" d="' + arc(a, z, R_Q) + '" pathLength="1" style="stroke:' + (CAT_VAR[b.cat] || 'var(--t3)') + ';--k:' + (b.startMin / 1440).toFixed(3) + '"/>';
      }
    });
    /* each emblem sits at the middle of its session, but two short sessions
       back to back (reading at 21:00 and 22:00) would stack their roundels:
       ease neighbours apart along the track until a roundel's width clears */
    const SEP = 58;
    emb.sort((x, y) => x.m - y.m);
    for (let pass = 0; pass < 24; pass++) {
      let moved = false;
      for (let k = 0; k + 1 < emb.length; k++) {
        const gap = emb[k + 1].m - emb[k].m;
        if (gap < SEP - 0.01) { const d = (SEP - gap) / 2; emb[k].m -= d; emb[k + 1].m += d; moved = true; }
      }
      if (!moved) break;
    }
    emb.forEach((e) => {
      const [ex, ey] = xy(e.m, R_S);
      embs += '<g class="dw-emb' + e.cls + '" style="' + e.style + '">' +
        '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="8.6"/>' +
        '<g class="dw-e" transform="translate(' + (ex - 5.6).toFixed(2) + ' ' + (ey - 5.6).toFixed(2) + ') scale(.4667)">' + (EMBLEMS[e.kind] || EMBLEMS.fleuron) + '</g></g>';
    });

    /* a ring of lights, one per session, lit as each is done */
    let lights = '';
    if (total) {
      const gap = total > 1 ? 7 : 0, span = 360 / total;
      sessions.sort((x, y) => (y.isDone ? 1 : 0) - (x.isDone ? 1 : 0)).forEach((sx, k) => {
        const a = (k * span + gap / 2) * 4, z = ((k + 1) * span - gap / 2) * 4;
        lights += total > 1
          ? '<path class="dw-light' + (sx.isDone ? ' lit' : '') + '" style="--p:' + k + '" d="' + arc(a, z, R_P) + '"/>'
          : '<circle class="dw-light' + (sx.isDone ? ' lit' : '') + '" style="--p:0" cx="' + C + '" cy="' + C + '" r="' + R_P + '"/>';
      });
    } else lights = '<circle class="dw-light" cx="' + C + '" cy="' + C + '" r="' + R_P + '"/>';

    /* the medallion: rose-window tracery, the count, the date engraved */
    let rose = '<circle class="dw-med" cx="' + C + '" cy="' + C + '" r="' + R_M + '"/>';
    let tracery = '<circle cx="' + C + '" cy="' + C + '" r="' + (R_M - 4) + '"/><circle cx="' + C + '" cy="' + C + '" r="21"/>';
    for (let k = 0; k < 12; k++) {
      const [px, py] = xy(k * 120, 39);
      tracery += '<circle cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="17"/>';
      tracery += '<path d="M' + pt(k * 120 + 60, 21) + ' L' + pt(k * 120 + 60, R_M - 4) + '"/>';
    }
    rose += '<g class="dw-tracery">' + tracery + '</g>';
    /* a finished day earns a gloria: a burst of fine rays from behind the
       medallion, out past the lights, turning very slowly */
    let gloria = '';
    if (total && got === total) {
      let rays = '';
      for (let k = 0; k < 72; k++) rays += 'M' + pt(k * 20, 63) + ' L' + pt(k * 20, k % 3 === 0 ? 86 : k % 3 === 1 ? 70 : 76) + ' ';
      gloria = '<g class="dw-gloria"><circle class="dw-glow" fill="url(#dw-halo)" cx="' + C + '" cy="' + C + '" r="92"/><path d="' + rays + '"/></g>';
    }
    const [yy, mo, dd] = iso.split('-').map(Number);
    const engraved = roman(dd) + ' · ' + roman(mo) + ' · ' + roman(yy);
    const motto = '<path id="dw-arc" d="M' + pt(1440 * 0.667, 54) + ' A54 54 0 0 0 ' + pt(1440 * 0.333, 54) + '" fill="none"/>' +
      '<text class="dw-motto"><textPath href="#dw-arc" startOffset="50%">' + engraved + '</textPath></text>';

    let hand = '', sec = '';
    if (isToday) {
      hand = '<g class="dw-handg" style="transform: rotate(' + handAngle(n).toFixed(2) + 'deg)">' + handSVG() + '</g>';
      const secs = new Date().getSeconds();
      sec = '<g class="dw-sec" style="--s:' + secs + '"><path class="dw-sectrail" d="' + arc(1440 - 70, 1440 - 1, R_M + 0.5) + '"/>' +
        '<circle class="dw-secdot" cx="' + C + '" cy="' + (C - R_M - 0.5) + '" r="1.7"/></g>';
    }

    const cats = [];
    blocks.forEach((b) => { if (b.doable && !cats.includes(b.cat)) cats.push(b.cat); });
    const rcl = day.run ? DB.runClass(day.run) : '';
    const runSwatch = rcl === 'quality' || rcl === 'race' ? 'var(--accent)' : rcl === 'long' ? 'var(--text)' : CAT_VAR.run;
    const legend = cats.map((c) => '<span><i class="lg-e" style="color:' + (c === 'run' ? runSwatch : CAT_VAR[c] || 'var(--t2)') + '">' +
      emblemSVG(c === 'run' && rcl === 'race' ? 'laurel' : emblemKind({ cat: c, title: '' }), 'lg') + '</i>' +
      esc(c === 'xt' ? 'cross-train' : c === 'run' && rcl === 'race' ? 'race' : c === 'run' && rcl === 'long' ? 'long run' : c === 'run' && rcl === 'quality' ? 'quality run' : c) + '</span>').join('');
    const label = 'Your day as a 24-hour clock: ' + total + ' sessions, ' + got + ' done' + (runAt ? '; run at ' + runAt : '') +
      (sunLine ? '; ' + sunLine : '') + (moonLit != null ? '; the moon ' + moonLit + '% lit' : '') + '.';
    return '<figure class="daywheel' + (total && got === total ? ' complete' : '') + (isToday ? ' live' : '') + '" role="img" aria-label="' + esc(label) + '">' +
      '<div class="dw-dial">' + skyBg +
      '<svg viewBox="0 0 360 360" aria-hidden="true"><defs><radialGradient id="dw-halo"><stop offset="0" class="dw-h0"/><stop offset=".45" class="dw-h1"/><stop offset="1" class="dw-h2"/></radialGradient></defs>' +
      '<g class="dw-bezel">' + bezel + '</g><g class="dw-labels">' + labels + '</g>' +
      '<g class="dw-skyart"><circle class="dw-skyedge" cx="' + C + '" cy="' + C + '" r="' + RS_OUT + '"/><circle class="dw-skyedge" cx="' + C + '" cy="' + C + '" r="' + RS_IN + '"/>' + sky + '</g>' +
      '<g class="dw-fixed">' + fixed + '</g><g class="dw-track">' + track + '</g><g class="dw-lights">' + lights + '</g>' +
      gloria + '<g class="dw-embs">' + embs + '</g>' + hand + rose + sec + motto +
      (total
        ? '<text class="dw-count" x="' + C + '" y="' + (C + 8) + '">' + got + '<tspan class="dw-of">/' + total + '</tspan></text>' +
          '<text class="dw-cap" x="' + C + '" y="' + (C + 24) + '">SESSIONS DONE</text>'
        : '<text class="dw-count rest" x="' + C + '" y="' + (C + 6) + '">REST</text>' +
          '<text class="dw-cap" x="' + C + '" y="' + (C + 24) + '">NOTHING TO TICK</text>') + '</svg></div>' +
      (sunLine ? '<p class="dw-sunline" aria-hidden="true">' + sunLine + '</p>' : '') +
      (legend ? '<figcaption aria-hidden="true">' + legend + '</figcaption>' : '') + '</figure>';
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
      '<span class="rg-t"><b>' + fmt(wk.done) + '</b>/' + fmt(wk.planned) + ' km <small>this week</small></span></span>';
  }

  /* ---- emblems (v4.84) ----
     Every activity carries a small engraved emblem, as the margins of a
     Book of Hours carry theirs: the winged foot of Mercury for a run and
     a laurel wreath for a race, Fortitude's column for the gym, the lamp
     of learning for study, a speech scroll for German, an open book for
     reading, an hourglass for work and a compass rose for the journey to
     it, a goblet at table, a lyre for free time, a ball for basketball,
     and for the day's own hours a rising sun, a crescent moon, a drop of
     water. Monoline, drawn in the activity's own category colour. */
  const EMBLEMS = {
    foot: '<path d="M5.5 20H15.8C18.2 20 19.9 18.9 19.9 17.5 19.9 16.6 19.2 16.1 18.2 15.9L13.2 14.9 12 11.6H8.6V15.4C6.8 15.7 5.5 17.3 5.5 20Z"/><path d="M9 12.3C8.7 8.4 6.6 5.6 2.8 4.1 3.2 6.1 4.1 7.5 5.4 8.4 4.2 8.5 3.1 8.2 2.2 7.6 2.9 9.9 4.6 11.1 6.5 11.5 5.6 12 4.4 12.2 3.3 12 4.6 13.5 6.8 14 9 13.4"/><path d="M8.6 16.8H12.8"/>',
    laurel: '<path d="M12 20.5C6.5 19.5 3.8 14.5 5.2 8.5M12 20.5C17.5 19.5 20.2 14.5 18.8 8.5"/><path d="M5.2 8.5c-1.6-.6-2.2-2.2-1.6-3.6 1.4.6 2 2.2 1.6 3.6zM4.7 13c-1.7-.3-2.6-1.8-2.3-3.3 1.5.4 2.4 1.9 2.3 3.3zM7 17c-1.7.1-3-1.1-3.1-2.6 1.6-.1 2.9 1.1 3.1 2.6zM18.8 8.5c1.6-.6 2.2-2.2 1.6-3.6-1.4.6-2 2.2-1.6 3.6zM19.3 13c1.7-.3 2.6-1.8 2.3-3.3-1.5.4-2.4 1.9-2.3 3.3zM17 17c1.7.1 3-1.1 3.1-2.6-1.6-.1-2.9 1.1-3.1 2.6z"/><path d="M10 21.5L12 20 14 21.5"/>',
    column: '<path d="M5 3.5H19V5.8H5Z"/><path d="M6.5 5.8C6.5 7 7 7.6 7.8 7.6H16.2C17 7.6 17.5 7 17.5 5.8M8 7.6V18M10.7 7.6V18M13.3 7.6V18M16 7.6V18M6.5 18H17.5M5 20.5H19"/>',
    lamp: '<path d="M3.5 14.5C3.5 12 7 11 11 11H14.5L20.2 8.6C21 8.3 21.6 9.1 21 9.7L16 14.5Z"/><path d="M20.9 7.3C19.9 6.1 20.1 4.7 21 3.1 22 4.7 22.2 6.1 21.3 7.3M3.8 13C1.8 12.6 1.6 10.2 3.5 10M8.2 14.5L7.2 17.5H13.2L12.2 14.5M9.5 11C9.5 9.8 11.5 9.8 11.5 11"/>',
    scroll: '<path d="M6.5 3.5H18.5C19.9 3.5 19.9 6.5 18.5 6.5H6.5M6.5 3.5C5.1 3.5 5.1 6.5 6.5 6.5M5.5 20.5H17.5C18.9 20.5 18.9 17.5 17.5 17.5H5.5M5.5 20.5C4.1 20.5 4.1 17.5 5.5 17.5M7.5 6.5V17.5M17 6.5V17.5"/><path d="M9.8 9.5H14.8M9.8 12H14.8M9.8 14.5H13.2"/>',
    book: '<path d="M12 6.5C9.5 5 6 4.8 3 5.6V18.6C6 17.8 9.5 18 12 19.5 14.5 18 18 17.8 21 18.6V5.6C18 4.8 14.5 5 12 6.5ZM12 6.5V19.5"/><path d="M5.5 9C7.2 8.7 8.8 8.9 10 9.5M5.5 12C7.2 11.7 8.8 11.9 10 12.5M14 9.5C15.2 8.9 16.8 8.7 18.5 9M14 12.5C15.2 11.9 16.8 11.7 18.5 12"/>',
    hourglass: '<path d="M6 3H18M6 21H18M7.5 3C7.5 8.5 11 9.5 11 12 11 14.5 7.5 15.5 7.5 21M16.5 3C16.5 8.5 13 9.5 13 12 13 14.5 16.5 15.5 16.5 21"/><path d="M9.3 19.6C10.3 17.9 13.7 17.9 14.7 19.6ZM12 13V16.5"/>',
    goblet: '<path d="M6.5 3.5H17.5C17.5 8.5 15.5 11 12 11 8.5 11 6.5 8.5 6.5 3.5Z"/><path d="M7.1 6.2H16.9M12 11V18M9.5 18H14.5M8 20.5H16"/>',
    lyre: '<path d="M8 20C4.2 16.5 4 10.5 6.2 6.8 6.9 5.6 6.2 4.2 5 4.4M16 20C19.8 16.5 20 10.5 17.8 6.8 17.1 5.6 17.8 4.2 19 4.4M5.8 9.5H18.2M7 20H17M10 9.5V20M12 9.5V20M14 9.5V20"/>',
    ball: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12H20.5M12 3.5V20.5M6.2 5.8C9.2 8.8 9.2 15.2 6.2 18.2M17.8 5.8C14.8 8.8 14.8 15.2 17.8 18.2"/>',
    sunrise: '<path d="M2.5 17.5H21.5M7 17.5A5 5 0 0 1 17 17.5M12 8.8V6.3M6.4 11.6 4.7 9.9M17.6 11.6 19.3 9.9M4.3 15H2.6M19.7 15H21.4M7.5 20.5H16.5"/>',
    moon: '<path d="M16 20.2A8.5 8.5 0 1 1 16 3.8 6.6 6.6 0 1 0 16 20.2Z"/><path d="M19.3 6.2 19.8 7.7 21.3 8.2 19.8 8.7 19.3 10.2 18.8 8.7 17.3 8.2 18.8 7.7Z"/>',
    compass: '<path d="M12 2.5 13.6 10.4 21.5 12 13.6 13.6 12 21.5 10.4 13.6 2.5 12 10.4 10.4Z"/><path d="M8.3 8.3 12 12 15.7 8.3M8.3 15.7 12 12 15.7 15.7" opacity=".55"/>',
    drop: '<path d="M12 3C12 3 5.5 10.5 5.5 14.5 5.5 18 8.5 21 12 21S18.5 18 18.5 14.5C18.5 10.5 12 3 12 3Z"/><path d="M8.9 15C8.9 16.8 10.2 18.1 12 18.1"/>',
    fleuron: '<path d="M12 12C9 9 9 5 12 3.5 15 5 15 9 12 12 15 9 19 9 20.5 12 19 15 15 15 12 12 15 15 15 19 12 20.5 9 19 9 15 12 12 9 15 5 15 3.5 12 5 9 9 9 12 12Z"/>',
  };
  function emblemKind(b) {
    const t = String(b.title || '');
    switch (b.cat) {
      case 'run': return b.run && DB.runClass(b) === 'race' ? 'laurel' : 'foot';
      case 'gym': return 'column';
      case 'xt': return 'ball';
      case 'study': return 'lamp';
      case 'german': return 'scroll';
      case 'reading': return 'book';
      case 'meal': return 'goblet';
      case 'free': return 'lyre';
      case 'work': return /commute|home/i.test(t) ? 'compass' : 'hourglass';
      default:
        return /wake|alarm/i.test(t) ? 'sunrise' : /lights out|sleep/i.test(t) ? 'moon' : /shower/i.test(t) ? 'drop'
          : /travel|fly|walk|^to /i.test(t) ? 'compass' : 'fleuron';
    }
  }
  function emblemSVG(kind, cls) {
    return '<svg class="emb ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (EMBLEMS[kind] || EMBLEMS.fleuron) + '</svg>';
  }
  /* an emblem's ink: a run keeps its class (red hard, white long), every
     other activity its category colour */
  function emblemTone(b) {
    if (b.run) {
      const c = DB.runClass(b);
      if (c === 'race' || c === 'quality') return 'var(--accent)';
      if (c === 'long') return 'var(--text)';
    }
    return CAT_VAR[b.cat] || CAT_VAR.routine;
  }

  function buildCard(b, done, iso, opts) {
    opts = opts || {};
    const isDone = !!done[b.id];
    const cat = CAT_VAR[b.cat] || CAT_VAR.routine;
    if (opts.movedOut) return attachUndoMove(iso, b);
    const expanded = state.expanded === b.id;
    const legDrop = !!(opts.moved && legDropFor(b, iso));
    const legRe = legDrop ? new RegExp(PLAN.moveRules.legPattern, 'i') : null;
    const dose = b.plan && !opts.moved ? legDose(iso, b) : 'full';
    const card = el(
      '<div class="tl-card' + (isDone ? ' done' : '') + (opts.skipped ? ' skipped' : '') + (opts.current ? ' current' : '') + (opts.just ? ' just' : '') +
        (opts.past ? ' past' : '') + (opts.slim ? ' slim' : '') + '" style="--cat:' + cat + '">' +
      '<span class="c-emb' + (emblemKind(b) === 'laurel' ? ' race' : '') + '">' + emblemSVG(emblemKind(b)) + '</span>' +
      '<div class="c-main">' +
      '<div class="c-time">' + b.start + (b.end && b.end !== b.start ? '–' + b.end : '') +
      (opts.current ? ' <span class="nowflag">· NOW</span>' : '') +
      (opts.past && !isDone && !opts.skipped && !opts.slim ? ' <span class="c-late">· not ticked</span>' : '') + '</div>' +
      '<div class="c-title">' + tt(b.title) + '</div>' +
      /* the day's run lives on the run card above; its row here is a slim
         pointer that keeps the run's ⋯ actions (move, niggle, ill) (v4.88) */
      (opts.slim
        ? '<div class="c-runref">' + esc((b.run ? b.run.km + ' km · ' + b.run.shoe : '')) + '<button class="c-up" aria-label="Go to the run card">Run card ↑</button></div>'
        : '<div class="c-detail">' + detailHTML(b.detail, iso + '|' + b.id, false) + '</div>') +
      /* the category is said by the emblem and the colour; only a state
         (skipped, moved) earns a label now (v4.88) */
      (opts.skipped || opts.moved ? '<div class="c-cat">' + (opts.skipped ? 'skipped' : '') + (opts.skipped && opts.moved ? ' · ' : '') +
        (opts.moved ? 'moved from ' + esc(fmtShort(opts.moved.fromIso)) : '') + '</div>' : '') +
      (legDrop ? '<div class="mv-note">' + esc(PLAN.moveRules.legNote) + '</div>' : '') +
      (b.table && !opts.slim ? paceTableHTML(b.table) : '') +
      (b.plan ? '<div class="c-sess"><details class="session-plan" data-disclosure="' + esc(iso + '|' + b.id + '|plan') + '"' + (openDetails.has(iso + '|' + b.id + '|plan') ? ' open' : '') + '><summary>' + b.plan.length + ' exercises' +
        (dose !== 'full' ? ' <em class="dose-tag">' + (dose === 'half' ? 'legs halved' : 'upper only') + '</em>' : '') +
        '</summary><div class="c-plan">' + (opts.moved ? b.plan : dosedPlan(iso, b)).map((p) => {
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
        if (p.off) return '<div class="xr drop"><span class="xn">' + esc(p.ex) + '</span><span class="xs">not today</span></div>';
        return '<div class="xr"><span class="xn">' + esc(p.ex) + '</span>' +
          '<span class="xs">' + esc(p.sets) + '</span>' + w + '</div>';
      }).join('') + '</div></details>' +
      /* one way in: the list for a glance, Focus for the session (v4.88) */
      (b.cat === 'gym' && !opts.moved && !opts.skipped ? '<button class="session-focus-open compact" data-focus-id="' + esc(b.id) + '">Focus <span aria-hidden="true">↗</span></button>' : '') + '</div>' : '') +
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
            (t.legDrop ? '<small class="mv-warn">upper + core only</small>' : '') + '</button>').join('') +
          (b.cat === 'run' ? '<p class="mv-runlog">A day that already has a run keeps one run log between them.</p>' : '') + '</div>' : '') : '') +
      '</div>' +
      '<div class="c-side">' +
      (iso > todayISO() && !isDone || opts.slim ? '' : '<button class="tick' + (isDone ? ' on' : '') + '" aria-pressed="' + isDone + '" aria-label="' + (isDone ? 'Mark not done: ' : 'Mark done: ') + esc(b.title) + '">✓ <span>' + (isDone ? 'Done' : 'Mark done') + '</span></button>') +
      '<button class="more-btn" aria-label="Actions">⋯</button>' +
      '</div></div>'
    );
    const focusBtn = card.querySelector('.session-focus-open');
    if (focusBtn) focusBtn.addEventListener('click', () => openSessionFocus(b, iso, focusBtn));
    const upBtn = card.querySelector('.c-up');
    if (upBtn) upBtn.addEventListener('click', () => {
      const hero = document.querySelector('.hero');
      if (!hero) return;
      const inset = document.querySelector('.topbar').getBoundingClientRect().height + 12;
      window.scrollTo({ top: hero.getBoundingClientRect().top + window.scrollY - inset, behavior: 'auto' });
    });
    const tickEl = card.querySelector('.tick');
    if (tickEl) tickEl.addEventListener('click', () => {
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
      '<div class="c-title">' + tt(b.title) + '</div>' +
      '<div class="moved-tag">→ moved to ' + esc(movedLabel(iso, b.id)) + '</div></div>' +
      '<div class="c-side"><button class="more-btn" aria-label="Undo move">↩</button></div></div>'
    );
    card.querySelector('.more-btn').addEventListener('click', () => { undoMove(iso, b.id); render(); });
    return card;
  }

  /* The skyline: all 30 weeks as one shape — planned km as phase-coloured
     bars, banked km filled inside them, key days flagged, race starred. */
  /* ---- the night sky (v4.72): every run of the block as a star ----
     "Built one run at a time. Each one leaves a mark" — drawn literally. Left
     to right is the calendar; each day's height is fixed by its date, so the
     sky never reshuffles. A run that happened is a star sized by its
     distance: easy runs grey, long runs white with a halo, hard ones red
     (§3). Planned runs still ahead are faint points, so the sky fills in as
     the block does. The recorded long runs are joined into one constellation,
     a thin beam marks today, and the race is a red sun on the horizon —
     Nicosia's sunrise comes five minutes after the gun. */
  /* ---- the firmament of the block (v4.92) ----
     The thirty weeks as one night sky, left to right, drawn like a plate
     from an astronomical atlas:
       · depth: a black zenith falling to a faint horizon, the future
         veiled beyond NOW, and the race's dawn reddening the far right;
       · the Milky Way in three layers — a wide glow, a brighter core and a
         dark dust lane — thick with its own tiny stars;
       · a field of background stars in three magnitudes;
       · every recorded run as a star: size from its distance, a soft
         halo, diffraction spikes on the long runs, red for the hard ones;
       · the long runs joined as a constellation, the lines stopping
         short of each star as on a star chart;
       · a comet on each new longest run, its tail as long as the gain;
       · the moon each week at its real phase along the top;
       · the race: a sunrise over low hills at the gun, the waning moon
         still up above it.
     Every mark is data or ground. */
  function skyHTML(journey) {
    const W = 360, H = 190, HZ = 158, today = todayISO();
    const days = journey.weeks.reduce((all, w) => all.concat(w.days), []);
    if (!days.length) return '';
    const n = days.length;
    const X = (i) => 14 + (i / (n - 1)) * (W - 50);
    const seed = artSeed;
    const f1 = (v) => v.toFixed(1);
    let field = '', way = '', halos = '', spikes = '', stars = '', comets = '', lines = '', moons = '', ahead = '';
    let todayX = null, maxKm = 0;
    /* background field: three magnitudes, denser near the Milky Way */
    for (let k = 0; k < 150; k++) {
      const x = seed('f' + k) * W, y = 22 + Math.pow(seed('fy' + k), 1.25) * (HZ - 26), m = seed('fm' + k);
      field += '<circle class="sk-f' + (m > 0.93 ? ' b' : m > 0.6 ? ' m' : '') + '" cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + (m > 0.93 ? 0.85 : m > 0.6 ? 0.55 : 0.35) + '"/>';
    }
    /* the Milky Way rising across the block: glow, core, dust lane, and its stars */
    const wy = (t) => HZ - 30 - t * (HZ - 64) + Math.sin(t * Math.PI * 1.6 + 0.4) * 11;
    let wp = '', lane = '';
    for (let k = 0; k <= 30; k++) {
      const t = k / 30, x = t * W;
      wp += (k ? ' L' : 'M') + f1(x) + ' ' + f1(wy(t));
      lane += (k ? ' L' : 'M') + f1(x) + ' ' + f1(wy(t) + 3 + Math.sin(t * 9) * 2.2);
    }
    way = '<path class="sk-way wide" d="' + wp + '" filter="url(#sk-blur-l)"/><path class="sk-way core" d="' + wp + '" filter="url(#sk-blur-m)"/>';
    for (let k = 0; k < 320; k++) {
      const t = seed('w' + k), g = (seed('wg' + k) + seed('wh' + k) + seed('wi' + k) - 1.5) * 20;
      way += '<circle class="sk-wd" cx="' + f1(t * W) + '" cy="' + f1(wy(t) + g) + '" r="' + (0.25 + seed('wr' + k) * 0.4).toFixed(2) + '"/>';
    }
    way += '<path class="sk-lane" d="' + lane + '" filter="url(#sk-blur-s)"/>';
    /* the moon each week, at its real phase, along the top */
    journey.weeks.forEach((w, k) => {
      const iso = DB.addDays(w.start, 3), mp = DB.moonPhase(iso), x = X(k * 7 + 3);
      const full = mp.lit > 0.93, nw = mp.lit < 0.07;
      moons += '<g class="sk-mo' + (full ? ' full' : nw ? ' new' : '') + '" style="--i:' + k + '">' +
        (full ? '<circle class="sk-mohalo" fill="url(#sk-hw)" cx="' + f1(x) + '" cy="10" r="8"/>' : '') + moonSVG(x, 10, 3, mp, 'sk-moon') + '</g>';
    });
    /* the runs */
    const spine = [];
    days.forEach((d, i) => {
      const x = X(i);
      if (d.iso === today) todayX = x;
      if (!d.planned && !d.recorded) return;
      const kind = d.cls === 'quality' || d.cls === 'race' ? 'hard' : d.cls === 'long' ? 'long' : 'easy';
      const band = kind === 'long' ? [30, 66] : kind === 'hard' ? [58, 98] : [88, HZ - 16];
      const y = band[0] + seed(d.iso) * (band[1] - band[0]);
      const t = (x / W).toFixed(3);
      if (d.recorded > 0) {
        const r = Math.max(0.8, Math.min(3.2, Math.sqrt(d.recorded) * 0.66));
        halos += '<circle class="sk-halo ' + kind + '" style="--t:' + t + '" cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r * (kind === 'easy' ? 3 : 4.6)) + '" fill="url(#sk-h' + (kind === 'hard' ? 'r' : 'w') + ')"/>';
        /* the brightest carry diffraction spikes: four tapered needles */
        if (kind === 'long' || d.recorded >= 21) {
          const L = r * 2.8 + 2.5, w = 0.32;
          const needle = (x0, y0, x1, y1, px, py) => 'M' + f1(x0) + ' ' + f1(y0) + ' L' + (x + px).toFixed(2) + ' ' + (y + py).toFixed(2) + ' L' + f1(x1) + ' ' + f1(y1) + ' L' + (x - px).toFixed(2) + ' ' + (y - py).toFixed(2) + ' Z';
          spikes += '<path class="sk-spike" style="--t:' + t + '" d="' + needle(x - L, y, x + L, y, 0, w) + ' ' + needle(x, y - L, x, y + L, w, 0) + '"/>';
        }
        stars += '<circle class="sk-star ' + kind + (seed(d.iso + 't') > 0.62 ? ' tw' : '') + '" style="--t:' + t + ';--d:' + (seed(d.iso + 'd') * 6).toFixed(2) + 's" cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '"/>';
        if (kind === 'long') spine.push([x, y, r]);
        if (d.recorded > maxKm) {
          if (maxKm > 0) {
            const gain = d.recorded - maxKm, len = 8 + Math.min(30, gain * 3.2);
            comets += '<path class="sk-comet" pathLength="1" style="--t:' + t + '" d="M' + f1(x - len * 0.93) + ' ' + f1(y - len * 0.37) + ' L' + f1(x - r) + ' ' + f1(y - r * 0.4) + '"/>';
          }
          maxKm = d.recorded;
        }
      } else if (d.iso > today) {
        ahead += '<circle class="sk-ahead' + (kind === 'hard' ? ' hard' : kind === 'long' ? ' long' : '') + '" cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + (kind === 'long' ? 1.1 : 0.8) + '"/>';
      }
    });
    /* the constellation: segments that stop short of each star */
    for (let k = 1; k < spine.length; k++) {
      const [ax, ay, ar] = spine[k - 1], [bx, by, br] = spine[k], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      if (L < ar + br + 6) continue;
      const ux = dx / L, uy = dy / L, ga = ar + 3.5, gb = br + 3.5;
      lines += '<path class="sk-line" pathLength="1" style="--t:' + (ax / W).toFixed(3) + '" d="M' + f1(ax + ux * ga) + ' ' + f1(ay + uy * ga) + ' L' + f1(bx - ux * gb) + ' ' + f1(by - uy * gb) + '"/>';
    }
    /* the race: the sun rising over low hills at the gun, rays like a window */
    const sunX = X(n - 1) + 4;
    let rays = '';
    for (let k = 0; k < 15; k++) {
      const a = Math.PI + (k + 0.5) * (Math.PI / 15), r0 = 20, r1 = k % 2 ? 34 : 46;
      rays += 'M' + f1(sunX + r0 * Math.cos(a)) + ' ' + f1(HZ + r0 * Math.sin(a)) + ' L' + f1(sunX + r1 * Math.cos(a)) + ' ' + f1(HZ + r1 * Math.sin(a)) + ' ';
    }
    let hills = 'M0 ' + (HZ + 2);
    for (let k = 0; k <= 36; k++) {
      const x = k * 10, h = 2.5 + Math.sin(k * 0.55) * 1.6 + Math.sin(k * 1.7 + 1) * 1 + (k > 28 ? (k - 28) * 0.5 : 0);
      hills += ' L' + x + ' ' + f1(HZ - h + 2);
    }
    hills += ' L' + W + ' ' + H + ' L0 ' + H + ' Z';
    const ran = days.filter((d) => d.recorded > 0).length;
    const shooting = [[228, 40, 0], [176, 82, 9], [276, 26, 17]].map(([x, y, s]) =>
      '<g class="sk-shoot" style="--s:' + s + 's"><path d="M' + x + ' ' + y + ' L' + (x + 46) + ' ' + (y + 18) + '"/><circle cx="' + (x + 46) + '" cy="' + (y + 18) + '" r=".9"/></g>').join('');
    const raceMoon = '<g class="sk-racemoon"><circle fill="url(#sk-hw)" cx="' + f1(sunX - 56) + '" cy="' + (HZ - 84) + '" r="13"/>' + moonSVG(sunX - 56, HZ - 84, 4.4, DB.moonPhase(days[n - 1].iso), 'sk-moon race') + '</g>';
    const veil = todayX != null ? '<rect class="sk-veil" x="' + f1(todayX) + '" y="0" width="' + f1(W - todayX) + '" height="' + HZ + '" fill="url(#sk-veil)"/>' : '';
    return '<figure class="sky" role="img" aria-label="The block as a night sky: ' + ran + ' runs recorded as stars, ' +
      'long runs joined as a constellation, comet tails on each new longest run, the moon each week at its phase along the top, ' +
      'and the race as a sunrise at the far right under a waning moon.">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<defs><linearGradient id="sk-depth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sk-z0"/><stop offset=".75" class="sk-z1"/><stop offset="1" class="sk-z2"/></linearGradient>' +
      '<radialGradient id="sk-dawn" cx="1" cy="1" r="0.62"><stop offset="0" class="sk-dawn-a"/><stop offset=".5" class="sk-dawn-m"/><stop offset="1" class="sk-dawn-b"/></radialGradient>' +
      '<radialGradient id="sk-glow"><stop offset="0" class="sk-glow-a"/><stop offset="1" class="sk-glow-b"/></radialGradient>' +
      '<radialGradient id="sk-hw"><stop offset="0" class="sk-hw-a"/><stop offset=".35" class="sk-hw-m"/><stop offset="1" class="sk-hw-b"/></radialGradient>' +
      '<radialGradient id="sk-hr"><stop offset="0" class="sk-hr-a"/><stop offset=".35" class="sk-hr-m"/><stop offset="1" class="sk-hr-b"/></radialGradient>' +
      '<linearGradient id="sk-tail" x1="1" y1="1" x2="0" y2="0"><stop offset="0" class="sk-tail-a"/><stop offset="1" class="sk-tail-b"/></linearGradient>' +
      '<linearGradient id="sk-veil" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="sk-veil-a"/><stop offset=".08" class="sk-veil-b"/><stop offset="1" class="sk-veil-b"/></linearGradient>' +
      '<filter id="sk-blur-l" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="11"/></filter>' +
      '<filter id="sk-blur-m" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="4.5"/></filter>' +
      '<filter id="sk-blur-s" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="1.8"/></filter>' +
      '<clipPath id="sk-above"><rect x="0" y="0" width="' + W + '" height="' + HZ + '"/></clipPath></defs>' +
      '<rect class="sk-ground" x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#sk-depth)"/>' +
      '<rect x="0" y="0" width="' + W + '" height="' + HZ + '" fill="url(#sk-dawn)" class="sk-dawnfill"/>' +
      '<g class="sk-fieldg">' + field + '</g><g class="sk-wayg">' + way + '</g>' + veil +
      '<g class="sk-moons">' + moons + '</g>' +
      '<g class="sk-runs">' + halos + spikes + lines + comets + stars + ahead + '</g>' + raceMoon + shooting +
      (todayX != null ? '<path class="sk-now" d="M' + f1(todayX) + ' 22 L' + f1(todayX) + ' ' + HZ + '"/>' +
        '<text class="sk-now-t" x="' + f1(todayX + 4) + '" y="29">NOW</text>' : '') +
      '<g clip-path="url(#sk-above)" class="sk-dawng"><circle class="sk-sunglow" cx="' + f1(sunX) + '" cy="' + HZ + '" r="64" fill="url(#sk-glow)"/>' +
      '<path class="sk-ray" d="' + rays + '"/><circle class="sk-sun" cx="' + f1(sunX) + '" cy="' + HZ + '" r="15"/></g>' +
      '<path class="sk-hills" d="' + hills + '"/><path class="sk-horizon" d="M0 ' + HZ + ' L' + W + ' ' + HZ + '"/>' +
      '<text class="sk-lab" x="14" y="' + (HZ + 20) + '">' + esc(fmtShort(days[0].iso)).toUpperCase() + '</text>' +
      '<text class="sk-lab end" x="' + (W - 14) + '" y="' + (HZ + 20) + '">GUN · ' + esc(String(PLAN.race.gun)) + '</text>' +
      '</svg><figcaption class="fig-cap"><span class="fig">Fig. I</span> The firmament of the block</figcaption></figure>';
  }

  /* the journey in three facts rather than a sentiment (v5.0.4): weeks
     run, the longest run, and how the last four finished weeks compare
     with what they asked for */
  function journeyStory(journey, today) {
    const f1 = (n) => String(Math.round(n * 10) / 10);
    const longest = Math.max(0, ...journey.weeks.flatMap((w) => w.days.map((d) => d.recorded)));
    const done = journey.weeks.filter((w) => w.end < today).slice(-4);
    const bits = [journey.activeWeeks + ' week' + (journey.activeWeeks === 1 ? '' : 's') + ' running', 'longest <b>' + f1(longest) + '</b> km'];
    if (done.length >= 2) {
      const rec = done.reduce((n, w) => n + w.recorded, 0) / done.length, plan = done.reduce((n, w) => n + w.planned, 0) / done.length;
      bits.push('last ' + done.length + ' weeks <b>' + f1(rec) + '</b> of ' + f1(plan) + ' km a week');
    }
    return bits.join(' · ');
  }

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
      '<p class="journey-story">'+(journey.runs ? journeyStory(journey, today) : 'Your first recorded run starts the story. The road ahead is already here.')+'</p>'+
      skyHTML(journey)+
      '<div class="journey-calendar"><span>'+journey.elapsedWeeks+' / '+weeks.length+' weeks elapsed</span><span>'+esc(fmtShort(PLAN.race.date))+' · '+esc(PLAN.race.city||'Race day')+'</span></div></div>'+
      '<div class="journey-landscape"><div class="journey-chart-label"><b><span class="fig">Fig. II</span> The shape of the block</b><span>km / week</span></div>'+
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
        /* each day lit like its Week card (v4.86): the run's emblem and bar
           in its class — red hard, white long, grey easy — glowing once
           recorded; a day without a run shows that night's moon */
        '<div class="journey-days" aria-label="Open a day">'+week.days.map((d,i)=>{
          const kind=!d.planned?(d.recorded?'easy':'rest'):d.cls==='quality'||d.cls==='race'?'hard':d.cls==='long'?'long':'easy';
          return '<button class="jd-'+kind+(d.recorded?' lit':'')+'" data-journey-day="'+d.iso+'" aria-label="'+DAY_NAMES[i]+', '+(d.title?esc(d.title)+', '+fmt(d.planned)+' km':'no run scheduled')+', '+fmt(d.recorded)+' km recorded"><span>'+DAY_SHORT[i].slice(0,1)+'</span>'+
            (kind!=='rest'?'<span class="jd-emb">'+emblemSVG(d.cls==='race'?'laurel':'foot')+'</span>':'<svg class="jd-moon" viewBox="0 0 12 12" aria-hidden="true">'+moonSVG(6,6,4.4,DB.moonPhase(d.iso),'dm')+'</svg>')+
            '<span class="journey-day-plot"><i style="height:'+d.planned/dailyMax*100+'%" class="'+(kind==='hard'||kind==='long'?kind:'')+'"></i>'+(d.recorded?'<em style="height:'+Math.min(100,d.recorded/dailyMax*100)+'%"></em>':'')+'</span><b>'+ (d.planned?fmt(d.planned):'–')+'</b></button>';
        }).join('')+'</div>'+
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

  /* ---- the block wall (v4.71): all 210 days on one grid ----
     Columns are weeks, rows run Monday to Sunday. A run that happened is
     lit in the distance profile's colours (grey easy, white long, red hard,
     §3); a planned run that did not is a dim outline, one still ahead a
     faint one; rest days sit dark; today wears a ring. A dropped Saturday
     buffer is rule 10 working and is not drawn as a miss. It is a picture
     of the block, not a control: the explorer above opens weeks. */
  function buildWall(journey) {
    const today = todayISO();
    const exempt = ((PLAN.shapeRule && PLAN.shapeRule.shortExempt) || []).includes('sat');
    let ran = 0, due = 0;
    const cols = journey.weeks.map((w, c) => '<span class="wl-col' + (w.start <= today && today <= w.end ? ' now' : '') +
      '" style="--c:' + c + '">' + w.days.map((d, i) => {
        const kind = d.cls === 'quality' || d.cls === 'race' ? 'hard' : d.cls === 'long' ? 'long' : 'easy';
        const past = d.iso < today;
        if (d.planned && past) { due++; if (d.recorded > 0) ran++; }
        const st = d.recorded > 0 ? 'ran ' + (d.planned ? kind : 'extra')
          : !d.planned ? 'rest'
          : past ? (exempt && i === 5 ? 'drop' : 'miss')
          : 'ahead ' + kind;
        return '<i class="wl ' + st + (d.iso === today ? ' today' : '') + '"></i>';
      }).join('') + '</span>').join('');
    const phases = journey.weeks.map((w) => '<i style="background:var(--phase-' + esc(w.phase) + ')"></i>').join('');
    return el('<section class="wall"><div class="wall-head"><h2><span class="fig">Fig. III</span> Every day of the block</h2><span>' +
      ran + ' OF ' + due + ' PLANNED RUNS SO FAR</span></div>' +
      '<div class="wall-grid" role="img" aria-label="' + ran + ' of ' + due + ' planned runs so far recorded, across ' +
      journey.weeks.length + ' weeks">' +
      '<span class="wl-days" aria-hidden="true">' + DAY_SHORT.map((n) => '<b>' + n.slice(0, 1) + '</b>').join('') + '</span>' +
      '<span class="wl-cols">' + cols + '</span><span></span><span class="wl-phases">' + phases + '</span></div>' +
      '<div class="wall-key"><span><i class="wl ran easy"></i>Easy</span><span><i class="wl ran long"></i>Long</span>' +
      '<span><i class="wl ran hard"></i>Hard</span><span><i class="wl miss"></i>Missed</span><span><i class="wl ahead easy"></i>Ahead</span></div></section>');
  }

  function buildLandmarks(journey) {
    const today=todayISO();
    let nextMarked=false;   // the first key day still ahead is lit; the rest stay outlined
    const root=el('<section class="journey-landmarks"><div class="journey-section-title"><h2>The days that count</h2><span>RED-LETTER DAYS</span></div>'+ (PLAN.keyEvents||[]).map((e,i)=>{
      const week=journey.weeks[e.wk-1], day=week.days[e.di], delta=DB.daysBetween(today,day.iso);
      const status=day.recorded>0?'Recorded':delta<0?'Past · not recorded':delta===0?'Today':delta+' days away';
      const next=delta>=0&&!nextMarked; if(next)nextMarked=true;
      return '<button class="journey-event'+(delta>=0?' ahead':'')+(next?' next':'')+'" data-event-day="'+day.iso+'"><span class="journey-event-index" aria-hidden="true">'+roman(i+1)+'</span><span><small>WEEK '+e.wk+' · '+esc(fmtShort(day.iso))+'</small><b>'+esc(e.label)+'</b><em>'+status+'</em></span><span aria-hidden="true">↗</span></button>';
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
    /* only a finished week is a shortfall: looking ahead from mid-week, the
       current week's first days are not "what was run" (v5.0.8) */
    if (DB.addDays(anchor, -1) >= todayISO()) return null;
    const ran = DB.weekKm(getDone, prev, getRunLogEntry).done;
    if (!(ran > 0)) return null;                 // nothing logged ≠ nothing run
    if (ran >= prevRow.km * r.shortfall) return null;
    if (day0.row.km < ran * r.jumpRatio) return null;
    const pct = Math.round((ran / prevRow.km) * 100);
    const ratio = Math.round((day0.row.km / ran) * 10) / 10;
    /* The fact is one line; the reasoning waits behind "Why", as on the run
       card. Open, it was eleven lines above the seven days the Week is for
       (v4.97). */
    const key = anchor + '|jump';
    return el(
      '<details class="wk-jump" data-disclosure="' + esc(key) + '"' + (openDetails.has(key) ? ' open' : '') + '><summary><b>' +
      'Week ' + (day0.week - 1) + ' recorded ' + (Math.round(ran * 10) / 10) + ' of ' + prevRow.km + ' km (' + pct + '%) · this week plans ' +
      day0.row.km + ', ' + ratio + '× that</b><small>Why</small></summary>' +
      '<div class="detail-body"><p>Missing logs or ticks may understate last week.</p><p>' + esc(r.note) + '</p></div></details>'
    );
  }

  /* ---- the light of the week (v4.77) ----
     Seven columns of the real sky, 05:00 at the top to 22:00 at the foot:
     night, twilight and day for each date and place, stars in the dark,
     sunrise and sunset ruled across, that night's moon at its phase above,
     and each day's run set in its own light — red when hard, white when
     long, lit when done. Through the autumn the weekday runs slide into
     the dark while the long run keeps the morning. */
  function weekLightHTML(week7, weekNo) {
    const T0 = 300, T1 = 1320, W = 360, TOP = 24, H = 204, CW = 34, X0 = 30;
    const GAP = (W - X0 - 4 - 7 * CW) / 6;
    const Y = (m) => TOP + ((Math.max(T0, Math.min(T1, m)) - T0) / (T1 - T0)) * H;
    const f1 = (v) => v.toFixed(1);
    const today = todayISO(), n = nowMin();
    let defs = '', cols = '', over = '', sets = [], runs = 0, dark = 0, awayFrom = -1, awayName = '';
    week7.forEach((d, i) => {
      const iso = d.iso, x = X0 + i * (CW + GAP), cx = x + CW / 2;
      const place = DB.skyPlace(iso);
      const st = place ? DB.sunTimes(iso, place.lat, place.lon, place.offsetMin) : null;
      if (place && place.away && awayFrom < 0) { awayFrom = i; awayName = place.name || ''; }
      const gid = 'wl' + iso.replace(/-/g, '');
      let stops = '';
      for (let k = 0; k <= 34; k++) {
        stops += '<stop offset="' + (k / 34).toFixed(3) + '" style="stop-opacity:' +
          skyGlow(st, T0 + (T1 - T0) * k / 34).toFixed(3) + '"/>';
      }
      defs += '<linearGradient id="' + gid + '" class="rs-sky" x1="0" y1="0" x2="0" y2="1">' + stops + '</linearGradient>';
      let art = '';
      for (let k = 0; k < 14; k++) {
        const m = T0 + (T1 - T0) * artSeed(iso + ':wl:' + k);
        if (DB.lightLevel(st, m) > 0.12) continue;
        art += '<circle class="wl-star' + (artSeed(iso + ':wl:' + k + 't') > 0.6 ? ' tw' : '') + '" style="--d:' + (artSeed(iso + ':wl:' + k + 'd') * 4).toFixed(2) +
          's" cx="' + f1(x + 3 + artSeed(iso + ':wl:' + k + 'x') * (CW - 6)) + '" cy="' + f1(Y(m)) + '" r="' + (0.45 + artSeed(iso + ':wl:' + k + 's') * 0.55).toFixed(2) + '"/>';
      }
      if (st && st.rise != null && st.set != null) {
        sets.push(st.set);
        [st.rise, st.set].forEach((m) => { if (m > T0 && m < T1) art += '<path class="wl-sunline" d="M' + f1(x) + ' ' + f1(Y(m)) + ' L' + f1(x + CW) + ' ' + f1(Y(m)) + '"/>'; });
      }
      let run = '';
      if (d.run) {
        const r = d.run, c = DB.runClass(r), lg = getRunLogEntry(iso);
        const kind = c === 'race' || c === 'quality' ? 'hard' : c === 'long' ? 'long' : 'easy';
        const ovr = getOvr(iso), off = !!(ovr.skip[r.id] || ovr.moved[r.id]);
        const banked = !off && (!!getDone(iso)[r.id] || !!(lg && lg.sec > 0));
        const y0 = Y(r.startMin), y1 = Math.max(y0 + 5, Y(r.endMin));
        runs++;
        if (st && st.set != null && r.startMin > 720 && r.endMin > st.set) dark++;
        run = '<rect class="wl-run ' + kind + (banked ? ' done' : '') + (off ? ' off' : '') + '" x="' + f1(x + 5) + '" y="' + f1(y0) + '" width="' + (CW - 10) + '" height="' + f1(y1 - y0) + '" rx="2.5"/>';
      }
      const isToday = iso === today;
      cols += '<g class="wl-col" style="--i:' + i + '"><rect class="wl-base" x="' + f1(x) + '" y="' + TOP + '" width="' + CW + '" height="' + H + '" rx="8"/>' +
        '<rect x="' + f1(x) + '" y="' + TOP + '" width="' + CW + '" height="' + H + '" rx="8" fill="url(#' + gid + ')"/>' + art +
        '<rect class="wl-frame' + (isToday ? ' today' : '') + '" x="' + f1(x + 0.5) + '" y="' + (TOP + 0.5) + '" width="' + (CW - 1) + '" height="' + (H - 1) + '" rx="7.5"/></g>' +
        (run ? '<g class="wl-rung" style="--i:' + i + '">' + run + '</g>' : '');
      over += moonSVG(cx, 10, 5.5, DB.moonPhase(iso), 'wl-moon') +
        '<text class="wl-day' + (isToday ? ' today' : '') + '" x="' + f1(cx) + '" y="' + (TOP + H + 14) + '">' + DAY_SHORT[i] + '</text>' +
        '<text class="wl-date' + (isToday ? ' today' : '') + '" x="' + f1(cx) + '" y="' + (TOP + H + 27) + '">' + Number(iso.slice(8)) + '</text>';
      if (isToday && n > T0 && n < T1) over += '<path class="wl-now" d="M' + f1(x - 3) + ' ' + f1(Y(n)) + ' L' + f1(x + CW + 3) + ' ' + f1(Y(n)) + '"/>';
    });
    let grid = '';
    [360, 720, 1080].forEach((m) => {
      grid += '<path class="wl-grid" d="M' + (X0 - 4) + ' ' + f1(Y(m)) + ' L' + (W - 2) + ' ' + f1(Y(m)) + '"/>' +
        '<text class="wl-hour" x="' + (X0 - 7) + '" y="' + f1(Y(m) + 3) + '">' + String(m / 60).padStart(2, '0') + '</text>';
    });
    const setLine = sets.length > 1 ? 'Sunset ' + DB.fmtHM(sets[0]) + ' on Monday, ' + DB.fmtHM(sets[sets.length - 1]) + ' by Sunday' : '';
    const darkLine = runs ? (dark ? dark + ' of ' + runs + ' runs finish after sunset' : 'every run finishes in daylight') : 'no runs this week';
    const line = [setLine, darkLine].filter(Boolean).join(' · ') + (awayFrom >= 0 && awayName ? ' · from ' + ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][awayFrom] + ' in ' + awayName + ' time' : '');
    return '<figure class="weeklight" role="img" aria-label="' + esc('The light of the week: each day as a column of sky from 05:00 to 22:00, with its run placed in it. ' + line + '.') + '">' +
      '<svg viewBox="0 0 ' + W + ' ' + (TOP + H + 32) + '" aria-hidden="true"><defs>' + defs + '</defs>' + grid + cols + over + '</svg>' +
      '<p class="wl-line" aria-hidden="true">' + esc(line) + '</p>' +
      '<figcaption class="fig-cap" aria-hidden="true">' + (weekNo ? '<span class="fig">Fig. ' + roman(weekNo) + '</span> ' : '') + 'The light of the week</figcaption></figure>';
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
      (day0.blockId === 'marathon' ? '<span class="wk-num' + (roman(day0.week).length > 3 ? ' long' : '') + '" aria-hidden="true">' + roman(day0.week) + '</span>' : '') +
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
    const wm = mottoFor(day0);
    if (wm) view.appendChild(el('<p class="wk-motto"><span class="rub">' + esc(wm[0].charAt(0)) + '</span>' + esc(wm[0].slice(1)) +
      ' <span class="tr">— ' + esc(wm[1]) + '</span></p>'));
    if (note) view.appendChild(el('<div class="wk-note">' + esc(note) + '</div>'));
    const jump = loadJumpNote(anchor, day0);
    if (jump) view.appendChild(jump);
    const shape = weekShapeNote(anchor, day0);
    if (shape) view.appendChild(shape);

    /* seven days, run distances as the anchors — rows double as a bar chart */
    const real = todayISO();
    const week7 = [];
    for (let i = 0; i < 7; i++) week7.push(DB.buildDay(DB.addDays(anchor, i)));
    const maxKm = Math.max(1, ...week7.map((dd) => (dd.run ? dd.run.run.km : 0)));

    // The existing daily plan, drawn on one common scale. Completion marks
    // are separate from bar height: ticking a run does not change its plan.
    const totalKm = week7.reduce((n, d) => n + (d.run ? d.run.run.km : 0), 0);
    /* One figure for the week's distance (v4.89): the km tally that sat
       beside it drew the same runs a second time, so its numbers and its
       states (banked, missed, skipped, today) moved onto these bars. */
    const started = anchor <= real;
    const wkKm = started ? DB.weekKm(getDone, anchor, getRunLogEntry) : null;
    const fmtW = (n) => (n === Math.round(n) ? n : n.toFixed(1));
    const profile = el('<section class="week-profile" aria-label="' + (wkKm ? fmtW(wkKm.done) + ' of ' + fmtW(totalKm) + ' km recorded' : 'Planned daily distances') + '">' +
      '<div class="profile-head"><div><span class="profile-label">DISTANCE PROFILE</span>' +
      (wkKm ? '<h2>' + fmtW(wkKm.done) + '<small> / ' + fmtW(Math.round(totalKm * 10) / 10) + ' km recorded</small></h2>'
        : '<h2>' + (Math.round(totalKm * 10) / 10) + '<small> km planned</small></h2>') + '</div>' +
      '<span class="profile-count">' + week7.filter((d) => d.run).length + ' run days</span></div>' +
      '<div class="profile-bars">' + week7.map((d, i) => {
        const km = d.run ? d.run.run.km : 0;
        const lg = getRunLogEntry(d.iso);
        const banked = d.run && (!!getDone(d.iso)[d.run.id] || !!(lg && lg.sec > 0));
        const cls = d.run ? DB.runClass(d.run) : 'rest';
        const kind = cls === 'race' || cls === 'quality' ? 'hard' : cls === 'long' ? 'long' : cls === 'rest' ? 'rest' : 'easy';
        const ov = getOvr(d.iso);
        const off = d.run && !banked && (ov.skip[d.run.id] || ov.moved[d.run.id]);
        const miss = d.run && !banked && !off && d.iso < real;
        return '<button class="profile-day ' + kind + (banked ? ' lit' : off ? ' off' : miss ? ' miss' : '') + '" data-date="' + d.iso + '"' +
          (d.iso === real ? ' aria-current="date"' : '') + ' aria-label="' + esc(fmtDate(d.iso) +
          ': ' + (d.run ? km + ' km, ' + d.run.title : 'No run') + (banked ? ', completed' : '')) + '">' +
          '<span class="profile-track"><i style="height:' + (km / maxKm * 100).toFixed(1) + '%"></i></span>' +
          '<b class="profile-km">' + (km || '—') + '</b><span class="profile-date">' + DAY_SHORT[i] + '</span>' +
          '<span class="profile-state">' + (banked ? '✓' : off ? 'off' : miss ? 'missed' : km ? '' : 'rest') + '</span></button>';
      }).join('') + '</div><div class="profile-legend"><span>Easy / recovery</span><span>Quality / race</span><span>Long</span>' +
      '<span>✓ completed</span></div>' +
      (wkKm ? '<p class="log-note">Logged distance, or planned distance for runs ticked done.</p>' : '') + '</section>');
    profile.querySelectorAll('[data-date]').forEach((button) => button.addEventListener('click', () => {
      state.view = 'today'; state.dateISO = button.dataset.date; state.expanded = null;
      window.scrollTo(0, 0); render();
    }));
    if (weekSealed(anchor)) profile.insertAdjacentHTML('afterbegin', sealHTML(day0.week));

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
      /* the day's sessions as a row of emblems in their own colours, lit once done */
      const embs = doables.map((b) => {
        const colour = b.cat === 'run' ? (skyKind(b) === 'hard' || skyKind(b) === 'race' ? 'var(--accent)' : skyKind(b) === 'long' ? 'var(--text)' : CAT_VAR.run) : (CAT_VAR[b.cat] || CAT_VAR.routine);
        return '<i class="d-emb' + (isDoneBlock(b) ? ' on' : '') + '" style="color:' + colour + '">' + emblemSVG(emblemKind(b)) + '</i>';
      }).join('');
      const embRow = embs ? '<div class="d-embs" aria-hidden="true">' + embs + '</div>' : '';

      let cls = 'wk-day' + (iso === real ? ' today' : iso < real ? ' past' : '');
      let runHtml, barHtml = '';
      if (day.run) {
        const km = day.run.run.km;
        const rc = DB.runClass(day.run);
        cls += ' has-run' + (km === maxKm && (rc === 'long' || rc === 'race') ? ' lr' : '') +
          ' k-' + (rc === 'quality' || rc === 'race' ? 'hard' : rc === 'long' ? 'long' : 'easy') +
          (done[day.run.id] || runLogged ? ' banked' : '');
        barHtml = '<i class="d-bar' + (done[day.run.id] || runLogged ? ' done' : ovr.skip[day.run.id] || ovr.moved[day.run.id] ? ' off' : '') +
          '" style="width:' + ((km / maxKm) * 100).toFixed(1) + '%"></i>';
        runHtml = {
          run: '<div class="d-run">' + tt(day.run.title) + '</div>' +
            '<div class="d-extras">' + glue(esc(day.run.run.shoe) + extraBits(day, ovr)) + '</div>' + statusHtml + embRow,
          km: (km === Math.round(km) ? km : km.toFixed(1)) + '<small>km</small>',
        };
      } else {
        cls += ' no-run';
        runHtml = {
          run: '<div class="d-run rest">No run</div><div class="d-extras">' + glue(extraBits(day, ovr).replace(/^ · /, '') || esc(dayHeadline(day))) + '</div>' + statusHtml + embRow,
          km: '—',
        };
      }

      const row = el(
        '<button class="' + cls + '"' + (iso === real ? ' aria-current="date"' : '') + '>' +
        /* a Book of Hours calendar page keeps the moon beside each date */
        '<span class="d-date"><b>' + DAY_SHORT[i] + '</b><span>' + d.getDate() + '</span>' +
        '<svg class="d-moon" viewBox="0 0 12 12" aria-hidden="true">' + moonSVG(6, 6, 4.4, DB.moonPhase(iso), 'dm') + '</svg></span>' +
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
    /* the days come first (v4.89): they are what this tab is opened for */
    /* an empty device mid-block — a fresh Home Screen install has its own
       storage — shows every past day "not recorded"; say why first (v5.0.5) */
    const restore = restoreNudge();
    if (restore) view.appendChild(restore);
    view.appendChild(days);
    view.appendChild(profile);
    view.appendChild(el(weekLightHTML(week7, day0.week)));
    if (day0.blockId === 'marathon') view.appendChild(buildJourney());
    const nudge = backupNudge();
    if (nudge) view.appendChild(nudge);
  }

  /* What a day with no run and no sessions is about: its longest free or
     routine block that is not waking, sleeping or an open evening ("Fly to
     Cyprus", "CHRISTMAS", "Walk"), else simply rest. */
  function dayHeadline(day) {
    const b = day.blocks.filter((x) => (x.cat === 'routine' || x.cat === 'free') && !/wake|lights out|sleep|wind down|evening|free/i.test(x.title))
      .sort((a, c) => (c.endMin - c.startMin) - (a.endMin - a.startMin))[0];
    return b ? b.title.replace(/ +[—·(].*$/, '').trim() : 'rest';
  }
  function extraBits(day, ovr) {
    const bits = day.blocks
      .filter((b) => b.doable && b.cat !== 'run' && b.cat !== 'reading' && b.cat !== 'study' && b.cat !== 'routine' &&
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
    /* each item holds together on its line where it fits (v4.96) */
    return out.length ? ' · ' + out.map((x) => '<span class="xb">' + esc(x) + '</span>').join(' · ') : '';
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
    view.appendChild(buildWall(journey));
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
    /* the coda belongs with the recovery rows it follows, not loose under the
       closed archive, and it speaks to the runner, not the developer (v4.95) */
    archive.appendChild(rows);
    archive.appendChild(el('<p class="journey-coda">After the recovery fortnight the standing week takes over: three easy runs, the full gym split, until the next goal is set.</p>'));
    view.appendChild(archive);
  }

  /* ================= reference view ================= */
  function renderRef() {
    const view = document.getElementById('view');
    view.innerHTML = '';
    /* a pace reads as a figure with its unit beside it, small; "see below"
       becomes a way to get there (v5.0.9) */
    const refRow = (k, v) => {
      const num = v.match(/^(\d+:\d+)\s*(\/km)$/);
      const val = num ? esc(num[1]) + '<small class="u">' + esc(num[2]) + '</small>'
        : /\bsee below\b/.test(v) ? esc(v.replace(/\s*—?\s*see below\b/, '')) + ' <button class="ref-jump" data-ref-jump="ref-easy-pace-by-phase">Easy pace by phase ↓</button>'
        : esc(v);
      return '<div class="ref-row pace-row' + (num ? ' numeric' : '') + '"><span>' + esc(k) + '</span><span class="v">' + val + '</span></div>';
    };
    const section = (id, node) => { node.id = id; node.tabIndex = -1; return node; };
    /* the race gets a statement card, not a table */
    const cd = DB.raceCountdown(todayISO());
    const cdBit = cd.past ? 'DONE — MARATHONER'
      : cd.days === 0 ? 'RACE DAY'
      : cd.weeks === 0 ? cd.rem + ' DAY' + (cd.rem === 1 ? '' : 'S') + ' TO THE GUN'
      : cd.weeks + 'W ' + cd.rem + 'D TO THE GUN';
    view.appendChild(el('<div class="ref ref-heading" id="ref-top"><h1>Reference</h1><p>Your training field guide</p></div>'));
    /* The field guide is a book (v4.78): a contents page, filled in below
       once the chapters exist, and each chapter numbered in red. */
    const index = el('<nav class="ref-index" aria-label="Reference chapters"><h2 class="rc-h">Contents</h2><div class="rc-list"></div></nav>');
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
      (() => { const rd = DB.buildDay(PLAN.race.date); return rd.run ? runSkyHTML(PLAN.race.date, rd.run, 'race', 'rc', null) : ''; })() +
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
    const paces = el(
      '<div class="ref" id="ref-paces" tabindex="-1">' +
      '<h2>Paces</h2>' + paceSpectrumHTML() + '<div class="ref-card pace-card">' +
      PLAN.paces.map((p) => refRow(p.type, withZones(p.pace))).join('') + '</div>' +
      '<div class="ref-note">' + esc(PLAN.recalibration) + '</div>' +
      '</div>'
    );
    paces.querySelectorAll('[data-ref-jump]').forEach((j) => j.addEventListener('click', () => {
      const target = document.getElementById(j.dataset.refJump);
      if (!target) return;
      if (target.tagName === 'DETAILS') target.open = true;
      (target.querySelector('summary') || target).focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' });
    }));
    view.appendChild(paces);
    view.appendChild(buildEasyBandSection());
    view.appendChild(section('ref-zones', buildZoneSection()));
    view.appendChild(section('ref-log', buildTrainingLogSection()));
    view.appendChild(buildRecalSection());
    view.appendChild(buildShoeSection());
    view.appendChild(buildOdoSection());
    view.appendChild(section('ref-fuel', buildFuelSection()));
    view.appendChild(el(
      '<div class="ref">' +
      '<h2>Rules of the block</h2><ol class="ref-list">' +
      PLAN.rules.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ol>' +
      '<h2>Weekly load budget</h2>' + weekHoursHTML() + '<div class="ref-note">' + esc(PLAN.loadBudget) + '</div>' +
      (PLAN.openQuestions.some((q) => !/ANSWERED|SHIPPED/.test(q)) ? '<h2>Open questions</h2><ul class="ref-list qs">' : '<h2>Settled questions</h2><ul class="ref-list qs settled">') +
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
    let chapters = 0;
    Array.from(view.children).filter(node => node.matches('div.ref:not(.ref-heading)')).forEach(node => {
      const heading = node.querySelector('h2'); if (!heading) return;
      const title = heading.textContent;
      const id = node.id || 'ref-' + title.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      const chapter = roman(++chapters);
      const fold = el('<details class="ref-fold" id="' + esc(id) + '" data-disclosure="' + esc(id) +
        '"><summary><b class="chap" aria-hidden="true">' + chapter + '</b><h2>' + esc(title) + '</h2><span aria-hidden="true">+</span></summary></details>');
      index.querySelector('.rc-list').appendChild(el('<button data-ref-target="' + esc(id) + '"><b aria-hidden="true">' + chapter + '</b><span>' + esc(title) + '</span></button>'));
      fold.open = openDetails.has(id);
      node.removeAttribute('id'); node.removeAttribute('tabindex'); heading.remove();
      node.before(fold); fold.appendChild(node);
    });
    view.querySelector('.ref-heading p').textContent = 'Your training field guide, in ' + roman(chapters) + ' chapters';
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

  /* The tune-up as a ruler (v4.81): half-marathon time along the bottom,
     the plan's anchors (PLAN.recalibrationAnchors) laid on it as bands with
     their marathon targets, and the saved result pinned where it landed. */
  function recalRulerHTML(halfSec) {
    const anchors = (PLAN.recalibrationAnchors || []).map((a) => {
      const t = String(a.half).replace(/[~≈]/g, '').split(/\s*[–-]\s*/).map((x) => parseHalf(x.length <= 4 ? x + ':00' : x));
      if (!t[0]) return null;
      const lo = t[0], hi = t[1] || t[0];
      return { lo: lo - (t[1] ? 0 : 45), hi: hi + (t[1] ? 59 : 45), target: a.target, first: false };
    }).filter(Boolean);
    if (!anchors.length) return '';
    anchors[0].first = true;
    const W = 320, Y = 40, lo = Math.floor((Math.min(...anchors.map((a) => a.lo)) - 150) / 300) * 300, hi = Math.ceil((Math.max(...anchors.map((a) => a.hi)) + 150) / 300) * 300;
    const X = (sec) => 12 + ((Math.max(lo, Math.min(hi, sec)) - lo) / (hi - lo)) * (W - 24);
    const hm = (sec) => Math.floor(sec / 3600) + ':' + String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    let ticks = '';
    for (let t = lo; t <= hi; t += 60) {
      const x = X(t), major = t % 300 === 0;
      ticks += '<path class="rr-tick' + (major ? ' major' : '') + '" d="M' + x.toFixed(1) + ' ' + Y + ' L' + x.toFixed(1) + ' ' + (Y + (major ? 6 : 3)) + '"/>' +
        (major ? '<text class="rr-t" x="' + x.toFixed(1) + '" y="' + (Y + 17) + '">' + hm(t) + '</text>' : '');
    }
    const bands = anchors.map((a) => {
      const x0 = X(a.lo), x1 = X(a.hi);
      return '<rect class="rr-band' + (a.first ? ' goal' : '') + '" x="' + x0.toFixed(1) + '" y="' + (Y - 12) + '" width="' + Math.max(4, x1 - x0).toFixed(1) + '" height="12" rx="3"/>' +
        '<text class="rr-l' + (a.first ? ' goal' : '') + '" x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (Y - 18) + '">' + esc(a.target) + '</text>';
    }).join('');
    const pin = halfSec ? '<path class="rr-pin" d="M' + X(halfSec).toFixed(1) + ' ' + (Y - 15) + ' L' + X(halfSec).toFixed(1) + ' ' + (Y + 2) + '"/>' +
      '<circle class="rr-dot" cx="' + X(halfSec).toFixed(1) + '" cy="' + (Y - 6) + '" r="4"/>' : '';
    return '<figure class="recal-ruler" role="img" aria-label="' + esc('The tune-up anchors on a half-marathon time scale: ' +
      (PLAN.recalibrationAnchors || []).map((a) => a.half + ' means ' + a.target).join('; ') + (halfSec ? '; your time ' + fmtClock(halfSec) : '')) + '">' +
      '<svg viewBox="0 0 ' + W + ' ' + (Y + 22) + '" aria-hidden="true"><path class="rr-base" d="M12 ' + Y + ' L' + (W - 12) + ' ' + Y + '"/>' +
      ticks + bands + pin + '</svg><figcaption class="fig-cap"><span class="fig">Half</span> → the marathon it earns</figcaption></figure>';
  }

  function buildRecalSection() {
    const saved = readJSONSafeString('recal');
    const wrap = el(
      '<div class="ref"><h2>Tune-up recalibrator</h2><div class="ref-card data-card">' +
      '<div class="recal-fig">' + recalRulerHTML(parseHalf(saved)) + '</div>' +
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
      wrap.querySelector('.recal-fig').innerHTML = recalRulerHTML(sec);
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
  /* The easy bands as a ladder (v4.82): one rung per phase on a single pace
     axis, slower on the left and quicker on the right, the legal band
     outlined and the clear-day range filled, this phase lit — and the median
     of your last few logged easy runs ruled across every rung, so the band
     and what you actually run sit on the same scale. */
  function paceLadderHTML(bands, live) {
    const span = (str) => String(str).split(/\s*[–-]\s*/).map(DB.parsePace);
    const rungs = bands.map((b, i) => {
      const [bl, bh] = span(b.band), [gl, gh] = span(b.good);
      const to = i + 1 < bands.length ? bands[i + 1].fromWk - 1 : 30;
      return { bl, bh, gl, gh, now: b === live, label: b.fromWk === to ? 'Wk ' + b.fromWk : 'Wk ' + b.fromWk + '–' + to };
    }).filter((r) => r.bl && r.bh && r.gl && r.gh);
    if (!rungs.length) return '';
    const easy = runLogHistory().filter((e) => e.cls === 'easy' && !e.x && e.iso <= todayISO()).slice(-6);
    const med = easy.length >= 3 ? easy.map((e) => e.paceSec).sort((a, b) => a - b)[Math.floor(easy.length / 2)] : null;
    const slow = Math.ceil((Math.max(...rungs.map((r) => r.bh), med || 0) + 4) / 10) * 10;
    const fast = Math.floor((Math.min(...rungs.map((r) => r.bl), med || 9999) - 4) / 10) * 10;
    const L = 64, R = 300, X = (sec) => L + ((slow - sec) / (slow - fast)) * (R - L), RH = 20, TOP = 8;
    let svg = '';
    for (let t = fast; t <= slow; t += 10) {
      const x = X(t);
      svg += '<path class="pl-grid" d="M' + x.toFixed(1) + ' ' + TOP + ' L' + x.toFixed(1) + ' ' + (TOP + rungs.length * RH) + '"/>' +
        '<text class="pl-t" x="' + x.toFixed(1) + '" y="' + (TOP + rungs.length * RH + 12) + '">' + DB.fmtPaceSec(t) + '</text>';
    }
    rungs.forEach((r, i) => {
      const y = TOP + i * RH + 4, h = RH - 8;
      svg += '<text class="pl-l' + (r.now ? ' now' : '') + '" x="' + (L - 8) + '" y="' + (y + h - 2) + '">' + esc(r.label) + '</text>' +
        '<rect class="pl-band' + (r.now ? ' now' : '') + '" x="' + X(r.bh).toFixed(1) + '" y="' + y + '" width="' + (X(r.bl) - X(r.bh)).toFixed(1) + '" height="' + h + '" rx="3"/>' +
        '<rect class="pl-good' + (r.now ? ' now' : '') + '" x="' + X(r.gh).toFixed(1) + '" y="' + (y + 2) + '" width="' + (X(r.gl) - X(r.gh)).toFixed(1) + '" height="' + (h - 4) + '" rx="2"/>';
    });
    if (med) {
      const x = X(med);
      svg += '<path class="pl-you" d="M' + x.toFixed(1) + ' ' + (TOP - 4) + ' L' + x.toFixed(1) + ' ' + (TOP + rungs.length * RH) + '"/>' +
        '<circle class="pl-youdot" cx="' + x.toFixed(1) + '" cy="' + (TOP - 4) + '" r="2.6"/>';
    }
    return '<figure class="pace-ladder" role="img" aria-label="' + esc('Easy pace bands by phase, quicker to the right' +
      (med ? '; your last ' + easy.length + ' easy runs have a median of ' + DB.fmtPaceSec(med) + ' per km' : '')) + '">' +
      '<svg viewBox="0 0 320 ' + (TOP + rungs.length * RH + 18) + '" aria-hidden="true">' + svg + '</svg>' +
      '<figcaption class="pl-cap"><span><i class="k band"></i>band</span><span><i class="k good"></i>clear day</span>' +
      (med ? '<span><i class="k you"></i>your last ' + easy.length + ' easy · ' + DB.fmtPaceSec(med) + '</span>' : '') +
      '<span class="dir">slower ← → quicker</span></figcaption></figure>';
  }

  /* This week, hour by hour (v4.86): a Book of Hours laid flat. Seven
     strips of twenty-four hours, each block painted in its category's
     colour (a run in its class: red hard, white long), the nights from
     lights out to waking dark, and every category's hours totalled from
     the week as planned. It sits over the plan's own load budget. */
  const HOUR_NAMES = { run: 'running', xt: 'basketball', gym: 'gym', study: 'study', german: 'German', work: 'work & commute',
    meal: 'meals', free: 'free', reading: 'reading', routine: 'routine' };
  function weekHoursHTML() {
    const today = todayISO(), mon = mondayOf(today);
    const L = 22, R = 312, RH = 13, GAP = 5, TOP = 14, X = (m) => L + (m / 1440) * (R - L);
    const tot = {}, days = [];
    let sleep = 0, svg = '';
    for (const h of [0, 6, 12, 18, 24]) {
      svg += '<path class="wh-grid" d="M' + X(h * 60).toFixed(1) + ' ' + (TOP - 3) + ' V' + (TOP + 7 * (RH + GAP) - GAP + 2) + '"/>' +
        '<text class="wh-t" x="' + X(h * 60).toFixed(1) + '" y="' + (TOP - 6) + '">' + String(h % 24).padStart(2, '0') + '</text>';
    }
    for (let i = 0; i < 7; i++) {
      const iso = DB.addDays(mon, i), day = DB.buildDay(iso), y = TOP + i * (RH + GAP);
      const wake = day.blocks.find((b) => /wake|alarm/i.test(b.title));
      const out = day.blocks.find((b) => /lights out/i.test(b.title));
      const night = [[0, wake ? wake.startMin : 0], [out ? out.startMin : 1440, 1440]];
      night.forEach(([a, b], k) => {
        if (b <= a) return;
        sleep += b - a;
        svg += '<rect class="wh-sleep" x="' + X(a).toFixed(1) + '" y="' + y + '" width="' + (X(b) - X(a)).toFixed(1) + '" height="' + RH + '"/>';
        /* a few still stars in each night, placed the same way every time */
        for (let s = 0; s < Math.floor((b - a) / 150); s++) {
          const f = ((i * 7 + s * 13 + k * 5) % 17) / 17, g = ((i * 11 + s * 7 + k * 3) % 13) / 13;
          svg += '<circle class="wh-star" cx="' + (X(a + 20 + f * (b - a - 40))).toFixed(1) + '" cy="' + (y + 3 + g * (RH - 6)).toFixed(1) + '" r="' + (s % 3 ? 0.5 : 0.8) + '"/>';
        }
      });
      day.blocks.forEach((b) => {
        if (b === out) return;
        const s = Math.max(0, b.startMin), e = Math.min(1440, b.endMin);
        if (e <= s) return;
        tot[b.cat] = (tot[b.cat] || 0) + (e - s);
        const rc = b.run ? DB.runClass(b) : '';
        svg += '<rect class="wh-b' + (rc === 'quality' || rc === 'race' ? ' hard' : rc === 'long' ? ' long' : '') + '" x="' + (X(s) + 0.4).toFixed(1) + '" y="' + y +
          '" width="' + Math.max(0.8, X(e) - X(s) - 0.8).toFixed(1) + '" height="' + RH + '" style="--c:' + (CAT_VAR[b.cat] || CAT_VAR.routine) + '"/>';
      });
      svg += '<text class="wh-d' + (iso === today ? ' now' : '') + '" x="' + (L - 7) + '" y="' + (y + RH - 3) + '">' + DAY_SHORT[i].slice(0, 1) + '</text>';
      if (iso === today) svg += '<rect class="wh-today" x="' + (L - 1.5) + '" y="' + (y - 1.5) + '" width="' + (R - L + 3) + '" height="' + (RH + 3) + '" rx="2"/>';
      days.push(iso);
    }
    const hrs = (m) => { const h = Math.round(m / 30) / 2; return (h === Math.round(h) ? h : h.toFixed(1)) + 'h'; };
    const cats = Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
    const legend = cats.map((c) => '<span><i class="wh-e" style="color:' + (CAT_VAR[c] || CAT_VAR.routine) + '">' + emblemSVG(emblemKind({ cat: c, title: '' })) + '</i>' +
      esc(HOUR_NAMES[c] || c) + ' <b>' + hrs(tot[c]) + '</b></span>').join('') +
      '<span><i class="wh-e wh-night">' + emblemSVG('moon') + '</i>sleep <b>' + hrs(sleep) + '</b></span>';
    const H = TOP + 7 * (RH + GAP) - GAP + 4;
    return '<figure class="week-hours" role="img" aria-label="' + esc('This week as planned, hour by hour: ' +
      cats.map((c) => (HOUR_NAMES[c] || c) + ' ' + hrs(tot[c])).join(', ') + ', sleep ' + hrs(sleep) + '.') + '">' +
      '<figcaption class="wh-head"><span class="fig">Fig.</span> This week, hour by hour <small>' + esc(fmtShort(days[0]) + ' – ' + fmtShort(days[6])) + ' · as planned</small></figcaption>' +
      '<svg viewBox="0 0 320 ' + H + '" aria-hidden="true">' + svg + '</svg>' +
      '<div class="wh-legend">' + legend + '</div></figure>';
  }

  /* The block's paces on one line (v4.86), slower to the left: this
     phase's easy band, marathon pace and the stretch bet, and the tempo's
     clear-day readout drawn dashed because it is a readout, not a target.
     The gap from easy to MP is measured, and your last logged MP segment
     is pinned where it landed. Every number is read from the plan. */
  function paceSpectrumHTML() {
    const span = (str) => String(str || '').split(/\s*[–-]\s*/).map(DB.parsePace);
    const band = DB.easyBand(DB.weekNumber(todayISO()));
    const [bl, bh] = band ? span(band.band) : [null, null];
    const mp = DB.parsePace(String(PLAN.race.goalPace).replace(/\/km$/, ''));
    const st = DB.parsePace(String(PLAN.race.stretchPace).replace(/\/km$/, ''));
    const tm = String(PLAN.tempoPaceNote || '').match(/CLEAR day expect (\d:\d\d)\s*[–-]\s*(\d:\d\d)/);
    const [tl, th] = tm ? [DB.parsePace(tm[1]), DB.parsePace(tm[2])] : [null, null];
    if (!bl || !bh || !mp) return '';
    const lastMp = runLogHistory().filter((e) => e.mpPaceSec > 0 && e.iso <= todayISO()).pop();
    const pts = [bl, bh, mp, st, tl, th, lastMp && lastMp.mpPaceSec].filter(Boolean);
    const slow = Math.ceil((Math.max(...pts) + 8) / 15) * 15, fast = Math.floor((Math.min(...pts) - 8) / 15) * 15;
    const L = 12, R = 308, AX = 46, X = (sec) => L + ((slow - sec) / (slow - fast)) * (R - L);
    let svg = '';
    for (let t = Math.ceil(fast / 30) * 30; t <= slow; t += 30) {
      svg += '<path class="ps-tick" d="M' + X(t).toFixed(1) + ' ' + (AX - 3) + ' V' + (AX + 3) + '"/>' +
        '<text class="ps-t" x="' + X(t).toFixed(1) + '" y="' + (AX + 14) + '">' + DB.fmtPaceSec(t) + '</text>';
    }
    svg = '<path class="ps-axis" d="M' + L + ' ' + AX + ' H' + R + '"/>' + svg;
    /* easy: the band on the axis, lit grey */
    svg += '<rect class="ps-easy" x="' + X(bh).toFixed(1) + '" y="' + (AX - 5) + '" width="' + (X(bl) - X(bh)).toFixed(1) + '" height="10" rx="5"/>' +
      '<text class="ps-l" x="' + ((X(bh) + X(bl)) / 2).toFixed(1) + '" y="' + (AX - 13) + '">EASY</text>';
    /* threshold readout: dashed, red, as a readout */
    if (tl && th) svg += '<rect class="ps-tempo" x="' + X(th).toFixed(1) + '" y="' + (AX - 5) + '" width="' + (X(tl) - X(th)).toFixed(1) + '" height="10" rx="5"/>' +
      '<text class="ps-l hard" x="' + ((X(th) + X(tl)) / 2).toFixed(1) + '" y="' + (AX - 13) + '">Z4 READOUT</text>';
    /* marathon pace: the race's own mark, and the stretch bet beside it */
    svg += '<path class="ps-mp" d="M' + X(mp).toFixed(1) + ' ' + (AX - 30) + ' V' + (AX + 5) + '"/>' +
      '<circle class="ps-mpdot" cx="' + X(mp).toFixed(1) + '" cy="' + (AX - 30) + '" r="3.2"/>' +
      '<text class="ps-l mp" x="' + X(mp).toFixed(1) + '" y="' + (AX - 37) + '">MP ' + DB.fmtPaceSec(mp) + '</text>';
    if (st) svg += '<path class="ps-st" d="M' + X(st).toFixed(1) + ' ' + (AX - 16) + ' V' + (AX + 5) + '"/>' +
      '<circle class="ps-stdot" cx="' + X(st).toFixed(1) + '" cy="' + (AX - 16) + '" r="2.6"/>';
    /* the distance between easy and marathon pace, bracketed under the line */
    const gap = bl - mp, gy = AX + 26;
    if (gap > 0) svg += '<path class="ps-gap" d="M' + X(bl).toFixed(1) + ' ' + (gy - 4) + ' V' + gy + ' H' + X(mp).toFixed(1) + ' V' + (gy - 4) + '"/>' +
      '<text class="ps-g" x="' + ((X(bl) + X(mp)) / 2).toFixed(1) + '" y="' + (gy + 11) + '">' + gap + ' s/km easy → MP</text>';
    if (lastMp) {
      const x = X(lastMp.mpPaceSec);
      svg += '<path class="ps-you" d="M' + x.toFixed(1) + ' ' + (AX - 8) + ' V' + (AX + 8) + '"/><circle class="ps-youdot" cx="' + x.toFixed(1) + '" cy="' + (AX + 8) + '" r="2.4"/>';
    }
    const label = 'Paces, slower to the left: easy ' + band.band + ', marathon pace ' + DB.fmtPaceSec(mp) +
      (st ? ', stretch ' + DB.fmtPaceSec(st) : '') + (tl ? ', threshold readout ' + tm[1] + '–' + tm[2] : '') +
      (lastMp ? '; your last marathon-pace segment ' + DB.fmtPaceSec(Math.round(lastMp.mpPaceSec)) : '');
    return '<figure class="pace-spectrum" role="img" aria-label="' + esc(label) + '"><svg viewBox="0 0 320 ' + (gy + 16) + '" aria-hidden="true">' + svg + '</svg>' +
      '<figcaption class="pl-cap"><span><i class="k ps-ke"></i>easy · Wk ' + DB.weekNumber(todayISO()) + '</span><span><i class="k ps-kmp"></i>MP</span>' +
      (st ? '<span><i class="k ps-kst"></i>stretch ' + DB.fmtPaceSec(st) + '</span>' : '') +
      (lastMp ? '<span><i class="k you"></i>your last MP · ' + DB.fmtPaceSec(Math.round(lastMp.mpPaceSec)) + '</span>' : '') +
      '<span class="dir">slower ← → quicker</span></figcaption></figure>';
  }

  function buildEasyBandSection() {
    const wk = DB.weekNumber(todayISO());
    const live = DB.easyBand(wk);
    const bands = PLAN.easyBands;
    const rows = bands.map((b, i) => {
      const to = i + 1 < bands.length ? bands[i + 1].fromWk - 1 : 30;
      const span = b.fromWk === to ? 'Wk ' + b.fromWk : 'Wk ' + b.fromWk + '–' + to;
      const now = b === live;
      return '<div class="ref-row stack' + (now ? ' is-now' : '') + '">' +
        '<span>' + (now ? '<i class="dot" style="background:var(--accent)"></i>' : '') +
        esc(span) + '</span>' +
        '<span class="v">' + esc(b.band) + ' · good day <b>' + esc(b.good) + '</b></span></div>';
    }).join('');
    const bm = PLAN.benchmark;
    return el(
      '<div class="ref"><h2>Easy pace by phase</h2>' + paceLadderHTML(bands, live) + '<div class="ref-card">' + rows + '</div>' +
      '<div class="ref-note no-init"><b>Now (Wk ' + wk + '):</b> band ' + esc(live.band) +
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
      '<div class="ref-note no-init">' + live + '</div>' +
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
      const rows = pts.map(p => '<tr><td>' + esc(fmtShort(p.iso)) + '</td><td>' + p.ef.toFixed(3) +
        '</td><td>' + signed(p.pct) + '</td></tr>').join('');
      /* the fitted line, drawn (least squares in the chart's own space — the
         same fit the reading reports), and the ground under the runs */
      const n = pts.length, mxp = pts.reduce((a, p) => a + p.x, 0) / n, myp = pts.reduce((a, p) => a + p.y, 0) / n;
      const sxx = pts.reduce((a, p) => a + (p.x - mxp) * (p.x - mxp), 0), sxy = pts.reduce((a, p) => a + (p.x - mxp) * (p.y - myp), 0);
      const slope = sxx ? sxy / sxx : 0, fy = (x) => myp + slope * (x - mxp);
      const zeroY = (chart.ticks.find((t) => t.value === 0) || { y: 100 }).y;
      const area = 'M' + pts[0].x.toFixed(2) + ' ' + zeroY + ' ' + pts.map((p) => 'L' + p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' ') +
        ' L' + pts[n - 1].x.toFixed(2) + ' ' + zeroY + ' Z';
      const gid = 'efg-' + cls;
      const art = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ef-ga"/><stop offset="1" class="ef-gb"/></linearGradient></defs>' +
        '<path class="ef-area" d="' + area + '" fill="url(#' + gid + ')"/>' +
        (n >= 4 ? '<path class="ef-fit" d="M' + pts[0].x.toFixed(2) + ' ' + fy(pts[0].x).toFixed(2) + ' L' + pts[n - 1].x.toFixed(2) + ' ' + fy(pts[n - 1].x).toFixed(2) + '"/>' : '') +
        '<circle class="ef-halo" cx="' + pts[n - 1].x.toFixed(2) + '" cy="' + pts[n - 1].y.toFixed(2) + '" r="9"/>';
      return '<figure class="ef-chart ef-' + esc(cls) + '"><figcaption><span class="ef-kind">' + esc(label.charAt(0).toUpperCase() + label.slice(1)) +
        ' run efficiency</span><strong>' + status + '</strong></figcaption>' +
        '<svg viewBox="0 0 340 194" width="340" height="194" role="img" aria-label="' +
        esc(label + ' run EF relative to ' + chart.reference.iso + '. Scale minus ' + chart.extent +
        ' to plus ' + chart.extent + ' percent. ' + pts.length + ' runs. Fitted change ' + signed(chart.change)) + '">' +
        ticks + art + '<polyline points="' + pts.map(p => p.x.toFixed(2)+','+p.y.toFixed(2)).join(' ') + '"/>' + dots +
        '<text x="48" y="184">' + date(pts[0].iso) + '</text><text x="326" y="184" text-anchor="end">' +
        date(pts[pts.length-1].iso) + '</text></svg>' +
        '<div class="ef-reading"><b>' + signed(chart.change) + '</b><span>Fitted change · last ' + pts.length +
        ' runs' + (pts.length < 4 ? '<br>Too few runs to call a trend' : '') + '</span></div>' +
        paceAtHrHTML(chart) +
        '<p class="ef-explain">Reference: EF ' + chart.reference.ef.toFixed(3) + ' on ' + esc(fmtShort(chart.reference.iso)) +
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
          '</div><div class="dist-key">' + secs.map((v,i)=>v ? '<span><i style="background:'+tone[i]+'"></i>Z'+(i+1)+' '+Math.round(v/total*100)+'% · '+Math.round(v/60)+' min</span>' : '').join('') +
          '</div><p class="log-note dist-sum">'+Math.round(easy)+'% at Z2 or easier · plan target '+PLAN.intensityTarget.easyPct+'%+</p><p class="log-note">'+note+'</p></div>';
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
    /* The recent runs as a ledger, one ruled line each (v4.98): ten cards
       of three stacked figures took a screen and a half to say what a
       column of fourteen rows says at a glance. The mark is the run's class
       in its colour (red hard, white long, grey easy), as everywhere else. */
    const markTone = (c) => c === 'quality' || c === 'race' ? 'var(--accent)' : c === 'long' ? 'var(--text)' : c === 'recovery' ? 'var(--t3)' : 'var(--cat-run)';
    const kmTxt = (k) => String(Math.round(k * 100) / 100);
    const rows = '<table class="ledger"><thead><tr><th scope="col">Run</th><th scope="col">km</th><th scope="col">Pace</th>' +
      '<th scope="col">HR</th><th scope="col">EF</th></tr></thead><tbody>' +
      entries.filter((e) => e.iso <= todayISO()).slice(-14).reverse().map((e) => {
        const notes = [
          e.temp != null ? '<i class="tmp' + (e.tooHot ? ' hot' : '') + '">' + e.temp + '°</i>' : '',
          e.x ? '<i class="xout">not in trends</i>' : '',
          e.mp ? '<i class="xout">MP' + (e.mpHr ? ' logged' : ' · easy part not logged') + '</i>' : '',
        ].filter(Boolean).join(' · ');
        return '<tr class="lg-' + (e.hard ? 'hard' : e.cls === 'long' ? 'long' : 'easy') + '"><th scope="row">' +
          '<i class="lg-mark" style="color:' + markTone(e.cls) + '">' + emblemSVG(e.cls === 'race' ? 'laurel' : 'foot') + '</i>' +
          esc(fmtShort(e.iso)) + (notes ? '<small>' + notes + '</small>' : '') + '</th>' +
          '<td>' + kmTxt(e.km) + '</td><td>' + esc(e.pace || '—') + (e.adj ? '<small class="adj">→ ' + esc(e.adj) + '</small>' : '') + '</td>' +
          '<td>' + (e.hr || '—') + '</td><td><b>' + fmtEf(e.ef) + '</b></td></tr>';
      }).join('') + '</tbody></table>';
    return el(
      '<div class="ref"><h2>Training log</h2>' + spark +
      '<div class="ref-card">' + rows + '</div>' +
      '<div class="ref-note">Efficiency factor (EF) is metres per minute ÷ average HR — the bold figure; higher is fitter. ' +
      'Compare like with like: easy runs against easy runs (hard days are marked red), and mind ' +
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
  /* The zones as a staircase (v4.80): each zone a step as wide as its bpm
     band and a little higher than the last, grey where the block lives and
     red where it hurts, with the last logged run pinned to its heartbeat. */
  function zoneScaleHTML(zones, last) {
    const W = 320, BASE = 58, x0 = 14, x1 = W - 14, lo = zones[0].lo, hi = zones[zones.length - 1].hi;
    const X = (b) => x0 + ((b - lo) / (hi - lo)) * (x1 - x0);
    let steps = '', labels = '';
    zones.forEach((z, k) => {
      const h = 10 + k * 8, a = X(z.lo), b = X(z.hi);
      steps += '<rect class="zs z' + z.z + '" x="' + (a + 0.8).toFixed(1) + '" y="' + (BASE - h) + '" width="' + (b - a - 1.6).toFixed(1) + '" height="' + h + '" rx="2"/>' +
        '<text class="zs-k" x="' + ((a + b) / 2).toFixed(1) + '" y="' + (BASE - h - 4) + '">Z' + z.z + '</text>';
      labels += '<text class="zs-b" x="' + a.toFixed(1) + '" y="' + (BASE + 12) + '">' + z.lo + '</text>';
    });
    labels += '<text class="zs-b" x="' + X(hi).toFixed(1) + '" y="' + (BASE + 12) + '">' + hi + '</text>';
    let pin = '';
    if (last && last.hr) {
      const px = X(Math.max(lo, Math.min(hi, last.hr)));
      pin = '<path class="zs-pin" d="M' + px.toFixed(1) + ' ' + (BASE + 1) + ' L' + px.toFixed(1) + ' 6"/>' +
        '<circle class="zs-dot" cx="' + px.toFixed(1) + '" cy="6" r="3.2"/>' +
        '<text class="zs-pt' + (px > W - 90 ? ' end' : '') + '" x="' + (px + (px > W - 90 ? -7 : 7)).toFixed(1) + '" y="9">' + last.hr + ' bpm · ' + esc(fmtShort(last.iso)) + '</text>';
    }
    return '<figure class="zscale" role="img" aria-label="' + esc('Heart-rate zones from ' + lo + ' to ' + hi + ' bpm' +
      (last && last.hr ? '; last logged run at ' + last.hr + ' bpm' : '')) + '"><svg viewBox="0 0 ' + W + ' ' + (BASE + 16) + '" aria-hidden="true">' +
      steps + '<path class="zs-base" d="M' + x0 + ' ' + BASE + ' L' + x1 + ' ' + BASE + '"/>' + labels + pin + '</svg></figure>';
  }

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
        recent = '<div class="ref-note no-init"><b>Last logged run:</b> ' + esc(fmtShort(last.iso)) +
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
      (zones ? zoneScaleHTML(zones, hist.length ? hist[hist.length - 1] : null) : '') +
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

  /* The shoes as plates (v4.85): each wears its tier (easy grey, quality
     light, race red), its emblem and a count of what the block asks of
     it — every run prescribed in that shoe alone, and how much of it is
     banked. The race shoe is counted against its lifetime cap instead,
     because for that shoe the budget is the whole point. */
  function buildShoeSection() {
    const today = todayISO(), b = PLAN.blocks[0];
    const fmt = (n) => (n === Math.round(n) ? String(n) : n.toFixed(1));
    const tally = {};
    for (let i = 0; i < b.weeks * 7; i++) {
      const iso = DB.addDays(b.start, i), day = DB.buildDay(iso);
      if (!day.run) continue;
      const t = tally[day.run.run.shoe] || (tally[day.run.run.shoe] = { runs: 0, km: 0, banked: 0 });
      t.runs++; t.km += day.run.run.km;
      if (iso <= today) t.banked += DB.recordedKm(day, getDone(iso), getRunLogEntry(iso));
    }
    const p4 = DB.pro4Status(getDone, today);
    const plates = PLAN.shoes.map((s, i) => {
      const tier = /race/i.test(s.job) ? 'race' : /quality|MP/i.test(s.job) ? 'quality' : 'easy';
      const key = Object.keys(tally).find((k) => s.shoe.endsWith(k));
      const t = key ? tally[key] : { runs: 0, km: 0, banked: 0 };
      let bar, line;
      if (tier === 'race') {
        const next = p4.outings.find((o) => !o.done && !o.optional && o.iso >= today);
        bar = Math.min(1, p4.used / p4.cap);
        line = '<b>' + fmt(p4.used) + '</b> of ≈' + p4.cap + ' km before the gun' +
          (next ? '<br>Next · Wk ' + next.wk + ' ' + esc(next.label.replace(/\s*\(.*\)$/, '').toLowerCase()) + ', ' + esc(fmtShort(next.iso)) : '');
      } else {
        bar = t.km ? Math.min(1, t.banked / t.km) : 0;
        line = '<b>' + Math.round(t.banked) + '</b> of ' + Math.round(t.km) + ' km banked · ' + t.runs + ' runs';
      }
      return '<div class="shoe-plate t-' + tier + '">' +
        '<span class="sp-emb">' + emblemSVG(tier === 'race' ? 'laurel' : 'foot') + '</span>' +
        '<div class="sp-body"><div class="sp-head"><b class="sp-name">' + esc(s.shoe) + '</b><span class="sp-size">' + esc(s.size) + '</span></div>' +
        '<div class="sp-job">' + esc(s.job) + '</div>' +
        '<div class="sp-bar" aria-hidden="true"><i style="width:' + (bar * 100).toFixed(1) + '%"></i></div>' +
        '<div class="sp-num">' + line + '</div></div>' +
        '<b class="sp-no" aria-hidden="true">' + roman(i + 1) + '</b></div>';
    }).join('');
    return el('<div class="ref"><h2>Shoes</h2><div class="shoe-plates">' + plates + '</div>' +
      '<div class="ref-note">' + esc(PLAN.pro4Budget) + '</div></div>');
  }

  function buildOdoSection() {
    const p4 = DB.pro4Status(getDone, todayISO());
    const fmt = (n) => (n === Math.round(n) ? n : n.toFixed(1));
    const rows = p4.outings.map((o) =>
      '<div class="ref-row tight"><span>Wk ' + o.wk + ' · ' + esc(o.label) +
      (o.optional ? ' (optional)' : '') + '</span>' +
      '<span class="v">' + (o.done ? '✓ ' : '') + o.km + ' km</span></div>').join('');
    /* An odometer should look like one (v4.80): a half dial from 0 to the
       cap, every planned outing already laid on it as its own segment in
       the race shoe's red — solid once run, outlined while to come, dashed
       if optional — and the needle at the kilometres actually spent. */
    const C = 160, CY = 134, R = 96, cap = p4.cap;
    const at = (km, r) => { const a = Math.PI + Math.min(1, km / cap) * Math.PI; return [C + r * Math.cos(a), CY + r * Math.sin(a)]; };
    const arcD = (k0, k1, r) => { const [ax, ay] = at(k0, r), [bx, by] = at(k1, r); return 'M' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + bx.toFixed(1) + ' ' + by.toFixed(1); };
    let segs = '', acc = 0;
    p4.outings.forEach((o) => {
      if (acc >= cap) return;
      const k0 = acc + 0.35, k1 = Math.min(cap, acc + o.km) - 0.35;
      segs += '<path class="od-seg' + (o.done ? ' done' : o.optional ? ' opt' : '') + '" d="' + arcD(k0, k1, R) + '"/>';
      acc += o.km;
    });
    let ticks = '';
    for (let k = 0; k <= cap; k += 10) {
      const [ax, ay] = at(k, R + 11), [bx, by] = at(k, R + 17), [tx, ty] = at(k, R + 29);
      ticks += '<path class="od-tick" d="M' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' L' + bx.toFixed(1) + ' ' + by.toFixed(1) + '"/>' +
        '<text class="od-num" x="' + tx.toFixed(1) + '" y="' + (ty + 3).toFixed(1) + '">' + k + '</text>';
    }
    const [nx, ny] = at(p4.used, R - 22);
    const gauge = '<figure class="odo-gauge" role="img" aria-label="' + fmt(p4.used) + ' km used, ' + fmt(p4.toCome) +
      ' to come, of about ' + cap + '"><svg viewBox="0 0 320 146" aria-hidden="true">' +
      '<path class="od-track" d="' + arcD(0, cap, R) + '"/>' + segs + ticks +
      '<path class="od-needle" d="M' + C + ' ' + CY + ' L' + nx.toFixed(1) + ' ' + ny.toFixed(1) + '"/><circle class="od-hub" cx="' + C + '" cy="' + CY + '" r="5"/>' +
      '<text class="od-read" x="' + C + '" y="' + (CY - 30) + '">' + fmt(p4.used) + '<tspan class="od-of"> / ' + cap + '</tspan></text>' +
      '<text class="od-cap" x="' + C + '" y="' + (CY - 14) + '">KM USED</text></svg></figure>';
    return el(
      '<div class="ref"><h2>Pro 4 odometer</h2>' + gauge + '<div class="ref-card">' + rows + '</div>' +
      '<div class="ref-note no-init">Used ' + fmt(p4.used) + ' km · to come ' + fmt(p4.toCome) +
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
      '</div><div class="ref-note no-init">Offline-first · plan lives in data/plan.js · ' +
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

  /* freshness: this phone holds the only copy of the ticks */
  function backupState() {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      if (STORE_KEY.test(localStorage.key(i))) count++;
    }
    const bAt = readJSONSafeString('backup-at');
    let note = 'Never backed up.', stale = count > 0;
    if (bAt) {
      const days = Math.max(0, Math.round(
        (DB.parseLocalDate(todayISO()) - DB.parseLocalDate(bAt)) / 86400000));
      note = days === 0 ? 'Backed up today.'
        : 'Last backup ' + days + ' day' + (days === 1 ? '' : 's') + ' ago.';
      stale = days > 21;
    }
    return { count, note, stale };
  }
  /* the backup as a JSON blob on the clipboard; resolves with the entry
     count, or rejects with the blob when the clipboard is refused */
  function copyBackup() {
    const entries = {};
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (STORE_KEY.test(k)) { entries[k] = localStorage.getItem(k); n++; }
    }
    const blob = JSON.stringify({ app: 'week-os', exportedAt: new Date().toISOString(), entries });
    try { localStorage.setItem('backup-at', todayISO()); } catch (e) { /* fine */ }
    if (!(navigator.clipboard && navigator.clipboard.writeText)) return Promise.reject(blob);
    return navigator.clipboard.writeText(blob).then(() => n, () => { throw blob; });
  }
  /* The Week is where the week gets reviewed, so an overdue backup gets one
     quiet line at its foot — only when there is enough to lose (v4.99). */
  function backupNudge() {
    const b = backupState();
    if (!b.stale || b.count < 10) return null;
    const row = el('<div class="bk-nudge" role="status"><p><b>' + esc(b.note) + '</b> This phone holds the only copy of ' + b.count +
      ' entries.</p><button data-io="nudge">Copy backup</button></div>');
    row.querySelector('button').addEventListener('click', () => {
      copyBackup().then((n) => {
        row.classList.add('done');
        row.innerHTML = '<p><b>Backup copied</b> — ' + n + ' entries. Paste it somewhere safe.</p>';
      }, () => {
        state.view = 'ref'; openDetails.add('ref-data'); render();
        const d = document.getElementById('ref-data');
        if (d) { d.scrollIntoView({ block: 'start' }); const x = d.querySelector('[data-io="export"]'); if (x) x.click(); }
      });
    });
    return row;
  }

  function restoreNudge() {
    if (backupState().count > 0 || todayISO() < DB.addDays(PLAN.blocks[0].start, 7)) return null;
    const row = el('<div class="bk-nudge restore" role="note"><p><b>No history on this device.</b> A Home Screen install keeps its own storage — restore a backup to bring your runs and ticks across.</p>' +
      '<button data-io="to-restore">Restore</button></div>');
    row.querySelector('button').addEventListener('click', () => {
      state.view = 'ref'; openDetails.add('ref-data'); render();
      const d = document.getElementById('ref-data');
      if (d) { d.scrollIntoView({ block: 'start' }); const r = d.querySelector('[data-io="restore"]'); if (r) r.click(); }
    });
    return row;
  }

  function buildDataSection() {
    const { count, note: bNote, stale } = backupState();
    const wrap = el(
      '<div class="ref"><h2>Data</h2><div class="ref-card data-card">' +
      '<div class="ref-note">' + count + ' entr' + (count === 1 ? 'y' : 'ies') +
      ' stored on this phone (ticks, skips, gym weights, run log, HR zones, tune-up time). Backups are a JSON blob — paste one into Notes now and again.</div>' +
      '<div class="ref-note backup-note' + (stale ? ' stale' : '') + '">' + bNote +
      (stale ? ' This phone holds the only copy.' : '') + '</div>' +
      '<div class="data-actions">' +
      '<button data-io="export"' + (stale ? ' class="go"' : '') + '>Copy backup</button>' +
      '<button data-io="restore">Restore…</button></div>' +
      '<textarea class="data-box hidden" rows="4" aria-label="Backup JSON" ' +
      'placeholder="Paste a backup here, then tap Restore again"></textarea>' +
      '<div class="data-msg" role="status"></div></div></div>'
    );
    const box = wrap.querySelector('.data-box');
    const msg = wrap.querySelector('.data-msg');

    wrap.querySelector('[data-io="export"]').addEventListener('click', () => {
      copyBackup().then((n) => { msg.textContent = 'Backup copied — ' + n + ' entries. Paste it somewhere safe.'; }, (blob) => {
        box.classList.remove('hidden');
        box.value = blob;
        box.select();
        msg.textContent = 'Clipboard blocked — copy the text above by hand.';
      });
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
      /* Paging through days or weeks slides in the direction of travel, so
         the gesture and the screen agree; any other arrival just fades. */
      const [lastView, lastDate] = lastViewKey.split('|');
      const [, date] = viewKey.split('|');
      const dir = lastView === state.view && lastDate && date ? (date > lastDate ? 'slide-next' : 'slide-prev') : '';
      lastViewKey = viewKey;
      const v = document.getElementById('view');
      v.classList.remove('anim', 'slide-next', 'slide-prev');
      void v.offsetWidth;                          // restart the animation
      v.classList.add('anim');
      if (dir) v.classList.add(dir);
    } else {
      /* a tick or a minute's re-render is not an arrival: nothing replays */
      document.getElementById('view').classList.remove('anim', 'slide-next', 'slide-prev');
    }
    revealArt();
  }
  /* The art below the fold (the clock, the wall, the key days) starts its
     arrival when it scrolls into view, not while it is still off screen. */
  let artObserver = null;
  function revealArt() {
    const nodes = document.querySelectorAll('#view .daywheel, #view .wall, #view .journey-landmarks, #view .weeklight');
    if (!('IntersectionObserver' in window)) { nodes.forEach((n) => n.classList.add('in')); return; }
    if (!artObserver) artObserver = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); artObserver.unobserve(e.target); }
    }), { threshold: 0.25 });
    nodes.forEach((n) => artObserver.observe(n));
  }

  /* ---- navigation ---- */
  /* The sheet's open state has to be announced, not just drawn: aria-haspopup
     says a menu exists, only aria-expanded says whether it is currently open. */
  /* The More sheet as two illustrated plates (v4.79): the journey as a
     small night sky with the block's real totals and its red sunrise, and
     Reference as an illuminated initial over its chapters. */
  function dressSheet() {
    const plan = document.querySelector('.sheet-item[data-nav="plan"]'), ref = document.querySelector('.sheet-item[data-nav="ref"]');
    if (!plan || !ref) return;
    const j = DB.trainingJourney(getDone, getRunLogEntry, todayISO());
    let sky = '';
    for (let k = 0; k < 30; k++) {
      const x = 4 + artSeed('sheet:' + k) * 84, y = 4 + artSeed('sheet:' + k + 'y') * 34;
      sky += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (0.4 + artSeed('sheet:' + k + 'r') * 0.9).toFixed(2) + '"/>';
    }
    plan.innerHTML = '<svg class="sp-art" viewBox="0 0 96 52" aria-hidden="true"><g class="sp-stars">' + sky + '</g>' +
      '<circle class="sp-sunglow" cx="84" cy="46" r="20"/><circle class="sp-sun" cx="84" cy="46" r="7"/><path class="sp-hz" d="M0 46 L96 46"/></svg>' +
      '<span class="sp-t"><b>Your training journey</b><small>' + (Math.round(j.recorded * 10) / 10) + ' km · ' + j.runs + ' runs recorded</small></span>';
    ref.innerHTML = '<span class="sp-init" aria-hidden="true">R</span>' +
      '<span class="sp-t"><b>Reference</b><small>Paces · zones · shoes · fuelling · rules</small></span>';
  }
  let sheetTimer = null;
  function setSheet(open) {
    if (open) dressSheet();
    const bd = document.getElementById('sheet-backdrop');
    clearTimeout(sheetTimer);
    bd.classList.remove('closing');
    /* closing plays the sheet back down first, when motion is welcome */
    if (!open && !bd.classList.contains('hidden') && motionOK()) {
      bd.classList.add('closing');
      sheetTimer = setTimeout(() => { bd.classList.add('hidden'); bd.classList.remove('closing'); }, 200);
    } else bd.classList.toggle('hidden', !open);
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
    const key = iso + '|' + (cur ? cur.id : '-') + '|' + (nxt ? nxt.id : '-') + late + skyKey(iso, n);
    if (key !== nowKey) { render(); return; }
    /* same block — just move the needle */
    const bar = document.querySelector('.nn-bar i');
    if (bar && cur) {
      bar.style.width = Math.round(((n - cur.startMin) / (cur.endMin - cur.startMin)) * 100) + '%';
    }
    const left = document.querySelector('.nn-left');
    if (left && cur) left.textContent = fmtLeft(cur.endMin - n);
    const soon = document.querySelector('.nn-in');
    if (soon && nxt) soon.textContent = fmtIn(nxt.startMin - n);
    const clock = document.querySelector('.live-clock');
    if (clock) clock.textContent = DB.fmtHM(n);
    const hg = document.querySelector('.dw-handg');
    if (hg) hg.style.transform = 'rotate(' + handAngle(n).toFixed(2) + 'deg)';
    refreshRunSky(n);
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
  /* No zoom, ever (v4.92.1, the owner's call: "I should never have the need
     to zoom and I am constantly accidentally doing it"). Beyond the viewport
     and touch-action: a second quick tap on anything that is not a control
     is swallowed, because iOS reads that as double-tap zoom; controls keep
     every tap (touch-action: manipulation covers them). And if the page is
     ever scaled regardless, the viewport is re-applied to snap it back. */
  let lastTapEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = e.timeStamp;
    const onControl = e.target.closest && e.target.closest('button, a, input, select, textarea, label, summary, [role="button"], [data-nav]');
    if (!onControl && now - lastTapEnd < 320 && e.cancelable) e.preventDefault();
    lastTapEnd = now;
  }, { passive: false });
  const vpMeta = document.querySelector('meta[name="viewport"]');
  if (window.visualViewport && vpMeta) {
    const vpBase = vpMeta.getAttribute('content');
    window.visualViewport.addEventListener('resize', () => {
      if (window.visualViewport.scale <= 1.01) return;
      vpMeta.setAttribute('content', vpBase.replace('initial-scale=1', 'initial-scale=1.0001'));
      requestAnimationFrame(() => vpMeta.setAttribute('content', vpBase));
    });
  }
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

  /* ---- cinema cards: one stage for the launch title and earned moments ----
     Black, red ribbons, a line of type. Never takes a tap (pointer-events:
     none), removes itself on animationend with a fallback timer, and is
     aria-hidden because the same facts are on the page underneath. */
  const motionOK = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches);
  function cinemaCard(kicker, markHTML, line, extra, latin, sky) {
    const card = el('<div class="titlecard' + (extra ? ' ' + extra : '') + '" aria-hidden="true"><div class="tc-ribbons">' + '<i></i>'.repeat(9) +
      '</div><div class="tc-gloria"></div>' + (sky || '') + (kicker ? '<div class="tc-kicker">' + esc(kicker) + '</div>' : '') +
      '<div class="tc-mark">' + markHTML + '</div><div class="tc-line">' + esc(line) + '</div>' +
      (latin ? '<div class="tc-latin">❦ ' + esc(latin[0]) + ' ❦<small>' + esc(latin[1]) + '</small></div>' : '') + '</div>');
    document.body.appendChild(card);
    const bye = () => card.remove();
    card.addEventListener('animationend', (e) => { if (e.target === card) bye(); });
    setTimeout(bye, 3400);   // in case the animation never runs
  }

  /* ---- title card: every launch of the installed app ----
     A second of cinema each time the Home Screen app loads (the user's
     call, v4.69.1 — it had been once a day): the wordmark, the week, the
     days to the gun. Taps pass straight through to Today underneath, which
     is already drawn; skipped in a browser tab and under reduced motion. */
  function titleCard() {
    const standalone = navigator.standalone === true ||
      !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (!standalone || !motionOK()) return;
    const today = todayISO();
    const day = DB.buildDay(today), cd = DB.raceCountdown(today);
    const line = day.blockId === 'marathon'
      ? 'WEEK ' + roman(day.week) + ' · ' + (cd.days === 0 ? 'RACE DAY' : cd.days + (cd.days === 1 ? ' DAY' : ' DAYS') + ' TO THE GUN')
      : day.blockId === 'recovery' ? 'RECOVERY · WEEK ' + roman(day.week) : 'STANDING WEEK';
    /* tonight's moon, at its real phase, rises over the wordmark */
    const moon = '<svg class="tc-moon" viewBox="0 0 40 40">' + moonSVG(20, 20, 12, DB.moonPhase(today), 'tc-moong') + '</svg>';
    cinemaCard('', 'WEEK<b>OS</b>', line, '', null, moon);
  }

  /* ---- earned moments (v4.71) ----
     When a newly saved run sets something — the marathon, a race, the
     longest run, a best at a distance, a 100 km milestone — the stage says
     so, once, at the moment of saving. The recap underneath carries the
     same facts for anyone who skips motion. */
  function celebrate(iso, day) {
    if (!motionOK()) return;
    const r = day.run;
    const report = window.RunProgress.debrief(runLogHistory(), iso, todayISO());
    const e = report && report.current;
    const km = (n) => esc(loggedDistance(n)) + '<small>KM</small>';
    if (r && DB.runClass(r) === 'race' && /MARATHON/.test(r.title)) {
      return cinemaCard('MARATHONER', e ? esc(recordTime(e.sec)) : km(r.run.km),
        (e ? loggedDistance(e.km) + ' km · ' + DB.paceOf(e.km, e.sec) + '/km · ' : '') + String(PLAN.race.city).split(',')[0], 'earned race', (PLAN.hours && PLAN.hours.earned || {}).marathon);
    }
    if (!e) return;
    if (r && DB.runClass(r) === 'race') {
      return cinemaCard('RACED · ' + String(r.title).split(/\s+[—-]\s+|\s+all-out/)[0], esc(recordTime(e.sec)),
        loggedDistance(e.km) + ' km · ' + DB.paceOf(e.km, e.sec) + '/km', 'earned', (PLAN.hours && PLAN.hours.earned || {}).race);
    }
    if (report.longest) {
      return cinemaCard('NEW LONGEST RUN', km(e.km),
        '+' + loggedDistance(Number(report.longest.gainKm.toPrecision(3))) + ' km beyond your previous longest', 'earned', (PLAN.hours && PLAN.hours.earned || {}).longest);
    }
    if (report.best) {
      return cinemaCard('NEW BEST · ' + loggedDistance(e.km) + ' KM', esc(recordTime(e.sec)),
        recordTime(report.best.gainSec) + ' quicker than your previous best', 'earned', (PLAN.hours && PLAN.hours.earned || {}).best);
    }
    if (report.milestone) {
      return cinemaCard(report.milestone + ' KM LOGGED', esc(String(report.milestone)) + '<small>KM</small>',
        'across ' + report.runCount + ' saved runs', 'earned', (PLAN.hours && PLAN.hours.earned || {}).milestone);
    }
  }

  render();
  titleCard();
})();
