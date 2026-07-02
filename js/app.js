/* ==========================================================================
   Week OS — js/app.js
   Rendering + interaction only. All routine content comes from PLAN via
   DayBuilder; this file contains zero plan content.
   ========================================================================== */
(function () {
  'use strict';

  const APP_VERSION = '1.0.0';
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

  /* ---- state ---- */
  const state = {
    view: 'today',
    dateISO: todayISO(),
    weekAnchor: null,          // Monday ISO shown in week view
    expanded: null,            // block id with actions open
  };

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
    list.push({ id: 'mv-' + iso + '-' + block.id, srcId: block.id, fromIso: iso, title: block.title, detail: block.detail, cat: block.cat });
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
  function fmtShort(iso) {
    const d = DB.parseLocalDate(iso);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  /* ================= header ================= */
  function renderHeader() {
    const iso = todayISO();
    const day = DB.buildDay(iso);
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
    const weekBit = day.blockId === 'marathon' ? 'WK ' + day.week + ' · DAY ' + (day.dayIndex + 1) + '/7'
      : day.blockId === 'recovery' ? 'RECOVERY · WK ' + day.week : 'STANDING WEEK';
    view.appendChild(el(
      '<div class="day-head"><h1>' + esc(fmtDate(iso)) + '</h1>' +
      '<div class="sub"><span>' + weekBit + '</span>' + chips.join('') +
      (day.label ? '<span>' + esc(day.label) + '</span>' : '') + '</div></div>'
    ));

    /* -- now / next (real today only) -- */
    if (isToday) view.appendChild(buildNowNext(day));

    /* -- run hero -- */
    if (day.run) {
      view.appendChild(buildHero(day, done, iso));
    } else {
      const restBlock = day.blocks.find((b) => /no run|rest/i.test(b.title));
      view.appendChild(el(
        '<div class="resthero"><b>No run today</b>' +
        esc(restBlock ? restBlock.title + (restBlock.detail ? ' — ' + restBlock.detail : '') : 'Recovery is training too.') +
        '</div>'
      ));
    }

    /* -- timeline -- */
    const tl = el('<div class="tl"></div>');
    const nMin = nowMin();
    let nowPlaced = !isToday;

    movedIn.forEach((m) => {
      const card = buildCard({
        id: m.id, title: m.title, detail: m.detail, cat: m.cat,
        start: '·', end: '', doable: true,
      }, done, iso, { moved: m });
      tl.appendChild(card);
    });

    for (const b of day.blocks) {
      if (!nowPlaced && nMin < b.startMin) {
        tl.appendChild(el('<div class="tl-now">NOW ' + DB.fmtHM(nMin) + '</div>'));
        nowPlaced = true;
      }
      const isCurrent = isToday && nMin >= b.startMin && nMin < b.endMin;
      if (isCurrent) nowPlaced = true;

      if (b.quiet && !b.doable) {
        const q = el(
          '<div class="tl-quiet' + (isCurrent ? ' current' : '') + '">' +
          '<span class="t">' + b.start + '–' + b.end + '</span>' +
          '<span>' + esc(b.title) + (b.detail ? ' <span class="d">· ' + esc(b.detail) + '</span>' : '') + '</span></div>'
        );
        tl.appendChild(q);
      } else {
        tl.appendChild(buildCard(b, done, iso, { current: isCurrent, skipped: !!ovr.skip[b.id], moved: null, movedOut: !!ovr.moved[b.id] }));
      }
    }
    if (!nowPlaced) tl.appendChild(el('<div class="tl-now">NOW ' + DB.fmtHM(nMin) + '</div>'));
    view.appendChild(tl);
  }

  function buildNowNext(day) {
    const nMin = nowMin();
    const cur = day.blocks.find((b) => nMin >= b.startMin && nMin < b.endMin);
    const next = day.blocks.filter((b) => b.startMin > nMin).slice(0, 2);
    let html = '<div class="nownext">';
    if (cur) {
      const pct = Math.round(((nMin - cur.startMin) / (cur.endMin - cur.startMin)) * 100);
      html += '<div class="nn-tag">NOW</div><div class="nn-title">' + esc(cur.title) + '</div>' +
        '<div class="nn-time">' + cur.start + '–' + cur.end + (cur.detail ? ' · ' + esc(cur.detail) : '') + '</div>' +
        '<div class="nn-bar"><i style="width:' + pct + '%"></i></div>';
    } else {
      html += '<div class="nn-tag">NOW</div><div class="nn-title">Off the clock</div>' +
        '<div class="nn-bar"><i style="width:0%"></i></div>';
    }
    if (next.length) {
      html += next.map((b) => '<div class="nn-next"><span class="t">' + b.start + '</span><span>' + esc(b.title) + '</span></div>').join('');
    } else {
      html += '<div class="nn-next"><span class="t">—</span><span>Nothing left today. Lights out 22:30.</span></div>';
    }
    return el(html + '</div>');
  }

  function buildHero(day, done, iso) {
    const r = day.run;
    const isRace = /marathon/i.test(r.title) || (day.row && day.row.race && day.dayIndex === 6);
    const km = r.run.km;
    const kmTxt = km === Math.round(km) ? String(km) : km.toFixed(1);
    const isDone = !!done[r.id];
    const hero = el(
      '<section class="hero' + (isRace ? ' race' : '') + (isDone ? ' done' : '') + '">' +
      '<div class="h-tag">' + (isRace ? 'RACE DAY' : 'The run') + ' · ' + r.start + '</div>' +
      '<div class="h-row"><div class="h-km">' + kmTxt + '<small>km</small></div>' +
      '<div class="h-session">' + esc(r.title) + '</div></div>' +
      '<div class="h-meta"><span><b>SHOE</b>' + esc(r.run.shoe) + '</span><span><b>TIME</b>' + r.start + '–' + r.end + '</span></div>' +
      '<div class="h-detail">' + esc(r.detail) + '</div>' +
      '<button class="h-tick' + (isDone ? ' on' : '') + '" aria-label="Mark run done">✓</button></section>'
    );
    hero.querySelector('.h-tick').addEventListener('click', () => { toggleDone(iso, r.id); render(); });
    return hero;
  }

  function buildCard(b, done, iso, opts) {
    opts = opts || {};
    const isDone = !!done[b.id];
    const cat = CAT_VAR[b.cat] || CAT_VAR.routine;
    if (opts.movedOut) return attachUndoMove(iso, b);
    const expanded = state.expanded === b.id;
    const card = el(
      '<div class="tl-card' + (isDone ? ' done' : '') + (opts.skipped ? ' skipped' : '') + (opts.current ? ' current' : '') + '" style="--cat:' + cat + '">' +
      '<div class="c-main">' +
      '<div class="c-time">' + b.start + (b.end && b.end !== b.start ? '–' + b.end : '') +
      (opts.current ? ' <span class="tl-now" style="display:inline">· NOW</span>' : '') + '</div>' +
      '<div class="c-title">' + esc(b.title) + '</div>' +
      (b.detail ? '<div class="c-detail">' + esc(b.detail) + '</div>' : '') +
      '<div class="c-cat">' + esc(b.cat) + (opts.skipped ? ' · skipped' : '') +
      (opts.moved ? ' · moved from ' + esc(fmtShort(opts.moved.fromIso)) : '') + '</div>' +
      (expanded ? '<div class="c-actions">' +
        (opts.skipped ? '<button data-act="unskip">Unskip</button>' : '<button data-act="skip">Skip</button>') +
        (opts.moved ? '<button data-act="return">Return to ' + esc(fmtShort(opts.moved.fromIso)) + '</button>'
                    : '<button data-act="move">Move to tomorrow</button>') +
        '</div>' : '') +
      '</div>' +
      '<div class="c-side">' +
      '<button class="tick' + (isDone ? ' on' : '') + '" aria-label="Mark done">✓</button>' +
      '<button class="more-btn" aria-label="Actions">⋯</button>' +
      '</div></div>'
    );
    card.querySelector('.tick').addEventListener('click', () => { toggleDone(iso, b.id); render(); });
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
      state.expanded = null;
      render();
    }));
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

  /* ================= week view ================= */
  function renderWeek() {
    const anchor = state.weekAnchor || mondayOf(todayISO());
    state.weekAnchor = anchor;
    const day0 = DB.buildDay(anchor);
    const view = document.getElementById('view');
    view.innerHTML = '';

    let title, sub = '', note = '';
    if (day0.blockId === 'marathon') {
      title = 'Week ' + day0.week;
      const chips = ['<span class="chip ' + esc(day0.phase) + '">' + esc(day0.phase) + '</span>'];
      if (day0.row.cutback) chips.push('<span class="chip mut">cutback</span>');
      if (day0.row.key) chips.push('<span class="chip hot">key</span>');
      sub = fmtShort(anchor) + ' – ' + fmtShort(DB.addDays(anchor, 6)) +
        ' · <b>' + day0.row.km + ' km</b> · LR ' + day0.row.lr + ' ' + chips.join('');
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

    const days = el('<div class="wk-days"></div>');
    const real = todayISO();
    for (let i = 0; i < 7; i++) {
      const iso = DB.addDays(anchor, i);
      const day = DB.buildDay(iso);
      const done = getDone(iso);
      const doables = day.blocks.filter((b) => b.doable);
      const doneCount = doables.filter((b) => done[b.id]).length;
      const d = DB.parseLocalDate(iso);

      let runHtml;
      if (day.run) {
        const km = day.run.run.km;
        runHtml = '<div class="d-run">' + esc(day.run.title) + '</div>' +
          '<div class="d-extras">' + esc(day.run.run.shoe) + extraBits(day) + '</div>';
        runHtml = { run: runHtml, km: (km === Math.round(km) ? km : km.toFixed(1)) + '<small>km</small>' };
      } else {
        runHtml = {
          run: '<div class="d-run rest">No run</div><div class="d-extras">' + (extraBits(day).replace(/^ · /, '') || 'recovery') + '</div>',
          km: '—',
        };
      }

      const row = el(
        '<button class="wk-day' + (iso === real ? ' today' : iso < real ? ' past' : '') + '">' +
        '<span class="d-date"><b>' + DAY_SHORT[i] + '</b><span>' + d.getDate() + '</span></span>' +
        '<span class="d-main">' + runHtml.run + '</span>' +
        '<span style="text-align:right"><span class="d-km">' + runHtml.km + '</span>' +
        '<span class="d-done' + (doables.length && doneCount === doables.length ? ' all' : '') + '">' +
        (iso <= real && doables.length ? '<br>' + doneCount + '/' + doables.length : '') + '</span></span>' +
        '</button>'
      );
      row.addEventListener('click', () => { state.view = 'today'; state.dateISO = iso; window.scrollTo(0, 0); render(); });
      days.appendChild(row);
    }
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

    const rows = el('<div class="plan-rows"></div>');
    const PHASE = { base: 'var(--phase-base)', build: 'var(--phase-build)', taper: 'var(--phase-taper)' };
    for (const row of block.weekTable) {
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
      const r = el(
        '<button class="plan-row' + (isNow ? ' now' : isPast ? ' past' : '') + '">' +
        '<span class="p-wk">' + row.wk + '</span>' +
        '<span class="p-bar" style="background:' + PHASE[row.phase] + '"></span>' +
        '<span class="p-main"><span class="p-dates">' + fmtShort(dates.start) + '–' + fmtShort(dates.end) + '</span>' +
        '<span class="p-sess">' + sess + '</span>' +
        (flags ? '<span class="p-flags">' + flags + '</span>' : '') +
        (row.notes && !row.race ? '<span class="p-dates">' + esc(row.notes) + '</span>' : '') + '</span>' +
        '<span class="p-km"><b>' + row.km + '</b>km<small>LR ' + row.lr + '</small></span>' +
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
    view.appendChild(rows);
    view.appendChild(el('<div class="ref-note">Then: <b>Recovery &amp; return</b> — 2 weeks, a reverse taper of celebration. After that the standing week takes over until the next block is written.</div>'));
  }

  /* ================= reference view ================= */
  function renderRef() {
    const view = document.getElementById('view');
    view.innerHTML = '';
    const refRow = (k, v) => '<div class="ref-row"><span>' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';
    view.appendChild(el(
      '<div class="ref">' +
      '<h1>Reference</h1>' +
      '<h2>Race</h2><div class="ref-card">' +
      refRow('Date', fmtDate(PLAN.race.date)) + refRow('Gun', '~' + PLAN.race.gun) +
      refRow('Goal', PLAN.race.goal + ' · ' + PLAN.race.goalPace) +
      refRow('Stretch bet', PLAN.race.stretch + ' · ' + PLAN.race.stretchPace) + '</div>' +
      '<h2>Paces</h2><div class="ref-card">' +
      PLAN.paces.map((p) => refRow(p.type, p.pace)).join('') + '</div>' +
      '<div class="ref-note">' + esc(PLAN.recalibration) + '</div>' +
      '<h2>Shoes</h2><div class="ref-card">' +
      PLAN.shoes.map((s) => refRow(s.shoe + ' · ' + s.size, s.job)).join('') + '</div>' +
      '<div class="ref-note">' + esc(PLAN.pro4Budget) + '</div>' +
      '<h2>Rules of the block</h2><ol class="ref-list">' +
      PLAN.rules.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ol>' +
      '<h2>Weekly load budget</h2><div class="ref-note">' + esc(PLAN.loadBudget) + '</div>' +
      '<h2>Open questions</h2><ul class="ref-list qs">' +
      PLAN.openQuestions.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>' +
      '<h2>App</h2><div class="ref-note">Week OS v' + APP_VERSION + ' · offline-first · plan lives in data/plan.js</div>' +
      '</div>'
    ));
  }

  /* ================= router ================= */
  function render() {
    renderHeader();
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-nav') === state.view ||
        (t.getAttribute('data-nav') === 'more' && (state.view === 'plan' || state.view === 'ref')));
    });
    if (state.view === 'today') renderToday();
    else if (state.view === 'week') renderWeek();
    else if (state.view === 'plan') renderPlan();
    else renderRef();
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

  /* ---- minute tick: NOW indicator + date rollover ---- */
  let lastISO = todayISO();
  setInterval(() => {
    const iso = todayISO();
    if (iso !== lastISO) {           // midnight rollover
      if (state.dateISO === lastISO) state.dateISO = iso;
      lastISO = iso;
    }
    if (state.view === 'today' || state.view === 'week') render();
    else renderHeader();
  }, 60000);

  /* ---- service worker + update toast ---- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const offer = (worker) => {
        document.getElementById('toast').classList.remove('hidden');
        document.getElementById('toast-reload').onclick = () => {
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
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  render();
})();
